// src/pages/Futsal.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabaseClient";
import TeamBadge from "../components/TeamBadge";
import { HelpCircle } from "lucide-react";

/* =========================
   Constantes / helpers
   ========================= */
const SPORT_LABEL = "Futsal";
const SPORT_ICON = "⚽";
const LOGO_BUCKET = "team-logos";
const tz = "America/Sao_Paulo";

const STAGE_FRIENDLY = {
  grupos: "Grupos",
  oitavas: "Oitavas",
  quartas: "Quartas",
  semi: "Semifinal",
  final: "Final",
  "3lugar": "3º lugar",
};
const friendlyStage = (s) => (s ? STAGE_FRIENDLY[s] || s : "");

function parseDateSafe(dt) {
  if (!dt) return null;
  if (dt instanceof Date) return isNaN(dt.getTime()) ? null : dt;
  if (typeof dt === "number") return new Date(dt);
  if (typeof dt === "string") {
    let s = dt.trim();
    if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(:\d{2})?$/.test(s)) s = s.replace(/\s+/, "T");
    let d = new Date(s);
    if (!isNaN(d.getTime())) return d;
    d = new Date(`${s}Z`);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}
function fmtDate(dt) {
  const d = parseDateSafe(dt);
  if (!d) return "";
  try {
    return d.toLocaleString("pt-BR", {
      timeZone: tz,
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}
const ts = (x) => {
  const d = parseDateSafe(x);
  return d ? d.getTime() : Number.POSITIVE_INFINITY;
};

const isHttpUrl = (str) => typeof str === "string" && /^https?:\/\//i.test(str);
const isStoragePath = (str) => typeof str === "string" && !isHttpUrl(str) && str.trim() !== "";
function publicLogoUrl(raw) {
  if (!raw) return null;
  if (isHttpUrl(raw)) return raw;
  if (isStoragePath(raw)) {
    const { data } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(raw);
    return data?.publicUrl || null;
  }
  return null;
}
const normalizeLogo = (raw) => {
  const url = publicLogoUrl(raw);
  return url ? `${url}${url.includes("?") ? "&" : "?"}v=1` : null;
};

/* =========================
   Error Boundary (mostra no UI)
   ========================= */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error("Futsal ErrorBoundary:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <div className="font-semibold mb-1">Algo quebrou ao renderizar esta página.</div>
          <div className="font-mono text-xs whitespace-pre-wrap">
            {String(this.state.error?.message || this.state.error)}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* =========================
   UI: Título compacto
   ========================= */
function TitleLine({ order_idx, stage, group_name }) {
  const parts = [];
  if (order_idx !== undefined && order_idx !== null && String(order_idx).length) parts.push(`Jogo ${order_idx}`);
  if (group_name) parts.push(`Grupo ${group_name}`);
  else if (stage) parts.push(friendlyStage(stage));
  return <div className="mb-1 text-sm font-semibold text-gray-900">{parts.join(" • ") || "—"}</div>;
}

/* =========================
   UI: TeamChip (nome sempre string)
   ========================= */
function TeamChip({ team, align = "left", badge = 28 }) {
  const displayName = (() => {
    const n = team?.name;
    if (typeof n === "string") return n;
    if (n && typeof n === "object" && "name" in n) return String(n.name);
    try { return String(n ?? "A definir"); } catch { return "A definir"; }
  })();

  const has = Boolean(team?.id);
  const isPlaceholder = !has && displayName === "A definir";
  const content = (
    <>
      {align === "right" ? null : <TeamBadge team={{ ...(team || {}), name: displayName }} size={badge} />}
      <span
        className={`truncate max-w-[90px] break-words whitespace-normal ${has ? "text-gray-900" : "text-gray-400 flex items-center gap-1"} ${align === "right" ? "text-right" : ""}`}
        title={displayName}
      >
        {displayName}
        {isPlaceholder ? <HelpCircle className="inline-block ml-1 w-4 h-4 text-gray-400" /> : null}
      </span>
      {align === "right" ? <TeamBadge team={{ ...(team || {}), name: displayName }} size={badge} /> : null}
    </>
  );

  if (!has) {
    return <div className={`min-w-0 flex items-center gap-2 ${align === "right" ? "justify-end" : ""}`}>{content}</div>;
  }
  return (
    <Link
      to={`/team/${team.id}`}
      className={`min-w-0 flex items-center gap-2 hover:underline ${align === "right" ? "justify-end" : ""}`}
      onClick={(e) => e.stopPropagation()}
      title={displayName}
    >
      {content}
    </Link>
  );
}

/* =========================
   Cartões
   ========================= */
function BracketMatchCard({ match, placeholder }) {
  const home = match?.home || (placeholder?.home ? { name: placeholder.home } : null);
  const away = match?.away || (placeholder?.away ? { name: placeholder.away } : null);
  const homeName = home?.name || placeholder?.home || "A definir";
  const awayName = away?.name || placeholder?.away || "A definir";
  const showScore = match?.status && match.status !== "scheduled";
  const homeScore = Number(match?.home_score ?? 0);
  const awayScore = Number(match?.away_score ?? 0);

  const body = (
    <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm transition hover:bg-gray-50">
      <TitleLine order_idx={match?.order_idx} stage={match?.stage} />
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="min-w-0 justify-self-start">
          <TeamChip team={home?.id ? home : { name: homeName }} />
        </div>
        <div className="justify-self-center text-xs text-gray-400">x</div>
        <div className="min-w-0 justify-self-end">
          <TeamChip team={away?.id ? away : { name: awayName }} align="right" />
        </div>
      </div>
      <div className="mt-1 flex items-center justify-between text-[11px] text-gray-500">
        <span className="truncate">{match?.starts_at ? fmtDate(match.starts_at) : match?.venue || ""}</span>
        {showScore ? (
          <span className="tabular-nums font-semibold text-gray-700">
            {homeScore} <span className="text-gray-400">x</span> {awayScore}
          </span>
        ) : null}
      </div>
    </div>
  );

  return match?.id ? (
    <Link to={`/match/${match.id}`} className="block">{body}</Link>
  ) : (
    <div className="block">{body}</div>
  );
}

function ListMatchCard({ match }) {
  const showScore = match?.status && match.status !== "scheduled";
  const homeScore = Number(match?.home_score ?? 0);
  const awayScore = Number(match?.away_score ?? 0);

  return (
    <Link to={`/match/${match.id}`} className="block rounded-xl border border-gray-200 bg-white p-3 shadow-sm transition hover:bg-gray-50">
      <TitleLine order_idx={match.order_idx} stage={match.stage} group_name={match.group_name} />
      <div className="mt-1 grid grid-cols-3 items-center gap-2">
        <TeamChip team={match.home} />
        <div className="text-center">
          {showScore ? (
            <span className="text-base font-bold tabular-nums">
              {homeScore} <span className="text-gray-400">x</span> {awayScore}
            </span>
          ) : (
            <span className="text-xs text-gray-500">—</span>
          )}
        </div>
        <TeamChip team={match.away} align="right" />
      </div>
      <div className="mt-1 flex items-center justify-between text-[11px] text-gray-500">
        <span className="truncate">{match?.starts_at ? fmtDate(match.starts_at) : match?.venue || ""}</span>
        {match?.updated_at && match?.status === "finished" ? <span>Encerrado em {fmtDate(match.updated_at)}</span> : null}
      </div>
    </Link>
  );
}

// Ordena: Pontos ↓, Vitórias ↓, Saldo de Gols ↓, Gols Pró ↓, (fallback por id)
function compareByPoints(a, b) {
  const ap = Number(a.points ?? 0), bp = Number(b.points ?? 0);
  if (bp !== ap) return bp - ap;

  const aw = Number(a.wins ?? 0), bw = Number(b.wins ?? 0);
  if (bw !== aw) return bw - aw;

  const agd = Number(
    a.goal_difference ?? (Number(a.goals_for ?? 0) - Number(a.goals_against ?? 0))
  );
  const bgd = Number(
    b.goal_difference ?? (Number(b.goals_for ?? 0) - Number(b.goals_against ?? 0))
  );
  if (bgd !== agd) return bgd - agd;

  const agf = Number(a.goals_for ?? 0), bgf = Number(b.goals_for ?? 0);
  if (bgf !== agf) return bgf - agf;

  return String(a.team_id).localeCompare(String(b.team_id));
}

// Critério de ordenação provisória (igual compareByPoints)
function sortRule(a, b) {
  return (
    (b.points ?? 0) - (a.points ?? 0) ||
    (b.wins ?? 0) - (a.wins ?? 0) ||
    (b.goal_difference ?? 0) - (a.goal_difference ?? 0) ||
    (b.goals_for ?? 0) - (a.goals_for ?? 0) ||
    String(a.team_id).localeCompare(String(b.team_id))
  );
}

function computeProvisionalSemis(standings, teamsById = {}) {
  if (!Array.isArray(standings) || standings.length === 0) return [];

  const mkTeam = (row) => {
    const t = teamsById[row.team_id];
    return t
      ? { id: row.team_id, name: String(t.name ?? row.team_name ?? "—"), color: t.color, logo_url: t.logo_url }
      : { id: row.team_id, name: String(row.team_name ?? "—") };
  };

  const byGroup = new Map();
  for (const r of standings) {
    const g = r.group_name || "-";
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push(r);
  }
  for (const g of byGroup.keys()) byGroup.get(g).sort(sortRule);

  const winners = [];
  const seconds = [];
  for (const [g, rows] of byGroup) {
    if (rows[0]) winners.push({ group: g, row: rows[0] });
    if (rows[1]) seconds.push({ group: g, row: rows[1] });
  }

  winners.sort((a, b) => sortRule(a.row, b.row));
  seconds.sort((a, b) => sortRule(a.row, b.row));

  const G = winners.length;
  if (G >= 4) {
    const seeds = winners.slice(0, 4);
    return [
      { stage: "semi", home: mkTeam(seeds[0].row), away: mkTeam(seeds[3].row) },
      { stage: "semi", home: mkTeam(seeds[1].row), away: mkTeam(seeds[2].row) },
    ];
  } else if (G === 3) {
    if (!seconds.length) return [];
    return [
      { stage: "semi", home: mkTeam(winners[0].row), away: mkTeam(seconds[0].row) },
      { stage: "semi", home: mkTeam(winners[1].row), away: mkTeam(winners[2].row) },
    ];
  } else if (G === 2) {
    if (seconds.length < 2) return [];
    const seeds = [winners[0].row, winners[1].row, seconds[0].row, seconds[1].row].sort(sortRule);
    return [
      { stage: "semi", home: mkTeam(seeds[0]), away: mkTeam(seeds[3]) },
      { stage: "semi", home: mkTeam(seeds[1]), away: mkTeam(seeds[2]) },
    ];
  }
  return [];
}

/* =========================
   Classificação (tabelas)
   ========================= */
function StandingsTable({ standings, teamsById }) {
  // Garante que todos os times dos grupos apareçam, mesmo zerados
  const groups = useMemo(() => {
    // 1. Agrupa standings existentes
    const map = {};
    for (const r of standings || []) {
      const g = r.group_name || "-";
      if (!map[g]) map[g] = [];
      map[g].push(r);
    }
    // 2. Descobre todos os grupos e times
    const allGroups = new Set();
    const teamsByGroup = {};
    for (const tid in teamsById) {
      const t = teamsById[tid];
      const g = t.group_name || "-";
      allGroups.add(g);
      if (!teamsByGroup[g]) teamsByGroup[g] = [];
      teamsByGroup[g].push(t);
    }
    // 3. Para cada grupo, adiciona linhas zeradas para times ausentes
    for (const g of allGroups) {
      const present = new Set((map[g] || []).map((r) => String(r.team_id)));
      const missing = (teamsByGroup[g] || []).filter((t) => !present.has(String(t.id)));
      const zeroRows = missing.map((t) => ({
        group_name: g,
        team_id: t.id,
        team_name: t.name,
        matches_played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goals_for: 0,
        goals_against: 0,
        goal_difference: 0,
        points: 0,
      }));
      map[g] = [...(map[g] || []), ...zeroRows];
      map[g].sort(compareByPoints);
      map[g] = map[g].map((row, i) => ({ ...row, rank: i + 1 }));
    }
    return map;
  }, [standings, teamsById]);

  const groupKeys = Object.keys(groups).sort();
  if (groupKeys.length === 0) return <div className="text-xs text-gray-500">Sem dados de classificação.</div>;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {groupKeys.map((g) => (
        <div key={g} className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="border-b bg-gray-50 px-3 py-2 text-sm font-semibold">Grupo {g}</div>
          <table className="min-w-full text-xs sm:text-sm">
            <thead>
              <tr className="border-b text-gray-600">
                <th className="w-8 py-1 pl-3 text-left">#</th>
                <th className="py-1 text-left">Time</th>
                <th className="w-10 py-1 text-center">P</th>
                <th className="w-10 py-1 text-center">V</th>
                <th className="w-10 py-1 text-center">E</th>
                <th className="w-10 py-1 text-center">D</th>
                <th className="w-10 py-1 text-center">GP</th>
                <th className="w-10 py-1 text-center">GC</th>
                <th className="w-12 py-1 text-center">+/-</th>
                <th className="w-12 py-1 text-center">Pts</th>
              </tr>
            </thead>
            <tbody>
              {groups[g].map((row) => {
                const team =
                  teamsById[row.team_id] && typeof teamsById[row.team_id] === "object"
                    ? teamsById[row.team_id]
                    : { id: row.team_id, name: String(row.team_name ?? teamsById[row.team_id]?.name ?? "—") };
                const safeTeam = { ...team, name: typeof team.name === "string" ? team.name : String(team.name ?? "—") };
                return (
                  <tr key={`${g}-${row.team_id}`} className="border-b">
                    <td className="py-1 pl-3">{row.rank}</td>
                    <td className="py-1">
                      <Link to={`/team/${safeTeam.id}`} className="flex items-center gap-2 hover:underline">
                        <TeamBadge team={safeTeam} size={20} />
                        <span className="truncate">{safeTeam.name}</span>
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
          <div className="px-3 py-2 text-[10px] text-gray-500">Critérios: Pontos, Vitórias, Saldo de Gols, Gols Pró.</div>
        </div>
      ))}
    </div>
  );
}

/* =========================
   Knockout helpers
   ========================= */
function extractKnockout(matches) {
  const byStage = (stage) =>
    (matches || [])
      .filter((m) => m.stage === stage)
      .sort((a, b) => (Number(a?.order_idx) || Number.MAX_SAFE_INTEGER) - (Number(b?.order_idx) || Number.MAX_SAFE_INTEGER));
  const semis = byStage("semi");
  const final = byStage("final");
  const third = byStage("3lugar");
  return { semis, final: final[0], third: third[0] };
}

/* =========================
   Página — Futsal
   ========================= */
export default function Futsal() {
  const [sportId, setSportId] = useState(null);
  const [teamsById, setTeamsById] = useState({});
  const [standings, setStandings] = useState([]);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  const [groupFilter, setGroupFilter] = useState("todos");
  const [stageFilter, setStageFilter] = useState("todos");

  const channelRef = useRef(null);
  const refreshTimerRef = useRef(null);

  /* Loaders */
  const loadSportId = useCallback(async () => {
    try {
      const { data, error } = await supabase.from("sports").select("id").eq("name", "Futsal").maybeSingle();
      if (error) throw error;
      if (data?.id) {
        setSportId(data.id);
      } else {
        console.warn("⚠️ Esporte 'Futsal' não encontrado na tabela sports.");
        setSportId(null);
      }
    } catch (e) {
      console.error("Exceção loadSportId:", e);
      setSportId(null);
    }
  }, []);

  const loadTeams = useCallback(async (sid) => {
    try {
      // 1) tenta por sport_id (se recebido) — AGORA COM group_name
      if (sid) {
        const byId = await supabase
          .from("teams")
          .select("id, name, logo_url, color, group_name")
          .eq("sport_id", sid);

        if (!byId.error && Array.isArray(byId.data) && byId.data.length > 0) {
          const map = {};
          for (const t of byId.data) {
            map[t.id] = {
              ...t,
              name: String(t.name ?? "—"),
              logo_url: normalizeLogo(t.logo_url),
              group_name: t.group_name ?? "-",
            };
          }
          setTeamsById(map);
          return;
        }
      }

      // 2) fallback por NOME (join inner) — AGORA COM group_name
      const byName = await supabase
        .from("teams")
        .select("id, name, logo_url, color, group_name, sport:sport_id!inner(name)")
        .eq("sport.name", "Futsal");

      if (byName.error) throw byName.error;

      const map = {};
      for (const t of byName.data || []) {
        map[t.id] = {
          ...t,
          name: String(t.name ?? "—"),
          logo_url: normalizeLogo(t.logo_url),
          group_name: t.group_name ?? "-",
        };
      }
      setTeamsById(map);
    } catch (e) {
      console.error("Exceção loadTeams:", e);
      setTeamsById({});
    }
  }, []);

  const loadStandings = useCallback(async (sid) => {
    try {
      // 1) VIEW por sport_id
      if (sid) {
        const v = await supabase
          .from("standings_view")
          .select("group_name, rank, team_id, team_name, matches_played, wins, draws, losses, goals_for, goals_against, goal_difference, points")
          .eq("sport_id", sid)
          .order("group_name", { ascending: true, nullsFirst: true })
          .order("rank", { ascending: true });

        if (!v.error && Array.isArray(v.data) && v.data.length > 0) {
          setStandings(v.data);
          return;
        }
      }

      // 2) VIEW por NOME (join inner)
      const v2 = await supabase
        .from("standings_view")
        .select("group_name, rank, team_id, team_name, matches_played, wins, draws, losses, goals_for, goals_against, goal_difference, points, sport:sport_id!inner(name)")
        .eq("sport.name", "Futsal")
        .order("group_name", { ascending: true, nullsFirst: true })
        .order("rank", { ascending: true });

      if (!v2.error && Array.isArray(v2.data) && v2.data.length > 0) {
        setStandings(v2.data.map(({ sport, ...r }) => r));
        return;
      }

      // 3) TABELA por sport_id
      if (sid) {
        const j = await supabase
          .from("standings")
          .select(`
            group_name, rank, team_id,
            matches_played, wins, draws, losses,
            goals_for, goals_against, goal_difference, points,
            team:teams!standings_team_id_fkey(name)
          `)
          .eq("sport_id", sid)
          .order("group_name", { ascending: true, nullsFirst: true })
          .order("rank", { ascending: true });

        if (!j.error && Array.isArray(j.data) && j.data.length > 0) {
          setStandings(j.data.map((r) => ({ ...r, team_name: r.team?.name })));
          return;
        }
      }

      // 4) TABELA por NOME (join inner)
      const j2 = await supabase
        .from("standings")
        .select(`
          group_name, rank, team_id,
          matches_played, wins, draws, losses,
          goals_for, goals_against, goal_difference, points,
          team:teams!standings_team_id_fkey(name),
          sport:sport_id!inner(name)
        `)
        .eq("sport.name", "Futsal")
        .order("group_name", { ascending: true, nullsFirst: true })
        .order("rank", { ascending: true });

      const rows2 = (j2.data || []).map((r) => ({ ...r, team_name: r.team?.name }));
      setStandings(rows2);
    } catch (e) {
      console.error("Exceção loadStandings:", e);
      setStandings([]);
    }
  }, []);

  const loadMatches = useCallback(async (sid) => {
    try {
      // Preferência: VIEW por sport_id
      let rows = [];
      if (sid) {
        const { data: vrows, error: verr } = await supabase
          .from("match_detail_view")
          .select(`
            id, sport_id, order_idx,
            stage, round, group_name, starts_at, updated_at, venue, status,
            home_team_id, home_team_name, home_team_color, home_team_logo,
            away_team_id, away_team_name, away_team_color, away_team_logo,
            home_score, away_score
          `)
          .eq("sport_id", sid);

        if (!verr && Array.isArray(vrows) && vrows.length) {
          rows = vrows.map((r) => ({
            id: r.id,
            sport_id: r.sport_id,
            order_idx: r.order_idx,
            stage: r.stage,
            round: r.round,
            group_name: r.group_name,
            starts_at: r.starts_at,
            updated_at: r.updated_at,
            venue: r.venue,
            status: r.status,
            home_score: r.home_score,
            away_score: r.away_score,
            home: r.home_team_id ? { id: r.home_team_id, name: String(r.home_team_name ?? "A definir"), color: r.home_team_color, logo_url: normalizeLogo(r.home_team_logo) } : null,
            away: r.away_team_id ? { id: r.away_team_id, name: String(r.away_team_name ?? "A definir"), color: r.away_team_color, logo_url: normalizeLogo(r.away_team_logo) } : null,
          }));
        }
      }

      // Fallback: TABELA por NOME (join inner)
      if (!rows.length) {
        const { data: jrows, error: jerr } = await supabase
          .from("matches")
          .select(`
            id, stage, round, group_name, starts_at, updated_at, venue, status,
            home_score, away_score, order_idx,
            home:home_team_id ( id, name, logo_url, color ),
            away:away_team_id ( id, name, logo_url, color ),
            sport:sport_id!inner(name)
          `)
          .eq("sport.name", "Futsal");

        if (jerr) throw jerr;

        rows = (jrows || []).map((m) => ({
          ...m,
          order_idx: m.order_idx ?? m.round ?? m.id,
          home: m.home ? { ...m.home, name: String(m.home.name ?? "A definir"), logo_url: normalizeLogo(m.home.logo_url) } : null,
          away: m.away ? { ...m.away, name: String(m.away.name ?? "A definir"), logo_url: normalizeLogo(m.away.logo_url) } : null,
        }));
      }

      // Ordenação original
      const phaseRank = { grupos: 1, oitavas: 2, quartas: 3, semi: 4, "3lugar": 5, final: 6 };
      const ord = (x) => (Number.isFinite(Number(x?.order_idx)) ? Number(x.order_idx) : Number.MAX_SAFE_INTEGER);
      rows.sort((a, b) => (phaseRank[a.stage] ?? 99) - (phaseRank[b.stage] ?? 99) || ord(a) - ord(b));

      setMatches(rows);
    } catch (e) {
      console.error("Exceção loadMatches:", e);
      setMatches([]);
    }
  }, []);

  const loadAll = useCallback(
    async (sid, { skeleton = false } = {}) => {
      if (skeleton) setLoading(true);
      try {
        await Promise.all([loadTeams(sid), loadStandings(sid), loadMatches(sid)]);
      } finally {
        setLoading(false);
      }
    },
    [loadTeams, loadStandings, loadMatches]
  );

  /* Effects */
  useEffect(() => {
    loadSportId();
  }, [loadSportId]);

  useEffect(() => {
    if (!sportId) {
      setLoading(false);
      return;
    }
    loadAll(sportId, { skeleton: true });

    // Realtime com debounce
    if (channelRef.current) {
      try { supabase.removeChannel(channelRef.current); } catch {}
      channelRef.current = null;
    }
    const ch = supabase
      .channel(`futsal-hub`)
      .on(
        "postgres_changes",
        sportId
          ? { event: "*", schema: "public", table: "matches", filter: `sport_id=eq.${sportId}` }
          : { event: "*", schema: "public", table: "matches" },
        () => {
          if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
          refreshTimerRef.current = setTimeout(() => loadAll(sportId, { skeleton: false }), 200);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "standings" },
        () => {
          if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
          refreshTimerRef.current = setTimeout(() => loadAll(sportId, { skeleton: false }), 200);
        }
      )
      .subscribe();

    channelRef.current = ch;

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      if (channelRef.current) {
        try { supabase.removeChannel(channelRef.current); } catch {}
        channelRef.current = null;
      }
    };
  }, [sportId, loadAll]);

  /* Derivações */
  const hasGroups = useMemo(() => {
    if (standings?.length) return true;
    if ((matches || []).some((m) => !!m.group_name)) return true;
    if (Object.values(teamsById || {}).some((t) => !!t.group_name)) return true;
    return false;
  }, [standings, matches, teamsById]);

  const knockout = useMemo(() => extractKnockout(matches), [matches]);

  // Semifinais provisórias
  const provisionalSemis = useMemo(
    () => computeProvisionalSemis(standings, teamsById),
    [standings, teamsById]
  );
  const semisToShow = knockout.semis?.length ? knockout.semis : provisionalSemis;

  const groupOptions = useMemo(() => {
    const set = new Set();
    (matches || []).forEach((m) => m.group_name && set.add(m.group_name));
    (standings || []).forEach((r) => r.group_name && set.add(r.group_name));
    Object.values(teamsById || {}).forEach((t) => t.group_name && set.add(t.group_name));
    return ["todos", ...Array.from(set).sort()];
  }, [matches, standings, teamsById]);

  const stageOptions = useMemo(() => {
    const set = new Set();
    (matches || []).forEach((m) => m.stage && set.add(m.stage));
    const order = ["grupos", "oitavas", "quartas", "semi", "3lugar", "final"];
    const ordered = Array.from(set).sort((a, b) => (order.indexOf(a) + 100) - (order.indexOf(b) + 100));
    return ["todos", ...ordered];
  }, [matches]);

  const scheduledAll = useMemo(() => {
    let arr = (matches || []).filter((m) => {
      if (m.status !== "scheduled") return false;
      if (m.group_name) return true;
      return m.home?.id && m.away?.id;
    });
    if (groupFilter !== "todos") arr = arr.filter((m) => m.group_name === groupFilter);
    if (stageFilter !== "todos") arr = arr.filter((m) => m.stage === stageFilter);
    arr.sort((a, b) => ts(a.starts_at) - ts(b.starts_at));
    return arr;
  }, [matches, groupFilter, stageFilter]);

  const finishedRecent = useMemo(() => {
    const arr = (matches || []).filter((m) => m.status === "finished");
    arr.sort((a, b) => ts(b.updated_at || b.starts_at || 0) - ts(a.updated_at || a.starts_at || 0));
    return arr.slice(0, 12);
  }, [matches]);

  /* Render */
  return (
    <ErrorBoundary>
      <div className="space-y-10">
        {/* Header */}
        <header className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{SPORT_ICON}</span>
            <h2 className="text-2xl font-bold">{SPORT_LABEL}</h2>
          </div>
          <p className="text-sm text-gray-600">
            Hub informativo: <strong>classificação</strong> → <strong>chaveamento</strong> →{" "}
            <strong>jogos agendados</strong> → <strong>regulamento</strong>.
          </p>
        </header>

        {/* Skeleton */}
        {loading ? (
          <div className="space-y-6">
            <div className="h-6 w-48 rounded bg-gray-100 animate-pulse" />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-20 rounded-xl bg-gray-100 animate-pulse" />
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* 1) CLASSIFICAÇÃO */}
            {hasGroups && (
              <section className="space-y-4">
                <h3 className="text-lg font-bold">Tabela de classificação</h3>
                <StandingsTable standings={standings} teamsById={teamsById} />
              </section>
            )}

            {/* 2) CHAVEAMENTO */}
            <section className="space-y-4">
              <h3 className="text-lg font-bold">Chaveamento</h3>

              {/* Semifinais */}
              {semisToShow?.length ? (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-gray-700">Semifinais</h4>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {semisToShow.map((m, i) => (
                      <BracketMatchCard key={`s-${m?.id ?? i}`} match={m} />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-gray-700">Semifinais</h4>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <BracketMatchCard placeholder={{ home: "A definir", away: "A definir" }} />
                    <BracketMatchCard placeholder={{ home: "A definir", away: "A definir" }} />
                  </div>
                </div>
              )}

              {/* Final */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-gray-700">Final</h4>
                {knockout.final ? (
                  <BracketMatchCard match={knockout.final} />
                ) : (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <BracketMatchCard placeholder={{ home: "Vencedor Semifinal 1", away: "Vencedor Semifinal 2" }} />
                  </div>
                )}
              </div>

              {/* 3º lugar (se existir) */}
              {knockout.third ? (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-gray-700">3º lugar</h4>
                  <BracketMatchCard match={knockout.third} />
                </div>
              ) : null}
            </section>

            {/* 3) JOGOS AGENDADOS */}
            <section className="space-y-4">
              <h3 className="text-lg font-bold">Jogos agendados</h3>

              {/* Filtros */}
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <label className="text-gray-600">Grupo:</label>
                <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} className="rounded-md border border-gray-300 bg-white px-2 py-1">
                  {groupOptions.map((g) => (
                    <option key={g} value={g}>
                      {g === "todos" ? "Todos" : `Grupo ${g}`}
                    </option>
                  ))}
                </select>

                <label className="text-gray-600">Fase:</label>
                <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} className="rounded-md border border-gray-300 bg-white px-2 py-1">
                  {stageOptions.map((st) => (
                    <option key={st} value={st}>
                      {st === "todos" ? "Todas" : friendlyStage(st)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Lista */}
              {scheduledAll.length ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {scheduledAll.map((m, i) => (
                    <ListMatchCard key={m.id ?? `sched-${i}`} match={m} />
                  ))}
                </div>
              ) : (
                <div className="text-xs text-gray-500">Nenhum jogo agendado no momento.</div>
              )}

              {/* Encerrados (recentes) */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-gray-700">Encerrados (recentes)</h4>
                {finishedRecent.length ? (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {finishedRecent.map((m, i) => (
                      <ListMatchCard key={m.id ?? `fin-${i}`} match={m} />
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-gray-500">Sem resultados recentes.</div>
                )}
              </div>
            </section>

            {/* 4) REGULAMENTO */}
            <section className="space-y-3">
              <h3 className="text-lg font-bold">Regulamento</h3>
              <div className="rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-700 shadow-sm">
                <ul className="list-disc space-y-1 pl-5">
                  <li><strong>Duração:</strong> partidas com <strong>10 minutos corridos</strong>.</li>
                  <li><strong>Formato:</strong> fase de grupos (3 grupos de 3 equipes) e mata-mata.</li>
                  <li><strong>Classificação (grupos):</strong> o 1º colocado de cada grupo e o melhor 2º colocado avançam para o mata-mata.</li>
                  <li><strong>Desempate (grupos):</strong> saldo de gols.</li>
                  <li><strong>Mata-mata:</strong> duas semifinais e uma final.</li>
                  <li><strong>Semifinais:</strong> Vencedor do grupo A × Vencedor do grupo B; Vencedor do grupo C × Melhor 2º colocado.</li>
                  <li><strong>Substituições:</strong> ilimitadas.</li>
                  <li><strong>Desperdício de tempo:</strong> pode ser acrescido ao final do jogo, a critério do árbitro.</li>
                  <li><strong>Goleiro-linha:</strong> permitido.</li>
                  <li><strong>Expulsão:</strong> o time fica com um jogador a menos por 2 minutos ou até sofrer um gol.</li>
                </ul>
              </div>
            </section>
          </>
        )}
      </div>
    </ErrorBoundary>
  );
}
