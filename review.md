# Nexus Downloader - Diário de Bordo & Registro de Alterações (review.md)

**Última Atualização:** 22/08/2026

---

## 6. Sessão de 22/08/2026 - Suporte Nativo Independente para Drime Cloud e Turbo.cr, Extração de Pastas e Refinamentos de UI

### Alterações e Implementações do Dia

#### 1. Suporte Nativo e Independente ao Drime Cloud (`drime-scanner.js`, `main.js`)
- **Problema:** Links e pastas compartilhadas do Drime Cloud (`drime.cloud`) não possuíam extrator próprio no aplicativo, forçando o uso de terceiros ou falhando ao tentar extrair arquivos individuais de dentro de pastas compartilhadas.
- **Solução:** 
  - Atualizado o módulo `drime-scanner.js` e a integração com o `main.js` para varrer pastas e arquivos compartilhados nativamente.
  - Implementada a extração individual de arquivos (ex: episódios `.mkv`) com identificadores e hashes únicos obtidos da API do Drime Cloud, permitindo o download direto e ultrarrápido sem dependência do TorBox ou compactação em `.zip`.

#### 2. Suporte Independente ao Turbo.cr (`bunkr-scanner.js`, `generic-scanner.js`, `main.js`)
- **Problema:** URLs do Turbo.cr (`turbo.cr`, `turbo.pm`) não eram reconhecidas por um módulo nativo dedicado.
- **Solução:** Adicionado reconhecimento direto dos domínios do Turbo.cr com resolução resiliente de links de mídias e vídeos.

#### 3. Badges de Identificação Visual no Renderer (`renderer/js/app.js`, `renderer/css/style.css`, `renderer/index.html`)
- **Problema:** A interface do usuário precisava diferenciar claramente os links originados do Drime Cloud e Turbo.cr na fila e nos resultados.
- **Solução:** Criadas badges estilizadas exclusivas (`DRIME` e `TURBO`) com cores temáticas próprias, além de otimizações no layout das tabelas de resultados e agrupamento por pasta.

---

## 5. Sessão de 21/08/2026 - Arquitetura em 5 Camadas do Auto-Updater (GitHub Releases API + Hot Swap) e Ajuste no Scanner de Links

### Alterações e Implementações do Dia

#### 1. Arquitetura de Auto-Atualização em 5 Camadas (`main.js`, `renderer/js/app.js`, `renderer/index.html`, `renderer/css/style.css`)
- **Solução:** Desenvolvida a arquitetura completa em 5 camadas (Detecção SemVer, UI Changelog Modal, Stream Download, Hot Swap Handover e Padronização de Publicação).

#### 2. Exibição Condicional do Botão "Iniciar Download" (`renderer/js/app.js`)
- **Solução:** Ajustada a lógica no `app.js` para renderizar o botão "Iniciar Download" exclusivamente após o término do escaneamento com arquivos válidos encontrados.

---

## 4. Sessão de 20/08/2026 - Correções no Torbox Cloud, Sanitização de Caminhos Windows, Polling de Nuvem e Refinamentos de UI

### Alterações e Implementações do Dia

#### 1. Sanitização Rigorosa de Caminhos no Windows (`sanitizePathSegment` em `torbox-scanner.js` e `main.js`)
- **Solução:** Implementada a função `sanitizePathSegment` que remove quebras de linha (`\n`, `\r`, `\t`) e substitui caracteres não permitidos.

#### 2. Pré-Flight Recursivo de Redirecionamentos HTTP 3xx e Resolução de `numericId` (`main.js`)
- **Solução:** Pré-flight reformulado para seguir redirecionamentos HTTP 3xx (`301`, `302`, `303`, `307`, `308`) até o servidor CDN final.

#### 3. Injeção de Permalinks e Polling da Nuvem Torbox em Tempo Real (`torbox-scanner.js` e `main.js`)
- **Solução:** Injeção de permalinks diretos no scanner e monitoramento em tempo real em `resolveTorboxDirectUrl`.

---

## 1. Sessão de 12/08/2026 a 19/08/2026 - Multiprovedores e Fundação

- **Google Drive, Bunkr, MediaFire, TeraBox, OneDrive, TorBox e URLs Genéricas**: Suporte completo a múltiplos provedores, auto-resume, motor `net.request` e renderização in-place anti-flickering.

---

## Arquivos Criados / Modificados (Acumulado)

- **`drime-scanner.js`** (Modificado/Criado): Extrator nativo e resolver de arquivos/pastas do Drime Cloud.
- **`main.js`** (Modificado): Roteamento nativo para Drime Cloud e Turbo.cr, handlers IPC e worker HTTP Direct.
- **`renderer/js/app.js`** (Modificado): Badges visuais `DRIME` e `TURBO`, agrupamento de pastas e atualização da fila.
- **`renderer/css/style.css`** (Modificado): Estilização das badges e componentes visuais do Drime e Turbo.cr.
- **`renderer/index.html`** (Modificado): Ajustes de elementos e modais.
- **`torbox-scanner.js`** (Modificado): Refinamento de chamadas e fallbacks.
- **`review.md`** (Atualizado): Documentação oficial do projeto.
