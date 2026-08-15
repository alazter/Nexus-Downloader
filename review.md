# Nexus Downloader - Diário de Bordo & Registro de Alterações (review.md)

**Última Atualização:** 14/08/2026

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
- **Solução:** Criado o módulo `mediafire-scanner.js`, que adiciona suporte completo a links de arquivos e pastas do MediaFire:
  - Integração com a API v1.4 do MediaFire para varredura recursiva de pastas e subpastas.
  - Leitura resiliente de páginas de arquivo e extração de links diretos de CDN (`download*.mediafire.com`).
  - Suporte a redirecionamentos (HTTP 301/302/307/308) e bypass de verificação SSL em cenários com proxies localizados/antivírus no Windows.

#### 2. Generalização do Worker HTTP Direct e Persistência na Fila
- **Problema:** A estrutura de downloads HTTP diretos estava engessada no módulo Bunkr e a fila de downloads (`queue.json`) não persistia propriedades do MediaFire.
- **Solução:** 
  - Atualizado `main.js` para estender o worker HTTP Direct para Bunkr e MediaFire.
  - Atualizadas as rotinas de serialização (`saveQueue`) e adição na fila (`add-to-queue`) para persistir `mediafireUrl`, `fileId`, `numericId` e a flag `isHttpDirect`.

#### 3. Tratamento Automático de Expiração do Token Google (`invalid_grant`)
- **Problema:** Em caso de token de autenticação revogado ou expirado do Google Drive (`invalid_grant`), o aplicativo gerava erros contínuos sem orientação limpa ao usuário.
- **Solução:** Implementada captura específica de exceções `invalid_grant` em `main.js`, que remove o arquivo `token.json` inválido e apresenta mensagem legível solicitando reconexão da conta.

#### 4. Otimização do Resolver Bunkr
- **Problema:** Requisições de validação de desafio no Bunkr podiam consumir buffers grandes desnecessariamente.
- **Solução:** Ajustado o leitor de buffers em `bunkr-scanner.js` para interromper o carregamento após obter os primeiros 64KB, otimizando o tempo de resposta e uso de memória.

---

## Arquivos Criados / Modificados (Acumulado)

- **`renderer/js/app.js`** (Modificado): Refatoração anti-flickering da fila (`updateQueueItemElement`, DOM in-place) e modais `showCustomConfirm`.
- **`renderer/index.html`** (Modificado): Estrutura HTML para o modal de confirmação customizado.
- **`renderer/css/style.css`** (Modificado): Estilização do modal customizado, animações e refinamentos da lista de downloads.
- **`renderer/icon.png` / `renderer/icon.svg`** (Modificados): Atualização dos artefatos visuais de ícones do aplicativo.
- **`main.js`** (Modificado): Ajustes de backend Electron e handlers IPC.
- **`mediafire-scanner.js`** (Criado): Módulo de varredura e resolução de URLs do MediaFire.
- **`bunkr-scanner.js`** (Modificado): Otimização de leitura de buffer HTTP.
- **`review.md`** (Atualizado): Documentação oficial de progresso.
