// ============================================================================
// Ponto de entrada do site: liga o fluxo do aluno e o painel do professor,
// controlando qual "tela" está visível (aluno x professor).
// ============================================================================

import { initAluno } from "./aluno.js";
import * as prof from "./professor.js";

// ---------------------------------------------------------------------------
// Troca de tela
// ---------------------------------------------------------------------------
function showView(nome) {
  const aluno = document.getElementById("view-aluno");
  const professor = document.getElementById("view-professor");
  aluno.classList.toggle("hidden", nome !== "aluno");
  professor.classList.toggle("hidden", nome !== "professor");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ---------------------------------------------------------------------------
// Cabeçalho conforme o estado de login
// ---------------------------------------------------------------------------
function atualizarCabecalho() {
  const logado = prof.logado();
  document.getElementById("selo-logado").classList.toggle("hidden", !logado);
  document.getElementById("btn-sair").classList.toggle("hidden", !logado);
  document.getElementById("btn-painel").classList.toggle("hidden", logado);
}

// ---------------------------------------------------------------------------
// Versão exibida no rodapé
// Lê o changelog.json para nunca ficar defasada em relação ao CHANGELOG.md.
// ---------------------------------------------------------------------------
async function atualizarVersao() {
  const link = document.getElementById("link-versao");
  if (!link) return;
  try {
    const resp = await fetch("changelog.json", { cache: "no-store" });
    if (!resp.ok) return;
    const dados = await resp.json();
    if (dados && dados.versaoAtual) link.textContent = "v" + dados.versaoAtual;
  } catch (e) {
    /* mantém o texto estático como reserva */
  }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
function iniciar() {
  initAluno();
  atualizarVersao();

  prof.initProfessor({
    onLogin: atualizarCabecalho,
    onLogout: () => {
      atualizarCabecalho();
      showView("aluno");
    },
  });

  document.getElementById("btn-painel").addEventListener("click", () => {
    showView("professor");
    prof.sincronizarVista();
  });

  document.getElementById("btn-sair").addEventListener("click", () => {
    prof.sair();
    atualizarCabecalho();
    showView("aluno");
  });

  const voltar1 = document.getElementById("btn-voltar-aluno");
  const voltar2 = document.getElementById("btn-voltar-aluno2");
  if (voltar1) voltar1.addEventListener("click", () => showView("aluno"));
  if (voltar2) voltar2.addEventListener("click", () => showView("aluno"));

  atualizarCabecalho();
  showView("aluno");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", iniciar);
} else {
  iniciar();
}
