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
  FIFA: "fifa",
  Futsal: "futsal",
  Volei: "volei",
  "Vôlei": "volei",
};

// helper para cair sempre na mesma chave
const toKey = (s = "") =>
  s.trim()
   .normalize("NFD")
   .replace(/\p{Diacritic}/gu, "")
   .toLowerCase();

export default function AdminTournaments() {
  const [loading, setLoading] = useState(true);
  const [teamCounts, setTeamCounts] = useState({});
  const [tourneyExists, setTourneyExists] = useState({});
  const [confirm, setConfirm] = useState(null);
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

    await Promise.all(
      sports.map(async (sport) => {
        const nameTrim = (sport.name ?? "").trim();
        const key = NAME_TO_KEY[nameTrim] || toKey(nameTrim);
  
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

  const resetTournament = async (key) => {
    try {
      setResetting(true);

      const keyToDbName = {
        fifa: "FIFA",
        futsal: "Futsal",
        volei: "Volei",
        pebolim: "Pebolim",
      };
      const sportName = keyToDbName[key] ?? key;

      const { data: sport, error: sportErr } = await supabase
        .from("sports")
        .select("id,name")
        .eq("name", sportName)
        .maybeSingle();

      if (sportErr || !sport?.id) throw new Error("Esporte não encontrado.");

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

      const { error: delMatchesErr } = await supabase
        .from("matches")
        .delete()
        .eq("sport_id", sport.id);
      if (delMatchesErr) throw new Error("Erro ao apagar partidas.");

      const { error: delStandErr } = await supabase
        .from("standings")
        .delete()
        .eq("sport_id", sport.id);
      if (delStandErr) throw new Error("Erro ao apagar classificação.");

      const { error: updTeamsErr } = await supabase
        .from("teams")
        .update({ group_name: null })
        .eq("sport_id", sport.id);
      if (updTeamsErr) throw new Error("Erro ao limpar grupos dos times.");

      setFlash(`Campeonato de ${RULES[key].name} foi reiniciado com sucesso.`);
      setConfirm(null);
      await loadData();
      navigate(RULES[key].path);
    } catch (e) {
      setFlash(`Falha ao reiniciar: ${e.message || e}`);
    } finally {
      setResetting(false);
      setTimeout(() => setFlash(null), 5000);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">Gerenciar Campeonatos</h2>
        <p className="text-sm text-gray-600 mt-1">
          Escolha a modalidade para configurar os grupos, fases e tabelas.
        </p>
      </div>

      {flash && (
        <div className="rounded-md border border-green-300 bg-green-50 text-green-800 px-3 py-2 text-sm">
          {flash}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-lg border p-4">
              <div className="h-10 bg-gray-100 rounded animate-pulse" />
              <div className="mt-3 h-4 w-2/3 bg-gray-100 rounded animate-pulse" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.entries(RULES).map(([key, { name, required, path }]) => {
            const current = teamCounts[key] || 0;
            const valid = current === required;
            const exists = !!tourneyExists[key];

            let message = `${name} pronto para iniciar!`;
            if (!valid) {
              const diff = current - required;
              if (diff < 0) {
                message = `Precisa de ${required} times, tem ${current} (faltam ${Math.abs(diff)}).`;
              } else {
                message = `Precisa de ${required} times, tem ${current} (${diff} a mais).`;
              }
            }

            const handlePrimary = () => {
              if (!valid) return;
              if (exists) {
                openConfirm(key);
              } else {
                navigate(path);
              }
            };

            return (
              <div key={key} className="rounded-lg border p-4 space-y-3">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-lg">{name}</h3>
                  {exists && (
                    <span className="text-xs rounded-full bg-amber-100 text-amber-700 px-2 py-1 whitespace-nowrap">
                      Existe
                    </span>
                  )}
                </div>

                {/* Status message */}
                <div className="text-sm text-gray-600">
                  {exists ? (
                    <>
                      Já existe um campeonato de <strong>{name}</strong>. 
                      <span className="block mt-1 font-medium text-amber-700">
                        Criar novo irá apagar os dados atuais.
                      </span>
                    </>
                  ) : (
                    message
                  )}
                </div>

                {/* Buttons */}
                <div className="space-y-2">
                  <button
                    disabled={!valid}
                    onClick={handlePrimary}
                    className={`w-full rounded-lg px-4 py-3 text-sm font-semibold transition ${
                      valid
                        ? "bg-primary text-white hover:bg-primary/90"
                        : "bg-gray-100 text-gray-400 border border-gray-300 cursor-not-allowed"
                    }`}
                  >
                    {exists ? "Criar Novo Campeonato" : `Configurar ${name}`}
                  </button>

                  {exists && valid && (
                    <button
                      type="button"
                      onClick={() => openConfirm(key)}
                      className="w-full rounded-lg px-4 py-2 text-sm font-medium text-red-700 border border-red-300 hover:bg-red-50 transition"
                    >
                      Apagar & Reiniciar
                    </button>
                  )}
                </div>

                {/* Warning message for invalid state */}
                {!valid && (
                  <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
                    <strong>Atenção:</strong> {message}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de confirmação */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirm(null)} />
          <div className="relative z-10 w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold">Reiniciar {confirm.name}?</h3>
            <p className="mt-2 text-sm text-gray-600">
              Já existe um campeonato de <strong>{confirm.name}</strong>. Se você continuar,
              <span className="font-medium"> todas as partidas, eventos, grupos e a classificação serão apagados</span>.
              Esta ação não pode ser desfeita.
            </p>

            <div className="mt-6 flex flex-col sm:flex-row gap-2">
              <button
                onClick={() => setConfirm(null)}
                className="flex-1 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50 transition"
              >
                Cancelar
              </button>
              <button
                onClick={() => resetTournament(confirm.key)}
                disabled={resetting}
                className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold text-white transition ${
                  resetting ? "bg-red-300" : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {resetting ? "Apagando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}