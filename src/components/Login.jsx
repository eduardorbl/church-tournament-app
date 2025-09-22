// src/components/Login.jsx
import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useNavigate, useSearchParams } from 'react-router-dom';

export default function Login() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();

  const redirectTo = sp.get('redirect') || '/admin';
  const reason = sp.get('reason'); // opcional: /login?reason=forbidden

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Mensagens
  const [notice, setNotice] = useState(null); // informativo (não é erro)
  const [error, setError] = useState(null);   // erro real

  // Utilitário: checa via RPC se o usuário logado é admin e age conforme
  const checkAdminAndProceed = async () => {
    const { data: isAdmin, error: adminErr } = await supabase.rpc('is_admin');
    if (adminErr) {
      // Erro inesperado no RPC
      setNotice(null);
      setError('Não foi possível validar seu acesso. Tente novamente.');
      return false;
    }
    if (!isAdmin) {
      // Logado mas sem permissão → sair para permitir trocar de conta
      await supabase.auth.signOut();
      setNotice(null);
      setError('A conta atual não possui acesso de administrador. Entre com uma conta de admin.');
      return false;
    }

    // OK, pode entrar
    navigate(redirectTo, { replace: true });
    return true;
  };

  // Ao abrir a tela:
  // - Se veio de rota protegida, mostra aviso (não é "erro").
  // - Se já há sessão: valida admin via RPC. Se não for admin, faz signOut e exibe mensagem.
  useEffect(() => {
    if (reason === 'forbidden') {
      setNotice('Faça login para acessar a página de administrador.');
    } else {
      setNotice(null);
    }

    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data?.session ?? null;
      if (!session?.user?.id) return; // sem sessão, segue fluxo normal

      await checkAdminAndProceed();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reason, redirectTo]);

  async function handleLogin(e) {
    e.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError(null);
    setNotice(null);

    const { data, error: signInErr } = await supabase.auth.signInWithPassword({ email, password });

    if (signInErr) {
      setError(signInErr.message || 'Não foi possível entrar. Verifique seus dados.');
      setSubmitting(false);
      return;
    }

    const userId = data?.user?.id;
    if (!userId) {
      setError('Falha ao obter o usuário autenticado.');
      setSubmitting(false);
      return;
    }

    // Valida permissão de admin via RPC
    const ok = await checkAdminAndProceed();
    if (!ok) {
      // checkAdminAndProceed já cuidou de mensagens/signOut
      setSubmitting(false);
      return;
    }

    // Se navegou, pronto. (navigate com replace evita voltar para o login no histórico)
    // Ainda assim, garantimos o estado:
    setSubmitting(false);
  }

  return (
    <div className="max-w-md mx-auto">
      <h2 className="text-lg font-bold mb-4">Login do Administrador</h2>

      {/* Aviso informativo (aparece se veio de rota protegida) */}
      {notice && (
        <p className="mb-3 text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded p-2">
          {notice}
        </p>
      )}

      <form onSubmit={handleLogin} className="space-y-4">
        <label className="block">
          <span className="sr-only">Email</span>
          <input
            type="email"
            placeholder="Email"
            className="w-full p-2 border rounded"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            inputMode="email"
            required
          />
        </label>

        <label className="block">
          <span className="sr-only">Senha</span>
          <input
            type="password"
            placeholder="Senha"
            className="w-full p-2 border rounded"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        {/* Erro real somente após validação/ação */}
        {error && <p className="text-red-600 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-primary text-white py-2 rounded disabled:opacity-50"
        >
          {submitting ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
