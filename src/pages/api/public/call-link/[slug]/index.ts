// Link da chamada (sem chat): abre/retoma a sessão do visitante e devolve o vídeo (com os upsells) e os pagamentos dele.
import { z } from "zod";
import { apiHandler, leadRateLimit } from "@/lib/api";
import { currencyOfLocale } from "@/lib/format";
import { callVideoPayload } from "@/services/call-video";
import { callLinkPayments, callLinkSession, callNodeId, findCallLink } from "@/services/call-links";
import { adminPreview } from "@/services/vip";

const utmValue = z.string().max(5000).transform((v) => v.slice(0, 500)).optional().catch(undefined);
const schema = z.object({
  token: z.string().max(2000).optional().nullable(),
  /** false: só os pagamentos (consulta enquanto um PIX está pendente) */
  withVideo: z.boolean().default(true),
  utm: z.object({ utm_source: utmValue, utm_medium: utmValue, utm_campaign: utmValue, utm_content: utmValue, utm_term: utmValue }).partial().default({}),
  referrer: z.string().max(1000).optional().nullable(),
  landingPage: z.string().max(1000).optional().nullable(),
});

export default apiHandler({
  POST: async (req) => {
    leadRateLimit(req, "call-link", 60, 60_000);
    const body = schema.parse(req.body);
    const { video, settings } = await findCallLink(String(req.query.slug), await adminPreview(req));
    const s = await callLinkSession(req, video, body);
    return {
      token: s.token,
      nodeId: callNodeId(video.id),
      ...(body.withVideo ? { video: await callVideoPayload(video, s.leadId, currencyOfLocale(settings.locale)) } : {}),
      payments: await callLinkPayments(video, s.leadId),
    };
  },
});
