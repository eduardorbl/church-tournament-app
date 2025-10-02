// src/pages/Pebolim.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabaseClient";
import TeamBadge from "../components/TeamBadge";
import { HelpCircle } from "lucide-react";

/* ──────────────────────────────────────────────────────────────────────────────
   Hub Pebolim — Estrutura
   1) Classificação (se houver grupos)
   2) Chaveamento (sempre visível, com placeholders)
   3) Jogos agendados (lista integral, com filtros opcionais)
   4) Regulamento
   ────────────────────────────────────────────────────────────────────────────── */

const SPORT_LABEL = "Pebolim";
const SPORT_ICON = "🎯";
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

/* ── Datas seguras ─────────────────────────────────────────────────────────── */
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

/* ── Logos ─────────────────────────────────────────────────────────────────── */
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

/* ── UI: Título compacto ───────────────────────────────────────────────────── */
function TitleLine({ order_idx, stage, group_name }) {
  const chips = [];
  if (order_idx !== undefined && order_idx !== null && String(order_idx).length) chips.push(`Jogo ${order_idx}`);
  if (group_name) chips.push(`Grupo ${group_name}`);
  else if (stage) chips.push(friendlyStage(stage));
  return <div className="mb-1 text-sm font-semibold text-gray-900">{chips.join(" • ") || "—"}</div>;
}

/* ── UI: TeamChip ──────────────────────────────────────────────────────────── */
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

/* ── UI: Cards de partida ──────────────────────────────────────────────────── */
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

function BracketMatchCard({ match, placeholder }) {
  const home = match?.home || (placeholder?.home ? { name: placeholder.home } : null);
  const away = match?.away || (placeholder?.away ? { name: placeholder.away } : null);
  const homeName = home?.name || (placeholder?.home ?? "A definir");
  const awayName = away?.name || (placeholder?.away ?? "A definir");
  const showScore = match && match.status !== "scheduled";
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

  return match?.id ? <Link to={`/match/${match.id}`} className="block">{body}</Link> : body;
}

// Ordena: Pontos ↓, Vitórias ↓, Saldo de Gols ↓, Gols Pró ↓, (fallback por id)
function compareByPoints(a, b) {
  const ap = Number(a.points ?? 0), bp = Number(b.points ?? 0);
  if (bp !== ap) return bp - ap;

  const aw = Number(a.wins ?? 0), bw = Number(b.wins ?? 0);
  if (bw !== aw) return bw - aw;

  const agd = Number(a.goal_difference ?? (Number(a.goals_for ?? 0) - Number(a.goals_against ?? 0)));
  const bgd = Number(b.goal_difference ?? (Number(b.goals_for ?? 0) - Number(b.goals_against ?? 0)));
  if (bgd !== agd) return bgd - agd;

  const agf = Number(a.goals_for ?? 0), bgf = Number(b.goals_for ?? 0);
  if (bgf !== agf) return bgf - agf;

  return String(a.team_id).localeCompare(String(b.team_id));
}

/* ── Classificação ─────────────────────────────────────────────────────────── */
function StandingsTable({ standings, teamsById }) {
  // Garante que todos os times dos grupos apareçam, mesmo zerados
  const groups = useMemo(() => {
    // 1) Agrupa standings existentes
    const map = {};
    for (const r of standings || []) {
      const g = r.group_name || "-";
      if (!map[g]) map[g] = [];
      map[g].push(r);
    }

    // 2) Descobre todos os grupos a partir dos times (teamsById)
    const allGroups = new Set();
    const teamsByGroup = {};
    for (const tid in teamsById) {
      const t = teamsById[tid];
      const g = t.group_name || "-";
      allGroups.add(g);
      if (!teamsByGroup[g]) teamsByGroup[g] = [];
      teamsByGroup[g].push(t);
    }

    // 3) Para cada grupo, adiciona linhas zeradas para times ausentes
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

      // Ordena e numera
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


/* ── Knockout helpers ──────────────────────────────────────────────────────── */
function extractKnockout(matches) {
  const byStage = (stage) =>
    (matches || [])
      .filter((m) => m.stage === stage)
      .sort((a, b) => (Number(a?.order_idx) || Number.MAX_SAFE_INTEGER) - (Number(b?.order_idx) || Number.MAX_SAFE_INTEGER));

  const oitavas = byStage("oitavas");
  const quartas = byStage("quartas");
  const semis = byStage("semi");
  const final = byStage("final");
  const third = byStage("3lugar");

  return { oitavas, quartas, semis, final: final[0], third: third[0] };
}

function computeProvisionalFromStandings(standings, teamsById) {
  if (!Array.isArray(standings) || standings.length === 0) {
    const pair = (g1, g2) => ({ home: { name: `1º Grupo ${g1}` }, away: { name: `1º Grupo ${g2}` } });
    return {
      quarters: [pair("A", "B"), pair("C", "D"), pair("E", "F"), pair("G", "H")],
      semis: [
        { home: { name: "Vencedor Quartas 1" }, away: { name: "Vencedor Quartas 2" } },
        { home: { name: "Vencedor Quartas 3" }, away: { name: "Vencedor Quartas 4" } },
      ],
    };
  }
  const winners = {};
  for (const g of "ABCDEFGH".split("")) {
    const w = standings.find((r) => r.group_name === g && r.rank === 1);
    if (w) {
      winners[g] = {
        id: w.team_id,
        name: w.team_name || teamsById[w.team_id]?.name || "—",
        logo_url: teamsById[w.team_id]?.logo_url,
        color: teamsById[w.team_id]?.color,
      };
    }
  }
  const pair = (g1, g2) => ({
    home: winners[g1] || { name: `1º Grupo ${g1}` },
    away: winners[g2] || { name: `1º Grupo ${g2}` },
  });
  const quarters = [pair("A", "B"), pair("C", "D"), pair("E", "F"), pair("G", "H")];
  const semis = [
    { home: { name: "Vencedor Quartas 1" }, away: { name: "Vencedor Quartas 2" } },
    { home: { name: "Vencedor Quartas 3" }, away: { name: "Vencedor Quartas 4" } },
  ];
  return { quarters, semis };
}

/* ── Error Boundary ────────────────────────────────────────────────────────── */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error("Pebolim ErrorBoundary:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <div className="font-semibold mb-1">Algo quebrou ao renderizar esta página.</div>
          <div className="font-mono text-xs whitespace-pre-wrap">{String(this.state.error?.message || this.state.error)}</div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ── Normalizações ─────────────────────────────────────────────────────────── */
const norm = (s) =>
  typeof s === "string"
    ? s.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase()
    : "";
const normStage = (s) => {
  const m = norm(s);
  if (m === "semifinal" || m === "semi-final" || m === "semis") return "semi";
  if (m === "3º lugar" || m === "3lugar" || m === "3-lugar" || m === "terceiro") return "3lugar";
  return m;
};
const normStatus = (s) => {
  const m = norm(s);
  if (m === "agendado" || m === "programado" || m === "scheduled") return "scheduled";
  if (m === "ao vivo" || m === "andamento" || m === "live" || m === "ongoing") return "ongoing";
  if (m === "pausado" || m === "paused") return "paused";
  if (m === "encerrado" || m === "finalizado" || m === "finished") return "finished";
  return m || "scheduled";
};

/* ── Página — Pebolim (Hub) ───────────────────────────────────────────────── */
export default function Pebolim() {
  const [sportId, setSportId] = useState(null);
  const [teamsById, setTeamsById] = useState({});
  const teamsRef = useRef({});
  useEffect(() => { teamsRef.current = teamsById; }, [teamsById]);
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
      const { data, error } = await supabase.from("sports").select("id").eq("name", SPORT_LABEL).maybeSingle();
      if (error) {
        console.error("Erro ao carregar sport id:", error);
      }
      setSportId(data?.id ?? null);
    } catch (e) {
      console.error("Exceção loadSportId:", e);
      setSportId(null);
    }
  }, []);

  const loadTeams = useCallback(async (sid) => {
    try {
      // 1) por sport_id
      if (sid) {
        const byId = await supabase.from("teams").select("id, name, logo_url, color, group_name").eq("sport_id", sid);
        if (!byId.error && Array.isArray(byId.data) && byId.data.length) {
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
          teamsRef.current = map;
          return;
        }
      }
      // 2) fallback por NOME
      const byName = await supabase
        .from("teams")
        .select("id, name, logo_url, color, group_name, sport:sport_id!inner(name)")
        .eq("sport.name", SPORT_LABEL);

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
      teamsRef.current = map;
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

      // 2) VIEW por NOME
      const v2 = await supabase
        .from("standings_view")
        .select("group_name, rank, team_id, team_name, matches_played, wins, draws, losses, goals_for, goals_against, goal_difference, points, sport:sport_id!inner(name)")
        .eq("sport.name", SPORT_LABEL)
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

      // 4) TABELA por NOME
      const j2 = await supabase
        .from("standings")
        .select(`
          group_name, rank, team_id,
          matches_played, wins, draws, losses,
          goals_for, goals_against, goal_difference, points,
          team:teams!standings_team_id_fkey(name),
          sport:sport_id!inner(name)
        `)
        .eq("sport.name", SPORT_LABEL)
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
      let rows = [];

      // 1) VIEW detalhada por sport_id (se existir)
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
            stage: normStage(r.stage),
            round: r.round,
            group_name: r.group_name,
            starts_at: r.starts_at,
            updated_at: r.updated_at,
            venue: r.venue,
            status: normStatus(r.status),
            home_score: r.home_score,
            away_score: r.away_score,
            home: r.home_team_id ? { id: r.home_team_id, name: String(r.home_team_name ?? "A definir"), color: r.home_team_color, logo_url: normalizeLogo(r.home_team_logo) } : null,
            away: r.away_team_id ? { id: r.away_team_id, name: String(r.away_team_name ?? "A definir"), color: r.away_team_color, logo_url: normalizeLogo(r.away_team_logo) } : null,
          }));
        }
      }

      // 2) Fallback: TABELA por NOME (join inner)
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
          .eq("sport.name", SPORT_LABEL);

        if (jerr) throw jerr;

        rows = (jrows || []).map((m) => ({
          id: m.id,
          order_idx: Number.isFinite(Number(m.order_idx)) ? Number(m.order_idx) : null,
          stage: normStage(m.stage),
          round: m.round,
          group_name: m.group_name,
          starts_at: m.starts_at,
          updated_at: m.updated_at,
          venue: m.venue,
          status: normStatus(m.status),
          home_score: m.home_score,
          away_score: m.away_score,
          home: m.home ? { ...m.home, name: String(m.home.name ?? "A definir"), logo_url: normalizeLogo(m.home.logo_url) } : null,
          away: m.away ? { ...m.away, name: String(m.away.name ?? "A definir"), logo_url: normalizeLogo(m.away.logo_url) } : null,
        }));
      }

      // Ordenação
      const phaseRank = { grupos: 1, oitavas: 2, quartas: 3, semi: 4, "3lugar": 5, final: 6 };
      const ord = (x) => (Number.isFinite(Number(x?.order_idx)) ? Number(x.order_idx) : Number.MAX_SAFE_INTEGER);
      rows.sort((a, b) => (phaseRank[a.stage] ?? 99) - (phaseRank[b.stage] ?? 99) || ord(a) - ord(b));

      setMatches(rows);
    } catch (e) {
      console.error("Exceção loadMatches (pebolim):", e);
      setMatches([]);
    }
  }, []);

  const loadAll = useCallback(
    async (sid, { skeleton = false } = {}) => {
      if (skeleton) setLoading(true);
      try {
        await loadTeams(sid);
        await Promise.all([loadStandings(sid), loadMatches(sid)]);
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
    // roda sempre: com sportId (por id) ou sem sportId (fallback por nome)
    loadAll(sportId, { skeleton: true });

    // Realtime só quando tiver sportId (para filtrar por id)
    if (channelRef.current) {
      try { supabase.removeChannel(channelRef.current); } catch {}
      channelRef.current = null;
    }
    if (sportId) {
      const onChange = () => {
        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = setTimeout(() => loadAll(sportId, { skeleton: false }), 400);
      };
      const ch = supabase
        .channel(`pebolim-hub-${sportId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "matches", filter: `sport_id=eq.${sportId}` }, onChange)
        .on("postgres_changes", { event: "*", schema: "public", table: "standings", filter: `sport_id=eq.${sportId}` }, onChange)
        .subscribe();
      channelRef.current = ch;
    }

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
  const provisionalFromStandings = useMemo(() => computeProvisionalFromStandings(standings, teamsById), [standings, teamsById]);

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
    arr.sort((a, b) => {
      const ta = ts(a.starts_at), tb = ts(b.starts_at);
      const tcmp = Number.isFinite(ta - tb) ? ta - tb : 0;
      return tcmp ||
        (Number(a.order_idx ?? Number.MAX_SAFE_INTEGER) - Number(b.order_idx ?? Number.MAX_SAFE_INTEGER)) ||
        (a.id - b.id);
    });
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
            Hub informativo: <strong>classificação</strong> (se houver grupos) → <strong>chaveamento</strong> →{" "}
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
            {/* 1) CLASSIFICAÇÃO (sempre renderiza; mostra vazio se não houver dados) */}
            <section className="space-y-4">
              <h3 className="text-lg font-bold">Tabela de classificação</h3>
              <StandingsTable standings={standings} teamsById={teamsById} />
            </section>

            {/* 2) CHAVEAMENTO */}
            <section className="space-y-4">
              <h3 className="text-lg font-bold">Chaveamento</h3>

              {/* Oitavas (se existir) */}
              {knockout.oitavas?.length ? (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-gray-700">Oitavas de final</h4>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {knockout.oitavas.map((m, i) => (
                      <BracketMatchCard key={`o-${m?.id ?? i}`} match={m} />
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Quartas */}
              {(knockout.quartas?.length || provisionalFromStandings?.quarters) ? (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-gray-700">Quartas de final</h4>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {Array.from({ length: Math.max(knockout.quartas?.length || 0, provisionalFromStandings?.quarters?.length || 0, 4) }).map((_, i) => {
                      const m = knockout.quartas?.[i];
                      const ph = provisionalFromStandings?.quarters?.[i];
                      return <BracketMatchCard key={`q-${m?.id ?? i}`} match={m} placeholder={ph} />;
                    })}
                  </div>
                </div>
              ) : null}

              {/* Semis */}
              {(knockout.semis?.length || provisionalFromStandings?.semis) ? (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-gray-700">Semifinais</h4>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {Array.from({ length: Math.max(knockout.semis?.length || 0, provisionalFromStandings?.semis?.length || 0, 2) }).map((_, i) => {
                      const m = knockout.semis?.[i];
                      const ph = provisionalFromStandings?.semis?.[i];
                      return <BracketMatchCard key={`s-${m?.id ?? i}`} match={m} placeholder={ph} />;
                    })}
                  </div>
                </div>
              ) : null}

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
                  <li><strong>Duração:</strong> partidas em <strong>1 rodada de 4 gols</strong>.</li>
                  <li><strong>Formato:</strong> fase de grupos (8 grupos de 3 duplas) e mata-mata.</li>
                  <li><strong>Classificação (grupos):</strong> o 1º colocado de cada grupo avança para o mata-mata.</li>
                  <li><strong>Desempate (grupos):</strong> saldo de gols.</li>
                  <li><strong>Mata-mata:</strong> quatro quartas de final, duas semifinais e uma final.</li>
                  <li><strong>Quartas de final:</strong> Vencedor do grupo A × Vencedor do grupo B = Vencedor 1; Vencedor do grupo C × Vencedor do grupo D = Vencedor 2; Vencedor do grupo E × Vencedor do grupo F = Vencedor 3; Vencedor do grupo G × Vencedor do grupo H = Vencedor 4.</li>
                  <li><strong>Semifinais:</strong> Vencedor 1 × Vencedor 2; Vencedor 3 × Vencedor 4.</li>
                  <li><strong>Duplas:</strong> não podem ser substituídas durante o torneio.</li>
                  <li><strong>WO:</strong> em caso de não comparecimento de um ou mais integrantes, a dupla perde por WO. Atrasos de até 3 minutos são tolerados.</li>
                </ul>
              </div>
            </section>
          </>
        )}
      </div>
    </ErrorBoundary>
  );
}
