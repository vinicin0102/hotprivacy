// Página de links ("link na bio"): validação do que o dono salva e o formato que a página pública recebe.
import type { LinkPage, Prisma } from "@prisma/client";
import { z } from "zod";

export const LINK_FONTS = ["brush", "serif", "sans"] as const;
export type LinkFont = (typeof LINK_FONTS)[number];

export interface LinkItem {
  id: string;
  title: string;
  url: string;
  /** miniatura à esquerda do botão */
  thumbUrl?: string;
  /** botão em destaque (pulsando) */
  highlight?: boolean;
}
export interface LinkSettings {
  font: LinkFont;
  cardColor: string;
  textColor: string;
  buttonColor: string;
}

export const LINK_DEFAULTS: LinkSettings = { font: "brush", cardColor: "#f1e3fd", textColor: "#3b0a3f", buttonColor: "#fbeafd" };

const HEX = /^#[0-9a-f]{6}$/i;
const isLink = (v: string) => /^https?:\/\/[^\s]+$/i.test(v) || (v.startsWith("/") && !v.startsWith("//"));
const isMedia = (v: string) => /^https:\/\//i.test(v) || (v.startsWith("/") && !v.startsWith("//"));

/** "instagram.com/fulana" vira "https://instagram.com/fulana" */
export function normalizeLinkUrl(v: string): string {
  const t = v.trim();
  return t && !/^[a-z][a-z0-9+.-]*:/i.test(t) && !t.startsWith("/") ? `https://${t}` : t;
}

const linkUrl = z.preprocess(
  (v) => (typeof v === "string" ? normalizeLinkUrl(v) : v),
  z.string().max(2000).refine(isLink, "Link inválido (use https://...)"),
);
const media = z.string().trim().max(2000).refine((v) => !v || isMedia(v), "Imagem inválida (use https:// ou envie o arquivo)");
const color = z.string().trim().regex(HEX, "Cor inválida");

export const linkPageSchema = z.object({
  name: z.string().trim().min(1, "Dê um nome à página").max(80),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, "Link muito curto")
    .max(60)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use só letras minúsculas, números e hífen no link"),
  photoUrl: media.optional().nullable(),
  bgUrl: media.optional().nullable(),
  bio: z.string().trim().max(500).optional().nullable(),
  published: z.boolean().default(false),
  settings: z
    .object({ font: z.enum(LINK_FONTS).optional(), cardColor: color.optional(), textColor: color.optional(), buttonColor: color.optional() })
    .default({}),
  links: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(40),
        title: z.string().trim().min(1, "Todo botão precisa de um título").max(80),
        url: linkUrl,
        thumbUrl: media.optional().nullable(),
        highlight: z.boolean().optional(),
      }),
    )
    .max(30, "No máximo 30 links")
    .default([]),
});
export type LinkPageInput = z.infer<typeof linkPageSchema>;

export function linkPageData(d: LinkPageInput) {
  return {
    name: d.name,
    slug: d.slug,
    photoUrl: d.photoUrl || null,
    bgUrl: d.bgUrl || null,
    bio: d.bio || null,
    published: d.published,
    settings: linkSettings(d.settings) as unknown as Prisma.InputJsonValue,
    links: d.links.map((l) => ({
      id: l.id,
      title: l.title,
      url: l.url,
      ...(l.thumbUrl ? { thumbUrl: l.thumbUrl } : {}),
      ...(l.highlight ? { highlight: true } : {}),
    })) as Prisma.InputJsonValue,
  };
}

export function linkSettings(raw: unknown): LinkSettings {
  const s = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const c = (k: "cardColor" | "textColor" | "buttonColor") => (typeof s[k] === "string" && HEX.test(s[k] as string) ? (s[k] as string) : LINK_DEFAULTS[k]);
  return {
    font: LINK_FONTS.includes(s.font as LinkFont) ? (s.font as LinkFont) : LINK_DEFAULTS.font,
    cardColor: c("cardColor"),
    textColor: c("textColor"),
    buttonColor: c("buttonColor"),
  };
}

/** links salvos no banco: só os que têm título e endereço válidos */
export function linkItems(raw: unknown): LinkItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((l): l is Record<string, unknown> => !!l && typeof l === "object")
    .filter((l) => typeof l.id === "string" && typeof l.title === "string" && l.title && typeof l.url === "string" && isLink(l.url))
    .map((l) => ({
      id: l.id as string,
      title: l.title as string,
      url: l.url as string,
      ...(typeof l.thumbUrl === "string" && isMedia(l.thumbUrl) ? { thumbUrl: l.thumbUrl } : {}),
      ...(l.highlight === true ? { highlight: true } : {}),
    }));
}

export function publicLinkPage(p: Pick<LinkPage, "slug" | "name" | "photoUrl" | "bgUrl" | "bio" | "settings" | "links">) {
  return {
    slug: p.slug,
    name: p.name,
    photoUrl: p.photoUrl,
    bgUrl: p.bgUrl,
    bio: p.bio,
    settings: linkSettings(p.settings),
    links: linkItems(p.links),
  };
}
export type PublicLinkPage = ReturnType<typeof publicLinkPage>;
