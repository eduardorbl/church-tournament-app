// src/pages/Home.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabaseClient";
import TeamBadge from "../components/TeamBadge";
import {
  Trophy,
  Megaphone,
  PlayCircle,
  ChevronsRight,
  RefreshCw,
  ChevronRight,
} from "lucide-react";

/**
 * Home unificada do evento:
 * - Para cada esporte (Vôlei, Futsal, Pebolim, FIFA):
 *   (1) "Ao vivo" (se houver), com placar/sets e link para a MatchPage
 *   (2) Fila com dois cartões fixos: ⚠️ Próxima e Jogo seguinte (com badges e links)
 *   (3) (opcional) lista compacta de agendados
 *
 * Banco esperado:
 * - View public.v_queue_slots (slots: 'live', 'call', 'next' por esporte)
 * - Tabela matches com order_idx definido para a fila sequencial
 * - Events/placares atualizados em match_events → atualizarão home via realtime
 */

const SPORT_LIST = [
  { name: "Volei",  label: "Vôlei",   key: "volei",   callText: "⚠️ Compareçam à quadra de Vôlei:" },
  { name: "Futsal", label: "Futsal",  key: "futsal",  callText: "⚠️ Compareçam à quadra de Futsal:" },
  { name: "Pebolim",label: "Pebolim", key: "pebolim", callText: "⚠️ Compareçam à mesa de pebolim:" },
  { name: "FIFA",   label: "FIFA",    key: "fifa",    callText: "⚠️ Compareçam à área do console:" },
];

const STAGE_LABEL = {
  r32: "PRÉ-OITAVAS",
  grupos: "GRUPOS",
  oitavas: "OITAVAS",
  quartas: "QUARTAS",
  semi: "SEMI",
  final: "FINAL",
  "3lugar": "3º LUGAR",
};
function toStageLabel(stage) {
  if (!stage) return null;
  return STAGE_LABEL[stage] || String(stage).toUpperCase();
}

// Storage: logos dos times
const LOGO_BUCKET = "team-logos";
function isHttpUrl(str) {
  return typeof str === "string" && /^https?:\/\//i.test(str);
}
function isStoragePath(str) {
  return typeof str === "string" && !isHttpUrl(str) && str.trim() !== "";
}
function publicLogoUrl(raw) {
  if (!raw) return null;
  if (isHttpUrl(raw)) return raw;
  if (isStoragePath(raw)) {
    const { data } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(raw);
    return data?.publicUrl || null;
  }
  return null;
}

// Helpers de tempo para “Ao vivo”
const tz = "America/Sao_Paulo";
function fmtDate(dt) {
  if (!dt) return "";
  try {
    return new Date(dt).toLocaleString("pt-BR", {
      timeZone: tz,
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dt;
  }
}
function formatGameTime(match, currentTimestamp) {
  if (!match || match.status === "scheduled" || match.status === "finished") {
    return "0:00";
  }
  const startTime = new Date(match.starts_at);
  const currentTime =
    match.status === "paused"
      ? new Date(match.updated_at)
      : new Date(currentTimestamp || Date.now());
  const diffMs = currentTime - startTime;
  if (diffMs < 0) return "0:00";
  const totalSeconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
function getVoleiSets(match, side) {
  const meta = match?.meta || {};
  const key = side === "home" ? "home_sets" : "away_sets";
  return Math.max(0, Number(meta[key] || 0));
}

function LiveProgressBar({ status }) {
  if (status !== "ongoing" && status !== "paused") return null;
  const isOngoing = status === "ongoing";
  const barColor = isOngoing ? "bg-blue-500" : "bg-orange-500";
  const bgColor = isOngoing ? "bg-blue-100" : "bg-orange-100";
  return (
    <div className={`absolute top-0 left-0 right-0 h-1 ${bgColor} overflow-hidden rounded-t-lg`}>
      <div
        className={`h-full ${barColor}`}
        style={{ animation: isOngoing ? "slideProgress 3s ease-in-out infinite" : "none", width: "100%" }}
      />
    </div>
  );
}

export default function Home() {
  const [blocks, setBlocks] = useState({});
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState(null);
  const [now, setNow] = useState(Date.now());
  const mountedRef = useRef(true);
  const reloadingRef = useRef(false);

  const load = async () => {
    if (reloadingRef.current) return;
    reloadingRef.current = true;
    setLoading(true);
    setFlash(null);

    try {
      // 1) Esportes existentes
      const { data: sportsRows, error: sportsErr } = await supabase
        .from("sports")
        .select("id,name");
      if (sportsErr) throw sportsErr;

      const byName = new Map((sportsRows || []).map((s) => [s.name, s.id]));
      const active = SPORT_LIST.filter((s) => byName.has(s.name)).map((s) => ({
        ...s,
        sportId: byName.get(s.name),
      }));

      // 2) Para cada esporte, obter slots na fila e “hidratar” com matches + teams
      const results = await Promise.all(
        active.map(async (sp) => {
          // slots live/call/next
          const { data: slots, error: slotsErr } = await supabase
            .from("v_queue_slots")
            .select("slot, order_idx, match_id, stage, group_name")
            .eq("sport_id", sp.sportId);
          if (slotsErr) throw slotsErr;

          const bySlot = Object.fromEntries((slots || []).map((r) => [r.slot, r]));
          const ids = (slots || []).map((s) => s.match_id).filter(Boolean);

          // detalhes completos (matches + teams) para slots
          let details = {};
          if (ids.length) {
            const { data: det } = await supabase
              .from("matches")
              .select(`
                id, order_idx, stage, group_name, status, starts_at, updated_at, venue, meta,
                home_score, away_score,
                home:home_team_id ( id, name, logo_url, color ),
                away:away_team_id ( id, name, logo_url, color ),
                sport:sport_id ( id, name )
              `)
              .in("id", ids);

            const normalized = (det || []).map((m) => {
              const home = m.home && typeof m.home === "object"
                ? { ...m.home, logo_url: normalizeLogo(m.home.logo_url) }
                : m.home;
              const away = m.away && typeof m.away === "object"
                ? { ...m.away, logo_url: normalizeLogo(m.away.logo_url) }
                : m.away;
              return { ...m, home, away };
            });
            details = Object.fromEntries(normalized.map((d) => [d.id, d]));
          }

          // --- Fallback: se o slot "live" não veio, tenta pegar jogo ongoing/paused e simular ---
          if (!bySlot?.live?.match_id) {
            const { data: liveCandidates, error: liveErr } = await supabase
              .from("matches")
              .select(`
                id, order_idx, stage, group_name, status, starts_at, updated_at, venue, meta,
                home_score, away_score,
                home:home_team_id ( id, name, logo_url, color ),
                away:away_team_id ( id, name, logo_url, color ),
                sport:sport_id ( id, name )
              `)
              .eq("sport_id", sp.sportId)
              .in("status", ["ongoing","paused"])
              .limit(6);

            if (!liveErr && liveCandidates?.length) {
              // prioriza ongoing > paused; depois, mais recentemente atualizado
              const pick = liveCandidates
                .slice()
                .sort((a, b) => {
                  const pr = (s) => (s === "ongoing" ? 1 : s === "paused" ? 2 : 9);
                  const d = pr(a.status) - pr(b.status);
                  if (d !== 0) return d;
                  return new Date(b.updated_at || b.starts_at || 0) - new Date(a.updated_at || a.starts_at || 0);
                })[0];

              // normaliza logos exatamente como acima
              const normHome = pick.home && typeof pick.home === "object"
                ? { ...pick.home, logo_url: normalizeLogo(pick.home.logo_url) }
                : pick.home;
              const normAway = pick.away && typeof pick.away === "object"
                ? { ...pick.away, logo_url: normalizeLogo(pick.away.logo_url) }
                : pick.away;
              const normalizedPick = { ...pick, home: normHome, away: normAway };

              // injeta nos detalhes e simula o slot "live"
              details[normalizedPick.id] = normalizedPick;
              bySlot.live = {
                slot: "live",
                match_id: normalizedPick.id,
                order_idx: normalizedPick.order_idx,
                stage: normalizedPick.stage,
                group_name: normalizedPick.group_name,
              };
            }
          }

          // 3) Lista compacta extra de agendados (com times) – os 6 próximos
          const ignoreIds = [bySlot.call?.match_id, bySlot.next?.match_id].filter(Boolean);
          const { data: upcoming } = await supabase
            .from("matches")
            .select(`
              id, order_idx, stage, group_name, status,
              home:home_team_id ( id, name, logo_url, color ),
              away:away_team_id ( id, name, logo_url, color )
            `)
            .eq("sport_id", sp.sportId)
            .eq("status", "scheduled")
            .not("order_idx", "is", null)
            .order("order_idx", { ascending: true })
            .limit(10);

          const compactUpcoming = (upcoming || [])
            .filter((u) => !ignoreIds.includes(u.id))
            .slice(0, 6)
            .map((u) => ({
              id: u.id,
              order_idx: u.order_idx,
              stage: u.stage,
              group_name: u.group_name,
              home: u.home ? { ...u.home, logo_url: normalizeLogo(u.home.logo_url) } : null,
              away: u.away ? { ...u.away, logo_url: normalizeLogo(u.away.logo_url) } : null,
            }));

          return [
            sp.key,
            {
              ...sp,
              slots: bySlot,
              details,          // match_id -> match completo (com teams e placar/sets)
              compactUpcoming,  // lista pequena de próximos
            },
          ];
        })
      );

      setBlocks(Object.fromEntries(results));
    } catch (e) {
      setFlash(`Falha ao carregar a Home: ${e.message || e}`);
    } finally {
      setLoading(false);
      reloadingRef.current = false;
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    load();

    // timer p/ clock “Ao vivo”
    const t = setInterval(() => setNow(Date.now()), 1000);

    // realtime: mudanças em matches e match_events → recarrega
    const ch = supabase
      .channel("home-central")
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, () => mountedRef.current && load())
      .on("postgres_changes", { event: "*", schema: "public", table: "match_events" }, () => mountedRef.current && load())
      .subscribe();

    return () => {
      mountedRef.current = false;
      clearInterval(t);
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const orderedKeys = useMemo(
    () => SPORT_LIST.map((s) => s.key).filter((k) => blocks[k]),
    [blocks]
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Trophy className="h-6 w-6 text-blue-600" />
          <h1 className="text-2xl font-bold tracking-tight">Central do Evento</h1>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          title="Recarregar agora"
        >
          <RefreshCw className="h-4 w-4" />
          Atualizar
        </button>
      </div>

      {flash && (
        <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {flash}
        </div>
      )}

      {loading ? (
        <HomeSkeleton />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {orderedKeys.map((key) => (
            <SportBlock key={key} block={blocks[key]} now={now} />
          ))}
        </div>
      )}

      <style jsx global>{`
        @keyframes slideProgress {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(200%); }
          100% { transform: translateX(-100%); }
        }
      `}</style>
    </div>
  );
}

/* ---------------------- COMPONENTES ---------------------- */

function SportBlock({ block, now }) {
  const { label, callText, slots, details, compactUpcoming } = block || {};
  const live = slots?.live?.match_id ? details?.[slots.live.match_id] : null;
  const call = slots?.call?.match_id ? details?.[slots.call.match_id] : null;
  const next = slots?.next?.match_id ? details?.[slots.next.match_id] : null;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold">{label}</span>
        </div>
      </div>

      {/* Ao vivo */}
      <div className="px-4 sm:px-5">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-red-800">
              <PlayCircle className="h-4 w-4" />
              {live ? (
                <Link to={`/match/${live.id}`} className="hover:underline">
                  {live.status === "paused" ? "Pausado" : "Ao vivo"} — Jogo {live.order_idx}
                  {live.group_name ? ` • Grupo ${live.group_name}` : ""}
                </Link>
              ) : (
                <span>Ao vivo</span>
              )}
            </div>
            {live?.stage ? (
              <StagePill stage={live.stage} />
            ) : (
              <span className="text-xs text-red-700/70">Aguardando…</span>
            )}
          </div>

          {live ? (
            <LiveScoreRow match={live} now={now} />
          ) : (
            <div className="text-sm text-gray-600">Nenhuma partida ao vivo no momento.</div>
          )}
        </div>
      </div>

      {/* Fila: Próxima (⚠️) e Seguinte */}
      <div className="px-4 pb-4 sm:px-5 sm:pb-5">
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <QueueCard
            tone="amber"
            icon={<Megaphone className="h-4 w-4" />}
            title="Próxima partida"
            subtitle={callText}
            match={call}
          />
          <QueueCard
            tone="emerald"
            icon={<ChevronsRight className="h-4 w-4" />}
            title="Jogo seguinte"
            subtitle="Na sequência:"
            match={next}
          />
        </div>
      </div>

      {/* Compacto: mais agendados (opcional, aparece só se houver) */}
      {compactUpcoming?.length ? (
        <div className="border-t px-4 py-3 sm:px-5">
          <div className="mb-2 text-sm font-semibold text-gray-800">Agendados (próximos)</div>
          <div className="grid grid-cols-1 gap-2">
          {compactUpcoming.map((u) => (
            <Link
              key={u.id}
              to={`/match/${u.id}`}
              className="flex items-center justify-between rounded-lg border bg-gray-50 px-3 py-2 hover:bg-gray-100"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-gray-900">
                  Jogo {u.order_idx}
                  {u.group_name ? ` • Grupo ${u.group_name}` : ""}
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-gray-700">
                  <TeamWithName team={u.home} size={20} allowLink={false} />
                  <span className="text-gray-400">x</span>
                  <TeamWithName team={u.away} size={20} align="right" allowLink={false} />
                </div>
              </div>
              <div className="ml-3 shrink-0">
                <StagePill stage={u.stage} />
              </div>
            </Link>
          ))}

          </div>
        </div>
      ) : null}
    </div>
  );
}

function StagePill({ stage }) {
  const lbl = toStageLabel(stage);
  if (!lbl) return null;
  return (
    <span className="inline-flex items-center rounded-full border border-gray-300 bg-white px-2 py-0.5 text-[10px] font-semibold tracking-wide text-gray-700">
      {lbl}
    </span>
  );
}

/* ---------- Cards ---------- */

function LiveScoreRow({ match, now }) {
  const isVolei = (match?.sport?.name || "").toLowerCase().includes("vole");
  const showScore = match.status !== "scheduled";
  const homeScore = Number(match?.home_score ?? 0);
  const awayScore = Number(match?.away_score ?? 0);
  const homeSets = isVolei ? getVoleiSets(match, "home") : 0;
  const awaySets = isVolei ? getVoleiSets(match, "away") : 0;

  return (
    <Link to={`/match/${match.id}`} className="block rounded-xl bg-white p-3 shadow-sm hover:bg-gray-50 relative overflow-hidden">
      <LiveProgressBar status={match.status} />

      <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
        <div className="flex items-center gap-2">
          {match.group_name ? <span>Grupo {match.group_name}</span> : <span />}
          {match.venue ? <span className="text-gray-400">• {match.venue}</span> : null}
        </div>
        {(match.status === "ongoing" || match.status === "paused") && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-600">
            🕐 {formatGameTime(match, now)}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <TeamLine team={match.home} align="left" />
        <div className="shrink-0 text-center">
          {isVolei && (
            <div className="text-[11px] font-semibold text-gray-600 tabular-nums">
              {homeSets} <span className="text-gray-400">sets</span> {awaySets}
            </div>
          )}
          {showScore ? (
            <div className="text-xl font-bold tabular-nums">
              {homeScore} <span className="text-gray-400">x</span> {awayScore}
            </div>
          ) : (
            <div className="text-sm text-gray-400">—</div>
          )}
        </div>
        <TeamLine team={match.away} align="right" />
      </div>
    </Link>
  );
}

function QueueCard({ tone, icon, title, subtitle, match }) {
  const toneClasses =
    tone === "amber"
      ? "border-amber-200 bg-amber-50"
      : tone === "emerald"
      ? "border-emerald-200 bg-emerald-50"
      : "border-gray-200 bg-gray-50";

  return (
    <div className={`rounded-xl border ${toneClasses} p-3 sm:p-4`}>
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          {icon}
          <span>{title}</span>
        </div>
        {match?.stage ? <StagePill stage={match.stage} /> : null}
      </div>

      <div className="text-xs text-gray-600">{subtitle}</div>

      <div className="mt-2">
        {match ? (
          <>
            <div className="text-sm font-medium text-gray-900">
              <Link to={`/match/${match.id}`} className="hover:underline">
                Jogo {match.order_idx}
                {match.group_name ? ` • Grupo ${match.group_name}` : ""}
              </Link>
            </div>

            <div className="mt-1 flex items-center justify-between gap-2">
              <TeamWithName team={match.home} />
              <span className="px-1 text-gray-400">x</span>
              <TeamWithName team={match.away} align="right" />
            </div>

            <div className="mt-2 text-[11px] text-gray-500 flex items-center justify-between">
              <span className="truncate">{match.venue || ""}</span>

              {/* 👉 AGORA É LINK CLICÁVEL */}
              <Link
                to={`/match/${match.id}`}
                className="inline-flex items-center gap-1 text-blue-600 hover:underline"
              >
                Ver partida <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </>
        ) : (
          <div className="text-sm text-gray-500">Aguardando…</div>
        )}
      </div>
    </div>
  );
}

/* ---------- Itens com badge e link ---------- */

function TeamWithName({ team, size = 24, align = "left", allowLink = true }) {
  const content = (
    <>
      <TeamBadge team={team || { name: "A definir" }} size={size} />
      <span className={`truncate text-sm ${align === "right" ? "text-right" : ""}`}>
        {team?.name || "A definir"}
      </span>
    </>
  );

  if (!allowLink || !team?.id) {
    return (
      <div className={`min-w-0 flex items-center gap-2 ${align === "right" ? "justify-end" : ""}`}>
        {content}
      </div>
    );
  }

  return (
    <Link
      to={`/team/${team.id}`}
      className={`min-w-0 flex items-center gap-2 ${align === "right" ? "justify-end" : ""} hover:underline`}
      title={team?.name}
      onClick={(e) => e.stopPropagation()}
    >
      {content}
    </Link>
  );
}

function TeamLine({ team, align = "left" }) {
  return (
    <div className={`flex items-center ${align === "right" ? "justify-end" : ""} gap-2 min-w-0 flex-1`}>
      {align !== "right" && <TeamBadge team={team || { name: "A definir" }} size={36} />}
      {team?.id ? (
        <Link
          to={`/team/${team.id}`}
          className={`truncate text-sm font-medium hover:underline ${align === "right" ? "text-right" : "text-left"}`}
          title={team?.name}
          onClick={(e) => e.stopPropagation()}
        >
          {team?.name || "A definir"}
        </Link>
      ) : (
        <span className={`truncate text-sm ${align === "right" ? "text-right text-gray-400" : "text-gray-400"}`}>
          A definir
        </span>
      )}
      {align === "right" && <TeamBadge team={team || { name: "A definir" }} size={36} />}
    </div>
  );
}

/* ---------- Skeleton ---------- */

function HomeSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-3 h-6 w-40 animate-pulse rounded bg-gray-100" />
          <div className="mb-3 h-24 animate-pulse rounded bg-red-100/60" />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="h-20 animate-pulse rounded bg-amber-100/60" />
            <div className="h-20 animate-pulse rounded bg-emerald-100/60" />
          </div>
          <div className="mt-3 h-16 animate-pulse rounded bg-gray-100" />
        </div>
      ))}
    </div>
  );
}

/* ---------- Utils ---------- */
function normalizeLogo(raw) {
  const url = publicLogoUrl(raw);
  return url ? `${url}${url.includes("?") ? "&" : "?"}v=1` : null;
}
