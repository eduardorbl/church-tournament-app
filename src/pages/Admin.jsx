import React from "react";
import { useNavigate } from "react-router-dom";

export default function Admin() {
  const navigate = useNavigate();

  const handleNavigation = (path) => {
    navigate(path);
  };

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-bold">Painel do Administrador</h2>
        <p className="text-sm text-gray-600">
          Selecione uma área para gerenciar.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        {/* 1) Elencos */}
        <button
          onClick={() => handleNavigation("/admin/elencos")}
          className="group block rounded-xl border p-5 shadow-sm hover:shadow-md hover:border-primary/50 transition text-left w-full"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 grid place-items-center rounded-lg bg-primary/10">
              <span className="text-2xl">👥</span>
            </div>
            <div>
              <h3 className="font-semibold">Elencos</h3>
              <p className="text-xs text-gray-600">
                Criar time, editar elenco (jogadores) e logo.
              </p>
            </div>
          </div>
          <div className="mt-3 text-primary text-sm font-medium group-hover:underline">
            Abrir &rarr;
          </div>
        </button>

        {/* 2) Campeonatos */}
        <button
          onClick={() => handleNavigation("/admin/campeonatos")}
          className="group block rounded-xl border p-5 shadow-sm hover:shadow-md hover:border-primary/50 transition text-left w-full"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 grid place-items-center rounded-lg bg-primary/10">
              <span className="text-2xl">🏆</span>
            </div>
            <div>
              <h3 className="font-semibold">Campeonatos</h3>
              <p className="text-xs text-gray-600">
                Configurar modalidades, grupos e fases.
              </p>
            </div>
          </div>
          <div className="mt-3 text-primary text-sm font-medium group-hover:underline">
            Abrir &rarr;
          </div>
        </button>

        {/* 3) Partidas */}
        <button
          onClick={() => handleNavigation("/admin/partidas")}
          className="group block rounded-xl border p-5 shadow-sm hover:shadow-md hover:border-primary/50 transition text-left w-full"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 grid place-items-center rounded-lg bg-primary/10">
              <span className="text-2xl">⏱️</span>
            </div>
            <div>
              <h3 className="font-semibold">Partidas</h3>
              <p className="text-xs text-gray-600">
                Iniciar/encerrar jogos e atualizar placar em tempo real.
              </p>
            </div>
          </div>
          <div className="mt-3 text-primary text-sm font-medium group-hover:underline">
            Abrir &rarr;
          </div>
        </button>
      </div>
    </div>
  );
}