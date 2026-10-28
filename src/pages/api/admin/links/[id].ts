import { apiHandler, HttpError, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { linkItems, linkPageData, linkPageSchema, linkSettings } from "@/services/link-pages";

// Página de links: dados para o editor; salvar; excluir
export default apiHandler({
  GET: async (req) => {
    await requireAdmin(req);
    const page = await prisma.linkPage.findUnique({ where: { id: String(req.query.id) } });
    if (!page) throw new HttpError(404, "Página não encontrada");
    return { page: { ...page, settings: linkSettings(page.settings), links: linkItems(page.links) } };
  },
  PUT: async (req) => {
    await requireAdmin(req);
    const id = String(req.query.id);
    const data = linkPageSchema.parse(req.body);
    const other = await prisma.linkPage.findUnique({ where: { slug: data.slug } });
    if (other && other.id !== id) throw new HttpError(409, "Esse link já está em uso por outra página");
    const page = await prisma.linkPage.update({ where: { id }, data: linkPageData(data) });
    return { page };
  },
  DELETE: async (req) => {
    await requireAdmin(req);
    await prisma.linkPage.delete({ where: { id: String(req.query.id) } });
    return { ok: true };
  },
});
