// src/pages/MatchPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
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

// Funções auxiliares para logo
function isHttpUrl(str) {
  return typeof str === "string" && /^https?:\/\//i.test(str);
}
function isStoragePath(str) {
  return typeof str === "string" && !isHttpUrl(str) && str.trim() !== "";
}
function publicLogoUrl(raw) {
  if (!raw) return null;
  if (isHttpUrl(raw)) return raw; // já é pública
  if (isStoragePath(raw)) {
    const { data } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(raw);
    return data?.publicUrl || null;
  }
  return null;
}

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

function formatMetaLine({ stage, group_name, round }) {
  const parts = [];
  if (stage) parts.push(prettyStage(stage));
  if (group_name) parts.push(`Grupo ${group_name}`);
  if (round) parts.push(`Jogo ${round}`);
  return parts.join(" • ");
}

// Formatar tempo em minutos:segundos baseado no tempo decorrido
function formatGameTime(match, currentTimestamp) {
  if (!match || match.status === 'scheduled' || match.status === 'finished') {
    return "0:00";
  }
  
  const startTime = new Date(match.starts_at);
  const currentTime = match.status === 'paused' 
    ? new Date(match.updated_at) 
    : new Date(currentTimestamp || Date.now());
  
  // Calcula diferença em milissegundos
  const diffMs = currentTime - startTime;
  
  // Se a diferença for negativa (jogo ainda não começou), retorna 0:00
  if (diffMs < 0) return "0:00";
  
  // Converte para minutos e segundos
  const totalSeconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// Barra animada para jogos ao vivo/pausados
function LiveProgressBar({ status }) {
  if (status !== "ongoing" && status !== "paused") return null;
  
  const isOngoing = status === "ongoing";
  const barColor = isOngoing ? "bg-blue-500" : "bg-orange-500";
  const bgColor = isOngoing ? "bg-blue-100" : "bg-orange-100";
  
  return (
    <div className={`absolute top-0 left-0 right-0 h-1 ${bgColor} overflow-hidden rounded-t-lg`}>
      <div 
        className={`h-full ${barColor}`}
        style={{
          animation: isOngoing 
            ? 'slideProgress 3s ease-in-out infinite' 
            : 'none',
          width: '100%'
        }}
      />
    </div>
  );
}

function StatusPill({ status, meta, starts_at, updated_at, currentTimestamp }) {
  const base =
    "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium";
  const style =
    status === "ongoing"
      ? "bg-green-100 text-green-700"
      : status === "paused"
      ? "bg-yellow-100 text-yellow-700"
      : status === "finished"
      ? "bg-gray-200 text-gray-700"
      : "bg-blue-100 text-blue-700";
  
  const clock = meta?.clock || meta?.time || meta?.minute;
  const isLive = status === "ongoing" || status === "paused";
  
  const suffix =
    status === "scheduled"
      ? starts_at
        ? `• ${fmtDate(starts_at)}`
        : ""
      : status === "finished"
      ? updated_at
        ? `• ${fmtDate(updated_at)}`
        : ""
      : clock
      ? `• ${clock}`
      : "";
      
  return (
    <div className="flex items-center gap-2">
      <span className={`${base} ${style}`}>
        {STATUS_LABEL[status] || status} {suffix ? <span>{suffix}</span> : null}
      </span>
      {isLive && (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-600">
          🕐 {formatGameTime({ status, starts_at, updated_at }, currentTimestamp)}
        </span>
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
  const [currentTimestamp, setCurrentTimestamp] = useState(Date.now());
  const channelRef = useRef(null);
  const timerRef = useRef(null);

  const isVolei = useMemo(
    () => (match?.sport?.name || "").toLowerCase().includes("vole"),
    [match?.sport?.name]
  );

  const load = async () => {
    setLoading(true);
    try {
      // 1) Tenta pela view agregada
      const { data: viewData, error: viewError } = await supabase
        .from("match_detail_view")
        .select(
          `
          id, sport_id, sport_name, stage, round, group_name, starts_at, venue, status,
          home_team_id, home_team_name, home_team_color, home_team_logo,
          away_team_id, away_team_name, away_team_color, away_team_logo,
          home_score, away_score, created_at, updated_at
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

        // Pega meta (clock/sets) direto da matches
        const { data: rawMatch } = await supabase
          .from("matches")
          .select("meta")
          .eq("id", id)
          .maybeSingle();
        if (rawMatch?.meta) m.meta = rawMatch.meta;
      } else {
        // 2) Fallback: join direto em matches
        const { data: joinData } = await supabase
          .from("matches")
          .select(
            `
            id,
            sport:sport_id ( id, name ),
            stage, round, group_name, starts_at, updated_at, venue, status, meta,
            home_score, away_score,
            home:home_team_id ( id, name, logo_url, color ),
            away:away_team_id ( id, name, logo_url, color )
          `
          )
          .eq("id", id)
          .maybeSingle();

        if (joinData) {
          // Normaliza os logos
          const normalizedMatch = {
            ...joinData,
            home: joinData.home && typeof joinData.home === "object"
              ? {
                  ...joinData.home,
                  logo_url: (() => {
                    const url = publicLogoUrl(joinData.home.logo_url);
                    return url ? `${url}${url.includes("?") ? "&" : "?"}v=1` : null;
                  })(),
                }
              : joinData.home,
            away: joinData.away && typeof joinData.away === "object"
              ? {
                  ...joinData.away,
                  logo_url: (() => {
                    const url = publicLogoUrl(joinData.away.logo_url);
                    return url ? `${url}${url.includes("?") ? "&" : "?"}v=1` : null;
                  })(),
                }
              : joinData.away,
          };
          m = normalizedMatch;
        }
      }

      setMatch(m);

      // 3) Elencos
      if (m?.home?.id) {
        const { data: hp } = await supabase
          .from("players")
          .select("id, name, number")
          .eq("team_id", m.home.id)
          .order("number", { ascending: true, nullsFirst: true })
          .order("name");
        setHomePlayers(hp || []);
      } else {
        setHomePlayers([]);
      }

      if (m?.away?.id) {
        const { data: ap } = await supabase
          .from("players")
          .select("id, name, number")
          .eq("team_id", m.away.id)
          .order("number", { ascending: true, nullsFirst: true })
          .order("name");
        setAwayPlayers(ap || []);
      } else {
        setAwayPlayers([]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();

    // Timer para atualizar o timestamp a cada segundo
    timerRef.current = setInterval(() => {
      setCurrentTimestamp(Date.now());
    }, 1000);

    // Realtime
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
      if (timerRef.current) clearInterval(timerRef.current);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const metaLine = useMemo(() => (match ? formatMetaLine(match) : ""), [match]);
  const home = match?.home;
  const away = match?.away;

  // Sets (Vôlei): mostra sempre em Vôlei, ou quando existir valor salvo.
  const homeSets = Number(match?.meta?.home_sets ?? 0);
  const awaySets = Number(match?.meta?.away_sets ?? 0);
  const hasAnySetValue = homeSets > 0 || awaySets > 0;
  const shouldShowSetsRow = isVolei || hasAnySetValue;

  // Pontos/placar: só mostra quando não for "Agendado"
  const shouldShowScore = match?.status && match.status !== "scheduled";
  const homeScore = Number(match?.home_score ?? 0);
  const awayScore = Number(match?.away_score ?? 0);

  const isLive = match?.status === "ongoing" || match?.status === "paused";

  if (loading || !match) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-40 bg-gray-100 rounded animate-pulse" />
        <div className="h-28 w-full bg-gray-100 rounded animate-pulse" />
        <div className="grid md:grid-cols-2 gap-4">
          <div className="h-52 bg-gray-100 rounded animate-pulse" />
          <div className="h-52 bg-gray-100 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <StatusPill
            status={match.status}
            meta={match.meta}
            starts_at={match.starts_at}
            updated_at={match.updated_at}
            currentTimestamp={currentTimestamp}
          />
          {metaLine && (
            <div className="text-xs text-gray-500" aria-label="Detalhes da fase">
              {metaLine}
            </div>
          )}
        </div>
        <div className="text-xs text-gray-500">
          {match.starts_at ? fmtDate(match.starts_at) : null}
          {match.venue ? <span className="ml-2">{match.venue}</span> : null}
        </div>
      </div>

      {/* Placar / Sets */}
      <div className={`bg-white border rounded-lg p-4 shadow-sm relative overflow-hidden ${
        isLive 
          ? match.status === "ongoing" 
            ? "border-blue-200" 
            : "border-orange-200"
          : "border-gray-200"
      }`}>
        <LiveProgressBar status={match.status} />
        
        <div className="grid grid-cols-3 items-center gap-2">
          {/* Time à esquerda */}
          <div className="flex items-center gap-3 min-w-0">
            <TeamBadge team={home || { name: "A definir" }} size={40} />
            <div className="min-w-0">
              <Link
                to={home?.id ? `/team/${home.id}` : "#"}
                className={`block font-semibold truncate hover:underline ${
                  home?.id ? "text-gray-900" : "text-gray-400 pointer-events-none"
                }`}
                onClick={(e) => {
                  if (!home?.id) e.preventDefault();
                }}
                title={home?.name || "A definir"}
              >
                {home?.name || "A definir"}
              </Link>
            </div>
          </div>

          {/* Centro: Sets (quando aplicável) + Pontos */}
          <div className="text-center">
            {shouldShowSetsRow ? (
              <div className="text-sm font-semibold tabular-nums mb-1">
                <span className={`${!shouldShowScore ? "text-gray-400" : ""}`}>
                  Sets: {homeSets} <span className="text-gray-400">x</span> {awaySets}
                </span>
              </div>
            ) : null}

            {shouldShowScore ? (
              <div className="text-3xl font-bold tabular-nums">
                {homeScore} <span className="text-gray-400">x</span> {awayScore}
              </div>
            ) : (
              <div className="text-sm text-gray-400">—</div>
            )}

            <div className="text-[11px] text-gray-500 mt-1">
              {STATUS_LABEL[match.status] || match.status}
              {isLive && (
                <span className="ml-2">
                  🕐 {formatGameTime(match, currentTimestamp)}
                </span>
              )}
              {match.meta?.clock ? ` • ${match.meta.clock}` : ""}
            </div>
          </div>

          {/* Time à direita */}
          <div className="flex items-center gap-3 min-w-0 justify-end">
            <div className="min-w-0 text-right">
              <Link
                to={away?.id ? `/team/${away.id}` : "#"}
                className={`block font-semibold truncate hover:underline ${
                  away?.id ? "text-gray-900" : "text-gray-400 pointer-events-none"
                }`}
                onClick={(e) => {
                  if (!away?.id) e.preventDefault();
                }}
                title={away?.name || "A definir"}
              >
                {away?.name || "A definir"}
              </Link>
            </div>
            <TeamBadge team={away || { name: "A definir" }} size={40} />
          </div>
        </div>

        {/* Nota explicativa para Vôlei */}
        {isVolei ? (
          <div className="text-[11px] text-gray-500 mt-2">
            Vôlei: partidas em <strong>um set de 15 pontos</strong>. É necessário ter{" "}
            <strong>2 pontos de vantagem</strong> para vencer.
          </div>
        ) : null}
      </div>

      {/* Detalhes */}
      <div className="bg-white border rounded-lg p-3 shadow-sm">
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
            <span className="text-gray-500">Rodada:</span>{" "}
            <span className="font-medium">{match.round ?? "—"}</span>
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
        {/* Elenco esquerda */}
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <h3 className="font-semibold mb-2">Elenco — {home?.name || "A definir"}</h3>
          {homePlayers.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhum jogador cadastrado.</p>
          ) : (
            <ul className="text-sm divide-y">
              {homePlayers.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-1">
                  <span className="truncate">{p.name}</span>
                  <span className="inline-block w-8 text-right tabular-nums text-gray-500">
                    {p.number ?? ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Elenco direita */}
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <h3 className="font-semibold mb-2">Elenco — {away?.name || "A definir"}</h3>
          {awayPlayers.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhum jogador cadastrado.</p>
          ) : (
            <ul className="text-sm divide-y">
              {awayPlayers.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-1">
                  <span className="truncate">{p.name}</span>
                  <span className="inline-block w-8 text-right tabular-nums text-gray-500">
                    {p.number ?? ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Rodapé/observação curta */}
      <div className="text-xs text-gray-500">
        {match.status === "finished" && match.updated_at
          ? `Encerrado em ${fmtDate(match.updated_at)}`
          : null}
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