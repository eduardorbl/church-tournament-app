// src/pages/admin/FutsalTournament.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../supabaseClient";
import { useNavigate } from "react-router-dom";
import { reindexAndEnsureKO } from "../../utils/reindexKnockout";

const GROUP_KEYS = ["A", "B", "C"];
const TEAMS_PER_GROUP = 3;

export default function FutsalTournament() {
  const [teams, setTeams] = useState([]);
  const [groups, setGroups] = useState({ A: [], B: [], C: [] });
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sportId, setSportId] = useState(null);

  const loadingRef = useRef(false);
  const mountedRef = useRef(true);
  const navigate = useNavigate();

  // Índice rápido por id
  const TeamById = useMemo(() => {
    const idx = new Map();
    teams.forEach((t) => idx.set(t.id, t));
    return idx;
  }, [teams]);

  // Carrega modalidade, times e grupos existentes
  const loadAll = async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      // 1) Modalidade Futsal
      const { data: sport, error: sportErr } = await supabase
        .from("sports")
        .select("id")
        .eq("name", "Futsal")
        .maybeSingle();

      if (sportErr || !sport?.id) {
        alert("Erro ao buscar a modalidade Futsal.");
        return;
      }
      setSportId(sport.id);

      // 2) Times
      const { data: tms, error: teamsErr } = await supabase
        .from("teams")
        .select("id,name,logo_url,color,group_name,seed_in_group")
        .eq("sport_id", sport.id)
        .order("name");

      if (teamsErr) {
        alert("Erro ao carregar times de Futsal.");
        return;
      }
      setTeams(tms || []);

      // Monta grupos atuais (se existir seed, respeita; senão usa ordem por nome)
      const next = { A: [], B: [], C: [] };
      const grouped = (tms || []).reduce((acc, t) => {
        if (GROUP_KEYS.includes(t.group_name)) {
          (acc[t.group_name] = acc[t.group_name] || []).push(t);
        }
        return acc;
      }, {});
      GROUP_KEYS.forEach((g) => {
        const arr = (grouped[g] || []).sort((a, b) => {
          const sa = a.seed_in_group ?? 999;
          const sb = b.seed_in_group ?? 999;
          if (sa !== sb) return sa - sb;
          return a.name.localeCompare(b.name);
        });
        next[g] = arr.map((t) => t.id);
      });
      setGroups(next);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    loadAll();

    // Opcional: atualiza quando "teams" mudar (ex.: outro admin mexeu)
    const ch = supabase
      .channel("futsal-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "teams" }, () => {
        if (mountedRef.current && !loadingRef.current) loadAll();
      })
      .subscribe();

    return () => {
      mountedRef.current = false;
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ==== Seleção/Grupos (UI) ====
  const assigned = useMemo(() => new Set(GROUP_KEYS.flatMap((g) => groups[g])), [groups]);

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

  const handleAssignToGroup = (group) => {
    const ids = Array.from(selected);
    if (!ids.length) {
      alert("Selecione ao menos 1 time.");
      return;
    }
    if (groups[group].length + ids.length > TEAMS_PER_GROUP) {
      alert(`O grupo ${group} não pode ter mais de ${TEAMS_PER_GROUP} times.`);
      setSelected(new Set());
      return;
    }
    setGroups((prev) => {
      const next = { ...prev };
      for (const id of ids) {
        for (const g of GROUP_KEYS) next[g] = next[g].filter((tid) => tid !== id);
        next[group] = [...next[group], id];
      }
      return next;
    });
    setSelected(new Set());
  };

  const handleRemoveFromGroup = (teamId) => {
    setGroups((prev) => {
      const next = { ...prev };
      for (const g of GROUP_KEYS) next[g] = next[g].filter((tid) => tid !== teamId);
      return next;
    });
  };

  const allGroupsValid = GROUP_KEYS.every((g) => groups[g].length === TEAMS_PER_GROUP);

  // ===== Confirmar e Gerar =====
  const confirmGroups = async () => {
    if (!allGroupsValid) {
      alert("Complete todos os grupos antes de confirmar!");
      return;
    }
    if (!sportId) {
      alert("Modalidade Futsal não encontrada.");
      return;
    }

    try {
      setBusy(true);

      // 1) Limpa grupos/seeds de todos os times do esporte
      await supabase
        .from("teams")
        .update({ group_name: null, seed_in_group: null })
        .eq("sport_id", sportId);

      // 2) Aplica group_name + seed_in_group (1..3) pela ORDEM do array de cada grupo
      for (const g of GROUP_KEYS) {
        const ids = groups[g];
        if (ids.length) {
          // group_name para todos do grupo
          await supabase.from("teams").update({ group_name: g }).in("id", ids);
          // seeds 1..3
          for (let i = 0; i < ids.length; i++) {
            await supabase.from("teams").update({ seed_in_group: i + 1 }).eq("id", ids[i]);
          }
        }
      }

      // 3) Standings
      await supabase.rpc("seed_initial_standings", { p_sport_name: "Futsal", p_reset: true });
      await supabase.rpc("rebuild_standings", { p_sport_name: "Futsal" });

      // 4) Gerar partidas de grupos pela RPC (ordem fixa e order_idx global)
      const { error: genErr } = await supabase.rpc("admin_generate_group_fixtures_3x3", {
        p_sport_id: sportId,
        p_variant: "1v3_1v2_3v2",
      });
      if (genErr) {
        alert("Erro ao gerar jogos de grupos: " + genErr.message);
        return;
      }

      // 5) Reindexa partidas e garante mata-mata
      await reindexAndEnsureKO("Futsal");
      await loadAll();

      alert("✅ Grupos confirmados e jogos gerados!\n\nVoltando para a tela de campeonatos...");
      setTimeout(() => navigate("/admin/campeonatos"), 1200);
    } catch (err) {
      alert("Erro ao salvar: " + (err?.message || String(err)));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p>Carregando times...</p>;

  return (
    <div className="space-y-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Configuração do Campeonato de Futsal</h2>
          <p className="text-sm text-gray-600">
            Organize os 9 times em 3 grupos de 3. Ao confirmar, os grupos são salvos com{" "}
            <strong>seed_in_group = 1,2,3</strong>, e os jogos são gerados via RPC na{" "}
            <strong>ordem exata</strong> (fila global por <code>order_idx</code>).
            Assim, o Jogo 1 já aparece em <em>⚠️ Compareçam</em> e o Jogo 2 como <em>Próximo</em>.
          </p>
        </div>

        <button
          onClick={loadAll}
          className="text-xs px-3 py-1 rounded border hover:bg-gray-50"
          title="Recarregar dados"
        >
          Recarregar
        </button>
      </header>

      {/* Times e grupos */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Times disponíveis */}
        <div className="border rounded p-4 h-72 flex flex-col">
          <h3 className="font-semibold mb-2">Times disponíveis</h3>
          {availableTeams.length === 0 ? (
            <div className="text-xs text-gray-500">Nenhum time disponível.</div>
          ) : (
            <ul className="flex-1 overflow-y-auto space-y-1">
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

        {/* Grupos A/B/C */}
        {GROUP_KEYS.map((g) => (
          <div key={g} className="border rounded p-4 h-72 flex flex-col">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-semibold text-sm">Grupo {g}</h3>
              <span
                className={`text-xs px-2 py-0.5 rounded ${
                  groups[g].length === TEAMS_PER_GROUP
                    ? "bg-green-100 text-green-700"
                    : "bg-yellow-100 text-yellow-700"
                }`}
              >
                {groups[g].length}/{TEAMS_PER_GROUP}
              </span>
            </div>

            <button
              onClick={() => handleAssignToGroup(g)}
              className="mb-1 text-xs px-2 py-1 border rounded hover:bg-gray-100"
            >
              Adicionar selecionados
            </button>

            <div className="flex-1 overflow-y-auto">
              {groups[g].length === 0 ? (
                <div className="text-xs text-gray-500">Nenhum time.</div>
              ) : (
                <ul className="space-y-1">
                  {groups[g].map((id, idx) => {
                    const team = TeamById.get(id);
                    return (
                      <li
                        key={id}
                        className="flex items-center justify-between bg-gray-50 p-1 rounded cursor-pointer"
                        onClick={() => handleRemoveFromGroup(id)}
                        title="Clique para remover do grupo"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] w-4 text-gray-500">{idx + 1}</span>
                          <TeamBadge team={team} />
                          <span className="truncate" title={team?.name}>
                            {team?.name}
                          </span>
                        </div>
                        <span className="text-xs text-red-500">Remover</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Rodapé */}
      <div className="flex items-center justify-between gap-4">
        <div className="text-xs text-gray-600">
          {GROUP_KEYS.map((g) => `${g}(${groups[g].length}/${TEAMS_PER_GROUP})`).join(", ")}
        </div>

        <button
          onClick={confirmGroups}
          disabled={!allGroupsValid || busy}
          className={`px-6 py-2 rounded font-semibold transition ${
            allGroupsValid && !busy
              ? "bg-blue-600 text-white hover:bg-blue-700"
              : "bg-gray-200 text-gray-500 cursor-not-allowed"
          }`}
        >
          {busy ? "Processando..." : "Confirmar grupos e gerar jogos"}
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
      className="w-6 h-6 rounded flex items-center justify-center text-white text-[10px] font-bold uppercase"
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
