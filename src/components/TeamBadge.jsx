import React, { useState } from "react";

// Helpers
function ensureString(v, fallback = "") {
  if (typeof v === "string") return v;
  if (v === null || v === undefined) return fallback;
  try { return String(v); } catch { return fallback; }
}

function getInitials(name) {
  const s = ensureString(name, "").trim();
  if (!s) return "?";
  const parts = s.split(/\s+/);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() || "?";
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function stringToColor(str) {
  const s = ensureString(str, "");
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = s.charCodeAt(i) + ((hash << 5) - hash);
  }
  const color = ((hash >>> 0) % 0xffffff).toString(16).padStart(6, "0");
  return `#${color}`;
}

export default function TeamBadge({ team, size = 32 }) {
  const [imageError, setImageError] = useState(false);
  
  // Normaliza tudo para string
  const teamName = ensureString(team?.name, "A definir");
  const logoUrl = typeof team?.logo_url === "string" ? team.logo_url : null;
  
  // Se não há URL ou houve erro, mostra fallback
  const showFallback = !logoUrl || imageError;

  return (
    <div
      className="relative rounded overflow-hidden border bg-white flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
    >
      {!showFallback && (
        <img
          src={logoUrl}
          alt={teamName}
          className="w-full h-full object-cover"
          loading="lazy"
          onError={() => setImageError(true)}
        />
      )}
      {showFallback && (
        <div
          className="flex items-center justify-center text-white font-bold uppercase w-full h-full"
          style={{
            backgroundColor: stringToColor(teamName),
            fontSize: size * 0.4,
          }}
        >
          {getInitials(teamName)}
        </div>
      )}
    </div>
  );
}