// Páginas de links ("link na bio") das modelos. O editor fica em /admin/links/[id].
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Modal } from "@/components/ui/Modal";
import { useFetch } from "@/hooks/useFetch";
import { api } from "@/lib/client";
import { withBase } from "@/lib/paths";
import { slugify } from "@/lib/format";

interface PageRow {
  id: string;
  name: string;
  slug: string;
  photoUrl: string | null;
  published: boolean;
  views: number;
  linkCount: number;
}

export default function LinkPagesPage() {
  const router = useRouter();
  const { data, reload } = useFetch<{ pages: PageRow[] }>("/api/admin/links");
  const [creating, setCreating] = useState<{ name: string; slug: string; touched: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const create = async () => {
    if (!creating) return;
    setError(null);
    try {
      const r = await api<{ page: { id: string } }>("/api/admin/links", { body: { name: creating.name, slug: creating.slug, published: false } });
      void router.push(`/admin/links/${r.page.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao criar");
    }
  };
  const remove = async (p: PageRow) => {
    if (!confirm(`Excluir a página ${p.name}?`)) return;
    await api(`/api/admin/links/${p.id}`, { method: "DELETE" });
    void reload();
  };
  const copy = async (slug: string) => {
    await navigator.clipboard.writeText(`${window.location.origin}${withBase(`/l/${slug}`)}`).catch(() => undefined);
    setCopied(slug);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <AdminLayout
      title="Links"
      subtitle="Página de links de cada modelo (estilo link na bio): foto, nome e botões com os títulos e links que você quiser"
      actions={
        <button className="btn btn-primary" onClick={() => setCreating({ name: "", slug: "", touched: false })}>
          + Nova página
        </button>
      }
    >
      <div className="entity-grid">
        {data?.pages.map((p) => (
          <div key={p.id} className="card entity-card vip-row">
            <div className="vip-row-cover lp-row-cover" style={p.photoUrl ? { backgroundImage: `url(${JSON.stringify(p.photoUrl)})` } : undefined} />
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div className="serif" style={{ fontSize: 19 }}>
                {p.name}
              </div>
              <span className={`pill ${p.published ? "pill-on" : ""}`}>{p.published ? "Publicada" : "Rascunho"}</span>
            </div>
            <div className="hint">
              /l/{p.slug} · {p.linkCount} link(s) · {p.views} visita(s)
            </div>
            <div className="row">
              <Link className="btn btn-sm btn-primary" href={`/admin/links/${p.id}`}>
                Editar
              </Link>
              <a className="btn btn-sm" href={withBase(`/l/${p.slug}`)} target="_blank" rel="noreferrer">
                Ver página ↗
              </a>
              <button className="btn btn-sm" onClick={() => void copy(p.slug)}>
                {copied === p.slug ? "Copiado ✓" : "Copiar link"}
              </button>
              <button className="btn btn-sm btn-ghost" onClick={() => void remove(p)}>
                Excluir
              </button>
            </div>
          </div>
        ))}
        {data?.pages.length === 0 && (
          <div className="card empty">Crie a primeira página de links: coloque a foto da modelo, o nome e os botões (Grupo VIP, chat, Instagram, WhatsApp...).</div>
        )}
      </div>

      {creating && (
        <Modal title="Nova página de links" onClose={() => setCreating(null)}>
          <div className="field">
            <label htmlFor="lp-new-name">Nome que aparece na página</label>
            <input
              id="lp-new-name"
              className="input"
              placeholder="Nicoleoliveira"
              value={creating.name}
              onChange={(e) => setCreating({ ...creating, name: e.target.value, slug: creating.touched ? creating.slug : slugify(e.target.value) })}
            />
          </div>
          <div className="field">
            <label htmlFor="lp-new-slug">Link</label>
            <div className="row" style={{ gap: 6 }}>
              <span className="hint">/l/</span>
              <input
                id="lp-new-slug"
                className="input"
                placeholder="nicole"
                value={creating.slug}
                onChange={(e) => setCreating({ ...creating, slug: slugify(e.target.value), touched: true })}
              />
            </div>
          </div>
          {error && <div className="error-text">{error}</div>}
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setCreating(null)}>
              Cancelar
            </button>
            <button className="btn btn-primary" onClick={() => void create()} disabled={!creating.name.trim() || creating.slug.length < 2}>
              Criar e editar
            </button>
          </div>
        </Modal>
      )}
    </AdminLayout>
  );
}
