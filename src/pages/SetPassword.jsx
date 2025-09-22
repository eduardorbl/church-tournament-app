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
  }, [user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log('🔥 FORM SUBMITTED - START');
    
    if (submitting) {
      console.log('Already submitting, returning');
      return;
    }
    
    setSubmitting(true);
    setErr(null);
    setMsg(null);
    console.log('✅ Set submitting to true');
    
    if (!pwd || pwd.length < 8) {
      console.log('❌ Password too short');
      setErr("A senha deve ter pelo menos 8 caracteres.");
      setSubmitting(false);
      return;
    }
    if (pwd !== pwd2) {
      console.log('❌ Passwords do not match');
      setErr("As senhas não coincidem.");
      setSubmitting(false);
      return;
    }

    console.log('🚀 Starting password update...');
    
    try {
      // 1. Atualizar a senha
      const { error: passwordError } = await supabase.auth.updateUser({ 
        password: pwd,
        data: { password_set: true }
      });

      if (passwordError) {
        console.error('Password update error:', passwordError);
        setErr(`Erro ao atualizar senha: ${passwordError.message}`);
        setSubmitting(false);
        return;
      }

      console.log('✅ Password updated successfully');

      // 2. Garantir que o usuário seja admin na tabela profiles
      console.log('🔧 Ensuring admin profile...');
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          user_id: user.id,
          name: user.email.split('@')[0], // nome baseado no email
          role: 'admin'
        });

      if (profileError) {
        console.warn('Profile creation warning:', profileError);
        // Não falha aqui, pode ser que já existe
      }

      console.log('✅ Admin profile ensured');
      
      setMsg("Senha definida com sucesso!");
      setNeedsPasswordSetup(false);
      
      // 3. Aguardar um pouco para a sessão se atualizar
      console.log('⏳ Waiting for session to update...');
      setTimeout(() => {
        console.log('🎯 Navigating to admin');
        setSubmitting(false);
        nav('/admin', { replace: true });
      }, 1500);
      
    } catch (error) {
      console.error('Unexpected error:', error);
      setErr(`Erro inesperado: ${error.message}`);
      setSubmitting(false);
    }
  };

  const handleButtonClick = () => {
    console.log('🖱️ BUTTON CLICKED DIRECTLY');
    setSubmitting(!submitting);
  };

  console.log('🔄 Rendering SetPassword - submitting:', submitting);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full mx-auto bg-white p-6 rounded-lg shadow-md">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Bem-vindo!</h2>
          <p className="text-gray-600 mt-2">Defina sua senha para continuar</p>
          <p className="text-xs text-gray-400 mt-2">
            User ID: {user?.id?.slice(0, 8)}... | Email: {user?.email}
          </p>
          <p className="text-xs text-red-500">
            Submitting: {submitting ? 'TRUE' : 'FALSE'}
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
              className="w-full p-3 border border-gray-300 rounded-md"
              value={pwd}
              onChange={(e) => {
                console.log('Password changed:', e.target.value.length, 'chars');
                setPwd(e.target.value);
              }}
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
              className="w-full p-3 border border-gray-300 rounded-md"
              value={pwd2}
              onChange={(e) => {
                console.log('Password2 changed:', e.target.value.length, 'chars');
                setPwd2(e.target.value);
              }}
              required
              disabled={submitting}
            />
          </div>
          
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-blue-600 text-white py-3 rounded-md font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? "Salvando…" : "Definir senha"}
          </button>
        </form>

        {/* Debug buttons */}
        <div className="mt-4 space-y-2">
          <button
            type="button"
            onClick={handleButtonClick}
            className="w-full text-xs bg-gray-200 py-2 rounded"
          >
            [Debug] Toggle submitting
          </button>
        </div>
      </div>
    </div>
  );
}