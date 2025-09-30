// src/utils/gameTime.js

// Formatar tempo em minutos:segundos baseado no tempo decorrido
export function formatGameTime(match, currentTimestamp) {
  if (!match || match.status === 'scheduled' || match.status === 'finished') {
    return "0:00";
  }
  
  const startTime = new Date(match.starts_at);
  const currentTime = match.status === 'paused' 
    ? new Date(match.updated_at) 
    : new Date(currentTimestamp || Date.now());
  
  // Calcula diferença em milissegundos
  const diffMs = currentTime - startTime;
  
  // Se a diferença for negativa (jogo ainda não começou), retorna 0:00
  if (diffMs < 0) return "0:00";
  
  // Converte para minutos e segundos
  const totalSeconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// Função para obter sets do vôlei
export function getSets(match, side) {
  const meta = match.meta || {};
  const key = side === "home" ? "home_sets" : "away_sets";
  return Math.max(0, Number(meta[key] || 0));
}

// Barra animada para jogos ao vivo/pausados
export function LiveProgressBar({ status }) {
  if (status !== "ongoing" && status !== "paused") return null;
  
  const isOngoing = status === "ongoing";
  const barColor = isOngoing ? "bg-blue-500" : "bg-orange-500";
  const bgColor = isOngoing ? "bg-blue-100" : "bg-orange-100";
  
  return (
    <div className={`absolute top-0 left-0 right-0 h-1 ${bgColor} overflow-hidden rounded-t-lg`}>
      <div 
        className={`h-full ${barColor}`}
        style={{
          animation: isOngoing 
            ? 'slideProgress 3s ease-in-out infinite' 
            : 'none',
          width: '100%'
        }}
      />
    </div>
  );
}

// CSS global para animação (para ser incluído onde necessário)
export const liveProgressBarStyles = `
  @keyframes slideProgress {
    0% { transform: translateX(-100%); }
    50% { transform: translateX(200%); }
    100% { transform: translateX(-100%); }
  }
`;