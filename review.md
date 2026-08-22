# Nexus Downloader - Diário de Bordo & Registro de Alterações (review.md)

**Última Atualização:** 21/08/2026

---

## 5. Sessão de 21/08/2026 - Arquitetura em 5 Camadas do Auto-Updater (GitHub Releases API + Hot Swap) e Ajuste no Scanner de Links

### Alterações e Implementações do Dia

#### 1. Arquitetura de Auto-Atualização em 5 Camadas (`main.js`, `renderer/js/app.js`, `renderer/index.html`, `renderer/css/style.css`)
- **Problema:** O aplicativo necessitava de um mecanismo de atualização automática resiliente, seguro e transparente, sem depender de instaladores externos complexos ou causar travamentos.
- **Solução:** Desenvolvida a arquitetura completa em 5 camadas:
  - **Camada 1 (Detecção & SemVer):** Consulta assíncrona à API do GitHub Releases (`/repos/alazter/nexus-downloader/releases`), comparação semântica com `app.getVersion()` e notificação nativa no Windows.
  - **Camada 2 (Interface & Changelog):** Exibição de badge dinâmica no rodapé/sidebar e modal interativo (`UpdatePopupModal`) apresentando o Changelog formatado da versão.
  - **Camada 3 (Download Resiliente & Progresso IPC):** Identificação automática do artefato correto (Setup `.exe` ou Portable `.exe`), download em tempo real por stream e feedback contínuo de porcentagem, MBs transferidos e velocidade em MB/s.
  - **Camada 4 (Hot Swap & Substituição Transparente):** Liberação de trava de instância única (`releaseSingleInstanceLock`), execução da nova versão baixada (`shell.openPath`) e finalização graciosa da versão antiga (`app.quit()`).
  - **Camada 5 (Padronização de Publicação):** Formatação padronizada de lançamentos (`⚡ Nexus v[Versão]`) para rastreamento de builds no GitHub.

#### 2. Exibição Condicional do Botão "Iniciar Download" (`renderer/js/app.js`)
- **Problema:** O botão "Iniciar Download" ficava visível na tela inicial do Scanner antes de colar e escanear qualquer link, causando confusão visual.
- **Solução:** Ajustada a lógica no `app.js` para renderizar o botão "Iniciar Download" exclusivamente após o término do escaneamento com arquivos válidos encontrados.

---

## 4. Sessão de 20/08/2026 - Correções no Torbox Cloud, Sanitização de Caminhos Windows, Polling de Nuvem e Refinamentos de UI

### Alterações e Implementações do Dia

#### 1. Sanitização Rigorosa de Caminhos no Windows (`sanitizePathSegment` em `torbox-scanner.js` e `main.js`)
- **Solução:** Implementada a função `sanitizePathSegment` que remove quebras de linha (`\n`, `\r`, `\t`) e substitui caracteres não permitidos antes de criar pastas locais no SO.

#### 2. Pré-Flight Recursivo de Redirecionamentos HTTP 3xx e Resolução de `numericId` (`main.js`)
- **Solução:** Pré-flight reformulado para seguir redirecionamentos HTTP 3xx (`301`, `302`, `303`, `307`, `308`) até o servidor CDN final (`tb-cdn.cx`), capturando o tamanho autoritativo via `Content-Range`.

#### 3. Injeção de Permalinks e Polling da Nuvem Torbox em Tempo Real (`torbox-scanner.js` e `main.js`)
- **Solução:** Injeção de permalinks diretos no scanner e monitoramento em tempo real em `resolveTorboxDirectUrl` (`☁️ Torbox baixando na nuvem X%`).

---

## 3. Sessão de 19/08/2026 - Multiprovedores, Motor de Download net.request e Correção de Bugs de Interface & HTTP 416

### Alterações e Implementações do Dia

#### 1. Correção Estrutural da Aba de Ajustes e Interface (`renderer/index.html` e `renderer/css/style.css`)
- **Solução:** Corrigido aninhamento HTML em `index.html` inserindo a tag de fechamento `</section>` na Fila de Downloads.

---

## 2. Sessão de 14/08/2026 - Renderização Fluida da Fila (Anti-Flicker), Modais Customizados e Ajustes de UI/UX

### Alterações e Implementações do Dia

#### 1. Refatoração In-Place da Fila de Downloads (Zero Flickering)
- **Solução:** Implementado sistema de renderização diferencial in-place em `renderer/js/app.js` reutilizando elementos HTML.

---

## 1. Sessão de 12/08/2026 - Integração do MediaFire, Erros de Autenticação e Otimizações HTTP Direct

### Alterações e Implementações do Dia

#### 1. Suporte Nativo a Links e Pastas do MediaFire
- **Solução:** Criado o módulo `mediafire-scanner.js` para varredura e resolução de URLs do MediaFire.

---

## Arquivos Criados / Modificados (Acumulado)

- **`main.js`** (Modificado): Arquitetura de auto-atualização (GitHub Releases API, stream, handover e IPCs).
- **`renderer/js/app.js`** (Modificado): Gerenciador do `UpdatePopupModal`, barra de progresso IPC de atualização e exibição condicional do botão "Iniciar Download".
- **`renderer/index.html`** (Modificado): Modal de Atualização (`UpdatePopupModal`) e elementos visuais de aviso de atualização.
- **`renderer/css/style.css`** (Modificado): Estilização do modal de atualização, barra de progresso e notas de lançamento.
- **`bug_corrigidos.md`** (Modificado): Registro detalhado da implementação da Feature 27 (Arquitetura do Auto-Updater).
- **`review.md`** (Atualizado): Documentação oficial do projeto.
