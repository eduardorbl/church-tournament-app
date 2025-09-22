import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabaseClient";
import TeamBadge from "../components/TeamBadge";

// Ícones por esporte (iguais aos da Home)
const SPORT_ICON = {
  Futsal: "⚽",
  Volei: "🏐",
  FIFA: "🎮⚽",
  Pebolim: "🎮",
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

// Timezone e formatador de data/hora
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

// Funções auxiliares para logo (iguais ao Home.jsx)
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

// Formatar tempo relativo (em quanto tempo a partida começa)
function formatTimeUntilMatch(starts_at, currentTimestamp) {
  if (!starts_at) return "";
  
  const startTime = new Date(starts_at);
  const now = new Date(currentTimestamp);
  const diffMs = startTime - now;
  
  // Se já passou, mostra "Iniciada"
  if (diffMs <= 0) return "Iniciando";
  
  // Converte para minutos
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  
  if (diffMinutes < 60) {
    return `em ${diffMinutes}min`;
  } else if (diffMinutes < 24 * 60) {
    const hours = Math.floor(diffMinutes / 60);
    return `em ${hours}h`;
  } else {
    const days = Math.floor(diffMinutes / (24 * 60));
    return `em ${days}d`;
  }
}

// Pill de status (na página de próximos só mostra "Agendado" + horário)
function StatusPill({ status, starts_at, currentTimestamp }) {
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
      {status === "scheduled" && starts_at ? (
        <span>• {fmtDate(starts_at)}</span>
      ) : null}
    </span>
  );
}

// Linha de partida (card) — clique leva à MatchPage; nomes dos times levam à TeamPage
function MatchRow({ match, currentTimestamp }) {
  const home = match.home;
  const away = match.away;

  // Verifica se a partida está próxima (menos de 2 horas)
  const isUpcoming = match.starts_at && 
    new Date(match.starts_at) - new Date(currentTimestamp) < 2 * 60 * 60 * 1000 &&
    new Date(match.starts_at) > new Date(currentTimestamp);

  const cardBorder = isUpcoming ? "border-orange-200" : "border-gray-200";
  const cardBg = isUpcoming ? "bg-orange-50" : "bg-white";

  return (
    <Link
      to={`/match/${match.id}`}
      className={`block border rounded-lg p-3 hover:bg-gray-50 transition shadow-sm relative overflow-hidden ${cardBorder} ${cardBg}`}
    >
      {/* Barra superior para partidas próximas */}
      {isUpcoming && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-orange-500 rounded-t-lg" />
      )}
      
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <StatusPill status={match.status} starts_at={match.starts_at} currentTimestamp={currentTimestamp} />
          {match.starts_at && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-600">
              ⏰ {formatTimeUntilMatch(match.starts_at, currentTimestamp)}
            </span>
          )}
          <span className="text-[11px] text-gray-500">
            {SPORT_ICON[match.sport?.name] || "🏆"}
          </span>
        </div>
        <span className="text-[11px] text-gray-500">
          {match.venue ? match.venue : ""}
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

        {/* Centro: em Próximos não mostramos placar; só o "vs" */}
        <div className="shrink-0 text-center">
          <span className="font-semibold text-gray-700">vs</span>
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

      {/* Rodapé com informações adicionais */}
      <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500">
        <span className="truncate">{match.venue || ""}</span>
        {isUpcoming && (
          <span className="bg-orange-100 text-orange-700 px-1 py-0.5 rounded font-medium">
            Próxima
          </span>
        )}
      </div>
    </Link>
  );
}

// Seção por esporte — somente partidas agendadas (próximas) E DEFINIDAS
function SportSection({ sportName, matches, currentTimestamp }) {
  const icon = SPORT_ICON[sportName] || "🏆";

  // 👉 Filtra apenas partidas definidas (ambos os times existem) e agendadas
  const scheduled = useMemo(() => {
    return (matches || [])
      .filter((m) => m.status === "scheduled" && isMatchDefined(m))
      .sort((a, b) => {
        const da = a.starts_at ? new Date(a.starts_at).getTime() : Number.POSITIVE_INFINITY;
        const db = b.starts_at ? new Date(b.starts_at).getTime() : Number.POSITIVE_INFINITY;
        return da - db;
      });
  }, [matches]);

  // Conta quantas partidas estão próximas (menos de 2 horas)
  const upcomingCount = useMemo(() => {
    return scheduled.filter(m => 
      m.starts_at && 
      new Date(m.starts_at) - new Date(currentTimestamp) < 2 * 60 * 60 * 1000 &&
      new Date(m.starts_at) > new Date(currentTimestamp)
    ).length;
  }, [scheduled, currentTimestamp]);

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-xl">{icon}</span>
        <h3 className="text-lg font-bold">{sportName}</h3>
        {scheduled.length > 0 && (
          <span className="text-sm text-gray-500">
            ({scheduled.length} agendada{scheduled.length !== 1 ? 's' : ''})
          </span>
        )}
        {upcomingCount > 0 && (
          <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded text-xs font-medium">
            {upcomingCount} próxima{upcomingCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {scheduled.length === 0 ? (
        <div className="text-xs text-gray-500">Nenhuma partida confirmada agendada.</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {scheduled.map((m) => (
            <MatchRow key={m.id} match={m} currentTimestamp={currentTimestamp} />
          ))}
        </div>
      )}
    </section>
  );
}

export default function Upcoming() {
  const [loading, setLoading] = useState(true);
  const [bySport, setBySport] = useState({}); // { "Futsal": [matches...], ... }
  const [currentTimestamp, setCurrentTimestamp] = useState(Date.now());
  const channelRef = useRef(null);
  const timerRef = useRef(null);

  // Carrega todas as partidas já com join de esporte e times
  const loadAll = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("matches")
      .select(`
        id,
        sport:sport_id ( id, name ),
        stage, round, group_name,
        starts_at, updated_at, venue, status, meta,
        home:home_team_id ( id, name, logo_url, color ),
        away:away_team_id ( id, name, logo_url, color )
      `)
      .in("status", ["scheduled"]) // só precisamos dos agendados
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

    // Timer para atualizar o timestamp a cada minuto (suficiente para "próximos")
    timerRef.current = setInterval(() => {
      setCurrentTimestamp(Date.now());
    }, 60000); // 1 minuto

    // Realtime: qualquer mudança em matches força reload
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }
    const channel = supabase
      .channel("upcoming-matches")
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

  // Lista de esportes na ordem desejada; extras alfabeticamente no final
  const sportNames = useMemo(() => {
    const present = Object.keys(bySport);
    const ordered = SPORT_ORDER.filter((n) => present.includes(n));
    const extras = present.filter((n) => !SPORT_ORDER.includes(n)).sort();
    return [...ordered, ...extras];
  }, [bySport]);

  // Conta total de partidas próximas
  const totalUpcoming = useMemo(() => {
    return sportNames.reduce((acc, sportName) => {
      const matches = bySport[sportName] || [];
      const upcoming = matches.filter(m => 
        m.status === "scheduled" && 
        isMatchDefined(m) &&
        m.starts_at && 
        new Date(m.starts_at) - new Date(currentTimestamp) < 2 * 60 * 60 * 1000 &&
        new Date(m.starts_at) > new Date(currentTimestamp)
      );
      return acc + upcoming.length;
    }, 0);
  }, [bySport, sportNames, currentTimestamp]);

  const totalScheduled = useMemo(() => {
    return sportNames.reduce((acc, sportName) => {
      const matches = bySport[sportName] || [];
      const scheduled = matches.filter(m => 
        m.status === "scheduled" && isMatchDefined(m)
      );
      return acc + scheduled.length;
    }, 0);
  }, [bySport, sportNames]);

  return (
    <div className="space-y-10">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-2xl">📅</span>
          <h2 className="text-2xl font-bold">Próximos jogos</h2>
          {totalScheduled > 0 && (
            <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-sm font-medium">
              {totalScheduled} agendada{totalScheduled !== 1 ? 's' : ''}
            </span>
          )}
          {totalUpcoming > 0 && (
            <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded text-sm font-medium">
              {totalUpcoming} próxima{totalUpcoming !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <p className="text-sm text-gray-600">
          Toque em uma partida para ver os detalhes. Toque no nome do time para ir à página do time.
          Partidas em até 2 horas aparecem destacadas.
        </p>
      </header>

      {loading ? (
        <div className="space-y-6">
          <div className="space-y-4">
            <div className="h-6 w-48 bg-gray-200 rounded animate-pulse" />
            <div className="grid md:grid-cols-2 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-20 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          </div>
          <div className="space-y-4">
            <div className="h-6 w-40 bg-gray-200 rounded animate-pulse" />
            <div className="grid md:grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-20 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          </div>
        </div>
      ) : totalScheduled === 0 ? (
        <div className="text-center py-12">
          <div className="text-4xl mb-4">📅</div>
          <p className="text-lg text-gray-500 mb-2">Nenhuma partida agendada no momento</p>
          <p className="text-sm text-gray-400">
            Quando houver jogos confirmados agendados, eles aparecerão aqui.
          </p>
        </div>
      ) : (
        sportNames.map((name) => (
          <SportSection 
            key={name} 
            sportName={name} 
            matches={bySport[name] || []} 
            currentTimestamp={currentTimestamp}
          />
        ))
      )}
    </div>
  );
}