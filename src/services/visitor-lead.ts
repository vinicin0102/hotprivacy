// Visitante que chega direto numa página pública (Grupo VIP, link da chamada): vira um lead com a origem (UTM, aparelho, país).
import type { NextApiRequest } from "next";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/api";
import { parseUserAgent } from "@/lib/device";
import { sanitizeUrl } from "@/lib/sanitize";
import { trackEvent } from "./tracking";

export interface VisitorInput {
  utm?: Record<string, unknown>;
  referrer?: string | null;
  landingPage?: string | null;
}

const tu = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 500) : null);

/** cria o lead e registra a visita (page_view com os dados da página) */
export async function createVisitorLead(
  req: NextApiRequest,
  input: VisitorInput,
  variables: Prisma.InputJsonObject,
  eventData: Prisma.InputJsonObject,
): Promise<string> {
  const ua = parseUserAgent(req.headers["user-agent"]);
  const country = (req.headers["x-vercel-ip-country"] as string) || (req.headers["cf-ipcountry"] as string) || null;
  const utm = input.utm ?? {};
  const lead = await prisma.lead.create({
    data: {
      utmSource: tu(utm.utm_source),
      utmMedium: tu(utm.utm_medium),
      utmCampaign: tu(utm.utm_campaign),
      utmContent: tu(utm.utm_content),
      utmTerm: tu(utm.utm_term),
      referrer: sanitizeUrl(input.referrer) || null,
      landingPage: sanitizeUrl(input.landingPage) || null,
      device: ua.device,
      browser: ua.browser,
      os: ua.os,
      country: country ? country.slice(0, 8) : null,
      clientIp: getClientIp(req).slice(0, 64),
      userAgent: String(req.headers["user-agent"] ?? "").slice(0, 400) || null,
      variables,
    },
  });
  await trackEvent({ leadId: lead.id, type: "page_view", data: eventData });
  return lead.id;
}
