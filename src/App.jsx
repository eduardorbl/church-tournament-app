import React, { useEffect, Suspense } from "react";
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

// ✅ COMPONENTE DE LOADING OTIMIZADO
function LoadingScreen({ message = "Carregando aplicação..." }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-gray-600 animate-pulse">{message}</p>
        <div className="mt-2 text-xs text-gray-400">
          Aguarde um momento...
        </div>
      </div>
    </div>
  );
}

// ✅ LOADING PARA LAZY LOADING
function LazyLoadingFallback() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-gray-600">Carregando página...</p>
      </div>
    </div>
  );
}

// ✅ COMPONENTE 404 OTIMIZADO
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

// ✅ LINK DE NAVEGAÇÃO OTIMIZADO
function SafeNavLink({ to, children, className, onClick, isActive, ...props }) {
  return (
    <Link 
      to={to} 
      className={`${className} ${isActive ? 'font-semibold' : ''} hover:underline transition-colors`}
      onClick={onClick}
      {...props}
    >
      {children}
    </Link>
  );
}

export default function App() {
  const { 
    session, 
    isAdmin, 
    ready, 
    loading, 
    initializing,
    needsPasswordSetup, 
    signOut 
  } = useAuth();
  
  const location = useLocation();
  const navigate = useNavigate();

  // ✅ DEBUG - LOG MUDANÇAS DE ROTA
  useEffect(() => {
    console.log('📍 Route changed to:', location.pathname);
  }, [location.pathname]);

  // ✅ ESTADOS DE LOADING HIERÁRQUICOS
  // 1. Inicialização (primeira verificação)
  if (initializing) {
    return <LoadingScreen message="Inicializando aplicação..." />;
  }

  // 2. Loading geral (operações em andamento)
  if (loading) {
    return <LoadingScreen message="Carregando..." />;
  }

  // 3. Aguardando auth ficar pronto
  if (!ready) {
    return <LoadingScreen message="Verificando autenticação..." />;
  }

  // ✅ CONFIGURAÇÃO DE SENHA TEM PRIORIDADE MÁXIMA
  if (needsPasswordSetup) {
    return (
      <ErrorBoundary>
        <RouterGuard>
          <div className="min-h-screen bg-gray-50">
            <SetPassword />
          </div>
        </RouterGuard>
      </ErrorBoundary>
    );
  }

  // ✅ LOGOUT SEGURO
  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/', { replace: true });
    } catch (error) {
      console.error('Erro durante logout:', error);
      // Em caso de erro, força navegação para home
      navigate('/', { replace: true });
    }
  };

  return (
    <ErrorBoundary>
      <RouterGuard>
        <div className="min-h-screen flex flex-col bg-gray-50">
          {/* ✅ HEADER OTIMIZADO */}
          <header className="bg-primary text-white p-4 sticky top-0 z-50 shadow-md">
            <div className="container mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
                {/* ✅ LOGO RESPONSIVO */}
                <SafeNavLink 
                  to="/" 
                  className="flex items-center gap-3 hover:opacity-90 transition-opacity"
                  isActive={false}
                >
                  <img 
                    src="/logo-copa-influence.png" 
                    alt="Copa Influence" 
                    className="h-6 sm:h-8 w-auto object-contain"
                  />
                  <span className="text-lg sm:text-xl font-bold hidden md:block">
                    Copa Influence
                  </span>
                </SafeNavLink>
              {/* ✅ NAVEGAÇÃO PRINCIPAL */}
              <nav className="flex flex-wrap items-center gap-3 text-sm">
                <SafeNavLink 
                  to="/" 
                  isActive={location.pathname === '/'}
                >
                  Home
                </SafeNavLink>
                <SafeNavLink 
                  to="/futsal" 
                  isActive={location.pathname === '/futsal'}
                >
                  Futsal
                </SafeNavLink>
                <SafeNavLink 
                  to="/volei" 
                  isActive={location.pathname === '/volei'}
                >
                  Vôlei
                </SafeNavLink>
                <SafeNavLink 
                  to="/fifa" 
                  isActive={location.pathname === '/fifa'}
                >
                  FIFA
                </SafeNavLink>
                <SafeNavLink 
                  to="/pebolim" 
                  isActive={location.pathname === '/pebolim'}
                >
                  Pebolim
                </SafeNavLink>
                <SafeNavLink 
                  to="/ao-vivo" 
                  isActive={location.pathname === '/ao-vivo'}
                >
                  Ao vivo
                </SafeNavLink>
                <SafeNavLink 
                  to="/proximos" 
                  isActive={location.pathname === '/proximos'}
                >
                  Próximos
                </SafeNavLink>

                {/* ✅ LINK ADMIN CONDICIONAL */}
                {isAdmin && (
                  <SafeNavLink
                    to="/admin"
                    className="ml-2 inline-block bg-white/15 hover:bg-white/25 transition-colors px-3 py-1 rounded"
                    isActive={location.pathname.startsWith('/admin')}
                  >
                    Administrador
                  </SafeNavLink>
                )}
              </nav>

              {/* ✅ ÁREA DE USUÁRIO */}
              <div className="text-sm">
                {session ? (
                  <div className="flex items-center gap-3">
                    {session.user?.email && (
                      <span className="text-white/80 text-xs truncate max-w-32">
                        {session.user.email}
                      </span>
                    )}
                    {isAdmin && (
                      <span className="text-xs bg-white/20 px-2 py-1 rounded">
                        Admin
                      </span>
                    )}
                    <button 
                      onClick={handleSignOut} 
                      className="hover:underline transition-colors hover:text-white/80"
                    >
                      Sair
                    </button>
                  </div>
                ) : (
                  <SafeNavLink 
                    to="/login" 
                    className="hover:text-white/80"
                    isActive={false}
                  >
                    Entrar
                  </SafeNavLink>
                )}
              </div>
            </div>
          </header>

          {/* ✅ MAIN CONTENT */}
          <main className="flex-1 container mx-auto p-4">
            <Suspense fallback={<LazyLoadingFallback />}>
              <Routes>
                {/* ✅ ROTAS PÚBLICAS */}
                <Route path="/" element={<Home />} />
                <Route path="/futsal" element={<Futsal />} />
                <Route path="/volei" element={<Volei />} />
                <Route path="/fifa" element={<FIFA />} />
                <Route path="/pebolim" element={<Pebolim />} />
                <Route path="/ao-vivo" element={<Live />} />
                <Route path="/proximos" element={<Upcoming />} />

                {/* ✅ PÁGINAS DE DETALHES */}
                <Route path="/team/:id" element={<TeamPage />} />
                <Route path="/times/:id" element={<TeamPage />} />
                <Route path="/match/:id" element={<MatchPage />} />
                <Route path="/partida/:id" element={<MatchPage />} />

                {/* ✅ CONFIGURAÇÃO DE SENHA */}
                <Route path="/set-password" element={<SetPassword />} />

                {/* ✅ LOGIN INTELIGENTE */}
                <Route 
                  path="/login" 
                  element={
                    session ? (
                      <div className="text-center py-8">
                        <div className="max-w-md mx-auto">
                          <h2 className="text-2xl font-bold text-gray-900 mb-4">
                            Você já está logado
                          </h2>
                          <p className="text-gray-600 mb-6">
                            Bem-vindo de volta, {session.user?.email}!
                          </p>
                          <div className="space-y-3">
                            <SafeNavLink 
                              to={isAdmin ? "/admin" : "/"} 
                              className="block bg-primary text-white px-6 py-2 rounded-lg hover:bg-primary/90 transition-colors"
                              isActive={false}
                            >
                              {isAdmin ? "Ir para Administração" : "Voltar ao Início"}
                            </SafeNavLink>
                            <button
                              onClick={handleSignOut}
                              className="block w-full bg-gray-500 text-white px-6 py-2 rounded-lg hover:bg-gray-600 transition-colors"
                            >
                              Trocar de conta
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <Login />
                    )
                  } 
                />

                {/* ✅ ROTAS ADMIN PROTEGIDAS */}
                <Route path="/admin" element={<RequireAdmin><Admin /></RequireAdmin>} />
                <Route path="/admin/elencos" element={<RequireAdmin><AdminRosters /></RequireAdmin>} />
                <Route path="/admin/partidas" element={<RequireAdmin><AdminMatches /></RequireAdmin>} />
                <Route path="/admin/campeonatos" element={<RequireAdmin><AdminTournaments /></RequireAdmin>} />
                <Route path="/admin/campeonatos/futsal" element={<RequireAdmin><FutsalTournament /></RequireAdmin>} />
                <Route path="/admin/campeonatos/volei" element={<RequireAdmin><VoleiTournament /></RequireAdmin>} />
                <Route path="/admin/campeonatos/fifa" element={<RequireAdmin><FIFATournament /></RequireAdmin>} />
                <Route path="/admin/campeonatos/pebolim" element={<RequireAdmin><PebolimTournament /></RequireAdmin>} />

                {/* ✅ 404 */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </main>

          {/* ✅ FOOTER */}
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