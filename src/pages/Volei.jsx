// src/pages/Volei.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabaseClient";
import TeamBadge from "../components/TeamBadge";

/* ──────────────────────────────────────────────────────────────────────────────
   Hub Vôlei — Estrutura visual (igual Pebolim)
   1) Classificação (se houver grupos) — critérios do VÔLEI
   2) Chaveamento (sempre visível, com placeholders)
   3) Jogos agendados (lista integral, com filtros opcionais)
   4) Regulamento
   ────────────────────────────────────────────────────────────────────────────── */

const SPORT_LABEL = "Vôlei";
const SPORT_ICON = "🏐";
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
  if (order_idx !== undefined && order_idx !== null && String(order_idx).length) chips.push(`J${order_idx}`);
  if (group_name) chips.push(`Grupo ${group_name}`);
  else if (stage) chips.push(friendlyStage(stage));
  return <div className="mb-1 text-sm font-semibold text-gray-900">{chips.join(" • ") || "—"}</div>;
}

/* ── UI: TeamChip (sanitiza nome para string) ──────────────────────────────── */
function TeamChip({ team, align = "left", badge = 28 }) {
  const displayName = (() => {
    const n = team?.name;
    if (typeof n === "string") return n;
    if (n && typeof n === "object" && "name" in n) return String(n.name);
    try { return String(n ?? "A definir"); } catch { return "A definir"; }
  })();

  const has = Boolean(team?.id);
  const content = (
    <>
      {align === "right" ? null : <TeamBadge team={{ ...(team || {}), name: displayName }} size={badge} />}
      <span
        className={`truncate ${has ? "text-gray-900" : "text-gray-400"} ${align === "right" ? "text-right" : ""}`}
        title={displayName}
      >
        {displayName}
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

/* ── UI: Cartões de partida ───────────────────────────────────────────────── */
function ListMatchCard({ match }) {
  const showScore = match?.status && match.status !== "scheduled";
  const homeScore = Number(match?.home_score ?? 0);
  const awayScore = Number(match?.away_score ?? 0);
  const homeSets = Number(match?.meta?.home_sets ?? 0);
  const awaySets = Number(match?.meta?.away_sets ?? 0);
  const hasSets = showScore && (homeSets > 0 || awaySets > 0);

  return (
    <Link to={`/match/${match.id}`} className="block rounded-xl border border-gray-200 bg-white p-3 shadow-sm transition hover:bg-gray-50">
      <TitleLine order_idx={match.order_idx} stage={match.stage} group_name={match.group_name} />
      <div className="mt-1 grid grid-cols-3 items-center gap-2">
        <TeamChip team={match.home} />
        <div className="text-center">
          {showScore ? (
            <>
              {hasSets ? (
                <div className="text-[11px] font-medium tabular-nums text-gray-600 mb-0.5">
                  Sets: {homeSets} <span className="text-gray-400">x</span> {awaySets}
                </div>
              ) : null}
              <div className="text-base font-bold tabular-nums">
                {homeScore} <span className="text-gray-400">x</span> {awayScore}
              </div>
            </>
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
  const showScore = match && match.status !== "scheduled";
  const homeScore = Number(match?.home_score ?? 0);
  const awayScore = Number(match?.away_score ?? 0);
  const homeSets = Number(match?.meta?.home_sets ?? 0);
  const awaySets = Number(match?.meta?.away_sets ?? 0);
  const hasSets = showScore && (homeSets > 0 || awaySets > 0);

  const body = (
    <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm transition hover:bg-gray-50">
      <TitleLine order_idx={match?.order_idx} stage={match?.stage} />
      {/* alinhamento perfeito: time esquerda | x centro | time direita */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="min-w-0 justify-self-start">
          <TeamChip team={home} />
        </div>
        <div className="justify-self-center text-xs text-gray-400">x</div>
        <div className="min-w-0 justify-self-end">
          <TeamChip team={away} align="right" />
        </div>
      </div>
      <div className="mt-1 flex items-center justify-between text-[11px] text-gray-500">
        <span className="truncate">{match?.starts_at ? fmtDate(match.starts_at) : match?.venue || ""}</span>
        {showScore ? (
          <span className="tabular-nums font-semibold text-gray-700">
            {hasSets ? (
              <>
                <span className="mr-2">
                  Sets {homeSets} <span className="text-gray-400">x</span> {awaySets}
                </span>
              </>
            ) : null}
            {homeScore} <span className="text-gray-400">x</span> {awayScore}
          </span>
        ) : null}
      </div>
    </div>
  );

  return match?.id ? <Link to={`/match/${match.id}`} className="block">{body}</Link> : body;
}

/* ── Classificação (Vôlei) ──────────────────────────────────────────────────
   Vitória do jogo por sets; se empatar em sets, desempata por pontos do placar.
   Ranking: Pts(3 por vitória) ↓, depois SV ↓, SP ↑, e saldo de pontos (PF−PA) ↓.
*/
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

    add(hid); add(aid);
    agg[hid].mp += 1; agg[aid].mp += 1;
    agg[hid].sv += hs; agg[hid].sp += as;
    agg[aid].sv += as; agg[aid].sp += hs;
    agg[hid].pf += hp; agg[hid].pa += ap;
    agg[aid].pf += ap; agg[aid].pa += hp;

    // vencedor do jogo
    let homeWon = false;
    if (hs !== as) homeWon = hs > as;
    else if (hp !== ap) homeWon = hp > ap;
    else homeWon = false;

    if (homeWon) { agg[hid].wins += 1; agg[aid].losses += 1; }
    else { agg[aid].wins += 1; agg[hid].losses += 1; }
  }

  return agg;
}

function compareVolleyRows(a, b) {
  // Pts (3 por vitória)
  const ap = Number(a.points ?? 0), bp = Number(b.points ?? 0);
  if (bp !== ap) return bp - ap;
  // SV (sets vencidos) DESC
  const asv = Number(a.sv ?? 0), bsv = Number(b.sv ?? 0);
  if (bsv !== asv) return bsv - asv;
  // SP (sets perdidos) ASC
  const asp = Number(a.sp ?? 0), bsp = Number(b.sp ?? 0);
  if (asp !== bsp) return asp - bsp;
  // saldo de pontos (PF-PA) DESC
  const ad = Number(a.pf ?? 0) - Number(a.pa ?? 0);
  const bd = Number(b.pf ?? 0) - Number(b.pa ?? 0);
  if (bd !== ad) return bd - ad;
  // fallback determinístico
  return String(a.team_id).localeCompare(String(b.team_id));
}

function enrichStandingsWithVolley(standings, teamsById, agg) {
  return (standings || []).map((r) => {
    const a = agg[r.team_id] || { mp: 0, wins: 0, losses: 0, sv: 0, sp: 0, pf: 0, pa: 0 };
    return {
      ...r,
      team_name: teamsById[r.team_id]?.name || r.team_name || teamsById[r.team_id] || "—",
      matches_played: a.mp,
      wins: a.wins,
      losses: a.losses,
      sv: a.sv,
      sp: a.sp,
      pf: a.pf,
      pa: a.pa,
      points: a.wins * 3,
    };
  });
}

function StandingsTable({ standings, teamsById }) {
  // Agrupa por grupo e ordena com compareVolleyRows
  const groups = useMemo(() => {
    const map = {};
    for (const r of standings || []) {
      const g = r.group_name || "-";
      if (!map[g]) map[g] = [];
      map[g].push(r);
    }
    for (const g of Object.keys(map)) map[g].sort(compareVolleyRows);
    return map;
  }, [standings]);

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
                <th className="w-10 py-1 text-center">D</th>
                <th className="w-10 py-1 text-center">SV</th>
                <th className="w-10 py-1 text-center">SP</th>
                <th className="w-10 py-1 text-center">PF</th>
                <th className="w-10 py-1 text-center">PA</th>
                <th className="w-12 py-1 text-center">+/-</th>
                <th className="w-12 py-1 text-center">Pts</th>
              </tr>
            </thead>
            <tbody>
              {groups[g].map((row, idx) => {
                const team =
                  teamsById[row.team_id] && typeof teamsById[row.team_id] === "object"
                    ? teamsById[row.team_id]
                    : { id: row.team_id, name: String(row.team_name ?? teamsById[row.team_id]?.name ?? "—") };
                const safeTeam = { ...team, name: typeof team.name === "string" ? team.name : String(team.name ?? "—") };
                const saldo = Number(row.pf ?? 0) - Number(row.pa ?? 0);
                return (
                  <tr key={`${g}-${row.team_id}`} className="border-b">
                    <td className="py-1 pl-3">{idx + 1}</td>
                    <td className="py-1">
                      <Link to={`/team/${safeTeam.id}`} className="flex items-center gap-2 hover:underline">
                        <TeamBadge team={safeTeam} size={20} />
                        <span className="truncate">{safeTeam.name}</span>
                      </Link>
                    </td>
                    <td className="py-1 text-center">{row.matches_played}</td>
                    <td className="py-1 text-center">{row.wins}</td>
                    <td className="py-1 text-center">{row.losses}</td>
                    <td className="py-1 text-center">{row.sv}</td>
                    <td className="py-1 text-center">{row.sp}</td>
                    <td className="py-1 text-center">{row.pf}</td>
                    <td className="py-1 text-center">{row.pa}</td>
                    <td className="py-1 text-center">{saldo}</td>
                    <td className="py-1 text-center font-semibold">{row.points}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-3 py-2 text-[10px] text-gray-500">
            Critérios: <strong>Pontos (3 por vitória)</strong>, depois <strong>SV</strong>, <strong>SP</strong> (menor é melhor) e <strong>saldo de pontos</strong>.
          </div>
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

// Semis provisórias típicas: Venc. A × Venc. B e Venc. C × Melhor 2º
function computeProvisionalSemis(standingsEnriched, teamsById) {
  if (!Array.isArray(standingsEnriched) || standingsEnriched.length === 0) return null;

  const byGroup = {};
  for (const r of standingsEnriched) {
    const g = r.group_name || "-";
    if (!byGroup[g]) byGroup[g] = [];
    byGroup[g].push(r);
  }
  for (const g of Object.keys(byGroup)) byGroup[g].sort(compareVolleyRows);

  const top = (g, idx) => (byGroup[g] && byGroup[g][idx] ? byGroup[g][idx] : null);

  const winA = top("A", 0);
  const winB = top("B", 0);
  const winC = top("C", 0);

  const seconds = [top("A", 1), top("B", 1), top("C", 1)].filter(Boolean).sort(compareVolleyRows);
  const bestSecond = seconds[0];

  const mk = (row, placeholder) =>
    row
      ? {
          id: row.team_id,
          name: row.team_name || teamsById[row.team_id]?.name || "—",
          logo_url: teamsById[row.team_id]?.logo_url,
          color: teamsById[row.team_id]?.color,
        }
      : { name: placeholder };

  const semi1 = { home: mk(winA, "Vencedor Grupo A"), away: mk(winB, "Vencedor Grupo B") };
  const semi2 = { home: mk(winC, "Vencedor Grupo C"), away: mk(bestSecond, "Melhor 2º") };

  return { semi1, semi2 };
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
    console.error("Volei ErrorBoundary:", error, info);
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

/* ── Página — Vôlei (Hub) ─────────────────────────────────────────────────── */
export default function Volei() {
  const [sportId, setSportId] = useState(null);
  const [teamsById, setTeamsById] = useState({});
  const [standingsRaw, setStandingsRaw] = useState([]); // do banco (para grupos)
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  const [groupFilter, setGroupFilter] = useState("todos");
  const [stageFilter, setStageFilter] = useState("todos");

  const channelRef = useRef(null);
  const refreshTimerRef = useRef(null);

  /* Loaders */
  const loadSportId = useCallback(async () => {
    try {
      const { data, error } = await supabase.from("sports").select("id").eq("name", "Volei").maybeSingle();
      if (error) {
        console.error("Erro ao carregar sport id:", error);
        return;
      }
      if (data?.id) setSportId(data.id);
    } catch (e) {
      console.error("Exceção loadSportId:", e);
    }
  }, []);

  const loadTeams = useCallback(async (sid) => {
    try {
      const { data, error } = await supabase.from("teams").select("id, name, logo_url, color").eq("sport_id", sid);
      if (error) {
        console.error("Erro ao carregar teams:", error);
        return;
      }
      const map = {};
      for (const t of data || []) {
        map[t.id] = { ...t, name: String(t.name ?? "—"), logo_url: normalizeLogo(t.logo_url) };
      }
      setTeamsById(map);
    } catch (e) {
      console.error("Exceção loadTeams:", e);
    }
  }, []);

  const loadStandings = useCallback(async (sid) => {
    try {
      const v = await supabase
        .from("standings_view")
        .select("group_name, rank, team_id, team_name, matches_played, wins, draws, losses, goals_for, goals_against, goal_difference, points")
        .eq("sport_id", sid)
        .order("group_name", { ascending: true, nullsFirst: true })
        .order("rank", { ascending: true });

      if (!v.error && v.data) {
        setStandingsRaw(v.data);
        return;
      }

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

      const rows = (j.data || []).map((r) => ({ ...r, team_name: r.team?.name })) || [];
      setStandingsRaw(rows);
    } catch (e) {
      console.error("Exceção loadStandings:", e);
    }
  }, []);

  const loadMatches = useCallback(async (sid) => {
    try {
      // Tenta a view detalhada
      const { data: vrows, error: verr } = await supabase
        .from("match_detail_view")
        .select(`
          id, sport_id, order_idx,
          stage, round, group_name, starts_at, updated_at, venue, status, meta,
          home_team_id, home_team_name, home_team_color, home_team_logo,
          away_team_id, away_team_name, away_team_color, away_team_logo,
          home_score, away_score
        `)
        .eq("sport_id", sid);

      let rows = [];
      if (!verr && vrows?.length) {
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
          meta: r.meta,
          home_score: r.home_score,
          away_score: r.away_score,
          home: r.home_team_id
            ? { id: r.home_team_id, name: String(r.home_team_name ?? "A definir"), color: r.home_team_color, logo_url: normalizeLogo(r.home_team_logo) }
            : null,
          away: r.away_team_id
            ? { id: r.away_team_id, name: String(r.away_team_name ?? "A definir"), color: r.away_team_color, logo_url: normalizeLogo(r.away_team_logo) }
            : null,
        }));
      } else {
        // Fallback: tabela matches
        const { data: jrows, error: jerr } = await supabase
          .from("matches")
          .select(`
            id, order_idx, stage, round, group_name, starts_at, updated_at, venue, status, meta,
            home_score, away_score,
            home:home_team_id ( id, name, logo_url, color ),
            away:away_team_id ( id, name, logo_url, color ),
            home_team_id, away_team_id
          `)
          .eq("sport_id", sid);

        if (jerr) {
          console.error("Erro matches fallback:", jerr);
          setMatches([]);
          return;
        }

        rows = (jrows || []).map((m) => ({
          ...m,
          order_idx: m.order_idx ?? m.round ?? m.id,
          home: m.home ? { ...m.home, name: String(m.home.name ?? "A definir"), logo_url: normalizeLogo(m.home.logo_url) } : null,
          away: m.away ? { ...m.away, name: String(m.away.name ?? "A definir"), logo_url: normalizeLogo(m.away.logo_url) } : null,
        }));
      }

      // Ordenação robusta por fase + ordem estável
      const phaseRank = { grupos: 1, oitavas: 2, quartas: 3, semi: 4, "3lugar": 5, final: 6 };
      const ord = (x) => {
        const v = Number(x?.order_idx);
        return Number.isFinite(v) ? v : Number.MAX_SAFE_INTEGER;
      };
      rows.sort((a, b) => {
        const pa = phaseRank[a.stage] ?? 99;
        const pb = phaseRank[b.stage] ?? 99;
        if (pa !== pb) return pa - pb;
        return ord(a) - ord(b);
      });

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
        if (skeleton) setLoading(false);
      }
    },
    [loadTeams, loadStandings, loadMatches]
  );

  /* Effects */
  useEffect(() => {
    loadSportId();
  }, [loadSportId]);

  useEffect(() => {
    if (!sportId) return;
    loadAll(sportId, { skeleton: true });

    // Realtime com debounce
    if (channelRef.current) {
      try { supabase.removeChannel(channelRef.current); } catch {}
      channelRef.current = null;
    }
    const ch = supabase
      .channel(`volei-hub-${sportId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matches", filter: `sport_id=eq.${sportId}` },
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
  const hasGroups = useMemo(() => (standingsRaw?.length ? true : (matches || []).some((m) => !!m.group_name)), [standingsRaw, matches]);

  // Apuração específica do vôlei (a partir das partidas) + enriquecimento das linhas da classificação
  const volleyAgg = useMemo(() => computeVolleyAgg(matches), [matches]);
  const standings = useMemo(() => enrichStandingsWithVolley(standingsRaw, teamsById, volleyAgg), [standingsRaw, teamsById, volleyAgg]);

  const knockout = useMemo(() => extractKnockout(matches), [matches]);
  const provisionalSemis = useMemo(() => computeProvisionalSemis(standings, teamsById), [standings, teamsById]);

  const groupOptions = useMemo(() => {
    const set = new Set();
    (matches || []).forEach((m) => m.group_name && set.add(m.group_name));
    return ["todos", ...Array.from(set).sort()];
  }, [matches]);

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
            Classificação por <strong>vitórias em sets</strong> (3 pts por vitória). Empate em sets é desempatado por <strong>pontos do placar</strong>.
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

              {/* Quartas (se existir ou placeholder a partir da classificação) */}
              {knockout.quartas?.length ? (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-gray-700">Quartas de final</h4>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {knockout.quartas.map((m, i) => (
                      <BracketMatchCard key={`q-${m?.id ?? i}`} match={m} />
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Semis — definitivas ou provisórias */}
              {(knockout.semis?.length || provisionalSemis) ? (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-gray-700">Semifinais</h4>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {Array.from({ length: Math.max(knockout.semis?.length || 0, 2) }).map((_, i) => {
                      const m = knockout.semis?.[i];
                      const ph =
                        !m && provisionalSemis
                          ? i === 0
                            ? { home: provisionalSemis.semi1.home?.name, away: provisionalSemis.semi1.away?.name }
                            : { home: provisionalSemis.semi2.home?.name, away: provisionalSemis.semi2.away?.name }
                          : undefined;
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
                  <li><strong>Vitória do jogo:</strong> definida por <strong>sets</strong>; se empatar em sets, desempata por <strong>pontos do placar</strong>.</li>
                  <li><strong>Classificação nos grupos:</strong> <strong>Pts</strong> (3 por vitória) ↓, depois <strong>SV</strong> ↓, <strong>SP</strong> ↑ e <strong>saldo de pontos</strong> ↓.</li>
                  <li><strong>Duração/placar:</strong> partidas em <strong>um set de 15 pontos</strong>, com <strong>2 de vantagem</strong>.</li>
                  <li><strong>Mata-mata:</strong> jogo único; empates seguem a regra definida pela organização.</li>
                </ul>
                {/* <a href="/regulamento-volei.pdf" className="mt-2 inline-flex text-blue-600 hover:underline">Abrir regulamento completo</a> */}
              </div>
            </section>
          </>
        )}
      </div>
    </ErrorBoundary>
  );
}
