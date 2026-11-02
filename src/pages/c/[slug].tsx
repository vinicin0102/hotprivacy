// Link da chamada de vídeo (sem chat): /hot-secret/c/<slug>
import type { GetServerSideProps } from "next";
import Head from "next/head";
import { useMemo } from "react";
import { CallLinkPage } from "@/components/call/CallLinkPage";
import { ChatI18nContext, asChatLocale, makeChatI18n } from "@/features/i18n/chat";
import { ADMIN_COOKIE, verifyAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sandboxAllowed } from "@/services/payments";
import { callLinkCharacter, callLinkSettings } from "@/services/call-links";
import type { PublicCharacter } from "@/types/flow";

interface Props {
  slug: string;
  character: PublicCharacter;
  locale: string;
  sandbox: boolean;
  startAtVip: boolean;
  draft: boolean;
}

export default function CallLink({ slug, character, locale, sandbox, startAtVip, draft }: Props) {
  const i18n = useMemo(() => makeChatI18n(asChatLocale(locale)), [locale]);
  return (
    <ChatI18nContext.Provider value={i18n}>
      <Head>
        <title>{`${i18n.t.videoCall} · ${character.name}`}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="robots" content="noindex" />
        <meta name="theme-color" content="#07040a" />
        <meta property="og:title" content={`${i18n.t.videoCall} · ${character.name}`} />
        {character.avatarUrl && <meta property="og:image" content={character.avatarUrl} />}
      </Head>
      {draft && <div className="cl-draft">Rascunho — só você está vendo esta chamada</div>}
      <CallLinkPage slug={slug} character={character} sandbox={sandbox} startAtVip={startAtVip} />
    </ChatI18nContext.Provider>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const slug = String(ctx.params?.slug ?? "");
  const video = /^[a-z0-9-]{2,60}$/.test(slug) ? await prisma.video.findUnique({ where: { callSlug: slug } }) : null;
  const settings = video ? callLinkSettings(video.callSettings) : null;
  const admin = !!(await verifyAdminSession(ctx.req.cookies[ADMIN_COOKIE]));
  if (!video || !settings || (!settings.published && !admin)) return { notFound: true };
  return {
    props: {
      slug,
      character: await callLinkCharacter(settings),
      locale: settings.locale,
      sandbox: sandboxAllowed() && (process.env.PAYMENT_PROVIDER ?? "sandbox") === "sandbox",
      startAtVip: settings.startAt === "vip",
      draft: !settings.published,
    },
  };
};
