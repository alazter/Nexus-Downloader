# Google Drive Sequential Downloader (Electron)

Este é um aplicativo desktop independente, desenvolvido em Electron, projetado especificamente para baixar arquivos e pastas do Google Drive de forma sequencial (um por vez por padrão), evitando a compactação zip chata do site do Google Drive e sem sobrecarregar a taxa de escrita do seu HD.

## ⚙️ Configuração da Conta Google (Passo a Passo)

Para baixar arquivos privados ou usufruir de cotas de download ilimitadas da sua conta Premium, você precisa conectar sua conta do Google através da API oficial.

Siga os passos rápidos abaixo para obter seu arquivo de credenciais:

1. **Acesse o Google Cloud Console**:
   Entre com sua conta Google em [console.cloud.google.com](https://console.cloud.google.com/).
2. **Crie um Projeto**:
   Clique no menu de seleção de projetos no topo esquerdo e clique em **Novo Projeto**. Dê um nome de sua escolha e crie-o.
3. **Ative a API do Google Drive**:
   - No menu lateral, acesse **APIs e Serviços** > **Biblioteca**.
   - Digite "Google Drive API" na barra de busca.
   - Clique no resultado e depois no botão **Ativar**.
4. **Configure a Tela de Consentimento OAuth**:
   - Acesse **Tela de consentimento OAuth** no menu esquerdo.
   - Escolha o tipo de usuário **Externo** e clique em **Criar**.
   - Preencha as informações obrigatórias (Nome do App, E-mail do desenvolvedor e E-mail de suporte).
   - Avance até a seção **Usuários de teste** (Test Users).
   - **IMPORTANTE**: Clique em **Add Users** e adicione o seu e-mail do Google Drive (o e-mail que você deseja usar para baixar). Avance e salve.
5. **Crie as Credenciais**:
   - Acesse a aba **Credenciais** no menu esquerdo.
   - Clique no botão **+ Criar Credenciais** no topo e selecione **ID do cliente OAuth**.
   - No campo *Tipo de aplicativo*, escolha **Aplicativo de Desktop**.
   - Dê um nome (ex: "Drive Downloader") e clique em **Criar**.
6. **Baixe o arquivo JSON**:
   - Na lista de IDs de cliente OAuth criados, clique no ícone de download (Seta para baixo) ao lado da credencial criada para baixar o arquivo JSON.
   - Renomeie o arquivo baixado para `credentials.json`.
7. **Importe no App**:
   - Abra o aplicativo, vá na aba **Ajustes**.
   - Arraste o arquivo `credentials.json` para a área pontilhada (ou clique nela para selecionar o arquivo).
   - Clique em **Conectar Conta Google** e faça login no seu navegador. Pronto!

---

## 💎 Recursos Principais

- **Download Sequencial**: Baixa rigorosamente 1 arquivo por vez (ou até 3, configurável nos Ajustes) para proteger seu HD físico ou SSD.
- **Estrutura de Pastas Preservada**: Ao colar um link de pasta, o aplicativo escaneia recursivamente todas as subpastas e recria exatamente a mesma árvore de arquivos localmente na sua pasta de salvamento.
- **Scanner Inteligente**: O app monitora sua área de transferência (clipboard) enquanto está na aba do Scanner. Ao copiar um link do Drive, ele é preenchido automaticamente!
- **Download Direto por Stream**: Os downloads são feitos em chunks direto da rede para a escrita em disco, minimizando o uso de memória RAM.
- **Notificações Nativas**: O app envia um balão de notificação no Windows para avisar quando todos os downloads da fila forem concluídos.

---

## 📄 Licença

Este projeto está licenciado sob a licença **GNU General Public License v3.0 (GPL-3.0)**. Consulte o arquivo [LICENSE](LICENSE) para obter mais detalhes.

