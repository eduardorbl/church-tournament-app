// src/pages/Live.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabaseClient";
import TeamBadge from "../components/TeamBadge";

/* ============================
   Constantes / Utilitários
   ============================ */

const SPORT_ICON = {
  Futsal: "⚽",
  Volei: "🏐",
  FIFA: "🎮⚽",
  Pebolim: "🎮",
};
const SPORT_ORDER = ["Futsal", "Volei", "FIFA", "Pebolim"];
const LIVE_STATUSES = ["ongoing", "paused"];

// Storage
const LOGO_BUCKET = "team-logos";

const STATUS_LABEL = {
  scheduled: "Agendado",
  ongoing: "Em andamento",
  paused: "Pausado",
  finished: "Encerrado",
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

// Função para obter sets do vôlei
function getSets(match, side) {
  const meta = match.meta || {};
  const key = side === "home" ? "home_sets" : "away_sets";
  return Math.max(0, Number(meta[key] || 0));
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

/* ============================
   UI: Status Pill
   ============================ */

function StatusPill({ status, meta }) {
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

  return (
    <span className={`${base} ${style}`}>
      {STATUS_LABEL[status] || status}
    </span>
  );
}

/* ============================
   UI: MatchRow (sem placar para agendados)
   ============================ */

function MatchRow({ match, currentTimestamp }) {
  const home = match.home;
  const away = match.away;

  // Verifica se é vôlei
  const isVolei = (match.sport?.name || "").toLowerCase() === "volei";

  // Só mostramos placar quando NÃO for "scheduled".
  const shouldShowScore = match.status !== "scheduled";
  const homeScore = typeof match.home_score === "number" ? match.home_score : 0;
  const awayScore = typeof match.away_score === "number" ? match.away_score : 0;

  // Sets para vôlei
  const homeSets = isVolei ? getSets(match, "home") : 0;
  const awaySets = isVolei ? getSets(match, "away") : 0;

  const isLive = match.status === "ongoing" || match.status === "paused";
  const cardBorder = isLive 
    ? match.status === "ongoing" 
      ? "border-blue-200" 
      : "border-orange-200"
    : "border-gray-200";

  return (
    <Link
      to={`/match/${match.id}`}
      className={`block border rounded-lg p-3 bg-white hover:bg-gray-50 transition shadow-sm relative overflow-hidden ${cardBorder}`}
    >
      <LiveProgressBar status={match.status} />
      
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <StatusPill status={match.status} meta={match.meta} />
          {isLive && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-600">
              🕐 {formatGameTime(match, currentTimestamp)}
            </span>
          )}
          <span className="text-[11px] text-gray-500">
            {SPORT_ICON[match.sport?.name] || "🏆"}
          </span>
        </div>
        <span className="text-[11px] text-gray-500">
          {match.starts_at ? fmtDate(match.starts_at) : match.venue || ""}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-3">
        {/* Home */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <TeamBadge team={home || { name: "A definir" }} size={28} />
          <Link
            to={home?.id ? `/team/${home.id}` : "#"}
            onClick={(e) => {
              if (!home?.id) e.preventDefault();
              e.stopPropagation();
            }}
            className={`truncate text-sm font-medium hover:underline ${
              home?.id ? "text-gray-900" : "text-gray-400 pointer-events-none"
            }`}
            title={home?.name || "A definir"}
          >
            {home?.name || "A definir"}
          </Link>
        </div>

        {/* Placar: nunca para agendado */}
        <div className="shrink-0 text-center">
          {shouldShowScore ? (
            <div className="space-y-1">
              {/* Sets para vôlei */}
              {isVolei && (
                <div className="text-xs font-medium text-gray-600">
                  <span className="tabular-nums">{homeSets}</span>
                  <span className="text-gray-400 mx-1">sets</span>
                  <span className="tabular-nums">{awaySets}</span>
                </div>
              )}
              {/* Pontos */}
              <div className="font-bold text-lg tabular-nums">
                {homeScore} <span className="text-gray-400">x</span> {awayScore}
              </div>
            </div>
          ) : null}
          <div className="text-[10px] text-gray-400 uppercase tracking-wide">
            {match.stage || ""}
            {match.round ? ` · J${match.round}` : ""}
            {match.group_name ? ` · G${match.group_name}` : ""}
          </div>
        </div>

        {/* Away */}
        <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
          <Link
            to={away?.id ? `/team/${away.id}` : "#"}
            onClick={(e) => {
              if (!away?.id) e.preventDefault();
              e.stopPropagation();
            }}
            className={`truncate text-sm font-medium hover:underline text-right ${
              away?.id ? "text-gray-900" : "text-gray-400 pointer-events-none"
            }`}
            title={away?.name || "A definir"}
          >
            {away?.name || "A definir"}
          </Link>
          <TeamBadge team={away || { name: "A definir" }} size={28} />
        </div>
      </div>

      {/* Rodapé opcional */}
      <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500">
        <span className="truncate">{match.venue || ""}</span>
        {match.status === "finished" && match.updated_at ? (
          <span>Encerrado em {fmtDate(match.updated_at)}</span>
        ) : null}
      </div>
    </Link>
  );
}

/* ============================
   Seção por esporte (apenas AO VIVO)
   ============================ */

function SportLiveSection({ sportName, matches, currentTimestamp }) {
  const icon = SPORT_ICON[sportName] || "🏆";
  const live = matches.filter((m) => LIVE_STATUSES.includes(m.status));

  if (live.length === 0) return null; // oculta esportes sem jogos ao vivo

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-xl">{icon}</span>
        <h3 className="text-lg font-bold">{sportName}</h3>
        <span className="text-sm text-gray-500">({live.length} ao vivo)</span>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        {live.map((m) => (
          <MatchRow key={m.id} match={m} currentTimestamp={currentTimestamp} />
        ))}
      </div>
    </section>
  );
}

/* ============================
   Página: Live (Home só com jogos ao vivo)
   ============================ */

export default function Live() {
  const [loading, setLoading] = useState(true);
  const [bySport, setBySport] = useState({});
  const [currentTimestamp, setCurrentTimestamp] = useState(Date.now());
  const channelRef = useRef(null);
  const timerRef = useRef(null);

  const loadAll = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("matches")
      .select(`
        id,
        sport:sport_id ( id, name ),
        stage, round, group_name,
        starts_at, updated_at, venue, status, meta,
        home_score, away_score,
        home:home_team_id ( id, name, logo_url, color ),
        away:away_team_id ( id, name, logo_url, color )
      `)
      .in("status", LIVE_STATUSES)
      .order("updated_at", { ascending: false, nullsFirst: true });

    if (error) {
      console.error(error);
      setBySport({});
      setLoading(false);
      return;
    }

    const grouped = {};
    for (const m of data || []) {
      const sportName = m.sport?.name || "Outros";
      if (!grouped[sportName]) grouped[sportName] = [];
      
      // Normaliza os logos das partidas
      const normalizedMatch = {
        ...m,
        home: m.home && typeof m.home === "object"
          ? {
              ...m.home,
              logo_url: (() => {
                const url = publicLogoUrl(m.home.logo_url);
                return url ? `${url}${url.includes("?") ? "&" : "?"}v=1` : null;
              })(),
            }
          : m.home,
        away: m.away && typeof m.away === "object"
          ? {
              ...m.away,
              logo_url: (() => {
                const url = publicLogoUrl(m.away.logo_url);
                return url ? `${url}${url.includes("?") ? "&" : "?"}v=1` : null;
              })(),
            }
          : m.away,
      };
      
      grouped[sportName].push(normalizedMatch);
    }
    setBySport(grouped);
    setLoading(false);
  };

  useEffect(() => {
    loadAll();

    // Timer para atualizar o timestamp a cada segundo
    timerRef.current = setInterval(() => {
      setCurrentTimestamp(Date.now());
    }, 1000);

    // Realtime: qualquer mudança em matches → recarregar
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    const channel = supabase
      .channel("home-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matches" },
        () => loadAll()
      )
      .subscribe();

    channelRef.current = channel;
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    };
  }, []);

  // Ordena seções por esporte com ordem preferida
  const sportNames = useMemo(() => {
    const present = Object.keys(bySport);
    const ordered = SPORT_ORDER.filter((n) => present.includes(n));
    const extras = present.filter((n) => !SPORT_ORDER.includes(n)).sort();
    return [...ordered, ...extras];
  }, [bySport]);

  const totalLive = sportNames.reduce(
    (acc, s) => acc + (bySport[s]?.filter(m => LIVE_STATUSES.includes(m.status)).length || 0),
    0
  );

  return (
    <div className="space-y-10">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🔴</span>
          <h2 className="text-2xl font-bold">Ao vivo agora</h2>
          {totalLive > 0 && (
            <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-sm font-medium">
              {totalLive} partida{totalLive !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <p className="text-sm text-gray-600">
          Veja as partidas em andamento em tempo real. Os tempos são atualizados automaticamente.
        </p>
      </header>

      {loading ? (
        <div className="space-y-6">
          <div className="space-y-4">
            <div className="h-6 w-40 bg-gray-200 rounded animate-pulse" />
            <div className="grid md:grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-24 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          </div>
          <div className="space-y-4">
            <div className="h-6 w-32 bg-gray-200 rounded animate-pulse" />
            <div className="grid md:grid-cols-2 gap-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="h-24 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          </div>
        </div>
      ) : totalLive === 0 ? (
        <div className="text-center py-12">
          <div className="text-4xl mb-4">⏸️</div>
          <p className="text-lg text-gray-500 mb-2">Nenhuma partida ao vivo no momento</p>
          <p className="text-sm text-gray-400">
            Quando houver jogos em andamento, eles aparecerão aqui automaticamente.
          </p>
        </div>
      ) : (
        sportNames.map((name) => (
          <SportLiveSection 
            key={name} 
            sportName={name} 
            matches={bySport[name] || []} 
            currentTimestamp={currentTimestamp}
          />
        ))
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