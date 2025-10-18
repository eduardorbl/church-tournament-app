// src/pages/admin/Matches.jsx
import React, { useEffect, useState, useRef, useMemo } from "react";
import { supabase } from "../../supabaseClient";
import TeamBadge from "../../components/TeamBadge";

/* ================================ Constantes ================================ */

const STATUS_LABELS = {
  scheduled: "Agendado",
  ongoing: "Em andamento",
  paused: "Pausado",
  finished: "Encerrado",
};

const STATUS_ORDER = {
  ongoing: 1,
  paused: 2,
  scheduled: 3,
  finished: 4,
};

const LOGO_BUCKET = "team-logos";

/* ================================ Helpers ================================ */

const isHttpUrl = (str) => typeof str === "string" && /^https?:\/\//i.test(str);
const isStoragePath = (str) => typeof str === "string" && !isHttpUrl(str) && str.trim() !== "";
const publicLogoUrl = (raw) => {
  if (!raw) return null;
  if (isHttpUrl(raw)) return raw;
  if (isStoragePath(raw)) {
    const { data } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(raw);
    return data?.publicUrl || null;
  }
  return null;
};

// Normaliza string para comparação (remove acentos, lower)
const norm = (s = "") =>
  s
    .toString()
    .trim()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

// Tempo decorrido (min:seg)
function formatGameTime(match, currentTimestamp) {
  if (!match || match.status === "scheduled" || match.status === "finished") return "0:00";
  const startTime = match.starts_at ? new Date(match.starts_at) : new Date();
  const currentTime = match.status === "paused" ? new Date(match.updated_at) : new Date(currentTimestamp || Date.now());
  const diffMs = currentTime - startTime;
  if (!Number.isFinite(diffMs) || diffMs < 0) return "0:00";
  const totalSeconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
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
        style={{ animation: isOngoing ? "slideProgress 3s ease-in-out infinite" : "none", width: "100%" }}
      />
    </div>
  );
}

// Ordem dentro da fila
const orderValue = (m) => {
  const value = Number(m?.order_idx);
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
};

const STAGE_PRIORITY = {
  grupos: 1,
  r32: 2,
  oitavas: 3,
  quartas: 4,
  semi: 5,
  "3lugar": 6,
  final: 7,
};

const stagePriority = (stage) => {
  if (stage === undefined || stage === null) return 99;
  const key = String(stage).toLowerCase();
  return STAGE_PRIORITY[key] ?? 99;
};

// Prioridade de status para ordenação
const statusTier = (s) =>
  s === "ongoing" ? 0 :
  s === "paused"  ? 1 :
  s === "scheduled" ? 2 : 3;

/* ================================ Página ================================ */

export default function Matches() {
  const [matches, setMatches] = useState([]);
  const [sports, setSports] = useState([]); // [{ key: "futsal", name: "Futsal" }, ...]
  const [selectedSport, setSelectedSport] = useState(null); // guarda a CHAVE (nome normalizado)
  const [selectedStatus, setSelectedStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState({});
  const [isAdmin, setIsAdmin] = useState(null);
  const [lastError, setLastError] = useState(null);
  const [currentTimestamp, setCurrentTimestamp] = useState(Date.now());
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [manualSetEdit, setManualSetEdit] = useState(false);
  const [confirmingFinalizeId, setConfirmingFinalizeId] = useState(null);
  const [queueSlots, setQueueSlots] = useState({}); // sport_id -> [{slot,lane_idx,order_idx,match_id},...]

  const channelRef = useRef(null);
  const mountedRef = useRef(true);
  const timerRef = useRef(null);

  // Mensagens de erro com timeout
  useEffect(() => {
    if (!lastError) return;
    const t = setTimeout(() => setLastError(null), 8000);
    return () => clearTimeout(t);
  }, [lastError]);

  // Online/offline
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const setMatchBusy = (id, v) => setBusy((prev) => ({ ...prev, [id]: v }));

  const ensureSession = async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.error("getSession error:", error);
      setLastError(error.message || "Falha ao obter sessão de usuário.");
      return null;
    }
    return data?.session || null;
  };

  const checkIsAdmin = async () => {
    try {
      await supabase.auth.getUser();
      const { data, error } = await supabase.rpc("is_admin");
      if (error) throw error;
      setIsAdmin(Boolean(data));
    } catch (e) {
      console.error("is_admin() error:", e);
      setIsAdmin(false);
    }
  };

  // ⚠️ Carrega a lista de esportes para o filtro (usa NOME, não ID)
  const loadSports = async () => {
    const { data, error } = await supabase.from("sports").select("name").order("name");
    if (error) {
      console.error("loadSports error:", error);
      return;
    }
    const unique = Array.from(new Set((data || []).map((r) => r.name).filter(Boolean)));
    const filtered = unique.filter((name) => norm(name) !== "pebolim");
    setSports(filtered.map((name) => ({ key: norm(name), name })));
  };

  // Carrega partidas (sem filtrar por esporte no servidor para evitar mismatch de tipos)
  const loadMatches = async ({ showSkeleton = false } = {}) => {
    if (!mountedRef.current) return;
    if (showSkeleton) setLoading(true);
    try {
      let query = supabase
        .from("matches")
        .select(
          `
          id, stage, group_name, order_idx, starts_at, venue, created_at, updated_at,
          status, home_score, away_score, meta,
          sport_id,
          home_team_id, away_team_id,
          sport:sport_id ( name ),
          home:home_team_id ( id, name, logo_url, color ),
          away:away_team_id ( id, name, logo_url, color )
        `
        );

      // Filtra status no servidor (é string, compatível)
      if (selectedStatus) query = query.eq("status", selectedStatus);

      // Mostrar grupos, todos jogos de pré-oitavas (r32) e mata-mata explicitamente
      query = query.or(
        [
          "group_name.not.is.null",                                // grupos
          "stage.in.(r32,oitavas,quartas,semi,3lugar,final)",      // mata-matas SEM exigir times
          "and(home_team_id.not.is.null,away_team_id.not.is.null)" // fallback
        ].join(",")
      );

      const { data, error } = await query.order("order_idx", { ascending: true }).order("id", { ascending: true });
      if (error) {
        console.error("loadMatches error:", error);
        if (mountedRef.current) setLastError(error.message || "Falha ao carregar partidas.");
      } else {
        // Normaliza logos
        let normalized = (data || []).map((m) => {
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

          // Guarda também chave normalizada do esporte (para filtro no cliente)
          const sportName = m?.sport?.name || "";
          return { ...m, home, away, _sportKey: norm(sportName) };
        });

        normalized = normalized.filter((m) => m._sportKey !== "pebolim");

        // Filtro por modalidade (cliente) usando nome normalizado
        if (selectedSport) {
          normalized = normalized.filter((m) => m._sportKey === selectedSport);
        }

        // ===== NOVA ORDENAÇÃO COM FILA =====
        let groupedSlots = {};
        if (normalized.length) {
          const sportIds = Array.from(
            new Set(normalized.map((m) => (m.sport_id ? String(m.sport_id) : null)).filter(Boolean))
          );
          if (sportIds.length) {
            const { data: slotsData } = await supabase
              .from("v_queue_slots_v3")
              .select("sport_id, slot, lane_idx, lane_pos, lane_code, order_idx, match_id, stage, group_name")
              .in("sport_id", sportIds);

            groupedSlots = (slotsData || []).reduce((acc, row) => {
              const key = String(row.sport_id);
              if (!acc[key]) acc[key] = [];
              acc[key].push(row);
              return acc;
            }, {});
          }
        }

        // Enriquecer dados com info de fila e timestamps úteis
        const enriched = normalized.map((m) => {
          const rows = groupedSlots[String(m.sport_id)] || [];
          const q = rows.find((r) => r?.match_id === m.id) || null;

          const startsAtMs = m.starts_at ? new Date(m.starts_at).getTime() : Number.POSITIVE_INFINITY;
          const queueOrder = Number.isFinite(Number(q?.order_idx)) ? Number(q.order_idx) : Number.POSITIVE_INFINITY;
          const lanePos = Number.isFinite(Number(q?.lane_pos)) ? Number(q.lane_pos) : Number.POSITIVE_INFINITY;

          return {
            ...m,
            _q: q,
            _isCall: q?.slot === "call" && m.status === "scheduled",
            _startsAtMs: startsAtMs,
            _queueOrder: queueOrder,
            _lanePos: lanePos,
          };
        });

        // Regra de ordenação:
        // 1) ongoing, 2) paused, 3) scheduled(call), 4) scheduled, 5) finished
        // Nos scheduled(call) → por lane_pos, depois queueOrder, depois starts_at, depois order_idx
        // Nos scheduled comuns → por starts_at, depois order_idx
        enriched.sort((a, b) => {
          const at = statusTier(a.status), bt = statusTier(b.status);
          if (at !== bt) return at - bt;

          // Ao vivo/pausados: por starts_at, depois updated_at
          if (at === 0 || at === 1) {
            const as = a.starts_at ? new Date(a.starts_at).getTime() : 0;
            const bs = b.starts_at ? new Date(b.starts_at).getTime() : 0;
            if (as !== bs) return as - bs;
            const au = a.updated_at ? new Date(a.updated_at).getTime() : 0;
            const bu = b.updated_at ? new Date(b.updated_at).getTime() : 0;
            if (au !== bu) return bu - au;
            return String(a.id).localeCompare(String(b.id));
          }

          // Agendados
          if (at === 2) {
            const ac = a._isCall ? 0 : 1;
            const bc = b._isCall ? 0 : 1;
            if (ac !== bc) return ac - bc;

            // Se ambos são "call" → lane_pos, queueOrder, starts_at, order_idx
            if (ac === 0) {
              if (a._lanePos !== b._lanePos) return a._lanePos - b._lanePos;
              if (a._queueOrder !== b._queueOrder) return a._queueOrder - b._queueOrder;
              if (a._startsAtMs !== b._startsAtMs) return a._startsAtMs - b._startsAtMs;
              return orderValue(a) - orderValue(b);
            }

            // Demais agendados → starts_at, order_idx
            if (a._startsAtMs !== b._startsAtMs) return a._startsAtMs - b._startsAtMs;
            return orderValue(a) - orderValue(b);
          }

          // Finalizados: mais recentes primeiro
          if (at === 3) {
            const au = a.updated_at ? new Date(a.updated_at).getTime() : 0;
            const bu = b.updated_at ? new Date(b.updated_at).getTime() : 0;
            if (au !== bu) return bu - au;
            return orderValue(b) - orderValue(a);
          }

          return 0;
        });

        if (mountedRef.current) {
          setMatches(enriched);
          setQueueSlots(groupedSlots);
        }
      }
    } finally {
      if (mountedRef.current && showSkeleton) setLoading(false);
    }
  };

  // Init
  useEffect(() => {
    mountedRef.current = true;
    const initialize = async () => {
      await ensureSession();
      await checkIsAdmin();
      await loadSports();
      await loadMatches({ showSkeleton: true });
    };
    initialize();

    // Relógio do jogo
    timerRef.current = setInterval(() => {
      if (mountedRef.current) setCurrentTimestamp(Date.now());
    }, 1000);

    // Auth listener
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mountedRef.current) return;
      setIsAdmin(null);
      await checkIsAdmin();
      if (session) {
        await loadSports();
        await loadMatches({ showSkeleton: true });
      } else {
        setMatches([]);
      }
    });

    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      sub?.subscription?.unsubscribe?.();
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, []);

  // Recarrega ao mudar filtros e assina realtime
  useEffect(() => {
    if (!mountedRef.current) return;
    loadMatches({ showSkeleton: false });

    // Realtime
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    const channel = supabase
      .channel("admin-matches")
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, () => {
        // pequeno debounce para lotes
        setTimeout(() => {
          if (mountedRef.current) loadMatches({ showSkeleton: false });
        }, 200);
      })
      .subscribe();
    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [selectedSport, selectedStatus]);

  /* ================================ Mutations ================================ */

  const mutate = async (id, patch) => {
    setMatchBusy(id, true);
    setLastError(null);

    // UI otimista
    const prev = matches;
    setMatches((cur) => cur.map((m) => (m.id === id ? { ...m, ...patch } : m)));

    try {
      const { error } = await supabase.from("matches").update(patch).eq("id", id);
      if (error) throw new Error(`Falha ao atualizar: ${error.message}`);

      // Caso o realtime não venha
      setTimeout(() => {
        if (mountedRef.current) loadMatches({ showSkeleton: false });
      }, 600);

      return true;
    } catch (e) {
      setMatches(prev);
      setLastError(e.message || "Erro ao atualizar partida.");
      return false;
    } finally {
      setMatchBusy(id, false);
    }
  };

  const changePoints = async (m, team, action) => {
    if (m.status === "scheduled") return;
    const sportNameNorm = norm(m?.sport?.name || "");
    const isVolei = sportNameNorm.includes("volei");
    const meta = m.meta || {};
    const key = isVolei ? `${team}_points_set` : `${team}_score`;
    let next = Math.max(0, Number((isVolei ? meta[key] : m[key]) || 0));
    if (action === "inc") next += 1;
    if (action === "dec") next = Math.max(0, next - 1);
    if (action === "reset") next = 0;
    if (isVolei) {
      await mutate(m.id, { meta: { ...meta, [key]: next } });
    } else {
      await mutate(m.id, { [key]: next });
    }
  };

  const getSetPoints = (m, side) => Math.max(0, Number(m?.meta?.[`${side}_points_set`] || 0));

  const getSets = (m, side) => {
    const meta = m.meta || {};
    const key = side === "home" ? "home_sets" : "away_sets";
    return Math.max(0, Number(meta[key] || 0));
  };

  const canFinalizeSet = (m) => {
    const MIN = Number(m?.meta?.rules?.points_to_win_set ?? 15);
    const ADV = Number(m?.meta?.rules?.win_by ?? 2);
    const hs = getSetPoints(m, "home");
    const as = getSetPoints(m, "away");
    const top = Math.max(hs, as);
    const lead = Math.abs(hs - as);
    return top >= MIN && lead >= ADV;
  };

  const finalizeSet = async (m, { force = false } = {}) => {
    if (m.status === "scheduled") return;
    const meta = m.meta || {};
    const hs = getSetPoints(m, "home");
    const as = getSetPoints(m, "away");
    const setsArr = Array.isArray(meta.sets) ? meta.sets : [];
    if (!force && !canFinalizeSet(m)) {
      setLastError("Para finalizar o set: mínimo 15 pontos e 2 de vantagem (ajustável em meta.rules). Clique novamente para forçar.");
      return;
    }
    const homeWon = hs > as ? true : (as > hs ? false : null); // null = empate
    const nextMeta = {
      ...meta,
      sets: [...setsArr, { h: hs, a: as, at: new Date().toISOString() }],
      home_sets: getSets(m, "home") + (homeWon === true ? 1 : 0),
      away_sets: getSets(m, "away") + (homeWon === false ? 1 : 0),
      home_points_set: 0,
      away_points_set: 0,
    };
    await mutate(m.id, {
      meta: nextMeta,
      home_score: Math.max(0, Number(m.home_score || 0)) + hs,
      away_score: Math.max(0, Number(m.away_score || 0)) + as,
      updated_at: new Date().toISOString(),
    });
  };

  const changeSets = async (m, team, action) => {
    if (m.status === "scheduled") return;
    const meta = m.meta || {};
    const key = team === "home" ? "home_sets" : "away_sets";
    let value = Math.max(0, Number(meta[key] || 0));
    if (action === "inc") value += 1;
    if (action === "dec") value = Math.max(0, value - 1);
    if (action === "reset") value = 0;
    await mutate(m.id, { meta: { ...meta, [key]: value } });
  };

  const applyStatusChange = async (m, newStatus) => {
    const now = new Date().toISOString();
    const patch = { status: newStatus, updated_at: now };
    if (newStatus === "ongoing" && m.status === "scheduled" && !m.starts_at) patch.starts_at = now;
    return await mutate(m.id, patch);
  };

  const finishMatch = async (m) => {
    const hs = getSetPoints(m, "home");
    const as = getSetPoints(m, "away");
    if (hs > 0 || as > 0) {
      const meta = m.meta || {};
      await mutate(m.id, {
        meta: { ...meta, home_points_set: 0, away_points_set: 0 },
        home_score: Math.max(0, Number(m.home_score || 0)) + hs,
        away_score: Math.max(0, Number(m.away_score || 0)) + as,
      });
    }
    return await applyStatusChange(m, "finished");
  };

  const fifaActiveStage = useMemo(() => {
    let best = null;
    for (const match of matches) {
      if (norm(match?.sport?.name || "") !== "fifa") continue;
      if (match.status !== "scheduled") continue;
      if (!best) {
        best = match;
        continue;
      }
      const stageDiff = stagePriority(match.stage) - stagePriority(best.stage);
      if (stageDiff < 0) {
        best = match;
        continue;
      }
      if (stageDiff === 0 && orderValue(match) < orderValue(best)) {
        best = match;
      }
    }
    return best?.stage ?? null;
  }, [matches]);

  // ---------- guarda de fila no clique ----------
  const tryStartMatch = async (m) => {
    setLastError(null);
    const sportName = m?.sport?.name;
    if (!sportName) {
      setLastError("Partida sem modalidade definida.");
      return;
    }
    if (!m?.id) {
      setLastError("Partida inválida.");
      return;
    }

    setMatchBusy(m.id, true);
    try {
      // Usa admin_start_fill_until_capacity com p_limit=1 para iniciar apenas 1 partida por vez
      // respeitando a capacidade do esporte (FIFA=2, outros=1)
      const { error } = await supabase.rpc("admin_start_fill_until_capacity", {
        p_sport_name: sportName,
        p_limit: 1,
      });
      if (error) throw error;
      await loadMatches({ showSkeleton: false });
    } catch (e) {
      console.error("tryStartMatch error:", e);
      setLastError(e.message || "Não foi possível iniciar a partida.");
    } finally {
      setMatchBusy(m.id, false);
    }
  };

  const startMatch = async (m) => await tryStartMatch(m);
  const pauseMatch = async (m) => await applyStatusChange(m, "paused");
  const resumeMatch = async (m) => await applyStatusChange(m, "ongoing");

  /* ================================ Render ================================ */

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Gerenciar Partidas</h2>

      {!isOnline && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded mb-4">
          ⚠️ Você está offline. As alterações serão sincronizadas quando a conexão for restaurada.
        </div>
      )}

      {isAdmin === false && (
        <div className="text-sm p-3 rounded bg-red-50 border border-red-200 text-red-700">
          Você não está autenticado como <strong>admin</strong>. As ações podem ser bloqueadas.
        </div>
      )}

      {lastError && (
        <div className="text-sm p-3 rounded bg-yellow-50 border border-yellow-200 text-yellow-800 flex items-start gap-3">
          <div className="flex-1 whitespace-pre-wrap">{String(lastError)}</div>
          <button
            onClick={() => setLastError(null)}
            className="text-xs px-2 py-1 rounded border border-yellow-300 hover:bg-yellow-100"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-col gap-3 sm:flex-row sm:gap-6">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Modalidade:</span>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedSport(null)}
              className={`px-2 py-1 rounded text-xs ${
                !selectedSport ? "bg-blue-600 text-white" : "bg-gray-100 hover:bg-gray-200"
              }`}
            >
              Todas
            </button>
            {sports.map((s) => (
              <button
                key={s.key}
                onClick={() => setSelectedSport(s.key)}
                className={`px-2 py-1 rounded text-xs ${
                  selectedSport === s.key ? "bg-blue-600 text-white" : "bg-gray-100 hover:bg-gray-200"
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Status:</span>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedStatus(null)}
              className={`px-2 py-1 rounded text-xs ${
                !selectedStatus ? "bg-blue-600 text-white" : "bg-gray-100 hover:bg-gray-200"
              }`}
            >
              Todos
            </button>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setSelectedStatus(value)}
                className={`px-2 py-1 rounded text-xs ${
                  selectedStatus === value ? "bg-blue-600 text-white" : "bg-gray-100 hover:bg-gray-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Lista de partidas */}
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      ) : matches.length === 0 ? (
        <p className="text-sm text-gray-500">Nenhuma partida encontrada.</p>
      ) : (
        <ul className="space-y-4">
          {matches.map((m) => {
            const sportNameNorm = norm(m?.sport?.name || "");
            const isVolei = sportNameNorm.includes("volei");
            const homeSets = isVolei ? getSets(m, "home") : 0;
            const awaySets = isVolei ? getSets(m, "away") : 0;
            const homeSetPts = isVolei ? getSetPoints(m, "home") : null;
            const awaySetPts = isVolei ? getSetPoints(m, "away") : null;

            const isKnockout = !m.group_name;
            const hasBothTeams = Boolean(m.home?.id && m.away?.id);
            const canStartByTeams = isKnockout ? hasBothTeams : hasBothTeams; // sempre precisar de times definidos

            const isLive = m.status === "ongoing" || m.status === "paused";
            const cardBorder = isLive ? (m.status === "ongoing" ? "border-blue-200" : "border-orange-200") : "border-gray-200";

            const sportQueue = queueSlots[String(m.sport_id)] || [];
            const queueRow = sportQueue.find((row) => row?.match_id === m.id);
            const laneCode = queueRow?.lane_code ? String(queueRow.lane_code) : null;
            const lanePos =
              queueRow?.lane_pos !== undefined && queueRow?.lane_pos !== null
                ? Number(queueRow.lane_pos)
                : null;
            const queueOrderIdx = Number.isFinite(Number(queueRow?.order_idx)) ? Number(queueRow.order_idx) : null;
            const isFifa = sportNameNorm === "fifa";
            const stageEligible = !isFifa || !fifaActiveStage || m.stage === fifaActiveStage;
            const isCallSlot = queueRow?.slot === "call" && m.status === "scheduled" && stageEligible;

          return (
            <li
              key={m.id}
              className={`border rounded-lg p-3 sm:p-4 flex flex-col gap-3 bg-white shadow-sm relative overflow-hidden ${cardBorder}`}
              >
                <LiveProgressBar status={m.status} />

                {/* Cabeçalho */}
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-xs text-gray-500 flex flex-wrap items-center gap-1 sm:gap-2">
                    <span className="font-medium">{m.sport?.name}</span>
                    {m.group_name && <span>· Grupo {m.group_name}</span>}
                    {m.stage && (
                      <span>
                        · {
                          m.stage === "semi"
                            ? "Semifinal"
                            : m.stage === "3lugar"
                            ? "3º lugar"
                            : m.stage === "r32"
                            ? "Pré-oitavas"
                            : m.stage
                        }
                      </span>
                    )}
                    {Number.isFinite(Number(m.order_idx)) && <span>· J{m.order_idx}</span>}
                    {isLive && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-600">
                        🕐 {formatGameTime(m, currentTimestamp)}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {m.status === "scheduled" && isCallSlot && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 uppercase tracking-wide">
                        Próximo na ordem
                        {queueOrderIdx ? ` • J${queueOrderIdx}` : ""}
                        {laneCode ? ` • Fila ${laneCode}` : ""}
                        {lanePos !== null && lanePos !== undefined ? ` • Pos ${lanePos}` : ""}
                      </span>
                    )}
                    <span
                      className={`text-xs px-2 py-0.5 rounded self-start sm:self-auto ${
                        m.status === "ongoing"
                          ? "bg-green-100 text-green-700"
                          : m.status === "paused"
                          ? "bg-yellow-100 text-yellow-700"
                          : m.status === "finished"
                          ? "bg-gray-200 text-gray-600"
                          : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {STATUS_LABELS[m.status] || m.status}
                    </span>
                  </div>
                </div>

                {/* Times com placar */}
                <div className="space-y-3 sm:space-y-0 sm:grid sm:grid-cols-2 sm:gap-4">
                  <TeamDisplay
                    align="left"
                    team={m.home}
                    score={m.home_score}
                    onInc={() => changePoints(m, "home", "inc")}
                    onDec={() => changePoints(m, "home", "dec")}
                    onReset={() => changePoints(m, "home", "reset")}
                    sets={isVolei ? homeSets : null}
                    setPoints={isVolei ? homeSetPts : null}
                    onSetInc={isVolei && manualSetEdit ? () => changeSets(m, "home", "inc") : undefined}
                    onSetDec={isVolei && manualSetEdit ? () => changeSets(m, "home", "dec") : undefined}
                    onSetReset={isVolei && manualSetEdit ? () => changeSets(m, "home", "reset") : undefined}
                    disabled={busy[m.id] || m.status === "scheduled"}
                  />
                  <TeamDisplay
                    align="right"
                    team={m.away}
                    score={m.away_score}
                    onInc={() => changePoints(m, "away", "inc")}
                    onDec={() => changePoints(m, "away", "dec")}
                    onReset={() => changePoints(m, "away", "reset")}
                    sets={isVolei ? awaySets : null}
                    setPoints={isVolei ? awaySetPts : null}
                    onSetInc={isVolei && manualSetEdit ? () => changeSets(m, "away", "inc") : undefined}
                    onSetDec={isVolei && manualSetEdit ? () => changeSets(m, "away", "dec") : undefined}
                    onSetReset={isVolei && manualSetEdit ? () => changeSets(m, "away", "reset") : undefined}
                    disabled={busy[m.id] || m.status === "scheduled"}
                  />
                </div>

                {/* Toggle edição manual de sets */}
                {isVolei && (
                  <button
                    onClick={() => setManualSetEdit((v) => !v)}
                    className="text-[10px] px-2 py-0.5 rounded border border-gray-300 hover:bg-gray-50 self-start"
                  >
                    {manualSetEdit ? "Fechar edição de sets" : "Editar sets manualmente"}
                  </button>
                )}

                {/* Botão Finalizar set com confirmação dupla */}
                {isVolei && (homeSetPts > 0 || awaySetPts > 0) && (
                  <button
                    onClick={async () => {
                      if (confirmingFinalizeId === m.id) {
                        const ok = canFinalizeSet(m);
                        setConfirmingFinalizeId(null);
                        await finalizeSet(m, { force: !ok });
                      } else {
                        setConfirmingFinalizeId(m.id);
                        setTimeout(() => setConfirmingFinalizeId((v) => (v === m.id ? null : v)), 3000);
                      }
                    }}
                    disabled={busy[m.id] || m.status === "scheduled"}
                    className={`px-3 py-1 text-xs rounded ${confirmingFinalizeId === m.id ? "bg-red-600" : "bg-purple-600"} text-white hover:opacity-90 disabled:opacity-50`}
                    title="Soma os pontos do set aos totais (PF/PA) e incrementa o set do vencedor."
                  >
                    {confirmingFinalizeId === m.id ? "Confirmar finalizar set" : "Finalizar set"}
                  </button>
                )}

                {/* Ações de status */}
                <div className="flex flex-wrap gap-2">
                  {m.status === "scheduled" && (
                    <button
                      onClick={() => startMatch(m)}
                      disabled={busy[m.id] || !canStartByTeams || !isCallSlot}
                      className="px-3 py-1 text-xs rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                      title={
                        !canStartByTeams
                          ? "Defina as duas equipes antes de iniciar."
                          : isCallSlot
                          ? "Iniciar próximo jogo da ordem."
                          : "Aguarde: apenas o próximo jogo da ordem pode iniciar."
                      }
                    >
                      Iniciar
                    </button>
                  )}
                  {m.status === "ongoing" && (
                    <>
                      <button
                        onClick={() => pauseMatch(m)}
                        disabled={busy[m.id]}
                        className="px-3 py-1 text-xs rounded bg-yellow-500 text-white hover:bg-yellow-600 disabled:opacity-50"
                      >
                        Pausar
                      </button>
                      <button
                        onClick={() => finishMatch(m)}
                        disabled={busy[m.id]}
                        className="px-3 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        Encerrar
                      </button>
                    </>
                  )}
                  {m.status === "paused" && (
                    <>
                      <button
                        onClick={() => resumeMatch(m)}
                        disabled={busy[m.id]}
                        className="px-3 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        Retomar
                      </button>
                      <button
                        onClick={() => finishMatch(m)}
                        disabled={busy[m.id]}
                        className="px-3 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        Encerrar
                      </button>
                    </>
                  )}
                  {m.status === "finished" && (
                    <span className="text-xs text-gray-500 self-center">Partida encerrada (resultado editável).</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <style jsx global>{`
        @keyframes slideProgress {
          0% {
            transform: translateX(-100%);
          }
          50% {
            transform: translateX(200%);
          }
          100% {
            transform: translateX(-100%);
          }
        }
      `}</style>
    </div>
  );
}

/* ================================ Subcomponentes ================================ */

function TeamDisplay({
  team,
  score,
  onInc,
  onDec,
  onReset,
  sets,
  setPoints,
  onSetInc,
  onSetDec,
  onSetReset,
  disabled,
  align = "left",
}) {
  const right = align === "right";
  const scoreLabel = typeof setPoints === "number" ? "Pontos do set" : "Pontos";
  const scoreValue = typeof setPoints === "number" ? Number(setPoints || 0) : Number(score || 0);
  const canEditSets = Boolean(onSetInc || onSetDec || onSetReset);
  const ScorePill = ({ label, value }) => {
    const display = Number.isFinite(value) ? value : "-";
    return (
      <div className="flex min-w-[70px] flex-col items-center justify-center rounded-lg border border-gray-200 bg-white px-2.5 py-1 shadow-inner">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</span>
        <span className="text-lg font-bold leading-none text-gray-900 tabular-nums">{display}</span>
      </div>
    );
  };

  const actionWrapper = right ? "justify-end" : "justify-start";
  const textAlign = right ? "text-right" : "text-left";

  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-3 shadow-sm space-y-4">
      <div className={`flex flex-wrap items-center justify-between gap-3 ${right ? "flex-row-reverse" : ""}`}>
        <div className={`flex min-w-0 items-center gap-2 ${right ? "flex-row-reverse text-right" : ""}`}>
          <TeamBadge team={team || { name: "A definir" }} size={28} />
          <span className="text-sm font-medium truncate">{team?.name || "A definir"}</span>
        </div>
        <div className={`flex items-center gap-2 ${right ? "flex-row-reverse" : ""}`}>
          {typeof sets === "number" ? <ScorePill label="Sets" value={Number(sets || 0)} /> : null}
          <ScorePill label={scoreLabel} value={scoreValue} />
        </div>
      </div>

      {typeof sets === "number" ? (
        <div className={`space-y-2 ${textAlign}`}>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Controle de sets</span>
          <div className={`flex flex-wrap gap-2 ${actionWrapper}`}>
            <button
              type="button"
              onClick={onSetDec}
              disabled={disabled || !canEditSets}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-base font-semibold text-gray-700 transition hover:bg-gray-100 disabled:opacity-40"
            >
              -
            </button>
            <button
              type="button"
              onClick={onSetInc}
              disabled={disabled || !canEditSets}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-base font-semibold text-gray-700 transition hover:bg-gray-100 disabled:opacity-40"
            >
              +
            </button>
            <button
              type="button"
              onClick={onSetReset}
              disabled={disabled || !canEditSets}
              className="flex items-center justify-center rounded-lg bg-red-500 px-3 py-1 text-xs font-semibold text-white transition hover:bg-red-600 disabled:opacity-40"
              title="Zerar sets"
            >
              Zerar
            </button>
          </div>
        </div>
      ) : null}

      <div className={`space-y-2 ${textAlign}`}>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{scoreLabel}</span>
        <div className={`flex flex-wrap gap-2 ${actionWrapper}`}>
          <button
            type="button"
            onClick={onDec}
            disabled={disabled}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-base font-semibold text-gray-700 transition hover:bg-gray-100 disabled:opacity-40"
          >
            -
          </button>
          <button
            type="button"
            onClick={onInc}
            disabled={disabled}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-base font-semibold text-gray-700 transition hover:bg-gray-100 disabled:opacity-40"
          >
            +
          </button>
          <button
            type="button"
            onClick={onReset}
            disabled={disabled}
            className="flex items-center justify-center rounded-lg bg-red-500 px-3 py-1 text-xs font-semibold text-white transition hover:bg-red-600 disabled:opacity-40"
            title={typeof setPoints === "number" ? "Zerar pontos do set" : "Zerar pontos"}
          >
            Zerar
          </button>
        </div>
      </div>
    </div>
  );
}
