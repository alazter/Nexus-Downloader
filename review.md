# Nexus Downloader - Diário de Bordo & Registro de Alterações (review.md)

**Última Atualização:** 29/10/2026

---

## 10. Sessão de 29/10/2026 - Expansão Multiprovedores (MEGA, MegaUp, FileDitch, FileKeeper, Filester, DataNodes) e Ponte com a Extensão de Navegador

### Alterações e Implementações do Dia

#### 1. Novos Provedores e Scanners Nativos de Download
- **Problema:** Usuários precisavam baixar mídias e arquivos hospedados em múltiplos serviços adicionais (MEGA, MegaUp, FileDitch, FileKeeper, Filester, DataNodes) que exigiam tratamento próprio de descriptografia, headers ou tokens.
- **Solução:** Desenvolvidos e integrados 6 novos módulos de escaneamento dedicados:
  - **`mega-scanner.js`**: Suporte completo a links de arquivos e pastas recursivas do MEGA (`mega.nz`, `mega.io`), descriptografia de metadados, decodificação de chaves base64url e resolução de nós.
  - **`megaup-scanner.js`**: Extrator resiliente de links do MegaUp (`megaup.net`), leitura de páginas e bypass de temporizadores.
  - **`fileditch-scanner.js`**: Scanner especializado para FileDitch (`fileditch.com`, `fileditchfiles.st`, `blehpooffileditchvids.org`).
  - **`filekeeper-scanner.js`**: Módulo dedicado para links do FileKeeper (`filekeeper.net`).
  - **`filester-scanner.js`**: Extrator de arquivos e vídeos do Filester (`filester.si`, `filester.sh`, `filester.me`).
  - **`datanodes-scanner.js`**: Scanner nativo para links do DataNodes (`datanodes.to`).

#### 2. Integração e Aprimoramento da Extensão de Navegador (`extension/`)
- **Problema:** Necessidade de capturar links de mídias e downloads diretamente do navegador sem necessidade de copiar e colar manualmente na aplicação desktop.
- **Solução:** 
  - Atualizado o sniffer/interceptador de URLs (`content.js`, `background.js`) com injeção de botão flutuante e menus de contexto no navegador.
  - Aperfeiçoada a ponte de comunicação local via WebSocket/HTTP entre a extensão e o aplicativo desktop (`main.js`), enviando itens diretamente para o Scanner ou Fila com um clique.
  - Ajustes de estilo (`content.css`), opções (`options/options.html`) e popup (`popup/popup.js`).

#### 3. Refinamento de Scanners Existentes e Motor de Download (`generic-scanner.js`, `terabox-scanner.js`, `vikingfile-scanner.js`, `main.js`)
- **Problema:** Mudanças de endpoints e formatos de CDN em servidores de streaming e hospedagem direta causavam falhas ocasionais de resolução.
- **Solução:** 
  - Ampliada a cobertura de hosts e detecção de cabeçalhos no `generic-scanner.js`.
  - Otimizada a resolução de links diretos e buffers no `terabox-scanner.js` e `vikingfile-scanner.js`.
  - Tratamento aprimorado de conexões e sockets no worker HTTP Direct em `main.js`.

#### 4. Badges Visuais e Aprimoramento da Interface (`renderer/`)
- **Problema:** A fila de downloads e o scanner necessitavam de identificação visual clara para a nova gama de provedores suportados.
- **Solução:** Injetadas novas badges estilizadas (`MEGA`, `MEGAUP`, `FILEDITCH`, `FILEKEEPER`, `FILESTER`, `DATANODES`), ajustes de responsividade no `index.html` e estilização refinada no `style.css` e `app.js`.

---

## 9. Sessão de 25/08/2026 (Noite) - Módulo VikingFile / Vik1ngFile, Otimizações de Fila e Refinamentos de UI

### Alterações e Implementações do Dia

#### 1. Suporte Nativo ao VikingFile / Vik1ngFile (`vikingfile-scanner.js`, `main.js`)
- **Solução:** Desenvolvido o módulo `vikingfile-scanner.js` para escaneamento e resolução de URLs do Vik1ngFile, com extração de nome de arquivo, tamanho em bytes e link direto de CDN.

#### 2. Otimizações no Gerenciador de Fila e Cancelamento de Downloads (`renderer/js/app.js`, `main.js`)
- **Solução:** Aprimorada a sincronização do cancelamento em `main.js` e atualizada a limpeza diferencial de elementos no DOM em `app.js`.

---

## 8. Sessão de 25/08/2026 (Manhã) - Renovação do Ecossistema TorBox Cloud, Estatísticas de Conta e Otimização nos Scanners

### Alterações e Implementações do Dia

#### 1. Gerenciador Completo e Estatísticas da Nuvem TorBox (`torbox-scanner.js`, `main.js`, `renderer/`)
- **Solução:** Integrado logo oficial em alta resolução, cartões estatísticos da conta em tempo real e ações de exclusão/download direto na nuvem.

---

## 1. Sessão de 12/08/2026 a 23/08/2026 - Multiprovedores e Fundação

- **Google Drive, Bunkr, MediaFire, TeraBox, OneDrive, TorBox, Drime Cloud, Turbo.cr, Send e URLs Genéricas**: Suporte completo a múltiplos provedores, auto-resume, motor `net.request`, sanitização no Windows e auto-updater em 5 camadas.

---

## Arquivos Criados / Modificados (Acumulado)

- **`mega-scanner.js`** (Criado): Extrator nativo e descriptografia para arquivos e pastas do MEGA.
- **`megaup-scanner.js`** (Criado): Extrator resiliente de links do MegaUp.
- **`fileditch-scanner.js`** (Criado): Scanner dedicado para FileDitch.
- **`filekeeper-scanner.js`** (Criado): Extrator de links do FileKeeper.
- **`filester-scanner.js`** (Criado): Scanner dedicado para Filester.
- **`datanodes-scanner.js`** (Criado): Scanner nativo para DataNodes.
- **`extension/`** (Modificado): Interceptador de links, ponte desktop e interface da extensão de navegador.
- **`generic-scanner.js`** (Modificado): Ampliação de suporte a novos servidores de mídia e cabeçalhos.
- **`terabox-scanner.js`** (Modificado): Otimização de buffers e resolução de streams.
- **`vikingfile-scanner.js`** (Modificado): Refinamento da extração de links rápidos.
- **`main.js`** (Modificado): Roteamento dos novos scanners, ponte com a extensão e otimizações de download.
- **`renderer/index.html`** (Modificado): Elementos de interface, configurações e badges dos novos provedores.
- **`renderer/css/style.css`** (Modificado): Estilização das novas badges e refinamentos visuais.
- **`renderer/js/app.js`** (Modificado): Suporte de UI e renderização dos novos provedores na fila e scanner.
- **`review.md`** (Atualizado): Documentação oficial do projeto.
