import React, { useEffect } from "react";
import { Routes, Route, Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./auth/AuthProvider";
import RequireAdmin from "./components/RequireAdmin";
import ErrorBoundary from "./components/ErrorBoundary";
import RouterGuard from "./components/RouterGuard";

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
  const navigate = useNavigate();
  
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
        <div className="space-y-3">
          <button
            onClick={() => navigate('/', { replace: true })}
            className="block w-full bg-primary text-white px-6 py-2 rounded-lg hover:bg-primary/90 transition-colors"
          >
            Voltar ao Início
          </button>
          <button
            onClick={() => window.history.back()}
            className="block w-full bg-gray-500 text-white px-6 py-2 rounded-lg hover:bg-gray-600 transition-colors"
          >
            Página Anterior
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

// Componente wrapper para navegação segura
function SafeNavLink({ to, children, className, onClick, ...props }) {
  const navigate = useNavigate();
  
  const handleClick = (e) => {
    e.preventDefault();
    if (onClick) onClick(e);
    
    // Usar replace para evitar problemas de histórico
    navigate(to, { replace: false });
  };
  
  return (
    <Link 
      to={to} 
      className={className} 
      onClick={handleClick}
      {...props}
    >
      {children}
    </Link>
  );
}

export default function App() {
  const { session, isAdmin, ready, signOut, needsPasswordSetup, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Debug: log mudanças de rota
  useEffect(() => {
    console.log('Route changed to:', location.pathname);
  }, [location.pathname]);

  // Loading state enquanto a autenticação está sendo verificada
  if (!ready || loading) {
    return <LoadingFallback />;
  }

  // Se o usuário precisa definir senha, sempre mostra essa tela
  if (needsPasswordSetup) {
    return (
      <ErrorBoundary>
        <RouterGuard>
          <SetPassword />
        </RouterGuard>
      </ErrorBoundary>
    );
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
    <ErrorBoundary>
      <RouterGuard>
        <div className="min-h-screen flex flex-col">
          {/* HEADER */}
          <header className="bg-primary text-white sticky top-0 z-50 shadow-md">
            <div className="container mx-auto px-4">
              {/* Primeira linha: Logo + Botão Menu (mobile) + Login */}
              <div className="flex items-center justify-between py-3">
                {/* Logo */}
                <SafeNavLink to="/" className="hover:opacity-90 transition-opacity">
                  <img
                    src="/logo-copa-influence.png"
                    alt="Copa Influence"
                    className="h-12 md:h-16 w-auto"
                    loading="eager"
                    decoding="async"
                    fetchpriority="high"
                  />
                </SafeNavLink>

                {/* Login/Logout (sempre visível) */}
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
                    <SafeNavLink 
                      to="/login" 
                      className="hover:underline transition-colors hover:text-white/80 text-xs sm:text-sm"
                    >
                      Entrar
                    </SafeNavLink>
                  )}
                </div>
              </div>

              {/* Segunda linha: Navegação (sempre visível em linha única) */}
              <div className="border-t border-white/20 py-2">
                <nav className="flex items-center justify-center gap-1 sm:gap-3 text-xs sm:text-sm overflow-x-auto">
                  <SafeNavLink 
                    to="/" 
                    className={`hover:underline transition-colors whitespace-nowrap px-1 sm:px-2 ${
                      location.pathname === '/' ? 'font-semibold' : ''
                    }`}
                  >
                    Home
                  </SafeNavLink>
                  <SafeNavLink 
                    to="/futsal" 
                    className={`hover:underline transition-colors whitespace-nowrap px-1 sm:px-2 ${
                      location.pathname === '/futsal' ? 'font-semibold' : ''
                    }`}
                  >
                    Futsal
                  </SafeNavLink>
                  <SafeNavLink 
                    to="/volei" 
                    className={`hover:underline transition-colors whitespace-nowrap px-1 sm:px-2 ${
                      location.pathname === '/volei' ? 'font-semibold' : ''
                    }`}
                  >
                    Vôlei
                  </SafeNavLink>
                  <SafeNavLink 
                    to="/fifa" 
                    className={`hover:underline transition-colors whitespace-nowrap px-1 sm:px-2 ${
                      location.pathname === '/fifa' ? 'font-semibold' : ''
                    }`}
                  >
                    FIFA
                  </SafeNavLink>
                  <SafeNavLink 
                    to="/pebolim" 
                    className={`hover:underline transition-colors whitespace-nowrap px-1 sm:px-2 ${
                      location.pathname === '/pebolim' ? 'font-semibold' : ''
                    }`}
                  >
                    Pebolim
                  </SafeNavLink>
                  <SafeNavLink 
                    to="/ao-vivo" 
                    className={`hover:underline transition-colors whitespace-nowrap px-1 sm:px-2 ${
                      location.pathname === '/ao-vivo' ? 'font-semibold' : ''
                    }`}
                  >
                    Ao vivo
                  </SafeNavLink>
                  <SafeNavLink 
                    to="/proximos" 
                    className={`hover:underline transition-colors whitespace-nowrap px-1 sm:px-2 ${
                      location.pathname === '/proximos' ? 'font-semibold' : ''
                    }`}
                  >
                    Próximos
                  </SafeNavLink>

                  {/* Link admin */}
                  {ready && isAdmin && (
                    <SafeNavLink
                      to="/admin"
                      className={`bg-white/15 hover:bg-white/25 transition-colors px-2 py-1 rounded text-xs whitespace-nowrap ml-1 sm:ml-2 ${
                        location.pathname.startsWith('/admin') ? 'bg-white/25 font-semibold' : ''
                      }`}
                    >
                      Admin
                    </SafeNavLink>
                  )}
                </nav>
              </div>
            </div>
          </header>
          {/* MAIN */}
          <main className="flex-1 container mx-auto p-4">
            <React.Suspense fallback={<LoadingFallback />}>
              <Routes>
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
                        <SafeNavLink 
                          to={isAdmin ? "/admin" : "/"} 
                          className="bg-primary text-white px-4 py-2 rounded hover:bg-primary/90"
                        >
                          {isAdmin ? "Ir para Admin" : "Voltar ao Início"}
                        </SafeNavLink>
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
      </RouterGuard>
    </ErrorBoundary>
  );
}