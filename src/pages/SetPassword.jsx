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

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log('🔥 FORM SUBMITTED - START');
    console.log('pwd:', pwd, 'pwd2:', pwd2, 'submitting:', submitting);
    
    if (submitting) {
      console.log('Already submitting, returning');
      return;
    }
    
    setSubmitting(true);
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

    console.log('🚀 Starting API call...');
    
    // Versão ultra simples para testar
    setTimeout(() => {
      console.log('⏰ Timeout finished - simulating success');
      setMsg("Senha simulada com sucesso!");
      setNeedsPasswordSetup(false);
      setSubmitting(false);
      
      setTimeout(() => {
        console.log('🎯 Navigating to admin');
        nav('/admin', { replace: true });
      }, 1000);
    }, 2000);
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
                console.log('Password changed:', e.target.value);
                setPwd(e.target.value);
              }}
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
              className="w-full p-3 border border-gray-300 rounded-md"
              value={pwd2}
              onChange={(e) => {
                console.log('Password2 changed:', e.target.value);
                setPwd2(e.target.value);
              }}
              required
            />
          </div>
          
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-blue-600 text-white py-3 rounded-md font-medium hover:bg-blue-700 disabled:opacity-50"
            onClick={() => console.log('🖱️ Submit button clicked')}
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
          
          <button
            type="button"
            onClick={() => {
              console.log('🧪 Direct form submit test');
              const form = document.querySelector('form');
              if (form) {
                console.log('Form found, dispatching submit event');
                form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
              }
            }}
            className="w-full text-xs bg-yellow-200 py-2 rounded"
          >
            [Debug] Force form submit
          </button>
        </div>
      </div>
    </div>
  );
}