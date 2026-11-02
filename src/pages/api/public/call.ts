// Chamada de vídeo: devolve o vídeo e a linha do tempo (FREE/VIP/falas/upsells) quando o lead atende.
import { z } from "zod";
import { apiHandler, HttpError, leadRateLimit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireLeadSession } from "@/services/conversation";
import { entitledNodes, getFunnelSettings } from "@/services/funnels";
import { currencyOfLocale } from "@/lib/format";
import type { AiContent, OfferContent } from "@/types/flow";
import { brainOffers, brainVoiceCalls, voiceCallProductId } from "@/services/ai/brain";
import { callVideoPayload } from "@/services/call-video";

const schema = z.object({
  token: z.string().min(10).max(2000),
  nodeId: z.string().regex(/^[a-zA-Z0-9_:-]{1,64}$/),
  /** bloco Cérebro: produto da oferta em chamada */
  productId: z.string().max(64).optional(),
});

export default apiHandler({
  POST: async (req) => {
    leadRateLimit(req, "call", 30, 60_000);
    const { token, nodeId, productId } = schema.parse(req.body);
    const session = await requireLeadSession(token);
    const { graph, locked, unlocked } = await entitledNodes(session.funnelId, session.leadId);
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!node || (node.type !== "offer" && node.type !== "ai")) throw new HttpError(404, "Chamada não encontrada");
    if (locked.has(node.id) && !unlocked.has(node.id)) throw new HttpError(403, "Conteúdo bloqueado");
    let videoId = (node.content as OfferContent).videoId;
    if (node.type === "ai") {
      const brainId = (node.content as AiContent).brainId;
      const brain = brainId ? await prisma.brain.findUnique({ where: { id: brainId } }) : null;
      const offers = brain ? brainOffers(brain) : [];
      const withVideo = offers.filter((o) => (o.style === "call" || o.style === "live") && o.videoId);
      // vídeo escolhido na ligação de voz para o produto vendido no fim dela
      const voice = brain && productId ? brainVoiceCalls(brain).find((v) => v.videoId && voiceCallProductId(v, offers) === productId) : undefined;
      videoId = voice?.videoId ?? withVideo.find((o) => o.productId === productId || o.downsellProductId === productId)?.videoId;
      if (!videoId && productId && withVideo.length) {
        // ingresso comprado numa "Oferta" marcada no vídeo: a chamada é a desse vídeo
        const vids = await prisma.video.findMany({ where: { id: { in: withVideo.map((o) => o.videoId!) } } });
        videoId = vids.find((v) =>
          ((v.timeline as { markers?: { productId?: string; basicProductId?: string }[] } | null)?.markers ?? []).some(
            (m) => m.productId === productId || m.basicProductId === productId,
          ),
        )?.id;
      }
    }
    const video = videoId ? await prisma.video.findUnique({ where: { id: videoId } }) : null;
    if (!video) return { video: null };
    const funnel = await prisma.funnel.findUnique({ where: { id: session.funnelId }, select: { settings: true } });
    // só produtos na moeda do país do fluxo (fluxo do Brasil = reais/PIX): upsell de outra moeda não aparece
    const flowCurrency = currencyOfLocale(getFunnelSettings(funnel?.settings).locale);
    return { video: await callVideoPayload(video, session.leadId, flowCurrency) };
  },
});
