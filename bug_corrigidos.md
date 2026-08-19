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

