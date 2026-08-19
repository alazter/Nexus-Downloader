# Nexus Downloader - Diário de Bordo & Registro de Alterações (review.md)

**Última Atualização:** 19/08/2026

---

## 3. Sessão de 19/08/2026 - Suporte Multiprovedores (TeraBox, OneDrive, TorBox, URLs Genéricas) e Engine de Stream

### Alterações e Implementações do Dia

#### 1. Suporte Avançado ao TeraBox (`terabox-scanner.js` e `terabox.md`)
- **Problema:** Usuários precisavam baixar arquivos hospedados no TeraBox (e seus múltiplos domínios encurtados) que exigiam tratamento de cookies e tokens de sessão.
- **Solução:** Desenvolvido scanner dedicado para TeraBox:
  - Resolução de domínios alternativos (`terabox.app`, `1024tera.com`, `freeterabox.com`, `teraboxlink.com`, etc.).
  - Mapeamento e navegação recursiva em pastas e arquivos.
  - Resolução de links de streaming direto com suporte a requisições com Range e retentativas automáticas em servidores redundantes.

#### 2. Suporte ao Microsoft OneDrive & SharePoint (`onedrive-scanner.js`)
- **Problema:** Impossibilidade de capturar pastas e arquivos compartilhados publicamente no OneDrive (pessoal/corporativo) e SharePoint.
- **Solução:** Criado o módulo `onedrive-scanner.js`:
  - Varredura de links compartilhados de arquivos e pastas do OneDrive/SharePoint.
  - Extração de cookies e tokens de sessão de visitante para obter URLs diretas de download da CDN da Microsoft.

#### 3. Integração com o TorBox (`torbox-scanner.js`)
- **Problema:** Ausência de suporte para links Magnet e arquivos Torrent na fila do aplicativo.
- **Solução:** Módulo `torbox-scanner.js` integrado com a API do TorBox para resolução instantânea de torrents e streaming direto via CDN ultrarrápida.

#### 4. Engine de Captura Genérica de URLs Web (`generic-scanner.js`)
- **Problema:** Links diretos de mídia (vídeos `.mp4`, `.mkv`, arquivos `.zip`) ou servidores de hospedagem como MegaUp falhavam por falta de identificação dos cabeçalhos.
- **Solução:** Implementado o `generic-scanner.js`, que realiza requisição HEAD/GET para inspecionar `Content-Type`, `Content-Length` e `Content-Disposition`, adicionando qualquer link de arquivo direto à fila.

#### 5. Worker de Download `net.request` com Auto-Resume e Estabilidade no Main Process (`main.js`)
- **Problema:** Fechamentos inesperados e crashes no processo principal caso conexões de segundo plano sofressem falhas de socket, além de perda do estado da janela ao reiniciar o app.
- **Solução:** 
  - Atualizado o worker de download para usar `net.request` nativo do Chromium com suporte a cabeçalhos `Range` para retomar downloads de onde pararam.
  - Adicionado tratamento global contra exceções não capturadas (`uncaughtException` / `unhandledRejection`).
  - Implementada persistência de geometria e estado da janela (tamanho, posição, maximizado).

#### 6. Identificação de Provedores e Rodapé de Estatísticas na UI (`renderer/`)
- **Problema:** A fila de downloads não diferenciava a origem dos links e não apresentava visão consolidada de consumo de banda.
- **Solução:** 
  - Adicionadas badges visuais com cores distintas para cada provedor (Google Drive, Bunkr, MediaFire, TeraBox, OneDrive, TorBox, Genérico).
  - Criado rodapé com exibição dinâmica do número de downloads ativos, velocidade global acumulada e versão do sistema.
  - Registro interno das falhas e correções no arquivo `bug_corrigidos.md`.

---

## 2. Sessão de 14/08/2026 - Renderização Fluida da Fila (Anti-Flicker), Modais Customizados e Ajustes de UI/UX

### Alterações e Implementações do Dia

#### 1. Refatoração In-Place da Fila de Downloads (Zero Flickering)
- **Problema:** A função `renderQueue` recriava toda a estrutura DOM da fila a cada atualização de progresso ou mudança de estado dos downloads, resultando em oscilações visuais (flickering), perda momentânea de foco e desorganização dos toggles de pastas expandidas/recolhidas.
- **Solução:** Implementado sistema de renderização diferencial in-place em `renderer/js/app.js`:
  - Reutilização dos elementos HTML existentes da pasta e dos itens individuais.
  - Funções especializadas `updateQueueItemElement` e `updateQueueItemActions` para alterar pontualmente apenas textos, larguras de barra de progresso e badges.
  - Preservação intacta dos estados de expansão/recolhimento das pastas (`expandedFolders` e `collapsedFolders`).

#### 2. Modais Customizados de Confirmação (`showCustomConfirm`)
- **Problema:** O uso do `window.confirm()` nativo síncrono congelava a interface do Electron e destoava do design dark moderno do Nexus Downloader.
- **Solução:** 
  - Desenvolvido modal customizado assíncrono totalmente integrado à UI da aplicação (`showCustomConfirm`).
  - Aplicado às operações críticas: remoção de item individual, reinício de downloads pendentes e limpeza total da fila.

#### 3. Refinamento Estético e Atualização dos Ícones
- **Problema:** Necessidade de alinhamento visual dos badges de estado, botões de ação e ícones de identidade visual da aplicação.
- **Solução:** Atualizados estilos em `renderer/css/style.css`, `renderer/index.html` e renovados os artefatos de ícones em `renderer/icon.png` e `renderer/icon.svg`.

---

## 1. Sessão de 12/08/2026 - Integração do MediaFire, Erros de Autenticação e Otimizações HTTP Direct

### Alterações e Implementações do Dia

#### 1. Suporte Nativo a Links e Pastas do MediaFire
- **Problema:** O Nexus Downloader suportava links do Google Drive e Bunkr, mas não possuía suporte ao MediaFire para varredura de arquivos ou download direto.
- **Solução:** Criado o módulo `mediafire-scanner.js`, que adiciona suporte completo a links de arquivos e pastas do MediaFire.

#### 2. Generalização do Worker HTTP Direct e Persistência na Fila
- **Problema:** A estrutura de downloads HTTP diretos estava engessada no módulo Bunkr e a fila de downloads (`queue.json`) não persistia propriedades do MediaFire.
- **Solução:** Atualizado `main.js` para estender o worker HTTP Direct para Bunkr e MediaFire, salvando estado na fila.

#### 3. Tratamento Automático de Expiração do Token Google (`invalid_grant`)
- **Problema:** Em caso de token de autenticação revogado ou expirado do Google Drive (`invalid_grant`), o aplicativo gerava erros contínuos.
- **Solução:** Implementada captura específica de exceções `invalid_grant` em `main.js`, removendo o `token.json` e solicitando reconexão.

#### 4. Otimização do Resolver Bunkr
- **Problema:** Requisições de validação de desafio no Bunkr podiam consumir buffers grandes desnecessariamente.
- **Solução:** Ajustado o leitor de buffers em `bunkr-scanner.js` para interromper o carregamento após obter os primeiros 64KB.

---

## Arquivos Criados / Modificados (Acumulado)

- **`terabox-scanner.js`** (Modificado/Criado): Scanner de links e pastas do TeraBox com suporte a domínios encurtados.
- **`onedrive-scanner.js`** (Criado): Scanner de links compartilhados do Microsoft OneDrive e SharePoint.
- **`torbox-scanner.js`** (Criado): Resolução de links Magnet e Torrents via API do TorBox.
- **`generic-scanner.js`** (Criado): Capturador genérico de URLs diretas e servidores de mídia (ex: MegaUp).
- **`terabox.md`** (Criado): Documentação técnica sobre o funcionamento e endpoints do TeraBox.
- **`bug_corrigidos.md`** (Criado): Registro detalhado de bugs corrigidos e exceções tratadas.
- **`main.js`** (Modificado): Worker de streaming `net.request`, auto-resume, resiliência contra crashes e novos IPC handlers.
- **`preload.js`** (Modificado): Exposição de novas APIs IPC para a camada renderer.
- **`renderer/js/app.js`** (Modificado): Badges por provedor, rodapé de estatísticas globais e refatoração in-place da fila.
- **`renderer/index.html`** (Modificado): Novos elementos da UI, rodapé e modais.
- **`renderer/css/style.css`** (Modificado): Estilização dos novos provedores, badges e rodapé.
- **`.gitignore`** (Modificado): Inclusão da pasta `scratch/` para ignorar scripts temporários de teste.
- **`review.md`** (Atualizado): Documentação oficial do projeto.
