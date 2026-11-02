// Vídeo da chamada como o navegador recebe: trechos, falas, enquadramento e os upsells com produto e preço.
// Usado pela chamada do chat e pelo link da chamada (sem chat).
import type { Video } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { asCurrency, type Currency } from "@/lib/format";
import { normalizeTimeline } from "@/types/video";
import { vipAccessUrl, vipPreviewCard, type VipPreviewCard } from "./vip";

/** produtos que os upsells do vídeo vendem (ativos e na moeda pedida) */
export async function callVideoProducts(video: Pick<Video, "timeline" | "durationMs">, currency: Currency) {
  const timeline = normalizeTimeline(video.timeline, video.durationMs);
  const ids = [...new Set(timeline.markers.flatMap((m) => [m.productId, m.basicProductId ?? ""]).filter(Boolean))];
  const products = ids.length ? await prisma.product.findMany({ where: { id: { in: ids }, active: true } }) : [];
  return new Map(products.filter((p) => asCurrency(p.currency) === currency).map((p) => [p.id, p]));
}

export async function callVideoPayload(video: Video, leadId: string, currency: Currency) {
  const timeline = normalizeTimeline(video.timeline, video.durationMs);
  // upsell "Grupo VIP": a prévia do grupo (só publicado) e o link do grupo já como este lead
  const vipIds = [...new Set(timeline.markers.flatMap((m) => (m.style === "vip" && m.vipGroupId ? [m.vipGroupId] : [])))];
  const vipCards = new Map(
    (await Promise.all(vipIds.map(async (gid) => [gid, await vipPreviewCard(gid)] as const))).filter((e): e is [string, VipPreviewCard] => !!e[1]),
  );
  const vipUrls = new Map(await Promise.all([...vipCards.values()].map(async (c) => [c.groupId, await vipAccessUrl({ id: c.groupId, slug: c.slug }, leadId)] as const)));
  // só produtos na moeda pedida (fluxo do Brasil = reais/PIX): upsell de outra moeda não aparece
  const byId = await callVideoProducts(video, currency);
  return {
    url: video.url,
    posterUrl: video.posterUrl,
    durationMs: video.durationMs,
    free: timeline.free,
    vip: timeline.vip,
    chat: timeline.chat,
    frame: timeline.frame ?? null,
    markers: timeline.markers
      .filter((m) => byId.has(m.productId) && (m.style !== "vip" || (!!m.vipGroupId && vipCards.has(m.vipGroupId))))
      .map((m) => {
        const p = byId.get(m.productId)!;
        const b = m.basicProductId ? byId.get(m.basicProductId) : undefined;
        return {
          ...m,
          product: { id: p.id, name: p.name, price: p.price, originalPrice: p.originalPrice, currency: p.currency },
          ...(b ? { basicProduct: { id: b.id, name: b.name, price: b.price, originalPrice: b.originalPrice, currency: b.currency } } : {}),
          ...(m.style === "vip" && m.vipGroupId ? { vipCard: vipCards.get(m.vipGroupId), vipUrl: vipUrls.get(m.vipGroupId) } : {}),
        };
      }),
  };
}
