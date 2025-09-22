// src/pages/admin/Tournaments.jsx
import React, { useEffect, useState } from "react";
import { supabase } from "../../supabaseClient";
import { useNavigate } from "react-router-dom";

const RULES = {
  pebolim: { name: "Pebolim", required: 24, path: "/admin/campeonatos/pebolim" },
  fifa: { name: "FIFA", required: 32, path: "/admin/campeonatos/fifa" },
  futsal: { name: "Futsal", required: 9, path: "/admin/campeonatos/futsal" },
  volei: { name: "Vôlei", required: 9, path: "/admin/campeonatos/volei" },
};

// Map para casar nomes da tabela com as chaves locais
const NAME_TO_KEY = {
  Pebolim: "pebolim",
  FIFA: "fifa",     // <- aqui estava o bug
  Futsal: "futsal",
  Volei: "volei",
  "Vôlei": "volei",
};
// helper para cair sempre na mesma chave
const toKey = (s = "") =>
  s.trim() // <-- 👈 importante!
   .normalize("NFD")
   .replace(/\p{Diacritic}/gu, "")
   .toLowerCase();


export default function AdminTournaments() {
  const [loading, setLoading] = useState(true);
  const [teamCounts, setTeamCounts] = useState({});
  const [tourneyExists, setTourneyExists] = useState({});
  const [confirm, setConfirm] = useState(null); // { key, name, path }
  const [resetting, setResetting] = useState(false);
  const [flash, setFlash] = useState(null);
  const navigate = useNavigate();

  const loadData = async () => {
    setLoading(true);

    const { data: sports, error: sportsErr } = await supabase
      .from("sports")
      .select("id,name");

    if (sportsErr || !sports) {
      setTeamCounts({});
      setTourneyExists({});
      setLoading(false);
      return;
    }

    const counts = {};
    const exists = {};

    // Faz consultas em paralelo por esporte
    await Promise.all(
      sports.map(async (sport) => {
        const nameTrim = (sport.name ?? "").trim();
        const key = NAME_TO_KEY[nameTrim] || toKey(nameTrim); // <-- 👈 usa trimmed
  
        const { count: teamCount } = await supabase
          .from("teams")
          .select("*", { count: "exact", head: true })
          .eq("sport_id", sport.id);
  
        counts[key] = teamCount || 0;
  
        const [mRes, sRes, gRes] = await Promise.all([
          supabase.from("matches").select("*", { count: "exact", head: true }).eq("sport_id", sport.id),
          supabase.from("standings").select("*", { count: "exact", head: true }).eq("sport_id", sport.id),
          supabase.from("teams").select("*", { count: "exact", head: true }).eq("sport_id", sport.id).not("group_name", "is", null),
        ]);
  
        exists[key] = (mRes?.count || 0) + (sRes?.count || 0) + (gRes?.count || 0) > 0;
      })
    );

    setTeamCounts(counts);
    setTourneyExists(exists);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const openConfirm = (key) => {
    const { name, path } = RULES[key];
    setConfirm({ key, name, path });
  };

  // Limpa campeonato existente (matches, match_events, standings, grupos dos times)
  const resetTournament = async (key) => {
    try {
      setResetting(true);

      const keyToDbName = {
        fifa: "FIFA",
        futsal: "Futsal",
        volei: "Volei", // no DB sem acento
        pebolim: "Pebolim",
      };
      const sportName = keyToDbName[key] ?? key;

      // 1) Descobre o id do esporte
      const { data: sport, error: sportErr } = await supabase
        .from("sports")
        .select("id,name")
        .eq("name", sportName)
        .maybeSingle();

      if (sportErr || !sport?.id) throw new Error("Esporte não encontrado.");

      // 2) Busca todos os matches para excluir eventos primeiro
      const { data: matches, error: matchesErr } = await supabase
        .from("matches")
        .select("id")
        .eq("sport_id", sport.id);

      if (matchesErr) throw new Error("Erro ao buscar partidas.");

      const matchIds = (matches || []).map((m) => m.id);

      if (matchIds.length > 0) {
        const { error: evErr } = await supabase
          .from("match_events")
          .delete()
          .in("match_id", matchIds);
        if (evErr) throw new Error("Erro ao apagar eventos das partidas.");
      }

      // 3) Apaga partidas
      const { error: delMatchesErr } = await supabase
        .from("matches")
        .delete()
        .eq("sport_id", sport.id);
      if (delMatchesErr) throw new Error("Erro ao apagar partidas.");

      // 4) Apaga standings
      const { error: delStandErr } = await supabase
        .from("standings")
        .delete()
        .eq("sport_id", sport.id);
      if (delStandErr) throw new Error("Erro ao apagar classificação.");

      // 5) Limpa grupos dos times
      const { error: updTeamsErr } = await supabase
        .from("teams")
        .update({ group_name: null })
        .eq("sport_id", sport.id);
      if (updTeamsErr) throw new Error("Erro ao limpar grupos dos times.");

      setFlash(`Campeonato de ${RULES[key].name} foi reiniciado com sucesso.`);
      setConfirm(null);
      await loadData();
      // Opcional: navegar para a página de setup após limpar
      navigate(RULES[key].path);
    } catch (e) {
      setFlash(`Falha ao reiniciar: ${e.message || e}`);
    } finally {
      setResetting(false);
      // some o alerta depois de alguns segundos
      setTimeout(() => setFlash(null), 5000);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Gerenciar Campeonatos</h2>
      <p className="text-sm text-gray-600">
        Escolha a modalidade para configurar os grupos, fases e tabelas.
      </p>

      {flash && (
        <div className="rounded-md border border-green-300 bg-green-50 text-green-800 px-3 py-2 text-sm">
          {flash}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-lg border p-4">
              <div className="h-10 bg-gray-100 rounded animate-pulse" />
              <div className="mt-3 h-4 w-2/3 bg-gray-100 rounded animate-pulse" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {Object.entries(RULES).map(([key, { name, required, path }]) => {
            const current = teamCounts[key] || 0;
            const valid = current === required;
            const exists = !!tourneyExists[key];

            let message = `${name} pronto para iniciar!`;
            if (!valid) {
              const diff = current - required;
              if (diff < 0) {
                message = `${name} precisa de ${required} times, mas tem ${current} (${Math.abs(
                  diff
                )} a menos).`;
              } else {
                message = `${name} precisa de ${required} times, mas tem ${current} (${diff} a mais).`;
              }
            }

            const handlePrimary = () => {
              if (!valid) return;
              if (exists) {
                // Existe campeonato → confirmar antes de criar um novo (reiniciar)
                openConfirm(key);
              } else {
                navigate(path);
              }
            };

            return (
              <div key={key} className="relative rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">{name}</div>
                  {exists && (
                    <span className="text-[11px] rounded-full bg-amber-100 text-amber-700 px-2 py-0.5">
                      Já existe um campeonato
                    </span>
                  )}
                </div>

                <div className="mt-2 text-xs text-gray-600">
                  {exists ? (
                    <>
                      Detectamos dados de campeonato para <strong>{name}</strong>. Se você criar um novo,
                      <span className="font-medium"> apagaremos as partidas, grupos e classificação atuais</span>.
                    </>
                  ) : (
                    message
                  )}
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <button
                    disabled={!valid}
                    onClick={handlePrimary}
                    className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                      valid
                        ? "bg-primary text-white hover:bg-primary/90"
                        : "bg-gray-100 text-gray-400 border border-gray-300 cursor-not-allowed"
                    }`}
                  >
                    {exists ? "Criar novo (vai apagar o atual)" : name}
                  </button>

                  {exists && (
                    <button
                      type="button"
                      onClick={() => openConfirm(key)}
                      disabled={!valid}
                      className={`rounded-lg px-4 py-2 text-sm font-semibold transition border ${
                        valid
                          ? "border-red-300 text-red-700 hover:bg-red-50"
                          : "border-gray-300 text-gray-400 cursor-not-allowed"
                      }`}
                      title={
                        valid
                          ? "Apagar campeonato atual e iniciar um novo"
                          : "Ajuste a quantidade de times antes de reiniciar/criar"
                      }
                    >
                      Apagar & criar novo
                    </button>
                  )}
                </div>

                {!valid && (
                  <div className="mt-2 text-[11px] text-gray-500">
                    {message}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de confirmação */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirm(null)} />
          <div className="relative z-10 w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold">Reiniciar {confirm.name}?</h3>
            <p className="mt-2 text-sm text-gray-600">
              Já existe um campeonato de <strong>{confirm.name}</strong>. Se você continuar,
              <span className="font-medium"> todas as partidas, eventos, grupos e a classificação serão apagados</span>.
              Esta ação não pode ser desfeita.
            </p>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={() => setConfirm(null)}
                className="rounded-lg border px-4 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={() => resetTournament(confirm.key)}
                disabled={resetting}
                className={`rounded-lg px-4 py-2 text-sm font-semibold text-white ${
                  resetting ? "bg-red-300" : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {resetting ? "Apagando..." : "Apagar e criar novo"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
