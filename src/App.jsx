// src/App.jsx
import React from "react";
import { Routes, Route, Link } from "react-router-dom";
import { useAuth } from "./auth/AuthProvider";
import RequireAdmin from "./components/RequireAdmin";

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

export default function App() {
  const { session, isAdmin, ready, signOut, needsPasswordSetup } = useAuth();

  // Se o usuário precisa definir senha, sempre mostra essa tela
  if (needsPasswordSetup) {
    return <SetPassword />;
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* HEADER */}
      <header className="bg-primary text-white p-4">
        <div className="container mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <h1 className="text-xl font-bold">Copa Influence 🏆</h1>

          <nav className="flex flex-wrap items-center gap-3 text-sm">
            <Link to="/" className="hover:underline">Home</Link>
            <Link to="/futsal" className="hover:underline">Futsal</Link>
            <Link to="/volei" className="hover:underline">Vôlei</Link>
            <Link to="/fifa" className="hover:underline">FIFA</Link>
            <Link to="/pebolim" className="hover:underline">Pebolim</Link>
            <Link to="/ao-vivo" className="hover:underline">Ao vivo</Link>
            <Link to="/proximos" className="hover:underline">Próximos</Link>

            {/* Link admin só se logado e admin */}
            {ready && isAdmin && (
              <Link
                to="/admin"
                className="ml-2 inline-block bg-white/15 hover:bg-white/25 transition-colors px-3 py-1 rounded"
              >
                Administrador
              </Link>
            )}
          </nav>

          <div className="text-sm">
            {session ? (
              <button onClick={signOut} className="hover:underline">
                Sair
              </button>
            ) : (
              <Link to="/login" className="hover:underline">Entrar</Link>
            )}
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

          {/* Login */}
          <Route path="/login" element={<Login />} />
        </Routes>
      </main>

      {/* FOOTER */}
      <footer className="bg-gray-200 p-4 text-center text-xs text-gray-700">
        &copy; {new Date().getFullYear()} Copa Influence
      </footer>
    </div>
  );
}