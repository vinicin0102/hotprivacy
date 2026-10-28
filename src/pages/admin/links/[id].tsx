// Página de links: foto, nome, bio, cores e os botões (título + link), com a prévia ao vivo ao lado.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { UploadInput } from "@/components/admin/UploadInput";
import { LinkPageView } from "@/components/links/LinkPageView";
import { useFetch } from "@/hooks/useFetch";
import { api } from "@/lib/client";
import { slugify } from "@/lib/format";
import { withBase } from "@/lib/paths";
import { LINK_DEFAULTS, type LinkItem, type LinkSettings } from "@/services/link-pages";

interface Page {
  id: string;
  name: string;
  slug: string;
  photoUrl: string | null;
  bgUrl: string | null;
  bio: string | null;
  published: boolean;
  views: number;
  settings: LinkSettings;
  links: LinkItem[];
}

const FONTS: [LinkSettings["font"], string][] = [
  ["brush", "✍️ Pincel"],
  ["serif", "Elegante"],
  ["sans", "Moderna"],
];
const COLORS: [keyof Omit<LinkSettings, "font">, string][] = [
  ["cardColor", "Fundo do card"],
  ["textColor", "Texto e bordas"],
  ["buttonColor", "Fundo dos botões"],
];

const newId = () => Math.random().toString(36).slice(2, 10);

export default function LinkPageEditor() {
  const router = useRouter();
  const id = typeof router.query.id === "string" ? router.query.id : null;
  const { data } = useFetch<{ page: Page }>(id ? `/api/admin/links/${id}` : null);
  const { data: vip } = useFetch<{ groups: { id: string; name: string; slug: string }[] }>("/api/admin/vip");
  const [p, setP] = useState<Page | null>(null);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const [openThumb, setOpenThumb] = useState<string | null>(null);

  useEffect(() => {
    if (data?.page) setP((cur) => (cur && cur.id === data.page.id ? cur : data.page));
  }, [data]);

  if (!p) return <AdminLayout title="Links">{<p className="hint">Carregando...</p>}</AdminLayout>;

  const set = (patch: Partial<Page>) => {
    setP({ ...p, ...patch });
    setSaved("idle");
  };
  const setS = (patch: Partial<LinkSettings>) => set({ settings: { ...p.settings, ...patch } });
  const setLink = (lid: string, patch: Partial<LinkItem>) => set({ links: p.links.map((l) => (l.id === lid ? { ...l, ...patch } : l)) });
  const move = (lid: string, d: -1 | 1) => {
    const i = p.links.findIndex((l) => l.id === lid);
    const j = i + d;
    if (i < 0 || j < 0 || j >= p.links.length) return;
    const next = [...p.links];
    [next[i], next[j]] = [next[j], next[i]];
    set({ links: next });
  };
  const addLink = (title = "", url = "") => set({ links: [...p.links, { id: newId(), title, url }] });

  const save = async () => {
    setError(null);
    setSaved("saving");
    try {
      await api(`/api/admin/links/${p.id}`, {
        method: "PUT",
        body: {
          name: p.name,
          slug: p.slug,
          photoUrl: p.photoUrl,
          bgUrl: p.bgUrl,
          bio: p.bio,
          published: p.published,
          settings: p.settings,
          links: p.links.map((l) => ({ ...l, thumbUrl: l.thumbUrl || null })),
        },
      });
      setSaved("saved");
    } catch (e) {
      setSaved("idle");
      setError(e instanceof Error ? e.message : "Erro ao salvar");
    }
  };

  return (
    <AdminLayout
      title={p.name || "Página de links"}
      subtitle={
        <>
          <Link href="/admin/links">← Links</Link> · /l/{p.slug} · {p.published ? "publicada" : "rascunho (só você vê)"} · {p.views} visita(s)
        </>
      }
      actions={
        <div className="row">
          <a className="btn" href={withBase(`/l/${p.slug}`)} target="_blank" rel="noreferrer">
            Ver página ↗
          </a>
          <button className="btn btn-primary" onClick={() => void save()} disabled={saved === "saving"}>
            {saved === "saving" ? "Salvando..." : saved === "saved" ? "Salvo ✓" : "Salvar"}
          </button>
        </div>
      }
    >
      {error && <p className="error-text">{error}</p>}
      <div className="lp-editor">
        <div className="lp-editor-form">
          <div className="card">
            <div className="card-head">
              <h3>Perfil</h3>
              <label className="checkbox">
                <input type="checkbox" checked={p.published} onChange={(e) => set({ published: e.target.checked })} /> Publicada
              </label>
            </div>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="lp-name">Nome</label>
                <input id="lp-name" className="input" value={p.name} onChange={(e) => set({ name: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="lp-slug">Link (/l/…)</label>
                <input id="lp-slug" className="input" value={p.slug} onChange={(e) => set({ slug: slugify(e.target.value) })} />
              </div>
            </div>
            <div className="field">
              <label>Foto principal</label>
              <UploadInput value={p.photoUrl ?? ""} onChange={(photoUrl) => set({ photoUrl })} />
            </div>
            <div className="field">
              <label>Fundo (opcional)</label>
              <UploadInput value={p.bgUrl ?? ""} onChange={(bgUrl) => set({ bgUrl })} />
              <span className="hint">Aparece borrado atrás do card. Vazio = usa a própria foto.</span>
            </div>
            <div className="field">
              <label htmlFor="lp-bio">Texto abaixo do nome (opcional)</label>
              <textarea id="lp-bio" className="textarea" placeholder="Meus conteúdos mais quentes 🔥" value={p.bio ?? ""} onChange={(e) => set({ bio: e.target.value })} />
            </div>
            <div className="field">
              <label>Letra do nome</label>
              <div className="segmented">
                {FONTS.map(([v, label]) => (
                  <button key={v} type="button" className={p.settings.font === v ? "active" : ""} onClick={() => setS({ font: v })}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="lp-colors">
              {COLORS.map(([k, label]) => (
                <label key={k} className="lp-color">
                  <input type="color" value={p.settings[k]} onChange={(e) => setS({ [k]: e.target.value })} />
                  {label}
                </label>
              ))}
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => setS({ cardColor: LINK_DEFAULTS.cardColor, textColor: LINK_DEFAULTS.textColor, buttonColor: LINK_DEFAULTS.buttonColor })}
              >
                Cores padrão
              </button>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h3>Botões ({p.links.length})</h3>
              <div className="row" style={{ gap: 6 }}>
                {!!vip?.groups.length && (
                  <select
                    className="select"
                    value=""
                    aria-label="Adicionar link de um Grupo VIP"
                    onChange={(e) => {
                      const g = vip.groups.find((x) => x.id === e.target.value);
                      if (g) addLink(`💎 ${g.name}`, `${window.location.origin}${withBase(`/g/${g.slug}`)}`);
                    }}
                  >
                    <option value="">+ Grupo VIP</option>
                    {vip.groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                )}
                <button className="btn btn-primary btn-sm" onClick={() => addLink()} disabled={p.links.length >= 30}>
                  + Link
                </button>
              </div>
            </div>
            {p.links.length === 0 && <p className="hint">Nenhum botão ainda. Ex.: “Meus conteúdos mais quentes 🔥” levando para o Grupo VIP.</p>}
            <div className="lp-link-list">
              {p.links.map((l, i) => (
                <div key={l.id} className="lp-link-row">
                  <div className="lp-link-fields">
                    <input className="input" placeholder="Título do botão" value={l.title} onChange={(e) => setLink(l.id, { title: e.target.value })} aria-label="Título do botão" />
                    <input
                      className="input"
                      placeholder="https://..."
                      value={l.url}
                      onChange={(e) => setLink(l.id, { url: e.target.value })}
                      aria-label="Link do botão"
                      inputMode="url"
                    />
                    {openThumb === l.id && <UploadInput value={l.thumbUrl ?? ""} onChange={(thumbUrl) => setLink(l.id, { thumbUrl })} />}
                    <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
                      <label className="checkbox">
                        <input type="checkbox" checked={!!l.highlight} onChange={(e) => setLink(l.id, { highlight: e.target.checked })} /> Destacar (pulsando)
                      </label>
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpenThumb(openThumb === l.id ? null : l.id)}>
                        {l.thumbUrl ? "🖼 Miniatura ✓" : "🖼 Miniatura"}
                      </button>
                    </div>
                  </div>
                  <div className="lp-link-tools">
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => move(l.id, -1)} disabled={i === 0} aria-label="Subir">
                      ↑
                    </button>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => move(l.id, 1)} disabled={i === p.links.length - 1} aria-label="Descer">
                      ↓
                    </button>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => set({ links: p.links.filter((x) => x.id !== l.id) })} aria-label="Remover">
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="lp-editor-preview">
          <div className="hint" style={{ marginBottom: 8 }}>
            Prévia
          </div>
          <div className="lp-phone">
            <LinkPageView
              preview
              page={{ slug: p.slug, name: p.name, photoUrl: p.photoUrl, bgUrl: p.bgUrl, bio: p.bio, settings: p.settings, links: p.links.filter((l) => l.title) }}
            />
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
