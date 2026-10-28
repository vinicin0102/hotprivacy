// Página de links pública: /hot-secret/l/<slug>
import type { GetServerSideProps } from "next";
import Head from "next/head";
import { LinkPageView } from "@/components/links/LinkPageView";
import { ADMIN_COOKIE, verifyAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publicLinkPage, type PublicLinkPage } from "@/services/link-pages";

interface Props {
  page: PublicLinkPage;
  draft: boolean;
}

export default function LinkPagePublic({ page, draft }: Props) {
  const image = page.photoUrl || page.bgUrl;
  return (
    <>
      <Head>
        <title>{page.name}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="robots" content="noindex" />
        <meta name="theme-color" content={page.settings.cardColor} />
        <meta property="og:title" content={page.name} />
        {page.bio && <meta property="og:description" content={page.bio.slice(0, 160)} />}
        {image && <meta property="og:image" content={image} />}
      </Head>
      {draft && <div className="lp-draft">Rascunho — só você está vendo esta página</div>}
      <LinkPageView page={page} />
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const slug = String(ctx.params?.slug ?? "");
  const row = /^[a-z0-9-]{2,60}$/.test(slug) ? await prisma.linkPage.findUnique({ where: { slug } }) : null;
  const admin = !!(await verifyAdminSession(ctx.req.cookies[ADMIN_COOKIE]));
  if (!row || (!row.published && !admin)) return { notFound: true };
  // visitas: só de quem não é o dono
  if (!admin) await prisma.linkPage.update({ where: { id: row.id }, data: { views: { increment: 1 } } }).catch(() => undefined);
  return { props: { page: publicLinkPage(row), draft: !row.published } };
};
