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
    
    if (submitting) return;
    
    setSubmitting(true);
    setErr(null);
    setMsg(null);
    
    if (!pwd || pwd.length < 8) {
      setErr("A senha deve ter pelo menos 8 caracteres.");
      setSubmitting(false);
      return;
    }
    if (pwd !== pwd2) {
      setErr("As senhas não coincidem.");
      setSubmitting(false);
      return;
    }

    try {
      console.log('🚀 Starting password update...');
      
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

      // 2. Verificar se o profile admin foi criado automaticamente
      console.log('🔍 Checking if admin profile exists...');
      
      let profileExists = false;
      let attempts = 0;
      const maxAttempts = 5;
      
      // Tentar várias vezes com delay (aguardar trigger executar)
      while (!profileExists && attempts < maxAttempts) {
        attempts++;
        console.log(`Attempt ${attempts}/${maxAttempts} to check profile...`);
        
        const { data: profile, error: profileCheckError } = await supabase
          .from('profiles')
          .select('role')
          .eq('user_id', user.id)
          .single();
        
        if (!profileCheckError && profile?.role === 'admin') {
          profileExists = true;
          console.log('✅ Admin profile found!');
        } else {
          console.log('⏳ Profile not found yet, waiting...');
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s
        }
      }
      
      // Se após 5 tentativas ainda não existir, criar manualmente
      if (!profileExists) {
        console.log('🔧 Creating profile manually as fallback...');
        const { error: manualProfileError } = await supabase
          .from('profiles')
          .insert({
            user_id: user.id,
            name: user.email.split('@')[0],
            role: 'admin'
          });
        
        if (manualProfileError && !manualProfileError.message.includes('duplicate key')) {
          console.error('Manual profile creation error:', manualProfileError);
          setErr('Erro ao criar perfil de administrador.');
          setSubmitting(false);
          return;
        }
      }
      
      // 3. Teste final da função is_admin
      const { data: isAdminResult, error: adminCheckError } = await supabase.rpc('is_admin');
      console.log('🔍 Final admin check:', isAdminResult, adminCheckError);
      
      setMsg("Senha definida e perfil configurado com sucesso!");
      setNeedsPasswordSetup(false);
      
      // 4. Redirecionar
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full mx-auto bg-white p-6 rounded-lg shadow-md">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Bem-vindo!</h2>
          <p className="text-gray-600 mt-2">Defina sua senha para continuar</p>
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
              className="w-full p-3 border border-gray-300 rounded-md"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
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
              onChange={(e) => setPwd2(e.target.value)}
              required
              disabled={submitting}
            />
          </div>
          
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-blue-600 text-white py-3 rounded-md font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? "Configurando perfil..." : "Definir senha"}
          </button>
        </form>
      </div>
    </div>
  );
}