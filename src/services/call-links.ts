// Link da chamada de vídeo (sem chat): /c/<slug>. O visitante (quem já comprou) vê a chamada tocando, atende e cai direto
// no vídeo — com os upsells marcados no editor, pagos ali mesmo (PIX).
import type { NextApiRequest } from "next";
import type { Prisma, Video } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/api";
import { signVipToken, verifyVipToken } from "@/lib/auth";
import { currencyOfLocale } from "@/lib/format";
import { trackEvent } from "./tracking";
import { createVisitorLead, type VisitorInput } from "./visitor-lead";
import { callVideoProducts } from "./call-video";
import { chargeProduct, publicPayment, syncPaymentWithProvider } from "./payments/service";
import { VIP_LOCALES, vipLocale, type VipLocale } from "./vip";
import type { ZenithPayerInput } from "./payments/zenith-checkout";

export interface CallLinkSettings {
  published: boolean;
  /** personagem: nome e foto da tela da chamada (os campos abaixo, se preenchidos, valem por cima) */
  characterId: string | null;
  name: string | null;
  avatarUrl: string | null;
  /** país: idioma da tela e moeda dos upsells (pt-BR = reais/PIX) */
  locale: VipLocale;
  /** de onde o vídeo começa ao atender: do início ou do trecho VIP */
  startAt: "start" | "vip";
}

const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const isMedia = (v: string) => /^https:\/\//i.test(v) || (v.startsWith("/") && !v.startsWith("//"));

export function callLinkSettings(raw: unknown): CallLinkSettings {
  const s = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const avatar = str(s.avatarUrl, 2000);
  return {
    published: s.published === true,
    characterId: str(s.characterId, 64),
    name: str(s.name, 80),
    avatarUrl: avatar && isMedia(avatar) ? avatar : null,
    locale: vipLocale(s.locale),
    startAt: s.startAt === "vip" ? "vip" : "start",
  };
}

/** o que o painel salva junto com o vídeo */
export const callLinkSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .max(60)
    .refine((v) => !v || /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v), "Use só letras minúsculas, números e hífen no link da chamada")
    .refine((v) => !v || v.length >= 2, "Link da chamada muito curto")
    .nullable()
    .optional(),
  published: z.boolean().default(false),
  characterId: z.string().trim().max(64).nullable().optional(),
  name: z.string().trim().max(80).nullable().optional(),
  avatarUrl: z
    .string()
    .trim()
    .max(2000)
    .refine((v) => !v || isMedia(v), "Foto inválida (use https:// ou envie o arquivo)")
    .nullable()
    .optional(),
  locale: z.enum(VIP_LOCALES).default("pt-BR"),
  startAt: z.enum(["start", "vip"]).default("start"),
});
export type CallLinkInput = z.infer<typeof callLinkSchema>;

export function callLinkData(d: CallLinkInput) {
  return {
    callSlug: d.slug || null,
    callSettings: callLinkSettings({ ...d, published: d.published && !!d.slug }) as unknown as Prisma.InputJsonValue,
  };
}

/** pagamentos do link ficam marcados com este "nó" (a tela da chamada separa os pagamentos por ele) */
export const callNodeId = (videoId: string) => `call:${videoId}`;

export async function findCallLink(slug: string, allowDraft = false) {
  const video = /^[a-z0-9-]{2,60}$/.test(slug) ? await prisma.video.findUnique({ where: { callSlug: slug } }) : null;
  const settings = video ? callLinkSettings(video.callSettings) : null;
  if (!video || !settings || (!settings.published && !allowDraft)) throw new HttpError(404, "Chamada não encontrada");
  return { video, settings };
}

/** nome e foto da tela da chamada */
export async function callLinkCharacter(settings: CallLinkSettings) {
  const c = settings.characterId ? await prisma.character.findUnique({ where: { id: settings.characterId } }) : null;
  return {
    name: settings.name || c?.name || "Chamada de vídeo",
    avatarUrl: settings.avatarUrl || c?.avatarUrl || null,
    description: null,
    status: "",
    showOnline: false,
  };
}

/**
 * Sessão do visitante: o mesmo token assinado do Grupo VIP, com o "grupo" = call:<id do vídeo>
 * (não vale em grupo nenhum, e o token de um grupo não vale aqui).
 */
export async function callLinkSession(req: NextApiRequest, video: Video, input: VisitorInput & { token?: string | null }) {
  const scope = callNodeId(video.id);
  const s = await verifyVipToken(input.token);
  if (s && s.groupId === scope && (await prisma.lead.findUnique({ where: { id: s.leadId }, select: { id: true } }))) {
    return { token: input.token!, leadId: s.leadId };
  }
  const leadId = await createVisitorLead(req, input, { _chamada: video.callSlug ?? video.id }, { callLink: video.id });
  return { token: await signVipToken({ leadId, groupId: scope }), leadId };
}

export async function requireCallLinkSession(token: unknown, video: Video) {
  const s = await verifyVipToken(token);
  if (!s || s.groupId !== callNodeId(video.id)) throw new HttpError(401, "Sessão expirada. Recarregue a página.");
  return s;
}

/** pagamentos recentes do visitante neste link (pendente: confere no gateway) */
export async function callLinkPayments(video: Video, leadId: string) {
  const recent = await prisma.payment.findMany({
    where: { leadId, offerNodeId: callNodeId(video.id), createdAt: { gte: new Date(Date.now() - 6 * 60 * 60_000) } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  const synced = await Promise.all(recent.map((p) => (p.status === "PENDING" || p.status === "CREATED" ? syncPaymentWithProvider(p) : p)));
  return synced.map(publicPayment);
}

/** gera o pagamento de um upsell do vídeo */
export async function callLinkCheckout(video: Video, settings: CallLinkSettings, leadId: string, productId: string, payer?: ZenithPayerInput) {
  const product = (await callVideoProducts(video, currencyOfLocale(settings.locale))).get(productId);
  if (!product) throw new HttpError(400, settings.locale === "pt-BR" ? "Produto indisponível" : "Producto no disponible");
  await trackEvent({ leadId, type: "checkout_started", data: { callLink: video.id, productId } });
  const payment = await chargeProduct({ leadId, conversationId: null, funnelId: null }, product, {
    method: "PIX",
    payer,
    offerNodeId: callNodeId(video.id),
    returnPath: `/c/${video.callSlug}`,
  });
  return publicPayment(payment);
}
