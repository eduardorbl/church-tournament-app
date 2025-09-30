// src/pages/admin/Matches.jsx
import React, { useEffect, useState, useRef, useMemo } from "react";
import { supabase } from "../../supabaseClient";
import TeamBadge from "../../components/TeamBadge";

/**
 * STATUS LABELS
 */
const STATUS_LABELS = {
  scheduled: "Agendado",
  ongoing: "Em andamento",
  paused: "Pausado",
  finished: "Encerrado",
};

/**
 * ORDEM DE PRIORIDADE DOS STATUS (para ordenação visual)
 */
const STATUS_ORDER = {
  ongoing: 1,
  paused: 2,
  scheduled: 3,
  finished: 4,
};

// Storage
const LOGO_BUCKET = "team-logos";

// Funções auxiliares para logo
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
  if (!match || match.status === "scheduled" || match.status === "finished") {
    return "0:00";
  }

  const startTime = new Date(match.starts_at);
  const currentTime =
    match.status === "paused"
      ? new Date(match.updated_at)
      : new Date(currentTimestamp || Date.now());

  const diffMs = currentTime - startTime;
  if (diffMs < 0) return "0:00";

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
        style={{
          animation: isOngoing ? "slideProgress 3s ease-in-out infinite" : "none",
          width: "100%",
        }}
      />
    </div>
  );
}

// ---------- helpers de ordem / elegibilidade ----------
const orderValue = (m) =>
  Number.isFinite(Number(m?.order_idx))
    ? Number(m.order_idx)
    : Number.isFinite(Number(m?.round))
    ? Number(m.round)
    : Number(m?.id ?? Number.MAX_SAFE_INTEGER);

const isEligibleToStart = (m) => {
  if (m.status !== "scheduled") return false;
  // Grupos: pode iniciar mesmo sem times definidos (em geral já tem)
  if (m.group_name) return true;
  // Mata-mata: só quando os dois times estiverem definidos
  return Boolean(m.home?.id && m.away?.id);
};

export default function Matches() {
  const [matches, setMatches] = useState([]);
  const [sports, setSports] = useState([]);
  const [selectedSport, setSelectedSport] = useState(null);
  const [selectedStatus, setSelectedStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState({});
  const [isAdmin, setIsAdmin] = useState(null);
  const [lastError, setLastError] = useState(null);
  const [currentTimestamp, setCurrentTimestamp] = useState(Date.now());
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const channelRef = useRef(null);
  const mountedRef = useRef(true);
  const timerRef = useRef(null);

  // mantém mensagens de erro visíveis por 8s
  useEffect(() => {
    if (!lastError) return;
    const t = setTimeout(() => setLastError(null), 8000);
    return () => clearTimeout(t);
  }, [lastError]);

  // Detectar conectividade
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

  const setMatchBusy = (id, v) =>
    setBusy((prev) => ({
      ...prev,
      [id]: v,
    }));

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

  const loadSports = async () => {
    const { data, error } = await supabase.from("sports").select("id,name").order("name");
    if (error) {
      console.error("loadSports error:", error);
      return;
    }
    if (data) setSports(data);
  };

  const loadMatches = async () => {
    if (!mountedRef.current) return;

    setLoading(true);
    try {
      let query = supabase
        .from("matches")
        .select(
          `
          id, stage, round, group_name, order_idx, starts_at, venue, created_at, updated_at,
          status, home_score, away_score, meta,
          home_team_id, away_team_id,
          sport:sport_id ( id, name ),
          home:home_team_id ( id, name, logo_url, color ),
          away:away_team_id ( id, name, logo_url, color )
        `
        );

      if (selectedSport) query = query.eq("sport_id", selectedSport);
      if (selectedStatus) query = query.eq("status", selectedStatus);

      // esconde slots vazios de mata-mata
      query = query.or("group_name.not.is.null,and(home_team_id.not.is.null,away_team_id.not.is.null)");

      const { data, error } = await query;
      if (error) {
        console.error("loadMatches error:", error);
        if (mountedRef.current) setLastError(error.message || "Falha ao carregar partidas.");
      } else {
        // Normaliza os logos das partidas
        const normalized = (data || []).map((m) => {
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

        // Ordena por status (ao vivo > pausado > agendado > encerrado), depois por ordem da fila
        const sortedData = normalized.sort((a, b) => {
          const aOrder = STATUS_ORDER[a.status] || 999;
          const bOrder = STATUS_ORDER[b.status] || 999;
          if (aOrder !== bOrder) return aOrder - bOrder;

          // mesma categoria -> ordem de execução
          return orderValue(a) - orderValue(b);
        });

        if (mountedRef.current) {
          setMatches(sortedData);
        }
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  };

  // Inicialização principal - executa apenas uma vez
  useEffect(() => {
    mountedRef.current = true;

    const initialize = async () => {
      await ensureSession();
      await checkIsAdmin();
      await loadSports();
      await loadMatches();
    };

    initialize();

    // Timer para atualizar o timestamp a cada segundo
    timerRef.current = setInterval(() => {
      if (mountedRef.current) {
        setCurrentTimestamp(Date.now());
      }
    }, 1000);

    // Listener para mudanças de auth
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mountedRef.current) return;

      setIsAdmin(null);
      await checkIsAdmin();

      if (session) {
        await loadSports();
        await loadMatches();
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
  }, []); // Array vazio - executa apenas uma vez

  // Effect separado para recarregar quando filtros mudarem
  useEffect(() => {
    if (!mountedRef.current) return;

    loadMatches();

    // Setup realtime
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase
      .channel("admin-matches")
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, () => {
        setTimeout(() => {
          if (mountedRef.current) {
            loadMatches();
          }
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
  }, [selectedSport, selectedStatus]); // Só depende dos filtros

  // ---------- cálculo dos jogos liberados para iniciar ----------
  // Regra: por modalidade (sport_id), se houver jogo ongoing/paused, NENHUM pode iniciar.
  // Do contrário, somente o scheduled elegível com menor ordem pode iniciar.
  const allowedStartIds = useMemo(() => {
    const mapBySport = new Map();
    for (const m of matches) {
      const sid = m?.sport?.id ?? m.sport_id ?? "unknown";
      if (!mapBySport.has(sid)) mapBySport.set(sid, []);
      mapBySport.get(sid).push(m);
    }

    const allowed = new Set();

    for (const [sid, arr] of mapBySport.entries()) {
      const hasActive = arr.some((x) => x.status === "ongoing" || x.status === "paused");
      if (hasActive) continue; // bloqueia todo mundo enquanto houver partida ativa

      const eligible = arr.filter(isEligibleToStart);
      if (!eligible.length) continue;

      eligible.sort((a, b) => orderValue(a) - orderValue(b));
      allowed.add(eligible[0].id); // só o próximo
    }
    return allowed;
  }, [matches]);

  const mutate = async (id, patch) => {
    setMatchBusy(id, true);
    setLastError(null);

    // 🔵 1) UI OTIMISTA
    const prev = matches;
    setMatches((cur) => cur.map((m) => (m.id === id ? { ...m, ...patch } : m)));

    try {
      const { error } = await supabase
        .from("matches")
        .update(patch)
        .eq("id", id);

      if (error) throw new Error(`Falha ao atualizar: ${error.message}`);

      // 🟢 2) Fallback: se por algum motivo o realtime não vier, garantimos um refresh rápido
      setTimeout(() => {
        if (mountedRef.current) loadMatches();
      }, 600);

      return true;
    } catch (e) {
      // 🔴 Reverte UI otimista em caso de erro
      setMatches(prev);
      setLastError(e.message || "Erro ao atualizar partida.");
      return false;
    } finally {
      setMatchBusy(id, false);
    }
  };


  const changePoints = async (m, team, action) => {
    if (m.status === "scheduled") return;

    const key = `${team}_score`;
    let next = Math.max(0, Number(m[key] || 0));

    if (action === "inc") next += 1;
    if (action === "dec") next = Math.max(0, next - 1);
    if (action === "reset") next = 0;

    const patch = { [key]: next };
    await mutate(m.id, patch);
  };

  const getSets = (m, side) => {
    const meta = m.meta || {};
    const key = side === "home" ? "home_sets" : "away_sets";
    return Math.max(0, Number(meta[key] || 0));
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
    const patch = {
      status: newStatus,
      updated_at: now,         // 🔧 força atualização visual e evento realtime
    };
    if (newStatus === "ongoing" && m.status === "scheduled" && !m.starts_at) {
      patch.starts_at = now;   // garante relógio do jogo
    }
    return await mutate(m.id, patch);
  };

  // ---------- guarda de fila no clique ----------
  const tryStartMatch = async (m) => {
    setLastError(null);
    const sid = m?.sport?.id ?? m.sport_id;
    if (!sid) {
      setLastError("Partida sem modalidade definida.");
      return;
    }

    try {
      // Revalida no servidor (evita corrida)
      const { data: sameSport, error } = await supabase
        .from("matches")
        .select("id,status,group_name,order_idx,round,home_team_id,away_team_id")
        .eq("sport_id", sid);

      if (error) throw error;
      if (!sameSport) throw new Error("Falha ao validar ordem.");

      const active = sameSport.some((x) => x.status === "ongoing" || x.status === "paused");
      if (active) throw new Error("Já existe uma partida em andamento/pausada nesta modalidade. Encerre-a antes de iniciar outra.");

      const eligible = sameSport.filter((x) => {
        if (x.status !== "scheduled") return false;
        if (x.group_name) return true;
        return Boolean(x.home_team_id && x.away_team_id);
      });

      if (!eligible.length) throw new Error("Não há partidas elegíveis para iniciar.");

      eligible.sort((a, b) => orderValue(a) - orderValue(b));
      const nextId = eligible[0].id;

      if (nextId !== m.id) throw new Error("Você só pode iniciar o próximo jogo da fila.");

      await applyStatusChange(m, "ongoing");
    } catch (e) {
      console.error("tryStartMatch error:", e);
      setLastError(e.message || "Não foi possível iniciar a partida (ordem restrita).");
    }
  };

  const startMatch = async (m) => {
    // passa pelo guard de fila (não chama applyStatusChange direto)
    await tryStartMatch(m);
  };

  const pauseMatch = async (m) => {
    await applyStatusChange(m, "paused");
  };

  const resumeMatch = async (m) => {
    await applyStatusChange(m, "ongoing");
  };

  const finishMatch = async (m) => {
    await applyStatusChange(m, "finished");
  };

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
                key={s.id}
                onClick={() => setSelectedSport(s.id)}
                className={`px-2 py-1 rounded text-xs ${
                  selectedSport === s.id ? "bg-blue-600 text-white" : "bg-gray-100 hover:bg-gray-200"
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
            const isVolei = (m?.sport?.name || "").toLowerCase() === "volei";
            const homeSets = isVolei ? getSets(m, "home") : 0;
            const awaySets = isVolei ? getSets(m, "away") : 0;

            const isKnockout = !m.group_name;
            const hasBothTeams = Boolean(m.home?.id && m.away?.id);
            const canStartByTeams = isKnockout ? hasBothTeams : true;

            const isLive = m.status === "ongoing" || m.status === "paused";
            const cardBorder = isLive ? (m.status === "ongoing" ? "border-blue-200" : "border-orange-200") : "border-gray-200";

            const isNextInQueue = allowedStartIds.has(m.id);

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
                    {m.stage && <span>· {m.stage}</span>}
                    {m.round && <span>· J{m.round}</span>}
                    {isLive && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-600">
                        🕐 {formatGameTime(m, currentTimestamp)}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {m.status === "scheduled" && isNextInQueue && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 uppercase tracking-wide">
                        Próximo na ordem
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
                    onSetInc={isVolei ? () => changeSets(m, "home", "inc") : undefined}
                    onSetDec={isVolei ? () => changeSets(m, "home", "dec") : undefined}
                    onSetReset={isVolei ? () => changeSets(m, "home", "reset") : undefined}
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
                    onSetInc={isVolei ? () => changeSets(m, "away", "inc") : undefined}
                    onSetDec={isVolei ? () => changeSets(m, "away", "dec") : undefined}
                    onSetReset={isVolei ? () => changeSets(m, "away", "reset") : undefined}
                    disabled={busy[m.id] || m.status === "scheduled"}
                  />
                </div>

                {/* Ações de status */}
                <div className="flex flex-wrap gap-2">
                  {m.status === "scheduled" && (
                    <button
                      onClick={() => startMatch(m)}
                      disabled={busy[m.id] || !canStartByTeams || !allowedStartIds.has(m.id)}
                      className="px-3 py-1 text-xs rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                      title={
                        !canStartByTeams
                          ? "Defina as duas equipes antes de iniciar (mata-mata)."
                          : allowedStartIds.has(m.id)
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
                    <span className="text-xs text-gray-500 self-center">
                      Partida encerrada (resultado editável).
                    </span>
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

/* Subcomponentes */

function TeamDisplay({
  team,
  score,
  onInc,
  onDec,
  onReset,
  sets,
  onSetInc,
  onSetDec,
  onSetReset,
  disabled,
  align = "left",
}) {
  const right = align === "right";

  return (
    <div className={`border rounded p-3 space-y-3 ${right ? "" : ""}`}>
      {/* Nome do time */}
      <div className={`flex items-center gap-2 ${right ? "sm:justify-end" : ""}`}>
        <TeamBadge team={team || { name: "A definir" }} size={24} />
        <span className="text-sm font-medium truncate">{team?.name || "A definir"}</span>
      </div>

      {/* Sets para vôlei */}
      {typeof sets === "number" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-600">Sets:</span>
            <span className="font-semibold text-sm tabular-nums">{sets}</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onSetDec}
              disabled={disabled}
              className="flex-1 px-2 py-1 text-xs border rounded hover:bg-gray-100 disabled:opacity-50"
            >
              -
            </button>
            <button
              onClick={onSetInc}
              disabled={disabled}
              className="flex-1 px-2 py-1 text-xs border rounded hover:bg-gray-100 disabled:opacity-50"
            >
              +
            </button>
            <button
              onClick={onSetReset}
              disabled={disabled}
              className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
              title="Zerar sets"
            >
              0
            </button>
          </div>
        </div>
      )}

      {/* Pontos */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-600">Pontos:</span>
          <span className="font-bold text-lg tabular-nums">{Number(score || 0)}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onDec}
            disabled={disabled}
            className="flex-1 px-2 py-1 text-xs border rounded hover:bg-gray-100 disabled:opacity-50"
          >
            -
          </button>
          <button
            onClick={onInc}
            disabled={disabled}
            className="flex-1 px-2 py-1 text-xs border rounded hover:bg-gray-100 disabled:opacity-50"
          >
            +
          </button>
          <button
            onClick={onReset}
            disabled={disabled}
            className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
            title="Zerar pontos"
          >
            0
          </button>
        </div>
      </div>
    </div>
  );
}
