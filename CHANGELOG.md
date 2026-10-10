# Changelog

Todas as alterações relevantes neste projeto são documentadas neste arquivo.

> **Regra de ouro:** este arquivo é **append-only**. Uma versão nova é sempre
> **acrescentada no topo** (logo abaixo de `## [Unreleased]`). Nunca apague nem
> reescreva entradas antigas. O `changelog.json` é gerado a partir daqui por
> `python tools/build_changelog.py` e é sobrescrito por completo — por isso a
> fonte da verdade é sempre este Markdown.

## [Unreleased] - Em desenvolvimento

## [v1.0.2] — 2026-10-10
### Alterado
- Rodapé agora mostra a versão **dinamicamente** a partir do `changelog.json` (`versaoAtual`), mantendo o link para o `CHANGELOG.md`. Assim a versão exibida nunca fica defasada em relação ao changelog. Se o `fetch` falhar, mantém o texto estático como reserva.
- Texto de reserva da versão no `index.html` atualizado para `v1.0.2`.

### Arquivos tocados
- index.html
- js/main.js
- CHANGELOG.md
- changelog.json

## [v1.0.1] — 2026-10-10
### Corrigido
- Apontado o projeto Firebase padrão em `.firebaserc` para **`recreio-animado-be31b`** (o projeto real, que tem o app Web "RecreioAnimado" e o Firestore). Havia um projeto homônimo `recreio-animado` sem app e sem Firestore na conta, que causava confusão no deploy.
- `README.md` e `firestore.rules` atualizados para citar o `project id` correto.

### Arquivos tocados
- .firebaserc
- README.md
- firestore.rules
- CHANGELOG.md
- changelog.json

## [v1.0.0] — 2026-10-10
### Escopo
Primeira versão do **Recreio Animado**: site mobile-first em que o aluno digita o nome de uma música, escolhe a versão correta na lista (autocomplete conectado ao YouTube), valida que ela existe e envia o pedido. O professor entra com uma senha simples e vê o ranking das músicas mais pedidas, além de marcar/limpar pedidos.

### Adicionado

#### Fluxo do aluno (`js/aluno.js`, `index.html`)
- Campo de busca com **autocomplete** conectado ao YouTube: enquanto o aluno digita (a partir de 2 letras, com debounce de 350 ms), aparece a lista com capa, título completo e canal para ele **selecionar**.
- Navegação por teclado (setas ↑/↓ e Enter) e por toque, pensada para celular.
- Cartão de confirmação da música selecionada e botão **Enviar pedido**.
- Tela de sucesso animada, mensagens de erro amigáveis e *cooldown* de 20 s entre pedidos do mesmo aparelho.
- Campos opcionais de nome e turma do aluno.

#### Painel do professor (`js/professor.js`)
- **Login com senha simples** (a senha nunca sai do servidor).
- KPIs: total de pedidos, pendentes, tocadas e músicas distintas.
- **Ranking das mais pedidas** com barras proporcionais e pódio (1º, 2º, 3º).
- Lista de pedidos recentes com ações para marcar como **tocada**, **recusada** ou voltar para **pendente**.
- Limpeza de pedidos tocados ou de todos, atualização manual e automática (30 s).

#### Backend (`functions/index.js`)
- `buscarMusica`: busca/valida no YouTube via **YouTube Data API v3**, com **cache no Firestore** para economizar cota e proteger a chave.
- `registrarPedido`: valida a música (inclusive links colados), grava o pedido no Firestore e aplica controle anti-flood.
- `loginProfessor`, `listarPedidos`, `definirStatusPedido` e `limparPedidos`: painel protegido por token de sessão com validade de 12 h.
- Chave do YouTube (`YOUTUBE_API_KEY`) e senha do professor (`PROF_SENHA`) guardadas como **segredos** no servidor.

#### Interface e identidade
- Layout **mobile-first** responsivo (Tailwind via CDN + `style.css`), tema roxo/rosa, animações discretas e respeito a `prefers-reduced-motion`.
- `qr.html`: gerador de **QR Code** do site para imprimir e afixar no pátio.

#### Projeto e infraestrutura
- `firebase.json`, `.firebaserc`, `firestore.rules` (nega acesso direto do cliente), `firestore.indexes.json`.
- Workflow do **GitHub Pages** (`.github/workflows/deploy.yml`) com injeção da configuração do Firebase via Secrets e validação de sintaxe dos `.js`.
- `tools/build_changelog.py` (gera `changelog.json` a partir deste arquivo).
- `README.md` completo (visão geral, arquitetura, setup, deploy e QR Code).

### Arquivos tocados
- index.html
- style.css
- qr.html
- assets/favicon.svg
- js/main.js
- js/firebase.js
- js/api.js
- js/ui.js
- js/aluno.js
- js/professor.js
- functions/index.js
- functions/package.json
- firebase.json
- .firebaserc
- firestore.rules
- firestore.indexes.json
- .github/workflows/deploy.yml
- .env.example
- .gitignore
- tools/build_changelog.py
- README.md
- CHANGELOG.md
- changelog.json
