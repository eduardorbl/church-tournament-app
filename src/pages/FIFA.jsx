import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabaseClient";
import TeamBadge from "../components/TeamBadge";

// Ícone do esporte
const SPORT_ICON = "🎮⚽";

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

// Card simples de partida
function MatchRow({ match, currentTimestamp }) {
  const home = match.home;
  const away = match.away;

  // ✅ Mostrar placar somente quando o jogo NÃO estiver "scheduled"
  const shouldShowScore = match.status !== "scheduled";
  const homeScore =
    typeof match.home_score === "number" ? match.home_score : 0;
  const awayScore =
    typeof match.away_score === "number" ? match.away_score : 0;

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
          <StatusPill status={match.status} meta={match.meta || {}} />
          {isLive && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-600">
              🕐 {formatGameTime(match, currentTimestamp)}
            </span>
          )}
          <span className="text-[11px] text-gray-500">
            {SPORT_ICON} FIFA
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

        {/* Centro (placar/etapa) */}
        <div className="shrink-0 text-center">
          {shouldShowScore ? (
            <span className="font-bold text-lg tabular-nums">
              {homeScore} <span className="text-gray-400">x</span> {awayScore}
            </span>
          ) : null}
          <div className="text-[10px] text-gray-400 uppercase tracking-wide">
            {match.stage || ""}
            {match.round ? ` · J${match.round}` : ""}
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
   Chaveamento de FIFA
   ============================ */

function BracketCard({ title, home, away }) {
  const H = home || {};
  const A = away || {};
  return (
    <div className="rounded-lg border p-3 bg-white">
      <div className="text-[11px] font-semibold text-gray-500 mb-2">{title}</div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <TeamBadge team={H.id ? H : { name: "A definir" }} size={24} />
          <span
            className={`truncate text-sm ${
              H.id ? "text-gray-900" : "text-gray-400"
            }`}
            title={H.name || "A definir"}
          >
            {H.name || "A definir"}
          </span>
        </div>
        <div className="text-gray-400 text-xs">vs</div>
        <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
          <span
            className={`truncate text-sm text-right ${
              A.id ? "text-gray-900" : "text-gray-400"
            }`}
            title={A.name || "A definir"}
          >
            {A.name || "A definir"}
          </span>
          <TeamBadge team={A.id ? A : { name: "A definir" }} size={24} />
        </div>
      </div>
    </div>
  );
}

// Extrai confrontos de mata-mata de FIFA
function extractKnockout(matches) {
  const byStage = (stage) =>
    (matches || [])
      .filter((m) => m.stage === stage)
      .sort((a, b) => (a.round || 0) - (b.round || 0));

  const oitavas = byStage("oitavas");
  const quartas = byStage("quartas");
  const semis = byStage("semi");
  const final = byStage("final");

  return {
    oitavas,
    quartas,
    semis,
    final: final[0],
  };
}

/* ============================
   Página FIFA
   ============================ */

const ensureInitialStandings = async (sportName) => {
  // A FIFA não tem classificação (mata-mata direto), mas chamamos para consistência
  try {
    await supabase.rpc("seed_initial_standings", {
      p_sport_name: sportName,
      p_reset: false,
    });
  } catch (err) {
    console.warn("seed_initial_standings exception:", err);
  }
};

export default function FIFA() {
  const [sportId, setSportId] = useState(null);
  const [matches, setMatches] = useState([]);
  const [teamsById, setTeamsById] = useState({});
  const [loading, setLoading] = useState(true);
  const [currentTimestamp, setCurrentTimestamp] = useState(Date.now());
  const channelRef = useRef(null);
  const timerRef = useRef(null);

  const loadSportId = async () => {
    const { data } = await supabase
      .from("sports")
      .select("id")
      .eq("name", "FIFA")
      .maybeSingle();
    if (data?.id) setSportId(data.id);
  };

  const loadTeams = async (sid) => {
    const { data } = await supabase
      .from("teams")
      .select("id, name, logo_url, color")
      .eq("sport_id", sid);
    if (data) {
      const map = {};
      for (const t of data) {
        map[t.id] = {
          ...t,
          logo_url: (() => {
            const url = publicLogoUrl(t.logo_url);
            return url ? `${url}${url.includes("?") ? "&" : "?"}v=1` : null;
          })(),
        };
      }
      setTeamsById(map);
    }
  };

  const loadMatches = async (sid) => {
    const { data } = await supabase
      .from("matches")
      .select(`
        id,
        stage,
        round,
        starts_at,
        updated_at,
        venue,
        status,
        meta,
        home_score,
        away_score,
        home_team_id,
        away_team_id,
        home:home_team_id ( id, name, logo_url, color ),
        away:away_team_id ( id, name, logo_url, color )
      `)
      .eq("sport_id", sid)
      .order("stage", { ascending: true, nullsFirst: true })
      .order("round", { ascending: true, nullsFirst: true });
    
    if (data) {
      // Normaliza os logos das partidas
      const normalized = data.map((m) => {
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
      
      setMatches(normalized);
    }
  };

  const loadAll = async (sid) => {
    setLoading(true);
    await Promise.all([loadTeams(sid), loadMatches(sid), ensureInitialStandings("FIFA")]);
    setLoading(false);
  };

  useEffect(() => {
    loadSportId();
  }, []);

  useEffect(() => {
    if (!sportId) return;
    loadAll(sportId);

    // Timer para atualizar o timestamp a cada segundo
    timerRef.current = setInterval(() => {
      setCurrentTimestamp(Date.now());
    }, 1000);

    // Realtime: mudanças de partidas
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase
      .channel("fifa-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matches" },
        () => loadAll(sportId)
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    };
  }, [sportId]);

  const knockout = useMemo(() => extractKnockout(matches), [matches]);

  // Filtros para organizar partidas
  const liveOrPaused = useMemo(
    () => matches.filter((m) => m.status === "ongoing" || m.status === "paused"),
    [matches]
  );

  const scheduled = useMemo(() => {
    // Filtra apenas partidas agendadas onde ambos os times foram definidos
    const arr = matches.filter((m) => 
      m.status === "scheduled" && 
      m.home?.id && 
      m.away?.id
    );
    arr.sort((a, b) => {
      const da = a.starts_at ? new Date(a.starts_at).getTime() : Number.POSITIVE_INFINITY;
      const db = b.starts_at ? new Date(b.starts_at).getTime() : Number.POSITIVE_INFINITY;
      return da - db;
    });
    return arr;
  }, [matches]);

  const finished = useMemo(() => {
    const arr = matches.filter((m) => m.status === "finished");
    arr.sort(
      (a, b) => new Date(b.updated_at || b.starts_at || 0) - new Date(a.updated_at || a.starts_at || 0)
    );
    return arr;
  }, [matches]);

  return (
    <div className="space-y-10">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{SPORT_ICON}</span>
          <h2 className="text-2xl font-bold">FIFA</h2>
        </div>
        <p className="text-sm text-gray-600">
          Torneio de mata-mata eliminatório. Toque em uma partida para ver detalhes (status, tempo). Toque no time para abrir a página do time.
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
          {/* Partidas */}
          {(liveOrPaused.length > 0 || scheduled.length > 0 || finished.length > 0) && (
            <section className="space-y-6">
              <h3 className="text-lg font-bold">Partidas</h3>

              <div className="space-y-4">
                {/* Ao vivo / Pausado */}
                {liveOrPaused.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-gray-700">Ao vivo / Pausado</h4>
                    <div className="grid md:grid-cols-2 gap-3">
                      {liveOrPaused.map((m) => (
                        <MatchRow key={m.id} match={m} currentTimestamp={currentTimestamp} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Agendados */}
                {scheduled.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-gray-700">Agendados</h4>
                    <div className="grid md:grid-cols-2 gap-3">
                      {scheduled.map((m) => (
                        <MatchRow key={m.id} match={m} currentTimestamp={currentTimestamp} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Encerrados */}
                {finished.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-gray-700">Encerrados (recentes)</h4>
                    <div className="grid md:grid-cols-2 gap-3">
                      {finished.map((m) => (
                        <MatchRow key={m.id} match={m} currentTimestamp={currentTimestamp} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Chaveamento */}
          <section className="space-y-6">
            <h3 className="text-lg font-bold">Chaveamento</h3>

            {/* Oitavas */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-gray-700">Oitavas de final</h4>
              {knockout.oitavas && knockout.oitavas.length > 0 ? (
                <div className="grid md:grid-cols-2 gap-3">
                  {knockout.oitavas.map((m) => (
                    <MatchRow key={m.id} match={m} currentTimestamp={currentTimestamp} />
                  ))}
                </div>
              ) : (
                <div className="text-xs text-gray-500">Sem confrontos nas oitavas.</div>
              )}
            </div>

            {/* Quartas */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-gray-700">Quartas de final</h4>
              {knockout.quartas && knockout.quartas.length > 0 ? (
                <div className="grid md:grid-cols-2 gap-3">
                  {knockout.quartas.map((m) => (
                    <MatchRow key={m.id} match={m} currentTimestamp={currentTimestamp} />
                  ))}
                </div>
              ) : (
                <div className="text-xs text-gray-500">Sem confrontos nas quartas.</div>
              )}
            </div>

            {/* Semis */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-gray-700">Semifinais</h4>
              {knockout.semis && knockout.semis.length > 0 ? (
                <div className="grid md:grid-cols-2 gap-3">
                  {knockout.semis.map((m) => (
                    <MatchRow key={m.id} match={m} currentTimestamp={currentTimestamp} />
                  ))}
                </div>
              ) : (
                <div className="text-xs text-gray-500">Sem confrontos nas semifinais.</div>
              )}
            </div>

            {/* Final */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-gray-700">Final</h4>
              {knockout.final ? (
                <MatchRow match={knockout.final} currentTimestamp={currentTimestamp} />
              ) : (
                <div className="text-xs text-gray-500">Sem confronto final ainda.</div>
              )}
            </div>

            {/* Regulamento */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-gray-700">Regulamento</h4>
              <div className="border rounded-lg p-3 bg-white text-sm text-gray-700 space-y-2">
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>Formato:</strong> torneio de <strong>mata-mata eliminatório</strong>.</li>
                  <li><strong>Estrutura:</strong> oitavas → quartas → semifinais → final.</li>
                  <li><strong>Eliminação:</strong> quem perde está <strong>fora do torneio</strong>.</li>
                  <li><strong>Partidas:</strong> jogo único por confronto.</li>
                  <li><strong>Desempate:</strong> pode haver prorrogação e/ou pênaltis conforme necessário.</li>
                </ul>
              </div>
            </div>
          </section>
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