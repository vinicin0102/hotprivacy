import type { Prisma } from "@prisma/client";
import { apiHandler, HttpError, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { videoSchema } from "@/lib/validation";
import { normalizeTimeline } from "@/types/video";
import { callLinkData, callLinkSchema, callLinkSettings } from "@/services/call-links";

export default apiHandler({
  GET: async (req) => {
    await requireAdmin(req);
    const video = await prisma.video.findUnique({ where: { id: String(req.query.id) } });
    if (!video) throw new HttpError(404, "Vídeo não encontrado");
    return { video: { ...video, timeline: normalizeTimeline(video.timeline, video.durationMs), callSettings: callLinkSettings(video.callSettings) } };
  },
  PUT: async (req) => {
    await requireAdmin(req);
    const id = String(req.query.id);
    const data = videoSchema.parse(req.body);
    // link da chamada (sem chat): vem junto quando o editor manda
    const call = req.body?.call ? callLinkSchema.parse(req.body.call) : null;
    if (call?.slug) {
      const other = await prisma.video.findUnique({ where: { callSlug: call.slug }, select: { id: true } });
      if (other && other.id !== id) throw new HttpError(409, "Esse link de chamada já está em uso por outro vídeo");
    }
    const video = await prisma.video.update({
      where: { id },
      data: {
        name: data.name,
        url: data.url,
        posterUrl: data.posterUrl ?? null,
        durationMs: data.durationMs,
        ...(data.timeline ? { timeline: normalizeTimeline(data.timeline, data.durationMs) as unknown as Prisma.InputJsonValue } : {}),
        ...(call ? callLinkData(call) : {}),
      },
    });
    return { video };
  },
  DELETE: async (req) => {
    await requireAdmin(req);
    await prisma.video.delete({ where: { id: String(req.query.id) } });
    return { ok: true };
  },
});
