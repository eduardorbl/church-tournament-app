// src/pages/admin/Rosters.jsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabaseClient";

const BUCKET = "team-logos";
const MAX_SIZE_MB = 5;
const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];

// Fases de mata-mata para detectar chaveamento
const KO_STAGES = ["oitavas", "quartas", "semi", "final", "3lugar"];

export default function AdminRosters() {
  const [sports, setSports] = useState([]);
  const [sportNameById, setSportNameById] = useState({});
  const [teams, setTeams] = useState([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", sport_id: "" });
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [players, setPlayers] = useState([]);
  const [logoVersion, setLogoVersion] = useState(0);
  const [selectedSports, setSelectedSports] = useState([]); // ids de esportes selecionados

  // extras
  const [playerCountByTeam, setPlayerCountByTeam] = useState({});
  const [koConfiguredBySport, setKoConfiguredBySport] = useState({});

  // ------- loaders -----------------------------------------------------------
  const loadSports = async () => {
    const { data } = await supabase.from("sports").select("id,name").order("name");
    setSports(data || []);
    const map = {};
    (data || []).forEach((s) => (map[s.id] = s.name));
    setSportNameById(map);

    // seleção inicial: nada marcado => significa "Todos"
    if (!form.sport_id && data?.length) {
      setForm((f) => ({ ...f, sport_id: data[0].id }));
    }
  };

  const loadTeams = async () => {
    // Se nenhum esporte estiver selecionado => mostra todos
    let query = supabase
      .from("teams")
      .select("id,name,group_name,sport_id,logo_url")
      .order("name");

    if (selectedSports.length > 0) {
      query = query.in("sport_id", selectedSports);
    }

    const { data } = await query;
    setTeams(data || []);

    // Depois de carregar times, carrega contagem de jogadores e status de KO
    const teamIds = (data || []).map((t) => t.id);
    if (teamIds.length) {
      await Promise.all([loadPlayerCounts(teamIds), loadKoStatusForSports(data)]);
    } else {
      setPlayerCountByTeam({});
      setKoConfiguredBySport({});
    }
  };

  const loadPlayerCounts = async (teamIds) => {
    if (!teamIds?.length) return;
    const { data: rows } = await supabase
      .from("players")
      .select("id, team_id")
      .in("team_id", teamIds);

    const countMap = {};
    (rows || []).forEach((r) => {
      countMap[r.team_id] = (countMap[r.team_id] || 0) + 1;
    });

    // Preenche zero para quem não veio
    teamIds.forEach((tid) => {
      if (!(tid in countMap)) countMap[tid] = 0;
    });

    setPlayerCountByTeam(countMap);
  };

  const loadKoStatusForSports = async (teamsList) => {
    const sportIds = Array.from(new Set((teamsList || []).map((t) => t.sport_id)));
    if (sportIds.length === 0) {
      setKoConfiguredBySport({});
      return;
    }

    const { data: matchesRows } = await supabase
      .from("matches")
      .select("sport_id, stage, home_team_id, away_team_id")
      .in("sport_id", sportIds)
      .in("stage", KO_STAGES);

    const map = {};
    (matchesRows || []).forEach((m) => {
      const ok = m.home_team_id && m.away_team_id;
      if (ok) map[m.sport_id] = true;
    });

    // Preenche false para os que não apareceram
    sportIds.forEach((sid) => {
      if (!(sid in map)) map[sid] = false;
    });

    setKoConfiguredBySport(map);
  };

  const loadPlayers = async (teamId) => {
    const { data } = await supabase
      .from("players")
      .select("id,name,number")
      .eq("team_id", teamId)
      .order("name");
    setPlayers(data || []);

    // atualiza contador localmente
    setPlayerCountByTeam((prev) => ({ ...prev, [teamId]: (data || []).length }));
  };

  useEffect(() => {
    loadSports();
  }, []);

  useEffect(() => {
    loadTeams();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSports]);

  // ------- helpers -----------------------------------------------------------
  const publicUrlFor = (path) => {
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return data?.publicUrl || "";
  };

  const extractPathFromPublicUrl = (url) => {
    if (!url) return null;
    const idx = url.indexOf(`/storage/v1/object/public/${BUCKET}/`);
    if (idx === -1) return null;
    return url.substring(idx + `/storage/v1/object/public/${BUCKET}/`.length);
  };

  // ------- CRUD Time ---------------------------------------------------------
  const createTeam = async (e) => {
    e.preventDefault();
    if (!form.name || !form.sport_id) return;
    setBusy(true);
    const { error } = await supabase.from("teams").insert({
      name: form.name.trim(),
      sport_id: form.sport_id,
    });
    setBusy(false);
    if (error) {
      alert("Erro ao criar time: " + error.message);
    } else {
      setForm({ name: "", sport_id: form.sport_id });
      loadTeams();
    }
  };

  const removeTeam = async (team) => {
    const confirmed = confirm(
      `⚠️ Atenção!\n\nSe você remover o time "${team.name}", TODO o campeonato da modalidade será resetado e o histórico de jogos será apagado.\n\nDeseja realmente continuar?`
    );
    if (!confirmed) return;

    setBusy(true);
    try {
      const path = extractPathFromPublicUrl(team.logo_url);
      if (path) {
        await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
      }

      const { error: resetErr } = await supabase.rpc("reset_sport", {
        p_sport_id: team.sport_id,
      });
      if (resetErr) throw resetErr;

      const { error } = await supabase.from("teams").delete().eq("id", team.id);
      if (error) throw error;

      if (selectedTeam?.id === team.id) {
        setSelectedTeam(null);
        setPlayers([]);
      }
      await loadTeams();

      alert(
        `Time "${team.name}" removido.\n\nO campeonato da modalidade foi resetado. Configure novamente os grupos e partidas antes de prosseguir.`
      );
    } catch (err) {
      alert("Erro ao remover: " + err.message);
    } finally {
      setBusy(false);
    }
  };

  // ------- CRUD Jogadores ----------------------------------------------------
  const addPlayer = async (name) => {
    if (!selectedTeam?.id || !name) return;
    setBusy(true);
    const { error } = await supabase.from("players").insert({
      team_id: selectedTeam.id,
      name: name.trim(),
    });
    setBusy(false);
    if (error) alert("Erro ao adicionar jogador: " + error.message);
    else loadPlayers(selectedTeam.id);
  };

  const removePlayer = async (playerId) => {
    if (!selectedTeam?.id) return;
    setBusy(true);
    const { error } = await supabase.from("players").delete().eq("id", playerId);
    setBusy(false);
    if (error) alert("Erro ao remover jogador: " + error.message);
    else loadPlayers(selectedTeam.id);
  };

  // ------- Upload de logo ----------------------------------------------------
  const handleUploadLogo = async (team, file) => {
    if (!team?.id || !file) return;
    if (!ACCEPTED.includes(file.type)) {
      alert("Formato inválido. Use PNG, JPG ou WEBP.");
      return;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      alert(`Arquivo grande demais. Máximo ${MAX_SIZE_MB} MB.`);
      return;
    }

    setBusy(true);
    try {
      const ext =
        file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const path = `teams/${team.id}.${ext}`;

      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        upsert: true,
        cacheControl: "3600",
        contentType: file.type,
      });
      if (upErr) throw upErr;

      const publicUrl = publicUrlFor(path);
      const { error: upTeam } = await supabase
        .from("teams")
        .update({ logo_url: publicUrl })
        .eq("id", team.id);
      if (upTeam) throw upTeam;

      await loadTeams();
      if (selectedTeam?.id === team.id) {
        const updated = (
          await supabase.from("teams").select("id,name,logo_url").eq("id", team.id).maybeSingle()
        ).data;
        if (updated) setSelectedTeam((t) => ({ ...t, ...updated }));
      }
      setLogoVersion((v) => v + 1);
    } catch (e) {
      alert("Erro ao enviar logo: " + e.message);
    } finally {
      setBusy(false);
    }
  };

  // ------- UI ---------------------------------------------------------------
  const allSelected = selectedSports.length === 0 || selectedSports.length === sports.length;

  const toggleAllSports = () => {
    setSelectedSports((prev) => (allSelected ? [] : sports.map((s) => s.id)));
  };

  const sportChips = (
    <div className="flex flex-wrap gap-2 mb-4">
      <button
        onClick={toggleAllSports}
        className={`px-3 py-1 rounded border ${
          allSelected
            ? "bg-gray-800 text-white border-gray-800"
            : "bg-white text-gray-700 border-gray-300 hover:bg-gray-100"
        }`}
      >
        Todos
      </button>
      {sports.map((s) => {
        const active =
          selectedSports.length === 0 ? true : selectedSports.includes(s.id);
        return (
          <button
            key={s.id}
            onClick={() =>
              setSelectedSports((prev) => {
                // se estava vazio (Todos), começa uma seleção nova só com este
                if (prev.length === 0) return [s.id];
                return prev.includes(s.id)
                  ? prev.filter((id) => id !== s.id)
                  : [...prev, s.id];
              })
            }
            className={`px-3 py-1 rounded border ${
              active
                ? "bg-gray-800 text-white border-gray-800"
                : "bg-white text-gray-700 border-gray-300 hover:bg-gray-100"
            }`}
          >
            {s.name}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="grid gap-8 md:grid-cols-2">
      {/* Coluna: criar time */}
      <section>
        <h2 className="text-xl font-bold mb-4">Elencos</h2>

        {/* Filtro de modalidades */}
        {sportChips}

        <form onSubmit={createTeam} className="rounded-lg border p-4 space-y-3">
          <h3 className="font-semibold">Novo time</h3>
          <div className="grid gap-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Nome do time</label>
              <input
                className="w-full border rounded px-3 py-2"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ex.: A1 — Águias"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Esporte</label>
              <select
                className="w-full border rounded px-3 py-2"
                value={form.sport_id}
                onChange={(e) => setForm((f) => ({ ...f, sport_id: e.target.value }))}
              >
                {sports.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="mt-2 inline-flex items-center gap-2 bg-primary text-white px-4 py-2 rounded disabled:opacity-50"
          >
            {busy ? "Salvando…" : "Criar time"}
          </button>
        </form>

        {/* Lista de times */}
        <div className="mt-6">
          <h3 className="font-semibold mb-2">Times cadastrados</h3>
          <ul className="divide-y border rounded">
            {teams.map((t) => {
              const sportName = sportNameById[t.sport_id] || "—";
              const playersCount = playerCountByTeam[t.id] ?? 0;
              const hasRoster = playersCount > 0;
              const koConfigured = !!koConfiguredBySport[t.sport_id];

              // Linha auxiliar “meta”:
              // - esportes com grupo: mostra grupo se houver
              // - esportes sem grupo (ex.: FIFA): “Sem grupo (não aplicável)”
              // - chaveamento: badge se configurado
              const groupPart = t.group_name
                ? `Grupo ${t.group_name}`
                : koConfigured
                ? "Sem grupo (não aplicável)"
                : "Sem grupo";

              return (
                <li key={t.id} className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <LogoImg src={t.logo_url} alt={t.name} size={32} version={logoVersion} />
                    <div>
                      <div className="font-medium">{t.name}</div>
                      <div className="text-xs text-gray-500 flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-1">
                          <span className="px-1.5 py-0.5 rounded bg-gray-100 border text-gray-700">
                            {sportName}
                          </span>
                        </span>
                        <span>• {groupPart}</span>
                        {koConfigured && (
                          <span className="px-1.5 py-0.5 rounded bg-green-100 text-green-700">
                            Chaveamento configurado
                          </span>
                        )}
                        <span>• Elenco:{" "}
                          <strong className={hasRoster ? "text-gray-900" : "text-red-600"}>
                            {playersCount} {playersCount === 1 ? "jogador" : "jogadores"}
                          </strong>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="text-sm px-3 py-1 rounded border hover:bg-gray-50 cursor-pointer">
                      Trocar logo
                      <input
                        type="file"
                        accept={ACCEPTED.join(",")}
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleUploadLogo(t, file);
                          e.target.value = "";
                        }}
                        disabled={busy}
                      />
                    </label>
                    <button
                      className="text-sm px-3 py-1 rounded border hover:bg-gray-50"
                      onClick={() => {
                        setSelectedTeam(t);
                        loadPlayers(t.id);
                      }}
                    >
                      Gerenciar elenco
                    </button>
                    <button
                      className="text-sm px-3 py-1 rounded border text-red-600 hover:bg-red-50"
                      onClick={() => removeTeam(t)}
                      disabled={busy}
                    >
                      Remover
                    </button>
                  </div>
                </li>
              );
            })}
            {teams.length === 0 && (
              <li className="p-3 text-sm text-gray-500">Nenhum time cadastrado.</li>
            )}
          </ul>
        </div>
      </section>

      {/* Coluna: elenco do time selecionado */}
      <section>
        <h2 className="text-xl font-bold mb-4">Elenco do time</h2>

        {!selectedTeam && (
          <p className="text-sm text-gray-500">Selecione um time para gerenciar seu elenco.</p>
        )}

        {selectedTeam && (
          <div className="rounded-lg border p-4 space-y-4">
            <div className="flex items-center gap-3">
              <LogoImg
                src={selectedTeam.logo_url}
                alt={selectedTeam.name}
                size={40}
                version={logoVersion}
              />
              <div className="font-semibold">{selectedTeam.name}</div>

              <div className="ml-auto">
                <label className="text-xs px-3 py-1 rounded border hover:bg-gray-50 cursor-pointer">
                  Atualizar logo
                  <input
                    type="file"
                    accept={ACCEPTED.join(",")}
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUploadLogo(selectedTeam, file);
                      e.target.value = "";
                    }}
                    disabled={busy}
                  />
                </label>
              </div>
            </div>

            <AddPlayerForm disabled={busy} onAdd={addPlayer} />

            <ul className="divide-y border rounded">
              {players.map((p) => (
                <li key={p.id} className="p-3 flex items-center justify-between">
                  <div>{p.name}</div>
                  <button
                    className="text-sm px-3 py-1 rounded border text-red-600 hover:bg-red-50"
                    onClick={() => removePlayer(p.id)}
                    disabled={busy}
                  >
                    Remover
                  </button>
                </li>
              ))}
              {players.length === 0 && (
                <li className="p-3 text-sm text-gray-500">Nenhum jogador no elenco.</li>
              )}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}

function AddPlayerForm({ disabled, onAdd }) {
  const [name, setName] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onAdd(name);
        setName("");
      }}
      className="flex items-center gap-2"
    >
      <input
        className="flex-1 border rounded px-3 py-2"
        placeholder="Nome do jogador"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <button
        type="submit"
        disabled={disabled}
        className="px-3 py-2 rounded bg-primary text-white disabled:opacity-50"
      >
        Adicionar
      </button>
    </form>
  );
}

// Helpers para avatar de iniciais
function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(" ");
  if (parts.length === 1) return parts[0][0]?.toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function stringToColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const color = ((hash >>> 0) % 0xffffff).toString(16).padStart(6, "0");
  return `#${color}`;
}

function LogoImg({ src, alt, size = 32, version = 0 }) {
  const [loaded, setLoaded] = useState(false);
  const showSrc = useMemo(() => {
    if (!src) return null;
    const sep = src.includes("?") ? "&" : "?";
    return `${src}${sep}v=${version}`;
  }, [src, version]);

  return (
    <div
      className="relative rounded overflow-hidden border bg-white flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      {showSrc ? (
        <img
          src={showSrc}
          alt={alt || "logo"}
          className={`w-full h-full object-cover ${
            loaded ? "opacity-100" : "opacity-0"
          } transition-opacity duration-200`}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(false)}
        />
      ) : null}
      {!showSrc || !loaded ? (
        <div
          className="absolute inset-0 flex items-center justify-center text-white font-bold uppercase"
          style={{
            backgroundColor: stringToColor(alt || "T"),
            fontSize: size * 0.4,
          }}
        >
          {getInitials(alt)}
        </div>
      ) : null}
    </div>
  );
}
