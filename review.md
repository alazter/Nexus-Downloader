# Nexus Downloader - Diário de Bordo & Registro de Alterações (review.md)

**Última Atualização:** 12/08/2026

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

## Arquivos Criados / Modificados

- **`mediafire-scanner.js`** (Criado): Módulo de varredura e resolução de URLs do MediaFire (arquivos e pastas).
- **`main.js`** (Modificado): Suporte a MediaFire no IPC scanner, serialização de fila, tratamento de token Google expirado e roteamento do worker HTTP Direct.
- **`bunkr-scanner.js`** (Modificado): Limite de leitura de buffer de 64KB para validações HTTP.
- **`review.md`** (Criado): Documentação oficial do progresso e alterações do projeto.
