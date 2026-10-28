import { apiHandler, HttpError, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { linkPageData, linkPageSchema } from "@/services/link-pages";

// Páginas de links: lista e criação
export default apiHandler({
  GET: async (req) => {
    await requireAdmin(req);
    const pages = await prisma.linkPage.findMany({ orderBy: { createdAt: "desc" } });
    return {
      pages: pages.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        photoUrl: p.photoUrl,
        published: p.published,
        views: p.views,
        linkCount: Array.isArray(p.links) ? p.links.length : 0,
      })),
    };
  },
  POST: async (req) => {
    await requireAdmin(req);
    const data = linkPageSchema.parse(req.body);
    if (await prisma.linkPage.findUnique({ where: { slug: data.slug } })) throw new HttpError(409, "Esse link já está em uso por outra página");
    const page = await prisma.linkPage.create({ data: linkPageData(data) });
    return { page };
  },
});
