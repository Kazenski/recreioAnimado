// ============================================================================
// Fluxo do PROFESSOR: login com senha, ranking das mais pedidas e gestão.
// ============================================================================

import {
  loginProfessor,
  listarPedidos,
  definirStatusPedido,
  limparPedidos,
} from "./api.js";
import { escapeHtml, toast, mostrar, formatarData } from "./ui.js";

const TOKEN_KEY = "recreio.profToken";
const AUTO_MS = 30000; // atualização automática do painel

let token = null;
let dados = null;
let autoTimer = null;
let callbacks = {};
let el = {};

/** true quando existe um token de sessão guardado. */
export function logado() {
  return !!token;
}

/** Guarda o token no navegador (a validade real é conferida no servidor). */
function guardarToken(t) {
  token = t || null;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch (e) {
    /* localStorage indisponível */
  }
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
function renderKPIs() {
  const d = dados || {};
  el.kpiTotal.textContent = d.total || 0;
  el.kpiPendentes.textContent = d.pendentes || 0;
  el.kpiTocadas.textContent = d.tocadas || 0;
  el.kpiDistintas.textContent = d.musicasDistintas || 0;
  el.rankAtualizado.textContent = d.atualizadoEm
    ? "Atualizado " + new Date(d.atualizadoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : "";
}

function renderRanking() {
  const ranking = (dados && dados.ranking) || [];
  if (!ranking.length) {
    el.listaRanking.innerHTML =
      '<p class="text-sm text-slate-400 text-center py-6">Nenhum pedido ainda.</p>';
    return;
  }
  const max = Math.max(...ranking.map((r) => r.total), 1);
  el.listaRanking.innerHTML = ranking
    .map((r, i) => {
      const pos = i + 1;
      const cor = pos === 1 ? " top1" : pos === 2 ? " top2" : pos === 3 ? " top3" : "";
      const pct = Math.round((r.total / max) * 100);
      return (
        '<div class="rank-item py-1.5">' +
          '<span class="rank-pos' + cor + '">' + pos + "</span>" +
          '<div class="min-w-0 flex-1">' +
            '<div class="flex items-center justify-between gap-2">' +
              '<p class="font-semibold text-sm text-slate-800 truncate">' + escapeHtml(r.musica) + "</p>" +
              '<span class="shrink-0 text-xs font-bold text-recreio-700">' + r.total + "x</span>" +
            "</div>" +
            '<div class="rank-bar mt-1"><span style="width:' + pct + '%"></span></div>' +
            (r.canal ? '<p class="text-[11px] text-slate-400 truncate mt-0.5">' + escapeHtml(r.canal) + "</p>" : "") +
          "</div>" +
        "</div>"
      );
    })
    .join("");
}

function badgeStatus(status) {
  const cls =
    status === "tocada" ? "badge-tocada" : status === "recusada" ? "badge-recusada" : "badge-pendente";
  return '<span class="badge-status ' + cls + '">' + escapeHtml(status) + "</span>";
}

function renderPedidos() {
  const pedidos = (dados && dados.pedidos) || [];
  if (!pedidos.length) {
    el.listaPedidos.innerHTML =
      '<p class="text-sm text-slate-400 text-center py-6">Nenhum pedido registrado ainda.</p>';
    return;
  }
  el.listaPedidos.innerHTML = pedidos
    .map((p) => {
      const meta = [];
      if (p.nomeAluno) meta.push(escapeHtml(p.nomeAluno));
      if (p.turma) meta.push(escapeHtml(p.turma));
      meta.push(formatarData(p.criadoEm));
      return (
        '<div class="pedido ' + (p.status === "tocada" ? "tocada" : "") + '" data-id="' + p.id + '">' +
          '<img alt="" loading="lazy" src="' + escapeHtml(p.thumb) + '" onerror="this.style.visibility=\'hidden\'" />' +
          '<div class="min-w-0 flex-1">' +
            '<p class="pedido-titulo font-semibold text-sm text-slate-800 line-clamp-2">' + escapeHtml(p.musica) + "</p>" +
            '<p class="text-[11px] text-slate-400 truncate">' + meta.join(" · ") + "</p>" +
          "</div>" +
          '<div class="flex flex-col items-end gap-1 shrink-0">' +
            badgeStatus(p.status) +
            '<div class="flex gap-1">' +
              (p.status !== "tocada"
                ? '<button type="button" class="acao p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg" data-acao="tocada" title="Marcar como tocada"><i class="fa-solid fa-check"></i></button>'
                : "") +
              (p.status !== "recusada"
                ? '<button type="button" class="acao p-1.5 text-festa-500 hover:bg-rose-50 rounded-lg" data-acao="recusada" title="Recusar"><i class="fa-solid fa-xmark"></i></button>'
                : "") +
              (p.status !== "pendente"
                ? '<button type="button" class="acao p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg" data-acao="pendente" title="Voltar para pendente"><i class="fa-solid fa-rotate-left"></i></button>'
                : "") +
            "</div>" +
          "</div>" +
        "</div>"
      );
    })
    .join("");
}

function renderTudo() {
  renderKPIs();
  renderRanking();
  renderPedidos();
}

function mostrarEstado(estado) {
  // estado: "login" | "painel"
  mostrar(el.profLogin, estado === "login");
  mostrar(el.profPainel, estado === "painel");
}

// ---------------------------------------------------------------------------
// Dados
// ---------------------------------------------------------------------------
async function carregar(silencioso) {
  if (!token) return;
  if (!silencioso) el.rankAtualizado.textContent = "carregando…";
  try {
    dados = await listarPedidos(token);
    renderTudo();
  } catch (erro) {
    if (/sess/i.test(erro.message) || /autentic/i.test(erro.message)) {
      sair(true);
      toast("Sessão expirada. Entre novamente.", "err");
      return;
    }
    toast(erro.message, "err");
    if (!silencioso) el.rankAtualizado.textContent = "";
  }
}

function iniciarAuto() {
  pararAuto();
  autoTimer = setInterval(() => {
    if (document.getElementById("prof-painel") && !el.profPainel.classList.contains("hidden")) {
      carregar(true);
    }
  }, AUTO_MS);
}

function pararAuto() {
  if (autoTimer) clearInterval(autoTimer);
  autoTimer = null;
}

// ---------------------------------------------------------------------------
// Ações
// ---------------------------------------------------------------------------
export async function sincronizarVista() {
  if (token) {
    mostrarEstado("painel");
    await carregar(false);
    iniciarAuto();
  } else {
    mostrarEstado("login");
    pararAuto();
  }
}

export function sair(silencioso) {
  guardarToken(null);
  dados = null;
  pararAuto();
  mostrarEstado("login");
  if (el.campoSenha) el.campoSenha.value = "";
  if (!silencioso && callbacks.onLogout) callbacks.onLogout();
}

async function entrar(ev) {
  ev.preventDefault();
  const senha = el.campoSenha.value;
  if (!senha) return;

  const btn = el.formLogin.querySelector('button[type="submit"]');
  btn.disabled = true;
  el.loginErro.classList.add("hidden");

  try {
    const r = await loginProfessor(senha);
    guardarToken(r.token);
    el.campoSenha.value = "";
    toast("Bem-vindo, professor! 👋", "ok");
    if (callbacks.onLogin) callbacks.onLogin();
    await sincronizarVista();
  } catch (erro) {
    el.loginErro.textContent = erro.message;
    el.loginErro.classList.remove("hidden");
  } finally {
    btn.disabled = false;
  }
}

async function alterarStatus(id, acao) {
  try {
    await definirStatusPedido(token, id, acao);
    const p = (dados && dados.pedidos || []).find((x) => x.id === id);
    if (p) p.status = acao;
    // Recalcula contadores locais rapidamente e recarrega do servidor.
    await carregar(true);
  } catch (erro) {
    toast(erro.message, "err");
  }
}

async function limpar(modo) {
  const texto =
    modo === "tudo"
      ? "Apagar TODOS os pedidos? Isso não pode ser desfeito."
      : "Apagar os pedidos marcados como tocada?";
  if (!confirm(texto)) return;
  try {
    const r = await limparPedidos(token, modo);
    toast(r.removidos + " pedido(s) apagado(s).", "ok");
    await carregar(false);
  } catch (erro) {
    toast(erro.message, "err");
  }
}

// ---------------------------------------------------------------------------
// Inicialização
// ---------------------------------------------------------------------------
export function initProfessor(cbs = {}) {
  callbacks = cbs || {};
  el = {
    profLogin: document.getElementById("prof-login"),
    profPainel: document.getElementById("prof-painel"),
    formLogin: document.getElementById("form-login"),
    campoSenha: document.getElementById("campo-senha"),
    loginErro: document.getElementById("login-erro"),
    kpiTotal: document.getElementById("kpi-total"),
    kpiPendentes: document.getElementById("kpi-pendentes"),
    kpiTocadas: document.getElementById("kpi-tocadas"),
    kpiDistintas: document.getElementById("kpi-distintas"),
    rankAtualizado: document.getElementById("rank-atualizado"),
    listaRanking: document.getElementById("lista-ranking"),
    listaPedidos: document.getElementById("lista-pedidos"),
    btnAtualizar: document.getElementById("btn-atualizar"),
    btnLimparTocadas: document.getElementById("btn-limpar-tocadas"),
    btnLimparTudo: document.getElementById("btn-limpar-tudo"),
  };

  el.formLogin.addEventListener("submit", entrar);
  el.btnAtualizar.addEventListener("click", () => carregar(false));
  el.btnLimparTocadas.addEventListener("click", () => limpar("tocadas"));
  el.btnLimparTudo.addEventListener("click", () => limpar("tudo"));

  el.listaPedidos.addEventListener("click", (ev) => {
    const botao = ev.target.closest(".acao");
    if (!botao) return;
    const card = botao.closest(".pedido");
    if (!card) return;
    alterarStatus(card.dataset.id, botao.dataset.acao);
  });

  // Restaura a sessão salva (o servidor confirma na primeira chamada).
  try {
    token = localStorage.getItem(TOKEN_KEY) || null;
  } catch (e) {
    token = null;
  }
  mostrarEstado(token ? "painel" : "login");
  if (token) {
    if (callbacks.onLogin) callbacks.onLogin();
    carregar(false);
    iniciarAuto();
  }
}
