# 📦 TeraBox Download Manual & Gateway Architecture (`terabox.md`)

Este documento serve como um manual técnico e registro de todas as tentativas, pesquisas e arquiteturas desenvolvidas no **Nexus Downloader** para realizar escaneamento e downloads de links compartilhados do **TeraBox.com** (e seus domínios espelho: `1024tera.com`, `terabox.app`, `terabox.link`, etc.).

---

## 📌 Sumário
1. [Histórico de Tentativas de Download Direto (Nativo)](#1-histórico-de-tentativas-de-download-direto-nativo)
2. [Arquitetura Exclusiva "Download All" (Pacotes ZIP de Pastas)](#2-arquitetura-exclusiva-download-all-pacotes-zip-de-pastas)
3. [Reverse Engineering do `teraboxdl.site` & `folder-download`](#3-reverse-engineering-do-teraboxdlsite--folder-download)
4. [Guia de Manutenção e Próximos Passos](#4-guia-de-manutenção-e-próximos-passos)

---

## 1. Histórico de Tentativas de Download Direto (Nativo)

### 1.1 Escaneamento e Navegação de Diretórios (BFS)
- **Status**: ✅ **100% Integrado via TeraboxDL Gateway**
- **Mapeamento de Pastas e Subpastas**:
  - O algoritmo BFS em [`terabox-scanner.js`](file:///c:/Users/alazt/Documents/GitHub/Projetos/Google%20driver%20downloader/terabox-scanner.js) varre recursivamente a árvore de diretórios do TeraBox usando a infraestrutura do `teraboxdl.site`.
  - Preserva a estrutura original de pastas mãe (ex: `/Agent Aika`) e subpastas (ex: `/Agent Aika/Menor` e `/Agent Aika/Maior`), permitindo ao usuário baixar os pacotes completos de subpastas na interface do Nexus Downloader.

---

## 2. Arquitetura Exclusiva "Download All" (Pacotes ZIP de Pastas)

Conforme a diretiva do usuário, o Nexus Downloader opera com foco **100% exclusivo no mecanismo "Download All"**:

1. **Ignorados Arquivos Avulsos**: A listagem omite arquivos individuais e disponibiliza os pacotes completos de pasta (ex: `Menor (Download All - Pacote Completo).zip`, 3.92 GB).
2. **Resolução de Token `folder-download`**: Ao adicionar a subpasta à fila e iniciar o download, o motor solicita a URL direta do pacote ZIP de pasta (`https://api.teraboxdl.site/folder-download?token=...`).
3. **Auto-Retomada por Chunking**: Se a conexão do `teraboxdl.site` fechar por tempo esgotado durante a transferência dos 3.92 GB, o motor do Nexus Downloader solicita automaticamente o fragmento restante com `Range: bytes=downloadedBytes-` e continua baixando até gravar 100% do arquivo ZIP no disco.

---

## 3. Reverse Engineering do `teraboxdl.site` & `folder-download`

1. **Rota de Proxy Interna**:
   - `teraboxdl.site` expõe um endpoint de API Next.js em `https://teraboxdl.site/api/proxy`.
2. **Payload da API Proxy**:
   - Aceita chamadas `POST` contendo:
     ```json
     {
       "url": "https://www.terabox.com/portuguese/sharing/link?surl=gQtJWtp5vGX9J9VYSTHvww",
       "dir": "/Agent Aika/Menor",
       "shareid": 1038225584,
       "uk": 4400373246400
     }
     ```
3. **Download Token de Pasta**:
   - O campo `folder_download_url: "https://api.teraboxdl.site/folder-download?token=..."` (`Content-Type: application/zip`, pacote ZIP completo da pasta de 3.92 GB / 4.20 GB).

---

## 4. Guia de Manutenção

- **Modo Download All**: A varredura gera itens do tipo `isFolderZip: true`, direcionando todas as transferências para os tokens `folder-download`.
