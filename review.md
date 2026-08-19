# Nexus Downloader - Diário de Bordo & Registro de Alterações (review.md)

**Última Atualização:** 19/08/2026

---

## 3. Sessão de 19/08/2026 - Multiprovedores, Motor de Download net.request e Correção de Bugs de Interface & HTTP 416

### Alterações e Implementações do Dia

#### 1. Correção Estrutural da Aba de Ajustes e Interface (`renderer/index.html` e `renderer/css/style.css`)
- **Problema:** Ao navegar para a página de Ajustes ou TorBox, o conteúdo dos cartões ficava oculto ou com renderização quebrada.
- **Solução:** 
  - Corrigido aninhamento HTML em `index.html` inserindo a tag de fechamento `</section>` na Fila de Downloads (`#queue-tab`), isolando as abas de Ajustes e TorBox.
  - Reorganizada a grade de cartões de Ajustes em `style.css`, garantindo opacidade total (`opacity: 1 !important;`) e exibição limpa em telas de qualquer resolução.

#### 2. Correção de Sobreposição e Transparência no Dropdown do TorBox (`renderer/css/style.css`)
- **Problema:** O menu suspenso de filtros do TorBox aparecia por trás dos cartões de arquivo e possuía fundo transparente, dificultando a leitura.
- **Solução:** 
  - Elevada a hierarquia de camadas (`z-index: 20` no `.app-top-section` e `z-index: 9999` no `.torbox-filter-dropdown`).
  - Aplicado fundo escuro 100% opaco (`#0f172a`), eliminando qualquer sobreposição do conteúdo ao fundo.

#### 3. Eliminação do Erro HTTP 416 em Downloads TorBox WebDL/Hoster (`main.js` e `torbox-scanner.js`)
- **Problema:** Downloads de arquivos via TorBox apontando para provedores externos (ex: Gofile) falhavam com erro HTTP 416 (Range Not Satisfiable) devido à divergência entre o tamanho estimado pelo serviço e o tamanho real entregue pelo CDN.
- **Solução:** 
  - Desenvolvida sondagem prévia de cabeçalhos (`HEAD`/`GET` `Range: bytes=0-0`) antes do início do download para extrair o tamanho exato autoritativo via `Content-Range`.
  - Atualização dinâmica de `queueItem.size` com o valor real do CDN antes da segmentação paralela, eliminando requisições fora dos limites e garantindo downloads 100% integrais.

#### 4. Suporte Avançado ao TeraBox (`terabox-scanner.js` e `terabox.md`)
- **Problema:** Links de arquivos e pastas no TeraBox (e domínios encurtados) exigiam tratamento de cookies e tokens de sessão.
- **Solução:** Criado o scanner dedicado para TeraBox com suporte a domínios alternativos (`terabox.app`, `1024tera.com`, `freeterabox.com`, etc.), varredura recursiva e streaming resiliente.

#### 5. Integração Microsoft OneDrive, SharePoint, TorBox e URLs Genéricas (`onedrive-scanner.js`, `torbox-scanner.js`, `generic-scanner.js`)
- **Problema:** Ausência de suporte para OneDrive, SharePoint, torrents via TorBox e arquivos HTTP diretos da web.
- **Solução:** Desenvolvidos módulos específicos para varredura e resolução automática de URLs diretas nesses serviços.

#### 6. Worker `net.request` com Auto-Resume e Proteção contra Crashes (`main.js`)
- **Problema:** Quedas de socket causavam travamento/crash no Electron e downloads interrompidos eram perdidos.
- **Solução:** Implementado worker com `net.request` nativo do Chromium com suporte a `Range` para auto-resume, além de escudos contra `uncaughtException`/`unhandledRejection`.

---

## 2. Sessão de 14/08/2026 - Renderização Fluida da Fila (Anti-Flicker), Modais Customizados e Ajustes de UI/UX

### Alterações e Implementações do Dia

#### 1. Refatoração In-Place da Fila de Downloads (Zero Flickering)
- **Problema:** A função `renderQueue` recriava toda a estrutura DOM da fila a cada atualização de progresso, causando oscilações visuais (flickering).
- **Solução:** Implementado sistema de renderização diferencial in-place em `renderer/js/app.js` reutilizando elementos HTML e atualizando textos/barras pontualmente.

#### 2. Modais Customizados de Confirmação (`showCustomConfirm`)
- **Problema:** `window.confirm()` nativo síncrono congelava a interface do Electron.
- **Solução:** Modal assíncrono customizado integrado à UI (`showCustomConfirm`).

---

## 1. Sessão de 12/08/2026 - Integração do MediaFire, Erros de Autenticação e Otimizações HTTP Direct

### Alterações e Implementações do Dia

#### 1. Suporte Nativo a Links e Pastas do MediaFire
- **Solução:** Criado o módulo `mediafire-scanner.js` para varredura e resolução de URLs do MediaFire.

---

## Arquivos Criados / Modificados (Acumulado)

- **`bug_corrigidos.md`** (Criado/Atualizado): Documentação técnica completa das causas raízes e soluções para os Bugs 01, 02 e 03.
- **`renderer/index.html`** (Modificado): Correção do aninhamento HTML das seções de abas (`</section>`).
- **`renderer/css/style.css`** (Modificado): Ajustes de opacidade dos Ajustes e z-index/fundo do menu do TorBox.
- **`main.js`** (Modificado): Probe prévio de tamanho real via cabeçalho CDN para prevenir erro HTTP 416, worker `net.request` e auto-resume.
- **`torbox-scanner.js`** (Modificado): Ajuste na passagem de parâmetros e probes de WebDL.
- **`preload.js`** (Modificado): Exposição de pontes IPC adicionais.
- **`renderer/js/app.js`** (Modificado): Lógica de alternância de abas sem interferência e atualização in-place da fila.
- **`terabox-scanner.js`** (Criado/Modificado): Scanner e resolver do TeraBox.
- **`onedrive-scanner.js`** (Criado): Scanner de links do OneDrive e SharePoint.
- **`generic-scanner.js`** (Criado): Capturador genérico de links diretos de mídia.
- **`review.md`** (Atualizado): Registro oficial de progresso do projeto.
