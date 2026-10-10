// ============================================================================
// Configuração e inicialização do Firebase.
//
// Os valores abaixo são PÚBLICOS (podem aparecer no navegador). No deploy pelo
// GitHub Actions, o workflow substitui os marcadores __VITE_FIREBASE_* pelos
// Secrets do repositório. Em desenvolvimento local, defina
// window.__FIREBASE_CONFIG__ antes de carregar este módulo (veja README).
// ============================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-functions.js";

/** Região das Cloud Functions — deve ser a mesma do functions/index.js. */
export const REGIAO = "us-central1";

const cfgLocal =
  (typeof window !== "undefined" && window.__FIREBASE_CONFIG__) || null;

const firebaseConfig = cfgLocal || {
  apiKey: "__VITE_FIREBASE_API_KEY__",
  authDomain: "__VITE_FIREBASE_AUTH_DOMAIN__",
  projectId: "__VITE_FIREBASE_PROJECT_ID__",
  storageBucket: "__VITE_FIREBASE_STORAGE_BUCKET__",
  messagingSenderId: "__VITE_FIREBASE_MESSAGING_SENDER_ID__",
  appId: "__VITE_FIREBASE_APP_ID__",
};

/** true quando os marcadores já foram substituídos por valores reais. */
export const FIREBASE_CONFIGURADO = !String(firebaseConfig.apiKey || "").startsWith("__");

let app = null;
let functions = null;

if (FIREBASE_CONFIGURADO) {
  try {
    app = initializeApp(firebaseConfig);
    functions = getFunctions(app, REGIAO);
  } catch (erro) {
    console.error("Falha ao inicializar o Firebase:", erro);
    app = null;
    functions = null;
  }
} else {
  console.warn(
    "[Recreio Animado] Firebase não configurado. O site abre, mas as buscas e " +
      "o envio de pedidos ficam desativados até configurar as credenciais."
  );
}

/**
 * Devolve uma função HTTPS Callable do Firebase.
 * Uso: const resposta = await chamar("buscarMusica")({ q: "abc" });
 */
export function chamar(nome) {
  if (!functions) {
    throw new Error(
      "Firebase não configurado neste ambiente. Consulte o README (seção de configuração)."
    );
  }
  return httpsCallable(functions, nome);
}

export { app, functions };
