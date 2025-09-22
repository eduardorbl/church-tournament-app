// src/components/RequireAdmin.jsx
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';

export default function RequireAdmin({ children }) {
  const { ready, session, isAdmin } = useAuth();
  const loc = useLocation();

  if (!ready) {
    return <div className="p-8 text-center text-sm text-gray-500">Carregando…</div>;
  }

  if (!session || !isAdmin) {
    const redirect = encodeURIComponent(loc.pathname + loc.search);
    // adiciona uma razão de erro opcional para a tela de login
    return <Navigate to={`/login?redirect=${redirect}&reason=forbidden`} replace />;
  }

  return children;
}
