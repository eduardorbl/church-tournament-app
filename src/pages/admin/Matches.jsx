// src/pages/admin/Matches.jsx
import React, { useEffect, useState, useRef } from "react";
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
 * ORDEM DE PRIORIDADE DOS STATUS (para ordenação)
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

export default function Matches() {
  const [matches, setMatches] = useState([]);
  const [sports, setSports] = useState([]);
  const [selectedSport, setSelectedSport] = useState(null);
  const [selectedStatus, setSelectedStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState({});
  const [isAdmin, setIsAdmin] = useState(null); // só para aviso visual
  const [lastError, setLastError] = useState(null);
  const [currentTimestamp, setCurrentTimestamp] = useState(Date.now());

  // mantém mensagens de erro visíveis por 8s, a menos que o usuário feche
  useEffect(() => {
    if (!lastError) return;
    const t = setTimeout(() => setLastError(null), 8000);
    return () => clearTimeout(t);
  }, [lastError]);

  const channelRef = useRef(null);
  const mountedRef = useRef(true);
  const timerRef = useRef(null);

  /** ========= Helpers base ========= */
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

  /** ========= Auth/Admin Check (apenas para aviso visual) ========= */
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

  useEffect(() => {
    mountedRef.current = true;

    (async () => {
      await ensureSession();
      await checkIsAdmin();
      await loadSports();
      await loadMatches();
    })();

    // Timer para atualizar o timestamp a cada segundo
    timerRef.current = setInterval(() => {
      setCurrentTimestamp(Date.now());
    }, 1000);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** ========= Carregamentos ========= */
  const loadSports = async () => {
    const { data, error } = await supabase.from("sports").select("id,name").order("name");
    if (error) {
      console.error("loadSports error:", error);
      return;
    }
    if (data) setSports(data);
  };

  const loadMatches = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("matches")
        .select(
          `
          id, stage, round, group_name, starts_at, venue, created_at, updated_at,
          status, home_score, away_score, meta,
          home_team_id, away_team_id,
          sport:sport_id ( id, name ),
          home:home_team_id ( id, name, logo_url, color ),
          away:away_team_id ( id, name, logo_url, color )
        `
        );
  
      if (selectedSport) query = query.eq("sport_id", selectedSport);
      if (selectedStatus) query = query.eq("status", selectedStatus);
  
      // 👇 esconde slots vazios de mata-mata
      // esconde slots de mata-mata até os DOIS times estarem definidos
      query = query.or(
        "group_name.not.is.null,and(home_team_id.not.is.null,away_team_id.not.is.null)"
      );
  
      const { data, error } = await query;
      if (error) {
        console.error("loadMatches error:", error);
        setLastError(error.message || "Falha ao carregar partidas.");
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

        // Ordena por status: Em andamento, Pausado, Agendado, Encerrado
        const sortedData = normalized.sort((a, b) => {
          const aOrder = STATUS_ORDER[a.status] || 999;
          const bOrder = STATUS_ORDER[b.status] || 999;
          if (aOrder !== bOrder) return aOrder - bOrder;
          
          // Se mesmo status, ordena por data de criação (mais recente primeiro)
          return new Date(b.created_at || 0) - new Date(a.created_at || 0);
        });
        
        setMatches(sortedData);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };  

  // (Re)carrega e assina realtime quando filtros mudarem
  useEffect(() => {
    loadMatches();

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase
      .channel("admin-matches")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matches" },
        () => loadMatches()
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSport, selectedStatus]);

  /** ========= Mutação genérica ========= */
  // Sempre tentamos mutar; deixamos o servidor (RLS/GRANT) decidir.
  const mutate = async (id, patch, after = null) => {
    setMatchBusy(id, true);
    setLastError(null);
    try {
      const session = await ensureSession();
      if (!session) {
        setLastError("Você precisa estar autenticado para realizar esta ação.");
        return false;
      }
      if (isAdmin === false) {
        setLastError("Somente administradores podem alterar partidas (RLS).");
        return false;
      }

      // 🔧 Log para debug - vamos ver o que está sendo enviado
      console.log('🔄 Atualizando partida:', { id, patch });
      console.log('🔍 Tipo do ID:', typeof id, 'Valor:', id);

      // 🔧 Validação dos dados antes de enviar
      const validatedPatch = { ...patch };
      
      // 🔍 Log detalhado de cada campo do patch
      Object.keys(validatedPatch).forEach(key => {
        console.log(`🔍 Campo ${key}:`, {
          valor: validatedPatch[key],
          tipo: typeof validatedPatch[key],
          isArray: Array.isArray(validatedPatch[key])
        });
      });
      
      // Se estamos atualizando meta, garantir que é um objeto
      if (validatedPatch.meta && typeof validatedPatch.meta !== 'object') {
        console.error('Meta deve ser um objeto:', validatedPatch.meta);
        setLastError('Erro interno: meta deve ser um objeto.');
        return false;
      }

      // Garantir que scores são números ou null
      if ('home_score' in validatedPatch) {
        const originalValue = validatedPatch.home_score;
        validatedPatch.home_score = validatedPatch.home_score === null ? null : Number(validatedPatch.home_score);
        console.log(`🔍 home_score: ${originalValue} → ${validatedPatch.home_score} (${typeof validatedPatch.home_score})`);
      }
      if ('away_score' in validatedPatch) {
        const originalValue = validatedPatch.away_score;
        validatedPatch.away_score = validatedPatch.away_score === null ? null : Number(validatedPatch.away_score);
        console.log(`🔍 away_score: ${originalValue} → ${validatedPatch.away_score} (${typeof validatedPatch.away_score})`);
      }

      // 🔧 Verificar se o ID da partida é válido
      if (!id || typeof id !== 'string') {
        console.error('ID da partida inválido:', id);
        setLastError('ID da partida inválido.');
        return false;
      }

      // 🔍 Verificar se é um UUID válido
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(id)) {
        console.error('ID não é um UUID válido:', id);
        setLastError('ID da partida não é um UUID válido.');
        return false;
      }

      // 🔍 Verificar se não há UUIDs em campos que devem ser integers
      const integerFields = ['home_score', 'away_score', 'sport_id', 'home_team_id', 'away_team_id'];
      for (const field of integerFields) {
        if (field in validatedPatch && validatedPatch[field] !== null) {
          const value = validatedPatch[field];
          if (typeof value === 'string' && uuidRegex.test(value)) {
            console.error(`❌ Campo ${field} contém UUID mas deveria ser integer:`, value);
            setLastError(`Erro: Campo ${field} contém UUID inválido.`);
            return false;
          }
        }
      }

      console.log('🔄 Patch validado final:', validatedPatch);

      const { data, error } = await supabase
        .from("matches")
        .update(validatedPatch)
        .eq("id", id)
        .select("id"); // detecta RLS (se não puder selecionar, volta [])

      if (error) {
        console.error("Update matches error:", error, { id, patch: validatedPatch });
        console.error("🔍 Error details:", {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        });
        
        const msg = [
          "Falha ao atualizar a partida.",
          error.code && `code: ${error.code}`,
          error.details && `details: ${error.details}`,
          error.hint && `hint: ${error.hint}`,
          error.message && `message: ${error.message}`,
        ]
          .filter(Boolean)
          .join("\n");
        setLastError(msg || "Falha ao atualizar partida (permissão/RLS?).");
        return false;
      }
      
      if (!data || data.length === 0) {
        const msg =
          "Nenhuma linha atualizada. Verifique permissões (GRANT/RLS) e se o usuário é admin.";
        console.warn(msg, { id, patch: validatedPatch });
        setLastError(msg);
        return false;
      }

      console.log('✅ Partida atualizada com sucesso:', data);
      if (after) await after();
      return true;
    } catch (e) {
      console.error("mutate exception:", e);
      console.error("🔍 Exception details:", {
        name: e.name,
        message: e.message,
        stack: e.stack
      });
      setLastError(e.message || "Erro ao atualizar");
      return false;
    } finally {
      setMatchBusy(id, false);
      setTimeout(() => loadMatches(), 50);
    }
  };
  
  /** ========= Placar ========= */
  const changePoints = async (m, team, action) => {
    // Não permite alterar placar de jogos agendados (ainda não iniciados)
    if (m.status === "scheduled") return;
    
    console.log('🔄 Alterando pontos:', { matchId: m.id, team, action, currentScore: m[`${team}_score`] });
    
    const key = `${team}_score`;
    let next = Math.max(0, Number(m[key] || 0));
    if (action === "inc") next += 1;
    if (action === "dec") next = Math.max(0, next - 1);
    if (action === "reset") next = 0;
    
    console.log('🔄 Novo valor do placar:', { key, next });
    
    await mutate(m.id, { [key]: next });
  };
  
  /** ========= Sets (Vôlei) ========= */
  const getSets = (m, side) => {
    const meta = m.meta || {};
    const key = side === "home" ? "home_sets" : "away_sets";
    return Math.max(0, Number(meta[key] || 0));
  };
  
  const changeSets = async (m, team, action) => {
    // Não permite alterar sets de jogos agendados (ainda não iniciados)
    if (m.status === "scheduled") return;
    
    console.log('🔄 Alterando sets:', { matchId: m.id, team, action, currentMeta: m.meta });
    
    const meta = m.meta || {};
    const key = team === "home" ? "home_sets" : "away_sets";
    let value = Math.max(0, Number(meta[key] || 0));
    if (action === "inc") value += 1;
    if (action === "dec") value = Math.max(0, value - 1);
    if (action === "reset") value = 0;
    
    const newMeta = { ...meta, [key]: value };
    console.log('🔄 Nova meta:', newMeta);
    
    await mutate(m.id, { meta: newMeta });
  };

  /** ========= Status ========= */
  const startMatch = async (m) => {
    await applyStatusChange(m, "ongoing");
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

      {isAdmin === false && (
        <div className="text-sm p-3 rounded bg-red-50 border border-red-200 text-red-700">
          Você não está autenticado como <strong>admin</strong>. As ações podem ser bloqueadas pelas{" "}
          <strong>RLS policies</strong>.
        </div>
      )}

      {lastError && (
        <div className="text-sm p-3 rounded bg-yellow-50 border border-yellow-200 text-yellow-800 flex items-start gap-3">
          <div className="flex-1 whitespace-pre-wrap">{String(lastError)}</div>
          <button
            onClick={() => setLastError(null)}
            className="text-xs px-2 py-1 rounded border border-yellow-300 hover:bg-yellow-100"
            title="Fechar alerta"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Modalidade:</span>
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedSport(null)}
              className={`px-3 py-1 rounded text-xs ${
                !selectedSport ? "bg-primary text-white" : "bg-gray-100 hover:bg-gray-200"
              }`}
            >
              Todas
            </button>
            {sports.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedSport(s.id)}
                className={`px-3 py-1 rounded text-xs ${
                  selectedSport === s.id ? "bg-primary text-white" : "bg-gray-100 hover:bg-gray-200"
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Status:</span>
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedStatus(null)}
              className={`px-3 py-1 rounded text-xs ${
                !selectedStatus ? "bg-primary text-white" : "bg-gray-100 hover:bg-gray-200"
              }`}
            >
              Todos
            </button>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setSelectedStatus(value)}
                className={`px-3 py-1 rounded text-xs ${
                  selectedStatus === value ? "bg-primary text-white" : "bg-gray-100 hover:bg-gray-200"
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

            // knockout = partidas sem group_name (semi/final/3º)
            const isKnockout = !m.group_name;
            const hasBothTeams = Boolean(m.home?.id && m.away?.id);
            // pode iniciar grupos sempre; em mata-mata só quando ambos os times existem
            const canStart = isKnockout ? hasBothTeams : true;

            const isLive = m.status === "ongoing" || m.status === "paused";
            const cardBorder = isLive 
              ? m.status === "ongoing" 
                ? "border-blue-200" 
                : "border-orange-200"
              : "border-gray-200";

            return (
              <li key={m.id} className={`border rounded-lg p-4 flex flex-col gap-3 bg-white shadow-sm relative overflow-hidden ${cardBorder}`}>
                <LiveProgressBar status={m.status} />
                
                {/* Cabeçalho */}
                <div className="flex items-center justify-between">
                  <div className="text-xs text-gray-500 flex items-center gap-2">
                    <span className="font-medium">{m.sport?.name}</span>
                    {m.group_name ? ` · Grupo ${m.group_name}` : ""}
                    {m.stage ? ` · ${m.stage}` : ""}
                    {m.round ? ` · J${m.round}` : ""}
                    {isLive && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-600">
                        🕐 {formatGameTime(m, currentTimestamp)}
                      </span>
                    )}
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${
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

                {/* Linha dos times com placar e sets (para Vôlei) */}
                <div className="grid grid-cols-2 gap-4 items-stretch">
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
                      disabled={busy[m.id] || !canStart}
                      className="px-3 py-1 text-xs rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
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
          0% { transform: translateX(-100%); }
          50% { transform: translateX(200%); }
          100% { transform: translateX(-100%); }
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
    <div className={`flex flex-col gap-3 border rounded p-3 ${right ? "items-end" : "items-start"}`}>
      <div className={`flex items-center gap-2 w-full ${right ? "justify-end" : "justify-start"}`}>
        <TeamBadge team={team || { name: "A definir" }} size={28} />
        <span className="truncate">{team?.name || "A definir"}</span>
      </div>

      {typeof sets === "number" && (
        <div className={`flex items-center gap-3 ${right ? "justify-end" : ""}`}>
          <span className="text-xs text-gray-600">Sets:</span>
          <div className="flex items-center gap-1">
            <button
              onClick={onSetDec}
              disabled={disabled}
              className="px-2 py-1 text-xs border rounded hover:bg-gray-100 disabled:opacity-50"
            >
              -
            </button>
            <span className="font-semibold w-6 text-center tabular-nums">{sets}</span>
            <button
              onClick={onSetInc}
              disabled={disabled}
              className="px-2 py-1 text-xs border rounded hover:bg-gray-100 disabled:opacity-50"
            >
              +
            </button>
            <button
              onClick={onSetReset}
              disabled={disabled}
              className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50 ml-6"
              title="Zerar sets"
            >
              Zerar
            </button>
          </div>
        </div>
      )}

      <div className={`flex items-center gap-3 ${right ? "justify-end" : ""}`}>
        <span className="text-xs text-gray-600">Pontos:</span>
        <div className="flex items-center gap-1">
          <button
            onClick={onDec}
            disabled={disabled}
            className="px-2 py-1 text-xs border rounded hover:bg-gray-100 disabled:opacity-50"
          >
            -
          </button>
          <span className="font-bold text-lg w-8 text-center tabular-nums">{Number(score || 0)}</span>
          <button
            onClick={onInc}
            disabled={disabled}
            className="px-2 py-1 text-xs border rounded hover:bg-gray-100 disabled:opacity-50"
          >
            +
          </button>
          <button
            onClick={onReset}
            disabled={disabled}
            className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50 ml-6"
            title="Zerar pontos"
          >
            Zerar
          </button>
        </div>
      </div>
    </div>
  );
}