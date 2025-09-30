// src/lib/standingsRpc.js
import { supabase } from "../supabaseClient";

// Garante linhas 0-0-0 para todos os times do esporte.
// p_reset=false -> não apaga; só cria o que falta.
export async function ensureInitialStandings(sportName, { reset = false } = {}) {
  try {
    await supabase.rpc("seed_initial_standings", {
      p_sport_name: sportName,
      p_reset: reset,
    });
  } catch (err) {
    console.warn("seed_initial_standings:", err?.message || err);
  }
}

// Recalcula pontuação/saldo a partir das partidas
export async function recalculateStandings(sportName) {
  try {
    await supabase.rpc("recalculate_standings", { p_sport_name: sportName });
  } catch (err) {
    console.error("recalculate_standings:", err?.message || err);
  }
}
