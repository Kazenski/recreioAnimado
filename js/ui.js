// ============================================================================
// Utilitários de interface compartilhados (toasts, formatação, segurança).
// ============================================================================

/** Escapa texto para inserir com segurança dentro de HTML. */
export function escapeHtml(texto) {
  return String(texto == null ? "" : texto)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Mostra um toast no canto inferior. tipo: "ok" | "err" | "info". */
export function toast(mensagem, tipo = "info", ms = 4200) {
  const container = document.getElementById("toasts");
  if (!container) return;
  const el = document.createElement("div");
  el.className = "toast" + (tipo === "ok" ? " ok" : tipo === "err" ? " err" : "");
  el.textContent = mensagem;
  container.appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity .3s ease, transform .3s ease";
    el.style.opacity = "0";
    el.style.transform = "translateY(8px)";
    setTimeout(() => el.remove(), 320);
  }, ms);
}

/** Formata um timestamp (ms) como hora local curta: "14:32" ou "10/10 14:32". */
export function formatarData(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  const hoje = new Date();
  const mesmoDia =
    d.getDate() === hoje.getDate() &&
    d.getMonth() === hoje.getMonth() &&
    d.getFullYear() === hoje.getFullYear();
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (mesmoDia) return hora;
  return (
    d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " " + hora
  );
}

/** Mostra/esconde um elemento alternando a classe "hidden". */
export function mostrar(el, visivel) {
  if (!el) return;
  el.classList.toggle("hidden", !visivel);
}
