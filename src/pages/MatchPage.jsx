// src/pages/MatchPage.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../supabaseClient";
import TeamBadge from "../components/TeamBadge";

const STATUS_LABEL = {
  scheduled: "Agendado",
  ongoing: "Em andamento",
  paused: "Pausado",
  finished: "Encerrado",
};

const STAGE_LABEL = {
  grupos: "Fase de grupos",
  oitavas: "Oitavas",
  quartas: "Quartas",
  semi: "Semifinal",
  final: "Final",
  "3lugar": "3º lugar",
};

// Storage
const LOGO_BUCKET = "team-logos";

// ---- Helpers: logos (bucket → URL pública) ----
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

// ---- Datas em Campinas/SP ----
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

function prettyStage(stage) {
  if (!stage) return "";
  return STAGE_LABEL[stage] || (stage[0]?.toUpperCase() + stage.slice(1));
}

function formatMetaLine({ order_idx, stage, group_name }) {
  // Padrão central: "Jogo x • Grupo G" (+ fase discreta no chip)
  const parts = [];
  if (order_idx) parts.push(`Jogo ${order_idx}`);
  if (group_name) parts.push(`Grupo ${group_name}`);
  return parts.join(" • ");
}

// ---- Cronômetro simples (baseado em starts_at/updated_at) ----
function formatGameTime(match, currentTimestamp) {
  if (!match || match.status === "scheduled" || match.status === "finished") {
    return "0:00";
  }

  const startTime = match.starts_at ? new Date(match.starts_at) : null;
  const currentTime =
    match.status === "paused"
      ? new Date(match.updated_at || Date.now())
      : new Date(currentTimestamp || Date.now());

  if (!startTime) return "0:00";

  const diffMs = currentTime - startTime;
  if (diffMs < 0) return "0:00";

  const totalSeconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

// ---- Barra animada topo do card quando ao vivo/pausado ----
function LiveProgressBar({ status }) {
  if (status !== "ongoing" && status !== "paused") return null;

  const isOngoing = status === "ongoing";
  const barColor = isOngoing ? "bg-blue-500" : "bg-orange-500";
  const bgColor = isOngoing ? "bg-blue-100" : "bg-orange-100";

  return (
    <div className={`absolute top-0 left-0 right-0 h-1 ${bgColor} overflow-hidden rounded-t-2xl`}>
      <div
        className={`h-full ${barColor}`}
        style={{
          animation: isOngoing ? "slideProgress 3s ease-in-out infinite" : "none",
          width: "100%",
        }}
      />
    </div>
  );
}

// ---- Chip de status + relógio ----
function StatusPill({ status, meta, starts_at, updated_at, currentTimestamp }) {
  const base =
    "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold tracking-wide border";
  const style =
    status === "ongoing"
      ? "bg-green-50 text-green-700 border-green-200"
      : status === "paused"
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : status === "finished"
      ? "bg-gray-100 text-gray-700 border-gray-200"
      : "bg-blue-50 text-blue-700 border-blue-200";

  const clock = meta?.clock || meta?.time || meta?.minute;
  const isLive = status === "ongoing" || status === "paused";

  const suffix =
    status === "scheduled"
      ? starts_at
        ? ` • ${fmtDate(starts_at)}`
        : ""
      : status === "finished"
      ? updated_at
        ? ` • ${fmtDate(updated_at)}`
        : ""
      : clock
      ? ` • ${clock}`
      : "";

  return (
    <div className="flex items-center gap-2">
      <span className={`${base} ${style}`}>
        {STATUS_LABEL[status] || status}
        {suffix ? <span>{suffix}</span> : null}
      </span>
      {isLive && (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-600">
          🕐 {formatGameTime({ status, starts_at, updated_at }, currentTimestamp)}
        </span>
      )}
    </div>
  );
}

// ---- Chip de fase ----
function StagePill({ stage }) {
  if (!stage) return null;
  const label = prettyStage(stage);
  return (
    <span className="inline-flex items-center rounded-full border border-gray-300 bg-white px-2 py-0.5 text-[10px] font-semibold tracking-wide text-gray-700">
      {label}
    </span>
  );
}

// ---- Lado do time (badge + link nome) ----
function TeamSide({ team, align = "left", badgeSize = 48 }) {
  const hasTeam = Boolean(team?.id);
  const content = (
    <>
      {align === "right" ? null : <TeamBadge team={team || { name: "A definir" }} size={badgeSize} />}
      <span
        className={`block truncate text-base sm:text-lg font-semibold ${
          hasTeam ? "text-gray-900" : "text-gray-400"
        } ${align === "right" ? "text-right" : ""}`}
        title={team?.name || "A definir"}
      >
        {team?.name || "A definir"}
      </span>
      {align === "right" ? <TeamBadge team={team || { name: "A definir" }} size={badgeSize} /> : null}
    </>
  );

  if (!hasTeam) {
    return (
      <div
        className={`min-w-0 flex items-center gap-3 ${align === "right" ? "justify-end" : ""}`}
      >
        {content}
      </div>
    );
  }

  return (
    <Link
      to={`/team/${team.id}`}
      className={`min-w-0 flex items-center gap-3 hover:underline ${align === "right" ? "justify-end" : ""}`}
      onClick={(e) => e.stopPropagation()}
      title={team?.name}
    >
      {content}
    </Link>
  );
}

// ---- Cartão de elenco ----
function RosterCard({ title, players }) {
  return (
    <div className="bg-white border rounded-2xl p-4 shadow-sm">
      <h3 className="font-semibold mb-2">{title}</h3>
      {players.length === 0 ? (
        <p className="text-sm text-gray-500">Nenhum jogador cadastrado.</p>
      ) : (
        <ul className="text-sm divide-y">
          {players.map((p) => (
            <li key={p.id} className="flex items-center justify-between py-1.5">
              <span className="truncate">{p.name}</span>
              <span className="inline-block w-8 text-right tabular-nums text-gray-500">
                {p.number ?? ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function MatchPage() {
  const { id } = useParams();
  const [match, setMatch] = useState(null);
  const [homePlayers, setHomePlayers] = useState([]);
  const [awayPlayers, setAwayPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentTimestamp, setCurrentTimestamp] = useState(Date.now());
  const channelRef = useRef(null);
  const timerRef = useRef(null);
  const loadingRef = useRef(false);

  const isVolei = useMemo(
    () => (match?.sport?.name || "").toLowerCase().includes("volei"),
    [match?.sport?.name]
  );

  const load = useCallback(async () => {
    if (!id || loadingRef.current) return;

    loadingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      // 1) Tenta pela view agregada (inclui order_idx para exibirmos "Jogo x")
      const { data: viewData, error: viewError } = await supabase
        .from("match_detail_view")
        .select(
          `
          id, sport_id, sport_name, stage, round, group_name, starts_at, venue, status,
          home_team_id, home_team_name, home_team_color, home_team_logo,
          away_team_id, away_team_name, away_team_color, away_team_logo,
          home_score, away_score, order_idx, created_at, updated_at
        `
        )
        .eq("id", id)
        .maybeSingle();

      let m = null;

      if (!viewError && viewData) {
        m = {
          id: viewData.id,
          sport: { id: viewData.sport_id, name: viewData.sport_name },
          stage: viewData.stage,
          round: viewData.round,
          group_name: viewData.group_name,
          starts_at: viewData.starts_at,
          updated_at: viewData.updated_at,
          venue: viewData.venue,
          status: viewData.status,
          order_idx: viewData.order_idx,
          meta: null,
          home_score: viewData.home_score,
          away_score: viewData.away_score,
          home: {
            id: viewData.home_team_id,
            name: viewData.home_team_name,
            color: viewData.home_team_color,
            logo_url: (() => {
              const url = publicLogoUrl(viewData.home_team_logo);
              return url ? `${url}${url.includes("?") ? "&" : "?"}v=1` : null;
            })(),
          },
          away: {
            id: viewData.away_team_id,
            name: viewData.away_team_name,
            color: viewData.away_team_color,
            logo_url: (() => {
              const url = publicLogoUrl(viewData.away_team_logo);
              return url ? `${url}${url.includes("?") ? "&" : "?"}v=1` : null;
            })(),
          },
        };

        // Pega meta (clock/sets) direto de matches
        const { data: rawMatch } = await supabase
          .from("matches")
          .select("meta")
          .eq("id", id)
          .maybeSingle();
        if (rawMatch?.meta) m.meta = rawMatch.meta;
      } else {
        // 2) Fallback: join direto em matches (inclui order_idx)
        const { data: joinData, error: joinError } = await supabase
          .from("matches")
          .select(
            `
            id,
            sport:sport_id ( id, name ),
            stage, round, group_name, starts_at, updated_at, venue, status, meta, order_idx,
            home_score, away_score,
            home:home_team_id ( id, name, logo_url, color ),
            away:away_team_id ( id, name, logo_url, color )
          `
          )
          .eq("id", id)
          .maybeSingle();

        if (joinError) throw joinError;

        if (joinData) {
          m = {
            ...joinData,
            home:
              joinData.home && typeof joinData.home === "object"
                ? {
                    ...joinData.home,
                    logo_url: (() => {
                      const url = publicLogoUrl(joinData.home.logo_url);
                      return url ? `${url}${url.includes("?") ? "&" : "?"}v=1` : null;
                    })(),
                  }
                : joinData.home,
            away:
              joinData.away && typeof joinData.away === "object"
                ? {
                    ...joinData.away,
                    logo_url: (() => {
                      const url = publicLogoUrl(joinData.away.logo_url);
                      return url ? `${url}${url.includes("?") ? "&" : "?"}v=1` : null;
                    })(),
                  }
                : joinData.away,
          };
        }
      }

      if (!m) throw new Error("Partida não encontrada");
      setMatch(m);

      // 3) Elencos (se existirem times)
      const playerPromises = [];
      if (m?.home?.id) {
        playerPromises.push(
          supabase
            .from("players")
            .select("id, name, number")
            .eq("team_id", m.home.id)
            .order("number", { ascending: true, nullsFirst: true })
            .order("name")
        );
      } else {
        playerPromises.push(Promise.resolve({ data: [] }));
      }

      if (m?.away?.id) {
        playerPromises.push(
          supabase
            .from("players")
            .select("id, name, number")
            .eq("team_id", m.away.id)
            .order("number", { ascending: true, nullsFirst: true })
            .order("name")
        );
      } else {
        playerPromises.push(Promise.resolve({ data: [] }));
      }

      const [homeRes, awayRes] = await Promise.all(playerPromises);
      setHomePlayers(homeRes.data || []);
      setAwayPlayers(awayRes.data || []);
    } catch (err) {
      console.error("Error loading match:", err);
      setError(err.message || "Erro ao carregar partida");
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;

    load();

    // Tick de relógio por segundo (🕐)
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCurrentTimestamp(Date.now());
    }, 1000);

    // Realtime: match + eventos
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase
      .channel(`match-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matches", filter: `id=eq.${id}` },
        () => load()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "match_events", filter: `match_id=eq.${id}` },
        () => load()
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [id, load]);

  const metaCenter = useMemo(
    () => (match ? formatMetaLine(match) : ""),
    [match]
  );

  const home = match?.home;
  const away = match?.away;

  // Sets (Vôlei): mostra sempre em Vôlei, ou quando existir valor salvo.
  const homeSets = Number(match?.meta?.home_sets ?? 0);
  const awaySets = Number(match?.meta?.away_sets ?? 0);
  const hasAnySetValue = homeSets > 0 || awaySets > 0;
  const shouldShowSets = isVolei || hasAnySetValue;

  // Placar somente quando != scheduled
  const shouldShowScore = match?.status && match.status !== "scheduled";
  const homeScore = Number(match?.home_score ?? 0);
  const awayScore = Number(match?.away_score ?? 0);

  const isLive = match?.status === "ongoing" || match?.status === "paused";

  // ---- Renderização ----
  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-4xl mb-4">⚠️</div>
        <p className="text-lg text-red-600 mb-2">Erro ao carregar partida</p>
        <p className="text-sm text-gray-500 mb-4">{error}</p>
        <button
          onClick={() => {
            setError(null);
            load();
          }}
          className="bg-blue-600 text-white px-4 py-2 rounded-xl hover:bg-blue-700"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  if (loading || !match) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-44 bg-gray-100 rounded animate-pulse" />
        <div className="h-36 w-full bg-gray-100 rounded-2xl animate-pulse" />
        <div className="grid md:grid-cols-2 gap-4">
          <div className="h-56 bg-gray-100 rounded-2xl animate-pulse" />
          <div className="h-56 bg-gray-100 rounded-2xl animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho (status + fase/chips) */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill
            status={match.status}
            meta={match.meta}
            starts_at={match.starts_at}
            updated_at={match.updated_at}
            currentTimestamp={currentTimestamp}
          />
          {match.stage ? <StagePill stage={match.stage} /> : null}
          {metaCenter && (
            <div className="text-xs text-gray-600" aria-label="Detalhes">
              {metaCenter}
            </div>
          )}
        </div>
        <div className="text-xs text-gray-500">
          {match.starts_at ? fmtDate(match.starts_at) : null}
          {match.venue ? <span className="ml-2">{match.venue}</span> : null}
        </div>
      </div>

      {/* Placar / Sets — Card hero */}
      <div
        className={`relative overflow-hidden rounded-2xl border p-4 sm:p-5 shadow-sm ${
          isLive ? (match.status === "ongoing" ? "border-blue-200" : "border-amber-200") : "border-gray-200"
        }`}
      >
        <LiveProgressBar status={match.status} />

        {/* background decorativo leve */}
        <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-gradient-to-br from-blue-50 to-indigo-50 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-gradient-to-tr from-pink-50 to-rose-50 blur-3xl" />

        <div className="relative grid grid-cols-1 items-center gap-4 sm:grid-cols-3">
          {/* Home */}
          <div className="min-w-0">
            <TeamSide team={home} badgeSize={56} />
          </div>

          {/* Centro: sets + placar + info live */}
          <div className="text-center">
            {shouldShowSets ? (
              <div className="mb-1 flex items-center justify-center gap-2">
                <span className="inline-flex items-center rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-gray-700">
                  Sets <span className="ml-1 tabular-nums">{homeSets}</span>
                  <span className="mx-1 text-gray-400">x</span>
                  <span className="tabular-nums">{awaySets}</span>
                </span>
              </div>
            ) : null}

            {shouldShowScore ? (
              <div className="text-4xl font-extrabold tabular-nums leading-none sm:text-5xl">
                {homeScore} <span className="text-gray-400">x</span> {awayScore}
              </div>
            ) : (
              <div className="text-sm text-gray-400">—</div>
            )}

            <div className="mt-1 text-[11px] text-gray-500">
              {STATUS_LABEL[match.status] || match.status}
              {isLive ? (
                <span className="ml-2">🕐 {formatGameTime(match, currentTimestamp)}</span>
              ) : null}
              {match.meta?.clock ? <span className="ml-2">{match.meta.clock}</span> : null}
            </div>
          </div>

          {/* Away */}
          <div className="min-w-0 sm:text-right">
            <TeamSide team={away} align="right" badgeSize={56} />
          </div>
        </div>

        {/* Nota explicativa para Vôlei */}
        {isVolei ? (
          <div className="relative mt-3 text-[11px] text-gray-500">
            Vôlei: partidas em <strong>um set de 15 pontos</strong> (2 pontos de vantagem para vencer).
          </div>
        ) : null}
      </div>

      {/* Detalhes resumidos */}
      <div className="bg-white border rounded-2xl p-4 shadow-sm">
        <div className="text-[11px] font-semibold text-gray-500 mb-2">Detalhes</div>
        <ul className="text-sm grid sm:grid-cols-2 gap-x-6 gap-y-1">
          <li>
            <span className="text-gray-500">Modalidade:</span>{" "}
            <span className="font-medium">{match?.sport?.name || "—"}</span>
          </li>
          <li>
            <span className="text-gray-500">Fase:</span>{" "}
            <span className="font-medium">{prettyStage(match.stage) || "—"}</span>
          </li>
          <li>
            <span className="text-gray-500">Grupo:</span>{" "}
            <span className="font-medium">{match.group_name || "—"}</span>
          </li>
          <li>
            <span className="text-gray-500">Jogo nº:</span>{" "}
            <span className="font-medium">{match.order_idx ?? "—"}</span>
          </li>
          <li>
            <span className="text-gray-500">Início:</span>{" "}
            <span className="font-medium">{match.starts_at ? fmtDate(match.starts_at) : "—"}</span>
          </li>
          <li>
            <span className="text-gray-500">Local:</span>{" "}
            <span className="font-medium">{match.venue || "—"}</span>
          </li>
          {match.updated_at && (
            <li className="sm:col-span-2">
              <span className="text-gray-500">Última atualização:</span>{" "}
              <span className="font-medium">{fmtDate(match.updated_at)}</span>
            </li>
          )}
        </ul>
      </div>

      {/* Elencos lado a lado */}
      <div className="grid md:grid-cols-2 gap-4">
        <RosterCard title={`Convocação — ${home?.name || "A definir"}`} players={homePlayers} />
        <RosterCard title={`Convocação — ${away?.name || "A definir"}`} players={awayPlayers} />
      </div>

      {/* Rodapé curto */}
      <div className="text-xs text-gray-500">
        {match.status === "finished" && match.updated_at ? `Encerrado em ${fmtDate(match.updated_at)}` : null}
      </div>

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
