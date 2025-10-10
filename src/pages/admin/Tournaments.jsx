// src/pages/admin/Tournaments.jsx
// Página de campeonatos, compatível com os 3 cartões (Ao vivo / ⚠️ Compareçam / Próximo)
// e com as RPCs: admin_generate_group_fixtures_3x3, admin_generate_fifa_oitavas32,
// admin_start_first_if_idle, admin_finish_live_and_start_next.

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../supabaseClient";
import {
  PlayCircle,
  FastForward,
  RotateCw,
  Settings,
  ListChecks,
  Trash2,
  Trophy,
  Loader2,
  ChevronRight,
  ShieldAlert,
} from "lucide-react";

// ========================= Constantes do domínio =========================
const RULES = {
  pebolim: { name: "Pebolim", required: 24, path: "/admin/campeonatos/pebolim", variant: "1v3_1v2_3v2" },
  fifa:    { name: "FIFA",    required: 32, path: "/admin/campeonatos/fifa" },
  futsal:  { name: "Futsal",  required: 9,  path: "/admin/campeonatos/futsal", variant: "1v3_1v2_3v2" },
  volei:   { name: "Vôlei",   required: 9,  path: "/admin/campeonatos/volei",  variant: "1v2_1v3_2v3" },
};

// Map para casar nomes da tabela com as chaves locais
const NAME_TO_KEY = {
  Pebolim: "pebolim",
  FIFA: "fifa",
  Futsal: "futsal",
  Volei: "volei",
  "Vôlei": "volei",
};

const toKey = (s = "") =>
  s.trim().normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

// ========================= UI Helpers =========================
const Badge = ({ children, tone = "gray" }) => (
  <span
    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${
      tone === "green"
        ? "bg-green-50 text-green-700 border-green-200"
        : tone === "amber"
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : tone === "red"
        ? "bg-red-50 text-red-700 border-red-200"
        : tone === "blue"
        ? "bg-blue-50 text-blue-700 border-blue-200"
        : "bg-gray-50 text-gray-700 border-gray-200"
    }`}
  >
    {children}
  </span>
);

const Card = ({ children, className = "" }) => (
  <div className={`rounded-2xl border border-gray-200 bg-white shadow-sm ${className}`}>{children}</div>
);

const CardHeader = ({ title, subtitle, right }) => (
  <div className="flex items-start justify-between gap-3 p-4 sm:p-5">
    <div>
      <h3 className="text-lg font-semibold leading-tight">{title}</h3>
      {subtitle && <p className="mt-1 text-sm text-gray-600">{subtitle}</p>}
    </div>
    {right}
  </div>
);

const PrimaryButton = ({ children, className = "", ...props }) => (
  <button
    className={`inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500 ${className}`}
    {...props}
  >
    {children}
  </button>
);

const GhostButton = ({ children, className = "", ...props }) => (
  <button
    className={`inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    {...props}
  >
    {children}
  </button>
);

// ========================= Página =========================
export default function AdminTournaments() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState(null);
  const [sports, setSports] = useState([]); // [{id,name,key}]
  const [info, setInfo] = useState({}); // key -> { teamCount, groupsMeta, matchesCount, standingsCount, hasAny, sportId, queueSlots, queueDetails }
  const [busy, setBusy] = useState({}); // key -> boolean
  const [confirm, setConfirm] = useState(null); // { key, name }
  const [confirmGenerate, setConfirmGenerate] = useState(null); // { key, name }

  // --------- Load (sports + per-sport meta) ---------
  const load = async () => {
    setLoading(true);
    setFlash(null);
    try {
      const { data: sportsRows, error: sportsErr } = await supabase
        .from("sports")
        .select("id,name")
        .order("name", { ascending: true });
      if (sportsErr) throw sportsErr;

      const mapped = sportsRows.map((s) => ({
        id: s.id,
        name: s.name,
        key: NAME_TO_KEY[s.name?.trim()] || toKey(s.name),
      }));
      setSports(mapped);

      // Fetch per-sport info em paralelo
      const entries = await Promise.all(
        mapped.map(async (s) => {
          const [teamsCountRes, groupsRes, matchesRes, standingsRes] = await Promise.all([
            supabase.from("teams").select("id", { count: "exact", head: true }).eq("sport_id", s.id),
            supabase
              .from("teams")
              .select("id, name, group_name, seed_in_group")
              .eq("sport_id", s.id)
              .not("group_name", "is", null),
            supabase.from("matches").select("id", { count: "exact", head: true }).eq("sport_id", s.id),
            supabase.from("standings").select("id", { count: "exact", head: true }).eq("sport_id", s.id),
          ]);

          const teamCount = teamsCountRes?.count ?? 0;
          const matchesCount = matchesRes?.count ?? 0;
          const standingsCount = standingsRes?.count ?? 0;
          const groupsMeta = summarizeGroups(groupsRes?.data || []);

          // Slots (live / call / next) a partir da view v_queue_slots
          const { data: slots } = await supabase
            .from("v_queue_slots")
            .select("slot, order_idx, match_id, stage, group_name")
            .eq("sport_id", s.id);

          // Detalhes (nomes) das partidas presentes nos slots
          let queueDetails = {};
          const matchIds = (slots || []).map((x) => x.match_id).filter(Boolean);
          if (matchIds.length) {
            const { data: details } = await supabase
              .from("match_detail_view")
              .select("id, home_team_name, away_team_name")
              .in("id", matchIds);
            queueDetails = Object.fromEntries((details || []).map((d) => [d.id, d]));
          }

          return [
            s.key,
            {
              sportId: s.id,
              sportName: s.name,
              teamCount,
              groupsMeta,
              matchesCount,
              standingsCount,
              hasAny: (matchesCount || standingsCount || (groupsMeta.total || 0)) > 0,
              queueSlots: slots || [],
              queueDetails,
            },
          ];
        })
      );

      setInfo(Object.fromEntries(entries));
    } catch (e) {
      setFlash(`Falha ao carregar: ${e.message || e}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // realtime: ao mudar qualquer partida, recarrega os 3 cartões
    const ch = supabase
      .channel("tournaments-queue")
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, load)
      .subscribe();
    return () => supabase.removeChannel(ch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --------- Helpers de validação por modalidade ---------
  const canGenerateGroups = (key) => {
    const meta = info[key];
    if (!meta) return false;
    if (key === "fifa") return meta.teamCount === RULES.fifa.required;

    // Vôlei/Futsal: 3 grupos de 3; Pebolim: 8 grupos de 3
    const expect = key === "pebolim" ? 8 : 3;
    const groups = Object.values(meta.groupsMeta.byGroup || {});
    const allHave3 = groups.length === expect && groups.every((g) => g.members.length === 3);
    const seedsOk = groups.every((g) => sameSet(g.members.map((m) => m.seed_in_group), [1, 2, 3]));
    return allHave3 && seedsOk;
  };

  // --------- Ações ---------
  const setBusyKey = (key, v) => setBusy((b) => ({ ...b, [key]: v }));
  const openGenerateConfirm = (key) => setConfirmGenerate({ key, name: RULES[key].name });

  const doGenerate = async (key) => {
    const meta = info[key];
    if (!meta) return;
    const sportId = meta.sportId;
    setBusyKey(key, true);
    setFlash(null);
    setConfirmGenerate(null);
    try {
      if (key === "fifa") {
        // mantém ordem existente; se quiser recriar do zero, passe { p_recreate: true }
        const { error } = await supabase.rpc("fifa_generate_or_repair_bracket_fixed", { p_recreate: false });
        if (error) throw error;
      } else {
        // Limpa tudo existente
        const { data: matches } = await supabase.from("matches").select("id").eq("sport_id", sportId);
        const ids = (matches || []).map((m) => m.id);
        if (ids.length) await supabase.from("match_events").delete().in("match_id", ids);
        await supabase.from("matches").delete().eq("sport_id", sportId);
        await supabase.from("standings").delete().eq("sport_id", sportId);

        // Gera novas partidas na ORDEM fixa
        const variant = RULES[key]?.variant || "1v3_1v2_3v2";
        const { error } = await supabase.rpc("admin_generate_group_fixtures_3x3", {
          p_sport_id: sportId,
          p_variant: variant,
        });
        if (error) throw error;
      }

      setFlash(`Campeonato de ${RULES[key].name} gerado com sucesso (ordem fixa).`);
      await load();
    } catch (e) {
      setFlash(`Falha ao gerar partidas: ${e.message || e}`);
    } finally {
      setBusyKey(key, false);
    }
  };

  const openConfirm = (key) => setConfirm({ key, name: RULES[key].name });

  const resetTournament = async (key) => {
    const meta = info[key];
    if (!meta) return;
    setBusyKey(key, true);
    try {
      const { data: matches } = await supabase.from("matches").select("id").eq("sport_id", meta.sportId);
      const ids = (matches || []).map((m) => m.id);
      if (ids.length) await supabase.from("match_events").delete().in("match_id", ids);
      await supabase.from("matches").delete().eq("sport_id", meta.sportId);
      await supabase.from("standings").delete().eq("sport_id", meta.sportId);
      await supabase.from("teams").update({ group_name: null, seed_in_group: null }).eq("sport_id", meta.sportId);
      setFlash(`Campeonato de ${RULES[key].name} foi reiniciado.`);
      setConfirm(null);
      await load();
    } catch (e) {
      setFlash(`Falha ao reiniciar: ${e.message || e}`);
    } finally {
      setBusyKey(key, false);
    }
  };

  // Ações de arena (opcionais; úteis para operar a fila)
  const startFirstIfIdle = async (sportId) => {
    await supabase.rpc("admin_start_first_if_idle", { p_sport_id: sportId });
  };
  const finishLiveAndStartNext = async (sportId) => {
    await supabase.rpc("admin_finish_live_and_start_next", { p_sport_id: sportId });
  };

  // --------- Render ---------
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <Trophy className="h-6 w-6 text-blue-600" />
          <h2 className="text-2xl font-bold tracking-tight">Gerenciar Campeonatos</h2>
        </div>
        <p className="mt-1 text-sm text-gray-600">
          Configure grupos, gere as partidas na ordem definida e opere os cartões: <strong>Ao vivo</strong>, <strong>⚠️ Compareçam</strong> e <strong>Próximo jogo</strong>.
        </p>
      </div>

      {flash && (
        <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
          {flash}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="p-4">
              <div className="h-6 w-32 animate-pulse rounded bg-gray-100" />
              <div className="mt-3 h-4 w-56 animate-pulse rounded bg-gray-100" />
              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="h-9 animate-pulse rounded bg-gray-100" />
                <div className="h-9 animate-pulse rounded bg-gray-100" />
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {sports.map((s) => {
            const key = s.key;
            const rule = RULES[key];
            if (!rule) return null;
            const meta = info[key] || {};

            const teamOk = meta.teamCount === rule.required;
            const exists = !!meta.hasAny;
            const canGen = canGenerateGroups(key);

            return (
              <Card key={key}>
                <CardHeader
                  title={rule.name}
                  subtitle={`Times: ${meta.teamCount ?? 0} / ${rule.required}`}
                  right={exists ? <Badge tone="amber">Existe</Badge> : <Badge tone={teamOk ? "green" : "gray"}>{teamOk ? "Pronto" : "Aguardando times"}</Badge>}
                />

                {/* Linha de status */}
                <div className="px-4 sm:px-5">
                  <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
                    <span className="inline-flex items-center gap-1"><ListChecks className="h-4 w-4"/> Partidas: <strong className="ml-1">{meta.matchesCount ?? 0}</strong></span>
                    <span className="inline-flex items-center gap-1"><Settings className="h-4 w-4"/> Grupos definidos: <strong className="ml-1">{meta.groupsMeta.countGroups || 0}</strong></span>
                    {key !== "fifa" && (
                      <span className="inline-flex items-center gap-1"><ShieldAlert className="h-4 w-4"/> Seeds válidos: <strong className="ml-1">{meta.groupsMeta.seedsOk ? "Sim" : "Não"}</strong></span>
                    )}
                  </div>
                </div>

                {/* Ações */}
                <div className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-2 sm:p-5">
                  <PrimaryButton disabled={!teamOk || exists} onClick={() => navigate(rule.path)}>
                    <Settings className="h-4 w-4" /> Configurar & Agrupar
                  </PrimaryButton>

                  <GhostButton
                    className="text-red-600 border-red-600 hover:bg-red-50"
                    disabled={busy[key] || (key === "fifa" ? !teamOk : !canGen)}
                    onClick={() => openGenerateConfirm(key)}
                  >
                    {busy[key] ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
                    Gerar Partidas (ordem fixa)
                  </GhostButton>

                  {exists && (
                    <GhostButton onClick={() => startFirstIfIdle(meta.sportId)}>
                      <PlayCircle className="h-4 w-4" /> Iniciar primeiro (se parado)
                    </GhostButton>
                  )}
                  {exists && (
                    <GhostButton onClick={() => finishLiveAndStartNext(meta.sportId)}>
                      <FastForward className="h-4 w-4" /> Finalizar ao vivo e iniciar próximo
                    </GhostButton>
                  )}

                  <GhostButton className="sm:col-span-2" onClick={() => openConfirm(key)} disabled={!exists}>
                    <Trash2 className="h-4 w-4" /> Apagar & Reiniciar
                  </GhostButton>
                </div>

                {/* 3 cartões */}
                <div className="px-4 pb-4 sm:px-5 sm:pb-5">
                  <div className="rounded-xl border border-gray-200">
                    <div className="grid grid-cols-1 divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                      {renderSlot(meta, "live")}
                      {renderSlot(meta, "call")}
                      {renderSlot(meta, "next")}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal de reinício */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirm(null)} />
          <div className="relative z-10 w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold">Reiniciar {confirm.name}?</h3>
            <p className="mt-2 text-sm text-gray-600">Isso apagará <strong>todas</strong> as partidas, eventos e a classificação, e limpará os grupos.</p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <GhostButton onClick={() => setConfirm(null)}>Cancelar</GhostButton>
              <PrimaryButton onClick={() => resetTournament(confirm.key)}>Confirmar</PrimaryButton>
            </div>
          </div>
        </div>
      )}

      {/* Modal de gerar partidas */}
      {confirmGenerate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmGenerate(null)} />
          <div className="relative z-10 w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold">Gerar Partidas para {confirmGenerate.name}?</h3>
            <p className="mt-2 text-sm text-gray-600">Isso apagará <strong>todas</strong> as partidas, eventos e a classificação, e limpará os grupos antes de gerar novas partidas.</p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <GhostButton onClick={() => setConfirmGenerate(null)}>Cancelar</GhostButton>
              <PrimaryButton onClick={() => doGenerate(confirmGenerate.key)}>Confirmar</PrimaryButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ========================= Funções utilitárias =========================
function summarizeGroups(rows) {
  // rows: [{id, name, group_name, seed_in_group}]
  const byGroup = {};
  for (const r of rows) {
    if (!byGroup[r.group_name]) byGroup[r.group_name] = { members: [] };
    byGroup[r.group_name].members.push({
      id: r.id,
      name: r.name,
      seed_in_group: r.seed_in_group,
    });
  }
  const groups = Object.keys(byGroup).sort(groupSortKey);
  const countGroups = groups.length;
  let seedsOk = true;
  for (const g of groups) {
    const set = new Set(byGroup[g].members.map((m) => m.seed_in_group));
    const ok = set.has(1) && set.has(2) && set.has(3) && set.size === 3;
    if (!ok) seedsOk = false;
  }
  return { byGroup, groups, countGroups, total: rows.length, seedsOk };
}

function groupSortKey(a, b) {
  // Ordena por última letra (A,B,C...) quando group_name é GA/GB/GC…
  const la = (a && a[a.length - 1]) || "z";
  const lb = (b && b[b.length - 1]) || "z";
  if (la < lb) return -1;
  if (la > lb) return 1;
  return 0;
}

function sameSet(a = [], b = []) {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size !== sb.size) return false;
  for (const v of sa) if (!sb.has(v)) return false;
  return true;
}

function renderSlot(meta, slot) {
  const label = slot === "live" ? "Ao vivo" : slot === "call" ? "⚠️ Compareçam" : "Próximo jogo";
  const cls =
    slot === "live"
      ? "bg-red-50 border-red-200"
      : slot === "call"
      ? "bg-amber-50 border-amber-200"
      : "bg-emerald-50 border-emerald-200";

  const data = (meta.queueSlots || []).find((s) => s.slot === slot);
  const det = data?.match_id ? meta.queueDetails?.[data.match_id] : null;

  return (
    <div className="p-3 sm:p-4">
      <div className={`rounded-xl border p-3 sm:p-4 ${cls}`}>
        <div className="flex items-center justify-between text-xs text-gray-600">
          <span className="font-medium">{label}</span>
          <span className="inline-flex items-center gap-1"><ChevronRight className="h-3.5 w-3.5" />#{data?.order_idx ?? "–"}</span>
        </div>
        <div className="mt-2 text-sm">
          {det ? (
            <div className="font-medium text-gray-900">
              {det.home_team_name} <span className="text-gray-500">x</span> {det.away_team_name}
            </div>
          ) : (
            <div className="text-gray-500">Aguardando…</div>
          )}
          <div className="mt-1 text-xs text-gray-500">
            {data?.stage ? <span className="mr-2">{data.stage}</span> : null}
            {data?.group_name ? <span>Grupo {data.group_name}</span> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
