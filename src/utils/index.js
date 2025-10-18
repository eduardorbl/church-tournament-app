import { supabase } from "../supabaseClient";

// Storage
export const LOGO_BUCKET = "team-logos";

// Status labels
export const STATUS_LABEL = {
  scheduled: "Agendado",
  ongoing: "Em andamento",
  paused: "Pausado",
  finished: "Encerrado",
};

// Sport icons
export const SPORT_ICON = {
  Futsal: "⚽",
  Volei: "🏐",
  FIFA: "🎮⚽",
};

// Sport order
export const SPORT_ORDER = ["Futsal", "Volei", "FIFA"];

// Timezone e formatador de data/hora (Campinas, SP)
const tz = "America/Sao_Paulo";

export function fmtDate(dt) {
  if (!dt) return "";
  try {
    return new Date(dt).toLocaleString("pt-BR", {
      timeZone: tz,
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dt;
  }
}

export function fmtDateShort(dt) {
  if (!dt) return "";
  try {
    return new Date(dt).toLocaleDateString("pt-BR", {
      timeZone: tz,
      day: "2-digit",
      month: "2-digit",
    });
  } catch {
    return dt;
  }
}

export function fmtTime(dt) {
  if (!dt) return "";
  try {
    return new Date(dt).toLocaleTimeString("pt-BR", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dt;
  }
}

// URL helpers
export function isHttpUrl(str) {
  return typeof str === "string" && /^https?:\/\//i.test(str);
}

export function isStoragePath(str) {
  return typeof str === "string" && !isHttpUrl(str) && str.trim() !== "";
}

export function publicLogoUrl(raw) {
  if (!raw) return null;
  if (isHttpUrl(raw)) return raw; // já é pública
  if (isStoragePath(raw)) {
    const { data } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(raw);
    return data?.publicUrl || null;
  }
  return null;
}

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

// 👉 Considera a partida "definida" apenas se AMBOS os times existem
export function isMatchDefined(m) {
  const hid = m?.home && typeof m.home === "object" ? m.home.id : null;
  const aid = m?.away && typeof m.away === "object" ? m.away.id : null;
  return Boolean(hid && aid);
}

// Normaliza os logos (transforma caminho do storage em URL pública)
export function normalizeMatchLogos(matches) {
  return (matches || []).map((m) => {
    const home =
      m.home && typeof m.home === "object"
        ? {
            ...m.home,
            logo_url: (() => {
              const url = publicLogoUrl(m.home.logo_url);
              return url ? `${url}${url.includes("?") ? "&" : "?"}v=1` : null;
            })(),
          }
        : m.home;

    const away =
      m.away && typeof m.away === "object"
        ? {
            ...m.away,
            logo_url: (() => {
              const url = publicLogoUrl(m.away.logo_url);
              return url ? `${url}${url.includes("?") ? "&" : "?"}v=1` : null;
            })(),
          }
        : m.away;

    return { ...m, home, away };
  });
}

// Helpers para avatar de iniciais
export function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(" ");
  if (parts.length === 1) return parts[0][0]?.toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function stringToColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const color = ((hash >>> 0) % 0xffffff).toString(16).padStart(6, "0");
  return `#${color}`;
}

// Debounce helper
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// CSS para animação de progresso ao vivo
export const liveProgressCSS = `
  @keyframes slideProgress {
    0% { transform: translateX(-100%); }
    50% { transform: translateX(200%); }
    100% { transform: translateX(-100%); }
  }
`;
