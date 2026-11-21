# Nexus Downloader - Diário de Bordo & Registro de Alterações (review.md)

**Última Atualização:** 20/11/2026

---

## 11. Sessão de 20/11/2026 - Scanner Nativo Google Drive sem OAuth, Refatoração Completa MediaFire, Suporte PlayStation CDN (.pkg) e Árvore de Diretórios

### Alterações e Implementações do Dia

#### 1. Módulo Standalone de Varredura Google Drive sem Necessidade de OAuth (`gdrive-scanner.js`, `main.js`)
- **Problema:** O download de links e pastas públicas compartilhadas do Google Drive dependia da API oficial do Google e requeria que o usuário conectasse uma conta com OAuth (`token.json`), o que criava atrito e falhava caso o token expirasse (`invalid_grant`).
- **Solução:** 
  - Desenvolvido o scanner nativo e desacoplado `gdrive-scanner.js`, capaz de varrer arquivos e pastas públicas diretamente via HTTP/Scraping sem exigir autenticação OAuth.
  - Suporte completo a URLs modernas e legadas (`drive.google.com/folders/`, `/file/d/`, `embeddedfolderview`, `drive.usercontent.google.com`, `docs.google.com` e parâmetros `resourcekey`).
  - Navegação recursiva em pastas mantendo a hierarquia original (`preserveRelativePath`), bypass de avisos de arquivos grandes / antivírus (`confirm=t`), decodificação de entidades HTML e resolução de mojibake em nomes acentuados.
  - Suporte a exportação direta de Google Docs, Sheets e Slides em formatos `.docx`, `.xlsx` e `.pptx`.

#### 2. Refatoração Robusta do MediaFire com Desofuscação e Resolução Headless (`mediafire-scanner.js`, `main.js`)
- **Problema:** Links de arquivos e pastas do MediaFire com URLs curtas (`?quickkey`, `?sharekey`), proteções Cloudflare Turnstile ou scripts ofuscados (`data-scrambled-url`) falhavam ao obter o link direto de CDN.
- **Solução:** 
  - Criado o analisador multi-formato `parseMediaFireUrl` para suporte a `/folder/`, `/file/`, `/file_premium/`, `/download/`, `/view/`, `/listen/`, `/watch/`, `?quickkey` e links diretos `download*.mediafire.com`.
  - Implementada resolução HTTP direta com Cookie Jar, desofuscação de URLs embarcadas e fallback automático via janela headless do Electron (`resolveMediaFireViaElectron`) para superar desafios Cloudflare Turnstile/JS.
  - Varredura recursiva completa de subpastas via API v1.4 do MediaFire.

#### 3. Suporte Nativo a CDN da PlayStation e Pacotes `.pkg` (`generic-scanner.js`, `main.js`, `renderer/`, `extension/`)
- **Problema:** Links diretos de pacotes de jogos da PlayStation Network (`*.dl.playstation.net`) eram tratados genericamente sem identificação do jogo ou organização adequada de pastas, além de tentativas inadequadas de scrap em arquivos binários.
- **Solução:** 
  - Implementada a função `parsePlayStationCdnInfo` que detecta hosts PlayStation e extrai automaticamente Title ID, Game Slug e versão para organizar downloads em subpastas estruturadas (ex: `CUSA00411_00 - THELASTOFUS`).
  - Sondagem inteligente via requisição `GET` com cabeçalho `Range: bytes=0-0` para extrair `Content-Length` autoritativo sem carregar binários na memória.
  - Injetada a badge temática exclusiva `PlayStation` e a tag de extensão `.Pkg` na UI do aplicativo desktop e na extensão do navegador.

#### 4. Navegação em Árvore Hierárquica de Diretórios (`renderer/js/app.js`, `extension/content.js`, `extension/content.css`)
- **Problema:** Pastas com subpastas aninhadas eram exibidas de forma plana, dificultando a seleção parcial ou visualização de pastas complexas (como diretórios do Google Drive e jogos).
- **Solução:** 
  - Implementado sistema de renderização em árvore recursiva (`buildFolderTree`, `renderFolderNodeCard`) na tabela de resultados do Scanner do desktop, permitindo expandir/recolher nós e seleção em lote com checkboxes de estado indeterminado.
  - Adicionado modo equivalente de árvore no Gerenciador de Downloads da extensão do navegador (`showMgrFolderTree`), com controle de expansão de nós e seleção em lote.

---

## 10. Sessão de 29/10/2026 - Expansão Multiprovedores (MEGA, MegaUp, FileDitch, FileKeeper, Filester, DataNodes) e Ponte com a Extensão de Navegador

### Alterações e Implementações do Dia

#### 1. Novos Provedores e Scanners Nativos de Download
- **Solução:** Desenvolvidos e integrados 6 novos módulos de escaneamento dedicados: `mega-scanner.js`, `megaup-scanner.js`, `fileditch-scanner.js`, `filekeeper-scanner.js`, `filester-scanner.js` e `datanodes-scanner.js`.

#### 2. Integração e Aprimoramento da Extensão de Navegador (`extension/`)
- **Solução:** Sniffer/interceptador de URLs (`content.js`, `background.js`) com injeção de botão flutuante e menus de contexto no navegador.

---

## 9. Sessão de 25/08/2026 (Noite) - Módulo VikingFile / Vik1ngFile, Otimizações de Fila e Refinamentos de UI

### Alterações e Implementações do Dia

#### 1. Suporte Nativo ao VikingFile / Vik1ngFile (`vikingfile-scanner.js`, `main.js`)
- **Solução:** Desenvolvido o módulo `vikingfile-scanner.js` para escaneamento e resolução de URLs do Vik1ngFile.

---

## 1. Sessão de 12/08/2026 a 25/08/2026 - Multiprovedores e Fundação

- **Google Drive, Bunkr, MediaFire, TeraBox, OneDrive, TorBox, Drime Cloud, Turbo.cr, Send, VikingFile e URLs Genéricas**: Suporte completo a múltiplos provedores, auto-resume, motor `net.request`, sanitização no Windows e auto-updater em 5 camadas.

---

## Arquivos Criados / Modificados (Acumulado)

- **`gdrive-scanner.js`** (Criado): Extrator nativo para links e pastas públicas do Google Drive sem dependência de autenticação OAuth.
- **`mediafire-scanner.js`** (Modificado): Analisador canônico multi-formato, desofuscação de URLs, Cookie Jar e fallback headless Electron para Cloudflare.
- **`generic-scanner.js`** (Modificado): Detecção PlayStation CDN (`parsePlayStationCdnInfo`), sondagem Range de 1 byte e bloqueio de scraper HTML em binários diretos.
- **`main.js`** (Modificado): Roteamento nativo para Google Drive standalone, PlayStation CDN, concorrência e persistência de hierarquia de diretórios (`preserveRelativePath`).
- **`renderer/js/app.js`** (Modificado): Visualização em árvore recursiva de pastas (`buildFolderTree`), tags `.Pkg`, badge `PlayStation` e sincronização de checkboxes.
- **`renderer/css/style.css`** (Modificado): Estilização da árvore de diretórios, badges e nós aninhados.
- **`extension/content.js`** (Modificado): Árvore de diretórios no gerenciador in-page (`showMgrFolderTree`), detecção de `.pkg` e HUD otimizado.
- **`extension/content.css`** (Modificado): Estilização dos nós da árvore de pastas e headers colapsáveis na extensão.
- **`extension/background.js`** (Modificado): Regras aprimoradas de captura de downloads e comunicação com o desktop.
- **`review.md`** (Atualizado): Documentação oficial do projeto.
