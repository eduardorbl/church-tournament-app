// supabase-js não lança exceção quando o banco recusa (RLS, constraint etc.):
// ele devolve { error }. Use must() em escritas para que a falha interrompa o fluxo
// e apareça na tela, em vez de mostrar "sucesso" com o estado pela metade.
export async function must(promise, label = "Operação") {
  const res = await promise;
  if (res?.error) {
    const msg = res.error.message || String(res.error);
    throw new Error(`${label}: ${msg}`);
  }
  return res;
}
