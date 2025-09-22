// src/pages/admin/PebolimTournament.jsx
import React, { useEffect, useState, useMemo } from "react";
import { supabase } from "../../supabaseClient";
import { useNavigate } from "react-router-dom";

const GROUP_KEYS = ["A", "B", "C", "D", "E", "F", "G", "H"];
const TEAMS_PER_GROUP = 3;

export default function PebolimTournament() {
  const [teams, setTeams] = useState([]);
  const [groups, setGroups] = useState(
    GROUP_KEYS.reduce((acc, g) => ({ ...acc, [g]: [] }), {})
  );
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Carrega times de Pebolim e pré-carrega grupos se já existirem
  const loadTeams = async () => {
    setLoading(true);

    const { data: sport, error: sportErr } = await supabase
      .from("sports")
      .select("id")
      .eq("name", "Pebolim")
      .maybeSingle();

    if (sportErr) {
      alert("Erro ao buscar a modalidade Pebolim.");
      setLoading(false);
      return;
    }

    if (sport?.id) {
      const { data: tms, error: teamsErr } = await supabase
        .from("teams")
        .select("id,name,logo_url,color,group_name")
        .eq("sport_id", sport.id)
        .order("name");

      if (teamsErr) {
        alert("Erro ao carregar times de Pebolim.");
        setLoading(false);
        return;
      }

      setTeams(tms || []);

      // Pré-preenche grupos com base no group_name existente
      const next = GROUP_KEYS.reduce((acc, g) => ({ ...acc, [g]: [] }), {});
      (tms || []).forEach((t) => {
        if (t.group_name && GROUP_KEYS.includes(t.group_name)) {
          next[t.group_name].push(t.id);
        }
      });
      setGroups(next);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadTeams();
  }, []);

  // Times já atribuídos a algum grupo
  const assigned = useMemo(() => {
    return new Set(GROUP_KEYS.flatMap((g) => groups[g]));
  }, [groups]);

  // Times disponíveis
  const availableTeams = useMemo(() => {
    return teams.filter((t) => !assigned.has(t.id));
  }, [teams, assigned]);

  // Toggle seleção
  const toggleSelect = (teamId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  };

  // Envia selecionados para um grupo
  const handleAssignToGroup = (group) => {
    const ids = Array.from(selected);
    if (ids.length === 0) {
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
        // Remove o time de quaisquer outros grupos
        for (const g of GROUP_KEYS) {
          next[g] = next[g].filter((tid) => tid !== id);
        }
        // Adiciona no grupo alvo
        next[group] = [...next[group], id];
      }
      return next;
    });

    setSelected(new Set());
  };

  // Remove time de todos os grupos
  const handleRemoveFromGroup = (teamId) => {
    setGroups((prev) => {
      const next = { ...prev };
      for (const g of GROUP_KEYS) {
        next[g] = next[g].filter((tid) => tid !== teamId);
      }
      return next;
    });
  };

  // Todos os grupos válidos?
  const allGroupsValid = GROUP_KEYS.every(
    (g) => groups[g].length === TEAMS_PER_GROUP
  );

  // Gera jogos de fase de grupos (3 jogos por grupo: 1-2, 1-3, 2-3)
  const buildGroupMatches = (sportId) => {
    const rows = [];
    const venue = "Mesa Pebolim";
    GROUP_KEYS.forEach((g) => {
      const ids = groups[g];
      if (ids.length === TEAMS_PER_GROUP) {
        const pairs = [
          [ids[0], ids[1]],
          [ids[0], ids[2]],
          [ids[1], ids[2]],
        ];
        pairs.forEach(([home, away], idx) => {
          rows.push({
            sport_id: sportId,
            stage: "grupos",
            round: idx + 1, // 1..3 por grupo
            group_name: g,
            status: "scheduled",
            home_team_id: home,
            away_team_id: away,
            venue,
          });
        });
      }
    });
    return rows;
  };

  // Confirma grupos → salva no banco → cria jogos → navega para /admin
  const confirmGroups = async () => {
    if (!allGroupsValid) {
      alert("Complete todos os grupos antes de confirmar!");
      return;
    }

    try {
      // 1) ID do esporte
      const { data: sport, error: sportErr } = await supabase
        .from("sports")
        .select("id")
        .eq("name", "Pebolim")
        .maybeSingle();

      if (sportErr || !sport?.id) {
        alert("Não encontrei a modalidade Pebolim no banco.");
        return;
      }

      const sportId = sport.id;

      // 2) Se já houver campeonato/matches existentes, confirmar reset
      const { count: existingMatches } = await supabase
        .from("matches")
        .select("*", { count: "exact", head: true })
        .eq("sport_id", sportId);

      if (existingMatches && existingMatches > 0) {
        const ok = window.confirm(
          "Já existe um campeonato de Pebolim. Criar um novo vai apagar jogos, chaves e classificação existentes. Deseja continuar?"
        );
        if (!ok) return;

        // Apaga jogos (match_events caem por CASCADE)
        const { error: delMatchesErr } = await supabase
          .from("matches")
          .delete()
          .eq("sport_id", sportId);
        if (delMatchesErr) {
          alert("Erro ao apagar jogos existentes.");
          return;
        }

        // Apaga standings
        const { error: delStdErr } = await supabase
          .from("standings")
          .delete()
          .eq("sport_id", sportId);
        if (delStdErr) {
          alert("Erro ao apagar classificação existente.");
          return;
        }
      }

      // 3) Zera grupos de todos os times do esporte (evita resíduos)
      const { error: clearErr } = await supabase
        .from("teams")
        .update({ group_name: null })
        .eq("sport_id", sportId);

      if (clearErr) {
        alert("Erro ao limpar grupos dos times.");
        return;
      }

      // 4) Define grupo A..H para os IDs escolhidos
      for (const g of GROUP_KEYS) {
        if (groups[g].length > 0) {
          const { error: updErr } = await supabase
            .from("teams")
            .update({ group_name: g })
            .in("id", groups[g]);
          if (updErr) {
            alert(`Erro ao atribuir grupo ${g}.`);
            return;
          }
        }
      }

      // 5) Seeds/standings (zera e recalcula)
      await supabase.rpc("seed_initial_standings", {
        p_sport_name: "Pebolim",
        p_reset: true,
      });
      await supabase.rpc("rebuild_standings", { p_sport_name: "Pebolim" });

      // 6) Cria os jogos da fase de grupos
      const rows = buildGroupMatches(sportId);
      if (rows.length > 0) {
        const { error: insErr } = await supabase.from("matches").insert(rows);
        if (insErr) {
          console.error("Insert matches error:", insErr);
          alert(`Erro ao gerar jogos: ${insErr.message}\n${insErr.details ?? ""}`);
          return;
        }
      }

      // 7) (Opcional) Pré-cria slots de quartas/semis/final
      await supabase.rpc("maybe_create_knockout", { p_sport_name: "Pebolim" });

      alert("Grupos confirmados e jogos gerados!");
      navigate("/admin");
    } catch (err) {
      alert("Erro ao salvar: " + (err?.message || String(err)));
    }
  };

  if (loading) return <p>Carregando times...</p>;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Configuração do Campeonato de Pebolim</h2>
      <p className="text-sm text-gray-600">
        Organize os 24 times em 8 grupos de 3. Clique nos times para
        selecioná-los (ficam escuros). Depois clique no botão de um grupo para
        mover todos os selecionados.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                    selected.has(t.id)
                      ? "bg-primary text-white"
                      : "bg-gray-50 hover:bg-gray-100"
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

        {/* Grupos A..H */}
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
                  {groups[g].map((id) => {
                    const team = teams.find((t) => t.id === id);
                    return (
                      <li
                        key={id}
                        className="flex items-center justify-between bg-gray-50 p-1 rounded cursor-pointer"
                        onClick={() => handleRemoveFromGroup(id)}
                        title="Clique para remover do grupo"
                      >
                        <div className="flex items-center gap-2">
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
          {allGroupsValid ? (
            <span className="text-green-700">
              Tudo certo! {TEAMS_PER_GROUP} times em cada grupo.
            </span>
          ) : (
            <span>
              Complete os grupos:{" "}
              {GROUP_KEYS.map(
                (g) => `${g}(${groups[g].length}/${TEAMS_PER_GROUP})`
              ).join(", ")}
              .
            </span>
          )}
        </div>

        <button
          onClick={confirmGroups}
          disabled={!allGroupsValid}
          className={`px-6 py-2 rounded font-semibold transition ${
            allGroupsValid
              ? "bg-primary text-white hover:bg-primary/90"
              : "bg-gray-200 text-gray-500 cursor-not-allowed"
          }`}
        >
          Confirmar grupos e gerar jogos
        </button>
      </div>
    </div>
  );
}

/* ======= Badge local para ficar “copia e cola” ======= */

function TeamBadge({ team }) {
  const initials = getInitials(team?.name);
  const bg = team?.color || stringToColor(team?.name || "T");
  return (
    <div
      className="w-6 h-6 rounded flex items-center justify-center text-white text-xs font-bold uppercase"
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
