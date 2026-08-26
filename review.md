# Nexus Downloader - Diário de Bordo & Registro de Alterações (review.md)

**Última Atualização:** 25/08/2026

---

## 9. Sessão de 25/08/2026 (Noite) - Módulo VikingFile / Vik1ngFile, Otimizações de Fila e Refinamentos de UI

### Alterações e Implementações do Dia

#### 1. Suporte Nativo ao VikingFile / Vik1ngFile (`vikingfile-scanner.js`, `main.js`)
- **Problema:** Links de arquivos hospedados no Vik1ngFile (`vik1ngfile.com`, `vikingfile.com`) não possuíam módulo dedicado para extração automática de metadados e links diretos.
- **Solução:** 
  - Desenvolvido o módulo `vikingfile-scanner.js` para escaneamento e resolução de URLs do Vik1ngFile, com extração de nome de arquivo, tamanho em bytes e link direto de CDN (via requisições POST e links de fast-download).
  - Integrado ao handler `scan-link` no `main.js` com suporte a downloads diretos e identificação visual na interface.

#### 2. Otimizações no Gerenciador de Fila e Cancelamento de Downloads (`renderer/js/app.js`, `main.js`)
- **Problema:** O cancelamento e remoção de itens na fila podiam apresentar pequeno atraso visual ou retenção de estado em workers pausados.
- **Solução:** Aprimorada a sincronização do cancelamento em `main.js` e atualizada a limpeza diferencial de elementos no DOM em `app.js`.

#### 3. Refinamento de UI e Modais (`renderer/index.html`, `renderer/js/app.js`)
- **Problema:** Ajustes finos de usabilidade e alinhamento nos modais de escaneamento de links.
- **Solução:** Atualizada a estrutura dos diálogos de entrada e otimizada a responsividade dos elementos.

---

## 8. Sessão de 25/08/2026 (Manhã) - Renovação do Ecossistema TorBox Cloud, Estatísticas de Conta e Otimização nos Scanners

### Alterações e Implementações do Dia

#### 1. Gerenciador Completo e Estatísticas da Nuvem TorBox (`torbox-scanner.js`, `main.js`, `renderer/`)
- **Solução:** Integrado logo oficial em alta resolução, cartões estatísticos da conta em tempo real (plano, banda, armazenamento, expiração) e ações de exclusão/download direto na nuvem.

#### 2. Otimizações no Scanner Bunkr e Suporte a Pixeldrain (`bunkr-scanner.js`, `generic-scanner.js`)
- **Solução:** Atualização nas rotinas de resolução do Bunkr e suporte aprimorado no `generic-scanner.js` para Pixeldrain.

---

## 7. Sessão de 23/08/2026 - Módulo de Varredura para a Família Send, Suporte a 1fichier e Redesenho de Modais de Entrada de Links

### Alterações e Implementações do Dia

#### 1. Suporte Nativo ao Provedor Send (`send-scanner.js`, `main.js`)
- **Solução:** Criado o módulo `send-scanner.js` para escaneamento de arquivos e pastas compartilhadas do Send (send.now, send.cm, sendit.cloud, etc.).

---

## 1. Sessão de 12/08/2026 a 22/08/2026 - Multiprovedores e Fundação

- **Google Drive, Bunkr, MediaFire, TeraBox, OneDrive, TorBox, Drime Cloud, Turbo.cr e URLs Genéricas**: Suporte completo a múltiplos provedores, auto-resume, motor `net.request`, sanitização no Windows e auto-updater em 5 camadas.

---

## Arquivos Criados / Modificados (Acumulado)

- **`vikingfile-scanner.js`** (Criado): Extrator nativo para links do VikingFile / Vik1ngFile.
- **`main.js`** (Modificado): Roteamento de escaneamento para VikingFile, cancelamento de downloads e pontes IPC.
- **`renderer/js/app.js`** (Modificado): Otimização de renderização da fila, gerenciamento de modais e ações da nuvem.
- **`renderer/index.html`** (Modificado): Ajustes nos modais e estruturas visuais.
- **`torbox-scanner.js`** (Modificado): Ajustes de requisições e fallbacks.
- **`review.md`** (Atualizado): Documentação oficial do projeto.
