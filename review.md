# Nexus Downloader - Diário de Bordo & Registro de Alterações (review.md)

**Última Atualização:** 25/08/2026

---

## 8. Sessão de 25/08/2026 - Renovação do Ecossistema TorBox Cloud, Estatísticas de Conta e Otimização nos Scanners

### Alterações e Implementações do Dia

#### 1. Gerenciador Completo e Estatísticas da Nuvem TorBox (`torbox-scanner.js`, `main.js`, `renderer/`)
- **Problema:** A aba do TorBox não permitia visualizar dados da conta (plano, uso de banda, armazenamento) e carecia de ações diretas de gerenciamento da nuvem.
- **Solução:** 
  - Integrado o logo oficial em alta resolução (`renderer/assets/torbox_box_logo.png`).
  - Desenvolvida interface com cartões estatísticos em tempo real (Tipo de Plano, Banda Consumida, Armazenamento Usado, Expiração da Conta e Status do Serviço).
  - Adicionados filtros avançados (Torrents, Usenet, WebDL), campo de busca por texto e ações de exclusão/download direto na nuvem.

#### 2. Otimizações no Scanner Bunkr e Suporte a Pixeldrain (`bunkr-scanner.js`, `generic-scanner.js`)
- **Problema:** Mudanças de CDN no Bunkr e requisições de arquivos diretos em hosts como Pixeldrain necessitavam de melhoria na extração de URLs.
- **Solução:** 
  - Atualizadas as rotinas de resolução em `bunkr-scanner.js` com melhor resiliência de buffers.
  - Aprimorada a detecção de cabeçalhos no `generic-scanner.js` para compatibilidade com Pixeldrain e múltiplos serviços diretos.

#### 3. Expansão de Pontes IPC e Resiliência Backend (`main.js`, `preload.js`)
- **Problema:** A camada Renderer necessitava de comunicação assíncrona segura com as novas funções da API do TorBox.
- **Solução:** Adicionados handlers IPC para consulta de dados de conta (`torbox-user-info`), exclusão de itens (`torbox-delete-item`) e adição remota, mantendo o worker HTTP Direct protegido contra exceções.

---

## 7. Sessão de 23/08/2026 - Módulo de Varredura para a Família Send, Suporte a 1fichier e Redesenho de Modais de Entrada de Links

### Alterações e Implementações do Dia

#### 1. Suporte Nativo ao Provedor Send (`send-scanner.js`, `main.js`)
- **Solução:** Criado o módulo `send-scanner.js` para escaneamento de arquivos e pastas compartilhadas do Send (send.now, send.cm, sendit.cloud, etc.).

#### 2. Redesenho e Aprimoramento dos Modais de Entrada (`renderer/index.html`, `renderer/css/style.css`, `renderer/js/app.js`)
- **Solução:** Reformulados os modais com caixa de texto com contador de linhas/links em tempo real e drag & drop.

---

## 6. Sessão de 22/08/2026 - Suporte Nativo Independente para Drime Cloud e Turbo.cr, Extração de Pastas e Refinamentos de UI

### Alterações e Implementações do Dia

#### 1. Suporte Nativo e Independente ao Drime Cloud (`drime-scanner.js`, `main.js`)
- **Solução:** Extrator nativo e resolver de arquivos/pastas do Drime Cloud com hashes e episódios `.mkv` individuais.

---

## 1. Sessão de 12/08/2026 a 21/08/2026 - Multiprovedores e Fundação

- **Google Drive, Bunkr, MediaFire, TeraBox, OneDrive, TorBox e URLs Genéricas**: Suporte completo a múltiplos provedores, auto-resume, motor `net.request`, sanitização no Windows e auto-updater em 5 camadas.

---

## Arquivos Criados / Modificados (Acumulado)

- **`renderer/assets/torbox_box_logo.png`** (Criado): Logo oficial do TorBox integrado à UI.
- **`torbox-scanner.js`** (Modificado): Mapeamento completo dos endpoints de usuário, estatísticas e gerenciamento remoto do TorBox Cloud.
- **`bunkr-scanner.js`** (Modificado): Otimização de resiliência e suporte a novas estruturas de CDN.
- **`generic-scanner.js`** (Modificado): Suporte a Pixeldrain e servidores de hospedagem direta.
- **`main.js`** (Modificado): Novos handlers IPC da nuvem Torbox e estabilização de requisições assíncronas.
- **`preload.js`** (Modificado): Exposição de chamadas IPC do Torbox.
- **`renderer/js/app.js`** (Modificado): Dashboard da nuvem TorBox, cartões estatísticos e filtros avançados.
- **`renderer/index.html`** (Modificado): Estrutura HTML da aba do TorBox renovada.
- **`renderer/css/style.css`** (Modificado): Estilização dos cartões estatísticos e tabela do TorBox.
- **`review.md`** (Atualizado): Documentação oficial do projeto.
