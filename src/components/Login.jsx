// src/components/Login.jsx
import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useNavigate, useSearchParams } from 'react-router-dom';

export default function Login() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();

  const redirectTo = sp.get('redirect') || '/';
  const reason = sp.get('reason');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Verificação inicial SUPER simples
  useEffect(() => {
    if (reason === 'forbidden') {
      setError('Faça login para acessar a página solicitada.');
    }
  }, [reason]);

  async function handleLogin(e) {
    e.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const { error: signInErr } = await supabase.auth.signInWithPassword({ 
        email: email.trim(), 
        password 
      });

      if (signInErr) {
        setError('Email ou senha incorretos.');
        setSubmitting(false);
        return;
      }

      // Simples: apenas navega - deixa o AuthProvider lidar com o resto
      navigate(redirectTo, { replace: true });
      
    } catch (err) {
      console.error('Login error:', err);
      setError('Erro inesperado durante o login.');
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-md mx-auto">
      <h2 className="text-lg font-bold mb-4">Login</h2>

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

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-blue-600 text-white py-2 rounded disabled:opacity-50 hover:bg-blue-700 transition-colors"
        >
          {submitting ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
