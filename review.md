# Nexus Downloader - Diário de Bordo & Registro de Alterações (review.md)

**Última Atualização:** 23/08/2026

---

## 7. Sessão de 23/08/2026 - Módulo de Varredura para a Família Send, Suporte a 1fichier e Redesenho de Modais de Entrada de Links

### Alterações e Implementações do Dia

#### 1. Suporte Nativo ao Provedor Send (`send-scanner.js`, `main.js`)
- **Problema:** Links e pastas da família Send (`send.now`, `send.cm`, `sendit.cloud`, `userscloud.com`, `tusfiles.com`, `tusfiles.net`, `usersfiles.com`) não tinham tratamento de varredura ou extração de pastas `/s/`.
- **Solução:** 
  - Criado o módulo `send-scanner.js` para escaneamento de arquivos e pastas compartilhadas do Send, extraindo nome, tamanho e lista de itens.
  - Integração no `main.js` com suporte a resolução inteligente via TorBox WebDL ou download direto HTTP.

#### 2. Integração e Desproteção do 1fichier (`main.js`, `generic-scanner.js`)
- **Problema:** Links de hospedagem do 1fichier exigiam bypass para capturar links diretos de alta velocidade.
- **Solução:** Adicionado suporte a links do 1fichier via desprotetor TorBox Hoster e roteamento no motor genérico.

#### 3. Redesenho e Aprimoramento dos Modais de Entrada (`renderer/index.html`, `renderer/css/style.css`, `renderer/js/app.js`)
- **Problema:** Os modais de inserção de links ("Escanear Links", "Adicionar Torrent") careciam de feedback dinâmico de contagem e suporte a drag & drop.
- **Solução:** 
  - Reformulados os modais com caixa de texto com contador de linhas/links em tempo real.
  - Adicionado suporte a drag & drop de arquivos e colagem rápida de magnet links.
  - Injetada a badge temática visual `SEND` na fila de downloads e na tabela de resultados do scanner.

---

## 6. Sessão de 22/08/2026 - Suporte Nativo Independente para Drime Cloud e Turbo.cr, Extração de Pastas e Refinamentos de UI

### Alterações e Implementações do Dia

#### 1. Suporte Nativo e Independente ao Drime Cloud (`drime-scanner.js`, `main.js`)
- **Solução:** Atualizado o módulo `drime-scanner.js` e a integração com o `main.js` para varrer pastas e arquivos compartilhados nativamente (com hashes e episódios `.mkv` individuais).

#### 2. Suporte Independente ao Turbo.cr (`bunkr-scanner.js`, `generic-scanner.js`, `main.js`)
- **Solução:** Adicionado reconhecimento direto dos domínios do Turbo.cr com resolução resiliente de mídias.

---

## 5. Sessão de 21/08/2026 - Arquitetura em 5 Camadas do Auto-Updater (GitHub Releases API + Hot Swap)

### Alterações e Implementações do Dia

#### 1. Arquitetura de Auto-Atualização em 5 Camadas (`main.js`, `renderer/js/app.js`, `renderer/index.html`, `renderer/css/style.css`)
- **Solução:** Desenvolvida a arquitetura completa em 5 camadas (Detecção SemVer, UI Changelog Modal, Stream Download, Hot Swap Handover e Padronização de Publicação).

---

## 1. Sessão de 12/08/2026 a 20/08/2026 - Multiprovedores e Fundação

- **Google Drive, Bunkr, MediaFire, TeraBox, OneDrive, TorBox e URLs Genéricas**: Suporte completo a múltiplos provedores, auto-resume, motor `net.request`, sanitização no Windows e renderização in-place anti-flickering.

---

## Arquivos Criados / Modificados (Acumulado)

- **`send-scanner.js`** (Criado): Extrator nativo para a família de domínios Send (send.now, send.cm, sendit.cloud, etc.).
- **`main.js`** (Modificado): Roteamento do scanner Send, suporte a 1fichier e resiliência no worker HTTP Direct.
- **`renderer/js/app.js`** (Modificado): Badge `SEND`, modais com contador em tempo real e atualização de fila.
- **`renderer/css/style.css`** (Modificado): Estilização dos novos modais, badges e contadores de links.
- **`renderer/index.html`** (Modificado): Estrutura renovada dos modais do scanner e torrent.
- **`torbox-scanner.js`** (Modificado): Ajustes de tratamento de exceções assíncronas.
- **`review.md`** (Atualizado): Documentação oficial do projeto.
