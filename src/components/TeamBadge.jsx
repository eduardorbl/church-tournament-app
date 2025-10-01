import React, { useState, useMemo } from "react";

export default function TeamBadge({ team = {}, size = 24, className = "" }) {
  const [broken, setBroken] = useState(false);
  const logo = useMemo(() => {
    const u = team?.logo_url;
    return (typeof u === "string" && u.trim() && !broken) ? u : null;
  }, [team?.logo_url, broken]);

  const initials = useMemo(() => {
    const n = String(team?.name ?? "").trim();
    if (!n) return "•";
    // pega primeira letra visível (ignora emojis/flags)
    const m = n.match(/\p{L}/u);
    return (m ? m[0] : n[0]).toUpperCase();
  }, [team?.name]);

  const s = { width: size, height: size };

  return (
    <span
      className={`inline-flex items-center justify-center rounded border border-gray-200 bg-white overflow-hidden ${className}`}
      style={s}
      title={team?.name}
    >
      {logo ? (
        <img
          src={logo}
          alt={team?.name || "Logo"}
          className="w-full h-full object-cover"
          onError={() => setBroken(true)}
          draggable={false}
        />
      ) : (
        <span className="text-[10px] sm:text-xs font-bold text-gray-600 select-none">
          {initials}
        </span>
      )}
    </span>
  );
}