// src/pages/admin/VoleiTournament.jsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabaseClient";
import { useNavigate } from "react-router-dom";

const GROUP_KEYS = ["A", "B", "C"];
const TEAMS_PER_GROUP = 3;

export default function VoleiTournament() {
  const [teams, setTeams] = useState([]);
  const [groups, setGroups] = useState({ A: [], B: [], C: [] });
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);

  const [sportId, setSportId] = useState(null);
  const [standings, setStandings] = useState([]); // classificação
  const [koMatches, setKoMatches] = useState([]); // semi/final/3lugar

  const navigate = useNavigate();

  const TeamById = useMemo(() => {
    const idx = new Map();
    teams.forEach((t) => idx.set(t.id, t));
    return idx;
  }, [teams]);

  const loadAll = async () => {
    setLoading(true);

    // 1) Modalidade
    const { data: sport, error: sportErr } = await supabase
      .from("sports")
      .select("id")
      .eq("name", "Volei")
      .maybeSingle();

    if (sportErr || !sport?.id) {
      alert("Erro ao buscar a modalidade Vôlei.");
      setLoading(false);
      return;
    }
    setSportId(sport.id);

    // 2) Times
    const { data: tms, error: teamsErr } = await supabase
      .from("teams")
      .select("id,name,logo_url,color,group_name")
      .eq("sport_id", sport.id)
      .order("name");

    if (teamsErr) {
      alert("Erro ao carregar times de Vôlei.");
      setLoading(false);
      return;
    }
    setTeams(tms || []);

    const next = { A: [], B: [], C: [] };
    (tms || []).forEach((t) => {
      if (t.group_name && GROUP_KEYS.includes(t.group_name)) {
        next[t.group_name].push(t.id);
      }
    });
    setGroups(next);

    // 3) Standings
    const { data: std, error: stdErr } = await supabase
      .from("standings")
      .select("team_id,group_name,points,goal_difference,goals_for")
      .eq("sport_id", sport.id);

    if (stdErr) console.warn("Erro ao carregar standings do Vôlei:", stdErr.message);
    setStandings(std || []);

    // 4) Mata-mata
    const { data: ko, error: koErr } = await supabase
      .from("matches")
      .select(
        `
        id, stage, round, status,
        home_team_id, away_team_id,
        home:home_team_id ( id, name, logo_url, color ),
        away:away_team_id ( id, name, logo_url, color )
      `
      )
      .eq("sport_id", sport.id)
      .in("stage", ["semi", "final", "3lugar"]);

    if (koErr) {
      console.warn("Erro ao carregar partidas de mata-mata:", koErr.message);
      setKoMatches([]);
    } else {
      setKoMatches(ko || []);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadAll();
    // realtime p/ refletir preenchimento dos slots
    const ch = supabase
      .channel("volei-ko")
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, loadAll)
      .subscribe();
    return () => supabase.removeChannel(ch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ====== Seleção/Grupos (UI) ======
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

  // ====== Geração de jogos dos grupos ======
  const buildGroupMatches = (sportId) => {
    const rows = [];
    const venue = "Quadra Vôlei";
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
            round: idx + 1,
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

  const confirmGroups = async () => {
    if (!allGroupsValid) {
      alert("Complete todos os grupos antes de confirmar!");
      return;
    }
    try {
      if (!sportId) {
        alert("Modalidade Vôlei não encontrada.");
        return;
      }

      // zera e aplica
      const { error: clearErr } = await supabase
        .from("teams")
        .update({ group_name: null })
        .eq("sport_id", sportId);
      if (clearErr) {
        alert("Erro ao limpar grupos dos times.");
        return;
      }
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

      // standings iniciais + ranking
      await supabase.rpc("seed_initial_standings", { p_sport_name: "Volei", p_reset: true });
      await supabase.rpc("rebuild_standings", { p_sport_name: "Volei" });

      // cria jogos de grupos (se não existirem)
      const { count: existingMatchesCount } = await supabase
        .from("matches")
        .select("*", { count: "exact", head: true })
        .eq("sport_id", sportId)
        .eq("stage", "grupos");

      if (!existingMatchesCount || existingMatchesCount === 0) {
        const rows = buildGroupMatches(sportId);
        if (rows.length > 0) {
          const { error: insErr } = await supabase.from("matches").insert(rows);
          if (insErr) {
            alert("Erro ao gerar os jogos da fase de grupos.");
            return;
          }
        }
      }

      // slots semi/final/3º
      await supabase.rpc("maybe_create_knockout", { p_sport_name: "Volei" });

      alert("Grupos confirmados e jogos gerados!");
      navigate("/admin");
    } catch (err) {
      alert("Erro ao salvar: " + (err?.message || String(err)));
    }
  };

  // ====== Ordenação numérica (coerção) ======
  const N = (x) => (x == null ? 0 : Number(x));

  function compareRank(a, b) {
    const pa = N(a.points), pb = N(b.points);
    if (pb !== pa) return pb - pa; // desc
    const gda = N(a.goal_difference), gdb = N(b.goal_difference);
    if (gdb !== gda) return gdb - gda; // desc
    const gfa = N(a.goals_for), gfb = N(b.goals_for);
    if (gfb !== gfa) return gfb - gfa; // desc
    const ia = String(a.team_id ?? ""), ib = String(b.team_id ?? "");
    if (ia < ib) return -1;
    if (ia > ib) return 1;
    return 0;
  }

  // ====== Ranking por grupo com fallback ======
  const groupRanks = useMemo(() => {
    const byG = { A: [], B: [], C: [] };
    standings.forEach((r) => {
      if (GROUP_KEYS.includes(r.group_name)) byG[r.group_name].push(r);
    });
    // fallback quando standings do grupo estiverem vazias
    for (const g of GROUP_KEYS) {
      if (byG[g].length === 0 && groups[g]?.length) {
        byG[g] = groups[g].map((tid) => ({
          team_id: tid,
          group_name: g,
          points: 0,
          goal_difference: 0,
          goals_for: 0,
        }));
      }
      byG[g].sort(compareRank);
    }
    return byG;
  }, [standings, groups]);

  // ====== Projeção provisória das semis (3 campeões + melhor 2º) ======
  const provisionalSemis = useMemo(() => {
    const winners = GROUP_KEYS.map((g) => groupRanks[g]?.[0]).filter(Boolean);
    const seconds = GROUP_KEYS.map((g) => groupRanks[g]?.[1]).filter(Boolean);

    if (winners.length < 3 || seconds.length < 1) {
      return { pairs: [], ready: false };
    }

    const bestSecond = [...seconds].sort(compareRank)[0];
    const firstWinner = winners.find((w) => w.group_name !== bestSecond.group_name) || winners[0];
    const restWinners = winners.filter((w) => w.team_id !== firstWinner.team_id);

    const semi1 = {
      round: 1,
      home: TeamById.get(firstWinner.team_id) || null,
      away: TeamById.get(bestSecond.team_id) || null,
    };

    let semi2 = { round: 2, home: null, away: null };
    if (restWinners.length === 2) {
      semi2 = {
        round: 2,
        home: TeamById.get(restWinners[0].team_id) || null,
        away: TeamById.get(restWinners[1].team_id) || null,
      };
    }

    return { pairs: [semi1, semi2], ready: true };
  }, [groupRanks, TeamById]);

  // ====== Merge: usa servidor quando existir, preenche o resto com provisório ======
  const semisMerged = useMemo(() => {
    // map provisório por round
    const provByRound = new Map(provisionalSemis.pairs.map((p) => [p.round, p]));
    // semis do servidor por round
    const serverSemis = koMatches.filter((m) => m.stage === "semi");
    const rounds = [1, 2];
    const out = [];

    for (const r of rounds) {
      const sv = serverSemis.find((m) => m.round === r);
      const pv = provByRound.get(r);

      const hasServerHome = Boolean(sv?.home_team_id);
      const hasServerAway = Boolean(sv?.away_team_id);

      const home = hasServerHome
        ? (sv.home || TeamById.get(sv.home_team_id) || null)
        : pv?.home || null;

      const away = hasServerAway
        ? (sv.away || TeamById.get(sv.away_team_id) || null)
        : pv?.away || null;

      const definitive = hasServerHome && hasServerAway;
      out.push({ round: r, home, away, definitive });
    }
    return out;
  }, [koMatches, provisionalSemis, TeamById]);

  // ====== Final e 3º lugar (definitivos quando vierem do servidor) ======
  const finalsFromServer = useMemo(() => {
    const f = koMatches.find((m) => m.stage === "final");
    const t3 = koMatches.find((m) => m.stage === "3lugar");
    return {
      final: f && f.home_team_id && f.away_team_id
        ? {
            home: f.home || TeamById.get(f.home_team_id) || null,
            away: f.away || TeamById.get(f.away_team_id) || null,
          }
        : null,
      third: t3 && t3.home_team_id && t3.away_team_id
        ? {
            home: t3.home || TeamById.get(t3.home_team_id) || null,
            away: t3.away || TeamById.get(t3.away_team_id) || null,
          }
        : null,
    };
  }, [koMatches, TeamById]);

  // utilitário: recalcular standings
  const refreshStandings = async () => {
    if (!sportId) return;
    await supabase.rpc("rebuild_standings", { p_sport_name: "Volei" });
    // opcional: garantir slots/atualizações pós-rebuild
    await supabase.rpc("maybe_create_knockout", { p_sport_name: "Volei" });
    await loadAll();
  };

  if (loading) return <p>Carregando times...</p>;

  return (
    <div className="space-y-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Configuração do Campeonato de Vôlei</h2>
          <p className="text-sm text-gray-600">
            Organize os 9 times em 3 grupos de 3. O chaveamento mostra a projeção{" "}
            <em>provisória</em> pela classificação e vira <em>definitivo</em> quando o servidor
            preencher os slots.
          </p>
        </div>
        <button
          onClick={refreshStandings}
          className="text-xs px-3 py-1 rounded border hover:bg-gray-50"
          title="Forçar atualização da classificação"
        >
          Atualizar classificação
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

        {/* A/B/C */}
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
          {GROUP_KEYS.map((g) => `${g}(${groups[g].length}/${TEAMS_PER_GROUP})`).join(", ")}
        </div>

        <button
          onClick={confirmGroups}
          disabled={!GROUP_KEYS.every((g) => groups[g].length === TEAMS_PER_GROUP)}
          className={`px-6 py-2 rounded font-semibold transition ${
            GROUP_KEYS.every((g) => groups[g].length === TEAMS_PER_GROUP)
              ? "bg-primary text-white hover:bg-primary/90"
              : "bg-gray-200 text-gray-500 cursor-not-allowed"
          }`}
        >
          Confirmar grupos e gerar jogos
        </button>
      </div>

      {/* Chaveamento */}
      <section className="space-y-4">
        <h3 className="font-semibold text-lg">Chaveamento</h3>

        {/* Semifinais (merge servidor + provisório) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {semisMerged.map((p) => (
            <div key={p.round} className="border rounded p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Semifinal {p.round}</span>
                <span
                  className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded ${
                    p.definitive ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                  }`}
                >
                  {p.definitive ? "Definitivo" : "Provisório"}
                </span>
              </div>

              <BracketRow team={p.home} placeholder="A definir" />
              <div className="my-1 text-center text-[10px] text-gray-400">vs</div>
              <BracketRow team={p.away} placeholder="A definir" />
            </div>
          ))}

          {semisMerged.every((s) => !s.home && !s.away) && (
            <div className="md:col-span-2 text-xs text-gray-500">
              Semifinais ainda não calculáveis. Complete os grupos e/ou atualize a classificação.
            </div>
          )}
        </div>

        {/* Final e 3º lugar */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border rounded p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Final</span>
              <span
                className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded ${
                  finalsFromServer.final ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                }`}
              >
                {finalsFromServer.final ? "Definitivo" : "A aguardar semis"}
              </span>
            </div>
            <BracketRow team={finalsFromServer.final?.home} placeholder="Vencedor Semi 1" />
            <div className="my-1 text-center text-[10px] text-gray-400">vs</div>
            <BracketRow team={finalsFromServer.final?.away} placeholder="Vencedor Semi 2" />
          </div>

          <div className="border rounded p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">3º Lugar</span>
              <span
                className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded ${
                  finalsFromServer.third ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                }`}
              >
                {finalsFromServer.third ? "Definitivo" : "A aguardar semis"}
              </span>
            </div>
            <BracketRow team={finalsFromServer.third?.home} placeholder="Perdedor Semi 1" />
            <div className="my-1 text-center text-[10px] text-gray-400">vs</div>
            <BracketRow team={finalsFromServer.third?.away} placeholder="Perdedor Semi 2" />
          </div>
        </div>
      </section>
    </div>
  );
}

/* ======= Componentes auxiliares ======= */

function BracketRow({ team, placeholder }) {
  return (
    <div className="flex items-center gap-2">
      <TeamBadge team={team} />
      <span className="text-sm">{team?.name || <span className="text-gray-400">{placeholder}</span>}</span>
    </div>
  );
}

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
