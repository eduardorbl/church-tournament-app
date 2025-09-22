import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

export default function SetPassword() {
  const nav = useNavigate();
  const { user, setNeedsPasswordSetup } = useAuth();
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!user) {
      setErr("Sua sessão expirou. Faça login novamente.");
      setTimeout(() => nav("/login"), 2000);
    }
  }, [user, nav]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    setMsg(null); setErr(null);

    if (!pwd || pwd.length < 8) {
      setErr("A senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (pwd !== pwd2) {
      setErr("As senhas não coincidem.");
      return;
    }

    setSubmitting(true);
    
    // Atualiza a senha e marca que foi configurada
    const { error } = await supabase.auth.updateUser({ 
      password: pwd,
      data: { password_set: true }
    });
    
    setSubmitting(false);

    if (error) {
      setErr(error.message || "Não foi possível atualizar a senha.");
      return;
    }
    
    setMsg("Senha definida com sucesso!");
    setNeedsPasswordSetup(false);
    
    // Verifica se é admin e redireciona
    const { data: isAdmin } = await supabase.rpc('is_admin');
    const redirectTo = isAdmin ? '/admin' : '/';
    
    setTimeout(() => nav(redirectTo, { replace: true }), 1000);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full mx-auto bg-white p-6 rounded-lg shadow-md">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Bem-vindo!</h2>
          <p className="text-gray-600 mt-2">Defina sua senha para continuar</p>
        </div>
        
        {msg && <p className="mb-3 text-green-700 text-center">{msg}</p>}
        {err && <p className="mb-3 text-red-700 text-center">{err}</p>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nova senha
            </label>
            <input
              type="password"
              placeholder="Mínimo 8 caracteres"
              className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Confirme a senha
            </label>
            <input
              type="password"
              placeholder="Digite a senha novamente"
              className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              value={pwd2}
              onChange={(e) => setPwd2(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-blue-600 text-white py-3 rounded-md font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? "Salvando…" : "Definir senha"}
          </button>
        </form>
      </div>
    </div>
  );
}