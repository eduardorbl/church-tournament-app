import React, { useState } from "react";

// Helpers para avatar de iniciais (extraídos do Rosters.jsx)
function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(" ");
  if (parts.length === 1) return parts[0][0]?.toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function stringToColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const color = ((hash >>> 0) % 0xffffff).toString(16).padStart(6, "0");
  return `#${color}`;
}

export default function TeamBadge({ team, size = 32 }) {
  const [imageError, setImageError] = useState(false);
  
  const teamName = team?.name || "A definir";
  const logoUrl = team?.logo_url;
  
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