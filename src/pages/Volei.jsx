// src/pages/Volei.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabaseClient";
import TeamBadge from "../components/TeamBadge";

const SPORT_ICON = "🏐";

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
      : "bg-blue-100 text-blue-700"; // scheduled

  return (
    <span className={`${base} ${style}`}>
      {STATUS_LABEL[status] || status}
    </span>
  );
}

function MatchRow({ match, currentTimestamp }) {
  const home = match.home;
  const away = match.away;

  const showScore = match.status !== "scheduled";

  const homePts = typeof match.home_score === "number" ? match.home_score : 0;
  const awayPts = typeof match.away_score === "number" ? match.away_score : 0;

  const hs = Number(match?.meta?.home_sets || 0);
  const as = Number(match?.meta?.away_sets || 0);
  const hasSets = hs > 0 || as > 0;

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
            {SPORT_ICON} Vôlei
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

        {/* Centro: sets + pontos (quando não agendado) */}
        <div className="shrink-0 text-center">
          {showScore ? (
            <>
              {hasSets && (
                <div className="text-xs font-semibold tabular-nums mb-0.5">
                  Sets: {hs} <span className="text-gray-400">x</span> {as}
                </div>
              )}
              <div className="font-bold text-lg tabular-nums">
                {homePts} <span className="text-gray-400">x</span> {awayPts}
              </div>
            </>
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
   Bracket
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

/* ============================
   Agregação específica do Vôlei
   ============================ */

// Agrega estatísticas por equipe a partir dos jogos de GRUPOS já ENCERRADOS.
// Regras: vencedor é quem tem mais sets; se sets empatarem, decide por pontos do placar.
function computeVolleyAgg(matches) {
  const agg = {}; // teamId -> { mp, wins, losses, sv, sp, pf, pa }

  const add = (id) => {
    if (!agg[id]) agg[id] = { mp: 0, wins: 0, losses: 0, sv: 0, sp: 0, pf: 0, pa: 0 };
  };

  for (const m of matches || []) {
    if (m.stage !== "grupos" || m.status !== "finished") continue;

    const hid = m.home_team_id || m.home?.id;
    const aid = m.away_team_id || m.away?.id;
    if (!hid || !aid) continue;

    const hs = Number(m?.meta?.home_sets ?? 0);
    const as = Number(m?.meta?.away_sets ?? 0);
    const hp = Number(m?.home_score ?? 0);
    const ap = Number(m?.away_score ?? 0);

    add(hid);
    add(aid);

    agg[hid].mp += 1;
    agg[aid].mp += 1;

    agg[hid].sv += hs;  agg[hid].sp += as;
    agg[aid].sv += as;  agg[aid].sp += hs;

    agg[hid].pf += hp;  agg[hid].pa += ap;
    agg[aid].pf += ap;  agg[aid].pa += hp;

    // decide vencedor da PARTIDA
    let homeWon = false;
    if (hs !== as) homeWon = hs > as;
    else if (hp !== ap) homeWon = hp > ap;
    else homeWon = false; // deveria não acontecer; trate como derrota do mandante para não empatar

    if (homeWon) {
      agg[hid].wins += 1;
      agg[aid].losses += 1;
    } else {
      agg[aid].wins += 1;
      agg[hid].losses += 1;
    }
  }

  return agg;
}

// Enriquece as linhas vindas do banco com os números apurados no vôlei
function enrichStandingsWithVolley(standings, teamsById, agg) {
  return (standings || []).map((r) => {
    const a = agg[r.team_id] || { mp: 0, wins: 0, losses: 0, sv: 0, sp: 0, pf: 0, pa: 0 };
    return {
      ...r,
      team_name:
        (teamsById[r.team_id] && teamsById[r.team_id].name) ||
        r.team_name ||
        teamsById[r.team_id] ||
        "—",
      matches_played: a.mp,
      wins: a.wins,
      losses: a.losses,
      sv: a.sv,
      sp: a.sp,
      pf: a.pf,
      pa: a.pa,
      points: a.wins * 3, // ranking points: 3 por vitória; sem empates
    };
  });
}

// Ordenação: Pts ↓, SV ↓, SP ↑, (PF−PA) ↓, id ↑
function compareVolleyRows(a, b) {
  const ap = Number(a.points ?? 0);
  const bp = Number(b.points ?? 0);
  if (bp !== ap) return bp - ap;

  const asv = Number(a.sv ?? 0);
  const bsv = Number(b.sv ?? 0);
  if (bsv !== asv) return bsv - asv;

  const asp = Number(a.sp ?? 0);
  const bsp = Number(b.sp ?? 0);
  if (asp !== bsp) return asp - bsp; // menos SP é melhor

  const adiff = Number(a.pf ?? 0) - Number(a.pa ?? 0);
  const bdiff = Number(b.pf ?? 0) - Number(b.pa ?? 0);
  if (bdiff !== adiff) return bdiff - adiff;

  return String(a.team_id).localeCompare(String(b.team_id));
}

/* ============================
   Semis (provisórias) com as novas regras
   ============================ */
function computeProvisionalSemis(enrichedStandings, teamsById) {
  if (!Array.isArray(enrichedStandings) || enrichedStandings.length === 0) return null;

  const byGroup = {};
  for (const r of enrichedStandings) {
    const g = r.group_name || "-";
    if (!byGroup[g]) byGroup[g] = [];
    byGroup[g].push(r);
  }
  for (const g of Object.keys(byGroup)) {
    byGroup[g].sort(compareVolleyRows);
  }

  const top = (g, idx) => (byGroup[g] && byGroup[g][idx] ? byGroup[g][idx] : null);

  const winA = top("A", 0);
  const winB = top("B", 0);
  const winC = top("C", 0);

  const seconds = [top("A", 1), top("B", 1), top("C", 1)].filter(Boolean).sort(compareVolleyRows);
  const bestSecond = seconds[0];

  if (!(winA && winB && winC && bestSecond)) return null;

  const getTeam = (id) => ({
    id,
    name: teamsById[id]?.name || teamsById[id] || "—",
    logo_url: teamsById[id]?.logo_url,
    color: teamsById[id]?.color,
  });

  return {
    semi1: { home: getTeam(winA.team_id), away: getTeam(winB.team_id) },
    semi2: { home: getTeam(winC.team_id), away: getTeam(bestSecond.team_id) },
  };
}

function extractKnockout(matches) {
  const byStage = (stage) =>
    (matches || [])
      .filter((m) => m.stage === stage)
      .sort((a, b) => (a.round || 0) - (b.round || 0));

  const semis = byStage("semi");
  const final = byStage("final");
  const third = byStage("3lugar");

  return { semi1: semis[0], semi2: semis[1], final: final[0], third: third[0] };
}

/* ============================
   Classificação (render)
   ============================ */
function StandingsTable({ rows, teamsById }) {
  const groups = useMemo(() => {
    const map = {};
    for (const r of rows || []) {
      const g = r.group_name || "-";
      if (!map[g]) map[g] = [];
      map[g].push(r);
    }
    for (const g of Object.keys(map)) {
      map[g].sort(compareVolleyRows);
    }
    return map;
  }, [rows]);

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
                <th className="py-1 text-center w-10">D</th>
                <th className="py-1 text-center w-10">SV</th>
                <th className="py-1 text-center w-10">SP</th>
                <th className="py-1 text-center w-12">Pts</th>
              </tr>
            </thead>
            <tbody>
              {groups[g].map((row, idx) => {
                const team =
                  teamsById[row.team_id] && typeof teamsById[row.team_id] === "object"
                    ? teamsById[row.team_id]
                    : { id: row.team_id, name: row.team_name || teamsById[row.team_id] || "—" };

                return (
                  <tr key={`${g}-${row.team_id}`} className="border-b">
                    <td className="py-1 pl-3">{idx + 1}</td>
                    <td className="py-1">
                      <Link to={`/team/${team.id}`} className="hover:underline flex items-center gap-2">
                        <TeamBadge team={team} size={20} />
                        <span className="truncate">{team.name}</span>
                      </Link>
                    </td>
                    <td className="py-1 text-center">{row.matches_played}</td>
                    <td className="py-1 text-center">{row.wins}</td>
                    <td className="py-1 text-center">{row.losses}</td>
                    <td className="py-1 text-center">{row.sv}</td>
                    <td className="py-1 text-center">{row.sp}</td>
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
   Helper para garantir standings zeradas E recalcular quando necessário
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

// Nova função para forçar recálculo das standings
const recalculateStandings = async (sportName) => {
  try {
    console.log('🔄 Recalculando standings para:', sportName);
    await supabase.rpc("recalculate_standings", {
      p_sport_name: sportName,
    });
    console.log('✅ Standings recalculadas com sucesso');
  } catch (err) {
    console.error("Erro ao recalcular standings:", err);
  }
};

/* ============================
   Página Vôlei
   ============================ */
export default function Volei() {
  const [sportId, setSportId] = useState(null);
  const [matches, setMatches] = useState([]);
  const [standings, setStandings] = useState([]);
  const [enriched, setEnriched] = useState([]); // standings já enriquecida p/ vôlei
  const [teamsById, setTeamsById] = useState({});
  const [loading, setLoading] = useState(true);
  const [currentTimestamp, setCurrentTimestamp] = useState(Date.now());
  const channelRef = useRef(null);
  const timerRef = useRef(null);
  const koEnsuredRef = useRef(false);
  
  // Novo ref para detectar mudanças em partidas finalizadas
  const finishedMatchesRef = useRef(new Map());

  const loadSportId = async () => {
    const { data } = await supabase.from("sports").select("id").eq("name", "Volei").maybeSingle();
    if (data?.id) setSportId(data.id);
  };

  const loadTeams = async (sid) => {
    const { data } = await supabase.from("teams").select("id, name, logo_url, color").eq("sport_id", sid);
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

      rows = (j.data || []).map((r) => ({ ...r, team_name: r.team?.name })) || [];
    }

    setStandings(rows || []);
  };

  const loadAll = async (sid) => {
    setLoading(true);
    await Promise.all([loadTeams(sid), loadMatches(sid), loadStandings(sid), ensureInitialStandings("Volei")]);
    setLoading(false);
  };

  // Nova função para detectar mudanças em partidas finalizadas
  const detectFinishedMatchChanges = (newMatches) => {
    const currentFinished = new Map();
    let hasChanges = false;

    // Mapear partidas finalizadas atuais
    newMatches
      .filter(m => m.status === 'finished')
      .forEach(m => {
        const key = m.id;
        // Para vôlei, incluir tanto o placar quanto os sets na chave
        const scoreKey = `${m.home_score}-${m.away_score}_${m?.meta?.home_sets || 0}-${m?.meta?.away_sets || 0}`;
        currentFinished.set(key, scoreKey);

        // Verificar se houve mudança no placar ou sets
        const oldScore = finishedMatchesRef.current.get(key);
        if (oldScore && oldScore !== scoreKey) {
          console.log(`🔄 Detectada mudança na partida ${m.id}: ${oldScore} → ${scoreKey}`);
          hasChanges = true;
        }
      });

    // Atualizar a referência
    finishedMatchesRef.current = currentFinished;

    // Se houve mudanças, recalcular standings
    if (hasChanges) {
      console.log('🔄 Mudanças detectadas em partidas finalizadas, recalculando standings...');
      recalculateStandings("Volei").then(() => {
        // Recarregar standings após recálculo
        if (sportId) {
          loadStandings(sportId);
        }
      });
    }
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

    // Realtime: eventos e mudanças de partidas
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase
      .channel("volei-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "match_events" },
        () => {
          console.log('📡 Match events changed, reloading standings...');
          loadStandings(sportId);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matches" },
        (payload) => {
          console.log('📡 Matches changed:', payload);
          loadAll(sportId);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "standings" },
        () => {
          console.log('📡 Standings changed, reloading...');
          loadStandings(sportId);
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    };
  }, [sportId]);

  // Detectar mudanças em partidas finalizadas sempre que matches mudar
  useEffect(() => {
    if (matches.length > 0) {
      detectFinishedMatchChanges(matches);
    }
  }, [matches]);

  // ======= apuração específica do vôlei =======
  const agg = useMemo(() => computeVolleyAgg(matches), [matches]);

  useEffect(() => {
    // sempre que standings/matches/teams mudarem, refaz a tabela enriquecida
    setEnriched(enrichStandingsWithVolley(standings, teamsById, agg));
  }, [standings, teamsById, agg]);

  // ======= listas visuais =======
  const scheduled = useMemo(() => {
    const arr = matches.filter(
      (m) =>
        m.status === "scheduled" &&
        (m.group_name || (m.home_team_id && m.away_team_id))
    );
    arr.sort((a, b) => {
      const da = a.starts_at ? new Date(a.starts_at).getTime() : Number.POSITIVE_INFINITY;
      const db = b.starts_at ? new Date(b.starts_at).getTime() : Number.POSITIVE_INFINITY;
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
      (a, b) => new Date(b.updated_at || b.starts_at || 0) - new Date(a.updated_at || a.starts_at || 0)
    );
    return arr;
  }, [matches]);

  const knockout = useMemo(() => extractKnockout(matches), [matches]);

  // Semis provisórias (se o servidor ainda não preencheu os slots)
  const provisionalSemis = useMemo(() => {
    const hasDefAny =
      (knockout?.semi1 && knockout.semi1.home_team_id && knockout.semi1.away_team_id) ||
      (knockout?.semi2 && knockout.semi2.home_team_id && knockout.semi2.away_team_id);
    if (hasDefAny) return null;
    return computeProvisionalSemis(enriched, teamsById);
  }, [knockout, enriched, teamsById]);

  // Quando TODOS os jogos da fase de grupos terminarem, garante o agendamento das semis/finais no servidor
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

      await supabase.rpc("maybe_create_knockout", { p_sport_name: "Volei" });
      koEnsuredRef.current = true;
      await loadAll(sportId);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sportId, allGroupMatchesFinished, semisDefinitiveBoth]);

  // ======= Cartas do bracket =======
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

  return (
    <div className="space-y-10">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{SPORT_ICON}</span>
          <h2 className="text-2xl font-bold">Vôlei</h2>
        </div>
        <p className="text-sm text-gray-600">
          Partidas em <strong>um set de 15 pontos</strong>, com <strong>2 pontos de vantagem</strong> para vencer.
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
          {/* Botão manual para recalcular standings (para debug/admin) */}
          {process.env.NODE_ENV === 'development' && (
            <div className="border-2 border-dashed border-orange-200 p-3 rounded">
              <p className="text-xs text-orange-600 mb-2">
                🛠️ Modo desenvolvimento - Ferramentas de debug:
              </p>
              <button
                onClick={() => recalculateStandings("Volei").then(() => loadStandings(sportId))}
                className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded hover:bg-orange-200"
              >
                🔄 Recalcular standings manualmente
              </button>
            </div>
          )}

          {/* Partidas */}
          <section className="space-y-6">
            <h3 className="text-lg font-bold">Partidas</h3>

            <div className="space-y-4">
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

            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-gray-700">Tabela de classificação</h4>
              <StandingsTable rows={enriched} teamsById={teamsById} />
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
                    Chaveamento ainda não disponível. Assim que houver classificação suficiente, os confrontos serão exibidos aqui.
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

            {/* Regulamento */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-gray-700">Regulamento</h4>
              <div className="border rounded-lg p-3 bg-white text-sm text-gray-700 space-y-2">
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>Vitória do jogo:</strong> definida por <strong>sets</strong>; se empatar em sets, desempata por <strong>pontos do placar</strong>.</li>
                  <li><strong>Classificação nos grupos:</strong> <strong>Pts</strong> (3 por vitória) ↓, depois <strong>SV</strong> ↓, <strong>SP</strong> ↑, e saldo de pontos ↓.</li>
                  <li><strong>Duração/placar:</strong> partidas em <strong>um set de 15 pontos</strong>, com <strong>2 de vantagem</strong>.</li>
                  <li><strong>Semifinais:</strong> <em>Venc. A × Venc. B</em> e <em>Venc. C × Melhor 2º</em>.</li>
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