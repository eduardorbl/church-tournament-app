// src/pages/admin/FifaTournament.jsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabaseClient";
import { useNavigate } from "react-router-dom";

const MATCH_COUNT = 16; // 32 times → 16 jogos de pré-oitavas (r32)

export default function FifaTournament() {
  const [teams, setTeams] = useState([]);
  const [bracket, setBracket] = useState(
    Array.from({ length: MATCH_COUNT }, () => ({ home: null, away: null }))
  );
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sportId, setSportId] = useState(null);

  const navigate = useNavigate();

  // Carrega times e sportId da modalidade FIFA
  const loadTeams = async () => {
    setLoading(true);
    try {
      const { data: sport, error: sportErr } = await supabase
        .from("sports")
        .select("id")
        .eq("name", "FIFA")
        .maybeSingle();

      if (sportErr || !sport?.id) {
        alert("Erro ao localizar a modalidade FIFA.");
        setLoading(false);
        return;
      }

      setSportId(sport.id);

      const { data: tms, error: tErr } = await supabase
        .from("teams")
        .select("id, name, logo_url, color")
        .eq("sport_id", sport.id)
        .order("name");

      if (tErr) {
        alert("Erro ao carregar times do FIFA.");
      } else {
        setTeams(tms || []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTeams();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Times já alocados em algum jogo (para esconder da lista de disponíveis)
  const assigned = useMemo(
    () => new Set(bracket.flatMap((m) => [m.home, m.away]).filter(Boolean)),
    [bracket]
  );

  const availableTeams = useMemo(
    () => teams.filter((t) => !assigned.has(t.id)),
    [teams, assigned]
  );

  const toggleSelect = (teamId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  };

  const handleAssignToMatch = (matchIdx, side) => {
    const ids = Array.from(selected);
    if (ids.length === 0) {
      alert("Selecione um time para alocar.");
      return;
    }
    if (ids.length > 1) {
      alert("Selecione apenas 1 time por vez.");
      setSelected(new Set());
      return;
    }
    const teamId = ids[0];

    setBracket((prev) => {
      const match = prev[matchIdx];
      if (match[side]) {
        alert(`O slot ${side === "home" ? "A" : "B"} do Jogo ${matchIdx + 1} já está ocupado.`);
        return prev;
      }
      const next = [...prev];
      next[matchIdx] = { ...match, [side]: teamId };
      return next;
    });

    setSelected(new Set());
  };

  const handleRemoveFromMatch = (matchIdx, side) => {
    setBracket((prev) => {
      const next = [...prev];
      next[matchIdx] = { ...next[matchIdx], [side]: null };
      return next;
    });
  };

  const allFilled =
    bracket.length === MATCH_COUNT && bracket.every((m) => m.home && m.away);

  // ===== Fluxo 1: Confirmar chaveamento MANUAL =====
  const confirmBracket = async () => {
    if (!allFilled) {
      alert("Todos os confrontos precisam ter 2 times.");
      return;
    }
    if (!sportId) {
      alert("Modalidade FIFA não encontrada.");
      return;
    }

    try {
      setBusy(true);

      // Se já houver jogos, confirmar reset
      const { count: existingMatches } = await supabase
        .from("matches")
        .select("*", { count: "exact", head: true })
        .eq("sport_id", sportId);

      if ((existingMatches ?? 0) > 0) {
        const ok = window.confirm(
          "Já existe um campeonato de FIFA. Criar um novo vai apagar jogos e classificação existentes. Deseja continuar?"
        );
        if (!ok) return;

        // Apaga eventos → jogos → standings (caso sua FK não seja CASCADE)
        const { data: oldMatches } = await supabase
          .from("matches")
          .select("id")
          .eq("sport_id", sportId);

        const oldIds = (oldMatches || []).map((m) => m.id);
        if (oldIds.length) {
          await supabase.from("match_events").delete().in("match_id", oldIds);
        }
        await supabase.from("matches").delete().eq("sport_id", sportId);
        await supabase.from("standings").delete().eq("sport_id", sportId);
      }

      // FIFA não usa grupos
      await supabase.from("teams").update({ group_name: null }).eq("sport_id", sportId);

      // Pré-oitavas: order_idx 1..16, status 'scheduled' (J1 vira ⚠️ na UI)
      const rows = bracket.map((m, i) => ({
        sport_id: sportId,
        stage: "r32",
        round: i + 1,           // 1..16
        order_idx: i + 1,       // 1..16 para a fila
        status: "scheduled",
        home_team_id: m.home,
        away_team_id: m.away,
        venue: "Console FIFA",
      }));

      const { error: insErr } = await supabase.from("matches").insert(rows);
      if (insErr) {
        alert("Erro ao criar os jogos: " + insErr.message);
        return;
      }

      // Reset de partidas em andamento antes de reindexar
      await supabase.from("matches")
        .update({ status: "scheduled", starts_at: null })
        .eq("sport_id", sportId)
        .in("status", ["ongoing", "paused"]);

      // Garante KO montado e ordem consistente
      const { error: knockoutErr } = await supabase.rpc("maybe_create_knockout", { p_sport_name: "FIFA" });
      if (knockoutErr) throw knockoutErr;
      const { error: resetErr } = await supabase.rpc("reset_fifa_later_rounds", { p_sport_name: "FIFA" });
      if (resetErr) throw resetErr;
      
      // Usa reindex_fifa_safe para manter timers e propagar vencedores
      const { error: reindexErr } = await supabase.rpc("reindex_fifa_safe", { p_sport_name: "FIFA" });
      if (reindexErr) throw reindexErr;

      // Propaga vencedores de R32 para oitavas (se já houver vencedores)
      await supabase.rpc("fifa_propagate_r32_to_oitavas", { p_sport_name: "FIFA" });

      // Standings (idempotente)
      await supabase.rpc("seed_initial_standings", { p_sport_name: "FIFA", p_reset: true });

      await loadTeams();

      alert("✅ Chaveamento criado com sucesso!\n\nVoltando para a tela de campeonatos…");
      setTimeout(() => navigate("/admin/campeonatos"), 1200);
    } catch (err) {
      alert("Erro ao salvar: " + (err?.message || String(err)));
    } finally {
      setBusy(false);
    }
  };

  // ===== Fluxo 2: Gerar AUTOMATICAMENTE via RPC (usa nomes 'Player 1..32' com natsort) =====
  const confirmAndGenerate = async () => {
    if (!sportId) {
      alert("Modalidade FIFA não encontrada.");
      return;
    }
    if (teams.length !== 32) {
      alert("É necessário ter exatamente 32 times cadastrados no FIFA para gerar automaticamente.");
      return;
    }

    try {
      setBusy(true);
      // Recomenda-se usar o RPC que já gera todas as fases e placeholders corretamente
      // Reset de partidas em andamento antes de reindexar
      await supabase.from("matches")
        .update({ status: "scheduled", starts_at: null })
        .eq("sport_id", sportId)
        .in("status", ["ongoing", "paused"]);

      const { error } = await supabase.rpc("fifa_seed_32_bracket", { p_sport_name: "FIFA", p_reset: false });
      if (error) throw error;

      const { error: knockoutErr } = await supabase.rpc("maybe_create_knockout", { p_sport_name: "FIFA" });
      if (knockoutErr) throw knockoutErr;
      const { error: resetErr } = await supabase.rpc("reset_fifa_later_rounds", { p_sport_name: "FIFA" });
      if (resetErr) throw resetErr;
      
      // Usa reindex_fifa_safe para manter timers e propagar vencedores
      const { error: reindexErr } = await supabase.rpc("reindex_fifa_safe", { p_sport_name: "FIFA" });
      if (reindexErr) throw reindexErr;

      // Propaga vencedores de R32 para oitavas (se já houver vencedores)
      await supabase.rpc("fifa_propagate_r32_to_oitavas", { p_sport_name: "FIFA" });

      await loadTeams();

      alert("✅ Partidas do FIFA geradas com sucesso!\n\nVoltando para a tela de campeonatos…");
      setTimeout(() => navigate("/admin/campeonatos"), 1200);
    } catch (err) {
      console.error("Erro ao gerar partidas FIFA:", err);
      alert("Erro ao gerar partidas: " + (err?.message || String(err)));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p>Carregando times...</p>;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Configuração do Campeonato de FIFA</h2>
          <p className="text-sm text-gray-600">
            Monte as pré-oitavas (16 jogos). Ao confirmar, os jogos entram como <strong>scheduled</strong> com{" "}
            <strong>order_idx</strong> fixo: assim, o Jogo 1 aparece em <em>⚠️ Compareçam</em> e o Jogo 2 como <em>Próximo</em>.
          </p>
        </div>

        <button
          onClick={confirmAndGenerate}
          disabled={busy || !sportId}
          title="Gera automaticamente J1..J16, placeholders J17..J28"
          className={`text-xs px-3 py-1 rounded border transition ${
            busy ? "opacity-60 cursor-not-allowed" : "hover:bg-gray-50"
          }`}
        >
          Gerar automaticamente (RPC)
        </button>
      </header>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Times disponíveis */}
        <div className="border rounded p-4">
          <h3 className="font-semibold mb-2">Times disponíveis</h3>
          {availableTeams.length === 0 ? (
            <div className="text-xs text-gray-500">Nenhum time disponível.</div>
          ) : (
            <ul className="grid grid-cols-2 gap-2">
              {availableTeams.map((t) => (
                <li
                  key={t.id}
                  className={`flex items-center gap-2 p-2 rounded cursor-pointer border ${
                    selected.has(t.id) ? "bg-blue-600 text-white" : "bg-gray-50 hover:bg-gray-100"
                  }`}
                  onClick={() => toggleSelect(t.id)}
                  title={t.name}
                >
                  <TeamBadge team={t} />
                  <span className="truncate">{t.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Confrontos (pré-oitavas) */}
        <div className="border rounded p-4 overflow-y-auto max-h-[32rem]">
          <h3 className="font-semibold mb-2">Confrontos (pré-oitavas)</h3>
          <ul className="space-y-4">
            {bracket.map((m, idx) => {
              const home = teams.find((t) => t.id === m.home);
              const away = teams.find((t) => t.id === m.away);
              return (
                <li key={idx} className="flex flex-col gap-1 border rounded p-2 bg-gray-50">
                  <span className="text-xs font-semibold text-gray-600">Jogo {m.order_idx ?? idx + 1}</span>
                  <div className="flex items-center justify-between gap-2">
                    {/* Slot A */}
                    <div className="flex items-center gap-2 flex-1">
                      {home ? (
                        <>
                          <TeamBadge team={home} />
                          <span className="truncate" title={home.name}>
                            {home.name}
                          </span>
                          <button
                            className="text-xs text-red-600"
                            onClick={() => handleRemoveFromMatch(idx, "home")}
                          >
                            Remover
                          </button>
                        </>
                      ) : (
                        <button
                          className="text-xs px-3 py-1 rounded border hover:bg-gray-100"
                          onClick={() => handleAssignToMatch(idx, "home")}
                        >
                          Adicionar time A
                        </button>
                      )}
                    </div>

                    <span className="font-bold">vs</span>

                    {/* Slot B */}
                    <div className="flex items-center gap-2 flex-1">
                      {away ? (
                        <>
                          <TeamBadge team={away} />
                          <span className="truncate" title={away.name}>
                            {away.name}
                          </span>
                          <button
                            className="text-xs text-red-600"
                            onClick={() => handleRemoveFromMatch(idx, "away")}
                          >
                            Remover
                          </button>
                        </>
                      ) : (
                        <button
                          className="text-xs px-3 py-1 rounded border hover:bg-gray-100"
                          onClick={() => handleAssignToMatch(idx, "away")}
                        >
                          Adicionar time B
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* Rodapé */}
      <div className="flex items-center justify-between gap-4">
        <div className="text-xs text-gray-600">
          {allFilled ? (
            <span className="text-green-700">
              Todos os {MATCH_COUNT} confrontos estão prontos!
            </span>
          ) : (
            <span>Restam {32 - assigned.size} times para alocar.</span>
          )}
        </div>

        <button
          onClick={confirmBracket}
          disabled={!allFilled || busy}
          className={`px-6 py-3 rounded font-semibold transition ${
            allFilled && !busy
              ? "bg-blue-600 text-white hover:bg-blue-700"
              : "bg-gray-200 text-gray-500 cursor-not-allowed"
          }`}
        >
          {busy ? "Processando..." : "Confirmar chaveamento"}
        </button>
      </div>
    </div>
  );
}

/* ======= Componentes auxiliares ======= */
function TeamBadge({ team }) {
  const initials = getInitials(team?.name);
  const bg = team?.color || stringToColor(team?.name || "T");
  return (
    <div
      className="w-7 h-7 rounded flex items-center justify-center text-white text-xs font-bold uppercase"
      style={{ backgroundColor: bg }}
      title={team?.name}
    >
      {initials}
    </div>
  );
}

function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() || "?";
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function stringToColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    // eslint-disable-next-line no-bitwise
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  // eslint-disable-next-line no-bitwise
  const color = ((hash >>> 0) % 0xffffff).toString(16).padStart(6, "0");
  return `#${color}`;
}
