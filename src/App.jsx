import React from "react";
import { Routes, Route, Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./auth/AuthProvider";
import RequireAdmin from "./components/RequireAdmin";

// Páginas públicas
import Home from "./pages/Home";
import Futsal from "./pages/Futsal";
import Volei from "./pages/Volei";
import FIFA from "./pages/FIFA";
import Pebolim from "./pages/Pebolim";
import TeamPage from "./pages/TeamPage";
import MatchPage from "./pages/MatchPage"; 
import SetPassword from "./pages/SetPassword";

// Páginas admin
import Admin from "./pages/Admin";
import Login from "./components/Login";
import AdminRosters from "./pages/admin/Rosters";
import AdminMatches from "./pages/admin/Matches";
import AdminTournaments from "./pages/admin/Tournaments";
import FutsalTournament from "./pages/admin/FutsalTournament";
import VoleiTournament from "./pages/admin/VoleiTournament";
import FIFATournament from "./pages/admin/FIFATournament";
import PebolimTournament from "./pages/admin/PebolimTournament";

// Componente simples de loading
function LoadingFallback() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Carregando...</p>
      </div>
    </div>
  );
}

export default function App() {
  const { session, isAdmin, ready, signOut, needsPasswordSetup } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Loading state enquanto a autenticação está sendo verificada
  if (!ready) {
    return <LoadingFallback />;
  }

  // Se o usuário precisa definir senha
  if (needsPasswordSetup) {
    return <SetPassword />;
  }

  // Função para logout seguro
  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/', { replace: true });
    } catch (error) {
      console.error('Error during signout:', error);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* HEADER */}
      <header className="bg-blue-600 text-white sticky top-0 z-50 shadow-md">
        <div className="container mx-auto px-4">
          {/* Primeira linha: Logo + Login */}
          <div className="flex items-center justify-between py-3">
            {/* Logo */}
            <Link to="/" className="hover:opacity-90 transition-opacity">
              <img
                src="/logo-copa-influence.png"
                alt="Copa Influence"
                className="h-12 md:h-16 w-auto"
              />
            </Link>

            {/* Login/Logout */}
            <div className="text-sm">
              {session ? (
                <div className="flex items-center gap-2">
                  {session.user?.email && (
                    <span className="text-white/80 text-xs hidden sm:inline">
                      {session.user.email}
                    </span>
                  )}
                  <button 
                    onClick={handleSignOut} 
                    className="hover:underline transition-colors hover:text-white/80 text-xs sm:text-sm"
                  >
                    Sair
                  </button>
                </div>
              ) : (
                <Link 
                  to="/login" 
                  className="hover:underline transition-colors hover:text-white/80 text-xs sm:text-sm"
                >
                  Entrar
                </Link>
              )}
            </div>
          </div>

          {/* Segunda linha: Navegação */}
          <div className="border-t border-white/20 py-2">
            <nav className="flex items-center justify-center gap-1 sm:gap-3 text-xs sm:text-sm overflow-x-auto">
              <Link to="/" className="hover:underline transition-colors whitespace-nowrap px-1 sm:px-2">Home</Link>
              <Link to="/futsal" className="hover:underline transition-colors whitespace-nowrap px-1 sm:px-2">Futsal</Link>
              <Link to="/volei" className="hover:underline transition-colors whitespace-nowrap px-1 sm:px-2">Vôlei</Link>
              <Link to="/fifa" className="hover:underline transition-colors whitespace-nowrap px-1 sm:px-2">FIFA</Link>
              <Link to="/pebolim" className="hover:underline transition-colors whitespace-nowrap px-1 sm:px-2">Pebolim</Link>

              {/* Link admin */}
              {isAdmin && (
                <Link
                  to="/admin"
                  className="bg-white/15 hover:bg-white/25 transition-colors px-2 py-1 rounded text-xs whitespace-nowrap ml-1 sm:ml-2"
                >
                  Admin
                </Link>
              )}
            </nav>
          </div>
        </div>
      </header>

      {/* MAIN */}
      <main className="flex-1 container mx-auto p-4">
        <Routes>
          {/* Rotas públicas */}
          <Route path="/" element={<Home />} />
          <Route path="/futsal" element={<Futsal />} />
          <Route path="/volei" element={<Volei />} />
          <Route path="/fifa" element={<FIFA />} />
          <Route path="/pebolim" element={<Pebolim />} />

          {/* TeamPage */}
          <Route path="/team/:id" element={<TeamPage />} />
          <Route path="/times/:id" element={<TeamPage />} />

          {/* MatchPage */}
          <Route path="/match/:id" element={<MatchPage />} />
          <Route path="/partida/:id" element={<MatchPage />} />

          {/* Rota para definir senha */}
          <Route path="/set-password" element={<SetPassword />} />

          {/* Login */}
          <Route path="/login" element={<Login />} />

          {/* Rotas admin protegidas */}
          <Route path="/admin" element={<RequireAdmin><Admin /></RequireAdmin>} />
          <Route path="/admin/elencos" element={<RequireAdmin><AdminRosters /></RequireAdmin>} />
          <Route path="/admin/partidas" element={<RequireAdmin><AdminMatches /></RequireAdmin>} />
          <Route path="/admin/campeonatos" element={<RequireAdmin><AdminTournaments /></RequireAdmin>} />
          <Route path="/admin/campeonatos/futsal" element={<RequireAdmin><FutsalTournament /></RequireAdmin>} />
          <Route path="/admin/campeonatos/volei" element={<RequireAdmin><VoleiTournament /></RequireAdmin>} />
          <Route path="/admin/campeonatos/fifa" element={<RequireAdmin><FIFATournament /></RequireAdmin>} />
          <Route path="/admin/campeonatos/pebolim" element={<RequireAdmin><PebolimTournament /></RequireAdmin>} />

          {/* 404 */}
          <Route
            path="*"
            element={
              <div className="text-center py-12">
                <h2 className="text-2xl font-bold mb-4">404 - Página não encontrada</h2>
                <Link to="/" className="text-blue-600 hover:underline">Voltar ao início</Link>
              </div>
            }
          />
        </Routes>
      </main>

      {/* FOOTER */}
      <footer className="bg-gray-200 p-4 text-center text-xs text-gray-700 mt-auto">
        <div className="container mx-auto">
          <p>&copy; {new Date().getFullYear()} Copa Influence</p>
          <p className="mt-1 text-gray-500">Desenvolvido para a comunidade da igreja</p>
        </div>
      </footer>
    </div>
  );
}
