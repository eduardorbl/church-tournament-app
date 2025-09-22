// src/pages/admin/FifaTournament.jsx
import React, { useEffect, useState, useMemo } from "react";
import { supabase } from "../../supabaseClient";
import { useNavigate } from "react-router-dom";

const MATCH_COUNT = 16; // 32 times → 16 jogos de oitavas

export default function FifaTournament() {
  const [teams, setTeams] = useState([]);
  const [bracket, setBracket] = useState(
    Array.from({ length: MATCH_COUNT }, () => ({ home: null, away: null }))
  );
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Carrega times de FIFA
  const loadTeams = async () => {
    setLoading(true);
    const { data: sport, error: sportErr } = await supabase
      .from("sports")
      .select("id")
      .eq("name", "FIFA")
      .maybeSingle();
    if (sportErr) {
      alert("Erro ao buscar a modalidade FIFA.");
      setLoading(false);
      return;
    }

    if (sport?.id) {
      const { data: tms, error: tErr } = await supabase
        .from("teams")
        .select("id,name,logo_url,color")
        .eq("sport_id", sport.id)
        .order("name");
      if (tErr) {
        alert("Erro ao carregar times de FIFA.");
      } else {
        setTeams(tms || []);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    loadTeams();
  }, []);

  // Já alocados no bracket
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
      alert("Selecione ao menos 1 time.");
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
        alert(`O slot ${side} do Jogo ${matchIdx + 1} já está ocupado.`);
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

  const allFilled = bracket.every((m) => m.home && m.away) && bracket.length === MATCH_COUNT;

  const confirmBracket = async () => {
    if (!allFilled) {
      alert("Todos os confrontos precisam ter 2 times.");
      return;
    }

    try {
      // 1) ID do esporte
      const { data: sport, error: sportErr } = await supabase
        .from("sports")
        .select("id")
        .eq("name", "FIFA")
        .maybeSingle();

      if (sportErr || !sport?.id) {
        alert("Não encontrei a modalidade FIFA.");
        return;
      }
      const sportId = sport.id;

      // 2) Se já houver jogos da FIFA, perguntar se deve resetar
      const { count: existingMatches } = await supabase
        .from("matches")
        .select("*", { count: "exact", head: true })
        .eq("sport_id", sportId);

      if ((existingMatches ?? 0) > 0) {
        const ok = window.confirm(
          "Já existe um campeonato de FIFA. Criar um novo vai apagar jogos e classificação existentes. Deseja continuar?"
        );
        if (!ok) return;

        // Apaga jogos (match_events caem por CASCADE)
        const { error: delMatchesErr } = await supabase
          .from("matches")
          .delete()
          .eq("sport_id", sportId);
        if (delMatchesErr) {
          alert("Erro ao apagar jogos existentes: " + delMatchesErr.message);
          return;
        }

        // Apaga standings
        const { error: delStdErr } = await supabase
          .from("standings")
          .delete()
          .eq("sport_id", sportId);
        if (delStdErr) {
          alert("Erro ao apagar classificação: " + delStdErr.message);
          return;
        }
      }

      // 3) Zera qualquer group_name (FIFA não usa grupos)
      await supabase.from("teams").update({ group_name: null }).eq("sport_id", sportId);

      // 4) Insere oitavas conforme o bracket
      const rows = bracket.map((m, i) => ({
        sport_id: sportId,
        stage: "oitavas",
        round: i + 1, // 1..16
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

      // 5) Garante standings zeradas (não usadas no FIFA, mas idempotente)
      await supabase.rpc("seed_initial_standings", { p_sport_name: "FIFA", p_reset: true });

      // 6) Pré-cria slots de quartas/semis/final (a função só preenche quando puder)
      const { error: koErr } = await supabase.rpc("maybe_create_knockout", {
        p_sport_name: "FIFA",
      });
      if (koErr) {
        alert("Aviso: não consegui preparar as fases seguintes agora, mas os jogos de oitavas foram criados.");
      }

      alert("Chaveamento criado com sucesso!");
      navigate("/admin");
    } catch (err) {
      alert("Erro ao salvar: " + (err?.message || String(err)));
    }
  };

  if (loading) return <p>Carregando times...</p>;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Configuração do Campeonato de FIFA</h2>
      <p className="text-sm text-gray-600">
        Selecione um time e clique no slot A/B do jogo para alocar. Repita até preencher os 16 jogos.
      </p>

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
                    selected.has(t.id) ? "bg-primary text-white" : "bg-gray-50 hover:bg-gray-100"
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

        {/* Confrontos */}
        <div className="border rounded p-4 overflow-y-auto max-h-[32rem]">
          <h3 className="font-semibold mb-2">Confrontos (oitavas)</h3>
          <ul className="space-y-4">
            {bracket.map((m, idx) => {
              const home = teams.find((t) => t.id === m.home);
              const away = teams.find((t) => t.id === m.away);
              return (
                <li key={idx} className="flex flex-col gap-1 border rounded p-2 bg-gray-50">
                  <span className="text-xs font-semibold text-gray-600">Jogo {idx + 1}</span>
                  <div className="flex items-center justify-between gap-2">
                    {/* Slot A */}
                    <div className="flex items-center gap-2 flex-1">
                      {home ? (
                        <>
                          <TeamBadge team={home} />
                          <span className="truncate" title={home.name}>{home.name}</span>
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
                          <span className="truncate" title={away.name}>{away.name}</span>
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

      <div className="flex items-center justify-between gap-4">
        <div className="text-xs text-gray-600">
          {allFilled ? (
            <span className="text-green-700">Todos os {MATCH_COUNT} confrontos estão prontos!</span>
          ) : (
            <span>Restam {32 - assigned.size} times para alocar.</span>
          )}
        </div>

        <button
          onClick={confirmBracket}
          disabled={!allFilled}
          className={`px-6 py-3 rounded font-semibold transition ${
            allFilled ? "bg-primary text-white hover:bg-primary/90" : "bg-gray-200 text-gray-500 cursor-not-allowed"
          }`}
        >
          Confirmar chaveamento
        </button>
      </div>
    </div>
  );
}

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
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  const color = ((Math.abs(hash)) % 0xffffff).toString(16).padStart(6, "0");
  return `#${color}`;
}
