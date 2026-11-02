// Link da chamada (sem chat): a chamada toca, o visitante atende e cai direto no vídeo (já liberado).
// Os upsells marcados no editor aparecem nos mesmos momentos da chamada do chat e são pagos aqui mesmo.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChatI18n } from "@/features/i18n/chat";
import { ApiError, type CallVideo, type ChatTransport, type PublicPaymentInfo } from "@/features/chat-engine/transport";
import { CallScreen, IncomingCall } from "@/components/chat/VideoCall";
import type { PublicCharacter } from "@/types/flow";
import { withBase } from "@/lib/paths";

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

const TEXTS = {
  pt: { declined: "Chamada recusada", again: "Ligar de novo", answerNow: "Atender agora", connecting: "Conectando...", error: "Não foi possível abrir a chamada. Toque para tentar de novo." },
  es: { declined: "Llamada rechazada", again: "Volver a llamar", answerNow: "Contestar ahora", connecting: "Conectando...", error: "No se pudo abrir la llamada. Toca para intentar de nuevo." },
};

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

type Phase = "ringing" | "active" | "ended" | "declined";

export function CallLinkPage({ slug, character, sandbox, startAtVip }: { slug: string; character: PublicCharacter; sandbox: boolean; startAtVip: boolean }) {
  const { locale, t } = useChatI18n();
  const tx = TEXTS[locale === "pt-BR" ? "pt" : "es"];
  const key = `hs_call_${slug}`;
  const token = useRef<string | null>(null);
  const [nodeId, setNodeId] = useState("");
  const [video, setVideo] = useState<CallVideo | null | undefined>(undefined);
  const [payments, setPayments] = useState<Record<string, PublicPaymentInfo>>({});
  const [phase, setPhase] = useState<Phase>("ringing");
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(0);
  const [seconds, setSeconds] = useState(0);

  const load = useCallback(
    async (withVideo: boolean) => {
      const params = new URLSearchParams(window.location.search);
      const utm: Record<string, string> = {};
      for (const k of UTM_KEYS) if (params.get(k)) utm[k] = params.get(k)!;
      if (!token.current) {
        try {
          token.current = localStorage.getItem(key);
        } catch {
          /* navegação privada */
        }
      }
      try {
        const r = await post<{ token: string; nodeId: string; video?: CallVideo | null; payments: PublicPaymentInfo[] }>(`/api/public/call-link/${slug}`, {
          token: token.current,
          withVideo,
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
        setNodeId(r.nodeId);
        if (withVideo) setVideo(r.video ?? null);
        setPayments(Object.fromEntries(r.payments.map((p) => [p.id, p])));
        setLoadError(false);
      } catch {
        if (withVideo) setLoadError(true);
      }
    },
    [key, slug],
  );

  useEffect(() => void load(true), [load]);

  // PIX de upsell pendente: confere a cada 4s (só com a página visível)
  const pending = Object.values(payments).some((p) => p.status === "PENDING" || p.status === "CREATED");
  useEffect(() => {
    if (!pending) return;
    const iv = setInterval(() => !document.hidden && void load(false), 4000);
    return () => clearInterval(iv);
  }, [pending, load]);

  // a tela da chamada pede o vídeo pelo "transporte" do chat: aqui ele já veio junto com a página
  const transport = useMemo(() => ({ callVideo: async () => video ?? null }) as unknown as ChatTransport, [video]);

  const buy = async (productId: string) => {
    setError(null);
    try {
      const r = await post<{ payment: PublicPaymentInfo }>(`/api/public/call-link/${slug}/checkout`, { token: token.current, productId });
      setPayments((all) => ({ ...all, [r.payment.id]: r.payment }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    }
  };
  const simulate = sandbox
    ? async (paymentId: string, status: "APPROVED" | "FAILED") => {
        const r = await post<{ payment: PublicPaymentInfo | null }>(`/api/public/call-link/${slug}/sandbox`, { token: token.current, paymentId, status }).catch(() => null);
        if (r?.payment) setPayments((all) => ({ ...all, [r.payment!.id]: r.payment! }));
      }
    : undefined;

  const answer = () => {
    started.current = Date.now();
    setPhase("active");
  };
  const hangUp = () => {
    setSeconds(Math.max(0, Math.round((Date.now() - started.current) / 1000)));
    setPhase("ended");
  };

  let screen;
  if (phase === "ringing") screen = <IncomingCall character={character} onAccept={answer} onDecline={() => setPhase("declined")} />;
  else if (phase === "active" && video !== undefined && nodeId)
    screen = (
      <CallScreen
        nodeId={nodeId}
        character={character}
        transport={transport}
        payments={payments}
        mainProduct={undefined}
        error={error}
        onHangUp={hangUp}
        onBuyUpsell={(pid) => void buy(pid)}
        onSimulate={simulate}
        alreadyPaid
        startAtVip={startAtVip}
      />
    );
  else {
    const status =
      phase === "ended"
        ? `${t.callEnded} · ${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`
        : phase === "declined"
          ? tx.declined
          : loadError
            ? tx.error
            : tx.connecting;
    screen = (
      <div className="call-overlay cl-end" role="dialog" aria-label={status} onClick={() => loadError && void load(true)}>
        {character.avatarUrl && <div className="call-bg" style={{ backgroundImage: `url(${JSON.stringify(character.avatarUrl)})` }} />}
        <div className="call-top">
          <div className="call-kind">{t.videoCall}</div>
          <div className="call-avatar-wrap">
            {character.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="call-avatar" src={character.avatarUrl} alt="" />
            ) : (
              <div className="call-avatar">{character.name.slice(0, 1)}</div>
            )}
          </div>
          <div className="call-name">{character.name}</div>
          <div className="call-status">{status}</div>
        </div>
        {(phase === "ended" || phase === "declined") && (
          <div className="cl-again">
            <button className="btn btn-primary cta-glow" onClick={answer}>
              {phase === "ended" ? tx.again : tx.answerNow}
            </button>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="cl-page">
      <div className="cl-frame">{screen}</div>
    </div>
  );
}
