// ============================================================================
// Camada de acesso à API (Cloud Functions).
// Todas as chamadas ao backend passam por aqui, com tratamento de erro
// uniforme: cada função devolve os dados ou lança um Error com mensagem
// amigável em português.
// ============================================================================

import { chamar } from "./firebase.js";

/** Extrai uma mensagem legível de um erro do Firebase Functions. */
function mensagemErro(erro) {
  if (!erro) return "Algo deu errado. Tente novamente.";
  // Os erros das callable trazem a mensagem em erro.message.
  const msg = erro.message || erro.details || "";
  if (msg && !/^internal$/i.test(msg)) return msg;
  return "Não foi possível completar a ação. Tente novamente em instantes.";
}

/** Envolve uma chamada e garante o formato de retorno consistente. */
async function executar(nome, dados) {
  try {
    const resposta = await chamar(nome)(dados || {});
    return resposta.data;
  } catch (erro) {
    throw new Error(mensagemErro(erro));
  }
}

/** Busca músicas no YouTube. Devolve { resultados: [...] }. */
export function buscarMusica(q) {
  return executar("buscarMusica", { q });
}

/** Registra o pedido do aluno. */
export function registrarPedido(dados) {
  return executar("registrarPedido", dados);
}

/** Autentica o professor e devolve { token, expiraEm }. */
export function loginProfessor(senha) {
  return executar("loginProfessor", { senha });
}

/**
 * Lista o ranking e os pedidos recentes (requer token do professor).
 * opcoes: { turma: "" (todas) | "7º B", top: 10 }.
 */
export function listarPedidos(token, opcoes = {}) {
  return executar("listarPedidos", {
    token,
    turma: opcoes.turma || "",
    top: opcoes.top || 10,
  });
}

/** Marca um pedido como pendente/tocada/recusada. */
export function definirStatusPedido(token, id, status) {
  return executar("definirStatusPedido", { token, id, status });
}

/** Remove pedidos: modo "tocadas" (padrão) ou "tudo". */
export function limparPedidos(token, modo) {
  return executar("limparPedidos", { token, modo });
}

/** Lista as turmas cadastradas (público — alimenta o seletor do aluno). */
export function listarTurmas() {
  return executar("listarTurmas", {});
}

/** Cadastra uma turma (professor). Devolve a lista atualizada. */
export function criarTurma(token, nome) {
  return executar("criarTurma", { token, nome });
}

/** Remove uma turma cadastrada (professor). Devolve a lista atualizada. */
export function removerTurma(token, nome) {
  return executar("removerTurma", { token, nome });
}
