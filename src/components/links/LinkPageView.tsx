// Página de links ("link na bio"): fundo borrado, card com a foto e o nome por cima, bio e os botões.
// A mesma tela é usada na página pública e na prévia do painel.
import Head from "next/head";
import type { CSSProperties } from "react";
import type { PublicLinkPage } from "@/services/link-pages";

const BRUSH_FONT = "https://fonts.googleapis.com/css2?family=Permanent+Marker&display=swap";

export function LinkPageView({ page, preview = false }: { page: PublicLinkPage; preview?: boolean }) {
  const s = page.settings;
  const bg = page.bgUrl || page.photoUrl;
  const vars = { "--lp-card": s.cardColor, "--lp-text": s.textColor, "--lp-btn": s.buttonColor } as CSSProperties;
  return (
    <div className={`lp-page lp-font-${s.font} ${preview ? "lp-preview" : ""}`} style={vars}>
      {s.font === "brush" && (
        <Head>
          <link rel="stylesheet" href={BRUSH_FONT} />
        </Head>
      )}
      {bg && <div className="lp-bg" style={{ backgroundImage: `url(${JSON.stringify(bg)})` }} aria-hidden="true" />}
      <main className="lp-card">
        {page.photoUrl ? (
          <div className="lp-photo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={page.photoUrl} alt="" />
            <h1 className="lp-name">{page.name}</h1>
          </div>
        ) : (
          <h1 className="lp-name lp-name-plain">{page.name}</h1>
        )}
        {page.bio && <p className="lp-bio">{page.bio}</p>}
        <nav className="lp-links">
          {page.links.map((l) => (
            <a key={l.id} className={`lp-link ${l.highlight ? "lp-hl" : ""}`} href={l.url} target="_blank" rel="noopener noreferrer">
              {l.thumbUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="lp-thumb" src={l.thumbUrl} alt="" />
              )}
              <span>{l.title}</span>
            </a>
          ))}
          {preview && page.links.length === 0 && <p className="lp-empty">Adicione o primeiro link ao lado.</p>}
        </nav>
      </main>
    </div>
  );
}
