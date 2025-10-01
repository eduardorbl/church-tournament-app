// src/pages/TeamPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../supabaseClient";
import TeamBadge from "../components/TeamBadge";

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

const STATUS_LABELS = {
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

function MatchCard({ match, currentTimestamp }) {
  const isVolei = (match?.sport?.name || "").toLowerCase().includes("vole");
  const homeSets = Number(match?.meta?.home_sets ?? 0);
  const awaySets = Number(match?.meta?.away_sets ?? 0);
  const hasAnySetValue = homeSets > 0 || awaySets > 0;
  const shouldShowSetsRow = isVolei || hasAnySetValue;
  const shouldShowScore = match?.status && match.status !== "scheduled";
  const homeScore = Number(match?.home_score ?? 0);
  const awayScore = Number(match?.away_score ?? 0);
  const isLive = match?.status === "ongoing" || match?.status === "paused";

  const cardBorder = isLive 
    ? match.status === "ongoing" 
      ? "border-blue-200" 
      : "border-orange-200"
    : "border-gray-200";

  return (
    <Link
      to={`/match/${match.id}`}
      className={`block bg-white border rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden ${cardBorder}`}
    >
      <LiveProgressBar status={match.status} />
      
      {/* Cabeçalho */}
      <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
        <div className="flex items-center gap-2">
          <span className="font-medium">{match.sport?.name}</span>
          {match.group_name ? ` • Grupo ${match.group_name}` : ""}
          {match.stage ? ` • ${prettyStage(match.stage)}` : ""}
          {match.round ? ` • J${match.round}` : ""}
          {isLive && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-600">
              🕐 {formatGameTime(match, currentTimestamp)}
            </span>
          )}
        </div>
        <span
          className={`px-2 py-0.5 rounded text-[11px] font-medium ${
            match.status === "ongoing"
              ? "bg-green-100 text-green-700"
              : match.status === "paused"
              ? "bg-yellow-100 text-yellow-700"
              : match.status === "finished"
              ? "bg-gray-200 text-gray-600"
              : "bg-blue-100 text-blue-700"
          }`}
        >
          {STATUS_LABELS[match.status] || match.status}
        </span>
      </div>

      {/* Times e placar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <TeamBadge team={match.home || { name: "A definir" }} size={24} />
          <span className="font-medium truncate text-sm">
            {match.home?.name || "A definir"}
          </span>
        </div>

        <div className="text-center px-3">
          {shouldShowSetsRow && (
            <div className="text-xs font-semibold tabular-nums mb-1">
              <span className={`${!shouldShowScore ? "text-gray-400" : ""}`}>
                Sets: {homeSets} x {awaySets}
              </span>
            </div>
          )}
          
          {shouldShowScore ? (
            <div className="text-lg font-bold tabular-nums">
              {homeScore} x {awayScore}
            </div>
          ) : (
            <div className="text-sm text-gray-400">—</div>
          )}
        </div>

        <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
          <span className="font-medium truncate text-sm text-right">
            {match.away?.name || "A definir"}
          </span>
          <TeamBadge team={match.away || { name: "A definir" }} size={24} />
        </div>
      </div>

      {/* Data/local */}
      <div className="text-xs text-gray-500 mt-2 flex items-center justify-between">
        <span>{match.starts_at ? fmtDate(match.starts_at) : "Data a definir"}</span>
        {match.venue && <span>{match.venue}</span>}
      </div>
    </Link>
  );
}

export default function TeamPage() {
  const { id } = useParams();
  const [team, setTeam] = useState(null);
  const [players, setPlayers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentTimestamp, setCurrentTimestamp] = useState(Date.now());
  const channelRef = useRef(null);
  const timerRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      // 1) Carrega dados do time
      const { data: teamData, error: teamError } = await supabase
        .from("teams")
        .select("id, name, logo_url, color")
        .eq("id", id)
        .maybeSingle();

      if (teamError) {
        console.error("Erro ao carregar time:", teamError);
        return;
      }

      if (teamData) {
        // Normaliza logo do time
        const normalizedTeam = {
          ...teamData,
          logo_url: (() => {
            const url = publicLogoUrl(teamData.logo_url);
            return url ? `${url}${url.includes("?") ? "&" : "?"}v=1` : null;
          })(),
        };
        setTeam(normalizedTeam);
      }

      // 2) Carrega jogadores
      const { data: playersData, error: playersError } = await supabase
        .from("players")
        .select("id, name, number")
        .eq("team_id", id)
        .order("number", { ascending: true, nullsFirst: true })
        .order("name");

      if (!playersError && playersData) {
        setPlayers(playersData);
      }

      // 3) Carrega partidas do time
      const { data: matchesData, error: matchesError } = await supabase
        .from("matches")
        .select(`
          id, stage, round, group_name, starts_at, venue, status, 
          home_score, away_score, meta, updated_at,
          sport:sport_id ( id, name ),
          home:home_team_id ( id, name, logo_url, color ),
          away:away_team_id ( id, name, logo_url, color )
        `)
        .or(`home_team_id.eq.${id},away_team_id.eq.${id}`)
        .order("starts_at", { ascending: false });

      if (!matchesError && matchesData) {
        // Normaliza logos das partidas
        const normalizedMatches = matchesData.map((m) => {
          const home = m.home && typeof m.home === "object"
            ? {
                ...m.home,
                logo_url: (() => {
                  const url = publicLogoUrl(m.home.logo_url);
                  return url ? `${url}${url.includes("?") ? "&" : "?"}v=1` : null;
                })(),
              }
            : m.home;

          const away = m.away && typeof m.away === "object"
            ? {
                ...m.away,
                logo_url: (() => {
                  const url = publicLogoUrl(m.away.logo_url);
                  return url ? `${url}${url.includes("?") ? "&" : "?"}v=1` : null;
                })(),
              }
            : m.away;

          return { ...m, home, away };
        });

        setMatches(normalizedMatches);
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
      .channel(`team-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matches" },
        () => load()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "teams", filter: `id=eq.${id}` },
        () => load()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players", filter: `team_id=eq.${id}` },
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

  const groupedMatches = useMemo(() => {
    const groups = {
      ongoing: [],
      paused: [],
      scheduled: [],
      finished: [],
    };

    matches.forEach((match) => {
      if (groups[match.status]) {
        groups[match.status].push(match);
      } else {
        groups.finished.push(match);
      }
    });

    return groups;
  }, [matches]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-20 bg-gray-100 rounded animate-pulse" />
        <div className="grid md:grid-cols-2 gap-6">
          <div className="h-64 bg-gray-100 rounded animate-pulse" />
          <div className="h-64 bg-gray-100 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-bold text-gray-600">Time não encontrado</h2>
        <p className="text-gray-500 mt-2">O time solicitado não existe ou foi removido.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho do time */}
      <div className="bg-white border rounded-lg p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <TeamBadge team={team} size={64} />
          <div>
            <h1 className="text-2xl font-bold">{team.name}</h1>
            <p className="text-gray-500">
              {matches.length} partida{matches.length !== 1 ? "s" : ""} registrada{matches.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Elenco */}
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">Convocação</h2>
          {players.length === 0 ? (
            <p className="text-gray-500 text-sm">Nenhum jogador cadastrado.</p>
          ) : (
            <ul className="space-y-2">
              {players.map((player) => (
                <li key={player.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <span className="font-medium">{player.name}</span>
                  <span className="text-gray-500 text-sm tabular-nums">
                    {player.number ? `#${player.number}` : "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Estatísticas rápidas */}
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">Estatísticas</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {groupedMatches.ongoing.length + groupedMatches.paused.length}
              </div>
              <div className="text-xs text-gray-500">Ao vivo</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {groupedMatches.scheduled.length}
              </div>
              <div className="text-xs text-gray-500">Agendadas</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-600">
                {groupedMatches.finished.length}
              </div>
              <div className="text-xs text-gray-500">Finalizadas</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {players.length}
              </div>
              <div className="text-xs text-gray-500">Jogadores</div>
            </div>
          </div>
        </div>
      </div>

      {/* Partidas */}
      <div className="bg-white border rounded-lg p-4 shadow-sm">
        <h2 className="text-lg font-semibold mb-4">Partidas</h2>
        
        {matches.length === 0 ? (
          <p className="text-gray-500 text-sm">Nenhuma partida registrada.</p>
        ) : (
          <div className="space-y-4">
            {/* Jogos ao vivo */}
            {(groupedMatches.ongoing.length > 0 || groupedMatches.paused.length > 0) && (
              <div>
                <h3 className="text-sm font-medium text-gray-600 mb-2">🔴 Ao vivo</h3>
                <div className="space-y-2">
                  {[...groupedMatches.ongoing, ...groupedMatches.paused].map((match) => (
                    <MatchCard key={match.id} match={match} currentTimestamp={currentTimestamp} />
                  ))}
                </div>
              </div>
            )}

            {/* Jogos agendados */}
            {groupedMatches.scheduled.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-600 mb-2">📅 Próximas partidas</h3>
                <div className="space-y-2">
                  {groupedMatches.scheduled.map((match) => (
                    <MatchCard key={match.id} match={match} currentTimestamp={currentTimestamp} />
                  ))}
                </div>
              </div>
            )}

            {/* Jogos finalizados */}
            {groupedMatches.finished.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-600 mb-2">✅ Finalizadas</h3>
                <div className="space-y-2">
                  {groupedMatches.finished.slice(0, 5).map((match) => (
                    <MatchCard key={match.id} match={match} currentTimestamp={currentTimestamp} />
                  ))}
                </div>
                {groupedMatches.finished.length > 5 && (
                  <p className="text-xs text-gray-500 mt-2">
                    ... e mais {groupedMatches.finished.length - 5} partida{groupedMatches.finished.length - 5 !== 1 ? "s" : ""}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
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