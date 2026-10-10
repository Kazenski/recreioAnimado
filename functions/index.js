/**
 * ============================================================================
 * RECREIO ANIMADO — Cloud Functions
 * ----------------------------------------------------------------------------
 * Backend do site de pedidos de música do recreio.
 *
 * Funções exportadas (todas HTTPS Callable, região us-central1):
 *   - buscarMusica        -> busca/valida músicas no YouTube (com cache)
 *   - registrarPedido     -> grava o pedido do aluno no Firestore
 *   - loginProfessor      -> valida a senha simples e devolve um token
 *   - listarPedidos       -> devolve o ranking + pedidos recentes (professor)
 *   - definirStatusPedido -> marca um pedido como tocada/recusada (professor)
 *   - limparPedidos       -> apaga pedidos tocados ou todos (professor)
 *   - listarTurmas        -> devolve as turmas cadastradas (público)
 *   - criarTurma          -> cadastra uma turma (professor)
 *   - removerTurma        -> remove uma turma cadastrada (professor)
 *
 * Segredos necessários (NÃO ficam no código):
 *   firebase functions:secrets:set YOUTUBE_API_KEY
 *   firebase functions:secrets:set PROF_SENHA
 *
 * O site (GitHub Pages) é estático: nada é gravado no navegador de forma
 * confiável. Toda a lógica sensível vive aqui, no servidor.
 * ============================================================================
 */

const crypto = require('crypto');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const {
  getFirestore,
  FieldValue,
  Timestamp,
} = require('firebase-admin/firestore');

initializeApp();

const db = getFirestore();

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

/** Região das funções. Precisa ser a MESMA usada no frontend (js/firebase.js). */
const REGIAO = 'us-central1';

/** Chave da YouTube Data API v3 (server-side). */
const youtubeApiKey = defineSecret('YOUTUBE_API_KEY');

/** Senha simples do professor (painel logado). */
const senhaProfessor = defineSecret('PROF_SENHA');

/** Validade da sessão do professor, em horas. */
const HORAS_SESSAO = 12;

/** TTL do cache de buscas no YouTube, em horas (economiza cota). */
const HORAS_CACHE = 24;

/** TTL do cache de buscas sem resultado, em horas. */
const HORAS_CACHE_VAZIO = 6;

/** Quantidade máxima de resultados devolvidos na busca. */
const MAX_RESULTADOS = 8;

/** Intervalo mínimo entre dois pedidos do mesmo dispositivo, em segundos. */
const SEGUNDOS_ENTRE_PEDIDOS = 15;

/** Coleções do Firestore. */
const COL_PEDIDOS = 'pedidosRecreio';
const COL_CACHE = 'cacheBuscas';
const COL_SESSOES = 'sessoesProfessor';
const COL_CONTROLE = 'controlePedidos';
const COL_TURMAS = 'turmasRecreio';

/** Regras de nome de música. */
const MIN_MUSICA = 2;
const MAX_MUSICA = 140;

const OPCOES_BASE = { region: REGIAO };
const OPCOES_YOUTUBE = { region: REGIAO, secrets: [youtubeApiKey] };
const OPCOES_PROFESSOR = { region: REGIAO, secrets: [senhaProfessor] };

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

/**
 * Normaliza um texto para ser usado como chave de cache:
 * minúsculas, sem acentos e com espaços colapsados.
 */
function normalizar(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Gera a chave de cache (sha1) a partir do termo normalizado. */
function chaveCache(termo) {
  return crypto.createHash('sha1').update(normalizar(termo)).digest('hex');
}

/** Verifica se um texto tem tamanho aceitável para nome de música. */
function musicaValida(musica) {
  const len = String(musica || '').trim().length;
  return len >= MIN_MUSICA && len <= MAX_MUSICA;
}

/** Confere o formato de um ID de vídeo do YouTube (11 caracteres). */
function videoIdPlausivel(videoId) {
  return typeof videoId === 'string' && /^[A-Za-z0-9_-]{11}$/.test(videoId);
}

/**
 * Tenta extrair um ID de vídeo de uma URL do YouTube colada pelo aluno.
 * Aceita formatos: youtu.be/ID, youtube.com/watch?v=ID, /embed/ID, /shorts/ID
 * Retorna null quando não encontra.
 */
function extrairVideoId(texto) {
  const s = String(texto || '').trim();
  if (videoIdPlausivel(s)) return s;
  const m = s.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|v\/))([A-Za-z0-9_-]{11})/
  );
  return m ? m[1] : null;
}

/** Data/hora atual em ISO, para respostas simples. */
function agoraISO() {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// YouTube
// ---------------------------------------------------------------------------

/**
 * Busca vídeos no YouTube usando a YouTube Data API v3.
 * Lança HttpsError com mensagem amigável em caso de falha.
 */
async function consultarYouTube(termo) {
  const key = youtubeApiKey.value();
  if (!key) {
    throw new HttpsError(
      'failed-precondition',
      'A chave do YouTube não está configurada no servidor. Peça ao responsável para configurar o segredo YOUTUBE_API_KEY.'
    );
  }

  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('key', key);
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('type', 'video');
  url.searchParams.set('maxResults', String(MAX_RESULTADOS));
  url.searchParams.set('q', termo);
  url.searchParams.set('regionCode', 'BR');
  url.searchParams.set('relevanceLanguage', 'pt');
  url.searchParams.set('videoEmbeddable', 'true');
  // Filtro de conteúdo: importante para ambiente escolar.
  url.searchParams.set('safeSearch', 'moderate');

  let resp;
  try {
    resp = await fetch(url.toString());
  } catch (erro) {
    console.error('Falha de rede ao chamar o YouTube:', erro);
    throw new HttpsError(
      'unavailable',
      'Não foi possível falar com o YouTube agora. Tente novamente em instantes.'
    );
  }

  let data;
  try {
    data = await resp.json();
  } catch (erro) {
    throw new HttpsError('internal', 'Resposta inválida do YouTube.');
  }

  if (!resp.ok || data.error) {
    const motivo = data && data.error && data.error.errors && data.error.errors[0]
      ? data.error.errors[0].reason
      : 'unknown';
    console.error('Erro do YouTube:', motivo, data.error);

    if (motivo === 'quotaExceeded' || motivo === 'dailyLimitExceeded') {
      throw new HttpsError(
        'resource-exhausted',
        'A cota diária de buscas do YouTube acabou. Tente novamente mais tarde ou avise o professor.'
      );
    }
    if (motivo === 'keyInvalid' || motivo === 'badRequest' && !data.items) {
      throw new HttpsError(
        'failed-precondition',
        'A chave do YouTube parece inválida. Avise o responsável pelo site.'
      );
    }
    if (motivo === 'ipRefererBlocked') {
      throw new HttpsError(
        'failed-precondition',
        'A chave do YouTube está restrita por site (referrer). Para uso no servidor, remova a restrição de referrer da chave.'
      );
    }
    throw new HttpsError('internal', 'O YouTube recusou a busca. Tente novamente.');
  }

  const itens = Array.isArray(data.items) ? data.items : [];
  return itens
    .map((item) => {
      const sn = item.snippet || {};
      const thumbs = sn.thumbnails || {};
      const thumb =
        (thumbs.medium && thumbs.medium.url) ||
        (thumbs.default && thumbs.default.url) ||
        '';
      return {
        videoId: item.id && item.id.videoId,
        titulo: sn.title || '',
        canal: sn.channelTitle || '',
        thumb,
      };
    })
    .filter((r) => videoIdPlausivel(r.videoId) && r.titulo);
}

/**
 * Busca com cache no Firestore. Evita gastar cota repetindo o mesmo termo.
 * Retorna { resultados, doCache }.
 */
async function buscarComCache(termo) {
  const chave = chaveCache(termo);
  const ref = db.collection(COL_CACHE).doc(chave);
  const snap = await ref.get();

  if (snap.exists) {
    const dados = snap.data() || {};
    const criado = dados.criadoEm && dados.criadoEm.toMillis
      ? dados.criadoEm.toMillis()
      : 0;
    const horas = (dados.resultados || []).length ? HORAS_CACHE : HORAS_CACHE_VAZIO;
    const valido = criado && Date.now() - criado < horas * 60 * 60 * 1000;
    if (valido) {
      return { resultados: dados.resultados || [], doCache: true };
    }
  }

  const resultados = await consultarYouTube(termo);

  // Grava o cache (inclusive vazio, com TTL menor).
  try {
    await ref.set({
      termo: termo,
      resultados: resultados,
      criadoEm: FieldValue.serverTimestamp(),
      expiraEm: Timestamp.fromMillis(
        Date.now() +
          (resultados.length ? HORAS_CACHE : HORAS_CACHE_VAZIO) * 60 * 60 * 1000
      ),
    });
  } catch (erro) {
    // Falha ao gravar cache não deve derrubar a busca.
    console.warn('Não foi possível gravar o cache de busca:', erro);
  }

  return { resultados, doCache: false };
}

// ---------------------------------------------------------------------------
// Sessão do professor
// ---------------------------------------------------------------------------

/** Compara a senha informada com o segredo, em tempo constante. */
function senhaCorreta(informada) {
  const esperada = senhaProfessor.value();
  if (!esperada) return false;
  const a = crypto.createHash('sha256').update(String(informada)).digest();
  const b = crypto.createHash('sha256').update(String(esperada)).digest();
  return crypto.timingSafeEqual(a, b);
}

/** Cria uma sessão de professor e devolve o token. */
async function criarSessao() {
  const token = crypto.randomBytes(24).toString('hex');
  const expiraEm = Timestamp.fromMillis(Date.now() + HORAS_SESSAO * 60 * 60 * 1000);
  await db.collection(COL_SESSOES).doc(token).set({
    criadoEm: FieldValue.serverTimestamp(),
    expiraEm,
  });
  return { token, expiraEm };
}

/**
 * Valida um token de sessão. Devolve true/false.
 * Remove sessões expiradas quando as encontra.
 */
async function tokenValido(token) {
  if (typeof token !== 'string' || token.length < 16) return false;
  const ref = db.collection(COL_SESSOES).doc(token);
  const snap = await ref.get();
  if (!snap.exists) return false;
  const exp = snap.data().expiraEm;
  if (!exp || exp.toMillis() <= Date.now()) {
    try {
      await ref.delete();
    } catch (erro) {
      /* ignora */
    }
    return false;
  }
  return true;
}

/** Exige um token de professor válido ou lança erro. */
async function exigirProfessor(token) {
  if (!(await tokenValido(token))) {
    throw new HttpsError(
      'unauthenticated',
      'Sessão expirada ou inválida. Entre novamente com a senha.'
    );
  }
}

// ---------------------------------------------------------------------------
// 1) Buscar música no YouTube
// ---------------------------------------------------------------------------

exports.buscarMusica = onCall(OPCOES_YOUTUBE, async (request) => {
  const termo = String((request.data && request.data.q) || '').trim();
  if (termo.length < MIN_MUSICA) {
    return { resultados: [], termo };
  }
  if (termo.length > MAX_MUSICA) {
    throw new HttpsError('invalid-argument', 'O texto da busca é longo demais.');
  }

  // Se o aluno colou um link do YouTube, devolve o vídeo direto.
  const idColado = extrairVideoId(termo);
  if (idColado && /youtu\.?be/i.test(termo)) {
    const { resultados } = await buscarComCache(termo);
    const achado = resultados.find((r) => r.videoId === idColado);
    if (achado) return { resultados: [achado], termo };
  }

  const { resultados, doCache } = await buscarComCache(termo);
  return { resultados, termo, doCache };
});

// ---------------------------------------------------------------------------
// 2) Registrar pedido do aluno
// ---------------------------------------------------------------------------

exports.registrarPedido = onCall(OPCOES_YOUTUBE, async (request) => {
  const dados = request.data || {};
  let musica = String(dados.musica || '').trim();
  let videoId = videoIdPlausivel(dados.videoId) ? dados.videoId : null;
  let canal = String(dados.canal || '').trim().slice(0, 120);
  let thumb = String(dados.thumb || '').trim().slice(0, 300);
  const nomeAluno = String(dados.nomeAluno || '').trim().slice(0, 60);
  const turma = String(dados.turma || '').trim().slice(0, 60);
  const escola = String(dados.escola || '').trim().slice(0, 80);
  const clienteId = String(dados.clienteId || '').trim().slice(0, 80);

  if (!musicaValida(musica)) {
    throw new HttpsError(
      'invalid-argument',
      'Escreva o nome da música (entre 2 e 140 caracteres).'
    );
  }

  // Controle simples de flood por dispositivo.
  const chaveCliente = clienteId || (request.rawRequest && request.rawRequest.ip) || 'anon';
  const refControle = db.collection(COL_CONTROLE).doc(chaveCache(chaveCliente));
  const controle = await refControle.get();
  if (controle.exists) {
    const ultimo = controle.data().ultimoPedido;
    const ultimoMs = ultimo && ultimo.toMillis ? ultimo.toMillis() : 0;
    const faltam = SEGUNDOS_ENTRE_PEDIDOS * 1000 - (Date.now() - ultimoMs);
    if (faltam > 0) {
      throw new HttpsError(
        'resource-exhausted',
        `Calma aí! Espere ${Math.ceil(faltam / 1000)}s para enviar outro pedido.`
      );
    }
  }

  // Se não veio videoId, resolve pelo YouTube (e valida que existe).
  if (!videoId) {
    const idColado = extrairVideoId(musica);
    if (idColado) {
      videoId = idColado;
    } else {
      const { resultados } = await buscarComCache(musica);
      if (!resultados.length) {
        throw new HttpsError(
          'not-found',
          'Não encontramos essa música no YouTube. Confira o nome e tente de novo.'
        );
      }
      const escolhido = resultados[0];
      videoId = escolhido.videoId;
      musica = dados.musica && dados.musica.trim() ? musica : escolhido.titulo;
      if (!canal) canal = escolhido.canal;
      if (!thumb) thumb = escolhido.thumb;
    }
  }

  const ref = db.collection(COL_PEDIDOS).doc();
  await ref.set({
    musica,
    videoId,
    canal,
    thumb,
    nomeAluno,
    turma,
    escola,
    status: 'pendente',
    criadoEm: FieldValue.serverTimestamp(),
  });

  await refControle.set(
    { ultimoPedido: FieldValue.serverTimestamp() },
    { merge: true }
  );

  return {
    ok: true,
    id: ref.id,
    musica,
    videoId,
    criadoEm: agoraISO(),
  };
});

// ---------------------------------------------------------------------------
// 3) Login do professor
// ---------------------------------------------------------------------------

exports.loginProfessor = onCall(OPCOES_PROFESSOR, async (request) => {
  const senha = String((request.data && request.data.senha) || '');
  if (!senha) {
    throw new HttpsError('invalid-argument', 'Digite a senha do professor.');
  }
  if (!senhaCorreta(senha)) {
    // Pequeno atraso para dificultar tentativa e erro.
    await new Promise((r) => setTimeout(r, 800));
    throw new HttpsError('unauthenticated', 'Senha incorreta.');
  }
  const { token, expiraEm } = await criarSessao();
  return { ok: true, token, expiraEm: expiraEm.toMillis(), horas: HORAS_SESSAO };
});

// ---------------------------------------------------------------------------
// 4) Listar pedidos + ranking (professor)
// ---------------------------------------------------------------------------

exports.listarPedidos = onCall(OPCOES_BASE, async (request) => {
  const dados = request.data || {};
  await exigirProfessor(dados.token);

  // `limite`: quantos pedidos recentes entram no cálculo.
  // `top`: tamanho do ranking devolvido (padrão: Top 10).
  // `turma`: filtro opcional; vazio = todas as turmas.
  const limite = Math.min(Math.max(parseInt(dados.limite, 10) || 500, 1), 1000);
  const top = Math.min(Math.max(parseInt(dados.top, 10) || 10, 1), 50);
  const turmaFiltro = String(dados.turma || '').trim().slice(0, 60);

  const snap = await db
    .collection(COL_PEDIDOS)
    .orderBy('criadoEm', 'desc')
    .limit(limite)
    .get();

  const pedidos = [];
  const turmas = new Set();
  let mapa = new Map();

  snap.forEach((doc) => {
    const d = doc.data() || {};
    const criadoEm = d.criadoEm && d.criadoEm.toMillis ? d.criadoEm.toMillis() : 0;
    pedidos.push({
      id: doc.id,
      musica: d.musica || '',
      videoId: d.videoId || '',
      canal: d.canal || '',
      thumb: d.thumb || '',
      nomeAluno: d.nomeAluno || '',
      turma: d.turma || '',
      escola: d.escola || '',
      status: d.status || 'pendente',
      criadoEm,
    });

    const chave = d.videoId || normalizar(d.musica);
    const atual = mapa.get(chave) || {
      videoId: d.videoId || '',
      musica: d.musica || '',
      canal: d.canal || '',
      thumb: d.thumb || '',
      total: 0,
      ultimaEm: 0,
    };
    atual.total += 1;
    atual.ultimaEm = Math.max(atual.ultimaEm, criadoEm);
    mapa.set(chave, atual);

    const t = (d.turma || '').trim();
    if (t) turmas.add(t);
  });

  // Filtro por turma: o ranking e o dashboard passam a refletir só essa turma.
  let lista = pedidos;
  if (turmaFiltro) {
    lista = pedidos.filter((p) => p.turma.trim() === turmaFiltro);
    mapa = new Map();
    for (const p of lista) {
      const chave = p.videoId || normalizar(p.musica);
      const at = mapa.get(chave) || {
        videoId: p.videoId,
        musica: p.musica,
        canal: p.canal,
        thumb: p.thumb,
        total: 0,
        ultimaEm: 0,
      };
      at.total += 1;
      at.ultimaEm = Math.max(at.ultimaEm, p.criadoEm);
      mapa.set(chave, at);
    }
  }

  const ranking = Array.from(mapa.values())
    .sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      return b.ultimaEm - a.ultimaEm;
    })
    .slice(0, top);

  const tocadas = lista.filter((p) => p.status === 'tocada').length;

  return {
    ok: true,
    total: lista.length,
    tocadas,
    pendentes: lista.length - tocadas,
    musicasDistintas: mapa.size,
    ranking,
    pedidos: lista,
    turmas: Array.from(turmas).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    turmasCadastradas: await listarTurmasCadastradas(),
    turmaAtiva: turmaFiltro,
    atualizadoEm: agoraISO(),
  };
});

// ---------------------------------------------------------------------------
// 5) Definir status de um pedido (professor)
// ---------------------------------------------------------------------------

const STATUS_VALIDOS = ['pendente', 'tocada', 'recusada'];

exports.definirStatusPedido = onCall(OPCOES_BASE, async (request) => {
  const dados = request.data || {};
  await exigirProfessor(dados.token);

  const id = String(dados.id || '');
  const status = String(dados.status || '');
  if (!id) throw new HttpsError('invalid-argument', 'Pedido não informado.');
  if (!STATUS_VALIDOS.includes(status)) {
    throw new HttpsError('invalid-argument', 'Status inválido.');
  }

  const ref = db.collection(COL_PEDIDOS).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Pedido não encontrado.');

  await ref.update({ status, atualizadoEm: FieldValue.serverTimestamp() });
  return { ok: true, id, status };
});

// ---------------------------------------------------------------------------
// 6) Limpar pedidos (professor)
// ---------------------------------------------------------------------------

exports.limparPedidos = onCall(OPCOES_BASE, async (request) => {
  const dados = request.data || {};
  await exigirProfessor(dados.token);

  const modo = dados.modo === 'tudo' ? 'tudo' : 'tocadas';
  let query = db.collection(COL_PEDIDOS);
  if (modo === 'tocadas') {
    query = query.where('status', '==', 'tocada');
  }

  const snap = await query.limit(1000).get();
  let removidos = 0;
  let batch = db.batch();
  let noBatch = 0;

  for (const doc of snap.docs) {
    batch.delete(doc.ref);
    noBatch += 1;
    removidos += 1;
    if (noBatch === 500) {
      await batch.commit();
      batch = db.batch();
      noBatch = 0;
    }
  }
  if (noBatch > 0) await batch.commit();

  return { ok: true, removidos, modo };
});

// ---------------------------------------------------------------------------
// 7) Turmas cadastradas (professor cadastra; aluno escolhe no seletor)
// ---------------------------------------------------------------------------

const MIN_TURMA = 2;
const MAX_TURMA = 40;

/** Devolve a lista de turmas cadastradas, em ordem alfabética (pt-BR). */
async function listarTurmasCadastradas() {
  const snap = await db.collection(COL_TURMAS).get();
  const nomes = [];
  snap.forEach((doc) => {
    const nome = String((doc.data() || {}).nome || '').trim();
    if (nome) nomes.push(nome);
  });
  return nomes.sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

exports.listarTurmas = onCall(OPCOES_BASE, async () => {
  return { ok: true, turmas: await listarTurmasCadastradas() };
});

exports.criarTurma = onCall(OPCOES_BASE, async (request) => {
  const dados = request.data || {};
  await exigirProfessor(dados.token);

  const nome = String(dados.nome || '').trim().slice(0, MAX_TURMA);
  if (nome.length < MIN_TURMA) {
    throw new HttpsError(
      'invalid-argument',
      'Digite o nome da turma (mínimo 2 caracteres).'
    );
  }

  const ref = db.collection(COL_TURMAS).doc(chaveCache(nome));
  const existe = await ref.get();
  if (existe.exists) {
    throw new HttpsError('already-exists', 'Essa turma já está cadastrada.');
  }

  await ref.set({
    nome,
    criadoEm: FieldValue.serverTimestamp(),
  });
  return { ok: true, turmas: await listarTurmasCadastradas() };
});

exports.removerTurma = onCall(OPCOES_BASE, async (request) => {
  const dados = request.data || {};
  await exigirProfessor(dados.token);

  const nome = String(dados.nome || '').trim();
  if (!nome) {
    throw new HttpsError('invalid-argument', 'Turma não informada.');
  }

  const ref = db.collection(COL_TURMAS).doc(chaveCache(nome));
  const existe = await ref.get();
  if (!existe.exists) {
    throw new HttpsError('not-found', 'Turma não encontrada.');
  }

  await ref.delete();
  return { ok: true, turmas: await listarTurmasCadastradas() };
});
