// Página pública do Grupo VIP: perfil da modelo, VSL, card da assinatura (planos), amostras grátis, feed e grade de mídias.
// Post bloqueado chega do servidor só com a prévia borrada; tocar nele abre a folha do pagamento (PIX/SPEI)
// e, aprovado, a página recarrega com o conteúdo liberado. Tema escuro (padrão) ou claro, estilo perfil de criadora.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChatI18n } from "@/features/i18n/chat";
import { vipTexts, type VipTexts } from "@/features/i18n/vip";
import { ApiError, type PayMethods, type PayerData, type PublicPaymentInfo } from "@/features/chat-engine/transport";
import { PixPayBody } from "@/components/chat/VideoCall";
import { withBase } from "@/lib/paths";
import { vslEmbed } from "@/lib/vsl";
import type { VipState as ServerState } from "@/services/vip";

/** o que a página recebe do servidor (pagamentos no formato do chat) */
type VipState = Omit<ServerState, "payments"> & { payments: PublicPaymentInfo[] };
type Post = VipState["posts"][number];
type Product = NonNullable<VipState["group"]["product"]>;

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(withBase(path), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new ApiError(0, "Sem conexão. Tente de novo.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? "Erro", data as Record<string, unknown>);
  return data as T;
}

export function VipProfile({ slug, sandbox, light: lightInitial = false }: { slug: string; sandbox: boolean; light?: boolean }) {
  const { locale, money } = useChatI18n();
  const t = vipTexts(locale);
  const [state, setState] = useState<VipState | null>(null);
  const [loadError, setLoadError] = useState(false);
  const token = useRef<string | null>(null);
  const [tab, setTab] = useState<"posts" | "media">("posts");
  const [buying, setBuying] = useState<Product | null>(null);
  const [viewer, setViewer] = useState<{ items: { kind: string; url: string }[]; index: number } | null>(null);
  const key = `hs_vip_${slug}`;
  /** card da assinatura na tela: a barra de baixo só aparece depois que ele sai (sem dois botões iguais) */
  const subRef = useRef<HTMLElement | null>(null);
  const [subVisible, setSubVisible] = useState(true);
  const watchSub = useCallback((el: HTMLElement | null) => {
    subRef.current = el;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setSubVisible(e.isIntersecting), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  /** VSL com atraso: a oferta aparece depois de X segundos de vídeo (e continua aberta nas próximas visitas) */
  const [ctaShown, setCtaShown] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(`${key}_cta`)) setCtaShown(true);
    } catch {
      /* navegação privada */
    }
  }, [key]);
  const revealCta = useCallback(() => {
    setCtaShown(true);
    try {
      localStorage.setItem(`${key}_cta`, "1");
    } catch {
      /* ignore */
    }
  }, [key]);

  const load = useCallback(async () => {
    const params = new URLSearchParams(window.location.search);
    const utm: Record<string, string> = {};
    for (const k of UTM_KEYS) if (params.get(k)) utm[k] = params.get(k)!;
    const acesso = params.get("acesso");
    if (acesso) {
      // o acesso vindo do chat não fica na barra de endereço (nem é compartilhado sem querer)
      params.delete("acesso");
      const q = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${q ? `?${q}` : ""}${window.location.hash}`);
    }
    if (!token.current) {
      try {
        token.current = localStorage.getItem(key);
      } catch {
        /* navegação privada */
      }
    }
    try {
      const r = await post<VipState & { token: string }>(`/api/public/vip/${slug}`, {
        token: token.current,
        acesso,
        utm,
        referrer: document.referrer || null,
        landingPage: window.location.href,
      });
      token.current = r.token;
      try {
        localStorage.setItem(key, r.token);
      } catch {
        /* ignore */
      }
      setState(r);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [key, slug]);

  useEffect(() => void load(), [load]);

  // pagamento em andamento: confere a cada 4s (só com a página visível)
  const pending = state?.payments.some((p) => p.status === "PENDING" || p.status === "CREATED");
  useEffect(() => {
    if (!pending) return;
    const iv = setInterval(() => !document.hidden && void load(), 4000);
    return () => clearInterval(iv);
  }, [pending, load]);

  if (!state) {
    return (
      <div className={`vg-page vg-loading ${lightInitial ? "light" : ""}`} onClick={() => loadError && void load()}>
        {loadError ? t.error : <span className="once-spin" aria-label={t.loading} />}
      </div>
    );
  }

  const g = state.group;
  const s = g.settings;
  const light = s.theme === "light";
  const sub = g.product;
  const offerSub = !!sub && !state.subscribed;
  const ctaOpen = !s.vslUrl || !s.vslDelay || ctaShown;
  const showOffer = offerSub && ctaOpen;
  const buyFor = (p: Post) => (p.access === "paid" ? p.product : p.access === "vip" ? sub : null);
  const media = state.posts.flatMap((p) => p.media.map((m, i) => ({ ...m, post: p, i })));
  // números do perfil: o que o dono digitou no painel, ou a contagem real dos posts
  const shown = {
    images: s.showImages || String(g.counts.images),
    videos: s.showVideos || String(g.counts.videos),
    posts: s.showPosts || String(g.counts.posts),
    media: s.showMedia || String(media.length),
  };
  // amostras: as mídias dos posts grátis, numa faixa antes do feed
  const samples =
    s.samples === false
      ? []
      : state.posts
          .filter((p) => p.access === "free" && !p.locked)
          .flatMap((p) => p.media.filter((m) => m.url).map((m) => ({ kind: m.kind, url: m.url! })))
          .slice(0, 12);

  const vslEl = s.vslUrl ? (
    <Vsl url={s.vslUrl} poster={s.vslPoster} title={s.vslTitle} t={t} delay={offerSub && !ctaOpen ? s.vslDelay : undefined} onReveal={revealCta} />
  ) : null;
  const vipEl = state.subscribed ? <div className="vg-is-vip">{t.youAreVip}</div> : null;
  const offerEl = showOffer ? (
    <section className="vg-sub" ref={watchSub}>
      {light && <div className="vg-sub-label">{t.plans}</div>}
      {(!light || s.headline) && <div className="vg-sub-head">{s.headline || t.headline}</div>}
      {!!s.perks?.length && (
        <>
          <div className="vg-sub-perks-title">{t.perksTitle}</div>
          <ul className="vg-sub-perks">
            {s.perks.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </>
      )}
      {light ? (
        <>
          <div className="vg-main-plan">
            {s.planBadge && <span className="vg-plan-tag">{s.planBadge}</span>}
            <button className="vg-plan is-main" onClick={() => setBuying(sub)}>
              <span>{s.ctaLabel || t.subscribe}</span>
              <b>{money(sub.price, sub.currency)}</b>
            </button>
            {s.planNote && <span className="vg-plan-tag note">{s.planNote}</span>}
          </div>
          {g.plans.length > 0 && <Promos title={s.promoTitle || t.promos} plans={g.plans} onBuy={setBuying} />}
        </>
      ) : (
        <>
          <div className="vg-sub-price">
            {sub.originalPrice && sub.originalPrice > sub.price ? <s>{money(sub.originalPrice, sub.currency)}</s> : null}
            <b>{money(sub.price, sub.currency)}</b>
            <small>{t.once}</small>
          </div>
          <button className="vg-cta" onClick={() => setBuying(sub)}>
            {s.ctaLabel || t.subscribe} <span aria-hidden="true">→</span>
          </button>
          {g.plans.length > 0 && (
            <div className="vg-plans">
              {g.plans.map((p) => (
                <button key={p.product.id} className="vg-plan" onClick={() => setBuying(p.product)}>
                  <span>
                    {p.label || p.product.name}
                    {p.badge && <em>{p.badge}</em>}
                  </span>
                  <b>{money(p.product.price, p.product.currency)}</b>
                </button>
              ))}
            </div>
          )}
        </>
      )}
      <div className="vg-secure">{t.secure}</div>
    </section>
  ) : null;

  return (
    <div className={`vg-page ${light ? "light" : ""} ${showOffer ? "with-bar" : ""}`}>
      {light && s.promoBar && <div className="vg-promo">{s.promoBar.replace(/\{hoje\}/gi, new Date().toLocaleDateString(locale))}</div>}
      {(s.logoUrl || (light && s.brand)) && (
        <div className="vg-top">
          {s.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="vg-logo" src={s.logoUrl} alt={s.brand || g.name} />
          )}
          {light && s.brand && <span>{s.brand}</span>}
        </div>
      )}
      {!g.published && <div className="vg-draft">{t.draft}</div>}
      <header className="vg-head">
        <div className="vg-cover" style={g.coverUrl ? { backgroundImage: `url(${g.coverUrl})` } : undefined}>
          {light && (
            <div className="vg-cover-info">
              <h1 className="vg-cover-name">{g.name}</h1>
              <div className="vg-istats">
                <span>
                  <Ico name="image" /> {shown.images}
                </span>
                <span>
                  <Ico name="video" /> {shown.videos}
                </span>
                {s.likes && (
                  <span>
                    <Ico name="heart" /> {s.likes}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="vg-id">
          <div className="vg-avatar">
            {g.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={g.avatarUrl} alt="" />
            ) : (
              <span>{g.name.slice(0, 1)}</span>
            )}
          </div>
          {!light && (
            <>
              <h1 className="vg-name">
                {g.name}
                <span className="vg-verified" title={t.verified} aria-label={t.verified}>
                  ✓
                </span>
              </h1>
              <div className="vg-handle">@{g.slug}</div>
            </>
          )}
          {!light && (
            <div className="vg-stats">
              <span>
                <b>{shown.posts}</b> {t.posts}
              </span>
              <span>
                <b>{shown.images}</b> {t.photos}
              </span>
              <span>
                <b>{shown.videos}</b> {t.videos}
              </span>
              {s.likes && (
                <span>
                  <b>{s.likes}</b> {t.likes}
                </span>
              )}
            </div>
          )}
          {!light && g.bio && <Bio text={g.bio} t={t} light={false} />}
        </div>
      </header>

      {light && (
        <section className="vg-card vg-about">
          <b className="vg-about-name">{g.slug}</b>
          <span className="vg-verified-ico" title={t.verified} aria-label={t.verified}>
            <Ico name="verified" />
          </span>
          <div className="vg-handle">@{g.slug}</div>
          {g.bio && <p className="vg-bio">{g.bio}</p>}
        </section>
      )}

      {vslEl}
      {vipEl}
      {offerEl}

      {samples.length > 0 && (
        <section className="vg-samples">
          <div className="vg-samples-title">{s.samplesTitle || t.samples}</div>
          <div className="vg-samples-track">
            {samples.map((m, i) => (
              <button key={`${m.url}-${i}`} className="vg-sample" onClick={() => setViewer({ items: samples, index: i })}>
                {m.kind === "video" ? (
                  <video src={`${m.url}#t=0.5`} muted playsInline preload="metadata" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.url} alt="" loading="lazy" />
                )}
                {m.kind === "video" && <span className="vg-cell-kind">▶</span>}
              </button>
            ))}
          </div>
        </section>
      )}

      <nav className="vg-tabs" role="tablist">
        <button role="tab" aria-selected={tab === "posts"} className={tab === "posts" ? "active" : ""} onClick={() => setTab("posts")}>
          {light ? `${shown.posts} ${t.postsTab.toLowerCase()}` : t.tabPosts}
        </button>
        <button role="tab" aria-selected={tab === "media"} className={tab === "media" ? "active" : ""} onClick={() => setTab("media")}>
          {light ? `${shown.media} ${t.mediaTab.toLowerCase()}` : t.tabMedia}
        </button>
      </nav>

      {state.posts.length === 0 && <p className="vg-empty">{t.empty}</p>}

      {tab === "posts" ? (
        <div className="vg-feed">
          {state.posts.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              group={g}
              t={t}
              light={light}
              buy={buyFor(p)}
              onBuy={(pr) => setBuying(pr)}
              onOpen={(index) => setViewer({ items: p.media.filter((m) => m.url).map((m) => ({ kind: m.kind, url: m.url! })), index })}
            />
          ))}
        </div>
      ) : (
        <div className="vg-grid">
          {media.map((m) => {
            const pr = m.post.locked ? buyFor(m.post) : null;
            return (
              <button
                key={`${m.post.id}-${m.i}`}
                className={`vg-cell ${m.url ? "" : "locked"}`}
                onClick={() => {
                  if (m.url) setViewer({ items: m.post.media.filter((x) => x.url).map((x) => ({ kind: x.kind, url: x.url! })), index: m.i });
                  else if (pr) setBuying(pr);
                }}
              >
                {m.url ? (
                  m.kind === "video" ? (
                    <video src={`${m.url}#t=0.5`} muted playsInline preload="metadata" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.url} alt="" loading="lazy" />
                  )
                ) : m.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="vg-blur" src={m.preview} alt="" loading="lazy" />
                ) : (
                  <span className="vg-blur vg-blur-empty" />
                )}
                {m.kind === "video" && <span className="vg-cell-kind">▶</span>}
                {!m.url && <span className="vg-cell-lock">{light ? <Ico name="lock" /> : "🔒"}</span>}
              </button>
            );
          })}
        </div>
      )}

      {showOffer && !buying && !subVisible && (
        <div className="vg-bar">
          <button className="vg-cta" onClick={() => setBuying(sub)}>
            {light ? (
              <>
                <span>{(s.barText || t.barText).replace(/\{preco\}/gi, money(sub.price, sub.currency))}</span>
                <Ico name="chevron" />
              </>
            ) : (
              `${s.ctaLabel || t.subscribe} · ${money(sub.price, sub.currency)}`
            )}
          </button>
        </div>
      )}

      {buying && (
        <PaySheet
          slug={slug}
          token={token.current ?? ""}
          product={buying}
          model={g.model}
          t={t}
          payments={state.payments}
          sandbox={sandbox}
          bought={!!state && isOwned(state, buying.id)}
          onPayment={(p) => setState((st) => (st ? { ...st, payments: [p, ...st.payments.filter((x) => x.id !== p.id)] } : st))}
          onRefresh={load}
          onClose={() => setBuying(null)}
        />
      )}

      {viewer && <Viewer items={viewer.items} start={viewer.index} t={t} onClose={() => setViewer(null)} />}
    </div>
  );
}

/** o lead já tem este produto liberado (pagamento aprovado) */
function isOwned(state: VipState, productId: string) {
  return state.payments.some((p) => p.productId === productId && p.status === "APPROVED");
}

/** planos extras numa lista que abre e fecha (aberta no começo) */
function Promos({ title, plans, onBuy }: { title: string; plans: VipState["group"]["plans"]; onBuy: (p: Product) => void }) {
  const { money } = useChatI18n();
  const [open, setOpen] = useState(true);
  return (
    <div className="vg-promos">
      <button className={`vg-promos-head ${open ? "open" : ""}`} onClick={() => setOpen(!open)} aria-expanded={open}>
        {title}
        <Ico name="chevron" />
      </button>
      {open && (
        <div className="vg-plans">
          {plans.map((p) => (
            <button key={p.product.id} className="vg-plan alt" onClick={() => onBuy(p.product)}>
              <span>
                {p.label || p.product.name}
                {p.badge && <em>{p.badge}</em>}
              </span>
              <b>{money(p.product.price, p.product.currency)}</b>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Bio({ text, t, light }: { text: string; t: VipTexts; light: boolean }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 140;
  return (
    <p className="vg-bio">
      {long && !open ? `${text.slice(0, 140).trimEnd()}… ` : `${text} `}
      {long && (
        <button className="vg-more-btn" onClick={() => setOpen(!open)}>
          {open ? t.less : light ? t.readMore : t.more}
        </button>
      )}
    </p>
  );
}

const ICONS = {
  image: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </>
  ),
  video: (
    <>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M2 9h20M7 4l2 5M13 4l2 5M10 12.5v5l4.5-2.5z" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4M12 15v2" />
    </>
  ),
  heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />,
  coin: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .8-3 2s1.3 1.7 3 2 3 .8 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5M12 6.5V8M12 16v1.5" />
    </>
  ),
  bookmark: <path d="M6 3h12v18l-6-4-6 4z" />,
  post: <rect x="7" y="2" width="10" height="20" rx="2" />,
  sound: <path d="M11 5L6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />,
  play: <path d="M8 5v14l11-7z" fill="currentColor" />,
  chevron: <path d="M9 6l6 6-6 6" />,
  comment: <path d="M4 5h16v11H9l-5 4z" />,
  dots: (
    <>
      <circle cx="12" cy="5" r="1.3" fill="currentColor" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" />
      <circle cx="12" cy="19" r="1.3" fill="currentColor" />
    </>
  ),
  verified: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.7 2.7L16 9.8" />
    </>
  ),
};

/** ícones de traço do tema claro */
function Ico({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg className="vg-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

/**
 * VSL: arquivo de vídeo começa mudo com o aviso "clique para ouvir" (volta ao início com som); link do
 * YouTube/Vimeo/player vira iframe. Com atraso, avisa quando o vídeo passa de X segundos para mostrar a oferta.
 */
function Vsl({
  url,
  poster,
  title,
  delay,
  onReveal,
  t,
}: {
  url: string;
  poster?: string;
  title?: string;
  delay?: number;
  onReveal: () => void;
  t: VipTexts;
}) {
  const embed = vslEmbed(url);
  const ref = useRef<HTMLVideoElement>(null);
  const [sound, setSound] = useState(false);
  const [paused, setPaused] = useState(false);
  const [pct, setPct] = useState(0);

  // o React não põe o atributo "muted" no <video>: sem ele o celular não deixa tocar sozinho
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = true;
    v.play().catch(() => setPaused(true));
  }, [url]);

  // iframe: o tempo do vídeo não é legível daqui — conta o tempo na página
  useEffect(() => {
    if (!delay || !embed) return;
    const id = setTimeout(onReveal, delay * 1000);
    return () => clearTimeout(id);
  }, [delay, embed, onReveal]);

  const onTime = () => {
    const v = ref.current;
    if (!v) return;
    if (v.duration) setPct(v.currentTime / v.duration);
    if (delay && v.currentTime >= delay) onReveal();
  };
  const unmute = () => {
    const v = ref.current;
    if (!v) return;
    v.currentTime = 0;
    v.muted = false;
    void v.play().catch(() => setPaused(true));
    setSound(true);
  };
  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (!sound) return unmute();
    if (v.paused) void v.play();
    else v.pause();
  };

  return (
    <section className="vg-vsl">
      {title && <div className="vg-vsl-title">{title}</div>}
      <div className="vg-vsl-frame">
        {embed ? (
          <iframe src={embed} title={title || "VSL"} allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowFullScreen />
        ) : (
          <>
            <video
              ref={ref}
              src={url}
              poster={poster}
              autoPlay
              muted
              playsInline
              preload="auto"
              onClick={toggle}
              onTimeUpdate={onTime}
              onPlay={() => setPaused(false)}
              onPause={() => setPaused(true)}
              controlsList="nodownload noremoteplayback"
              disablePictureInPicture
              onContextMenu={(e) => e.preventDefault()}
            />
            {!sound ? (
              <button className="vg-vsl-unmute" onClick={unmute}>
                <Ico name="sound" />
                <b>{t.vslUnmute}</b>
                <small>{t.vslUnmuteSub}</small>
              </button>
            ) : (
              paused && (
                <button className="vg-vsl-play" onClick={toggle} aria-label="Play">
                  <Ico name="play" />
                </button>
              )
            )}
            <span className="vg-vsl-bar" aria-hidden="true">
              <span style={{ width: `${pct * 100}%` }} />
            </span>
          </>
        )}
      </div>
    </section>
  );
}

function timeAgo(iso: string, locale: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (s < 3600) return rtf.format(-Math.max(1, Math.round(s / 60)), "minute");
  if (s < 86400) return rtf.format(-Math.round(s / 3600), "hour");
  if (s < 86400 * 30) return rtf.format(-Math.round(s / 86400), "day");
  return new Date(iso).toLocaleDateString(locale, { day: "2-digit", month: "short" });
}

function PostCard({
  post,
  group,
  t,
  light,
  buy,
  onBuy,
  onOpen,
}: {
  post: Post;
  group: VipState["group"];
  t: VipTexts;
  light: boolean;
  buy: Product | null;
  onBuy: (p: Product) => void;
  onOpen: (index: number) => void;
}) {
  const { locale, money } = useChatI18n();
  const [idx, setIdx] = useState(0);
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const many = post.media.length > 1;
  const onScroll = () => {
    const el = scroller.current;
    if (el) setIdx(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
  };
  const counts = [post.counts.images ? `📷 ${post.counts.images}` : "", post.counts.videos ? `🎬 ${post.counts.videos}` : ""].filter(Boolean).join(" · ");
  return (
    <article className="vg-post">
      <div className="vg-post-head">
        {group.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={group.avatarUrl} alt="" />
        ) : (
          <span className="vg-post-ini">{group.name.slice(0, 1)}</span>
        )}
        <div>
          <b>{light ? group.slug : group.name}</b>
          <small>
            {light ? `@${group.slug}` : timeAgo(post.publishedAt, locale)}
            {post.pinned ? ` · 📌 ${t.pinned}` : ""}
          </small>
        </div>
        {light ? (
          <span className="vg-post-dots" aria-hidden="true">
            <Ico name="dots" />
          </span>
        ) : (
          post.access !== "free" && <span className={`vg-badge ${post.access}`}>{post.access === "vip" ? "💎 VIP" : "💰"}</span>
        )}
      </div>
      {post.caption && <p className="vg-post-text">{post.caption}</p>}
      {post.media.length > 0 &&
        (post.locked ? (
          <button className="vg-locked" onClick={() => buy && onBuy(buy)} disabled={!buy}>
            {post.media[0].preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="vg-blur" src={post.media[0].preview} alt="" />
            ) : (
              <span className="vg-blur vg-blur-empty" />
            )}
            <span className="vg-locked-inner">
              <span className="vg-lock-ico">{light ? <Ico name="lock" /> : "🔒"}</span>
              {!light && <b>{post.access === "paid" ? t.paidContent : t.vipContent}</b>}
              {light ? (
                <small className="vg-lock-counts">
                  {post.counts.images > 0 && (
                    <span>
                      <Ico name="image" /> {post.counts.images}
                    </span>
                  )}
                  {post.counts.videos > 0 && (
                    <span>
                      <Ico name="video" /> {post.counts.videos}
                    </span>
                  )}
                </small>
              ) : (
                counts && <small>{counts}</small>
              )}
              {buy && !light && (
                <span className="vg-locked-cta">
                  {(post.access === "paid" ? t.unlockFor : t.subscribeToSee).replace("{p}", money(buy.price, buy.currency))}
                </span>
              )}
            </span>
          </button>
        ) : (
          <div className="vg-media-wrap">
            <div className="vg-media-track" ref={scroller} onScroll={many ? onScroll : undefined}>
              {post.media.map((m, i) =>
                m.kind === "video" ? (
                  <PlayVideo key={i} src={m.url!} />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={m.url!} alt="" loading="lazy" onClick={() => onOpen(i)} onContextMenu={(e) => e.preventDefault()} />
                ),
              )}
            </div>
            {many && (
              <>
                <span className="vg-media-count">
                  {idx + 1}/{post.media.length}
                </span>
                <div className="vg-dots" aria-hidden="true">
                  {post.media.map((_, i) => (
                    <span key={i} className={i === idx ? "on" : ""} />
                  ))}
                </div>
              </>
            )}
          </div>
        ))}
      {light && (
        <div className="vg-post-actions">
          <button className={liked ? "on" : ""} aria-label={t.like} aria-pressed={liked} onClick={() => setLiked(!liked)}>
            <Ico name="heart" />
          </button>
          <button aria-label={t.payTitle} onClick={() => post.locked && buy && onBuy(buy)}>
            <Ico name="comment" />
          </button>
          <button className={`end ${saved ? "on" : ""}`} aria-label={t.save} aria-pressed={saved} onClick={() => setSaved(!saved)}>
            <Ico name="bookmark" />
          </button>
        </div>
      )}
    </article>
  );
}

/** vídeo sem a barra de controles: só o play no meio; tocar no vídeo pausa e continua */
function PlayVideo({ src, autoPlay = false }: { src: string; autoPlay?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => undefined);
    else v.pause();
  };
  return (
    <div className="vg-play">
      <video
        ref={ref}
        // #t=0.1: o celular mostra o primeiro quadro em vez de um retângulo preto
        src={`${src}#t=0.1`}
        autoPlay={autoPlay}
        playsInline
        preload="metadata"
        disablePictureInPicture
        onClick={toggle}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onContextMenu={(e) => e.preventDefault()}
      />
      {!playing && (
        <button className="vg-play-btn" onClick={toggle} aria-label="Play">
          <Ico name="play" />
        </button>
      )}
    </div>
  );
}

/** folha do pagamento: gera o PIX (ou pede os dados que o gateway exige) e acompanha até liberar */
function PaySheet({
  slug,
  token,
  product,
  model,
  t,
  payments,
  sandbox,
  bought,
  onPayment,
  onRefresh,
  onClose,
}: {
  slug: string;
  token: string;
  product: Product;
  model: string;
  t: VipTexts;
  payments: PublicPaymentInfo[];
  sandbox: boolean;
  bought: boolean;
  onPayment: (p: PublicPaymentInfo) => void;
  onRefresh: () => Promise<void>;
  onClose: () => void;
}) {
  const { money } = useChatI18n();
  const [needPayer, setNeedPayer] = useState(!!product.payerForm);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  // pagamento deste produto: o mais recente (aprovado/pendente/recusado)
  const latest = useMemo(() => payments.find((p) => p.productId === product.id), [payments, product.id]);
  const payment = latest && latest.status !== "FAILED" ? latest : undefined;
  const failed = latest?.status === "FAILED";

  const checkout = useCallback(
    async (payer?: PayerData) => {
      setError(null);
      try {
        const r = await post<{ payment: PublicPaymentInfo }>(`/api/public/vip/${slug}/checkout`, { token, productId: product.id, ...(payer ? { payer } : {}) });
        onPayment(r.payment);
        setNeedPayer(false);
      } catch (e) {
        if (e instanceof ApiError && (e.data.code === "payer_required" || e.data.code === "invalid_fields" || e.data.code === "method_required")) {
          setNeedPayer(true);
          if (payer) throw e; // o formulário marca os campos recusados
          return;
        }
        if (payer) throw e;
        setError(e instanceof Error ? e.message : "Erro");
      }
    },
    [slug, token, product.id, onPayment],
  );

  // abre e já gera (como o PIX do chat), a menos que precise dos dados do comprador
  useEffect(() => {
    if (started.current || bought || payment || product.payerForm) return;
    started.current = true;
    void checkout();
  }, [bought, payment, product.payerForm, checkout]);

  // aprovado: mostra "Liberado ✓" e fecha
  useEffect(() => {
    if (!bought) return;
    const id = setTimeout(onClose, 1600);
    return () => clearTimeout(id);
  }, [bought, onClose]);

  const simulate = sandbox
    ? async (paymentId: string, status: "APPROVED" | "FAILED") => {
        await post(`/api/public/vip/${slug}/sandbox`, { token, paymentId, status }).catch(() => undefined);
        await onRefresh();
      }
    : undefined;

  return (
    <div className="vg-sheet-wrap" role="dialog" aria-label={t.payTitle} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="vg-sheet">
        <button className="vg-sheet-x" onClick={onClose} aria-label={t.close}>
          ✕
        </button>
        <div className="vg-sheet-title">🔓 {product.name}</div>
        <div className="vg-sheet-price">
          {product.originalPrice && product.originalPrice > product.price ? <s>{money(product.originalPrice, product.currency)}</s> : null}{" "}
          <b>{money(product.price, product.currency)}</b>
        </div>
        {bought ? (
          <div className="vg-sheet-ok">{t.unlocked}</div>
        ) : (
          <PixPayBody
            character={{ name: model, avatarUrl: null, description: null, status: "", showOnline: false }}
            payment={failed ? latest : payment && (payment.status === "PENDING" || payment.status === "CREATED") ? payment : undefined}
            error={error}
            doneStep={t.doneStep}
            payerForm={
              needPayer && !payment
                ? {
                    loadMethods: () => post<PayMethods | { methods: null }>(`/api/public/vip/${slug}/methods`, { token, productId: product.id }).then((r) => (r.methods ? (r as PayMethods) : null)),
                    initial: null,
                    onSubmit: (payer) => checkout(payer),
                  }
                : undefined
            }
            onSimulate={simulate}
          />
        )}
        {failed && !bought && (
          <button className="vg-cta" style={{ marginTop: 12 }} onClick={() => void checkout()}>
            {t.retry}
          </button>
        )}
      </div>
    </div>
  );
}

/** foto/vídeo em tela cheia, com anterior/próximo */
function Viewer({ items, start, t, onClose }: { items: { kind: string; url: string }[]; start: number; t: VipTexts; onClose: () => void }) {
  const [i, setI] = useState(Math.min(start, items.length - 1));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setI((v) => Math.min(items.length - 1, v + 1));
      if (e.key === "ArrowLeft") setI((v) => Math.max(0, v - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items.length, onClose]);
  const m = items[i];
  if (!m) return null;
  return (
    <div className="vg-viewer" role="dialog" aria-label={t.tabMedia} onContextMenu={(e) => e.preventDefault()}>
      <button className="vg-viewer-x" onClick={onClose} aria-label={t.close}>
        ✕
      </button>
      {m.kind === "video" ? (
        <PlayVideo key={m.url} src={m.url} autoPlay />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={m.url} src={m.url} alt="" />
      )}
      {i > 0 && (
        <button className="vg-viewer-nav prev" onClick={() => setI(i - 1)} aria-label="‹">
          ‹
        </button>
      )}
      {i < items.length - 1 && (
        <button className="vg-viewer-nav next" onClick={() => setI(i + 1)} aria-label="›">
          ›
        </button>
      )}
      <span className="vg-viewer-count">
        {i + 1}/{items.length}
      </span>
    </div>
  );
}
