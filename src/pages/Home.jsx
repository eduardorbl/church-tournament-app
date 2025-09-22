// src/pages/Home.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabaseClient";
import TeamBadge from "../components/TeamBadge";

// Ícones por esporte (simples e claros)
const SPORT_ICON = {
  Futsal: "⚽",
  Volei: "🏐",
  FIFA: "🎮⚽",
  Pebolim: "🎲⚽",
};

// Ordem de exibição das seções por esporte
const SPORT_ORDER = ["Futsal", "Volei", "FIFA", "Pebolim"];

// Labels do status
const STATUS_LABEL = {
  scheduled: "Agendado",
  ongoing: "Em andamento",
  paused: "Pausado",
  finished: "Encerrado",
};

// Storage
const LOGO_BUCKET = "team-logos";

// Helpers de data/hora (Campinas, SP)
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

// 👉 Considera a partida "definida" apenas se AMBOS os times existem
function isMatchDefined(m) {
  const hid = m?.home && typeof m.home === "object" ? m.home.id : null;
  const aid = m?.away && typeof m.away === "object" ? m.away.id : null;
  return Boolean(hid && aid);
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

// Pill de status
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
      : "bg-blue-100 text-blue-700"; // scheduled

  return (
    <span className={`${base} ${style}`}>
      {STATUS_LABEL[status] || status}
    </span>
  );
}

// Linha compacta da partida (clique no card → MatchPage; clique no time → TeamPage)
function MatchRow({ match, currentTimestamp }) {
  const home = match.home;
  const away = match.away;

  // Verifica se é vôlei
  const isVolei = (match.sport?.name || "").toLowerCase() === "volei";

  // Mostrar placar SOMENTE quando o jogo já iniciou (ongoing/paused) ou terminou (finished).
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
            {SPORT_ICON[match.sport?.name] || "🏆"} {match.sport?.name}
          </span>
        </div>
        {match.starts_at ? (
          <span className="text-[11px] text-gray-500">{fmtDate(match.starts_at)}</span>
        ) : (
          <span className="text-[11px] text-gray-400">{match.venue || ""}</span>
        )}
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

        {/* Placar */}
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

// Grade de partidas por status para um esporte
function SportSection({ sportName, matches, currentTimestamp }) {
  const icon = SPORT_ICON[sportName] || "🏆";

  // 👉 Aparece somente se ambos os times estiverem definidos
  const onlyDefined = (m) => isMatchDefined(m);

  const scheduled = matches
    .filter((m) => m.status === "scheduled" && onlyDefined(m))
    .sort((a, b) =>
      a.starts_at && b.starts_at
        ? new Date(a.starts_at) - new Date(b.starts_at)
        : a.starts_at
        ? -1
        : b.starts_at
        ? 1
        : 0
    )
    .slice(0, 8); // próximos

  const finished = matches
    .filter((m) => m.status === "finished" && onlyDefined(m))
    .sort(
      (a, b) =>
        new Date(b.updated_at || b.starts_at || 0) -
        new Date(a.updated_at || a.starts_at || 0)
    )
    .slice(0, 10); // recentes

  const SectionBlock = ({ title, items, emptyLabel }) => (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-gray-700">{title}</h4>
      {items.length === 0 ? (
        <div className="text-xs text-gray-500">{emptyLabel}</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {items.map((m) => (
            <MatchRow key={m.id} match={m} currentTimestamp={currentTimestamp} />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-xl">{icon}</span>
        <h3 className="text-lg font-bold">{sportName}</h3>
      </div>

      <div className="space-y-6">
        <SectionBlock
          title="Agendados"
          items={scheduled}
          emptyLabel="Nenhuma partida agendada."
        />
        <SectionBlock
          title="Encerrados (recentes)"
          items={finished}
          emptyLabel="Sem resultados recentes."
        />
      </div>
    </section>
  );
}

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [bySport, setBySport] = useState({}); // { "Futsal": [matches...], ... }
  const [currentTimestamp, setCurrentTimestamp] = useState(Date.now());
  const channelRef = useRef(null);
  const timerRef = useRef(null);

  // Carrega todas as partidas com infos de time e esporte
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
      .order("starts_at", { ascending: true, nullsFirst: true });

    if (error) {
      console.error(error);
      setBySport({});
      setLoading(false);
      return;
    }

    // Normaliza os logos (transforma caminho do storage em URL pública)
    const normalized = (data || []).map((m) => {
      const home =
        m.home && typeof m.home === "object"
          ? {
              ...m.home,
              logo_url: (() => {
                const url = publicLogoUrl(m.home.logo_url);
                return url ? `${url}${url.includes("?") ? "&" : "?"}v=1` : null;
              })(),
            }
          : m.home;

      const away =
        m.away && typeof m.away === "object"
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

    // Agrupa por esporte (nome)
    const grouped = {};
    for (const m of normalized) {
      const sportName = m.sport?.name || "Outros";
      if (!grouped[sportName]) grouped[sportName] = [];
      grouped[sportName].push(m);
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

    // Realtime: qualquer mudança em matches recarrega a home
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }
    const channel = supabase
      .channel("home-matches")
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

  // Lista de esportes na ordem desejada; adiciona extras no final, se existirem
  const sportNames = useMemo(() => {
    const present = Object.keys(bySport);
    const ordered = SPORT_ORDER.filter((n) => present.includes(n));
    const extras = present.filter((n) => !SPORT_ORDER.includes(n)).sort();
    return [...ordered, ...extras];
  }, [bySport]);

  // Separar jogos ao vivo/pausados de todos os esportes
  const liveMatches = useMemo(() => {
    const allMatches = Object.values(bySport).flat();
    return allMatches
      .filter((m) => (m.status === "ongoing" || m.status === "paused") && isMatchDefined(m))
      .sort((a, b) => {
        // Priorizar ongoing sobre paused
        if (a.status === "ongoing" && b.status === "paused") return -1;
        if (a.status === "paused" && b.status === "ongoing") return 1;
        return 0;
      });
  }, [bySport]);

  return (
    <div className="space-y-10">
      <header className="space-y-1">
        <h2 className="text-2xl font-bold">Acompanhe as partidas</h2>
        <p className="text-sm text-gray-600">
          Toque em uma partida para ver os detalhes. Toque no nome do time para ir à página do time.
        </p>
      </header>

      {loading ? (
        <div className="space-y-4">
          <div className="h-6 w-40 bg-gray-200 rounded animate-pulse" />
          <div className="grid md:grid-cols-2 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-20 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Seção de jogos ao vivo/pausados sempre no topo */}
          {liveMatches.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-xl">🔴</span>
                <h3 className="text-lg font-bold">Ao vivo / Pausado</h3>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                {liveMatches.map((m) => (
                  <MatchRow key={m.id} match={m} currentTimestamp={currentTimestamp} />
                ))}
              </div>
            </section>
          )}

          {/* Seções por esporte (apenas agendados e encerrados) */}
          {sportNames.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhuma partida disponível no momento.</p>
          ) : (
            sportNames.map((name) => (
              <SportSection key={name} sportName={name} matches={bySport[name] || []} currentTimestamp={currentTimestamp} />
            ))
          )}
        </>
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