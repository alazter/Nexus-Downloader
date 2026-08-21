# Nexus Downloader - Diário de Bordo & Registro de Alterações (review.md)

**Última Atualização:** 20/08/2026

---

## 4. Sessão de 20/08/2026 - Correções no Torbox Cloud, Sanitização de Caminhos Windows, Polling de Nuvem e Refinamentos de UI

### Alterações e Implementações do Dia

#### 1. Sanitização Rigorosa de Caminhos no Windows (`sanitizePathSegment` em `torbox-scanner.js` e `main.js`)
- **Problema:** Magnet links que continham caracteres de controle (`\n`, `%0A`) ou caracteres ilícitos no parâmetro `dn=` falhavam ao criar diretórios no Windows, cancelando o download antes da gravação.
- **Solução:** Implementada a função `sanitizePathSegment` que remove quebras de linha (`\n`, `\r`, `\t`) e substitui caracteres não permitidos (`\`, `/`, `:`, `*`, `?`, `"`, `<`, `>`, `|`) por espaços seguros antes de criar pastas locais no SO.

#### 2. Pré-Flight Recursivo de Redirecionamentos HTTP 3xx e Resolução de `numericId` (`main.js`)
- **Problema:** Respostas HTTP `307 Temporary Redirect` vindas da API do Torbox faziam o pré-flight considerar o CDN incompatível com `Range`, forçando conexão simples e resultando em erro HTTP 307.
- **Solução:** Pré-flight reformulado para seguir redirecionamentos HTTP 3xx (`301`, `302`, `303`, `307`, `308`) até o servidor CDN final (`tb-cdn.cx`), capturando o tamanho autoritativo via `Content-Range` e habilitando 4 conexões paralelas.

#### 3. Injeção de Permalinks e Polling da Nuvem Torbox em Tempo Real (`torbox-scanner.js` e `main.js`)
- **Problema:** Arquivos de magnet links caheados enviados pelo scanner entravam sem URL direta, e torrents ainda em progresso na nuvem Torbox travavam em 0%.
- **Solução:** 
  - A função `scanTorboxLink` passou a injetar permalinks diretos de download em todos os arquivos ao escanear.
  - Implementado monitoramento em tempo real em `resolveTorboxDirectUrl` que exibe o progresso da nuvem (`☁️ Torbox baixando na nuvem X%`), identificando automaticamente o arquivo de vídeo principal assim que o torrent é concluído (100%).

#### 4. Ajustes de Layout Visual, Badges e Fallback no Scanner (`renderer/js/app.js` e `renderer/css/style.css`)
- **Problema:** Títulos extensos de torrents deformavam a tag `Ready (100%)` com quebra de linha interna, e os cartões de resultado do scanner eram exibidos recolhidos por padrão.
- **Solução:** 
  - Fixadas as badges de status com `flex-shrink: 0; white-space: nowrap !important;`, permitindo quebra de linha apenas no título.
  - Cartões de resultado no Scanner exibidos expandidos por padrão.
  - Adicionado fallback automático para Torbox Hoster e Motor Genérico quando extratores específicos (ex: Bunkr) falham.

---

## 3. Sessão de 19/08/2026 - Multiprovedores, Motor de Download net.request e Correção de Bugs de Interface & HTTP 416

### Alterações e Implementações do Dia

#### 1. Correção Estrutural da Aba de Ajustes e Interface (`renderer/index.html` e `renderer/css/style.css`)
- **Problema:** Ao navegar para a página de Ajustes ou TorBox, o conteúdo dos cartões ficava oculto ou com renderização quebrada.
- **Solução:** Corrigido aninhamento HTML em `index.html` inserindo a tag de fechamento `</section>` na Fila de Downloads (`#queue-tab`), isolando as abas de Ajustes e TorBox.

#### 2. Correção de Sobreposição e Transparência no Dropdown do TorBox (`renderer/css/style.css`)
- **Problema:** O menu suspenso de filtros do TorBox aparecia por trás dos cartões de arquivo e possuía fundo transparente.
- **Solução:** Elevada a hierarquia de camadas (`z-index: 20` no `.app-top-section` e `z-index: 9999` no `.torbox-filter-dropdown`) com fundo escuro 100% opaco (`#0f172a`).

#### 3. Eliminação do Erro HTTP 416 em Downloads TorBox WebDL/Hoster (`main.js` e `torbox-scanner.js`)
- **Problema:** Downloads de arquivos via TorBox apontando para provedores externos (ex: Gofile) falhavam com erro HTTP 416 devido à divergência entre tamanho estimado e tamanho real no CDN.
- **Solução:** Sondagem prévia de cabeçalhos (`HEAD`/`GET` `Range: bytes=0-0`) antes do início do download para extrair o tamanho exato via `Content-Range`.

---

## 2. Sessão de 14/08/2026 - Renderização Fluida da Fila (Anti-Flicker), Modais Customizados e Ajustes de UI/UX

### Alterações e Implementações do Dia

#### 1. Refatoração In-Place da Fila de Downloads (Zero Flickering)
- **Solução:** Implementado sistema de renderização diferencial in-place em `renderer/js/app.js` reutilizando elementos HTML e atualizando textos/barras pontualmente.

---

## 1. Sessão de 12/08/2026 - Integração do MediaFire, Erros de Autenticação e Otimizações HTTP Direct

### Alterações e Implementações do Dia

#### 1. Suporte Nativo a Links e Pastas do MediaFire
- **Solução:** Criado o módulo `mediafire-scanner.js` para varredura e resolução de URLs do MediaFire.

---

## Arquivos Criados / Modificados (Acumulado)

- **`bug_corrigidos.md`** (Modificado): Documentação detalhada dos Bugs 04, 05, 06, 07, 08, 09 e 10.
- **`torbox-scanner.js`** (Modificado): Injeção de permalinks no scanner, polling de nuvem em tempo real e sanitização de caminhos.
- **`main.js`** (Modificado): Pré-flight recursivo para HTTP 3xx, resiliência no worker HTTP Direct e sanitização de diretórios.
- **`renderer/js/app.js`** (Modificado): Exibição de resultados expandidos por padrão no scanner e refinamento do renderizador de pastas.
- **`renderer/css/style.css`** (Modificado): Proteção das badges `Ready (100%)` contra quebra de linha e deformações de layout.
- **`renderer/index.html`** (Modificado): Ajustes de elementos e modais.
- **`bunkr-scanner.js`** (Modificado): Melhoria de regex e suporte a fallbacks.
- **`terabox-scanner.js`** (Modificado): Ajuste de tratamento de streams.
- **`review.md`** (Atualizado): Documentação oficial do projeto.
