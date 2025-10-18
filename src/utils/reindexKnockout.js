// src/utils/reindexKnockout.js
import { supabase } from "../supabaseClient";

/**
 * Reindexa partidas e garante criação do mata-mata para um esporte específico.
 * A função é idempotente: pode ser chamada após qualquer geração de grupos.
 */
export async function reindexAndEnsureKO(sportName) {
  const { data: reIdx, error: reErr } = await supabase.rpc("admin_reindex_order_idx_for_sport", {
    p_sport_name: sportName,
  });
  if (reErr) {
    throw new Error(`Falha ao reindexar ${sportName}: ${reErr.message}`);
  }

  const { data: koRes, error: koErr } = await supabase.rpc("maybe_create_knockout", {
    p_sport_name: sportName,
  });
  if (koErr) {
    throw new Error(`Falha ao garantir KO de ${sportName}: ${koErr.message}`);
  }

  return { reindexed: reIdx ?? 0, koCreated: koRes ?? 0 };
}
