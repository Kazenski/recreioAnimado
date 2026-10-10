// ============================================================================
// Fluxo do ALUNO: busca com autocomplete no YouTube, seleção e envio do pedido.
// ============================================================================

import { buscarMusica, registrarPedido, listarTurmas } from "./api.js";
import { FIREBASE_CONFIGURADO } from "./firebase.js";
import { escapeHtml, toast, mostrar } from "./ui.js";

const DEBOUNCE_MS = 350;
const MIN_CHARS = 2;
const COOLDOWN_S = 20;
const ID_CLIENTE_KEY = "recreio.clienteId";

// ---------------------------------------------------------------------------
// Estado do módulo
// ---------------------------------------------------------------------------
let selecionada = null; // { videoId, titulo, canal, thumb }
let sugestoes = [];
let indiceAtivo = -1;
let timerBusca = null;
let seqBusca = 0;
let cooldownTimer = null;
let cooldownAte = 0;

let el = {};

/** Devolve (criando se necessário) um id anônimo deste dispositivo. */
function idCliente() {
  try {
    let id = localStorage.getItem(ID_CLIENTE_KEY);
    if (!id) {
      id = "c_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(ID_CLIENTE_KEY, id);
    }
    return id;
  } catch (e) {
    return "c_anon";
  }
}

// ---------------------------------------------------------------------------
// Sugestões
// ---------------------------------------------------------------------------
function abrirCaixa() {
  mostrar(el.caixaSugestoes, true);
}

function fecharCaixa() {
  mostrar(el.caixaSugestoes, false);
  indiceAtivo = -1;
}

function mostrarStatus(texto, girando) {
  el.statusSugestoes.innerHTML =
    (girando ? '<i class="fa-solid fa-spinner fa-spin"></i>' : '<i class="fa-solid fa-circle-info"></i>') +
    " <span>" + escapeHtml(texto) + "</span>";
  el.statusSugestoes.classList.remove("hidden");
}

function renderSugestoes() {
  el.listaSugestoes.innerHTML = "";
  if (!sugestoes.length) return;

  sugestoes.forEach((item, i) => {
    const li = document.createElement("li");
    li.className = "sug-item" + (i === indiceAtivo ? " ativo" : "");
    li.dataset.index = String(i);
    li.innerHTML =
      '<img class="sug-thumb" alt="" loading="lazy" src="' + escapeHtml(item.thumb) + '" ' +
        'onerror="this.style.visibility=\'hidden\'" />' +
      '<div class="min-w-0">' +
        '<p class="sug-titulo line-clamp-2">' + escapeHtml(item.titulo) + "</p>" +
        '<p class="text-xs text-slate-500 truncate">' + escapeHtml(item.canal) + "</p>" +
      "</div>" +
      '<i class="fa-solid fa-plus ml-auto text-recreio-400"></i>';
    el.listaSugestoes.appendChild(li);
  });
}

function atualizarAtivo() {
  [...el.listaSugestoes.children].forEach((li, i) => {
    li.classList.toggle("ativo", i === indiceAtivo);
  });
  const ativo = el.listaSugestoes.children[indiceAtivo];
  if (ativo) ativo.scrollIntoView({ block: "nearest" });
}

// ---------------------------------------------------------------------------
// Busca
// ---------------------------------------------------------------------------
async function executarBusca(termo) {
  const meuSeq = ++seqBusca;
  abrirCaixa();
  mostrarStatus("Buscando no YouTube…", true);
  el.listaSugestoes.innerHTML = "";

  try {
    const dados = await buscarMusica(termo);
    if (meuSeq !== seqBusca) return; // resposta antiga: ignora
    sugestoes = dados.resultados || [];
    indiceAtivo = -1;
    if (!sugestoes.length) {
      mostrarStatus("Nenhuma música encontrada. Tente outro nome.", false);
      return;
    }
    mostrarStatus(
      sugestoes.length + " resultado(s). Toque para escolher.",
      false
    );
    renderSugestoes();
  } catch (erro) {
    if (meuSeq !== seqBusca) return;
    sugestoes = [];
    mostrarStatus(erro.message, false);
  }
}

function aoDigitar() {
  const termo = el.campoBusca.value.trim();
  mostrar(el.btnLimparBusca, termo.length > 0);

  clearTimeout(timerBusca);
  if (termo.length < MIN_CHARS) {
    fecharCaixa();
    return;
  }
  timerBusca = setTimeout(() => executarBusca(termo), DEBOUNCE_MS);
}

// ---------------------------------------------------------------------------
// Seleção
// ---------------------------------------------------------------------------
function selecionar(indice) {
  const item = sugestoes[indice];
  if (!item) return;
  selecionada = {
    videoId: item.videoId,
    titulo: item.titulo,
    canal: item.canal,
    thumb: item.thumb,
  };
  el.selTitulo.textContent = item.titulo;
  el.selCanal.textContent = item.canal || "YouTube";
  el.selThumb.src = item.thumb || "";
  mostrar(el.selecionada, true);
  mostrar(el.ajudaBusca, false);
  fecharCaixa();
  el.campoBusca.value = item.titulo;
  mostrar(el.btnLimparBusca, true);
  atualizarBotaoEnviar();
}

function limparSelecao(limparCampo = true) {
  selecionada = null;
  mostrar(el.selecionada, false);
  mostrar(el.ajudaBusca, true);
  if (limparCampo) {
    el.campoBusca.value = "";
    mostrar(el.btnLimparBusca, false);
  }
  atualizarBotaoEnviar();
}

// ---------------------------------------------------------------------------
// Turmas (seletor)
// ---------------------------------------------------------------------------
function preencherTurmas(turmas) {
  el.campoTurma.innerHTML =
    '<option value="" disabled selected>Escolha sua turma…</option>';
  (turmas || []).forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    el.campoTurma.appendChild(opt);
  });
  atualizarBotaoEnviar();
}

async function carregarTurmas() {
  try {
    const r = await listarTurmas();
    preencherTurmas(r.turmas || []);
  } catch (erro) {
    preencherTurmas([]);
    toast("Não foi possível carregar as turmas. Recarregue a página.", "err");
  }
}

// ---------------------------------------------------------------------------
// Envio
// ---------------------------------------------------------------------------
function emCooldown() {
  return Date.now() < cooldownAte;
}

function atualizarBotaoEnviar() {
  if (emCooldown()) return;
  const turmaOk = !!el.campoTurma && el.campoTurma.value.trim().length > 0;
  const pronto = !!selecionada && FIREBASE_CONFIGURADO && turmaOk;
  el.btnEnviar.disabled = !pronto;
  el.btnEnviar.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Enviar pedido';
}

function iniciarCooldown(segundos) {
  cooldownAte = Date.now() + segundos * 1000;
  el.btnEnviar.disabled = true;
  const passo = () => {
    const resta = Math.ceil((cooldownAte - Date.now()) / 1000);
    if (resta <= 0) {
      clearInterval(cooldownTimer);
      cooldownTimer = null;
      atualizarBotaoEnviar();
      return;
    }
    el.btnEnviar.innerHTML =
      '<i class="fa-solid fa-hourglass-half"></i> Aguarde ' + resta + "s…";
  };
  passo();
  clearInterval(cooldownTimer);
  cooldownTimer = setInterval(passo, 500);
}

function mostrarSucesso(musica) {
  el.feedback.className = "mt-4";
  el.feedback.innerHTML =
    '<div class="sucesso">' +
      '<span class="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-500 text-white">' +
        '<i class="fa-solid fa-check"></i>' +
      "</span>" +
      "<div><p class=\"font-bold\">Pedido registrado! 🎉</p>" +
      '<p class="text-sm">“' + escapeHtml(musica) + "” foi enviada para o professor.</p></div>" +
    "</div>";
  mostrar(el.feedback, true);
}

function mostrarErro(mensagem) {
  el.feedback.className = "mt-4";
  el.feedback.innerHTML = '<div class="erro">' + escapeHtml(mensagem) + "</div>";
  mostrar(el.feedback, true);
}

async function enviar() {
  if (!selecionada || emCooldown()) return;
  if (!el.campoTurma.value.trim()) {
    toast("Escolha sua turma para enviar o pedido.", "err");
    el.campoTurma.focus();
    return;
  }

  el.btnEnviar.disabled = true;
  el.btnEnviar.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enviando…';

  const musicaEnviada = selecionada.titulo;
  try {
    await registrarPedido({
      musica: selecionada.titulo,
      videoId: selecionada.videoId,
      canal: selecionada.canal,
      thumb: selecionada.thumb,
      nomeAluno: el.campoNome.value.trim(),
      turma: el.campoTurma.value.trim(),
      clienteId: idCliente(),
    });

    mostrarSucesso(musicaEnviada);
    toast("Pedido enviado! 🎵", "ok");
    limparSelecao();
    // Limpa o nome depois de enviar, para o próximo pedido.
    el.campoNome.value = "";
    el.campoTurma.value = "";
    iniciarCooldown(COOLDOWN_S);
  } catch (erro) {
    mostrarErro(erro.message);
    toast(erro.message, "err");
    el.btnEnviar.disabled = false;
    atualizarBotaoEnviar();
  }
}

// ---------------------------------------------------------------------------
// Inicialização
// ---------------------------------------------------------------------------
export function initAluno() {
  el = {
    campoBusca: document.getElementById("campo-busca"),
    btnLimparBusca: document.getElementById("btn-limpar-busca"),
    caixaSugestoes: document.getElementById("caixa-sugestoes"),
    statusSugestoes: document.getElementById("status-sugestoes"),
    listaSugestoes: document.getElementById("lista-sugestoes"),
    ajudaBusca: document.getElementById("ajuda-busca"),
    selecionada: document.getElementById("selecionada"),
    selThumb: document.getElementById("sel-thumb"),
    selTitulo: document.getElementById("sel-titulo"),
    selCanal: document.getElementById("sel-canal"),
    btnRemoverSel: document.getElementById("btn-remover-sel"),
    btnEnviar: document.getElementById("btn-enviar"),
    feedback: document.getElementById("feedback"),
    campoNome: document.getElementById("campo-nome"),
    campoTurma: document.getElementById("campo-turma"),
  };

  el.campoBusca.addEventListener("input", aoDigitar);

  el.campoBusca.addEventListener("keydown", (ev) => {
    if (ev.key === "ArrowDown") {
      ev.preventDefault();
      if (!sugestoes.length) return;
      indiceAtivo = Math.min(indiceAtivo + 1, sugestoes.length - 1);
      atualizarAtivo();
    } else if (ev.key === "ArrowUp") {
      ev.preventDefault();
      indiceAtivo = Math.max(indiceAtivo - 1, 0);
      atualizarAtivo();
    } else if (ev.key === "Enter") {
      ev.preventDefault();
      if (indiceAtivo >= 0 && sugestoes[indiceAtivo]) {
        selecionar(indiceAtivo);
      } else if (sugestoes.length === 1) {
        selecionar(0);
      } else if (el.campoBusca.value.trim().length >= MIN_CHARS) {
        executarBusca(el.campoBusca.value.trim());
      }
    } else if (ev.key === "Escape") {
      fecharCaixa();
    }
  });

  el.listaSugestoes.addEventListener("click", (ev) => {
    const li = ev.target.closest(".sug-item");
    if (!li) return;
    selecionar(Number(li.dataset.index));
  });

  el.btnLimparBusca.addEventListener("click", () => {
    limparSelecao();
    el.campoBusca.focus();
    fecharCaixa();
  });

  el.btnRemoverSel.addEventListener("click", () => limparSelecao());

  el.btnEnviar.addEventListener("click", enviar);

  // A turma escolhida atualiza o botão de envio.
  el.campoTurma.addEventListener("input", atualizarBotaoEnviar);
  el.campoTurma.addEventListener("change", atualizarBotaoEnviar);

  // Recarrega as turmas ao abrir o seletor (professor pode ter cadastrado novas).
  el.campoTurma.addEventListener("focus", carregarTurmas);
  el.campoTurma.addEventListener("click", carregarTurmas);

  // Fecha o dropdown ao tocar fora.
  document.addEventListener("click", (ev) => {
    if (!el.campoBusca.parentElement.parentElement.contains(ev.target)) {
      fecharCaixa();
    }
  });

  atualizarBotaoEnviar();
  if (FIREBASE_CONFIGURADO) carregarTurmas();

  if (!FIREBASE_CONFIGURADO) {
    mostrarErro(
      "O site ainda não está conectado ao Firebase. Configure as credenciais (veja o README) para buscar e enviar pedidos."
    );
  }
}
