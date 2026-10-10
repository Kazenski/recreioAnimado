# 🎵 Recreio Animado

> Site mobile-first em que os alunos escaneiam um QR Code, digitam o nome de uma
> música, escolhem a versão correta (autocomplete do YouTube), validam que ela
> existe e enviam o pedido. O professor entra com uma senha e vê as músicas mais
> pedidas do recreio.

<p align="center">
  <img alt="HTML5" src="https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white">
  <img alt="CSS3" src="https://img.shields.io/badge/CSS3-1572B6?logo=css3&logoColor=white">
  <img alt="JavaScript" src="https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black">
  <img alt="Firebase" src="https://img.shields.io/badge/Firebase-FFCA28?logo=firebase&logoColor=black">
  <img alt="YouTube Data API" src="https://img.shields.io/badge/YouTube%20Data%20API-FF0000?logo=youtube&logoColor=white">
  <img alt="Versão" src="https://img.shields.io/badge/vers%C3%A3o-v1.0.0-7c3aed">
</p>

- **Site (GitHub Pages):** `https://kazenski.github.io/recreioAnimado/`
- **QR Code:** abra [`qr.html`](qr.html) no site para gerar e imprimir
- **Última atualização:** 2026-10-10 · **Versão:** `v1.0.0`

---

## 📖 Como funciona

### Para o aluno (sem login)
1. Escaneia o QR Code afixado no pátio e abre o site no celular.
2. Digita o nome da música no campo de busca.
3. Enquanto digita, **aparece uma lista com as músicas do YouTube** (capa, título
   completo e canal). Ele toca na opção certa.
4. Confere o cartão da música selecionada e toca em **Enviar pedido**.
5. Recebe a confirmação de que o pedido foi registrado. Pronto. 🎉

### Para o professor (com senha)
1. Toca em **Professor** no cabeçalho e digita a senha.
2. Vê os indicadores (pedidos, pendentes, tocadas, músicas) e o **ranking das
   mais pedidas**.
3. Marca pedidos como **tocada** / **recusada** (ou volta para **pendente**) e
   pode limpar os que já tocaram.

> O ranking é atualizado automaticamente a cada 30 segundos.

---

## 🧱 Estrutura do projeto

```text
/
├── index.html                  # SPA: tela do aluno + painel do professor
├── style.css                   # Tema, componentes e animações (mobile-first)
├── qr.html                     # Gerador de QR Code do site
├── README.md                   # Esta documentação
├── CHANGELOG.md                # Histórico de versões (append-only)
├── changelog.json              # Versão estruturada do changelog (gerada)
├── firebase.json               # Config do Firebase (functions + firestore)
├── .firebaserc                 # Projeto Firebase padrão
├── firestore.rules             # Regras: nega acesso direto do cliente
├── firestore.indexes.json      # Índices do Firestore
├── .env.example                # Variáveis e segredos (modelo)
│
├── assets/
│   └── favicon.svg             # Ícone do site
│
├── js/                         # Front-end (ES6 Modules)
│   ├── main.js                 # Boot: liga aluno + professor e troca de telas
│   ├── firebase.js             # Inicialização do Firebase (config + region)
│   ├── api.js                  # Wrappers das Cloud Functions
│   ├── ui.js                   # Toasts, formatação e escape de HTML
│   ├── aluno.js                # Autocomplete, seleção e envio do pedido
│   └── professor.js            # Login, ranking e gestão de pedidos
│
├── functions/                  # Cloud Functions (Node.js 20)
│   ├── index.js                # Backend: YouTube, pedidos, login do professor
│   └── package.json
│
├── tools/
│   └── build_changelog.py      # Gera changelog.json a partir do CHANGELOG.md
│
└── .github/workflows/
    └── deploy.yml              # Publica no GitHub Pages (injeta os Secrets)
```

---

## 🛠️ Stack

| Camada | Tecnologia |
|--------|------------|
| **Front-end** | HTML5, CSS3, JavaScript ES6 Modules, Tailwind CSS (CDN), Font Awesome |
| **Fontes** | Google Fonts: `Baloo 2` (títulos) + `Inter` (corpo) |
| **Backend/BaaS** | Firebase 10.8.1 (Cloud Functions v2 + Firestore) |
| **YouTube** | YouTube Data API v3 (busca e validação, via servidor) |
| **Hospedagem** | GitHub Pages (site) + Firebase (funções) |
| **CI/CD** | GitHub Actions (`deploy.yml`) |
| **Ferramentas** | Python 3 (changelog), Node.js 20+ |

---

## 🏗️ Arquitetura

O site no GitHub Pages é **estático** — por segurança, ele não guarda a chave do
YouTube nem a senha do professor. Toda a parte sensível roda nas **Cloud
Functions**, que falam com o YouTube e com o Firestore.

```text
   Aluno (celular)                Cloud Functions (Firebase)          Serviços
 ┌────────────────┐   callable   ┌────────────────────────┐   ┌──────────────────┐
 │  index.html    │ ───────────► │  buscarMusica          │──►│ YouTube Data API │
 │  js/aluno.js   │              │  registrarPedido       │   │  v3 (com cache)  │
 │                │ ◄─────────── │  loginProfessor        │   └──────────────────┘
 │  js/professor  │              │  listarPedidos         │   ┌──────────────────┐
 └────────────────┘              │  definirStatusPedido   │──►│ Firestore        │
                                 │  limparPedidos         │   │  (pedidos/cache) │
                                 └────────────────────────┘   └──────────────────┘
```

- A **chave do YouTube** e a **senha do professor** são *segredos* do servidor.
- O navegador **nunca** acessa o Firestore diretamente (`firestore.rules` nega
  tudo); só as funções (Admin SDK) leem e escrevem.

---

## 🚀 Configuração (passo a passo)

Você só precisa fazer isso uma vez.

### 1. Criar o projeto Firebase
1. Acesse <https://console.firebase.google.com/> e crie um projeto **novo e
   dedicado** a este app (ex.: `recreio-animado-be31b`).
   > ⚠️ Não reutilize o projeto do site principal — o `firestore.rules` deste
   > repositório **nega todo acesso** e sobrescreveria as regras de lá.
2. Em **Criar app → Web**, registre um app e copie o objeto `firebaseConfig`.
3. Em **Build → Firestore Database**, crie o banco (modo produção).

### 2. Criar a chave da YouTube Data API v3
1. No <https://console.cloud.google.com/> (mesmo projeto do Firebase) vá em
   **APIs e serviços → Biblioteca** e ative **YouTube Data API v3**.
2. Em **Credenciais → Criar credenciais → Chave de API**, crie a chave.
3. **Não** restrinja por *referrer*: as chamadas saem do servidor. Você pode
   restringir por **API** (só a YouTube Data API v3) para mais segurança.
4. Guarde a chave — ela será um segredo no passo 4.

> 💡 **Cota:** a busca do YouTube consome 100 unidades por chamada e a cota
> padrão é de 10.000/dia (≈100 buscas). O backend **guarda em cache** cada termo
> pesquisado por 24 h no Firestore, então buscas repetidas não gastam cota.

### 3. Ajustar o projeto local (se necessário)
O projeto padrão está em `.firebaserc` como `recreio-animado-be31b`. Se você criou
com outro nome, edite `.firebaserc`:

```json
{ "projects": { "default": "SEU_PROJETO" } }
```

### 4. Configurar os segredos do servidor
Com a Firebase CLI instalada (`npm i -g firebase-tools`) e logado
(`firebase login`), rode **dentro da pasta do projeto**:

```bash
firebase functions:secrets:set YOUTUBE_API_KEY   # cole a chave do passo 2
firebase functions:secrets:set PROF_SENHA        # senha do painel do professor
```

### 5. Publicar as Cloud Functions e as regras

```bash
cd functions
npm install
cd ..
firebase deploy --only functions,firestore
```

Isso publica as 6 funções (`buscarMusica`, `registrarPedido`, `loginProfessor`,
`listarPedidos`, `definirStatusPedido`, `limparPedidos`) e as regras do
Firestore.

### 6. Configurar os Secrets do GitHub (para o site)
No repositório **Kazenski/recreioAnimado → Settings → Secrets and variables →
Actions**, crie estes 6 secrets com os valores do `firebaseConfig` (passo 1):

| Secret | Onde achar no `firebaseConfig` |
|--------|--------------------------------|
| `VITE_FIREBASE_API_KEY` | `apiKey` |
| `VITE_FIREBASE_AUTH_DOMAIN` | `authDomain` |
| `VITE_FIREBASE_PROJECT_ID` | `projectId` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `storageBucket` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` |
| `VITE_FIREBASE_APP_ID` | `appId` |

> Esses valores são **públicos** (aparecem no navegador). O que é secreto
> (chave do YouTube e senha) fica só no Firebase, no passo 4.

### 7. Ativar o GitHub Pages
Em **Settings → Pages**, defina **Source: GitHub Actions**. A cada `push` na
branch `main`, o workflow publica o site em
`https://kazenski.github.io/recreioAnimado/`.

### 8. Gerar o QR Code
Abra `https://kazenski.github.io/recreioAnimado/qr.html`, confirme o endereço e
baixe/imprima o QR Code.

---

## 💻 Desenvolvimento local

O site é estático. Para testar localmente **sem** o GitHub Pages, sirva a pasta e
injete a configuração do Firebase pelo navegador (assim você não mexe no
`js/firebase.js`):

```bash
python -m http.server 8791
```

Antes de carregar a página, em `index.html` (ou no console do navegador), defina:

```html
<script>
  window.__FIREBASE_CONFIG__ = {
    apiKey: "…", authDomain: "…", projectId: "…",
    storageBucket: "…", messagingSenderId: "…", appId: "…"
  };
</script>
```

> Sem configuração o site abre normalmente, mas mostra um aviso de que as buscas
> e o envio de pedidos estão desativados (útil para ajustar layout).

Para testar as funções localmente, use os emuladores:

```bash
firebase emulators:start --only functions,firestore
```

---

## 🔌 Referência das Cloud Functions

Todas são *HTTPS Callable* na região **`us-central1`** (valor em `js/firebase.js`
— se mudar a região, mude nos dois lugares).

| Função | Entrada | Retorno / Efeito |
|--------|---------|------------------|
| `buscarMusica` | `{ q }` | `{ resultados: [{ videoId, titulo, canal, thumb }] }` (com cache) |
| `registrarPedido` | `{ musica, videoId?, canal?, thumb?, nomeAluno?, turma?, clienteId? }` | Grava o pedido no Firestore; anti-flood de 15 s por aparelho |
| `loginProfessor` | `{ senha }` | `{ token, expiraEm, horas }` (sessão de 12 h) |
| `listarPedidos` | `{ token }` | `{ total, pendentes, tocadas, musicasDistintas, ranking[], pedidos[] }` |
| `definirStatusPedido` | `{ token, id, status }` | Atualiza `status` (`pendente`/`tocada`/`recusada`) |
| `limparPedidos` | `{ token, modo }` | `modo: "tocadas"` (padrão) ou `"tudo"` |

---

## 🗄️ Modelo de dados (Firestore)

| Coleção | Documento | Campos principais |
|---------|-----------|-------------------|
| `pedidosRecreio` | automático | `musica`, `videoId`, `canal`, `thumb`, `nomeAluno`, `turma`, `escola`, `status`, `criadoEm` |
| `cacheBuscas` | sha1 do termo | `termo`, `resultados[]`, `criadoEm`, `expiraEm` |
| `sessoesProfessor` | token | `criadoEm`, `expiraEm` |
| `controlePedidos` | sha1 do cliente/IP | `ultimoPedido` (anti-flood) |

---

## 🔐 Segurança

- A chave do YouTube e a senha do professor vivem **apenas** no servidor
  (Firebase Secrets).
- O navegador **não** acessa o Firestore: `firestore.rules` nega todo acesso e
  só as Cloud Functions (Admin SDK) operam o banco.
- O login do professor devolve um **token** de sessão válido por 12 h; a senha
  nunca é reenviada a cada ação.
- A busca usa `safeSearch=moderate` (conteúdo adequado para ambiente escolar).
- Controle anti-flood de 15 s por aparelho no `registrarPedido`.

---

## 📝 Versionamento e Changelog

- **`CHANGELOG.md` é append-only**: cada versão nova entra **no topo** (abaixo de
  `## [Unreleased]`). Nunca apague nem reescreva entradas antigas.
- Depois de editar o `CHANGELOG.md`, gere o JSON estruturado:

```bash
python tools/build_changelog.py
```

O script apenas **lê** o Markdown e **regrava** o `changelog.json` (a fonte da
verdade é sempre o Markdown).

### Convenção de commits

```text
<tipo>(escopo): descrição curta
```

| Tipo | Uso |
|------|-----|
| `feat` | Nova funcionalidade |
| `fix` | Correção de bug |
| `refactor` | Refatoração sem mudança de comportamento |
| `chore` | Manutenção (deps, configs, CI) |
| `docs` | Documentação |
| `style` | Formatação, CSS |
| `test` | Testes |

---

## 🧰 Comandos úteis

```bash
# Servir o site localmente
python -m http.server 8791

# Regenerar o changelog.json
python tools/build_changelog.py

# Publicar as Cloud Functions + regras
firebase deploy --only functions,firestore

# Ver logs das funções
firebase functions:log

# Emuladores (funções + firestore)
firebase emulators:start --only functions,firestore
```

---

## 🩺 Problemas comuns

| Sintoma | Causa provável | Solução |
|---------|----------------|---------|
| “Firebase não configurado” | Secrets do GitHub ausentes | Configure os `VITE_FIREBASE_*` (passo 6) e refaça o deploy |
| “A cota diária de buscas do YouTube acabou” | Muitas buscas novas (sem cache) | Aguarde o próximo dia ou aumente a cota no console |
| “A chave do YouTube está restrita por site” | Chave restrita por *referrer* | Remova a restrição de referrer (chamadas saem do servidor) |
| “Sessão expirada” no painel | Token de 12 h vencido | Entre novamente com a senha |
| Ranking vazio | Nenhum pedido ainda | É esperado até o primeiro pedido |

---

## 📄 Licença

Projeto educacional — **Recreio Animado / Prof. Kazenski 2026**.
Uso interno da instituição. Não redistribuir sem autorização.

---

> **Deploy:** <https://kazenski.github.io/recreioAnimado/> ·
> **Versão atual:** `v1.0.0` · **Changelog completo:** [`CHANGELOG.md`](CHANGELOG.md)
