// src/pages/Futsal.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabaseClient";
import TeamBadge from "../components/TeamBadge";

// Ícone do esporte
const SPORT_ICON = "⚽";

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

// Badge de status + relógio (para jogos)
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

// Card compacto para cada partida
function MatchRow({ match, currentTimestamp }) {
  const home = match.home;
  const away = match.away;

  // ✅ Mostrar placar somente quando NÃO estiver "scheduled"
  const shouldShowScore = match.status !== "scheduled";
  const homeScore = typeof match.home_score === "number" ? match.home_score : 0;
  const awayScore = typeof match.away_score === "number" ? match.away_score : 0;

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
            {SPORT_ICON} Futsal
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
   Chaveamento (Bracket)
   ============================ */

function BracketCard({ title, home, away, badge }) {
  const H = home || {};
  const A = away || {};
  return (
    <div className="rounded-lg border p-3 bg-white">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] font-semibold text-gray-500">{title}</div>
        {badge && (
          <span
            className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded ${
              badge === "Definitivo"
                ? "bg-green-100 text-green-700"
                : "bg-yellow-100 text-yellow-700"
            }`}
          >
            {badge}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <TeamBadge team={H.id ? H : { name: "A definir" }} size={24} />
          <span
            className={`truncate text-sm ${H.id ? "text-gray-900" : "text-gray-400"}`}
            title={H.name || "A definir"}
          >
            {H.name || "A definir"}
          </span>
        </div>
        <div className="text-gray-400 text-xs">vs</div>
        <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
          <span
            className={`truncate text-sm text-right ${A.id ? "text-gray-900" : "text-gray-400"}`}
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

// Projeção provisória das semis (igual ao regulamento):
// SF1: Vencedor A × Vencedor B
// SF2: Vencedor C × Melhor 2º (por pontos, depois saldo, depois gols pró)
function computeProvisionalSemis(standings, teamsById) {
  if (!Array.isArray(standings) || standings.length === 0) return null;

  const getTeam = (id) => ({
    id,
    name: teamsById[id]?.name || teamsById[id] || "—",
    logo_url: teamsById[id]?.logo_url,
    color: teamsById[id]?.color,
  });

  const winA = standings.find((r) => r.group_name === "A" && r.rank === 1);
  const winB = standings.find((r) => r.group_name === "B" && r.rank === 1);
  const winC = standings.find((r) => r.group_name === "C" && r.rank === 1);

  const seconds = standings.filter((r) => r.rank === 2);
  seconds.sort(
    (a, b) =>
      (b.points ?? 0) - (a.points ?? 0) ||
      (b.goal_difference ?? 0) - (a.goal_difference ?? 0) ||
      (b.goals_for ?? 0) - (a.goals_for ?? 0) ||
      String(a.team_id).localeCompare(String(b.team_id))
  );
  const bestSecond = seconds[0];

  if (!(winA && winB && winC && bestSecond)) return null;

  return {
    semi1: { home: getTeam(winA.team_id), away: getTeam(winB.team_id) },
    semi2: { home: getTeam(winC.team_id), away: getTeam(bestSecond.team_id) },
  };
}

// Extrai partidas reais do mata-mata, se existirem
function extractKnockout(matches) {
  const byStage = (stage) =>
    (matches || [])
      .filter((m) => m.stage === stage)
      .sort((a, b) => (a.round || 0) - (b.round || 0));

  const semis = byStage("semi");
  const final = byStage("final");
  const third = byStage("3lugar");

  return {
    semi1: semis[0],
    semi2: semis[1],
    final: final[0],
    third: third[0],
  };
}

/* ============================
   Classificação (Standings)
   ============================ */

function StandingsTable({ standings, teamsById }) {
  // Agrupa por grupo
  const groups = useMemo(() => {
    const map = {};
    for (const r of standings || []) {
      const g = r.group_name || "-";
      if (!map[g]) map[g] = [];
      map[g].push(r);
    }
    for (const g of Object.keys(map)) {
      map[g].sort((a, b) => (a.rank || 99) - (b.rank || 99));
    }
    return map;
  }, [standings]);

  const groupKeys = Object.keys(groups).sort();

  if (groupKeys.length === 0) {
    return <div className="text-xs text-gray-500">Sem dados de classificação.</div>;
  }

  return (
    <div className="space-y-6">
      {groupKeys.map((g) => (
        <div key={g} className="border rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-gray-50 border-b text-sm font-semibold">
            Grupo {g}
          </div>
          <table className="min-w-full text-xs sm:text-sm">
            <thead>
              <tr className="border-b text-gray-600">
                <th className="py-1 pl-3 text-left w-10">#</th>
                <th className="py-1 text-left">Time</th>
                <th className="py-1 text-center w-10">P</th>
                <th className="py-1 text-center w-10">V</th>
                <th className="py-1 text-center w-10">E</th>
                <th className="py-1 text-center w-10">D</th>
                <th className="py-1 text-center w-10">GP</th>
                <th className="py-1 text-center w-10">GC</th>
                <th className="py-1 text-center w-12">+/-</th>
                <th className="py-1 text-center w-12">Pts</th>
              </tr>
            </thead>
            <tbody>
              {groups[g].map((row) => {
                const team =
                  teamsById[row.team_id] && typeof teamsById[row.team_id] === "object"
                    ? teamsById[row.team_id]
                    : {
                        id: row.team_id,
                        name: row.team_name || teamsById[row.team_id] || "—",
                      };

                return (
                  <tr key={`${g}-${row.rank}-${row.team_id}`} className="border-b">
                    <td className="py-1 pl-3">{row.rank}</td>
                    <td className="py-1">
                      <Link
                        to={`/team/${team.id}`}
                        className="hover:underline flex items-center gap-2"
                      >
                        <TeamBadge team={team} size={20} />
                        <span className="truncate">{team.name}</span>
                      </Link>
                    </td>
                    <td className="py-1 text-center">{row.matches_played}</td>
                    <td className="py-1 text-center">{row.wins}</td>
                    <td className="py-1 text-center">{row.draws}</td>
                    <td className="py-1 text-center">{row.losses}</td>
                    <td className="py-1 text-center">{row.goals_for}</td>
                    <td className="py-1 text-center">{row.goals_against}</td>
                    <td className="py-1 text-center">{row.goal_difference}</td>
                    <td className="py-1 text-center font-semibold">{row.points}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

/* ============================
   Helper para garantir standings zeradas
   ============================ */
const ensureInitialStandings = async (sportName) => {
  try {
    await supabase.rpc("seed_initial_standings", {
      p_sport_name: sportName,
      p_reset: false,
    });
  } catch (err) {
    console.warn("seed_initial_standings exception:", err);
  }
};

/* ============================
   PÁGINA PRINCIPAL DE FUTSAL
   ============================ */

export default function Futsal() {
  const [sportId, setSportId] = useState(null);
  const [matches, setMatches] = useState([]);
  const [standings, setStandings] = useState([]);
  const [teamsById, setTeamsById] = useState({});
  const [loading, setLoading] = useState(true);
  const [currentTimestamp, setCurrentTimestamp] = useState(Date.now());
  const channelRef = useRef(null);
  const timerRef = useRef(null);
  const koEnsuredRef = useRef(false); // evita chamar RPC várias vezes

  // Carrega o ID do esporte Futsal
  const loadSportId = async () => {
    const { data } = await supabase
      .from("sports")
      .select("id")
      .eq("name", "Futsal")
      .maybeSingle();
    if (data?.id) setSportId(data.id);
  };

  // Carrega todos os times do esporte
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

  // Carrega todas as partidas
  const loadMatches = async (sid) => {
    const { data } = await supabase
      .from("matches")
      .select(`
        id,
        stage,
        round,
        group_name,
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
      .order("round", { ascending: true, nullsFirst: true })
      .order("starts_at", { ascending: true, nullsFirst: true });
    
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

  // Carrega standings (view ou fallback)
  const loadStandings = async (sid) => {
    let rows = null;

    const v = await supabase
      .from("standings_view")
      .select(
        "group_name, rank, team_id, team_name, matches_played, wins, draws, losses, goals_for, goals_against, goal_difference, points"
      )
      .eq("sport_id", sid)
      .order("group_name", { ascending: true, nullsFirst: true })
      .order("rank", { ascending: true });

    if (!v.error && v.data) rows = v.data;

    if (!rows) {
      const j = await supabase
        .from("standings")
        .select(`
          group_name,
          rank,
          team_id,
          matches_played,
          wins, draws, losses,
          goals_for, goals_against, goal_difference,
          points,
          team:teams!standings_team_id_fkey(name, logo_url, color, id)
        `)
        .eq("sport_id", sid)
        .order("group_name", { ascending: true, nullsFirst: true })
        .order("rank", { ascending: true });

      rows =
        (j.data || []).map((r) => ({
          ...r,
          team_name: r.team?.name,
        })) || [];
    }

    setStandings(rows || []);
  };

  const loadAll = async (sid) => {
    setLoading(true);
    await Promise.all([
      loadTeams(sid),
      loadMatches(sid),
      loadStandings(sid),
      ensureInitialStandings("Futsal"),
    ]);
    setLoading(false);
  };

  // Efeitos
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

    // Realtime: eventos e mudanças de partidas
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase
      .channel("futsal-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "match_events" },
        () => loadStandings(sportId)
      )
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

  // ======= listas visuais =======

  // Agendados: APENAS jogos definidos (grupos sempre definidos; KO só se tiverem os dois times)
  const scheduled = useMemo(() => {
    const arr = matches.filter(
      (m) =>
        m.status === "scheduled" &&
        (
          m.group_name ||
          (m.home_team_id && m.away_team_id)
        )
    );
    arr.sort((a, b) => {
      const da = a.starts_at
        ? new Date(a.starts_at).getTime()
        : Number.POSITIVE_INFINITY;
      const db = b.starts_at
        ? new Date(b.starts_at).getTime()
        : Number.POSITIVE_INFINITY;
      return da - db;
    });
    return arr;
  }, [matches]);

  const liveOrPaused = useMemo(
    () => matches.filter((m) => m.status === "ongoing" || m.status === "paused"),
    [matches]
  );

  const finished = useMemo(() => {
    const arr = matches.filter((m) => m.status === "finished");
    arr.sort(
      (a, b) =>
        new Date(b.updated_at || b.starts_at || 0) -
        new Date(a.updated_at || a.starts_at || 0)
    );
    return arr;
  }, [matches]);

  // KO real do banco
  const knockout = useMemo(() => extractKnockout(matches), [matches]);

  // Semis provisórias (quando o servidor ainda não definiu os slots)
  const provisionalSemis = useMemo(() => {
    const hasDefAny =
      (knockout?.semi1 && knockout.semi1.home_team_id && knockout.semi1.away_team_id) ||
      (knockout?.semi2 && knockout.semi2.home_team_id && knockout.semi2.away_team_id);
    if (hasDefAny) return null;
    return computeProvisionalSemis(standings, teamsById);
  }, [knockout, standings, teamsById]);

  // Quando TODOS os jogos de grupos terminarem, pede ao servidor pra criar/preencher semis/final/3º (idempotente)
  const allGroupMatchesFinished = useMemo(() => {
    const gm = matches.filter((m) => m.stage === "grupos");
    if (gm.length === 0) return false;
    return gm.every((m) => m.status === "finished");
  }, [matches]);

  const semisDefinitiveBoth =
    knockout?.semi1?.home_team_id &&
    knockout?.semi1?.away_team_id &&
    knockout?.semi2?.home_team_id &&
    knockout?.semi2?.away_team_id;

  useEffect(() => {
    (async () => {
      if (!sportId) return;
      if (!allGroupMatchesFinished) return;
      if (semisDefinitiveBoth) return;
      if (koEnsuredRef.current) return;

      await supabase.rpc("maybe_create_knockout", { p_sport_name: "Futsal" });
      koEnsuredRef.current = true;
      await loadAll(sportId);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sportId, allGroupMatchesFinished, semisDefinitiveBoth]);

  // ======= Cartas do bracket =======

  // Semifinais
  const semiCards = useMemo(() => {
    const cards = [];

    if (knockout.semi1 && knockout.semi1.home && knockout.semi1.away && knockout.semi1.home.id && knockout.semi1.away.id) {
      cards.push({
        title: "Semifinal 1",
        home: knockout.semi1.home,
        away: knockout.semi1.away,
        badge: "Definitivo",
      });
    } else if (provisionalSemis?.semi1) {
      cards.push({
        title: "Semifinal 1 (provisória) — Venc. Grupo A × Venc. Grupo B",
        home: provisionalSemis.semi1.home,
        away: provisionalSemis.semi1.away,
        badge: "Provisório",
      });
    }

    if (knockout.semi2 && knockout.semi2.home && knockout.semi2.away && knockout.semi2.home.id && knockout.semi2.away.id) {
      cards.push({
        title: "Semifinal 2",
        home: knockout.semi2.home,
        away: knockout.semi2.away,
        badge: "Definitivo",
      });
    } else if (provisionalSemis?.semi2) {
      cards.push({
        title: "Semifinal 2 (provisória) — Venc. Grupo C × Melhor 2º",
        home: provisionalSemis.semi2.home,
        away: provisionalSemis.semi2.away,
        badge: "Provisório",
      });
    }

    return cards;
  }, [knockout, provisionalSemis]);

  // Final
  const finalCards = useMemo(() => {
    const out = [];

    const hasDefFinal =
      knockout.final &&
      knockout.final.home_team_id &&
      knockout.final.away_team_id &&
      knockout.final.home &&
      knockout.final.away;

    if (hasDefFinal) {
      out.push({
        title: "Final",
        home: knockout.final.home,
        away: knockout.final.away,
        badge: "Definitivo",
      });
    } else {
      if (provisionalSemis || knockout.semi1 || knockout.semi2) {
        out.push({
          title: "Final (provisória)",
          home: { id: "w-s1", name: "Vencedor Semi 1" },
          away: { id: "w-s2", name: "Vencedor Semi 2" },
          badge: "Provisório",
        });
      }
    }

    return out;
  }, [knockout, provisionalSemis]);

  // 3º lugar (se houver)
  const thirdCards = useMemo(() => {
    const out = [];

    const hasDefThird =
      knockout.third &&
      knockout.third.home_team_id &&
      knockout.third.away_team_id &&
      knockout.third.home &&
      knockout.third.away;

    if (hasDefThird) {
      out.push({
        title: "3º lugar",
        home: knockout.third.home,
        away: knockout.third.away,
        badge: "Definitivo",
      });
    } else {
      if (provisionalSemis || knockout.semi1 || knockout.semi2) {
        out.push({
          title: "3º lugar (provisório)",
          home: { id: "l-s1", name: "Perdedor Semi 1" },
          away: { id: "l-s2", name: "Perdedor Semi 2" },
          badge: "Provisório",
        });
      }
    }

    return out;
  }, [knockout, provisionalSemis]);

  // Render
  return (
    <div className="space-y-10">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{SPORT_ICON}</span>
          <h2 className="text-2xl font-bold">Futsal</h2>
        </div>
        <p className="text-sm text-gray-600">
          Duração oficial: <strong>10 minutos corridos</strong>. Toque em uma partida para ver os detalhes (status, tempo, elenco).
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
          <section className="space-y-6">
            <h3 className="text-lg font-bold">Partidas</h3>

            <div className="space-y-4">
              {/* Ao vivo / Pausado */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-gray-700">Ao vivo / Pausado</h4>
                {liveOrPaused.length === 0 ? (
                  <div className="text-xs text-gray-500">Nenhuma partida em andamento.</div>
                ) : (
                  <div className="grid md:grid-cols-2 gap-3">
                    {liveOrPaused.map((m) => (
                      <MatchRow key={m.id} match={m} currentTimestamp={currentTimestamp} />
                    ))}
                  </div>
                )}
              </div>

              {/* Agendados (somente definidos) */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-gray-700">Agendados</h4>
                {scheduled.length === 0 ? (
                  <div className="text-xs text-gray-500">Nenhuma partida agendada.</div>
                ) : (
                  <div className="grid md:grid-cols-2 gap-3">
                    {scheduled.map((m) => (
                      <MatchRow key={m.id} match={m} currentTimestamp={currentTimestamp} />
                    ))}
                  </div>
                )}
              </div>

              {/* Encerrados */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-gray-700">Encerrados (recentes)</h4>
                {finished.length === 0 ? (
                  <div className="text-xs text-gray-500">Sem resultados recentes.</div>
                ) : (
                  <div className="grid md:grid-cols-2 gap-3">
                    {finished.map((m) => (
                      <MatchRow key={m.id} match={m} currentTimestamp={currentTimestamp} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Informações do campeonato */}
          <section className="space-y-6">
            <h3 className="text-lg font-bold">Informações do campeonato</h3>

            {/* Classificação */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-gray-700">Tabela de classificação</h4>
              <StandingsTable standings={standings} teamsById={teamsById} />
            </div>

            {/* Chaveamento */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-gray-700">Chaveamento</h4>

              <div className="grid md:grid-cols-2 gap-3">
                {semiCards.length > 0 ? (
                  semiCards.map((c, i) => (
                    <BracketCard key={i} title={c.title} home={c.home} away={c.away} badge={c.badge} />
                  ))
                ) : (
                  <div className="col-span-full text-xs text-gray-500">
                    Chaveamento ainda não disponível. Assim que houver resultados ou classificação suficiente, os confrontos serão exibidos aqui.
                  </div>
                )}
              </div>

              {(finalCards.length > 0 || thirdCards.length > 0) && (
                <div className="grid md:grid-cols-2 gap-3">
                  {finalCards.map((c, i) => (
                    <BracketCard key={`f-${i}`} title={c.title} home={c.home} away={c.away} badge={c.badge} />
                  ))}
                  {thirdCards.map((c, i) => (
                    <BracketCard key={`t-${i}`} title={c.title} home={c.home} away={c.away} badge={c.badge} />
                  ))}
                </div>
              )}
            </div>

            {/* Regulamento (OFICIAL) */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-gray-700">Regulamento</h4>
              <div className="border rounded-lg p-3 bg-white text-sm text-gray-700 space-y-2">
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>Duração:</strong> partidas de <strong>10 minutos corridos</strong>.</li>
                  <li><strong>Formato:</strong> fase de grupos (3 grupos de 3 equipes) e mata-mata.</li>
                  <li><strong>Classificação para o mata-mata:</strong> avançam o <strong>1º</strong> de cada grupo e o <strong>melhor 2º</strong> colocado geral.</li>
                  <li><strong>Desempate nos grupos:</strong> em igualdade de pontos, prevalece o <strong>saldo de gols</strong>.</li>
                  <li><strong>Semifinais:</strong>
                    <ul className="list-disc pl-5 mt-1">
                      <li><strong>SF1:</strong> Vencedor do <strong>Grupo A</strong> × Vencedor do <strong>Grupo B</strong></li>
                      <li><strong>SF2:</strong> Vencedor do <strong>Grupo C</strong> × <strong>Melhor 2º</strong></li>
                    </ul>
                  </li>
                  <li><strong>Final:</strong> vencedores das semifinais. Pode haver jogo de 3º lugar a critério da organização.</li>
                  <li><strong>Substituições:</strong> ilimitadas.</li>
                  <li><strong>Antijogo:</strong> desperdício proposital de tempo pode gerar acréscimo ao final, a critério do árbitro.</li>
                  <li><strong>Goleiro-linha:</strong> permitido.</li>
                  <li><strong>Expulsão:</strong> equipe fica com <strong>um a menos por 2 minutos</strong> ou até <strong>sofrer um gol</strong>.</li>
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