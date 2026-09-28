// src/components/RequireAdmin.jsx
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';

function Checking() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Verificando permissões...</p>
      </div>
    </div>
  );
}

export default function RequireAdmin({ children }) {
  const { ready, session, isAdmin, adminChecked } = useAuth();
  const location = useLocation();

  // Enquanto a sessão não carregou, ou há sessão mas o is_admin() ainda não respondeu
  if (!ready || (session && !adminChecked)) {
    return <Checking />;
  }

  // Sem sessão OU não é admin: vai para o login
  if (!session || !isAdmin) {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?redirect=${redirect}&reason=forbidden`} replace />;
  }

  return children;
}
