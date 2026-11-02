// Link da chamada: gera o pagamento de um upsell do vídeo (PIX; pesos: gateway próprio).
import { z } from "zod";
import { apiHandler, leadRateLimit } from "@/lib/api";
import { payerSchema } from "@/lib/validation";
import { callLinkCheckout, findCallLink, requireCallLinkSession } from "@/services/call-links";
import { adminPreview } from "@/services/vip";

const schema = z.object({ token: z.string().min(10).max(2000), productId: z.string().min(1).max(64), payer: payerSchema.optional() });

export default apiHandler({
  POST: async (req) => {
    leadRateLimit(req, "call-link-checkout", 15, 60_000);
    const body = schema.parse(req.body);
    const { video, settings } = await findCallLink(String(req.query.slug), await adminPreview(req));
    const session = await requireCallLinkSession(body.token, video);
    return { payment: await callLinkCheckout(video, settings, session.leadId, body.productId, body.payer) };
  },
});
