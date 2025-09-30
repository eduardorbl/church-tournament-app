// src/pages/FIFA.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabaseClient";
import TeamBadge from "../components/TeamBadge";

/* ──────────────────────────────────────────────────────────────────────────────
   Hub FIFA — Mata-mata desde o início
   1) Chaveamento (sempre visível, com placeholders “Vencedor Jx”)
   2) Jogos agendados (lista integral, cronológica)
   3) Regulamento
   ────────────────────────────────────────────────────────────────────────────── */

const SPORT_LABEL = "FIFA";
const SPORT_ICON = "🎮⚽";
const LOGO_BUCKET = "team-logos";
const tz = "America/Sao_Paulo";

const STAGE_FRIENDLY = {
  oitavas: "Oitavas",
  quartas: "Quartas",
  semi: "Semifinal",
  final: "Final",
  "1º": "1ª fase",
  "2º": "2ª fase",
  "3º": "3ª fase",
  "4º": "4ª fase",
};
const STAGE_ORDER = { "1º": 1, oitavas: 1, "2º": 2, quartas: 2, "3º": 3, semi: 3, "4º": 4, final: 4 };
const friendlyStage = (s) => (s ? STAGE_FRIENDLY[s] || s : "");
const stageOrder = (s) => STAGE_ORDER[s] ?? STAGE_ORDER[String(s || "").toLowerCase()] ?? 99;

/* ── Datas ─────────────────────────────────────────────────────────────────── */
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
    return d.toLocaleString("pt-BR", { timeZone: tz, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

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

/* ── Placeholders do bracket (32 participantes) ───────────────────────────────
   J1..J16 → 1ª rodada
   J17..J24 ← Vencedores [1,2], [3,4], ..., [15,16]
   J25..J28 ← [17,18], [19,20], [21,22], [23,24]
   J29..J30 ← [25,26], [27,28]
   J31     ← [29,30]
----------------------------------------------------------------------------- */
const PREV_MAP = { 17:[1,2], 18:[3,4], 19:[5,6], 20:[7,8], 21:[9,10], 22:[11,12], 23:[13,14], 24:[15,16],
                   25:[17,18], 26:[19,20], 27:[21,22], 28:[23,24], 29:[25,26], 30:[27,28], 31:[29,30] };
const previousFor = (idx) => PREV_MAP[Number(idx)] || null;

/* ── UI: Título compacto ───────────────────────────────────────────────────── */
function TitleLine({ order_idx, stage }) {
  const chips = [];
  if (order_idx !== undefined && order_idx !== null && String(order_idx).length) chips.push(`Jogo ${order_idx}`);
  if (stage) chips.push(friendlyStage(stage));
  return <div className="mb-1 text-sm font-semibold text-gray-900">{chips.join(" • ") || "—"}</div>;
}

/* ── UI: TeamChip (nome seguro) ────────────────────────────────────────────── */
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
      <span className={`truncate ${has ? "text-gray-900" : "text-gray-400"} ${align === "right" ? "text-right" : ""}`} title={displayName}>
        {displayName}
      </span>
      {align === "right" ? <TeamBadge team={{ ...(team || {}), name: displayName }} size={badge} /> : null}
    </>
  );

  if (!has) return <div className={`min-w-0 flex items-center gap-2 ${align === "right" ? "justify-end" : ""}`}>{content}</div>;

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

/* ── UI: Cartões ───────────────────────────────────────────────────────────── */
function BracketMatchCard({ match, placeholders }) {
  const home = match.home;
  const away = match.away;
  const homeName = home?.name || placeholders?.home || "A definir";
  const awayName = away?.name || placeholders?.away || "A definir";

  const showScore = match?.status && match.status !== "scheduled";
  const homeScore = Number(match?.home_score ?? 0);
  const awayScore = Number(match?.away_score ?? 0);

  return (
    <Link to={`/match/${match.id}`} className="block rounded-2xl border border-gray-200 bg-white p-3 shadow-sm transition hover:bg-gray-50">
      <TitleLine order_idx={match.order_idx} stage={match.stage} />
      {/* alinhamento perfeito: time esquerda | x centro | time direita */}
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
        <span className="truncate">{match.starts_at ? fmtDate(match.starts_at) : match.venue || ""}</span>
        {showScore ? (
          <span className="tabular-nums font-semibold text-gray-700">
            {homeScore} <span className="text-gray-400">x</span> {awayScore}
          </span>
        ) : null}
      </div>
    </Link>
  );
}

function ListMatchCard({ match }) {
  const showScore = match?.status && match.status !== "scheduled";
  const homeScore = Number(match?.home_score ?? 0);
  const awayScore = Number(match?.away_score ?? 0);

  return (
    <Link to={`/match/${match.id}`} className="block rounded-xl border border-gray-200 bg-white p-3 shadow-sm transition hover:bg-gray-50">
      <TitleLine order_idx={match.order_idx} stage={match.stage} />
      <div className="mt-1 grid grid-cols-3 items-center gap-2">
        <TeamChip team={match.home?.id ? match.home : { name: "A definir" }} />
        <div className="text-center">
          {showScore ? (
            <span className="text-base font-bold tabular-nums">
              {homeScore} <span className="text-gray-400">x</span> {awayScore}
            </span>
          ) : (
            <span className="text-xs text-gray-500">—</span>
          )}
        </div>
        <TeamChip team={match.away?.id ? match.away : { name: "A definir" }} align="right" />
      </div>
      <div className="mt-1 text-[11px] text-gray-500 flex items-center justify-between">
        <span className="truncate">{match.starts_at ? fmtDate(match.starts_at) : match.venue || ""}</span>
        {match.updated_at && match.status === "finished" ? <span className="truncate">Encerrado em {fmtDate(match.updated_at)}</span> : null}
      </div>
    </Link>
  );
}

/* ── Página — FIFA (hub) ──────────────────────────────────────────────────── */
export default function FIFA() {
  const [sportId, setSportId] = useState(null);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef(null);
  const reloadingRef = useRef(false);

  const loadSportId = useCallback(async () => {
    const { data, error } = await supabase.from("sports").select("id").eq("name", "FIFA").maybeSingle();
    if (error) {
      console.error("Erro ao carregar sport id:", error);
      return;
    }
    if (data?.id) setSportId(data.id);
  }, []);

  const loadMatches = useCallback(async (sid) => {
    try {
      // 1) View detalhada (preferida)
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
        // 2) Fallback: tabela matches + join
        const { data: jrows, error: jerr } = await supabase
          .from("matches")
          .select(`
            id, order_idx, stage, round, group_name, starts_at, updated_at, venue, status,
            home_score, away_score,
            home:home_team_id ( id, name, logo_url, color ),
            away:away_team_id ( id, name, logo_url, color )
          `)
          .eq("sport_id", sid);

        if (jerr) throw jerr;

        rows = (jrows || []).map((m) => ({
          ...m,
          home: m.home && typeof m.home === "object" ? { ...m.home, name: String(m.home.name ?? "A definir"), logo_url: normalizeLogo(m.home.logo_url) } : m.home,
          away: m.away && typeof m.away === "object" ? { ...m.away, name: String(m.away.name ?? "A definir"), logo_url: normalizeLogo(m.away.logo_url) } : m.away,
        }));
      }

      // Ordena: estágio lógico → order_idx
      rows.sort((a, b) => {
        const so = stageOrder(a.stage) - stageOrder(b.stage);
        if (so !== 0) return so;
        return (a.order_idx ?? 9999) - (b.order_idx ?? 9999);
      });

      setMatches(rows);
    } catch (e) {
      console.error("Exceção loadMatches:", e);
      setMatches([]);
    }
  }, []);

  const loadAll = useCallback(async (sid) => {
    if (reloadingRef.current) return;
    reloadingRef.current = true;
    setLoading(true);
    try {
      await loadMatches(sid);
    } finally {
      setLoading(false);
      reloadingRef.current = false;
    }
  }, [loadMatches]);

  useEffect(() => {
    loadSportId();
  }, [loadSportId]);

  useEffect(() => {
    if (!sportId) return;
    loadAll(sportId);

    // Realtime
    if (channelRef.current) {
      try { supabase.removeChannel(channelRef.current); } catch {}
      channelRef.current = null;
    }
    const ch = supabase
      .channel(`fifa-hub-${sportId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "matches", filter: `sport_id=eq.${sportId}` }, () => {
        loadAll(sportId);
      })
      .subscribe();
    channelRef.current = ch;

    return () => {
      if (channelRef.current) {
        try { supabase.removeChannel(channelRef.current); } catch {}
        channelRef.current = null;
      }
    };
  }, [sportId, loadAll]);

  /* ── Derivações ──────────────────────────────────────────────────────────── */
  const placeholdersFor = useCallback((orderIdx) => {
    const prev = previousFor(orderIdx);
    return prev ? { home: `Vencedor J${prev[0]}`, away: `Vencedor J${prev[1]}` } : null;
  }, []);

  const stages = useMemo(() => {
    const groups = {};
    for (const m of matches) {
      const k = m.stage || "—";
      if (!groups[k]) groups[k] = [];
      groups[k].push(m);
    }
    const ordered = Object.keys(groups).sort((a, b) => stageOrder(a) - stageOrder(b));
    return ordered.map((k) => ({ stage: k, items: groups[k].sort((a, b) => (a.order_idx ?? 0) - (b.order_idx ?? 0)) }));
  }, [matches]);

  const scheduled = useMemo(() => {
    const arr = (matches || []).filter((m) => m.status === "scheduled");
    arr.sort((a, b) => {
      const da = a.starts_at ? parseDateSafe(a.starts_at)?.getTime() ?? Number.POSITIVE_INFINITY : Number.POSITIVE_INFINITY;
      const db = b.starts_at ? parseDateSafe(b.starts_at)?.getTime() ?? Number.POSITIVE_INFINITY : Number.POSITIVE_INFINITY;
      return da - db;
    });
    return arr;
  }, [matches]);

  const finished = useMemo(() => {
    const arr = (matches || []).filter((m) => m.status === "finished");
    arr.sort((a, b) => {
      const ta = parseDateSafe(a.updated_at || a.starts_at || 0)?.getTime() ?? 0;
      const tb = parseDateSafe(b.updated_at || b.starts_at || 0)?.getTime() ?? 0;
      return tb - ta;
    });
    return arr;
  }, [matches]);

  /* ── Render ──────────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-10">
      {/* Header */}
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{SPORT_ICON}</span>
          <h2 className="text-2xl font-bold">{SPORT_LABEL}</h2>
        </div>
        <p className="text-sm text-gray-600">
          Hub informativo: <strong>chaveamento</strong> completo (com placeholders) → <strong>jogos agendados</strong> → <strong>regulamento</strong>.
          Não há indicadores de “ao vivo/pausado” nesta página.
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
          {/* 1) CHAVEAMENTO */}
          <section className="space-y-6">
            <h3 className="text-lg font-bold">Chaveamento</h3>
            {stages.map(({ stage, items }) => (
              <div key={stage} className="space-y-2">
                <h4 className="text-sm font-semibold text-gray-700">{friendlyStage(stage) || "Fase"}</h4>
                {items.length ? (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {items.map((m) => (
                      <BracketMatchCard key={m.id} match={m} placeholders={placeholdersFor(Number(m.order_idx))} />
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-gray-500">Sem confrontos nesta fase.</div>
                )}
              </div>
            ))}
          </section>

          {/* 2) JOGOS AGENDADOS (lista integral) */}
          <section className="space-y-6">
            <h3 className="text-lg font-bold">Jogos agendados</h3>

            {/* Próximos */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-gray-700">Próximos jogos</h4>
              {scheduled.length ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {scheduled.map((m) => (
                    <ListMatchCard key={m.id} match={m} />
                  ))}
                </div>
              ) : (
                <div className="text-xs text-gray-500">Nenhum jogo agendado no momento.</div>
              )}
            </div>

            {/* Encerrados (recentes) */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-gray-700">Encerrados (recentes)</h4>
              {finished.length ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {finished.slice(0, 12).map((m) => (
                    <ListMatchCard key={m.id} match={m} />
                  ))}
                </div>
              ) : (
                <div className="text-xs text-gray-500">Sem resultados recentes.</div>
              )}
            </div>
          </section>

          {/* 3) REGULAMENTO */}
          <section className="space-y-3">
            <h3 className="text-lg font-bold">Regulamento</h3>
            <div className="rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-700 shadow-sm">
              <ul className="list-disc space-y-1 pl-5">
                <li><strong>Formato:</strong> torneio de <strong>mata-mata</strong> (eliminação simples).</li>
                <li><strong>Estrutura:</strong> fases iniciais → oitavas/quartas → semifinais → final.</li>
                <li><strong>Partidas:</strong> jogo único por confronto.</li>
                <li><strong>Desempate:</strong> prorrogação e/ou pênaltis conforme necessário.</li>
                <li><strong>Configurações do console:</strong> duração, times e regras definidas pela organização.</li>
              </ul>
              {/* <a href="/regulamento-fifa.pdf" className="mt-2 inline-flex text-blue-600 hover:underline">Abrir regulamento completo</a> */}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
