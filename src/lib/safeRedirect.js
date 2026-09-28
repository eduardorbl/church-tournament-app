// Aceita só caminhos internos do próprio app ("/admin", "/futsal?x=1").
// Bloqueia "//outro-site.com", "/\\outro-site.com", "https://..." etc.
export function safeRedirect(target, fallback = "/") {
  if (typeof target !== "string") return fallback;
  const t = target.trim();
  if (!t.startsWith("/") || t.startsWith("//") || t.includes("\\")) return fallback;
  if (/[\u0000-\u001f]/.test(t)) return fallback;
  return t;
}
