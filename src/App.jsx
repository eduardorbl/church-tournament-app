import React from "react";
import { Routes, Route, Link, useLocation } from "react-router-dom";
import { useAuth } from "./auth/AuthProvider";
import RequireAdmin from "./components/RequireAdmin";
import ErrorBoundary from "./components/ErrorBoundary";

// Páginas públicas
import Home from "./pages/Home";
import Futsal from "./pages/Futsal";
import Volei from "./pages/Volei";
import FIFA from "./pages/FIFA";
import Pebolim from "./pages/Pebolim";
import TeamPage from "./pages/TeamPage";
import Live from "./pages/Live";
import Upcoming from "./pages/Upcoming";
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

// Componente para páginas não encontradas
function NotFound() {
  return (
    <div className="text-center py-12">
      <div className="max-w-md mx-auto">
        <h2 className="text-3xl font-bold text-gray-900 mb-4">404</h2>
        <h3 className="text-xl font-semibold text-gray-700 mb-4">
          Página não encontrada
        </h3>
        <p className="text-gray-600 mb-6">
          A página que você está procurando não existe ou foi movida.
        </p>
        <div className="space-x-4">
          <Link 
            to="/" 
            className="inline-block bg-primary text-white px-6 py-2 rounded-lg hover:bg-primary/90 transition-colors"
          >
            Voltar ao Início
          </Link>
          <button
            onClick={() => window.history.back()}
            className="inline-block bg-gray-500 text-white px-6 py-2 rounded-lg hover:bg-gray-600 transition-colors"
          >
            Voltar
          </button>
        </div>
      </div>
    </div>
  );
}

// Componente de loading para transições suaves
function LoadingFallback() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-gray-600">Carregando...</p>
      </div>
    </div>
  );
}

export default function App() {
  const { session, isAdmin, ready, signOut, needsPasswordSetup, loading } = useAuth();
  const location = useLocation();

  // Loading state enquanto a autenticação está sendo verificada
  if (!ready || loading) {
    return <LoadingFallback />;
  }

  // Se o usuário precisa definir senha, sempre mostra essa tela
  if (needsPasswordSetup) {
    return (
      <ErrorBoundary>
        <SetPassword />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen flex flex-col">
        {/* HEADER */}
        <header className="bg-primary text-white p-4 sticky top-0 z-50 shadow-md">
          <div className="container mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
            <Link to="/" className="text-xl font-bold hover:opacity-90 transition-opacity">
              Copa Influence 🏆
            </Link>

            <nav className="flex flex-wrap items-center gap-3 text-sm">
              <Link 
                to="/" 
                className={`hover:underline transition-colors ${
                  location.pathname === '/' ? 'font-semibold' : ''
                }`}
              >
                Home
              </Link>
              <Link 
                to="/futsal" 
                className={`hover:underline transition-colors ${
                  location.pathname === '/futsal' ? 'font-semibold' : ''
                }`}
              >
                Futsal
              </Link>
              <Link 
                to="/volei" 
                className={`hover:underline transition-colors ${
                  location.pathname === '/volei' ? 'font-semibold' : ''
                }`}
              >
                Vôlei
              </Link>
              <Link 
                to="/fifa" 
                className={`hover:underline transition-colors ${
                  location.pathname === '/fifa' ? 'font-semibold' : ''
                }`}
              >
                FIFA
              </Link>
              <Link 
                to="/pebolim" 
                className={`hover:underline transition-colors ${
                  location.pathname === '/pebolim' ? 'font-semibold' : ''
                }`}
              >
                Pebolim
              </Link>
              <Link 
                to="/ao-vivo" 
                className={`hover:underline transition-colors ${
                  location.pathname === '/ao-vivo' ? 'font-semibold' : ''
                }`}
              >
                Ao vivo
              </Link>
              <Link 
                to="/proximos" 
                className={`hover:underline transition-colors ${
                  location.pathname === '/proximos' ? 'font-semibold' : ''
                }`}
              >
                Próximos
              </Link>

              {/* Link admin só se logado e admin */}
              {ready && isAdmin && (
                <Link
                  to="/admin"
                  className={`ml-2 inline-block bg-white/15 hover:bg-white/25 transition-colors px-3 py-1 rounded ${
                    location.pathname.startsWith('/admin') ? 'bg-white/25 font-semibold' : ''
                  }`}
                >
                  Administrador
                </Link>
              )}
            </nav>

            <div className="text-sm">
              {session ? (
                <div className="flex items-center gap-3">
                  {session.user?.email && (
                    <span className="text-white/80 text-xs">
                      {session.user.email}
                    </span>
                  )}
                  <button 
                    onClick={signOut} 
                    className="hover:underline transition-colors hover:text-white/80"
                  >
                    Sair
                  </button>
                </div>
              ) : (
                <Link 
                  to="/login" 
                  className="hover:underline transition-colors hover:text-white/80"
                >
                  Entrar
                </Link>
              )}
            </div>
          </div>
        </header>

        {/* MAIN */}
        <main className="flex-1 container mx-auto p-4">
          <React.Suspense fallback={<LoadingFallback />}>
            <Routes key={location.pathname}>
              {/* Rotas públicas */}
              <Route path="/" element={<Home />} />
              <Route path="/futsal" element={<Futsal />} />
              <Route path="/volei" element={<Volei />} />
              <Route path="/fifa" element={<FIFA />} />
              <Route path="/pebolim" element={<Pebolim />} />
              <Route path="/ao-vivo" element={<Live />} />
              <Route path="/proximos" element={<Upcoming />} />

              {/* TeamPage - aceitar ambos padrões */}
              <Route path="/team/:id" element={<TeamPage />} />
              <Route path="/times/:id" element={<TeamPage />} />

              {/* MatchPage - aceitar ambos padrões */}
              <Route path="/match/:id" element={<MatchPage />} />
              <Route path="/partida/:id" element={<MatchPage />} />

              {/* Rota para definir senha */}
              <Route path="/set-password" element={<SetPassword />} />

              {/* Login - só mostra se não estiver logado */}
              <Route 
                path="/login" 
                element={
                  session ? (
                    <div className="text-center py-8">
                      <p className="text-gray-600 mb-4">Você já está logado.</p>
                      <Link 
                        to={isAdmin ? "/admin" : "/"} 
                        className="bg-primary text-white px-4 py-2 rounded hover:bg-primary/90"
                      >
                        {isAdmin ? "Ir para Admin" : "Voltar ao Início"}
                      </Link>
                    </div>
                  ) : (
                    <Login />
                  )
                } 
              />

              {/* Rotas admin protegidas */}
              <Route
                path="/admin"
                element={
                  <RequireAdmin>
                    <Admin />
                  </RequireAdmin>
                }
              />
              <Route
                path="/admin/elencos"
                element={
                  <RequireAdmin>
                    <AdminRosters />
                  </RequireAdmin>
                }
              />
              <Route
                path="/admin/partidas"
                element={
                  <RequireAdmin>
                    <AdminMatches />
                  </RequireAdmin>
                }
              />
              <Route
                path="/admin/campeonatos"
                element={
                  <RequireAdmin>
                    <AdminTournaments />
                  </RequireAdmin>
                }
              />

              {/* Campeonatos específicos */}
              <Route
                path="/admin/campeonatos/futsal"
                element={
                  <RequireAdmin>
                    <FutsalTournament />
                  </RequireAdmin>
                }
              />
              <Route
                path="/admin/campeonatos/volei"
                element={
                  <RequireAdmin>
                    <VoleiTournament />
                  </RequireAdmin>
                }
              />
              <Route
                path="/admin/campeonatos/fifa"
                element={
                  <RequireAdmin>
                    <FIFATournament />
                  </RequireAdmin>
                }
              />
              <Route
                path="/admin/campeonatos/pebolim"
                element={
                  <RequireAdmin>
                    <PebolimTournament />
                  </RequireAdmin>
                }
              />

              {/* Catch-all route para páginas não encontradas */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </React.Suspense>
        </main>

        {/* FOOTER */}
        <footer className="bg-gray-200 p-4 text-center text-xs text-gray-700 mt-auto">
          <div className="container mx-auto">
            <p>&copy; {new Date().getFullYear()} Copa Influence</p>
            <p className="mt-1 text-gray-500">
              Desenvolvido para a comunidade da igreja
            </p>
          </div>
        </footer>
      </div>
    </ErrorBoundary>
  );
}