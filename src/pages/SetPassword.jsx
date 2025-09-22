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
    console.log('SetPassword mounted, user:', user);
    if (!user) {
      console.log('No user found');
      setErr("Sua sessão expirou. Faça login novamente.");
      setTimeout(() => nav("/login"), 2000);
    }
  }, [user, nav]);

  async function handleSubmit(e) {
    e.preventDefault();
    console.log('Form submitted');
    
    if (submitting) {
      console.log('Already submitting, returning');
      return;
    }
    
    setMsg(null); 
    setErr(null);
    setSubmitting(true);
    console.log('Set submitting to true');

    if (!pwd || pwd.length < 8) {
      console.log('Password too short');
      setErr("A senha deve ter pelo menos 8 caracteres.");
      setSubmitting(false);
      return;
    }
    if (pwd !== pwd2) {
      console.log('Passwords do not match');
      setErr("As senhas não coincidem.");
      setSubmitting(false);
      return;
    }

    console.log('Starting password update...');
    
    try {
      // Primeiro, vamos tentar só atualizar a senha sem metadata
      console.log('Calling updateUser...');
      const { error } = await supabase.auth.updateUser({ 
        password: pwd
      });
      console.log('UpdateUser completed, error:', error);

      if (error) {
        console.error('UpdateUser error:', error);
        setErr(`Erro: ${error.message}`);
        setSubmitting(false);
        return;
      }
      
      console.log('Password updated successfully');
      
      // Agora vamos tentar atualizar o metadata separadamente
      try {
        console.log('Updating metadata...');
        await supabase.auth.updateUser({ 
          data: { password_set: true }
        });
        console.log('Metadata updated');
      } catch (metaError) {
        console.warn('Metadata update failed, but continuing:', metaError);
      }
      
      setMsg("Senha definida com sucesso!");
      console.log('Setting needsPasswordSetup to false');
      setNeedsPasswordSetup(false);
      
      console.log('Starting redirect timeout');
      setTimeout(() => {
        console.log('Executing redirect');
        setSubmitting(false);
        nav('/admin', { replace: true });
      }, 1500);
      
    } catch (error) {
      console.error('Caught error:', error);
      setErr(`Erro inesperado: ${error.message}`);
      setSubmitting(false);
    }
  }

  // Debug: mostrar informações do usuário
  console.log('Rendering SetPassword, user:', user, 'submitting:', submitting);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full mx-auto bg-white p-6 rounded-lg shadow-md">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Bem-vindo!</h2>
          <p className="text-gray-600 mt-2">Defina sua senha para continuar</p>
          {/* Debug info */}
          <p className="text-xs text-gray-400 mt-2">
            User ID: {user?.id?.slice(0, 8)}... | Email: {user?.email}
          </p>
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
              disabled={submitting}
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
              disabled={submitting}
            />
          </div>
          
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-blue-600 text-white py-3 rounded-md font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? "Salvando…" : "Definir senha"}
          </button>
          
          {/* Debug button */}
          <button
            type="button"
            onClick={() => {
              console.log('Debug - force reset submitting');
              setSubmitting(false);
            }}
            className="w-full text-xs text-gray-500 mt-2"
          >
            [Debug] Reset submitting
          </button>
        </form>
      </div>
    </div>
  );
}