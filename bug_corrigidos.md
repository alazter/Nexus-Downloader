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
