// src/pages/Volei.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabaseClient";
import TeamBadge from "../components/TeamBadge";
import { HelpCircle } from "lucide-react";

const SPORT_LABEL = "Vôlei";
const SPORT_ICON = "🏐";
const LOGO_BUCKET = "team-logos";
const tz = "America/Sao_Paulo";

const STAGE_FRIENDLY = {
  r32: "Pré-oitavas",
  grupos: "Grupos",
  oitavas: "Oitavas",
  quartas: "Quartas",
  semi: "Semifinal",
  final: "Final",
  "3lugar": "3º lugar",
};
const friendlyStage = (s) => (s ? STAGE_FRIENDLY[s] || s : "");
const SPORT_NAMES = ["Vôlei", "Volei", "Voleibol"];

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

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) { console.error("Vôlei ErrorBoundary:", error, info); }
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

function TitleLine({ order_idx, stage, group_name }) {
  const parts = [];
  if (order_idx !== undefined && order_idx !== null && String(order_idx).length) parts.push(`Jogo ${order_idx}`);
  if (group_name) parts.push(`Grupo ${group_name}`);
  else if (stage) parts.push(friendlyStage(stage));
  return <div className="mb-1 text-sm font-semibold text-gray-900">{parts.join(" • ") || "—"}</div>;
}

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
        className={`block truncate text-base sm:text-lg font-semibold ${has ? "text-gray-900" : "text-gray-400"} ${align === "right" ? "text-right" : ""}`}
        style={{ fontSize: "1rem", lineHeight: "1.2", wordBreak: "keep-all", whiteSpace: "nowrap" }}
        title={displayName}
      >
        {displayName}
      </span>
      {align === "right" ? <TeamBadge team={{ ...(team || {}), name: displayName }} size={badge} /> : null}
    </>
  );
  if (!has) return <div className={`min-w-0 flex items-center gap-2 ${align === "right" ? "justify-end" : ""}`}>{content}</div>;
  return (
    <Link to={`/team/${team.id}`} className={`min-w-0 flex items-center gap-2 hover:underline ${align === "right" ? "justify-end" : ""}`} onClick={(e) => e.stopPropagation()} title={displayName}>
      {content}
    </Link>
  );
}

function BracketMatchCard({ match, placeholder }) {
  const resolvedHome = match?.home || (placeholder?.home ? { name: placeholder.home } : null);
  const resolvedAway = match?.away || (placeholder?.away ? { name: placeholder.away } : null);
  const home = resolvedHome?.id ? resolvedHome : { name: resolvedHome?.name || "A definir" };
  const away = resolvedAway?.id ? resolvedAway : { name: resolvedAway?.name || "A definir" };

  const showScore = match && match.status !== "scheduled";
  const homeScore = Number(match?.home_score ?? 0);
  const awayScore = Number(match?.away_score ?? 0);
  const homeSets = Number(match?.meta?.home_sets ?? 0);
  const awaySets = Number(match?.meta?.away_sets ?? 0);
  const isLive = match?.status === "ongoing" || match?.status === "paused";
  const liveHomeSetPts = Number(match?.meta?.home_points_set ?? 0);
  const liveAwaySetPts = Number(match?.meta?.away_points_set ?? 0);
  const hasSetsValue = homeSets > 0 || awaySets > 0;
  const shouldShowSets = hasSetsValue || showScore;
  const pointsLabel = isLive ? "Pts (set)" : "Pontos";
  const pointsHome = isLive ? liveHomeSetPts : homeScore;
  const pointsAway = isLive ? liveAwaySetPts : awayScore;

  const ScoreToken = ({ label, value, visible }) => (
    <div className="flex flex-col items-center justify-center rounded-lg border border-gray-200 bg-white px-2.5 py-1 shadow-inner">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</span>
      <span className="text-lg font-bold leading-none text-gray-900 tabular-nums">{visible ? value : "-"}</span>
    </div>
  );

  const ScoreRow = ({ team, align, sets, score }) => (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
      <div className={`${align === "right" ? "justify-self-end" : "justify-self-start"} min-w-0`}>
        <TeamChip team={team} align={align} />
      </div>
      <div className="flex items-center gap-2">
        {shouldShowSets ? <ScoreToken label="Sets" value={sets} visible={shouldShowSets} /> : null}
        <ScoreToken label={pointsLabel} value={score} visible={showScore} />
      </div>
    </div>
  );

  const body = (
    <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm transition hover:bg-gray-50">
      <TitleLine order_idx={match?.order_idx} stage={match?.stage} />
      <div className="mt-2 rounded-xl border border-gray-100 bg-gray-50 px-3 py-3 space-y-3">
        <ScoreRow team={home} align="left" sets={homeSets} score={pointsHome} />
        <div className="h-px bg-gray-200" />
        <ScoreRow team={away} align="right" sets={awaySets} score={pointsAway} />
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500">
        <span className="truncate">{match?.starts_at ? fmtDate(match.starts_at) : match?.venue || ""}</span>
        {showScore ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2 py-0.5 font-semibold text-gray-600">
            Sets {homeSets} <span className="text-gray-400">x</span> {awaySets}
          </span>
        ) : null}
      </div>
    </div>
  );

  return match?.id ? <Link to={`/match/${match.id}`} className="block">{body}</Link> : body;
}

function ListMatchCard({ match }) {
  const showScore = match?.status && match.status !== "scheduled";
  const homeScore = Number(match?.home_score ?? 0);
  const awayScore = Number(match?.away_score ?? 0);
  const homeSets = Number(match?.meta?.home_sets ?? 0);
  const awaySets = Number(match?.meta?.away_sets ?? 0);
  const isLive = match?.status === "ongoing" || match?.status === "paused";
  const liveHomeSetPts = Number(match?.meta?.home_points_set ?? 0);
  const liveAwaySetPts = Number(match?.meta?.away_points_set ?? 0);
  const hasSets = showScore && (homeSets > 0 || awaySets > 0);
  const pointsHome = isLive ? liveHomeSetPts : homeScore;
  const pointsAway = isLive ? liveAwaySetPts : awayScore;
  return (
    <Link to={`/match/${match.id}`} className="block rounded-xl border border-gray-200 bg-white p-3 shadow-sm transition hover:bg-gray-50">
      <TitleLine order_idx={match.order_idx} stage={match.stage} group_name={match.group_name} />
      <div className="mt-1 grid grid-cols-3 items-center gap-2">
        <TeamChip team={match.home} />
        <div className="text-center">
          {showScore ? (
            <>
              {hasSets ? <div className="text-[11px] font-medium tabular-nums text-gray-600 mb-0.5">Sets: {homeSets} <span className="text-gray-400">x</span> {awaySets}</div> : null}
              <div className="text-base font-bold tabular-nums">
                {pointsHome} <span className="text-gray-400">x</span> {pointsAway}
              </div>
            </>
          ) : <span className="text-xs text-gray-500">—</span>}
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

/* Seed comparator (mesma ordem da view volei) */
function compareVolleySeed(a, b) {
  return (
    (b.points ?? 0) - (a.points ?? 0) ||
    (b.sv ?? 0) - (a.sv ?? 0) ||
    (a.sp ?? 0) - (b.sp ?? 0) ||
    ((b.point_difference ?? ((b.pf ?? 0) - (b.pa ?? 0))) - (a.point_difference ?? ((a.pf ?? 0) - (a.pa ?? 0)))) ||
    (b.pf ?? 0) - (a.pf ?? 0) ||
    String(a.team_id).localeCompare(String(b.team_id))
  );
}

function computeProvisionalSemis(standings) {
  if (!Array.isArray(standings) || standings.length === 0) return [];

  const rows = standings
    .map((r) => ({ ...r, group_name: normGroup(r.group_name) }))
    .filter((r) => r.group_name && r.group_name !== "-");

  const byGroup = new Map();
  for (const r of rows) {
    const g = r.group_name;
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push(r);
  }
  for (const g of byGroup.keys()) byGroup.get(g).sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));

  const winners = [];
  const seconds = [];
  for (const [g, groupRows] of byGroup) {
    if (groupRows[0]) winners.push({ group: g, ...groupRows[0] });
    if (groupRows[1]) seconds.push({ group: g, ...groupRows[1] });
  }

  winners.sort(compareVolleySeed);
  seconds.sort(compareVolleySeed);

  const G = winners.length;
  if (G >= 4) {
    const seeds = winners.slice(0, 4);
    return [
      { stage: "semi", home: seeds[0], away: seeds[3] },
      { stage: "semi", home: seeds[1], away: seeds[2] },
    ];
  } else if (G === 3) {
    if (!seconds.length) return [];
    const bestSecond = seconds[0];
    return [
      { stage: "semi", home: winners[0], away: bestSecond },
      { stage: "semi", home: winners[1], away: winners[2] },
    ];
  } else if (G === 2) {
    if (seconds.length < 2) return [];
    const seeds = [...winners, seconds[0], seconds[1]].sort(compareVolleySeed);
    return [
      { stage: "semi", home: seeds[0], away: seeds[3] },
      { stage: "semi", home: seeds[1], away: seeds[2] },
    ];
  }
  return [];
}

/* Tabela de classificação (lê diretamente da standings_volei_view) */
function StandingsTable({ standings, teamsById }) {
  const groups = useMemo(() => {
    const map = {};
    for (const r of standings || []) {
      const g = r.group_name || "-";
      if (!map[g]) map[g] = [];
      map[g].push(r);
    }
    for (const g of Object.keys(map)) {
      // já vem ranqueada, mas garantimos por rank crescente
      map[g].sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
    }
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
                <th className="w-10 py-1 text-center">PC</th>
                <th className="w-12 py-1 text-center">+/-</th>
                <th className="w-12 py-1 text-center">Pts</th>
              </tr>
            </thead>
            <tbody>
              {groups[g].map((row) => {
                const team = teamsById[row.team_id] || { id: row.team_id, name: row.team_name || "—" };
                const saldo = Number(row.point_difference ?? ((row.pf ?? 0) - (row.pa ?? 0)));
                return (
                  <tr key={`${g}-${row.team_id}`} className="border-b">
                    <td className="py-1 pl-3">{row.rank}</td>
                    <td className="py-1">
                      <Link to={`/team/${team.id}`} className="flex items-center gap-2 hover:underline">
                        <TeamBadge team={{ ...team, logo_url: normalizeLogo(team.logo_url) }} size={20} />
                        <span className="truncate">{team.name}</span>
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
            Critérios/colunas: <strong>#</strong> (posição), <strong>Time</strong>, <strong>P</strong> (jogos), <strong>V</strong> (vitórias), <strong>D</strong> (derrotas), <strong>SV</strong> (sets vencidos), <strong>SP</strong> (sets perdidos), <strong>PF</strong> (pontos feitos), <strong>PC</strong> (pontos contra), <strong>+/-</strong> (saldo de pontos), <strong>Pts</strong> (pontos na tabela).
          </div>
        </div>
      ))}
    </div>
  );
}

const norm = (s) => (typeof s === "string" ? s.trim().toLowerCase() : "");
const normStage = (s) => {
  const m = norm(s);
  if (m === "semifinal" || m === "semi-final" || m === "semis") return "semi";
  if (m === "3º" || m === "3º lugar" || m === "terceiro" || m === "3-lugar") return "3lugar";
  return m;
};
const normStatus = (s) => {
  const m = norm(s);
  if (m === "encerrado" || m === "finalizado") return "finished";
  if (m === "agendado" || m === "programado") return "scheduled";
  return m || "scheduled";
};
const safeOrder = (r) => {
  const oi = Number(r.order_idx);
  const rd = Number(r.round);
  if (Number.isFinite(oi)) return oi;
  if (Number.isFinite(rd)) return rd;
  return r.id;
};

const normGroup = (g) => {
  if (!g) return "-";
  const s = String(g)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toUpperCase();
  if (!s) return "-";
  const m = s.match(/^GRUPO\s+([A-Z0-9]+)$/);
  return m ? m[1] : s;
};

function computeStandingsFromMatchesVolley(matches, teamsById) {
  const rows = new Map();
  const key = (g, id) => `${g}::${id}`;
  const getRow = (g, id) => {
    const k = key(g, id);
    if (!rows.has(k)) {
      rows.set(k, {
        group_name: g,
        team_id: id,
        team_name: teamsById?.[id]?.name ?? "—",
        matches_played: 0,
        wins: 0,
        losses: 0,
        sv: 0,
        sp: 0,
        pf: 0,
        pa: 0,
        points: 0,
      });
    }
    return rows.get(k);
  };
  // 1) Seed: todo time que aparece em QUALQUER match entra zerado no grupo correto
  const teamIdsSeeded = new Set();
  for (const m of matches || []) {
    const g = normGroup(m?.group_name) || "-";
    const hid = m?.home?.id;
    const aid = m?.away?.id;
    if (hid) { getRow(g, hid); teamIdsSeeded.add(hid); }
    if (aid) { getRow(g, aid); teamIdsSeeded.add(aid); }
  }
  // 2) Acúmulo: só conta estatísticas para "finished"
  for (const m of matches || []) {
    if (m?.status !== "finished") continue;
    const g = normGroup(m?.group_name) || "-";
    const hid = m?.home?.id;
    const aid = m?.away?.id;
    if (!hid || !aid) continue;
    const hr = getRow(g, hid);
    const ar = getRow(g, aid);
    const hs = Number(m?.meta?.home_sets ?? 0);
    const as = Number(m?.meta?.away_sets ?? 0);
    const hp = Number(m?.home_score ?? 0);
    const ap = Number(m?.away_score ?? 0);
    let homeWin = false, awayWin = false;
    if (hs !== as) { homeWin = hs > as; awayWin = !homeWin; }
    else if (hp !== ap) { homeWin = hp > ap; awayWin = !homeWin; }
    hr.matches_played++; ar.matches_played++;
    hr.sv += hs; hr.sp += as; hr.pf += hp; hr.pa += ap;
    ar.sv += as; ar.sp += hs; ar.pf += ap; ar.pa += hp;
    if (homeWin) { hr.wins++; hr.points += 3; ar.losses++; }
    else if (awayWin) { ar.wins++; ar.points += 3; hr.losses++; }
  }
  // 3) Completa apenas se soubermos o grupo; evita criar grupo "-" fantasma
  for (const id of Object.keys(teamsById || {})) {
    const numericId = Number(id);
    if (teamIdsSeeded.has(numericId) || teamIdsSeeded.has(id)) continue;
    const teamGroup = normGroup(teamsById[id]?.group_name);
    if (teamGroup && teamGroup !== "-") {
      getRow(teamGroup, id);
    }
  }
  const byGroup = {};
  for (const r of rows.values()) {
    r.point_difference = Number(r.pf) - Number(r.pa);
    (byGroup[r.group_name] ||= []).push(r);
  }
  const out = [];
  for (const g of Object.keys(byGroup).sort()) {
    byGroup[g].sort(compareVolleySeed);
    byGroup[g].forEach((r, i) => out.push({ ...r, rank: i + 1 }));
  }
  return out;
}

export default function Volei() {
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

  const loadSportId = useCallback(async () => {
    try {
      // busca por quaisquer variações de nome
      const { data, error } = await supabase
        .from("sports")
        .select("id, name")
        .in("name", SPORT_NAMES)
        .limit(1); // pega o 1º que aparecer
  
      if (error) throw error;
      if (data && data[0]?.id) {
        setSportId(data[0].id);
      } else {
        console.warn("⚠️ Esporte Vôlei não encontrado em 'sports' (nomes tentados:", SPORT_NAMES.join(", "), ")");
        setSportId(null);
      }
    } catch (e) {
      console.error("Exceção loadSportId:", e);
      setSportId(null);
    }
  }, []);  

  const loadTeams = useCallback(async (sid) => {
    try {
      // 1) por sport_id (normal)
      if (sid) {
        const byId = await supabase.from("teams").select("id, name, logo_url, color, group_name").eq("sport_id", sid);
        if (!byId.error && Array.isArray(byId.data) && byId.data.length > 0) {
          const map = {};
          for (const t of byId.data) {
            map[t.id] = {
              ...t,
              name: String(t.name ?? "—"),
              logo_url: normalizeLogo(t.logo_url),
            };
          }
          setTeamsById(map);
          teamsRef.current = map;
          return; // só retorna se achou times
        }
      }
      // 2) fallback por NOME (join)
      const byName = await supabase
        .from("teams")
        .select("id, name, logo_url, color, group_name, sport:sport_id!inner(name)")
        .in("sport.name", SPORT_NAMES);

      if (byName.error) throw byName.error;
      const map = {};
      for (const t of byName.data || []) {
        map[t.id] = {
          ...t,
          name: String(t.name ?? "—"),
          logo_url: normalizeLogo(t.logo_url),
        };
      }
      setTeamsById(map);
      teamsRef.current = map; // mantém o ref sincronizado
    } catch (e) {
      console.error("Exceção loadTeams:", e);
      setTeamsById({});
      teamsRef.current = {};
    }
  }, []);  

  const loadStandings = useCallback(async (sid) => {
    try {
      // 1) Tenta a VIEW específica do vôlei por sport_id
      if (sid) {
        const v = await supabase
          .from("standings_volei_view")
          .select("group_name, rank, team_id, team_name, matches_played, wins, losses, sv, sp, pf, pa, point_difference, points")
          .eq("sport_id", sid)
          .order("group_name", { ascending: true, nullsFirst: true })
          .order("rank", { ascending: true });
  
        if (!v.error && Array.isArray(v.data) && v.data.length > 0) {
          console.info("[Vôlei] standings via VIEW/sport_id:", v.data.length);
          setStandings(v.data);
          return;
        }
      }
  
      // 2) Fallback: tabela 'standings' por sport_id
      if (sid) {
        const j = await supabase
          .from("standings")
          .select(`
            group_name, rank, team_id,
            matches_played, wins, losses,
            sv, sp, pf, pa, point_difference, points,
            team:teams!standings_team_id_fkey(name)
          `)
          .eq("sport_id", sid)
          .order("group_name", { ascending: true, nullsFirst: true })
          .order("rank", { ascending: true });
  
        const rowsSid = (j.data || []).map((r) => ({
          ...r,
          team_name: r.team?.name,
          sv: Number(r.sv ?? 0),
          sp: Number(r.sp ?? 0),
          pf: Number(r.pf ?? 0),
          pa: Number(r.pa ?? 0),
          point_difference: Number(r.point_difference ?? ((r.pf ?? 0) - (r.pa ?? 0))),
        }));
  
        if (!j.error && rowsSid.length > 0) {
          console.info("[Vôlei] standings via TABLE/sport_id:", rowsSid.length);
          setStandings(rowsSid);
          return;
        }
      }
  
      // 3) Fallback final: tabela 'standings' via JOIN pelo NOME do esporte (não depende de sport_id)
      const byName = await supabase
        .from("standings")
        .select(`
          group_name, rank, team_id,
          matches_played, wins, losses,
          sv, sp, pf, pa, point_difference, points,
          team:teams!inner(name, id),
          sport:sport_id!inner(name, id)
        `)
        .in("sport.name", SPORT_NAMES)
        .order("group_name", { ascending: true, nullsFirst: true })
        .order("rank", { ascending: true });
  
      const rowsByName = (byName.data || []).map((r) => ({
        ...r,
        team_name: r.team?.name,
        sv: Number(r.sv ?? 0),
        sp: Number(r.sp ?? 0),
        pf: Number(r.pf ?? 0),
        pa: Number(r.pa ?? 0),
        point_difference: Number(r.point_difference ?? ((r.pf ?? 0) - (r.pa ?? 0))),
      }));
  
      console.info("[Vôlei] standings via TABLE/join por nome:", rowsByName.length, "— esportes possíveis:", SPORT_NAMES);
      setStandings(rowsByName);
    } catch (e) {
      console.error("Exceção loadStandings (vôlei):", e);
      setStandings([]);
    }
  }, []);  

  const loadMatches = useCallback(async (sid) => {
    try {
      if (!sid) { setMatches([]); return; }
      const { data, error } = await supabase
        .from("matches")
        .select(`
          id, sport_id,
          stage, round, group_name, starts_at, updated_at, venue, status, meta,
          home_team_id, away_team_id, home_score, away_score, order_idx
        `)
        .eq("sport_id", sid);
      if (error) throw error;
      const mkTeam = (id) => (id ? ({ ...(teamsRef.current[id] || {}), id, name: String((teamsRef.current[id]?.name ?? "A definir")) }) : { name: "A definir" });
      const rows = (data || []).map((r) => {
        const numericOrder = Number(r.order_idx);
        const orderKey = Number.isFinite(numericOrder) ? numericOrder : Number.MAX_SAFE_INTEGER;
        const displayOrder = Number.isFinite(numericOrder) ? numericOrder : null;
        return {
          id: r.id,
          sport_id: r.sport_id,
          order_idx: displayOrder, // para exibir
          _orderKey: orderKey,     // para ordenar
          stage: normStage(r.stage),
          round: r.round,
          group_name: r.group_name,
          starts_at: r.starts_at,
          updated_at: r.updated_at,
          venue: r.venue,
          status: normStatus(r.status),
          meta: r.meta,
          home_score: r.home_score,
          away_score: r.away_score,
          home: mkTeam(r.home_team_id),
          away: mkTeam(r.away_team_id),
        };
      });
      const phaseRank = { grupos: 1, oitavas: 2, quartas: 3, semi: 4, "3lugar": 5, final: 6 };
      rows.sort((a, b) => {
        const diff = (a._orderKey ?? Number.MAX_SAFE_INTEGER) - (b._orderKey ?? Number.MAX_SAFE_INTEGER);
        if (diff !== 0) return diff;
        const stageDiff = (phaseRank[a.stage] ?? 99) - (phaseRank[b.stage] ?? 99);
        if (stageDiff !== 0) return stageDiff;
        const timeDiff = ts(a.starts_at) - ts(b.starts_at);
        if (timeDiff !== 0) return timeDiff;
        return ts(a.updated_at) - ts(b.updated_at);
      });
      setMatches(rows);
      console.info("[Vôlei] matches carregados:", rows.length);
    } catch (e) {
      console.error("Exceção loadMatches (vôlei):", e);
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

  useEffect(() => { loadSportId(); }, [loadSportId]);

  useEffect(() => {
    if (!sportId) {
      setLoading(false);
      return;
    }
    loadAll(sportId, { skeleton: true });
  
    if (channelRef.current) {
      try { supabase.removeChannel(channelRef.current); } catch {}
      channelRef.current = null;
    }
    const onChange = () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => loadAll(sportId, { skeleton: false }), 1000);
    };
    const ch = supabase
      .channel(`volei-hub-${sportId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "matches", filter: `sport_id=eq.${sportId}` }, onChange)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "matches", filter: `sport_id=eq.${sportId}` }, onChange)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "matches", filter: `sport_id=eq.${sportId}` }, onChange)
      .subscribe();
    channelRef.current = ch;
  
    return () => {
      if (refreshTimerRef.current) { clearTimeout(refreshTimerRef.current); refreshTimerRef.current = null; }
      if (channelRef.current) { try { supabase.removeChannel(channelRef.current); } catch {} channelRef.current = null; }
    };
  }, [sportId, loadAll]);  

  useEffect(() => {
    if (!loading) {
      const computed = computeStandingsFromMatchesVolley(matches, teamsRef.current);
      if (computed.length) {
        setStandings(computed);
      }
    }
  }, [loading, matches, teamsById]);

  useEffect(() => {
    if (!loading && standings.length === 0 && matches.length > 0) {
      const computed = computeStandingsFromMatchesVolley(matches, teamsRef.current);
      if (computed.length) {
        console.info("[Vôlei] standings derivadas de matches:", computed.length);
        setStandings(computed);
      }
    }
  }, [loading, standings.length, matches]);

  // Garante que TODOS os times apareçam na tabela (mesmo zerados)
  useEffect(() => {
    if (!standings) return;

    // quem já está na tabela
    const present = new Set(standings.map((r) => String(r.team_id)));
    const allTeamIds = Object.keys(teamsRef.current || {});
    const missing = allTeamIds.filter((id) => !present.has(String(id)));
    if (missing.length === 0) return;

    // conta frequência de grupos por time
    const freqByTeam = new Map();
    for (const m of matches || []) {
      const g = normGroup(m?.group_name);
      if (!g) continue;
      const bump = (id) => {
        if (!id) return;
        const k = String(id);
        const f = freqByTeam.get(k) || {};
        f[g] = (f[g] || 0) + 1;
        freqByTeam.set(k, f);
      };
      bump(m?.home?.id);
      bump(m?.away?.id);
    }
    const pickGroup = (id) => {
      const f = freqByTeam.get(String(id)) || {};
      const best = Object.entries(f).sort((a,b)=>b[1]-a[1])[0];
      return best ? best[0] : "-";
    };

    // cria linhas zeradas para os ausentes
    const zeroRows = missing.map((id) => {
      const t = teamsRef.current[id] || {};
      // Prioriza o grupo cadastrado no time, depois o mais frequente nas partidas, senão '-'
      const groupFromTeam = t.group_name ? normGroup(t.group_name) : null;
      const group = groupFromTeam || pickGroup(id) || "-";
      return {
        group_name: group,
        team_id: isNaN(Number(id)) ? id : Number(id),
        team_name: t.name || "—",
        matches_played: 0,
        wins: 0,
        losses: 0,
        sv: 0,
        sp: 0,
        pf: 0,
        pa: 0,
        point_difference: 0,
        points: 0,
      };
    });

    // mescla + reordena + recalcula rank por grupo
    const merged = [...standings, ...zeroRows];
    const byGroup = {};
    for (const r of merged) {
      const g = r.group_name || "-";
      const pd = Number(r.point_difference ?? ((r.pf ?? 0) - (r.pa ?? 0)));
      (byGroup[g] ||= []).push({ ...r, point_difference: pd });
    }

    const out = [];
    for (const g of Object.keys(byGroup).sort()) {
      byGroup[g].sort(compareVolleySeed);
      byGroup[g].forEach((r, i) => out.push({ ...r, rank: i + 1 }));
    }

    setStandings(out);
  }, [standings, matches, teamsById]);

  const hasGroups = standings.length > 0;
  const knockout = useMemo(() => {
    const byStage = (stage) =>
      (matches || [])
        .filter((m) => m.stage === stage)
        .sort((a, b) => (Number(a?.order_idx) || Number.MAX_SAFE_INTEGER) - (Number(b?.order_idx) || Number.MAX_SAFE_INTEGER));
    const semis = byStage("semi");
    const final = byStage("final");
    const third = byStage("3lugar");
    return { semis, final: final[0], third: third[0] };
  }, [matches]);

  const provisionalSemis = useMemo(() => computeProvisionalSemis(standings), [standings]);
  const semisToShow = knockout.semis?.length ? knockout.semis : provisionalSemis || [];

  const groupOptions = useMemo(() => {
    const set = new Set();
    (matches || []).forEach((m) => {
      const g = normGroup(m.group_name);
      if (g && g !== "-") set.add(g);
    });
    return ["todos", ...Array.from(set).sort()];
  }, [matches]);

  const stageOptions = useMemo(() => {
    const set = new Set(); (matches || []).forEach((m) => m.stage && set.add(m.stage));
    const order = ["r32", "grupos", "oitavas", "quartas", "semi", "3lugar", "final"];
    const ordered = Array.from(set).sort((a, b) => (order.indexOf(a) + 100) - (order.indexOf(b) + 100));
    return ["todos", ...ordered];
  }, [matches]);

  const scheduledAll = useMemo(() => {
    const groupsPending = (matches || []).some(
      (m) => m.stage === "grupos" && m.status !== "finished"
    );
    let arr = (matches || []).filter(
      (m) => m.status === "scheduled" && (groupsPending ? m.stage === "grupos" : true)
    );
    if (groupFilter !== "todos") arr = arr.filter((m) => normGroup(m.group_name) === groupFilter);
    if (stageFilter !== "todos") arr = arr.filter((m) => m.stage === stageFilter);
    const orderValue = (m) => {
      const v = Number(m?.order_idx);
      return Number.isFinite(v) ? v : Number.MAX_SAFE_INTEGER;
    };
    arr.sort((a, b) => {
      const diff = orderValue(a) - orderValue(b);
      if (diff !== 0) return diff;
      const timeDiff = ts(a.starts_at) - ts(b.starts_at);
      if (timeDiff !== 0) return timeDiff;
      return ts(a.updated_at) - ts(b.updated_at);
    });
    return arr;
  }, [matches, groupFilter, stageFilter]);

  const finishedRecent = useMemo(() => {
    const arr = (matches || []).filter((m) => m.status === "finished");
    arr.sort((a, b) => ts(b.updated_at || b.starts_at || 0) - ts(a.updated_at || a.starts_at || 0));
    return arr.slice(0, 12);
  }, [matches]);

  return (
    <ErrorBoundary>
      <div className="space-y-10">
        <header className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{SPORT_ICON}</span>
            <h2 className="text-2xl font-bold">{SPORT_LABEL}</h2>
          </div>
          <p className="text-sm text-gray-600">
            Classificação por <strong>sets</strong> (3 pts por vitória). Empate em sets desempata por <strong>pontos do placar</strong>.
          </p>
        </header>

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
            {hasGroups && (
              (() => {
                const filteredStandings = (standings || []).filter(
                  (r) => normGroup(r.group_name) !== "-"
                );
                if (!filteredStandings.length) return null;
                return (
                  <section className="space-y-4">
                    <h3 className="text-lg font-bold">Tabela de classificação</h3>
                    <StandingsTable standings={filteredStandings} teamsById={teamsById} />
                  </section>
                );
              })()
            )}

            <section className="space-y-4">
              <h3 className="text-lg font-bold">Chaveamento</h3>

              {/* Semifinais — definitivas ou provisórias */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-gray-700">Semifinais</h4>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {Array.from({ length: Math.max(semisToShow.length, 2) }).map((_, i) => {
                    const m = semisToShow[i];
                    const ph = !m
                      ? { home: i === 0 ? "A definir" : "A definir", away: "A definir" }
                      : undefined;
                    return <BracketMatchCard key={`s-${m?.id ?? i}`} match={m} placeholder={ph} />;
                  })}
                </div>
              </div>

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

            <section className="space-y-4">
              <h3 className="text-lg font-bold">Jogos agendados</h3>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <label className="text-gray-600">Grupo:</label>
                <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} className="rounded-md border border-gray-300 bg-white px-2 py-1">
                  {["todos", ...new Set((matches || []).map((m) => m.group_name).filter(Boolean)).values()].map((g) => (
                    <option key={g} value={g}>{g === "todos" ? "Todos" : `Grupo ${g}`}</option>
                  ))}
                </select>
                <label className="text-gray-600">Fase:</label>
                <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} className="rounded-md border border-gray-300 bg-white px-2 py-1">
                  {["todos", ...new Set((matches || []).map((m) => m.stage).filter(Boolean)).values()].map((st) => (
                    <option key={st} value={st}>{st === "todos" ? "Todas" : friendlyStage(st)}</option>
                  ))}
                </select>
              </div>

              {scheduledAll.length ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {scheduledAll.map((m, i) => <ListMatchCard key={m.id ?? `sched-${i}`} match={m} />)}
                </div>
              ) : (
                <div className="text-xs text-gray-500">Nenhum jogo agendado no momento.</div>
              )}

              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-gray-700">Encerrados (recentes)</h4>
                {finishedRecent.length ? (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {finishedRecent.map((m, i) => <ListMatchCard key={m.id ?? `fin-${i}`} match={m} />)}
                  </div>
                ) : (
                  <div className="text-xs text-gray-500">Sem resultados recentes.</div>
                )}
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-lg font-bold">Regulamento</h3>
              <div className="rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-700 shadow-sm">
                <ul className="list-disc space-y-1 pl-5">
                  <li><strong>Duração:</strong> partidas com <strong>um set de 15 pontos</strong>.</li>
                  <li><strong>Vitória:</strong> é necessário ter <strong>dois pontos de vantagem</strong> para vencer a partida.</li>
                  <li><strong>Formato:</strong> fase de grupos (3 grupos de 3 equipes) e mata-mata.</li>
                  <li><strong>Classificação (grupos):</strong> o 1º colocado de cada grupo e o melhor 2º colocado avançam para o mata-mata.</li>
                  <li><strong>Desempate (grupos):</strong> confronto direto; se houver 3 empates, será utilizado o diferencial de pontos.</li>
                  <li><strong>Mata-mata:</strong> duas semifinais e uma final.</li>
                  <li><strong>Semifinais:</strong> Vencedor do grupo A × Vencedor do grupo B; Vencedor do grupo C × Melhor 2º colocado.</li>
                  <li><strong>Substituições:</strong> ilimitadas.</li>
                  <li><strong>Rodízio:</strong> obrigatório.</li>
                </ul>
              </div>
            </section>
          </>
        )}
      </div>
    </ErrorBoundary>
  );
}
