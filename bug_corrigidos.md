# Histórico de Bugs Corrigidos - Nexus Downloader

## Bug 01: Ocultamento do Conteúdo da Página de Ajustes e Quebra da Interface por Desalinhamento HTML

### Causa Raiz Identificada e Corrigida
Através de uma varredura diagnóstica profunda com execução remota de testes internos no Electron e inspeção visual da renderização do app, identificamos a causa exata do problema:

1. **Tag de Fechamento Faltante no HTML ([`renderer/index.html`](file:///c:/Users/alazt/Documents/GitHub/Projetos/Google%20driver%20downloader/renderer/index.html#L334))**:
   - A tag `</section>` que encerrava a seção da Fila de Downloads (`#queue-tab`) estava ausente no HTML.
   - Isso fazia com que o navegador interpretasse as abas do Torbox (`#torbox-tab`) e dos Ajustes (`#settings-tab`) como elementos filhos aninhados dentro da Fila de Downloads.
   - Consequentemente, ao sair da Fila de Downloads, a Fila recebia `display: none`, o que ocultava automaticamente todo o conteúdo de Ajustes e Torbox que estavam presos dentro dela.

2. **Fechamento e Isolamento das Abas ([`renderer/index.html`](file:///c:/Users/alazt/Documents/GitHub/Projetos/Google%20driver%20downloader/renderer/index.html#L334))**:
   - Adicionada a tag `</section>` para fechar a Fila de Downloads e isolar `#torbox-tab` e `#settings-tab` como seções independentes.
   - Corrigido o topo do Torbox adicionando `style="display: none;"` no `#torbox-top-content` para que não sobreponha a tela principal do Scanner.

3. **Reunificação e Estilização dos Ajustes ([`renderer/css/style.css`](file:///c:/Users/alazt/Documents/GitHub/Projetos/Google%20driver%20downloader/renderer/css/style.css#L542))**:
   - Organizados os 4 cartões de configuração (*Destino do Download*, *Preferências de Desempenho*, *Conexão Torbox API* e *Conexão Google Drive OAuth*) com a seção *Destino do Download* posicionada na área superior (`#settings-top-content`) logo abaixo do subtítulo.
   - Adicionada a regra `opacity: 1 !important;` e transição suave na classe `.tab-content.active` no CSS.

---

### Instruções de Restauração em Caso de Reincidência
Caso a interface volte a ocultar o conteúdo da página de Ajustes ou Torbox no futuro:
1. Verifique se todas as seções `<section class="tab-content" id="...">` no arquivo `renderer/index.html` estão devidamente fechadas com `</section>` antes da abertura da aba seguinte.
2. Certifique-se de que `#torbox-top-content` e `#settings-top-content` possuem `style="display: none;"` por padrão no HTML.
3. Garanta que a classe `.tab-content.active` no arquivo `renderer/css/style.css` possua `display: flex;` e `opacity: 1 !important;`.

---

## Bug 02: Sobreposição e Transparência do Menu de Filtros do Torbox

### Causa Raiz Identificada e Corrigida
- **Hierarquia de Camadas (`z-index`)**: O contêiner superior `.app-top-section` não possuía um contexto de empilhamento superior a `.app-bottom-content`. Como a lista de arquivos da nuvem ficava após a seção superior no código HTML, o menu suspenso `#torbox-filter-dropdown` acabava sendo renderizado **por trás** dos cartões de arquivo da lista.
- **Transparência do Fundo**: O menu usava `background: rgba(15, 23, 42, 0.95)` com `backdrop-filter`, fazendo com que os textos dos cartões abaixo ficassem visíveis através do menu.

### Solução Aplicada
1. Ajustado o CSS em [`renderer/css/style.css`](file:///c:/Users/alazt/Documents/GitHub/Projetos/Google%20driver%20downloader/renderer/css/style.css#L81):
   - `.app-top-section { position: relative; z-index: 20; }`
   - `.top-main-area { position: relative; z-index: 25; }`
   - `.app-bottom-content { position: relative; z-index: 1; }`
   - `.torbox-filter-dropdown { z-index: 9999 !important; background: #0f172a !important; }`
2. O fundo do dropdown agora é **100% opaco escuro** (`#0f172a`), eliminando o sangramento do texto abaixo e garantindo contraste nítido.

---

## Bug 03: Erro HTTP 416 e Interrupção no Download de Arquivos Torbox WebDL/Hoster (ex: Gofile)

### Causa Raiz Identificada e Corrigida
1. **Divergência entre Tamanho Declarado e Tamanho Real do CDN**:
   - Links de WebDL (como Gofile, 1fichier, etc.) adicionados ao Torbox reportavam tamanhos estimados em `/webdl/mylist` que diferiam do tamanho real entregue pelo servidor CDN.
   - Ao calcular os 4 segmentos de multiconexão baseados no tamanho estimado (ex: 18.7 GB em vez dos reais 10.2 GB do arquivo do Gofile), o 4º segmento enviava uma requisição `Range` além do fim real do arquivo. O servidor CDN do Torbox rejeitava o segmento com **HTTP 416 Range Not Satisfiable**.
2. **Avaliação Falsa de Download Truncado**:
   - Quando o download migrava para o modo de conexão única, o aplicativo mantinha o tamanho estimado incorreto. Ao concluir os 10.2 GB reais, o aplicativo achava que o arquivo estava incompleto e abortava a gravação.

### Solução Aplicada
1. **Pré-Flight Header Probe em `main.js`**:
   - Antes de iniciar qualquer download do Torbox, o motor realiza uma rápida sondagem prévia (`HEAD`/`GET` `Range: bytes=0-0`) na URL final do CDN para ler os cabeçalhos autoritativos `Content-Range` e `Content-Length`.
2. **Ajuste Dinâmico do Tamanho Real**:
   - O aplicativo atualiza instantaneamente `queueItem.size` para o tamanho real exato retornado pelo servidor CDN antes de dividir os segmentos ou pré-alocar os arquivos.
3. **Divisão de Segmentos Perfeita**:
   - Com o tamanho real ajustado pelo pré-flight, os 4 segmentos paralelos são divididos com precisão cirúrgica sem gerar requisições fora dos limites e sem disparar erros HTTP 416.

### Instruções de Restauração em Caso de Reincidência
Caso algum download do Torbox volte a apresentar erro 416 ou interrompa no início:
1. Certifique-se de que a função de pre-flight HTTP (`preflightCheck`) em `main.js` está sendo invocada antes do bloco `isMultiMode`.
2. Verifique se `queueItem.size` é atualizado a partir do cabeçalho `content-range` (`bytes 0-0/TAMANHO_REAL`) retornado pelo servidor CDN.

---

## Bug 04: Magnet Link Não Iniciava no Nexus (Caracteres de Controle `\n` no Parâmetro `dn=`)

### Causa Raiz Identificada e Corrigida
1. **Quebra de Linha Embutida na URL (`dn=Torrentio%0A1080p`)**:
   - O parâmetro `dn` (display name) do Magnet Link enviado continha a sequência codificada `%0A` (quebra de linha `\n`).
   - Ao executar `decodeURIComponent("Torrentio%0A1080p")`, o nome da pasta do torrent foi extraído como `"Torrentio\n1080p"`.
   - Ao montar o caminho no disco rígido (`C:\Users\...\Downloads\Torrentio\n1080p`), o sistema operacional Windows rejeitou o caminho devido a caracteres de controle ilícitos em diretórios do SO, falhando o `fs.mkdirSync` e cancelando o download antes da criação do arquivo local.

2. **Identificador de Arquivo Genérico (`file_id: 0`) no Início da Adição**:
   - Quando um magnet recém-adicionado ainda estava inicializando seus metadados no Torbox Cloud, o escaneamento inicial criava um item genérico com `torboxFileId: 0`. Ao solicitar a URL no CDN, a API apontava para um arquivo de texto secundário ou retornava URL genérica sem selecionar o vídeo principal (`.mkv`).

### Solução Aplicada
1. **Função de Sanitização de Caminhos `sanitizePathSegment` (`torbox-scanner.js` e `main.js`)**:
   - Adicionada a substituição automática de quebras de linha (`\n`, `\r`, `\t`) e caracteres inválidos (`\`, `/`, `:`, `*`, `?`, `"`, `<`, `>`, `|`) por espaços ou caracteres seguros antes de criar caminhos de arquivos e pastas no Windows.
   - O nome `"Torrentio\n1080p"` passou a ser limpo para `"Torrentio 1080p"`, criando o diretório local no Windows com 100% de sucesso.
2. **Sondagem de Inicialização de Arquivos no Torrent (`torbox-scanner.js`)**:
   - O scanner aguarda brevemente a lista de arquivos (`t.files`) ser populada pelo Torbox Cloud ao adicionar um novo torrent, obtendo diretamente o arquivo principal de vídeo (`Virgin.Island.S01E01.1080p.AV1.10bit-MeGusta.mkv`, 441.82 MB) e atribuindo seu `torboxFileId` exato.
3. **Resolução Automática do Vídeo Principal no Resolver (`torbox-scanner.js`)**:
   - Caso `torboxFileId` chegue indefinido, o resolver consulta a lista do torrent no Torbox e seleciona automaticamente o arquivo de maior tamanho (o vídeo principal).

---

## Bug 05: Interrupção nos Downloads do Torbox por Redirecionamento HTTP 307 Não Tratado e Mapeamento de `numericId`

### Causa Raiz Identificada e Corrigida
1. **Redirecionamento HTTP 307 Não Tratado no Pré-Flight (`main.js`)**:
   - Os links de download direto gerados pela API do Torbox (`https://api.torbox.app/v1/api/torrents/requestdl?...&redirect=true`) retornam uma resposta HTTP `307 Temporary Redirect` apontando para o servidor CDN de alta velocidade (`nexus-082.latm.tb-cdn.cx`).
   - O pré-flight anterior realizava uma única sondagem. Como a resposta HTTP `307` não trazia o cabeçalho `Content-Range`, o pré-flight marcava o suporte a `Range` como falso (`supportsRangeHeader = false`).
   - Ao migrar para a conexão simples, o cliente HTTP nativo do Node.js recebia o status `307` e tentava iniciar o download diretamente no código de redirecionamento. O motor verificava `if (res.statusCode !== 200)` e lançava um erro fatal ("Servidor retornou HTTP 307"), interrompendo **todos os downloads da nuvem Torbox**.

2. **Divergência de Parâmetro `numericId` na Chamada do Resolver (`main.js`)**:
   - Para os itens listados na aba do Torbox (`torbox_cloud_...`), o campo `queueItem.numericId` permanecia `undefined`. Ao invocar `resolveTorboxDirectUrl(queueItem.numericId, ...)`, o primeiro parâmetro `fileId` recebia `undefined`, fazendo a API consultar `torrent_id=0` e falhar com HTTP 404.

### Solução Aplicada
1. **Pré-Flight Recursivo de Redirecionamentos HTTP 3xx (`main.js`)**:
   - O pré-flight agora segue em loop até 5 redirecionamentos (`301`, `302`, `303`, `307`, `308`) até atingir o servidor CDN final.
   - Ao atingir o nó CDN (`nexus-082.latm.tb-cdn.cx`), o pré-flight recebe HTTP `206 Partial Content`, obtém o tamanho real autoritativo (ex: 4.77 GB) e habilita a multiconexão paralela de 4 segmentos em velocidade máxima.
2. **Uso de Permalinks e IDs Corretos (`main.js`)**:
   - Se o item da fila já possuir o permalink direto (`requestdl?token=...`), o aplicativo reutiliza o permalink direto sem fazer chamadas redundantes com IDs ausentes.
   - Caso precise resolver, passa `queueItem.fileId || queueItem.id` de forma segura.

---

## Bug 06: Arquivos de Magnet Links Caheados Não Baixavam após Escanear no Scanner

### Causa Raiz Identificada e Corrigida
- **Permalinks Ausentes nos Resultados do Scanner (`torbox-scanner.js`)**:
  - Quando o usuário colava um Magnet Link no **Scanner de Links**, a função `scanTorboxLink` adicionava o torrent na nuvem e retornava os arquivos encontrados na tabela de resultados.
  - No entanto, o campo `torboxDownloadUrl` retornava como uma string vazia (`''`), e os campos `directUrl` e `downloadUrl` não eram gerados na lista de resultados.
  - Ao enviar esses arquivos para a Fila de Downloads, os itens entravam na fila com `directUrl: null`. Ao tentar iniciar o download local no PC, o motor precisava resolver a URL e falhava caso houvesse desencontro nos IDs dos arquivos caheados.

### Solução Aplicada
1. **Injeção de Permalinks de Download no Scanner (`torbox-scanner.js`)**:
   - A função `scanTorboxLink` agora pré-constrói os permalinks diretos (`https://api.torbox.app/v1/api/torrents/requestdl?token=...&torrent_id=...&file_id=...&redirect=true`) para **todos os arquivos do torrent** imediatamente ao escanear.
2. **Transferência Instantânea para a Fila (`main.js`)**:
   - Ao adicionar os arquivos escaneados à Fila de Downloads, o Nexus recebe o `directUrl` pronto de cada arquivo.
   - O download inicia de forma instantânea, realizando a resolução do redirecionamento no CDN e salvando os arquivos no computador na velocidade máxima.

---

## Bug 07: Trava em 0% e Timeout ao Aguardar Conclusão de Download na Nuvem do Torbox

### Causa Raiz Identificada e Corrigida
1. **Ignoração do Loop de Monitoramento de Nuvem em `main.js`**:
   - Para arquivos ainda em progresso de download/cache na nuvem Torbox, a fila continha permalinks diretos temporários. Ao tentar iniciar o download local antes do Torbox concluir na nuvem, o CDN do Torbox rejeitava a conexão com HTTP 400 Bad Request, fazendo o download travar em 0% ou migrar para fallbacks inválidos.

2. **Perda do ID do Arquivo Principal (`torboxFileId`) ao Concluir o Torrent**:
   - Quando um torrent recém-adicionado ainda estava baixando na nuvem Torbox, a lista de arquivos internos do torrent ainda não possuía IDs atribuídos (retornando `file_id: 0`).
   - Quando a nuvem Torbox finalmente concluía o torrent (100%), a chamada `requestdl` com `file_id: 0` falhava ou retornava `null` porque o ID real do arquivo de vídeo no torrent final era diferente de zero (ex: `file_id: 2`).

### Solução Aplicada
1. **Monitoramento Ativo de Progresso da Nuvem em Tempo Real (`torbox-scanner.js` e `main.js`)**:
   - `resolveTorboxDirectUrl` foi reformulado para monitorar ativamente o status em tempo real a cada 4 segundos, reportando os avisos `☁️ Torbox baixando na nuvem (X%)...` na fila.
2. **Identificação Dinâmica do Arquivo Principal Concluído (`torbox-scanner.js`)**:
   - No milissegundo em que a nuvem Torbox atinge 100% / `download_finished`, o resolver varre a lista atualizada de arquivos do torrent (`item.files`), localiza o arquivo de mídia principal (maior tamanho) e atualiza dinamicamente o `currentFileId`.
3. **Tratamento de Torrents Inativos e Timeout**:
   - Se o torrent ficar inativo ou sem seeds na nuvem Torbox por mais de 24 segundos (6 verificações consecutivas), o Nexus detecta a estagnação e avisa: `"Torrent inativo ou sem seeds na nuvem Torbox"`.
   - Se a espera ultrapassar 15 minutos (180 tentativas), o Nexus encerra a espera de forma segura com aviso de Timeout, liberando a fila para os próximos downloads.
4. **Obtenção do Link CDN e Download sem Travar**:
   - Assim que o arquivo atinge 100% no Torbox, o resolver obtém o link de alta velocidade do CDN (`nexus-082.latm.tb-cdn.cx`), passa pelo pré-flight e inicia a transferência local de 4 conexões paralelas a partir do 0%, salvando o arquivo completamente no disco.

---

## Bug 08: Quebra de Linha e Deformação da Tag "Ready (100%)" em Nomes Extensos de Torrents

### Causa Raiz Identificada e Corrigida
- **Falta de Redimensionamento Flexível e Elipse de Texto no Título (`style.css` & `app.js`)**:
  - Quando um torrent no Torbox Cloud possuía um nome muito longo (ex: `[ToonsHub] Demon Slayer Kimetsu no Yaiba Infinity Castle...`), o elemento `.folder-group-name` expandia indefinidamente na horizontal sem truncar o texto.
  - Isso empurrava o container de metadados `.folder-group-meta`, fazendo com que a tag de status `Ready (100%)` ficasse espremida e sofresse quebra de linha interna (separando `Ready` na primeira linha e `(100%)` na segunda).

### Solução Aplicada
1. **Quebra de Linha Controlada do Nome Completo Original (`renderer/css/style.css`)**:
   - Removido o truncamento com reticências (`...`) e aplicadas as propriedades `white-space: normal; word-break: break-word; overflow-wrap: anywhere; line-height: 1.35; flex: 1 1 auto; min-width: 0;` à classe `.folder-group-name` e `.queue-folder-name`.
   - O nome completo e original da mídia/torrent é exibido em 100% da sua totalidade. Se for muito longo, a quebra de linha ocorre naturalmente no lado esquerdo **antes** de alcançar os metadados e badges da direita.
2. **Impedimento de Encolhimento e Deformação da Tag (`renderer/css/style.css` & `renderer/js/app.js`)**:
   - Aplicados `flex-shrink: 0; white-space: nowrap !important; display: inline-block !important;` nas tags de status e no container `.folder-group-meta`.
   - As badges `Ready (100%)`, `☁️ Baixando` e `Inativo` permanecem totalmente imunes a encolhimentos, mantendo-se perfeitamente alinhadas à direita na mesma linha.

---

## Bug 09: Cartões Recolhidos por Padrão e Falta de Fallback no Scanner de Links

### Causa Raiz Identificada e Corrigida
1. **Cartões de Resultado Renderizados Recolhidos (`app.js`)**:
   - Ao escanear qualquer link (Bunkr, Google Drive, TeraBox, etc.) na aba **Scanner de Links**, a função `renderResults()` atribuía a classe `folder-group-card collapsed` por padrão aos cartões de resultados.
   - Isso fazia o resultado do escaneamento aparecer recolhido (fechado) na tela, dando a falsa impressão ao usuário de que "nada havia acontecido".

2. **Bloqueio de Fallbacks no Escaneamento (`main.js`)**:
   - Quando um link do Bunkr falhava na leitura dos detalhes nativos ou dependia de domínio alternativo, o bloco de código capturava a exceção silenciosamente e executava `continue`.
   - Isso impedia o Nexus de tentar o desprotetor do Torbox Hoster ou o Motor Genérico Universal de 4 etapas como fallback para o link.

### Solução Aplicada
1. **Exibição Expandida por Padrão no Scanner (`renderer/js/app.js`)**:
   - Alterada a classe inicial dos cartões escaneados para `folder-group-card` (sem `collapsed`). Os arquivos encontrados são imediatamente exibidos na tabela assim que o escaneamento é concluído.
2. **Fallback Automático para Torbox Hoster e Motor Genérico (`main.js` & `bunkr-scanner.js`)**:
   - Atualizados os padrões Regex do Bunkr (`/f/`, `/v/`, `/i/`, `/d/`) e a lógica do scanner principal em `main.js`.
   - Caso o extrator nativo do Bunkr não retorne arquivos, o Nexus repassa o link automaticamente para o Torbox Hoster ou para o Motor Genérico Universal, garantindo que o link seja desprotezido e os arquivos sejam exibidos.

---

## Bug 10: Bloqueio de Clique nos Botões do Menu Lateral (Fila, Torbox, Ajustes)

### Causa Raiz Identificada e Corrigida
- **Erro de Sintaxe Residual em `app.js` (`SyntaxError: Unexpected token ')'`)**:
  - Durante a implementação da refatoração de segmentação da fila, um trecho duplicado de código não fechado permaneceu no final da função `renderQueue()` no arquivo `renderer/js/app.js`.
  - Isso gerava um erro de sintaxe ao carregar a interface, impedindo que o script executasse os ouvintes de evento `navItems.forEach(item => item.addEventListener('click', ...))` do menu lateral.
## Bug 01: Ocultamento do Conteúdo da Página de Ajustes e Quebra da Interface por Desalinhamento HTML

### Causa Raiz Identificada e Corrigida
Através de uma varredura diagnóstica profunda com execução remota de testes internos no Electron e inspeção visual da renderização do app, identificamos a causa exata do problema:

1. **Tag de Fechamento Faltante no HTML ([`renderer/index.html`](file:///c:/Users/alazt/Documents/GitHub/Projetos/Google%20driver%20downloader/renderer/index.html#L334))**:
   - A tag `</section>` que encerrava a seção da Fila de Downloads (`#queue-tab`) estava ausente no HTML.
   - Isso fazia com que o navegador interpretasse as abas do Torbox (`#torbox-tab`) e dos Ajustes (`#settings-tab`) como elementos filhos aninhados dentro da Fila de Downloads.
   - Consequentemente, ao sair da Fila de Downloads, a Fila recebia `display: none`, o que ocultava automaticamente todo o conteúdo de Ajustes e Torbox que estavam presos dentro dela.

2. **Fechamento e Isolamento das Abas ([`renderer/index.html`](file:///c:/Users/alazt/Documents/GitHub/Projetos/Google%20driver%20downloader/renderer/index.html#L334))**:
   - Adicionada a tag `</section>` para fechar a Fila de Downloads e isolar `#torbox-tab` e `#settings-tab` como seções independentes.
   - Corrigido o topo do Torbox adicionando `style="display: none;"` no `#torbox-top-content` para que não sobreponha a tela principal do Scanner.

3. **Reunificação e Estilização dos Ajustes ([`renderer/css/style.css`](file:///c:/Users/alazt/Documents/GitHub/Projetos/Google%20driver%20downloader/renderer/css/style.css#L542))**:
   - Organizados os 4 cartões de configuração (*Destino do Download*, *Preferências de Desempenho*, *Conexão Torbox API* e *Conexão Google Drive OAuth*) com a seção *Destino do Download* posicionada na área superior (`#settings-top-content`) logo abaixo do subtítulo.
   - Adicionada a regra `opacity: 1 !important;` e transição suave na classe `.tab-content.active` no CSS.

---

### Instruções de Restauração em Caso de Reincidência
Caso a interface volte a ocultar o conteúdo da página de Ajustes ou Torbox no futuro:
1. Verifique se todas as seções `<section class="tab-content" id="...">` no arquivo `renderer/index.html` estão devidamente fechadas com `</section>` antes da abertura da aba seguinte.
2. Certifique-se de que `#torbox-top-content` e `#settings-top-content` possuem `style="display: none;"` por padrão no HTML.
3. Garanta que a classe `.tab-content.active` no arquivo `renderer/css/style.css` possua `display: flex;` e `opacity: 1 !important;`.

---

## Bug 02: Sobreposição e Transparência do Menu de Filtros do Torbox

### Causa Raiz Identificada e Corrigida
- **Hierarquia de Camadas (`z-index`)**: O contêiner superior `.app-top-section` não possuía um contexto de empilhamento superior a `.app-bottom-content`. Como a lista de arquivos da nuvem ficava após a seção superior no código HTML, o menu suspenso `#torbox-filter-dropdown` acabava sendo renderizado **por trás** dos cartões de arquivo da lista.
- **Transparência do Fundo**: O menu usava `background: rgba(15, 23, 42, 0.95)` com `backdrop-filter`, fazendo com que os textos dos cartões abaixo ficassem visíveis através do menu.

### Solução Aplicada
1. Ajustado o CSS em [`renderer/css/style.css`](file:///c:/Users/alazt/Documents/GitHub/Projetos/Google%20driver%20downloader/renderer/css/style.css#L81):
   - `.app-top-section { position: relative; z-index: 20; }`
   - `.top-main-area { position: relative; z-index: 25; }`
   - `.app-bottom-content { position: relative; z-index: 1; }`
   - `.torbox-filter-dropdown { z-index: 9999 !important; background: #0f172a !important; }`
2. O fundo do dropdown agora é **100% opaco escuro** (`#0f172a`), eliminando o sangramento do texto abaixo e garantindo contraste nítido.

---

## Bug 03: Erro HTTP 416 e Interrupção no Download de Arquivos Torbox WebDL/Hoster (ex: Gofile)

### Causa Raiz Identificada e Corrigida
1. **Divergência entre Tamanho Declarado e Tamanho Real do CDN**:
   - Links de WebDL (como Gofile, 1fichier, etc.) adicionados ao Torbox reportavam tamanhos estimados em `/webdl/mylist` que diferiam do tamanho real entregue pelo servidor CDN.
   - Ao calcular os 4 segmentos de multiconexão baseados no tamanho estimado (ex: 18.7 GB em vez dos reais 10.2 GB do arquivo do Gofile), o 4º segmento enviava uma requisição `Range` além do fim real do arquivo. O servidor CDN do Torbox rejeitava o segmento com **HTTP 416 Range Not Satisfiable**.
2. **Avaliação Falsa de Download Truncado**:
   - Quando o download migrava para o modo de conexão única, o aplicativo mantinha o tamanho estimado incorreto. Ao concluir os 10.2 GB reais, o aplicativo achava que o arquivo estava incompleto e abortava a gravação.

### Solução Aplicada
1. **Pré-Flight Header Probe em `main.js`**:
   - Antes de iniciar qualquer download do Torbox, o motor realiza uma rápida sondagem prévia (`HEAD`/`GET` `Range: bytes=0-0`) na URL final do CDN para ler os cabeçalhos autoritativos `Content-Range` e `Content-Length`.
2. **Ajuste Dinâmico do Tamanho Real**:
   - O aplicativo atualiza instantaneamente `queueItem.size` para o tamanho real exato retornado pelo servidor CDN antes de dividir os segmentos ou pré-alocar os arquivos.
3. **Divisão de Segmentos Perfeita**:
   - Com o tamanho real ajustado pelo pré-flight, os 4 segmentos paralelos são divididos com precisão cirúrgica sem gerar requisições fora dos limites e sem disparar erros HTTP 416.

### Instruções de Restauração em Caso de Reincidência
Caso algum download do Torbox volte a apresentar erro 416 ou interrompa no início:
1. Certifique-se de que a função de pre-flight HTTP (`preflightCheck`) em `main.js` está sendo invocada antes do bloco `isMultiMode`.
2. Verifique se `queueItem.size` é atualizado a partir do cabeçalho `content-range` (`bytes 0-0/TAMANHO_REAL`) retornado pelo servidor CDN.

---

## Bug 04: Magnet Link Não Iniciava no Nexus (Caracteres de Controle `\n` no Parâmetro `dn=`)

### Causa Raiz Identificada e Corrigida
1. **Quebra de Linha Embutida na URL (`dn=Torrentio%0A1080p`)**:
   - O parâmetro `dn` (display name) do Magnet Link enviado continha a sequência codificada `%0A` (quebra de linha `\n`).
   - Ao executar `decodeURIComponent("Torrentio%0A1080p")`, o nome da pasta do torrent foi extraído como `"Torrentio\n1080p"`.
   - Ao montar o caminho no disco rígido (`C:\Users\...\Downloads\Torrentio\n1080p`), o sistema operacional Windows rejeitou o caminho devido a caracteres de controle ilícitos em diretórios do SO, falhando o `fs.mkdirSync` e cancelando o download antes da criação do arquivo local.

2. **Identificador de Arquivo Genérico (`file_id: 0`) no Início da Adição**:
   - Quando um magnet recém-adicionado ainda estava inicializando seus metadados no Torbox Cloud, o escaneamento inicial criava um item genérico com `torboxFileId: 0`. Ao solicitar a URL no CDN, a API apontava para um arquivo de texto secundário ou retornava URL genérica sem selecionar o vídeo principal (`.mkv`).

### Solução Aplicada
1. **Função de Sanitização de Caminhos `sanitizePathSegment` (`torbox-scanner.js` e `main.js`)**:
   - Adicionada a substituição automática de quebras de linha (`\n`, `\r`, `\t`) e caracteres inválidos (`\`, `/`, `:`, `*`, `?`, `"`, `<`, `>`, `|`) por espaços ou caracteres seguros antes de criar caminhos de arquivos e pastas no Windows.
   - O nome `"Torrentio\n1080p"` passou a ser limpo para `"Torrentio 1080p"`, criando o diretório local no Windows com 100% de sucesso.
2. **Sondagem de Inicialização de Arquivos no Torrent (`torbox-scanner.js`)**:
   - O scanner aguarda brevemente a lista de arquivos (`t.files`) ser populada pelo Torbox Cloud ao adicionar um novo torrent, obtendo diretamente o arquivo principal de vídeo (`Virgin.Island.S01E01.1080p.AV1.10bit-MeGusta.mkv`, 441.82 MB) e atribuindo seu `torboxFileId` exato.
3. **Resolução Automática do Vídeo Principal no Resolver (`torbox-scanner.js`)**:
   - Caso `torboxFileId` chegue indefinido, o resolver consulta a lista do torrent no Torbox e seleciona automaticamente o arquivo de maior tamanho (o vídeo principal).

---

## Bug 05: Interrupção nos Downloads do Torbox por Redirecionamento HTTP 307 Não Tratado e Mapeamento de `numericId`

### Causa Raiz Identificada e Corrigida
1. **Redirecionamento HTTP 307 Não Tratado no Pré-Flight (`main.js`)**:
   - Os links de download direto gerados pela API do Torbox (`https://api.torbox.app/v1/api/torrents/requestdl?...&redirect=true`) retornam uma resposta HTTP `307 Temporary Redirect` apontando para o servidor CDN de alta velocidade (`nexus-082.latm.tb-cdn.cx`).
   - O pré-flight anterior realizava uma única sondagem. Como a resposta HTTP `307` não trazia o cabeçalho `Content-Range`, o pré-flight marcava o suporte a `Range` como falso (`supportsRangeHeader = false`).
   - Ao migrar para a conexão simples, o cliente HTTP nativo do Node.js recebia o status `307` e tentava iniciar o download diretamente no código de redirecionamento. O motor verificava `if (res.statusCode !== 200)` e lançava um erro fatal ("Servidor retornou HTTP 307"), interrompendo **todos os downloads da nuvem Torbox**.

2. **Divergência de Parâmetro `numericId` na Chamada do Resolver (`main.js`)**:
   - Para os itens listados na aba do Torbox (`torbox_cloud_...`), o campo `queueItem.numericId` permanecia `undefined`. Ao invocar `resolveTorboxDirectUrl(queueItem.numericId, ...)`, o primeiro parâmetro `fileId` recebia `undefined`, fazendo a API consultar `torrent_id=0` e falhar com HTTP 404.

### Solução Aplicada
1. **Pré-Flight Recursivo de Redirecionamentos HTTP 3xx (`main.js`)**:
   - O pré-flight agora segue em loop até 5 redirecionamentos (`301`, `302`, `303`, `307`, `308`) até atingir o servidor CDN final.
   - Ao atingir o nó CDN (`nexus-082.latm.tb-cdn.cx`), o pré-flight recebe HTTP `206 Partial Content`, obtém o tamanho real autoritativo (ex: 4.77 GB) e habilita a multiconexão paralela de 4 segmentos em velocidade máxima.
2. **Uso de Permalinks e IDs Corretos (`main.js`)**:
   - Se o item da fila já possuir o permalink direto (`requestdl?token=...`), o aplicativo reutiliza o permalink direto sem fazer chamadas redundantes com IDs ausentes.
   - Caso precise resolver, passa `queueItem.fileId || queueItem.id` de forma segura.

---

## Bug 06: Arquivos de Magnet Links Caheados Não Baixavam após Escanear no Scanner

### Causa Raiz Identificada e Corrigida
- **Permalinks Ausentes nos Resultados do Scanner (`torbox-scanner.js`)**:
  - Quando o usuário colava um Magnet Link no **Scanner de Links**, a função `scanTorboxLink` adicionava o torrent na nuvem e retornava os arquivos encontrados na tabela de resultados.
  - No entanto, o campo `torboxDownloadUrl` retornava como uma string vazia (`''`), e os campos `directUrl` e `downloadUrl` não eram gerados na lista de resultados.
  - Ao enviar esses arquivos para a Fila de Downloads, os itens entravam na fila com `directUrl: null`. Ao tentar iniciar o download local no PC, o motor precisava resolver a URL e falhava caso houvesse desencontro nos IDs dos arquivos caheados.

### Solução Aplicada
1. **Injeção de Permalinks de Download no Scanner (`torbox-scanner.js`)**:
   - A função `scanTorboxLink` agora pré-constrói os permalinks diretos (`https://api.torbox.app/v1/api/torrents/requestdl?token=...&torrent_id=...&file_id=...&redirect=true`) para **todos os arquivos do torrent** imediatamente ao escanear.
2. **Transferência Instantânea para a Fila (`main.js`)**:
   - Ao adicionar os arquivos escaneados à Fila de Downloads, o Nexus recebe o `directUrl` pronto de cada arquivo.
   - O download inicia de forma instantânea, realizando a resolução do redirecionamento no CDN e salvando os arquivos no computador na velocidade máxima.

---

## Bug 07: Trava em 0% e Timeout ao Aguardar Conclusão de Download na Nuvem do Torbox

### Causa Raiz Identificada e Corrigida
1. **Ignoração do Loop de Monitoramento de Nuvem em `main.js`**:
   - Para arquivos ainda em progresso de download/cache na nuvem Torbox, a fila continha permalinks diretos temporários. Ao tentar iniciar o download local antes do Torbox concluir na nuvem, o CDN do Torbox rejeitava a conexão com HTTP 400 Bad Request, fazendo o download travar em 0% ou migrar para fallbacks inválidos.

2. **Perda do ID do Arquivo Principal (`torboxFileId`) ao Concluir o Torrent**:
   - Quando um torrent recém-adicionado ainda estava baixando na nuvem Torbox, a lista de arquivos internos do torrent ainda não possuía IDs atribuídos (retornando `file_id: 0`).
   - Quando a nuvem Torbox finalmente concluía o torrent (100%), a chamada `requestdl` com `file_id: 0` falhava ou retornava `null` porque o ID real do arquivo de vídeo no torrent final era diferente de zero (ex: `file_id: 2`).

### Solução Aplicada
1. **Monitoramento Ativo de Progresso da Nuvem em Tempo Real (`torbox-scanner.js` e `main.js`)**:
   - `resolveTorboxDirectUrl` foi reformulado para monitorar ativamente o status em tempo real a cada 4 segundos, reportando os avisos `☁️ Torbox baixando na nuvem (X%)...` na fila.
2. **Identificação Dinâmica do Arquivo Principal Concluído (`torbox-scanner.js`)**:
   - No milissegundo em que a nuvem Torbox atinge 100% / `download_finished`, o resolver varre a lista atualizada de arquivos do torrent (`item.files`), localiza o arquivo de mídia principal (maior tamanho) e atualiza dinamicamente o `currentFileId`.
3. **Tratamento de Torrents Inativos e Timeout**:
   - Se o torrent ficar inativo ou sem seeds na nuvem Torbox por mais de 24 segundos (6 verificações consecutivas), o Nexus detecta a estagnação e avisa: `"Torrent inativo ou sem seeds na nuvem Torbox"`.
   - Se a espera ultrapassar 15 minutos (180 tentativas), o Nexus encerra a espera de forma segura com aviso de Timeout, liberando a fila para os próximos downloads.
4. **Obtenção do Link CDN e Download sem Travar**:
   - Assim que o arquivo atinge 100% no Torbox, o resolver obtém o link de alta velocidade do CDN (`nexus-082.latm.tb-cdn.cx`), passa pelo pré-flight e inicia a transferência local de 4 conexões paralelas a partir do 0%, salvando o arquivo completamente no disco.

---

## Bug 08: Quebra de Linha e Deformação da Tag "Ready (100%)" em Nomes Extensos de Torrents

### Causa Raiz Identificada e Corrigida
- **Falta de Redimensionamento Flexível e Elipse de Texto no Título (`style.css` & `app.js`)**:
  - Quando um torrent no Torbox Cloud possuía um nome muito longo (ex: `[ToonsHub] Demon Slayer Kimetsu no Yaiba Infinity Castle...`), o elemento `.folder-group-name` expandia indefinidamente na horizontal sem truncar o texto.
  - Isso empurrava o container de metadados `.folder-group-meta`, fazendo com que a tag de status `Ready (100%)` ficasse espremida e sofresse quebra de linha interna (separando `Ready` na primeira linha e `(100%)` na segunda).

### Solução Aplicada
1. **Quebra de Linha Controlada do Nome Completo Original (`renderer/css/style.css`)**:
   - Removido o truncamento com reticências (`...`) e aplicadas as propriedades `white-space: normal; word-break: break-word; overflow-wrap: anywhere; line-height: 1.35; flex: 1 1 auto; min-width: 0;` à classe `.folder-group-name` e `.queue-folder-name`.
   - O nome completo e original da mídia/torrent é exibido em 100% da sua totalidade. Se for muito longo, a quebra de linha ocorre naturalmente no lado esquerdo **antes** de alcançar os metadados e badges da direita.
2. **Impedimento de Encolhimento e Deformação da Tag (`renderer/css/style.css` & `renderer/js/app.js`)**:
   - Aplicados `flex-shrink: 0; white-space: nowrap !important; display: inline-block !important;` nas tags de status e no container `.folder-group-meta`.
   - As badges `Ready (100%)`, `☁️ Baixando` e `Inativo` permanecem totalmente imunes a encolhimentos, mantendo-se perfeitamente alinhadas à direita na mesma linha.

---

## Bug 09: Cartões Recolhidos por Padrão e Falta de Fallback no Scanner de Links

### Causa Raiz Identificada e Corrigida
1. **Cartões de Resultado Renderizados Recolhidos (`app.js`)**:
   - Ao escanear qualquer link (Bunkr, Google Drive, TeraBox, etc.) na aba **Scanner de Links**, a função `renderResults()` atribuía a classe `folder-group-card collapsed` por padrão aos cartões de resultados.
   - Isso fazia o resultado do escaneamento aparecer recolhido (fechado) na tela, dando a falsa impressão ao usuário de que "nada havia acontecido".

2. **Bloqueio de Fallbacks no Escaneamento (`main.js`)**:
   - Quando um link do Bunkr falhava na leitura dos detalhes nativos ou dependia de domínio alternativo, o bloco de código capturava a exceção silenciosamente e executava `continue`.
   - Isso impedia o Nexus de tentar o desprotetor do Torbox Hoster ou o Motor Genérico Universal de 4 etapas como fallback para o link.

### Solução Aplicada
1. **Exibição Expandida por Padrão no Scanner (`renderer/js/app.js`)**:
   - Alterada a classe inicial dos cartões escaneados para `folder-group-card` (sem `collapsed`). Os arquivos encontrados são imediatamente exibidos na tabela assim que o escaneamento é concluído.
2. **Fallback Automático para Torbox Hoster e Motor Genérico (`main.js` & `bunkr-scanner.js`)**:
   - Atualizados os padrões Regex do Bunkr (`/f/`, `/v/`, `/i/`, `/d/`) e a lógica do scanner principal em `main.js`.
   - Caso o extrator nativo do Bunkr não retorne arquivos, o Nexus repassa o link automaticamente para o Torbox Hoster ou para o Motor Genérico Universal, garantindo que o link seja desprotezido e os arquivos sejam exibidos.

---

## Bug 10: Bloqueio de Clique nos Botões do Menu Lateral (Fila, Torbox, Ajustes)

### Causa Raiz Identificada e Corrigida
- **Erro de Sintaxe Residual em `app.js` (`SyntaxError: Unexpected token ')'`)**:
  - Durante a implementação da refatoração de segmentação da fila, um trecho duplicado de código não fechado permaneceu no final da função `renderQueue()` no arquivo `renderer/js/app.js`.
  - Isso gerava um erro de sintaxe ao carregar a interface, impedindo que o script executasse os ouvintes de evento `navItems.forEach(item => item.addEventListener('click', ...))` do menu lateral.
  - Como consequência, clicar nas abas "Fila de Downloads", "Torbox" ou "Ajustes" não trocava a página ativa.

### Solução Aplicada
1. **Limpeza do Bloco Residual e Correção da Sintaxe (`renderer/js/app.js`)**:
   - Removido o trecho de código órfão em `app.js`, restabelecendo a compilação perfeita do arquivo (`node -c`).
2. **Restabelecimento Completo da Navegação**:
   - Todos os ouvintes de clique dos botões da barra lateral tornam a funcionar perfeitamente, permitindo alternar instantaneamente entre **Scanner de Links**, **Fila de Downloads**, **Torbox Cloud** e **Ajustes**.

---

## Bug 12: Conclusão Falsa Instantânea de Downloads Não Concluídos na Nuvem Torbox (WebDL/Hosters ex: Pixeldrain)

### Causa Raiz Identificada e Corrigida
1. **Bypass Prematuro de Resolução em `main.js`**:
   - Quando um link de hoster (como `https://pixeldrain.com/l/DKAuLrdU`) era escaneado e adicionado à fila, seu `directUrl` já vinha preenchido com o permalink da API do Torbox (`https://api.torbox.app/v1/api/webdl/requestdl?...&redirect=true`).
   - No worker de downloads de `main.js`, existia a verificação `if (queueItem.directUrl && queueItem.directUrl.includes('requestdl'))`, que fazia o Nexus ignorar a chamada para a função `resolveTorboxDirectUrl()`.
   - Ao pular `resolveTorboxDirectUrl()`, o Nexus não verificava se o arquivo já havia terminado de baixar nos servidores da nuvem do Torbox.

2. **Download Falso do Erro JSON**:
   - Ao tentar baixar diretamente o permalink enquanto o Torbox ainda estava baixando o arquivo na nuvem, a API do Torbox respondia com uma mensagem JSON (`{"success": false, "detail": "Web download is not finished yet"}`).
   - O motor HTTP recebia esses 40 bytes da mensagem JSON, gravava os 40 bytes no arquivo de vídeo local e marcava o download como "Concluído (100%)" instantaneamente.

### Solução Aplicada
1. **Obrigatoriedade de Resolução para Todos os Itens Torbox (`main.js`)**:
   - Removido o bypass de `requestdl`. Todos os itens do Torbox (`torrent` e `webdl`) agora passam obrigatoriamente por `resolveTorboxDirectUrl()`.

2. **Verificação Rigorosa de Conclusão na Nuvem (`torbox-scanner.js`)**:
   - `resolveTorboxDirectUrl()` consulta `/webdl/mylist?bypass_cache=true` (ou `/torrents/mylist?bypass_cache=true`) e verifica se `download_finished === true` / `100%`.
   - Se o arquivo ainda estiver baixando nos servidores do Torbox, o Nexus atualiza o status em tempo real na fila (`☁️ Torbox baixando na nuvem (X%)...`) e aguarda a conclusão na nuvem.
   - Somente após o arquivo atingir 100% no Torbox, a URL de CDN de alta velocidade é obtida e o download local de 4 conexões é iniciado, salvando o arquivo real no disco rígido.

---

## Bug 13: Reconhecimento Incorreto de Links de Múltiplos Arquivos (WebDL/Hosters ex: Álbuns Pixeldrain)

### Causa Raiz Identificada e Corrigida
1. **Omissão da Matriz `files` em WebDLs (`torbox-scanner.js`)**:
   - Ao desproteger links de hosters contendo múltiplos arquivos (como álbuns do Pixeldrain com 6 vídeos ou diretórios de download), o Torbox Cloud descompacta os itens e disponibiliza a matriz `w.files` contendo cada arquivo individual.
   - No entanto, a lógica anterior de `scanTorboxLink` tratava downloads WebDL como se fossem sempre um único item genérico (`resultList = [{ ... }]`), ignorando o array `files`.

2. **Forçamento Incorreto de Extensão `.mp4`**:
   - Se o Torbox empacotasse múltiplos arquivos em um arquivo compactado (ou se o nome retornado não contivesse extensão), a lógica anterior forçava a extensão `.mp4`, fazendo arquivos `.zip` ou `.rar` serem salvos com nome e extensão errados.

### Solução Aplicada
1. **Expansão de Arquivos Individuais para WebDL (`torbox-scanner.js`)**:
   - Atualizados `scanTorboxLink` e `fetchTorboxUserDownloads` para verificar a presença de `currentWebdl.files`.
   - Se a WebDL contiver múltiplos arquivos (ex: álbum com 6 vídeos), o Nexus varre a matriz `files` e cria um cartão de pasta contendo todos os 6 arquivos de vídeo individuais, com seus nomes originais (`AQOqLUro...mp4`), extensões reais, tamanhos exatos e permalinks diretos (`file_id=7`).

2. **Tratamento Correto de Arquivos Únicos e Compactados (`torbox-scanner.js`)**:
   - Caso a WebDL não possua a matriz descompactada de arquivos, a extensão original é preservada. Se o nome não contiver extensão, o Nexus atribui `.zip` (padrão de empacotamento do Torbox), garantindo que arquivos compactados nunca sejam salvos com a extensão `.mp4`.

---

## Bug 14: Omissão de Arquivos Individuais e Falta de Separação em Links de Pastas TeraBox

### Causa Raiz Identificada e Corrigida
- **Falta do Loop `else` para Mídias Individuais (`terabox-scanner.js`)**:
  - No escaneamento de diretórios do TeraBox (`scanTeraBoxLink`), ao percorrer a lista de itens da pasta (`data.list`), o código tratava apenas a condição `if (isDir)` para adicionar subdiretórios à fila BFS.
  - Isso fazia o Nexus adicionar apenas o item `(Download All - Pacote Completo).zip`, omitindo todos os arquivos de mídia individuais contidos dentro da pasta do TeraBox (ex: as partes `part1.rar`, `part2.rar`, `part3.rar`, `Medio.rar`, `Menor.rar`).

### Solução Aplicada
1. **Identificação e Lista de Todos os Arquivos Individuais (`terabox-scanner.js`)**:
   - Adicionada a instrução `else` no loop de itens do TeraBox. Todos os arquivos individuais são varridos, extraídos com seus nomes originais (`Midori.92.Ups1080p.MemoriadaTV.Maior.part1.rar`, etc.), extensões reais e tamanhos exatos.
2. **Manutenção do Pacote Completo Separado**:
   - O item `(Download All - Pacote Completo).zip` permanece posicionado no topo da lista.
   - O usuário visualiza no **Scanner de Links** todas as 6 opções e pode escolher exatamente se prefere baixar partes individuais ou o arquivo completo.

---

## Bug 15: Download Direto Indevido e Reconhecimento Parcial de Links de Álbuns com Fragmentos Hash (ex: `#item=5` no Pixeldrain)

### Causa Raiz Identificada e Corrigida
1. **Presença de Fragmentos Hash na URL (`#item=5`)**:
   - Ao colar um link como `https://pixeldrain.com/l/DKAuLrdU#item=5`, a presença da âncora `#item=5` fazia a API do Torbox interpretar que apenas a mídia número 5 devia ser baixada ou falhar na consulta.
   - Isso fazia o Torbox retornar apenas 1 único arquivo em vez do álbum completo com os 6 vídeos.

2. **Migração Involuntária para o Motor Genérico (Download Direto)**:
   - Como a chamada do Torbox falhava para a URL com `#item=5`, o Nexus acionava o fallback do motor genérico.
   - O motor genérico raspava o link do Pixeldrain e fornecia o link direto do servidor do Pixeldrain (`https://pixeldrain.com/api/file/...`).
   - Consequentemente, o Nexus iniciava o download diretamente do site do Pixeldrain sem passar pelo Torbox.

3. **Falta de Consulta Prioritária de Álbuns na Nuvem Torbox**:
   - Antes de enviar uma nova requisição de download para o Torbox, o sistema não verificava se o álbum completo já havia sido desprotegido e baixado na conta do Torbox do usuário.

### Solução Aplicada
1. **Sanitização de URLs Canônicas (Remoção de Âncoras `#item=...`) (`torbox-scanner.js`)**:
   - Ao receber qualquer link com fragmento hash (`#item=5`), o Nexus limpa a URL para seu formato canônico original (`https://pixeldrain.com/l/DKAuLrdU`).
2. **Consulta Prioritária a Álbuns com Múltiplos Arquivos (`torbox-scanner.js`)**:
   - Antes de criar um novo download, o Nexus varre a lista `/webdl/mylist` da conta do Torbox procurando primeiramente se o álbum completo (com a matriz de 6 arquivos) já existe na nuvem do usuário.
   - Se encontrado (ex: o álbum com os 6 vídeos), o Nexus retorna **todos os 6 arquivos de vídeo da nuvem Torbox** com seus permalinks de CDN (`requestdl`).
3. **Downloads 100% Roteados via Torbox**:
   - Todos os 6 vídeos recebem links do Torbox CDN, garantindo que o download seja realizado através da nuvem do Torbox sem baixar diretamente do site do Pixeldrain.

---

## Bug 16: Falta de Sinalização Clara de "Aguardando Torbox" no Painel de Download Ativo e nos Cartões

### Causa Raiz Identificada e Corrigida
- **Badge Genérica "BAIXANDO AGORA" e Falta de Aviso Contextual**:
  - Quando um arquivo dependia da conclusão prévia do download na nuvem do Torbox, o painel do topo continuava exibindo a badge padrão `BAIXANDO AGORA`, indicando `0%` e `0 Bytes/s`, sem explicar ao usuário o motivo do download local ainda não ter iniciado.
  - A região do painel ativo à direita não exibia um banner explicativo contextual.

### Solução Aplicada
1. **Alteração Dinâmica da Badge no Painel Ativo (`renderer/index.html` & `renderer/js/app.js`)**:
   - Quando um arquivo está aguardando a nuvem do Torbox terminar, a badge altera de `BAIXANDO AGORA` para `☁️ AGUARDANDO TORBOX` com estilo destacado e brilhante (gradiente dourado/ciano).
2. **Painel de Aviso no Local Destacado da Imagem 2 (`renderer/index.html` & `renderer/css/style.css`)**:
   - Adicionado o container `#active-cloud-notice-container` posicionado na área superior direita do painel ativo.
   - Exibe a frase explicativa: *"☁️ Aguardando download na nuvem do Torbox (X%). O arquivo está sendo baixado no servidor Torbox. O download no Nexus iniciará automaticamente assim que o Torbox finalizar."*
3. **Atualização nos Cartões de Pasta e Linhas de Arquivo (`renderer/js/app.js`)**:
   - O cartão da pasta exibe a badge: `☁️ Nuvem Torbox (X%) • Aguardando término no servidor`.
   - A linha individual do arquivo na fila especifica: `☁️ Torbox baixando na nuvem (X%)... Aguardando término no servidor para iniciar local`.

---

## Bug 17: Omissão de `cloudMessage` e `cloudProgress` na Serialização IPC (`main.js`)

### Causa Raiz Identificada e Corrigida
- **Remoção Involuntária das Propriedades de Nuvem na Serialização da Fila (`main.js`)**:
  - No processo principal do Electron (`main.js`), a função `updateQueueUI()` serializava a fila em `serializedQueue` mapeando apenas 11 propriedades básicas (`id`, `name`, `size`, `status`, `progress`, etc.).
  - As propriedades `cloudMessage`, `cloudProgress`, `torboxType`, `torboxId` e `torboxFileId` **não estavam incluídas no mapeamento da `serializedQueue`**.
  - Consequentemente, mesmo que o backend do Torbox identificasse que o arquivo estava baixando na nuvem (`0.04%`) e atualizasse o progresso, as variáveis de aviso de nuvem eram removidas antes do envio para o frontend (`app.js`). O renderer recebia `cloudMessage: undefined` e renderizava a interface como um download comum (`BAIXANDO AGORA`, `0%`).

### Solução Aplicada
1. **Inclusão de Propriedades na Serialização IPC (`main.js`)**:
   - Adicionadas as chaves `cloudMessage`, `cloudProgress`, `torboxType`, `torboxId` e `torboxFileId` ao mapa de `serializedQueue` enviado via IPC (`mainWindow.webContents.send('queue-updated')`).
2. **Atualização Imediata no Frontend**:
   - Agora, ao iniciar o salvamento/aguardo de qualquer item do Torbox na nuvem, o frontend recebe imediatamente `cloudMessage` e `cloudProgress`, exibindo instantaneamente a badge **`☁️ AGUARDANDO TORBOX`**, o painel de aviso no canto superior direito e as sinalizações nos cartões de pasta.

---

## Bug 18: Poluição Visual, Redundância de Textos e Truncamento no Painel de Downloads Ativos

### Causa Raiz Identificada e Corrigida
1. **Espacamento Insuficiente e Truncamento de Nome**:
   - A caixa azul de aviso ficava espremida entre o nome do arquivo e a barra de progresso no mesmo eixo horizontal, fazendo o nome do arquivo ser cortado prematuramente com `...`.
2. **Redundância de Texto de Nuvem**:
   - A porcentagem e a mensagem da nuvem apareciam duas vezes simultaneamente no mesmo painel superior.
3. **Sublinha Extensa na Lista de Arquivos**:
   - A frase da sublinha no item da pasta ficava colada no tamanho em bytes (`0 Bytes / 15.68 GB`).

### Solução Aplicada
1. **Restauração do Layout Original Solicitado (`style.css` & `app.js`)**:
   - Revertida a tentativa de visual em camadas conforme solicitação expressa do usuário ("não gostei desfaça").
   - Mantida a estrutura visual aprovada anteriormente com o painel de aviso no lado direito do cabeçalho ativo e a badge **`☁️ AGUARDANDO TORBOX`**.
2. **Preservação da Correção Vital de Nuvem (`main.js`)**:
   - Mantidas intactas as chaves `cloudMessage` e `cloudProgress` na serialização da fila no IPC, garantindo que o status da nuvem continue funcionando 100% em tempo real na tela.

---

## Bug 19: Perda Precoce das Variáveis de Nuvem Fazendo o App Reverter para o Layout Padrão (Imagem 2)

### Causa Raiz Identificada e Corrigida
- **Remoção Prematura de `cloudMessage` e `cloudProgress` (`main.js`)**:
  - No `main.js`, assim que a função `resolveTorboxDirectUrl` retornava a URL do CDN, a instrução `delete queueItem.cloudMessage; delete queueItem.cloudProgress;` era executada imediatamente.
  - Isso apagava as variáveis de nuvem enquanto o worker HTTP local ainda estava conectando ou aguardando os primeiros bytes.
  - Quando a fila chamava `updateQueueUI()`, a interface recebia `cloudMessage: undefined` e revertia para a badge padrão `BAIXANDO AGORA` com `0%` e sem caixa de aviso (exatamente o visual da Imagem 2).

### Solução Aplicada
1. **Persistência das Variáveis de Nuvem (`main.js`)**:
   - As variáveis `cloudMessage` e `cloudProgress` são mantidas ativas no item da fila durante todo o período de aguardo/conexão com a nuvem do Torbox.
   - Chaves de nuvem só são removidas no segundo em que o download local no PC começa a receber bytes reais do arquivo (`queueItem.downloadedBytes > 0`).
2. **Garantia de Exibição Fiel ao Layout da Imagem 1 (`renderer/js/app.js`)**:
   - Se o arquivo for um item do Torbox e estiver em fase de aguardo/início (`downloadedBytes === 0`), a interface exibe **100% das vezes** o visual exato da Imagem 1:
     - Badge **`☁️ AGUARDANDO TORBOX`** com gradiente brilhante.
     - Caixa azul de aviso de nuvem posicionado no painel.
     - Progresso `☁️ Nuvem X%`, badge da pasta e sublinha detalhada.

---

## Bug 20: Falta da Badge de Nuvem no Cabeçalho do Cartão de Pasta e na Sublinha do Arquivo

### Causa Raiz Identificada e Corrigida
- **Condicional Restritiva de Nuvem para Itens da Pasta (`renderer/js/app.js`)**:
  - No `app.js`, os elementos do cartão da pasta (destacados no retângulo vermelho da imagem enviada pelo usuário) só ativavam a badge dourada `☁️ Nuvem Torbox (X%) • Aguardando término no servidor` se o item individual já possuísse explicitamente a propriedade `cloudMessage` preenchida.
  - Se o item ainda não tivesse recebido a mensagem, a pasta renderizava a contagem comum `0/1 concluídos (0 Bytes / 15.68 GB)`.

### Solução Aplicada
1. **Atribuição Automática do Estado de Nuvem nos Cartões (`renderer/js/app.js`)**:
   - Adicionada uma verificação no loop dos cartões de pasta: qualquer item originado do Torbox em estado de download com `downloadedBytes === 0` recebe automaticamente o estado de nuvem.
2. **Exibição Fiel dos Elementos Destacados**:
   - **Cabeçalho da Pasta**: Renderiza o botão pill dourado **`☁️ Nuvem Torbox (X%) • Aguardando término no servidor`**.
   - **Sublinha da Fila**: Exibe a frase completa **`☁️ Torbox baixando na nuvem (X%)... Aguardando término no servidor para iniciar local`**.

---

## Bug 21: Não Renderização dos Cartões da Pasta por Referência Incorreta ao Container de Seção (`app.js`)

### Causa Raiz Identificada e Corrigida
- **Referência a Contêiner Inexistente no `renderEntriesToContainer` (`app.js`)**:
  - Na chamada de renderização dos cartões em `renderEntriesToContainer()`, o código tentava anexar os cartões a `activeCardsContainer` e `completedCardsContainer` (variáveis antigas).
  - No entanto, os contêineres reais da nova estrutura do DOM eram `activeBody` (`#queue-active-body`) e `completedBody` (`#queue-completed-body`).
  - Como a variável antiga apontava para `null` ou um elemento obsoleto, a lista de downloads com os cartões e itens de pasta (destacados na caixa vermelha) simplesmente não era anexada à tela (resultando na tela sem cartões da Imagem 1 enviada pelo usuário).

### Solução Aplicada
1. **Mapeamento Correto dos Contêineres de Seção (`app.js`)**:
   - Atualizada a invocação para `renderEntriesToContainer(activeEntries, activeBody)` e `renderEntriesToContainer(completedEntries, completedBody)`.
2. **Resultado**:
   - O cartão da pasta e os arquivos internos destacados na caixa vermelha da Imagem 2 voltam a ser renderizados **instantaneamente**, exatamente iguais ao layout da Imagem 2 original.

---

## Bug 22: Quebra Visual do Texto de Status e Estouro de Layout no Painel Superior Ativo (Caixa Vermelha)

### Causa Raiz Identificada e Corrigida
1. **Estouro do Texto de Velocidade/Nuvem (`renderer/css/style.css`)**:
   - No CSS do painel ativo (`#active-download-panel`), o texto da velocidade/sublinha `Torbox baixando na nuvem (0%)... • Aguardando Torbox` não possuía a regra `white-space: nowrap`, fazendo com que frases mais longas sofressem quebra de linha indesejada e se empilhassem sobre o tamanho do arquivo (`0 Bytes / 15.68 GB`).
2. **Falta de Largura Mínima e Flexbox Indefinido no Painel Ativo**:
   - As colunas internas do painel não tinham controle estrito de largura (`flex: 0 0 340px`), o que fazia o bloco da barra de progresso empurrar os textos para baixo quando o nome do arquivo tentava expandir.

### Solução Aplicada
1. **Formatação Estrita do Bloco de Estatísticas (`style.css`)**:
   - Adicionada a classe `.stat-sub-group` com `display: flex`, `justify-content: flex-end`, `white-space: nowrap` e `gap: 6px`.
   - Isso garante que o status da nuvem, a velocidade e o ETA fiquem sempre perfeitamente alinhados na mesma linha sem quebrar ou encavalar.
2. **Fixação Flexbox do Painel Ativo (`style.css`)**:
   - Ajustadas as proporções: `.active-header` (`flex: 1 1 auto`), `.active-cloud-notice-box` (`flex: 0 0 320px`) e `.active-stats` (`flex: 0 0 340px`).
   - O nome do arquivo corta elegantemente em `240px` se o painel estiver cheio, mantendo o aviso azul e a barra de progresso intactos e alinhados horizontalmente sem quebras.

---

## Bug 23: Implementação Definitiva do Layout Organizado em 3 Camadas (`index.html`, `style.css` & `app.js`)

### Causa Raiz Identificada e Corrigida
- **Competição de Espaço na Mesma Linha Horizontal**:
  - A tentativa de colocar o nome do arquivo, a caixa de aviso e a barra de progresso em uma única linha fazia os 3 elementos colidirem e se sobreporem quando o nome do arquivo era longo ou a tela diminuía.

### Solução Aplicada (Conforme Wireframe Aprovado)
1. **Estruturação em 3 Camadas no DOM (`index.html`)**:
   - **Camada 1 (Topo)**: `.active-title-row` contendo as badges (`AGUARDANDO TORBOX` e `.ZIP`), o nome do arquivo com 100% de espaço horizontal e os botões de controle (`Pausar` e `Cancelar`).
   - **Camada 2 (Meio)**: `#active-cloud-notice-container` posicionado em uma linha isolada de ponta a ponta com gradiente translúcido ciano.
   - **Camada 3 (Base)**: `.active-stats` contendo a barra de progresso `☁️ Nuvem X%` e as estatísticas `0 B / X GB • Servidor Torbox Processando`.
2. **Estilização CSS Limpa (`style.css`)**:
   - `.active-download-panel` com `display: flex; flex-direction: column; gap: 14px;`.
   - Garantido **zero atropelamentos, zero truncamentos precoces e leitura 100% fluida e elegante**.

---

## Bug 24: Ajuste de Disposição e Alinhamento dos Elementos na Fila de Downloads (Conforme Imagem Enviada)

### Causa Raiz Identificada e Corrigida
- **Alinhamento do Bloco de Progresso na Base do Painel Ativo (`style.css`)**:
  - No CSS do painel de download ativo, as estatísticas da base (`.active-stats`) precisavam alinhar a barra de progresso (`☁️ Nuvem X%`) no lado esquerdo e as informações de status (`Servidor Torbox Processando • Aguardando Conclusão • 0 Bytes / X GB`) no lado direito em um único eixo horizontal fluido, exatamente como demonstrado na imagem enviada pelo usuário (`media_1787281634503.png`).

### Solução Aplicada
1. **Reordenamento e Preservação Estrita dos Elementos**:
   - Todos os elementos visuais (cabeçalho, 6 botões de ação em 2 linhas, card do painel ativo em 3 camadas e lista de downloads agrupada) foram preservados sem nenhuma remoção ou adição desnecessária.
2. **Alinhamento Horizontal na Base do Card (`style.css`)**:
   - Ajustado `.active-stats` para `display: flex; align-items: center; justify-content: space-between; gap: 20px;`.
   - A barra de progresso preenche o espaço à esquerda e os textos de velocidade/conclusão alinham-se à direita na mesma linha, atingindo **100% de fidelidade visual com a imagem do usuário**.

---

## Bug 25: Correção do Painel Ativo para Layout Compacto de 3 Colunas Horizontais (`style.css` & `index.html`)

### Causa Raiz Identificada e Corrigida
- **Desformatação em 3 Linhas Empilhadas Verticais**:
  - No passo anterior, o painel ativo havia sido estruturado em 3 linhas empilhadas verticalmente (topo, meio e base), o que deixou a barra de progresso espremida em 4% no canto inferior esquerdo e o texto da direita cortado com `...` (conforme reportado pelo usuário na imagem `media_1787282578597.png`).
  - Na imagem de referência desejada pelo usuário (`media_1787281634503.png`), o painel ativo é um **card horizontal único compacto com 3 colunas fluídas lado a lado**.

### Solução Aplicada
1. **Estrutura de 3 Colunas Lado a Lado (`index.html` & `style.css`)**:
   - **Coluna 1 (Esquerda - Título & Botões)**: `.active-title-group` contendo a badge (`AGUARDANDO TORBOX`), tag `.Zip`, nome do arquivo e botões de ação (`|| x`).
   - **Coluna 2 (Centro - Banner de Aviso)**: `#active-cloud-notice-container` posicionado no centro do card com texto explicativo translúcido.
   - **Coluna 3 (Direita - Progresso & Status)**: `.active-stats` alinhando a barra de progresso no topo e o status explicativo na base à direita.
2. **Resultado**:
   - Elimina o empilhamento vertical, descompressão da barra de progresso e restaura a **fidelidade visual exata de 100% com a imagem original enviada pelo usuário**.

---

## Bug 26: Exibição Condicional do Botão "Iniciar Download" Somente Após Escaneamento de Links (`app.js`)

### Causa Raiz Identificada e Corrigida
- **Referência Incorreta e Falta de Ocultação ao Iniciar/Limpar (`app.js`)**:
  - No handler de remoção/limpeza (`btnClearScanned`), a variável que ocultava o botão tentava acessar `btnStartDownloadMain`, que não estava declarada (`undefined`).
  - Além disso, no momento em que o usuário clicava em "Escanear Links", o botão "Iniciar Download" não garantia a ocultação preventiva durante o carregamento.

### Solução Aplicada
1. **Controle Estrito de Exibição (`renderer/js/app.js`)**:
   - Ajustadas todas as chamadas para `btnAddSelected.style.display = 'none'` ao iniciar a varredura, ao limpar os links ou quando a lista de escaneados estiver vazia (`scannedFiles.length === 0`).
2. **Garantia de Fluxo**:
   - O botão verde **`Iniciar Download`** permanece oculto e só aparece (`display: inline-flex`) **exclusivamente após a conclusão do escaneamento**, quando houver ao menos 1 arquivo escaneado e pronto na lista.

---

## Recursos / Feature 27: Implementação Completa da Arquitetura em 5 Camadas do Sistema de Atualização

### Estrutura Implementada (`main.js`, `index.html`, `style.css`, `app.js`)
1. **🔍 1. Detecção e Comparação Semântica (Version Checking & SemVer)**:
   - Consulta nativa via HTTP GET a `https://api.github.com/repos/alazter/nexus-downloader/releases`.
   - Comparação SemVer (`isNewerVersion`) comparando `app.getVersion()` com a release remota.
   - Emissão de notificação nativa do Windows (`Notification`) ao detectar nova versão.
2. **🎨 2. Interface, Badge e Modal com Changelog (`UpdatePopupModal`)**:
   - Exibição de contador/badge dinâmico no rodapé e sidebar (`update-notice`).
   - Modal com scroll das notas da versão (Release Notes / Changelog) extraídas de `release.body`.
   - Botões de ação clara: `"Atualizar Agora"` (`#btn-update-now`) e `"Ignorar por enquanto"` (`#btn-update-ignore`).
3. **📥 3. Download Resiliente com Progresso em Tempo Real (Asset Matcher & Stream)**:
   - Seleção inteligente entre instalador Setup (`Nexus-Downloader-Setup-*.exe`) e portátil (`Nexus-Downloader-Portable-*.exe`).
   - Download via Stream com feedback IPC em tempo real (`percent`, `transferred`, `total`, `mbps`).
4. **🔄 4. Instalação Transparente e Substituição de Processo (Hot Swap Handover)**:
   - Preservação do `AppUserModelId` e ícone permanente.
   - Liberação de trava de instância única (`app.releaseSingleInstanceLock()`).
   - Execução transparente da nova versão (`shell.openPath`) e encerramento limpo do processo antigo (`app.quit()`).
5. **🏷️ 5. Padronização de Publicação (Publishing Pattern)**:
   - Formatação padrão de versão `⚡ Nexus v[Versão]`.
   - Suporte completo a nota de versão e banners no GitHub.

---

## Bug 11: Desformatação e Empilhamento Vertical dos Arquivos Internos na Fila de Downloads

### Causa Raiz Identificada e Corrigida
- **Falta de Estilização CSS para `.queue-item-row` e `.queue-item-main` (`style.css`)**:
  - No arquivo de renderização da fila (`app.js`), cada linha de arquivo era criada com a estrutura `<div class="queue-item-row"><div class="queue-item-main">...</div></div>`.
  - No entanto, o arquivo de estilos `renderer/css/style.css` continha apenas regras para a antiga classe `.queue-item`. Sem o CSS flexbox atribuído à nova classe `.queue-item-row`, o navegador renderizava o checkbox, a badge `.video`, o nome do arquivo, a contagem de bytes e o botão de exclusão empilhados verticalmente um sobre o outro de forma desformatada.

### Solução Aplicada
1. **Adição das Regras Flexbox e Alinhamento Horizontal (`renderer/css/style.css`)**:
   - Criadas as regras CSS completas para `.queue-item-row`, `.queue-item-main`, `.queue-item-title-line`, `.queue-item-sub` e `.btn-icon`.
   - `.queue-item-main` recebeu `display: flex; align-items: center; justify-content: space-between; gap: 12px;`, alinhando perfeitamente o checkbox à esquerda, o título e status ao centro e os botões de ação à direita.
   - `.queue-item-title-line` alinha a tag do tipo do arquivo (ex: `.video`) na mesma linha do nome da mídia, com layout responsivo e elegante.

---

## Bug 26: Detecção e Roteamento de Links PixelDrain e Hosters WebDL via Torbox para a Aba "Aguardando Torbox" e Auto-Download Local pós-Nuvem

### Causa Raiz Identificada e Corrigida
1. **Conflito de Prioridade no Discriminador de Serviço (`main.js`)**:
   - `getItemServiceKey(item)` verificava chaves do `pixeldrain_` antes de checar se o item era do Torbox (`torbox_` / `item.torboxType`), causando identificação incorreta.
2. **Timeout Curto na Criação de WebDLs (`main.js`)**:
   - `scanTorboxWithFastTimeout` operava com timeout de apenas 2.5s, disparando fallback nativo antes de o Torbox processar o link no servidor.
3. **Ausência de Propriedades de Nuvem em WebDLs Recém-Criadas (`torbox-scanner.js`)**:
   - `buildWebdlResultList` não preenchia `isFinished`, `isCloudProcessing`, `cloudProgress`, `cloudStatus`, `cloudMessage`.
4. **Falta de Polling no Resolver Torbox (`torbox-scanner.js`)**:
   - `resolveTorboxDirectUrl` retornava de imediato o link assinado quando o arquivo ainda estava baixando na nuvem (`isCloudReady === false`), fazendo o worker falhar em arquivo incompleto no servidor.
5. **Partição Restritiva da Fila na Interface (`renderer/js/app.js`)**:
   - `isTorboxPendingItem` e `folderMap.forEach` não incluíam pastas com arquivos WebDL na sub-aba "Aguardando Torbox".
6. **Guard de 60s Abortava Downloads em Nuvem (`main.js`)**:
   - O temporizador de 60s abortava downloads com 0 bytes antes de o Torbox terminar a transferência nos seus próprios servidores.

### Solução Aplicada
7. **Proteção de Inatividade**: Guard de inatividade em `main.js` ignora itens enquanto estiverem em processamento na nuvem (`isTorboxCloudPendingItem`).

---

## Bug 27: Cumprimento Estrito e Universal das Chaves ON/OFF do Torbox para Bunkr e Todos os Serviços Suportados (Download 100% Nativo quando Desligado)

### Causa Raiz Identificada e Corrigida
1. **Fallback Permissivo em `isTorboxEnabledForService(service)` (`main.js`)**:
   - A função retornava `true` por padrão caso `service` fosse nulo/indefinido ou caso o serviço não estivesse explicitamente cadastrado no dicionário `config.torboxForServices`.
2. **Mascaramento de Serviços Reais em `getItemServiceKey(item)` (`main.js`)**:
   - A verificação de prefixo `torbox_` antecedia os domínios reais de origem. Desta forma, itens do Bunkr que entravam com prefixo de nuvem eram classificados como serviço `'torbox'`, cujo switch estava ligado (`torboxForServices.torbox: true`), bypassando a chave desligada do Bunkr (`torboxForServices.bunkr: false`).
3. **Bypass no Worker de Download (`main.js` linha 1088)**:
   - A rotina de download verificava apenas `if (queueItem.id.startsWith('torbox_') || queueItem.torboxType)`, invocando `resolveTorboxDirectUrl` diretamente sem validar se o serviço de origem daquele item tinha permissão ativa para usar o Torbox.
4. **Ausência de Serviços Recentes na Interface (`renderer/js/app.js` e `renderer/index.html`)**:
   - Os serviços PixelDrain, MEGA, 1Fichier e Rapidgator não estavam integrados aos listeners de alteração no `app.js`, e o Rapidgator não possuía cartão de toggle no `index.html`.

### Solução Aplicada
1. **Blindagem Absoluta de `isTorboxEnabledForService`**:
   - Retorna estritamente `false` se `config.torboxEnabled` estiver desligado ou sem API Key.
   - Retorna `true` única e exclusivamente se `config.torboxForServices[service] === true`. Para qualquer outro cenário, retorna impreterivelmente `false` (arquitetura opt-in estrita).
2. **Priorização Fidedigna do Hoster em `getItemServiceKey`**:
   - A função avalia primeiro os domínios de origem (`bunkr`, `pixeldrain`, `mediafire`, `terabox`, `gofile`, `mega`, `1fichier`, `rapidgator`, etc.) a partir de `url`, `sourceUrl`, `bunkrPageUrl` e prefixos específicos. Arquivos de hosters nunca são mascarados como `'torbox'`.
3. **Interceptação com Desvio Nativo no Worker de Download**:
   - No worker de Torbox, caso a chave do serviço de origem esteja no OFF, o Nexus limpa os metadados de nuvem e desvia a requisição imediatamente para o resolver nativo de alta velocidade do respectivo serviço (ex: `resolveBunkrDirectUrl`), garantindo download 100% nativo.
4. **Guarda de Estagnação Segura**:
   - A transição por estagnação (0 KB/s por 60s) valida estritamente `isTorboxEnabledForService` antes de tentar alternar para Torbox.
5. **Interface e Persistência Unificada**:
   - Adicionado o cartão do Rapidgator em `renderer/index.html` e unificados todos os 15 serviços nos loops de inicialização e salvamento em `renderer/js/app.js`.

---

## Bug 28: Isolamento Universal de Links Avulsos vs Lotes Coletivos em Serviços Mapeados (Bunkr, PixelDrain, Vik1ngFile, Google Drive, Genérico)

### Causa Raiz Identificada e Corrigida
1. **Atribuição Hardcoded de Pastas Coletivas em Links Únicos**:
   - Em `bunkr-scanner.js` (`getBunkrFileDetails`), `generic-scanner.js` (`scanPixelDrain`, `scanGenericLink`) e `vikingfile-scanner.js`, todo arquivo individual escaneado recebia pastas genéricas como `'Arquivos Avulsos Bunkr'`, `'Arquivos Avulsos PixelDrain'` e `'Arquivos Avulsos'`, mesmo quando o usuário adicionava apenas 1 link único.
2. **Fusão Indevida no Map da Fila Puxando o Histórico Concluído**:
   - No `renderer/js/app.js`, a chave de agrupamento era `${serviceName}:::${rawFolder}`.
   - Toda vez que novos arquivos eram inseridos com esse nome genérico, o sistema agrupava os novos downloads com todos os arquivos concluídos do passado sob o mesmo card, desmarcando o status de conclusão e reabrindo todos os arquivos antigos na aba "Em Progresso".

### Solução Aplicada
1. **Regra de Link Único Individual**:
   - Ao escanear 1 link avulso (`lines.length === 1`), os scanners definem `folderName: null`. Na inserção da fila, o card é criado com o nome limpo do arquivo (`extractCleanShowName(file.name)`), ficando 100% independente sem nenhuma pasta de avulsos.
2. **Regra de Lote Múltiplo Isolado**:
   - Se o usuário colar múltiplos links avulsos juntos de uma vez (`lines.length > 1`), o backend gera um `batchId` único e intransferível (`${servico}_batch_${Date.now()}`) e atribui a pasta do serviço (`Arquivos Avulsos Bunkr`, `Arquivos Avulsos PixelDrain`, etc.).
3. **Agrupamento com BatchId na Interface**:
   - A chave de agrupamento da fila agora utiliza `const groupKey = `${serviceName}:::${rawFolder}${item.batchId ? ':::' + item.batchId : ''}`;`.
   - Novos lotes nunca colidem com lotes passados, impedindo 100% o resgate de arquivos antigos da aba Concluídos.

---

## Bug 29: Atualização Automática e Aceleração Paralela na Sessão da Nuvem Torbox

### Causa Raiz Identificada e Corrigida
1. **Execução Sequencial Lenta na API Torbox**:
   - `fetchTorboxUserDownloads` realizava chamadas sequenciais para Torrents e WebDL (`await` um após o outro), levando mais de 4,3s para escanear a conta de usuários com milhares de arquivos.
2. **Ausência de Feedback Visual no Botão**:
   - O botão "Atualizar Lista" (`btn-refresh-torbox`) não exibia animação de carregamento, fazendo o usuário acreditar que a tela não estava atualizando automaticamente.
3. **Requisições Concorrentes e Live Polling Excessivo**:
   - Polling a cada 3s gerava conflito com requisições de mais de 4s em andamento, causando atrasos no IPC.

### Solução Aplicada
1. **Paralelização via `Promise.all` (`torbox-scanner.js`)**:
   - Consultas de Torrents e WebDL agora disparam em paralelo, reduzindo drasticamente o tempo de resposta da API Torbox.
2. **Sincronização Automática ao Entrar na Aba (`renderer/js/app.js`)**:
   - Ao clicar na aba Torbox, `loadTorboxDownloads(false)` é invocado imediatamente, garantindo que a lista sempre esteja atualizada.
3. **Feedback Visual e Trava de Concorrência**:
   - Adicionada animação de rotação contínua no ícone SVG do botão (`btn-refreshing`), desativação do botão e texto "Atualizando..." durante a busca.
   - Adicionada trava booleana `isFetchingTorboxDownloads` para impedir qualquer sobreposição de requisições.

---

## Bug 30: Falha no Download do Bunkr por Sequestro de Rota no Worker do Send e Bloqueio em Cascata por Falsa Marcação de CDN Off-line

### Causa Raiz Identificada e Corrigida
1. **Poluição de `sendUrl` no Enfileiramento e Serialização (`main.js`)**:
   - Em `add-to-queue`, `saveQueue` e `updateQueueUI`, a chave `sendUrl` recebia um fallback genérico: `sendUrl: file.sendUrl || file.url || file.directUrl || null`.
   - Como resultado, links de qualquer provedor (especialmente Bunkr, como `https://bunkr.cr/f/...`) recebiam sua própria URL de página HTML armazenada na propriedade `sendUrl`.
2. **Sequestro de Fluxo pelo Worker do Send (`downloadBunkrFile`)**:
   - A condição de roteamento para o serviço Send era `else if (queueItem.id && (queueItem.id.startsWith('send_') || queueItem.sendUrl))`.
   - Pelo fato de `sendUrl` vir preenchido com o link do Bunkr, o download caía no resolver do Send (`resolveSendDirectUrl`), que falhava e retornava a URL da página HTML como link de download. O manipulador nativo do Bunkr nunca foi acionado.
3. **Download de Página HTML e Bloqueio em Cascata**:
   - Ao receber a página HTML em vez do arquivo de vídeo/áudio, a validação de cabeçalho `content-type.includes('text/html')` rejeitava a resposta com o erro: `Servidor ou antivírus retornou página HTML em vez do arquivo binário.`.
   - No tratador de erro de conexão, `parsedUrl.hostname` (`bunkr.cr`) era adicionado ao `Set` em memória `offlineBunkrSubdomains`. A partir desse instante, todos os downloads subsequentes do Bunkr eram abortados instantaneamente com `Servidor CDN bunkr.cr marcado como off-line/bloqueado no provedor. Ignorado instantaneamente.`.
4. **Falso Positivo de Direct URL no `bunkr-scanner.js`**:
   - O regex em `resolveBunkrDirectUrl` tratava links de páginas intermediárias como `https://dl.bunkr.cr/file/63351828` como se fossem o arquivo de mídia final no CDN, impedindo a requisição à API POST `_001_v2` e ao endpoint de assinatura `glb-apisign.cdn.cr`.

### Solução Aplicada
1. **Sanitização Rigorosa de `sendUrl` e `directUrl` (`main.js`)**:
   - Em `add-to-queue`, `saveQueue`, `loadQueue` e `updateQueueUI`, o campo `sendUrl` agora só é atribuído caso passe com sucesso na validação `isSendUrl()`.
   - Para arquivos do Bunkr (`id.startsWith('bunkr_')` ou `isBunkrUrl`), URLs de páginas de navegação (`/f/`, `/v/`, `/i/`, `/d/`, `bunkr.`) nunca são aceitas em `directUrl` ou `downloadUrl`, forçando a resolução fidedigna no CDN de alta velocidade.
## Bug 24: Ajuste de Disposição e Alinhamento dos Elementos na Fila de Downloads (Conforme Imagem Enviada)

### Causa Raiz Identificada e Corrigida
- **Alinhamento do Bloco de Progresso na Base do Painel Ativo (`style.css`)**:
  - No CSS do painel de download ativo, as estatísticas da base (`.active-stats`) precisavam alinhar a barra de progresso (`☁️ Nuvem X%`) no lado esquerdo e as informações de status (`Servidor Torbox Processando • Aguardando Conclusão • 0 Bytes / X GB`) no lado direito em um único eixo horizontal fluido, exatamente como demonstrado na imagem enviada pelo usuário (`media_1787281634503.png`).

### Solução Aplicada
1. **Reordenamento e Preservação Estrita dos Elementos**:
   - Todos os elementos visuais (cabeçalho, 6 botões de ação em 2 linhas, card do painel ativo em 3 camadas e lista de downloads agrupada) foram preservados sem nenhuma remoção ou adição desnecessária.
2. **Alinhamento Horizontal na Base do Card (`style.css`)**:
   - Ajustado `.active-stats` para `display: flex; align-items: center; justify-content: space-between; gap: 20px;`.
   - A barra de progresso preenche o espaço à esquerda e os textos de velocidade/conclusão alinham-se à direita na mesma linha, atingindo **100% de fidelidade visual com a imagem do usuário**.

---

## Bug 25: Correção do Painel Ativo para Layout Compacto de 3 Colunas Horizontais (`style.css` & `index.html`)

### Causa Raiz Identificada e Corrigida
- **Desformatação em 3 Linhas Empilhadas Verticais**:
  - No passo anterior, o painel ativo havia sido estruturado em 3 linhas empilhadas verticalmente (topo, meio e base), o que deixou a barra de progresso espremida em 4% no canto inferior esquerdo e o texto da direita cortado com `...` (conforme reportado pelo usuário na imagem `media_1787282578597.png`).
  - Na imagem de referência desejada pelo usuário (`media_1787281634503.png`), o painel ativo é um **card horizontal único compacto com 3 colunas fluídas lado a lado**.

### Solução Aplicada
1. **Estrutura de 3 Colunas Lado a Lado (`index.html` & `style.css`)**:
   - **Coluna 1 (Esquerda - Título & Botões)**: `.active-title-group` contendo a badge (`AGUARDANDO TORBOX`), tag `.Zip`, nome do arquivo e botões de ação (`|| x`).
   - **Coluna 2 (Centro - Banner de Aviso)**: `#active-cloud-notice-container` posicionado no centro do card com texto explicativo translúcido.
   - **Coluna 3 (Direita - Progresso & Status)**: `.active-stats` alinhando a barra de progresso no topo e o status explicativo na base à direita.
2. **Resultado**:
   - Elimina o empilhamento vertical, descompressão da barra de progresso e restaura a **fidelidade visual exata de 100% com a imagem original enviada pelo usuário**.

---

## Bug 26: Exibição Condicional do Botão "Iniciar Download" Somente Após Escaneamento de Links (`app.js`)

### Causa Raiz Identificada e Corrigida
- **Referência Incorreta e Falta de Ocultação ao Iniciar/Limpar (`app.js`)**:
   - No handler de remoção/limpeza (`btnClearScanned`), a variável que ocultava o botão tentava acessar `btnStartDownloadMain`, que não estava declarada (`undefined`).
   - Além disso, no momento em que o usuário clicava em "Escanear Links", o botão "Iniciar Download" não garantia a ocultação preventiva durante o carregamento.

### Solução Aplicada
1. **Controle Estrito de Exibição (`renderer/js/app.js`)**:
   - Ajustadas todas as chamadas para `btnAddSelected.style.display = 'none'` ao iniciar a varredura, ao limpar os links ou quando a lista de escaneados estiver vazia (`scannedFiles.length === 0`).
2. **Garantia de Fluxo**:
   - O botão verde **`Iniciar Download`** permanece oculto e só aparece (`display: inline-flex`) **exclusivamente após a conclusão do escaneamento**, quando houver ao menos 1 arquivo escaneado e pronto na lista.

---

## Recursos / Feature 27: Implementação Completa da Arquitetura em 5 Camadas do Sistema de Atualização

### Estrutura Implementada (`main.js`, `index.html`, `style.css`, `app.js`)
1. **🔍 1. Detecção e Comparação Semântica (Version Checking & SemVer)**:
   - Consulta nativa via HTTP GET a `https://api.github.com/repos/alazter/nexus-downloader/releases`.
   - Comparação SemVer (`isNewerVersion`) comparando `app.getVersion()` com a release remota.
   - Emissão de notificação nativa do Windows (`Notification`) ao detectar nova versão.
2. **🎨 2. Interface, Badge e Modal com Changelog (`UpdatePopupModal`)**:
   - Exibição de contador/badge dinâmico no rodapé e sidebar (`update-notice`).
   - Modal com scroll das notas da versão (Release Notes / Changelog) extraídas de `release.body`.
   - Botões de ação clara: `"Atualizar Agora"` (`#btn-update-now`) e `"Ignorar por enquanto"` (`#btn-update-ignore`).
3. **📥 3. Download Resiliente com Progresso em Tempo Real (Asset Matcher & Stream)**:
   - Seleção inteligente entre instalador Setup (`Nexus-Downloader-Setup-*.exe`) e portátil (`Nexus-Downloader-Portable-*.exe`).
   - Download via Stream com feedback IPC em tempo real (`percent`, `transferred`, `total`, `mbps`).
4. **🔄 4. Instalação Transparente e Substituição de Processo (Hot Swap Handover)**:
   - Preservação do `AppUserModelId` e ícone permanente.
   - Liberação de trava de instância única (`app.releaseSingleInstanceLock()`).
   - Execução transparente da nova versão (`shell.openPath`) e encerramento limpo do processo antigo (`app.quit()`).
5. **🏷️ 5. Padronização de Publicação (Publishing Pattern)**:
   - Formatação padrão de versão `⚡ Nexus v[Versão]`.
   - Suporte completo a nota de versão e banners no GitHub.

---

## Bug 11: Desformatação e Empilhamento Vertical dos Arquivos Internos na Fila de Downloads

### Causa Raiz Identificada e Corrigida
- **Falta de Estilização CSS para `.queue-item-row` e `.queue-item-main` (`style.css`)**:
  - No arquivo de renderização da fila (`app.js`), cada linha de arquivo era criada com a estrutura `<div class="queue-item-row"><div class="queue-item-main">...</div></div>`.
  - No entanto, o arquivo de estilos `renderer/css/style.css` continha apenas regras para a antiga classe `.queue-item`. Sem o CSS flexbox atribuído à nova classe `.queue-item-row`, o navegador renderizava o checkbox, a badge `.video`, o nome do arquivo, a contagem de bytes e o botão de exclusão empilhados verticalmente um sobre o outro de forma desformatada.

### Solução Aplicada
1. **Adição das Regras Flexbox e Alinhamento Horizontal (`renderer/css/style.css`)**:
   - Criadas as regras CSS completas para `.queue-item-row`, `.queue-item-main`, `.queue-item-title-line`, `.queue-item-sub` e `.btn-icon`.
   - `.queue-item-main` recebeu `display: flex; align-items: center; justify-content: space-between; gap: 12px;`, alinhando perfeitamente o checkbox à esquerda, o título e status ao centro e os botões de ação à direita.
   - `.queue-item-title-line` alinha a tag do tipo do arquivo (ex: `.video`) na mesma linha do nome da mídia, com layout responsivo e elegante.

---

## Bug 26: Detecção e Roteamento de Links PixelDrain e Hosters WebDL via Torbox para a Aba "Aguardando Torbox" e Auto-Download Local pós-Nuvem

### Causa Raiz Identificada e Corrigida
1. **Conflito de Prioridade no Discriminador de Serviço (`main.js`)**:
   - `getItemServiceKey(item)` verificava chaves do `pixeldrain_` antes de checar se o item era do Torbox (`torbox_` / `item.torboxType`), causando identificação incorreta.
2. **Timeout Curto na Criação de WebDLs (`main.js`)**:
   - `scanTorboxWithFastTimeout` operava com timeout de apenas 2.5s, disparando fallback nativo antes de o Torbox processar o link no servidor.
3. **Ausência de Propriedades de Nuvem em WebDLs Recém-Criadas (`torbox-scanner.js`)**:
   - `buildWebdlResultList` não preenchia `isFinished`, `isCloudProcessing`, `cloudProgress`, `cloudStatus`, `cloudMessage`.
4. **Falta de Polling no Resolver Torbox (`torbox-scanner.js`)**:
   - `resolveTorboxDirectUrl` retornava de imediato o link assinado quando o arquivo ainda estava baixando na nuvem (`isCloudReady === false`), fazendo o worker falhar em arquivo incompleto no servidor.
5. **Partição Restritiva da Fila na Interface (`renderer/js/app.js`)**:
   - `isTorboxPendingItem` e `folderMap.forEach` não incluíam pastas com arquivos WebDL na sub-aba "Aguardando Torbox".
6. **Guard de 60s Abortava Downloads em Nuvem (`main.js`)**:
   - O temporizador de 60s abortava downloads com 0 bytes antes de o Torbox terminar a transferência nos seus próprios servidores.

### Solução Aplicada
7. **Proteção de Inatividade**: Guard de inatividade em `main.js` ignora itens enquanto estiverem em processamento na nuvem (`isTorboxCloudPendingItem`).

---

## Bug 27: Cumprimento Estrito e Universal das Chaves ON/OFF do Torbox para Bunkr e Todos os Serviços Suportados (Download 100% Nativo quando Desligado)

### Causa Raiz Identificada e Corrigida
1. **Fallback Permissivo em `isTorboxEnabledForService(service)` (`main.js`)**:
   - A função retornava `true` por padrão caso `service` fosse nulo/indefinido ou caso o serviço não estivesse explicitamente cadastrado no dicionário `config.torboxForServices`.
2. **Mascaramento de Serviços Reais em `getItemServiceKey(item)` (`main.js`)**:
   - A verificação de prefixo `torbox_` antecedia os domínios reais de origem. Desta forma, itens do Bunkr que entravam com prefixo de nuvem eram classificados como serviço `'torbox'`, cujo switch estava ligado (`torboxForServices.torbox: true`), bypassando a chave desligada do Bunkr (`torboxForServices.bunkr: false`).
3. **Bypass no Worker de Download (`main.js` linha 1088)**:
   - A rotina de download verificava apenas `if (queueItem.id.startsWith('torbox_') || queueItem.torboxType)`, invocando `resolveTorboxDirectUrl` diretamente sem validar se o serviço de origem daquele item tinha permissão ativa para usar o Torbox.
4. **Ausência de Serviços Recentes na Interface (`renderer/js/app.js` e `renderer/index.html`)**:
   - Os serviços PixelDrain, MEGA, 1Fichier e Rapidgator não estavam integrados aos listeners de alteração no `app.js`, e o Rapidgator não possuía cartão de toggle no `index.html`.

### Solução Aplicada
1. **Blindagem Absoluta de `isTorboxEnabledForService`**:
   - Retorna estritamente `false` se `config.torboxEnabled` estiver desligado ou sem API Key.
   - Retorna `true` única e exclusivamente se `config.torboxForServices[service] === true`. Para qualquer outro cenário, retorna impreterivelmente `false` (arquitetura opt-in estrita).
2. **Priorização Fidedigna do Hoster em `getItemServiceKey`**:
   - A função avalia primeiro os domínios de origem (`bunkr`, `pixeldrain`, `mediafire`, `terabox`, `gofile`, `mega`, `1fichier`, `rapidgator`, etc.) a partir de `url`, `sourceUrl`, `bunkrPageUrl` e prefixos específicos. Arquivos de hosters nunca são mascarados como `'torbox'`.
3. **Interceptação com Desvio Nativo no Worker de Download**:
   - No worker de Torbox, caso a chave do serviço de origem esteja no OFF, o Nexus limpa os metadados de nuvem e desvia a requisição imediatamente para o resolver nativo de alta velocidade do respectivo serviço (ex: `resolveBunkrDirectUrl`), garantindo download 100% nativo.
4. **Guarda de Estagnação Segura**:
   - A transição por estagnação (0 KB/s por 60s) valida estritamente `isTorboxEnabledForService` antes de tentar alternar para Torbox.
5. **Interface e Persistência Unificada**:
   - Adicionado o cartão do Rapidgator em `renderer/index.html` e unificados todos os 15 serviços nos loops de inicialização e salvamento em `renderer/js/app.js`.

---

## Bug 28: Isolamento Universal de Links Avulsos vs Lotes Coletivos em Serviços Mapeados (Bunkr, PixelDrain, Vik1ngFile, Google Drive, Genérico)

### Causa Raiz Identificada e Corrigida
1. **Atribuição Hardcoded de Pastas Coletivas em Links Únicos**:
   - Em `bunkr-scanner.js` (`getBunkrFileDetails`), `generic-scanner.js` (`scanPixelDrain`, `scanGenericLink`) e `vikingfile-scanner.js`, todo arquivo individual escaneado recebia pastas genéricas como `'Arquivos Avulsos Bunkr'`, `'Arquivos Avulsos PixelDrain'` e `'Arquivos Avulsos'`, mesmo quando o usuário adicionava apenas 1 link único.
2. **Fusão Indevida no Map da Fila Puxando o Histórico Concluído**:
   - No `renderer/js/app.js`, a chave de agrupamento era `${serviceName}:::${rawFolder}`.
   - Toda vez que novos arquivos eram inseridos com esse nome genérico, o sistema agrupava os novos downloads com todos os arquivos concluídos do passado sob o mesmo card, desmarcando o status de conclusão e reabrindo todos os arquivos antigos na aba "Em Progresso".

### Solução Aplicada
1. **Regra de Link Único Individual**:
   - Ao escanear 1 link avulso (`lines.length === 1`), os scanners definem `folderName: null`. Na inserção da fila, o card é criado com o nome limpo do arquivo (`extractCleanShowName(file.name)`), ficando 100% independente sem nenhuma pasta de avulsos.
2. **Regra de Lote Múltiplo Isolado**:
   - Se o usuário colar múltiplos links avulsos juntos de uma vez (`lines.length > 1`), o backend gera um `batchId` único e intransferível (`${servico}_batch_${Date.now()}`) e atribui a pasta do serviço (`Arquivos Avulsos Bunkr`, `Arquivos Avulsos PixelDrain`, etc.).
3. **Agrupamento com BatchId na Interface**:
   - A chave de agrupamento da fila agora utiliza `const groupKey = `${serviceName}:::${rawFolder}${item.batchId ? ':::' + item.batchId : ''}`;`.
   - Novos lotes nunca colidem com lotes passados, impedindo 100% o resgate de arquivos antigos da aba Concluídos.

---

## Bug 29: Atualização Automática e Aceleração Paralela na Sessão da Nuvem Torbox

### Causa Raiz Identificada e Corrigida
1. **Execução Sequencial Lenta na API Torbox**:
   - `fetchTorboxUserDownloads` realizava chamadas sequenciais para Torrents e WebDL (`await` um após o outro), levando mais de 4,3s para escanear a conta de usuários com milhares de arquivos.
2. **Ausência de Feedback Visual no Botão**:
   - O botão "Atualizar Lista" (`btn-refresh-torbox`) não exibia animação de carregamento, fazendo o usuário acreditar que a tela não estava atualizando automaticamente.
3. **Requisições Concorrentes e Live Polling Excessivo**:
   - Polling a cada 3s gerava conflito com requisições de mais de 4s em andamento, causando atrasos no IPC.

### Solução Aplicada
1. **Paralelização via `Promise.all` (`torbox-scanner.js`)**:
   - Consultas de Torrents e WebDL agora disparam em paralelo, reduzindo drasticamente o tempo de resposta da API Torbox.
2. **Sincronização Automática ao Entrar na Aba (`renderer/js/app.js`)**:
   - Ao clicar na aba Torbox, `loadTorboxDownloads(false)` é invocado imediatamente, garantindo que a lista sempre esteja atualizada.
3. **Feedback Visual e Trava de Concorrência**:
   - Adicionada animação de rotação contínua no ícone SVG do botão (`btn-refreshing`), desativação do botão e texto "Atualizando..." durante a busca.
   - Adicionada trava booleana `isFetchingTorboxDownloads` para impedir qualquer sobreposição de requisições.

---

## Bug 30: Falha no Download do Bunkr por Sequestro de Rota no Worker do Send e Bloqueio em Cascata por Falsa Marcação de CDN Off-line

### Causa Raiz Identificada e Corrigida
1. **Poluição de `sendUrl` no Enfileiramento e Serialização (`main.js`)**:
   - Em `add-to-queue`, `saveQueue` e `updateQueueUI`, a chave `sendUrl` recebia um fallback genérico: `sendUrl: file.sendUrl || file.url || file.directUrl || null`.
   - Como resultado, links de qualquer provedor (especialmente Bunkr, como `https://bunkr.cr/f/...`) recebiam sua própria URL de página HTML armazenada na propriedade `sendUrl`.
2. **Sequestro de Fluxo pelo Worker do Send (`downloadBunkrFile`)**:
   - A condição de roteamento para o serviço Send era `else if (queueItem.id && (queueItem.id.startsWith('send_') || queueItem.sendUrl))`.
   - Pelo fato de `sendUrl` vir preenchido com o link do Bunkr, o download caía no resolver do Send (`resolveSendDirectUrl`), que falhava e retornava a URL da página HTML como link de download. O manipulador nativo do Bunkr nunca foi acionado.
3. **Download de Página HTML e Bloqueio em Cascata**:
   - Ao receber a página HTML em vez do arquivo de vídeo/áudio, a validação de cabeçalho `content-type.includes('text/html')` rejeitava a resposta com o erro: `Servidor ou antivírus retornou página HTML em vez do arquivo binário.`.
   - No tratador de erro de conexão, `parsedUrl.hostname` (`bunkr.cr`) era adicionado ao `Set` em memória `offlineBunkrSubdomains`. A partir desse instante, todos os downloads subsequentes do Bunkr eram abortados instantaneamente com `Servidor CDN bunkr.cr marcado como off-line/bloqueado no provedor. Ignorado instantaneamente.`.
4. **Falso Positivo de Direct URL no `bunkr-scanner.js`**:
   - O regex em `resolveBunkrDirectUrl` tratava links de páginas intermediárias como `https://dl.bunkr.cr/file/63351828` como se fossem o arquivo de mídia final no CDN, impedindo a requisição à API POST `_001_v2` e ao endpoint de assinatura `glb-apisign.cdn.cr`.

### Solução Aplicada
1. **Sanitização Rigorosa de `sendUrl` e `directUrl` (`main.js`)**:
   - Em `add-to-queue`, `saveQueue`, `loadQueue` e `updateQueueUI`, o campo `sendUrl` agora só é atribuído caso passe com sucesso na validação `isSendUrl()`.
   - Para arquivos do Bunkr (`id.startsWith('bunkr_')` ou `isBunkrUrl`), URLs de páginas de navegação (`/f/`, `/v/`, `/i/`, `/d/`, `bunkr.`) nunca são aceitas em `directUrl` ou `downloadUrl`, forçando a resolução fidedigna no CDN de alta velocidade.
2. **Roteamento Exclusivo e Desacoplado no Worker (`main.js`)**:
   - A condição do Send agora valida explicitamente `(queueItem.id.startsWith('send_') || isSendUrl(queueItem.sendUrl || queueItem.url))`.
   - Adicionado ramo prioritário e dedicado para o Bunkr: `else if (queueItem.id && (queueItem.id.startsWith('bunkr_') || isBunkrUrl(queueItem.url || queueItem.bunkrPageUrl)))`.
3. **Blindagem da Lista Negra de CDN (`offlineBunkrSubdomains`)**:
   - Os domínios mestres do Bunkr (`bunkr.cr`, `bunkr.ph`, `bunkr.is`, `bunkr.su`, `bunkr.site`, `bunkr.pk`, `balbums.st`, `dl.bunkr`) foram protegidos e nunca são inseridos no `offlineBunkrSubdomains`.
4. **Resolução de CDN Nativa em 2 Etapas (`bunkr-scanner.js`)**:
   - Removido o match falso de `dl.bunkr` em `directHrefMatch`. O resolver agora chama com precisão o endpoint POST `https://dl.bunkr.cr/api/_001_v2`, envia o `fileId` e assina a URL em `glb-apisign.cdn.cr`, obtendo a rota CDN final (ex: `c6no3-b.cdn.cr`) com status HTTP 200 e velocidade máxima.
5. **Recuperação Automática e Higienização da Fila Persistida**:
   - `loadQueue` recupera automaticamente itens com erro de "marcado como off-line" ou "página HTML", redefinindo o status para `pending`.
   - O arquivo `queue.json` ativo do usuário foi completamente higienizado, restaurando os 27 itens pendentes para download imediato.

---

## Bug 31: Falha no Reconhecimento de Pastas do GoFile no Modo Nativo (Chave Torbox OFF) por Ausência de Assinatura X-Website-Token

### Causa Raiz Identificada e Corrigida
1. **Exigência do Algoritmo de Assinatura `X-Website-Token` pelo GoFile**:
   - A API do GoFile atualizou seus mecanismos de proteção de conteúdo: toda chamada ao endpoint `/contents/:id` sem o cabeçalho `X-Website-Token` é intencionalmente rejeitada pelo servidor com status HTTP 401 e payload `{"status":"error-notPremium"}`.
   - No `generic-scanner.js` antigo, as requisições a `https://api.gofile.io/contents/${contentId}` enviavam apenas a autorização Bearer padrão.
   - Ao receber o falso erro `error-notPremium`, o scanner capturava a exceção e caía no fallback de erro, criando apenas 1 único item genérico fictício com 0 bytes (`gofile_${contentId}`) em vez de listar os arquivos reais da pasta.
   - Com o Torbox ligado (ON), o Torbox resolvia o link nos seus servidores e retornava os arquivos, mascarando a falha nativa.
2. **Inexistência de Declaração no Worker de Download (`main.js`)**:
   - No worker de download do `main.js`, as linhas de resolução nativa chamavam `await getGoFileAccountToken()`, mas essa função não estava importada nem declarada no escopo principal, provocando `ReferenceError` caso caísse na resolução nativa.
3. **Ausência de Persistência de Sessão da Conta GoFile**:
   - O scanner anterior tentava chamar `POST /accounts` repetidamente a cada nova tentativa em vez de persistir a sessão de convidado como faz o frontend oficial (`localStorage['gofile.accounts']`).

### Solução Aplicada
1. **Criação do Módulo Dedicado `gofile-scanner.js`**:
   - Implementado executor em sandbox Node.js (`vm.runInContext`) para o script oficial de assinatura do GoFile (`https://gofile.io/js/wt.obf.js`), gerando dinamicamente o `X-Website-Token` exigido pela API.
   - O algoritmo é mantido em cache de memória por até 3 horas (o GoFile rotaciona a cada 6 horas).
2. **Persistência de Sessão Local em Disco (`gofile_session.json`)**:
   - A sessão de convidado (`token`, `rootFolder`) é armazenada em `AppData/nexus-downloader/gofile_session.json` e reaproveitada em todos os escaneamentos e downloads, evitando chamadas repetidas e prevenindo bloqueios por rate-limit.
3. **Varredura Completa e Recursiva de Pastas e Subpastas (`scanGoFileFolder`)**:
   - Ao receber uma URL `/d/:id`, o scanner consulta a API autenticada com `X-Website-Token` e extrai 100% dos arquivos reais contidos na pasta com seus nomes legítimos, tamanhos em bytes, links diretos de CDN e cabeçalhos de cookie (`accountToken`).
4. **Resolução Nativa Confiável no Worker de Download (`main.js`)**:
   - Integrado `resolveGoFileDirectUrl` em `main.js`. Quando a chave do Torbox estiver desligada (OFF), o Nexus utiliza a conexão direta com o CDN do GoFile acompanhada do cookie `accountToken=${token}`, realizando downloads estáveis e a velocidade máxima.

---

## Bug 32: Precedência de Badges de Extensão (.Rar/.Zip vs .Torrents) e Ausência de Data de Criação e Tempo Armazenado na Sessão Torbox

### Causa Raiz Identificada e Corrigida
1. **Precedência Incorreta em `getFolderTypeTag`**:
   - A função `getFolderTypeTag` verificava `i.torboxType === 'torrent'` antes de analisar as extensões `.rar` e `.zip`.
   - Por conta disso, qualquer torrent cujos arquivos internos fossem partes comprimidas (como `MARVEL Tokon Fighting Souls.part1.rar` até `.part7.rar`) recebia erroneamente a badge genérica `[.Torrents]` em vez de `[.Rar]`.
2. **Ausência de Metadados de Data e Armazenamento no Card Principal**:
   - O card da pasta/torrent na aba do Torbox mostrava apenas o nome do arquivo e badges, sem informar quando o arquivo foi baixado/adicionado nem há quanto tempo permanecia armazenado/em cache no Torbox.

### Solução Aplicada
1. **Reordenação de Precedência em `getFolderTypeTag` (`renderer/js/app.js`)**:
   - A função agora avalia os arquivos na seguinte ordem de prioridade:
     1. Arquivos comprimidos RAR (`.rar`, `.part*.rar`, `.r*`): badge `[.Rar]`.
     2. Arquivos comprimidos ZIP (`.zip`, `.7z`, `.tar`, `.gz`, etc.): badge `[.Zip]`.
     3. Vídeos (`.mkv`, `.mp4`, etc.): badge `[.video]`.
     4. Torrent genérico: badge `[.Torrents]`.
2. **Implementação do Helper `formatTorboxStorageInfo` (`renderer/js/app.js`)**:
   - Calcula a data formatada (`DD/MM/AAAA`) a partir de `createdAt` / `cachedAt`.
   - Prefixa com `Baixado` (se concluído), `Adicionado` (se em download) ou `Inativo`.
   - Calcula o tempo relativo decorrido de armazenamento no Torbox em português (`há X Minutos`, `há X Horas`, `há X Dias`, `há X Semanas`, `há X Meses`, `há X Anos`).
   - Identifica itens em cache para exibir `Armazenado no Torbox (cached) há X [tempo].`
3. **Estrutura Visual em Duas Linhas no Card do Torbox (`renderTorboxDownloads`)**:
   - Linha 1: Badges de serviço (`[Torbox] [Torrent]`), badge de tipo (`[.Rar]`) e título completo do arquivo.
   - Linha 2 (Sublinha): Subtítulo explicativo e elegante (`Baixado 28/08/2026, Armazenado no Torbox (cached) há 2 Semanas.`).

---

## Bug 33: Desalinhamento Visual e Espaçamento Excessivo da Terceira Tag (.Rar/.Zip/.Torrents) no Cabeçalho dos Cards

### Causa Raiz Identificada e Corrigida
1. **Composição Assimétrica de Contêineres de Tags**:
   - As duas primeiras tags (`[Torbox]` e `[Torrent]`) eram geradas dentro de um `<span>` isolado (`serviceTagSpanWrapper`), onde cada uma recebia `margin-right: 6px`.
   - A terceira tag (`folderTypeSpan`, ex: `[.Rar]`) era inserida como um elemento irmão independente fora desse invólucro, possuindo `margin-right: 8px` e sofrendo a aplicação cumulativa do `gap` do flexbox pai (`titleMainRow` ou `titleGroup`).
   - Com isso, enquanto a distância entre a 1ª e a 2ª tag era de apenas 5~6px, a distância entre a 2ª e a 3ª tag somava o `margin-right` da tag anterior com o `gap` do container (chegando a 8~16px), deixando-a visivelmente afastada e destacada ("longe das demais").
2. **Diferença de Baseline e Alinhamento Vertical**:
   - Por estarem em wrappers distintos (`inline-flex` com filhos `inline-block` versus um elemento `inline-block` solto), o alinhamento vertical das tags sofria uma variação sutil de 1 a 2 pixels no eixo vertical ("um pouco deslocada").

### Solução Aplicada
1. **Função Unificada `buildTagsGroupElement` (`renderer/js/app.js`)**:
   - Criado gerador único de grupo de tags que reúne as 3 tags (`serviceTag`, `hosterTag` e `folderTypeTag`) dentro de um único contêiner flexbox (`.unified-tags-group`).
   - Todas as tags filhas possuem `height: 20px` (ou `18px` em tabelas), `display: inline-flex`, `align-items: center`, `line-height: 1`, `margin: 0` e são separadas por um espaçamento horizontal idêntico e consistente de `gap: 5px`.
   - A margem para o título do arquivo (`nameSpan`) é aplicada apenas uma vez no final do contêiner (`margin-right: 8px`).
2. **Blindagem CSS (`renderer/css/style.css`)**:
   - Adicionadas regras para `.unified-tags-group` e `.unified-tags-group > span` com `vertical-align: middle !important` e `margin: 0 !important`, assegurando simetria milimétrica e perfeito nivelamento visual.

---

## Bug 34: Padronização Ortográfica e Visual da Tag Multimídia (.video para .Vídeo)

### Causa Raiz Identificada e Corrigida
- A tag de arquivos multimídia estava cadastrada em minúsculas e sem acentuação gráfica (`.video`), destoando do padrão estilístico das demais tags de extensão do sistema (`.Zip`, `.Rar`, `.Torrents`).

### Solução Aplicada
1. **Atualização em `renderer/js/app.js`**:
   - As funções `getFileTypeTag` e `getFolderTypeTag` agora retornam `{ text: '.Vídeo', ... }`.
2. **Atualização em `renderer/index.html`**:
   - Atualizados os botões de filtro, textos e placeholders do sistema para `.Vídeo`.

---

## Recurso 35: Extensão Oficial do Navegador (Chrome / Brave / Edge), Bridge Server Local, HUD Flutuante Circular e Telemetria Analítica no Google Drive

### Componentes Desenvolvidos e Integrados
1. **Extensão Chromium Manifest V3 (`extension/`)**:
   - **Arquitetura Dual (Standalone vs Portable Bridge)**: Opera tanto isoladamente no navegador (usando `chrome.downloads`) quanto integrada via HTTP Loopback (`127.0.0.1:41523`) ao Nexus Downloader Portable para aceleração multithread máxima.
   - **HUD Flutuante Circular na Página**:
     - *Modo Compacto Padrão (~48px)*: Exibe dados reais na frente (`⚡ 24.5M` ou `✓`), anel de progresso SVG neon no contorno interno e logotipo oficial do Nexus Downloader como background translúcido (18% de opacidade).
     - *Modo Expandido Detalhado (~130px)*: Ao clicar no círculo, exibe dados completos (`25/25`, `✨ Concluído!`, tags `[GoFile]` e `[.Vídeo]`, e botão `📂 Abrir Pasta`).
     - *Controles no Hover*: Ao passar o mouse na versão expandida, revela botões de minimizar (`–`) e fechar (`✕`).
     - *Arrastável (Drag & Drop)*: O usuário pode posicionar o HUD livremente em qualquer lugar da tela.
   - **Popup Oficial da Barra de Ferramentas (`popup.html`)**:
     - Design Dark Obsidian com logotipo oficial vetorial.
     - Indicador de status de conexão com o Bridge Desktop.
     - Switch `👁️ Restaurar HUD na Página` para reexibir o ícone caso o usuário tenha fechado.
     - Seletor rápido dos 4 modos de monitoramento.
     - Botão `⬇️ Baixar pelo Nexus Downloader`.
   - **Página de Opções Integrada (`options.html`)**:
     - Interface completa espelhando os ajustes do Nexus Downloader para configuração de chaves Torbox, motores de download, modos de monitoramento e telemetria.

2. **Bridge Server Local Desktop (`bridge-server.js`)**:
   - Roda em `127.0.0.1:41523` com rotas REST (`/api/status`, `/api/queue/add`, `/api/settings`, `/api/open-download-dir`).
   - Permite à extensão delegar downloads pesados com velocidade máxima e abrir as pastas dos arquivos no Windows Explorer.

3. **Telemetria Analítica & Google Drive (`telemetry-manager.js`)**:
   - Coleta os 6 dados vitais de cada download: (1) Link original, (2) Total de arquivos, (3) Rota/mecanismo utilizado, (4) Taxa de conclusão e diagnóstico de erros, (5) Provedor responsável, (6) Tipo de arquivo e velocidade média em MB/s.
   - Gravação local em JSON diário e sincronização automática com a pasta `"Nexus Downloader Logs"` no Google Drive do usuário.

4. **Integração na Interface de Ajustes do Nexus Downloader (`renderer/index.html` e `renderer/js/app.js`)**:
   - Botão `⚡ Instalar Extensão no Navegador com 1 Clique` (abre a pasta no Explorer e exibe guia passo a passo).
   - Seletor do Modo de Monitoramento da Extensão.
   - Switch de ativação de Telemetria e botão de sincronização manual com o Google Drive.

---

## Bug 36: Congelamento da Navegação por Abas (Downloads, Torbox e Ajustes Inacessíveis) por Chave Não Fechada em `renderer/js/app.js`

### Causa Raiz Identificada e Corrigida
1. **Chave de Bloco Ausente (`SyntaxError: Unexpected end of input`)**:
   - Na inserção do botão `btnOpenTelemetryFolder`, a chave de fechamento `}` do bloco condicional `if (settingTelemetryEnabled) { ... }` na linha 866 foi suprimida.
   - Isso fez com que o motor Chromium do Electron acusasse `SyntaxError` durante a interpretação inicial do arquivo `renderer/js/app.js`.
   - Com o erro de sintaxe em tempo de parse, a execução do script foi interrompida, impedindo o registro dos listeners de clique nos botões da barra lateral (`navItems.forEach(...)`), tornando as abas **Downloads**, **Torbox** e **Ajustes** inacessíveis.

### Solução Aplicada
1. **Restauração da Chave em `renderer/js/app.js`**:
   - Adicionada a chave de fechamento `}` correspondente ao bloco `if (settingTelemetryEnabled)`.
2. **Auditoria de Integridade**:
   - Executada ferramenta de balanceamento sintático de chaves `{}` e parênteses `()` com contagem zerada de pendências.
   - Executada verificação estática com `node -c` em todos os 84 arquivos JavaScript do projeto, com 100% de aprovação (0 erros).

---

## Bug 37: Refinamento Completo da Extensão Chromium (Desktop Bridge Scanner, Toggle "Baixar Somente pela Extensão", HUD Circular Sem Sobreposição, Contador X/Y e Abas da Tela de Opções)

### Causas Raízes Identificadas e Corrigidas
1. **Detecção Incompleta de Arquivos e Download Falho via Bridge**:
   - `content.js` apenas buscava `<a href>` estáticos na página. Em serviços com carregamento dinâmico (GoFile, Bunkr, etc.), nenhum link direto existia no HTML e a extensão gerava 1 item fictício com a própria URL da página.
   - No `main.js`, `addItemsToQueue` recebia essa URL e a adicionava diretamente à fila sem chamar o scanner nativo (`scanSingleUrl`), tentando baixar a página HTML em vez dos arquivos reais.
   - **Solução**: Implementado o endpoint `POST /api/scan` no `bridge-server.js` conectando à função `scanSingleUrl(url)`. No `main.js`, o `addItemsToQueue` agora detecta links de hosters e expande automaticamente todas as mídias/arquivos reais para a fila com nomes, tamanhos e tokens diretos. Além disso, o `content.js` e o `popup.js` realizam consulta via `SCAN_PAGE_URL` para mostrar imediatamente a contagem real de arquivos.

2. **Toggle Button Dedicado "Baixar Somente pela Extensão"**:
   - Criado switch intuitivo tanto no Popup quanto na página de Configurações (`options.html`):
     - **Ligado (ON)**: Baixa diretamente pelo navegador (Motor do Navegador / Standalone).
     - **Desligado (OFF)**: Envia para o Nexus Downloader Portable (Desktop Bridge).
   - O texto do botão se adapta dinamicamente em tempo real:
     - Standalone: `"⬇️ Iniciar Download"`
     - Desktop Bridge: `"⬇️ Baixar pelo Nexus Downloader"`

3. **Sobreposição e Falta de Espaço no HUD Circular Expandido**:
   - O diâmetro anterior de 130px comprimia o status, contador, tags e botão de download, gerando sobreposições.
   - **Solução**: Diâmetro expandido para 168px com espaçamento flexbox vertical proporcional (`gap: 4px`), paddings de 14px e tipografia milimétrica, eliminando qualquer sobreposição.

4. **HUD Compacto: Contador X/Y e Anel de Progresso Perimetral**:
   - O modo pequeno agora exibe a contagem no formato `0/25` ou `2/25` (e o ícone `✓` verde neon ao concluir).
   - A porcentagem interna em texto foi eliminada, e o progresso contínuo é desenhado pelo anel SVG neon perimetral (`stroke-dashoffset`).

5. **Abas Inacessíveis nas Configurações da Extensão (`options.html`)**:
   - Os links da barra lateral utilizavam rolagem de página que falhava na interface de janela única.
   - **Solução**: Implementado sistema de abas independentes (`.tab-section` ativa/inativa), permitindo alternar instantaneamente entre **Geral**, **Provedores & Torbox**, **Monitoramento** e **Telemetria & Logs**.
   - Adicionado botão funcional de teste de API Key do Torbox e visualização da pasta local de telemetria.

---

## Bug 38: Janela de Gerenciamento de Downloads In-Page (Estilo Portable Desktop) e Popup de Confirmação de Reinício de Download

### Causas Raízes e Requisitos Solicitados
1. **Janela de Gerenciamento de Downloads In-Page (Estilo Sessão Downloads Portable)**:
   - O usuário solicitou que clicar no texto `0/1` / `X/Y` do HUD compacto (`#nexus-compact-data`), bem como na opção `⚡ Baixando...` (`#nexus-exp-status`) ou no contador (`#nexus-exp-counter`) do HUD expandido, abrisse uma janela in-page no estilo da sessão de Downloads do Nexus Downloader portable.
   - A janela precisava apresentar layout adaptado com a mesma identidade visual Dark Obsidian Glass (`#060810`, gradiente ciano-violeta, verde neon e marca d'água oficial), contendo:
     - Resumo de métricas no topo: Velocidade global em tempo real (MB/s), progresso do lote (`X de Y`), status do download e barra de progresso linear com brilho neon.
     - Barra de ferramentas: Abas de filtro (`Todos`, `Baixando`, `Concluídos`), botão `📂 Abrir Pasta` e botão `🔄 Reiniciar Lote`.
     - Lista de arquivos detalhada: Cartões individuais com ícone de mídia, nome com tooltip, tamanho em bytes formatado, tags de tipo e provedor (`[GoFile]`, `[.Vídeo]`), barra de progresso individual neon (0-100%) e status detalhado (`⚡ Baixando 45%`, `✓ Concluído`, `⏳ Na Fila`, `❌ Falha`).
     - Atualização em tempo real sincronizada tanto no modo Desktop Bridge quanto no Motor do Navegador (Standalone).

2. **Popup de Confirmação para Reinício de Download Ativo**:
   - O usuário solicitou que, ao clicar novamente no botão de download ("Iniciar Download" / "Baixar Lote") quando o download já estiver em andamento, não seja disparado um download duplicado diretamente.
   - Em vez disso, deve ser exibido um popup/modal de confirmação no estilo Dark Obsidian Glass com ícone de alerta `⚠️`:
     - Título: *"Reiniciar Download?"*
     - Mensagem: *"O download do lote já está em andamento. Deseja interromper e reiniciar os downloads do início?"*
     - Botão Secundário: *"Continuar Baixando"* (cancela o popup e mantém o download ativo sem interrupções).
     - Botão Primário: *"Sim, Reiniciar"* (reinicia o lote e atualiza o progresso do HUD).

### Solução Aplicada
1. **Estilos Visuais de Alta Fidelidade (`content.css`)**:
   - Implementadas regras para `#nexus-manager-overlay` e `.nexus-manager-card` com backdrop blur de 12px, saturação de 160%, borda ciano-violeta com glow e painel de resumo de downloads ativos.
   - Implementadas regras para `#nexus-confirm-overlay` e `.nexus-confirm-card` com animação de pulso no ícone de alerta (`⚠️`) e botões de ação destacados em âmbar/vermelho e cinza translúcido.
   - Adicionados cursores clicáveis (`cursor: pointer`), efeitos de hover com leve escala (`transform: scale(1.06)`) e glow nos elementos `#nexus-compact-data`, `#nexus-exp-status` e `#nexus-exp-counter`.

2. **Lógica de Interação e Gerenciamento In-Page (`content.js`)**:
   - Conectados os eventos de clique nos elementos do HUD para abrir o gerenciador:
     - No modo compacto: clique em `#nexus-compact-data` (se ativo ou concluído, abre o gerenciador; se ocioso, expande o HUD).
     - No modo expandido: clique em `#nexus-exp-status` ou `#nexus-exp-counter` abre o gerenciador.
   - Interceptado o clique de `#nexus-btn-action` e `#nexus-btn-confirm-download`: se o download estiver ativo, invoca `showRestartConfirmModal` para confirmar reinício.
   - Implementada a função `showDownloadManagerModal()` com renderização dinâmica dos dados, abas de filtro (`all`, `downloading`, `completed`), ações na toolbar e polling periódico a cada 800ms.
   - Implementada a função `showRestartConfirmModal(onConfirm)` e `restartCurrentDownload()`.
   - Implementada a função `updateDownloadManagerUI()` que recalcula as estatísticas, preenche a barra linear e renderiza as barras de progresso individuais de cada arquivo.

3. **Transmissão Granular de Itens e Velocidade no Service Worker (`background.js`)**:
   - Implementado `startBridgePolling(tabId, totalItems)` que consulta periodicamente o Desktop Bridge (`GET /api/status`) e notifica a aba via `DOWNLOAD_PROGRESS` com a lista `items` e a velocidade em MB/s.
   - No motor do navegador (`chrome.downloads`), implementado rastreamento por arquivo em `activeBrowserDownloads`, calculando progresso percentual individual por `bytesReceived / totalBytes` e velocidade dinâmica da sessão.
   - Atualizado o manipulador `GET_ACTIVE_DOWNLOAD_PROGRESS` para fornecer os dados individuais tanto no modo bridge quanto standalone.

5. **Refinamento Visual Definitivo do HUD e Eliminação de Sobreposições**:
   - Redimensionado o diâmetro expandido para **184px** com espaçamento proporcional (`padding: 16px 14px; gap: 3px`).
   - Reduzida a opacidade do logotipo oficial de fundo no modo expandido para **0.05** (`.nexus-floating-hud.expanded .nexus-hud-bg-logo`), eliminando qualquer colisão ou interferência das linhas da seta e da nuvem com os números `0/1`, status e badges.
   - Adicionado `text-shadow: 0 2px 6px rgba(0,0,0,0.9)` nos textos para legibilidade cristalina.
   - Substituído o botão inferior durante o download ativo por **`📊 Ver Downloads`** (com padding e largura contida de 154px), que ao ser clicado abre diretamente o Gerenciador de Downloads In-Page.

---

## Bug 39: Refinamento do HUD Compacto (Velocidade + Contador), Eliminação de Sobreposição Visual no HUD Expandido, Bloco Unificado Interativo e Opções de Limpeza na Janela de Downloads

### Causas Raízes e Requisitos Solicitados
1. **Opções de Limpar Lista de Concluídos e Cancelar/Limpar Baixando**:
   - Na janela modal do Gerenciador de Downloads In-Page, a aba "Concluídos" não possuía opção para limpar os downloads finalizados, e a aba "Baixando" não possuía ação para cancelar/limpar os downloads ativos.
2. **Ícone Pequeno (Modo Compacto) com Velocidade em MB/s junto do Contador `0/1`**:
   - No círculo pequeno do HUD compacto, faltava exibir a velocidade em MB/s em conjunto com a contagem de arquivos baixados (`0/1` ou `2/25`), mantendo o anel SVG perimetral neon desenhando a progressão contínua ao redor da borda.
3. **Ícone Grande (Modo Expandido) com Linhas do Logo Sobrepostas aos Textos**:
   - O logotipo vetorial de fundo (traçado da nuvem e da seta vertical) cruzava visualmente por trás de `1 Arquivo(s)` e das tags `[MediaFire] [.Zip]`, poluindo a interface.
   - Os botões flutuantes de hover (`–` e `✕`) no topo estavam posicionados muito baixos (`top: -14px`), colidindo diretamente com o ponto de início luminoso e com a borda do anel perimetral SVG.
4. **Unificação dos Elementos "Em Espera" e "1/1 Arquivo(s)" em um Único Bloco Interativo**:
   - No HUD expandido, os textos de status e contagem eram elementos separados com hovers individuais desarticulados. O usuário solicitou que ambos fossem um único elemento na interface, com hover unificado e clique abrindo o Gerenciador de Downloads In-Page.

### Soluções Aplicadas
1. **Gerenciador de Downloads In-Page com Ações de Limpeza (`content.js`, `content.css`, `background.js`, `bridge-server.js`)**:
   - Adicionados botões dedicados na barra de ferramentas da janela:
     - `🧹 Limpar Concluídos` (estilo roxo neon translúcido): visível quando na aba "Concluídos" (ou na aba "Todos" havendo itens concluídos). Ao clicar, despacha `CLEAR_COMPLETED_DOWNLOADS`, remove os itens concluídos e atualiza os contadores.
     - `⏹️ Cancelar` (estilo vermelho neon translúcido): visível quando na aba "Baixando" (ou na aba "Todos" havendo downloads em curso). Ao clicar, despacha `CANCEL_ACTIVE_DOWNLOADS`, cancela os downloads ativos e atualiza a interface.
   - Adicionado botão individual `✕` (`.nexus-item-btn-remove`) em cada cartão de arquivo para remoção pontual.
   - No `bridge-server.js` e `main.js`, adicionados os endpoints `POST /api/queue/clear-completed` e `POST /api/queue/cancel-all`.
2. **Ícone Compacto Redesenhado com Velocidade + Contador (`content.js`, `content.css`)**:
   - Redimensionado o HUD compacto para **58px x 58px**, permitindo espaçamento e legibilidade perfeitos.
   - Criado o contêiner `.nexus-compact-stack` contendo:
     - Linha 1 (Velocidade): `.nexus-compact-speed-val` com fonte 8.5px bold ciano neon e sombra escura.
     - Linha 2 (Contador): `.nexus-compact-count-val` com fonte 11px bold branca nítida (`0/1`, `2/25`, etc.).
   - O anel perimetral SVG (`#nexus-ring-bar`) traça suavemente o percentual ao redor da borda com gradiente ciano neon.
   - Ao concluir, o stack é substituído pelo ícone de checkmark verde neon `✓` (`#nexus-compact-check`) com anel 100% esmeralda.
3. **Eliminação Completa da Sobreposição no HUD Expandido (`content.css`)**:
   - Ocultado 100% o logotipo vetorial de fundo quando em modo expandido (`.nexus-floating-hud.expanded .nexus-hud-bg-logo { display: none !important; }`), garantindo fundo Obsidian puro translúcido com blur e legibilidade cristalina sem nenhuma linha cruzando o texto.
   - Reposicionados os botões de hover `–` e `✕` para `top: -28px; z-index: 25;`, afastando-os completamente da borda do anel perimetral e do ponto luminoso superior.
4. **Bloco Unificado no HUD Expandido (`content.js`, `content.css`)**:
   - Criado o contêiner `.nexus-exp-header-group` englobando status (`⚡ Em Espera` / `⚡ Baixando...`), checkmark, contador (`1 Arquivo(s)`) e subtítulo.
   - Ao passar o mouse sobre essa área, o bloco inteiro reage como um único cartão sofisticado com borda ciano neon (`rgba(0, 242, 254, 0.35)`), fundo sutil e sombra perimetral suave.
   - Ao clicar em qualquer parte desse bloco, abre imediatamente a Janela de Gerenciamento de Downloads In-Page.
5. **Versão do Manifesto Bumpada para `1.3.2`**:
   - Arquivos espelhados e validados em `extension/` e `extension/Nexus Downloader/`.

---

## Bug 40: Gerenciador de Downloads Completo com 4 Abas, Subbar Dinâmica, Modo Standalone Autônomo, Aba Torbox Cloud e Indicador "Navegador Conectado" no Desktop

### Causas Raízes e Requisitos Solicitados
1. **Fluxo Incorreto no Botão "Iniciar Download"**:
   - Ao clicar em "Iniciar Download" (no HUD ou no Modal de Seleção), o sistema abria indevidamente a pasta do Windows Explorer em vez de abrir imediatamente a Janela do Gerenciador de Downloads In-Page.
2. **Falha na Identificação e Download no Modo Standalone ("Baixar Somente pela Extensão")**:
   - Quando o Nexus Desktop Portable não estava em execução ou a opção de baixar somente pelo navegador estava ativada, a extensão não conseguia detectar arquivos em pastas do MediaFire nem resolver URLs diretas de CDN (baixava páginas HTML ou links nulos).
3. **Falta do Indicador de Navegador Conectado no Desktop Portable**:
   - No rodapé do Nexus Desktop Portable existiam os badges da Google Drive API e Torbox API, mas faltava o badge do "Navegador Conectado" para sinalizar em tempo real que a extensão está sincronizada com o app desktop.
4. **Abertura Conjunta ao Clicar no Ícone da Barra de Tarefas/Ferramentas**:
   - Ao clicar no ícone do Nexus Downloader no navegador, o usuário solicitou que, além do popup da extensão, fosse aberta simultaneamente a Janela In-Page do Gerenciador de Downloads na página web ativa.
5. **Reestruturação Completa do Gerenciador de Downloads In-Page**:
   - **Persistência de Aba**: Ao fechar e reabrir a janela, o gerenciador deve manter exatamente a mesma aba ativa em que o usuário estava (ex: se estava na aba Torbox, reabrir na aba Torbox).
   - **4 Abas**: `Todos`, `Baixando`, `Concluídos` e `Torbox Cloud`.
   - **Aba "Todos"**: Checkboxes de seleção, botão `📋 Copiar Link do Álbum / Site`, botão `🧹 Limpar Lista`, tags reais do provedor (`[MediaFire]`, `[GoFile]`, etc.) + tag `[Web]`.
   - **Aba "Baixando"**: Remoção da opção "Reiniciar Lote" do cabeçalho superior (mantendo apenas "Abrir Pasta") e adição de sub-barra com:
     - Checkbox "Selecionar Todos"
     - `⏸️ Pausar Todos` / `⏸️ Pausar (X)`
     - `▶️ Retomar Todos os Downloads` / `▶️ Retomar 1 Download` / `▶️ Retomar (X) Downloads` (quando houver itens pausados)
     - `🔄 Reiniciar Todos` / `🔄 Reiniciar (X)`
     - `🧹 Limpar Baixando`
   - **Aba "Concluídos"**: Sub-barra com:
     - Checkbox "Selecionar Todos"
     - `🔄 Baixar Novamente (X)`: ícone correspondente, contagem `(X)` e clicável **apenas** quando houver itens selecionados (ficando cinza/desabilitado se nada estiver selecionado).
     - `🗑️ Deletar (X)`: ícone correspondente, contagem `(X)` e clicável **apenas** quando houver itens selecionados.
     - `🧹 Limpar Concluídos`: botão de limpeza geral da lista de concluídos.
   - **Aba "Torbox Cloud"**: Listagem dos downloads e arquivos da conta Torbox na nuvem, similar à versão mobile, com barra de progresso, velocidade, status e botão de download direto via navegador.
   - **Botões Individuais em Cada Cartão de Arquivo**: Adicionados `📋` (Copiar Link Original/CDN), `🔗` (Abrir no Navegador em nova aba) e `✕` (Remover da lista).
   - **Regra de Ouro do Isolamento de Limpeza**: Limpar a lista na extensão é **estritamente local ao navegador** e **NUNCA apaga** a fila de downloads do Nexus Desktop Portable no PC.

### Soluções Aplicadas
1. **Correção do Clique em "Iniciar Download" (`content.js`)**:
   - Refatorada a ação de `btnAction`: a chamada a `OPEN_DOWNLOAD_FOLDER` agora só ocorre se o texto do botão for explicitamente `📂 Abrir Pasta`.
   - Quando o texto for `⬇️ Iniciar Download` ou `⬇️ Baixar pelo Nexus Downloader`, o download é iniciado imediatamente e a janela do Gerenciador de Downloads (`showDownloadManagerModal()`) é aberta na tela de forma fluida.
   - No modal de confirmação de seleção, o clique em `nexus-btn-confirm-download` também abre o Gerenciador de Downloads In-Page logo após disparar os downloads.
2. **Motor Standalone Autônomo e Scanners Client-Side (`content.js`, `background.js`)**:
   - No `content.js`: implementado scanner nativo para pastas do MediaFire (`/folder/{key}`) consumindo a API pública `https://www.mediafire.com/api/1.4/folder/get_content.php`, capturando todos os arquivos com nomes e tamanhos reais.
   - Para arquivos únicos do MediaFire, adicionado scanner do botão `#downloadButton` com re-verificação assíncrona após 1.2s.
   - No `background.js`: implementada a função assíncrona `resolveDirectDownloadUrl(item)`, que realiza fetch com resolução de CDN para MediaFire (`href="https://download....mediafire.com/..."`) e Bunkr antes de despachar para `chrome.downloads.download`.
3. **Indicador "Navegador Conectado" no Desktop Portable (`renderer/index.html`, `renderer/js/app.js`, `bridge-server.js`, `main.js`, `preload.js`)**:
   - Em `renderer/index.html`: adicionado o badge `#browser-status-badge` no rodapé `.main-footer-status` ao lado do Google API e Torbox API.
   - Em `bridge-server.js`: adicionado rastreamento de `lastActivityTime` em todas as requisições e exportada a função `getBridgeActivity()`.
   - Em `main.js` e `preload.js`: registrado canal IPC `get-bridge-status` e exposta a API `window.api.getBridgeStatus()`.
   - Em `renderer/js/app.js`: atualizado `updateFooterStatus()` para checar a atividade da ponte a cada ciclo e atualizar o badge dinamicamente (ponto verde ciano + texto `Navegador: Conectado` se houver atividade nos últimos 45s; cinza `Navegador: Desconectado` se inativo).
4. **Disparo Conjunto ao Clicar no Ícone da Extensão (`popup.js`, `content.js`)**:
   - Ao abrir o popup da extensão, é enviada a mensagem `{ action: 'SHOW_DOWNLOAD_MANAGER' }` para a aba ativa, exibindo o Gerenciador de Downloads In-Page na página.
   - Adicionado listener de `SHOW_DOWNLOAD_MANAGER` em `content.js`.
5. **Gerenciador de Downloads In-Page Modernizado (`content.js`, `content.css`)**:
   - **Persistência da Aba**: Leitura e gravação de `localStorage.getItem('nexus_mgr_active_tab')` e `localStorage.setItem('nexus_mgr_active_tab', activeManagerFilter)`.
   - **Sub-barras Contextuais**: Criado elemento `.nexus-manager-subbar` renderizado dinamicamente de acordo com a aba ativa (`all`, `downloading`, `completed`, `torbox`).
   - **Controles Dinâmicos com Contadores `(X)`**:
     - Em `completed`: `🔄 Baixar Novamente (X)` e `🗑️ Deletar (X)` utilizam `:disabled` quando `selectedVisibleCount === 0`, ativando-se dinamicamente conforme os cards são marcados.
     - Em `downloading`: `⏸️ Pausar Todos / (X)`, `▶️ Retomar Todos os Downloads / (X)` e `🔄 Reiniciar Todos / (X)` recalculam em tempo real.
     - Em `all`: botões `📋 Copiar Link do Álbum / Site` e `🧹 Limpar Lista`.
     - Em `torbox`: integração com a API `https://api.torbox.app/v1/api/torrents/mylist`, listando transferências da nuvem com suporte a download direto via zip/stream.
   - **Cartões de Arquivo**: Checkbox individual com sincronização via `selectedItemIds`, botões `📋 Copiar Link`, `🔗 Abrir Página` e `✕ Remover`.
   - **Isolamento de Limpeza Garantido**: Removida a chamada a `/api/queue/clear-completed` do `clearCompletedDownloads()` no `background.js`. A limpeza na extensão atua estritamente em `currentDownloadItems` e `activeBrowserDownloads`, **sem tocar na fila do Nexus Desktop Portable no PC**.
6. **Bump de Versão**:
   - Versão atualizada para `1.3.3` em `extension/Nexus Downloader/manifest.json` e espelhada para `extension/`.
   - 88 arquivos JS auditados com 0 erros de sintaxe.

