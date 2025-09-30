// src/components/RequireAdmin.jsx
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';

export default function RequireAdmin({ children }) {
  const { ready, session, isAdmin } = useAuth();
  const location = useLocation();

  // Enquanto não está pronto, mostra loading simples
  if (!ready) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Verificando permissões...</p>
        </div>
      </div>
    );
  }

  // Se não tem sessão OU não é admin, redireciona para login
  if (!session || !isAdmin) {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?redirect=${redirect}&reason=forbidden`} replace />;
  }

  // Tudo OK, renderiza o conteúdo protegido
  return children;
}
