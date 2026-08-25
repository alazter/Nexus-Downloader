const { app, BrowserWindow, ipcMain, shell, dialog, Notification, powerSaveBlocker, Menu, Tray, nativeImage } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const url = require('url');
const { google } = require('googleapis');
const { isBunkrUrl, scanBunkrLink, resolveBunkrDirectUrl } = require('./bunkr-scanner');
const { isMediaFireUrl, scanMediaFireLink, resolveMediaFireDirectUrl } = require('./mediafire-scanner');
const { isTeraBoxUrl, scanTeraBoxLink, resolveTeraBoxDirectUrl } = require('./terabox-scanner');
const { isOneDriveUrl, scanOneDriveLink, resolveOneDriveDirectUrl } = require('./onedrive-scanner');
const { isTorboxUrl, scanTorboxLink, resolveTorboxDirectUrl, testTorboxApiKey, fetchTorboxUserDownloads, getTorboxActiveCloudJobsCount, waitForTorboxSlot } = require('./torbox-scanner');
const { isDrimeUrl, scanDrimeLink } = require('./drime-scanner');
const { isTurboUrl, scanTurboLink, resolveTurboDirectUrl } = require('./turbo-scanner');
const { scanGenericLink } = require('./generic-scanner');
const { isSendUrl, scanSendLink, resolveSendDirectUrl } = require('./send-scanner');

// Desativa o congelamento de processos/rede do Chromium em segundo plano quando os monitores desligam
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

// Captura exceções não tratadas (ex: socket drops como ECONNRESET) para evitar janelas de erro nativas do sistema
process.on('uncaughtException', (err) => {
  console.error('[Uncaught Exception Intercepted]:', err.message || err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Unhandled Rejection Intercepted]:', reason);
});

// Agente HTTPS customizado com Keep-Alive ativado para reutilização extrema de conexões TCP/TLS
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 128,          // Permite até 128 sockets paralelos
  keepAliveMsecs: 30000,    // Mantém as conexões ativas por 30 segundos
  freeSocketTimeout: 30000, // Timeout de sockets ociosos
  timeout: 60000            // Timeout de conexão geral
});

// Tabela em memória de subdomínios Bunkr marcados como off-line/sem resposta (adaptado do BunkrDownloader 1.3.0)
const offlineBunkrSubdomains = new Set();

// Blocker de suspensão de energia do sistema operacional
let activePowerSaveBlockerId = null;

function startPowerSaveBlocker() {
  if (activePowerSaveBlockerId === null) {
    activePowerSaveBlockerId = powerSaveBlocker.start('prevent-app-suspension');
    console.log('Power save blocker iniciado. Impedindo suspensao do sistema durante os downloads...');
  }
}

function stopPowerSaveBlocker() {
  if (activePowerSaveBlockerId !== null) {
    powerSaveBlocker.stop(activePowerSaveBlockerId);
    activePowerSaveBlockerId = null;
    console.log('Power save blocker parado. Sistema livre para suspender.');
  }
}

// Inicialização de caminhos de configuração
const USER_DATA_PATH = app.getPath('userData');
const CONFIG_FILE = path.join(USER_DATA_PATH, 'config.json');
const CREDENTIALS_FILE = path.join(USER_DATA_PATH, 'credentials.json');
const TOKEN_FILE = path.join(USER_DATA_PATH, 'token.json');
const QUEUE_FILE = path.join(USER_DATA_PATH, 'queue.json');

// Estado Global da Aplicação
let mainWindow = null;
let oauthServer = null;
let driveService = null;
let oauth2Client = null;

// Configurações Padrão
let config = {
  downloadPath: path.join(app.getPath('downloads'), 'GoogleDriveDownloads'),
  maxConcurrent: 1,
  notificationsEnabled: true,
  enableMultilinkAuditAlerts: true,
  showStartDownloadPopup: true,
  minimizeToTray: false,
  downloadMode: 'single', // Legado
  torboxApiKey: '',
  torboxEnabled: false,
  windowState: {
    width: 1080,
    height: 720,
    x: undefined,
    y: undefined,
    isMaximized: false
  },
  downloadModes: {
    gdrive: 'single',
    bunkr: 'multi',
    mediafire: 'multi',
    terabox: 'multi',
    onedrive: 'single',
    torbox: 'multi',
    drime: 'multi',
    turbo: 'multi',
    send: 'multi',
    pixeldrain: 'multi',
    mega: 'multi',
    '1fichier': 'multi'
  },
  torboxForServices: {
    gdrive: false,
    bunkr: false,
    mediafire: false,
    terabox: false,
    onedrive: false,
    torbox: true,
    drime: false,
    turbo: false,
    send: true,
    pixeldrain: true,
    mega: true,
    '1fichier': true
  },
  serviceMaxConcurrent: {
    gdrive: 1,
    bunkr: 1,
    mediafire: 1,
    terabox: 1,
    vik1ngfile: 1,
    drime: 1,
    turbo: 1,
    pixeldrain: 1,
    gofile: 1,
    torbox: 3
  }
};

function getDownloadMode(service) {
  if (config.downloadModes && config.downloadModes[service]) {
    return config.downloadModes[service];
  }
  return config.downloadMode || 'single';
}

function isTorboxEnabledForService(service) {
  if (!config.torboxEnabled || !config.torboxApiKey || config.torboxApiKey.trim().length === 0) {
    return false;
  }
  if (!service) return true;
  const s = service.toLowerCase();
  if (config.torboxForServices && config.torboxForServices[s] !== undefined) {
    return !!config.torboxForServices[s];
  }
  return true;
}

// Carregar configurações salvas
if (fs.existsSync(CONFIG_FILE)) {
  try {
    const loaded = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    config = {
      ...config,
      ...loaded,
      downloadModes: {
        ...config.downloadModes,
        ...(loaded.downloadModes || {})
      },
      torboxForServices: {
        ...config.torboxForServices,
        ...(loaded.torboxForServices || {})
      },
      serviceMaxConcurrent: {
        ...config.serviceMaxConcurrent,
        ...(loaded.serviceMaxConcurrent || {})
      }
    };
  } catch (err) {
    console.error('Erro ao ler config.json:', err);
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Criar pasta de download padrão se não existir
if (!fs.existsSync(config.downloadPath)) {
  fs.mkdirSync(config.downloadPath, { recursive: true });
}

// Gerenciador de Fila de Downloads
let downloadQueue = [];
let activeDownloads = new Map(); // fileId -> { request, writeStream, abortController, startTime, lastBytes, speedSamples }

function saveConfig() {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

function saveQueue() {
  try {
    const serialized = downloadQueue.map(item => ({
      id: item.id,
      fileId: item.fileId || null,
      numericId: item.numericId || null,
      isHttpDirect: item.isHttpDirect || (item.id && (item.id.startsWith('send_') || item.id.startsWith('drime_') || item.id.startsWith('turbo_') || item.id.startsWith('terabox_') || item.id.startsWith('mediafire_') || item.id.startsWith('bunkr_') || item.id.startsWith('onedrive_') || item.id.startsWith('torbox_'))),
      sendUrl: item.sendUrl || item.url || item.directUrl || null,
      url: item.url || item.sendUrl || item.directUrl || item.downloadUrl || null,
      directUrl: item.directUrl || item.url || item.sendUrl || item.downloadUrl || null,
      downloadUrl: item.downloadUrl || item.directUrl || item.url || null,
      mediafireUrl: item.mediafireUrl || null,
      teraboxUrl: item.teraboxUrl || null,
      teraboxDlink: item.teraboxDlink || null,
      teraboxCookie: item.teraboxCookie || null,
      name: item.name,
      size: item.size,
      relativePath: item.relativePath,
      folderName: item.folderName || 'Downloads',
      status: item.status === 'downloading' ? 'pending' : item.status,
      completedAt: item.completedAt || null,
      progress: item.status === 'completed' ? 100 : (item.status === 'downloading' ? 0 : (item.progress || 0)),
      downloadedBytes: item.status === 'completed' ? item.size : (item.status === 'downloading' ? 0 : (item.downloadedBytes || 0)),
      error: item.error || null
    }));
    fs.writeFileSync(QUEUE_FILE, JSON.stringify(serialized, null, 2), 'utf-8');
  } catch (err) {
    console.error('Erro ao salvar queue.json:', err);
  }
}

function loadQueue() {
  if (fs.existsSync(QUEUE_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf-8'));
      if (Array.isArray(data)) {
        downloadQueue = data.map(item => {
          let directUrl = item.url || item.directUrl || item.downloadUrl || '';
          let referer = item.referer || null;

          if (item.id && item.id.startsWith('drime_') && !directUrl) {
            const parts = item.id.split('_');
            if (parts.length >= 3) {
              const hash = parts[1];
              const childId = parts[2];
              directUrl = `https://app.drime.cloud/api/v1/shareable-links/${hash}/download?entry_id=${childId}`;
              referer = referer || `https://app.drime.cloud/drive/s/${hash}`;
            }
          }

          const isInvalidUrlErr = (item.error || '').includes('Invalid URL');

          return {
            ...item,
            url: directUrl || item.url || null,
            directUrl: directUrl || item.directUrl || null,
            referer: referer || item.referer || null,
            folderName: item.folderName || 'Downloads',
            status: (item.status === 'downloading' || isInvalidUrlErr) ? 'pending' : item.status,
            error: isInvalidUrlErr ? null : item.error,
            speed: 0,
            eta: 0
          };
        });
        console.log(`Fila persistida carregada com ${downloadQueue.length} itens.`);
      }
    } catch (err) {
      console.error('Erro ao carregar queue.json:', err);
    }
  }
}

// Inicializa a fila salva do disco
loadQueue();

// Criação da janela do Electron
function createWindow() {
  const winState = config.windowState || { width: 1080, height: 720, isMaximized: false };

  const winOptions = {
    width: winState.width || 1080,
    height: winState.height || 720,
    minWidth: 980,
    minHeight: 680,
    frame: true,
    titleBarStyle: 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false // Impede redução de velocidade da rede/timers quando o monitor apaga
    },
    icon: path.join(__dirname, 'renderer', 'icon.png') // Opcional
  };

  if (typeof winState.x === 'number' && typeof winState.y === 'number') {
    winOptions.x = winState.x;
    winOptions.y = winState.y;
  }

  mainWindow = new BrowserWindow(winOptions);

  if (winState.isMaximized) {
    mainWindow.maximize();
  }

  let saveStateTimeout = null;
  const saveWindowState = () => {
    if (!mainWindow) return;
    clearTimeout(saveStateTimeout);
    saveStateTimeout = setTimeout(() => {
      if (!mainWindow) return;
      const isMaximized = mainWindow.isMaximized();
      const bounds = mainWindow.getNormalBounds ? mainWindow.getNormalBounds() : mainWindow.getBounds();
      config.windowState = {
        width: bounds.width,
        height: bounds.height,
        x: bounds.x,
        y: bounds.y,
        isMaximized: isMaximized
      };
      try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
      } catch (e) {}
    }, 500);
  };

  mainWindow.on('resize', saveWindowState);
  mainWindow.on('move', saveWindowState);
  mainWindow.on('maximize', saveWindowState);
  mainWindow.on('unmaximize', saveWindowState);

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.webContents.on('did-finish-load', () => {
    updateQueueUI();
    setTimeout(() => {
      checkUpdatesAutomaticallyOnStartup().catch(err => console.error('[AutoUpdater] Erro no startup check:', err));
    }, 1500);
  });

  mainWindow.on('close', (event) => {
    if (!isAppQuitting && config.minimizeToTray) {
      event.preventDefault();
      mainWindow.hide();
      if (config.notificationsEnabled) {
        try {
          new Notification({
            title: 'Nexus Downloader',
            body: 'O Nexus continuará rodando em segundo plano na bandeja do sistema.'
          }).show();
        } catch (e) {}
      }
      return false;
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

let appTray = null;
let isAppQuitting = false;

function createTray() {
  if (appTray) return;

  let iconPath = path.join(__dirname, 'renderer', 'icon.png');
  if (!fs.existsSync(iconPath)) {
    iconPath = path.join(__dirname, 'renderer', 'assets', 'torbox_box_logo.png');
  }

  try {
    const trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
    appTray = new Tray(trayIcon);
    appTray.setToolTip('Nexus Downloader');

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Abrir Nexus Downloader',
        click: () => {
          if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Sair do Nexus',
        click: () => {
          isAppQuitting = true;
          app.quit();
        }
      }
    ]);

    appTray.setContextMenu(contextMenu);

    const restoreWindow = () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      }
    };

    appTray.on('click', restoreWindow);
    appTray.on('double-click', restoreWindow);
  } catch (err) {
    console.warn('[Tray] Erro ao criar ícone na bandeja do sistema:', err.message);
  }
}

// Configuração do Auto-Updater
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

function setupAutoUpdater() {
  autoUpdater.on('checking-for-update', () => {
    console.log('[AutoUpdater] Verificando atualizações...');
    if (mainWindow) mainWindow.webContents.send('updater-status', { status: 'checking', msg: 'Verificando atualizações...' });
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[AutoUpdater] Nova atualização encontrada:', info.version);
    if (mainWindow) mainWindow.webContents.send('updater-status', { status: 'available', version: info.version, msg: `Nova versão v${info.version} disponível!` });
  });

  autoUpdater.on('update-not-available', () => {
    console.log('[AutoUpdater] Nenhuma atualização disponível.');
    if (mainWindow) mainWindow.webContents.send('updater-status', { status: 'not-available', msg: 'O sistema já está atualizado.' });
  });

  autoUpdater.on('error', (err) => {
    console.error('[AutoUpdater] Erro:', err);
    if (mainWindow) mainWindow.webContents.send('updater-status', { status: 'error', msg: 'Erro ao verificar atualização.' });
  });

  autoUpdater.on('download-progress', (progressObj) => {
    if (mainWindow) {
      const bytesPerSecond = progressObj.bytesPerSecond || 0;
      const mbps = ((bytesPerSecond * 8) / (1024 * 1024)).toFixed(2);
      mainWindow.webContents.send('updater-status', {
        status: 'downloading',
        percent: progressObj.percent.toFixed(1),
        transferred: progressObj.transferred || 0,
        total: progressObj.total || 0,
        bytesPerSecond: bytesPerSecond,
        mbps: mbps
      });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[AutoUpdater] Atualização baixada e pronta para instalar.');
    if (mainWindow) {
      mainWindow.webContents.send('updater-status', {
        status: 'downloaded',
        version: info.version,
        msg: `Versão v${info.version} pronta! Reinicie para instalar.`
      });
    }
  });
}

async function checkUpdatesAutomaticallyOnStartup() {
  console.log('[AutoUpdater] Iniciando verificação automática de atualizações no startup (GitHub API + electron-updater)...');
  const currentVersion = app.getVersion();

  try {
    const release = await fetchLatestGitHubRelease();
    if (release) {
      cachedLatestRelease = release;
      const remoteVersion = release.tag_name || release.name || currentVersion;
      const updateAvailable = isNewerVersion(remoteVersion, currentVersion);

      console.log(`[AutoUpdater] Startup Check: Versão local=v${currentVersion}, Remota=v${remoteVersion.replace(/^v/i, '')}, Disponível=${updateAvailable}`);

      if (updateAvailable) {
        if (Notification.isSupported()) {
          try {
            new Notification({
              title: '⚡ Nexus Downloader',
              body: `Nova versão v${remoteVersion.replace(/^v/i, '')} disponível! Clique para abrir e atualizar.`,
              icon: path.join(__dirname, 'renderer', 'icon.png')
            }).show();
          } catch (e) {}
        }

        const payload = {
          status: 'available',
          updateAvailable: true,
          currentVersion,
          version: remoteVersion.replace(/^v/i, ''),
          title: release.name || `⚡ Nova Versão v${remoteVersion.replace(/^v/i, '')} Disponível`,
          body: release.body || 'Melhorias de desempenho e correções gerais de estabilidade.',
          publishedAt: release.published_at,
          assets: release.assets || [],
          msg: `Nova versão v${remoteVersion.replace(/^v/i, '')} disponível!`
        };

        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('updater-status', payload);
        }
        return;
      }
    }
  } catch (err) {
    console.warn('[AutoUpdater] Startup Check via GitHub Releases falhou:', err.message);
  }

  // Fallback para electron-updater se GitHub API não detectar
  try {
    const result = await autoUpdater.checkForUpdates();
    if (result && result.updateInfo && isNewerVersion(result.updateInfo.version, currentVersion)) {
      console.log('[AutoUpdater] Startup Check via electron-updater: Atualização encontrada:', result.updateInfo.version);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('updater-status', {
          status: 'available',
          version: result.updateInfo.version,
          msg: `Nova versão v${result.updateInfo.version} disponível!`
        });
      }
    }
  } catch (err) {
    console.warn('[AutoUpdater] Startup Check via electron-updater falhou:', err.message);
  }
}

// Inicializa a janela quando o app estiver pronto
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();
  createTray();

  // Tenta inicializar o cliente do Google com credenciais existentes
  initGoogleClient();

  // Configura e verifica atualizações automaticamente
  setupAutoUpdater();
  setTimeout(() => {
    checkUpdatesAutomaticallyOnStartup().catch(err => console.error('[AutoUpdater] Erro no startup check:', err));
  }, 3000);

  // Re-verifica periodicamente a cada 4 horas enquanto o app estiver em execução
  setInterval(() => {
    checkUpdatesAutomaticallyOnStartup().catch(err => console.error('[AutoUpdater] Erro no periodic check:', err));
  }, 4 * 60 * 60 * 1000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  isAppQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ==========================================
// Módulo de Autenticação Google OAuth 2.0
// ==========================================
function initGoogleClient() {
  if (!fs.existsSync(CREDENTIALS_FILE)) {
    return;
  }

  try {
    const creds = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf-8'));
    const key = creds.installed || creds.web;
    if (!key) return;

    oauth2Client = new google.auth.OAuth2(
      key.client_id,
      key.client_secret,
      'http://127.0.0.1:5832/oauth2callback'
    );

    if (fs.existsSync(TOKEN_FILE)) {
      const token = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf-8'));
      oauth2Client.setCredentials(token);
      driveService = google.drive({ version: 'v3', auth: oauth2Client });
    }
  } catch (err) {
    console.error('Erro ao inicializar Google Client:', err);
  }
}

// Iniciar servidor local para capturar o código de autenticação
function startLocalOAuthServer(resolve, reject) {
  if (oauthServer) {
    oauthServer.close();
  }

  oauthServer = http.createServer(async (req, res) => {
    const reqUrl = url.parse(req.url, true);
    if (reqUrl.pathname === '/oauth2callback') {
      const code = reqUrl.query.code;
      if (code) {
        try {
          const { tokens } = await oauth2Client.getToken(code);
          oauth2Client.setCredentials(tokens);
          fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2), 'utf-8');
          driveService = google.drive({ version: 'v3', auth: oauth2Client });

          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<h1>Autenticação concluída com sucesso!</h1><p>Você pode fechar esta aba do navegador e voltar para o aplicativo.</p>');

          oauthServer.close(() => {
            oauthServer = null;
          });
          resolve(true);
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<h1>Erro na autenticação</h1><p>Consulte o log do console para detalhes.</p>');
          reject(err);
        }
      } else {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>Código de autorização inválido</h1>');
      }
    }
  });

  oauthServer.on('error', (err) => {
    console.error('Erro no servidor OAuth local:', err);
    oauthServer.close();
    oauthServer = null;
    reject(new Error('Falha ao iniciar servidor local na porta 5832: ' + err.message));
  });

  oauthServer.listen(5832, '127.0.0.1', () => {
    console.log('OAuth server rodando na porta 5832');
  });
}

// ==========================================
// Módulo de Gerenciamento do Google Drive
// ==========================================
function extractDriveId(link) {
  // Regex para achar ID de Pasta
  const folderMatch = link.match(/\/folders\/([a-zA-Z0-9-_]{25,})/);
  if (folderMatch) return { id: folderMatch[1], isFolder: true };

  // Regex para achar ID de Arquivo
  const fileMatch = link.match(/\/file\/d\/([a-zA-Z0-9-_]{25,})/);
  if (fileMatch) return { id: fileMatch[1], isFolder: false };

  // Regex para query params 'id='
  const idQueryMatch = link.match(/[?&]id=([a-zA-Z0-9-_]{25,})/);
  if (idQueryMatch) {
    // Se conter a palavra 'folders', assume que é pasta
    const isFolder = link.includes('folder');
    return { id: idQueryMatch[1], isFolder };
  }

  // Se for apenas o ID cru com tamanho apropriado
  const rawIdMatch = link.match(/^([a-zA-Z0-9-_]{25,})$/);
  if (rawIdMatch) return { id: rawIdMatch[1], isFolder: false }; // assume arquivo por padrão se for cru

  return null;
}

// Escaneamento Recursivo de Pasta no Google Drive
async function scanGoogleDriveFolder(folderId, relativePath = '') {
  if (!driveService) throw new Error('Google Drive não está conectado.');

  let filesList = [];
  let pageToken = null;

  do {
    const response = await driveService.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id, name, mimeType, size)',
      pageSize: 100,
      pageToken: pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true
    });

    const files = response.data.files || [];
    for (const file of files) {
      const currentRelativePath = path.join(relativePath, file.name);
      if (file.mimeType === 'application/vnd.google-apps.folder') {
        const subFiles = await scanGoogleDriveFolder(file.id, currentRelativePath);
        filesList = filesList.concat(subFiles);
      } else {
        const rootFolderName = relativePath.split(path.sep)[0] || relativePath || 'Pasta_Google_Drive';
        filesList.push({
          id: file.id,
          name: file.name,
          size: parseInt(file.size || '0'),
          mimeType: file.mimeType,
          relativePath: currentRelativePath,
          folderName: rootFolderName
        });
      }
    }
    pageToken = response.data.nextPageToken;
  } while (pageToken);

  return filesList;
}

async function getFileInfo(fileId) {
  if (!driveService) throw new Error('Google Drive não está conectado.');
  const response = await driveService.files.get({
    fileId: fileId,
    fields: 'id, name, mimeType, size',
    supportsAllDrives: true
  });
  const file = response.data;
  return {
    id: file.id,
    name: file.name,
    size: parseInt(file.size || '0'),
    mimeType: file.mimeType,
    relativePath: file.name
  };
}

// ==========================================
// Loop e Gerenciador de Download
// ==========================================
function updateQueueUI() {
  saveQueue();
  if (mainWindow) {
    // Retorna a fila sem objetos complexos internos para evitar travamentos de IPC
    const serializedQueue = downloadQueue.map(item => ({
      id: item.id,
      name: item.name,
      size: item.size,
      relativePath: item.relativePath,
      folderName: item.folderName || (item.relativePath ? item.relativePath.split(path.sep)[0] : 'Downloads'),
      status: item.status,
      progress: item.progress,
      downloadedBytes: item.downloadedBytes,
      speed: item.speed,
      eta: item.eta,
      error: item.error,
      cloudMessage: item.cloudMessage,
      cloudProgress: item.cloudProgress,
      torboxType: item.torboxType,
      torboxId: item.torboxId,
      torboxFileId: item.torboxFileId,
      sendUrl: item.sendUrl || item.url || item.directUrl || null,
      url: item.url || item.sendUrl || item.directUrl || item.downloadUrl || null,
      directUrl: item.directUrl || item.url || item.sendUrl || item.downloadUrl || null,
      numericId: item.numericId || null,
      fileId: item.fileId || null,
      isHttpDirect: item.isHttpDirect || (item.id && (item.id.startsWith('send_') || item.id.startsWith('drime_') || item.id.startsWith('turbo_') || item.id.startsWith('terabox_') || item.id.startsWith('mediafire_') || item.id.startsWith('bunkr_') || item.id.startsWith('onedrive_') || item.id.startsWith('torbox_')))
    }));
    mainWindow.webContents.send('queue-updated', serializedQueue);
  }
}

function getItemServiceKey(item) {
  if (!item) return 'gdrive';
  const id = String(item.id || '').toLowerCase();
  const url = String(item.url || item.teraboxUrl || '').toLowerCase();

  if (id.startsWith('bunkr_') || url.includes('bunkr')) return 'bunkr';
  if (id.startsWith('mediafire_') || url.includes('mediafire')) return 'mediafire';
  if (id.startsWith('terabox_') || url.includes('terabox') || url.includes('1024tera') || url.includes('freeterabox')) return 'terabox';
  if (id.startsWith('vik1ngfile_') || url.includes('vik1ngfile')) return 'vik1ngfile';
  if (id.startsWith('drime_') || url.includes('drime')) return 'drime';
  if (id.startsWith('turbo_') || url.includes('turbo.cr') || url.includes('turbo.pw')) return 'turbo';
  if (id.startsWith('pixeldrain_') || url.includes('pixeldrain')) return 'pixeldrain';
  if (id.startsWith('gofile_') || url.includes('gofile')) return 'gofile';
  if (id.startsWith('torbox_') || item.torboxId || item.torboxType) return 'torbox';
  return 'gdrive';
}

function isTorboxCloudPendingItem(item) {
  if (!item || item.status === 'completed') return false;
  if ((item.cloudMessage || (item.cloudProgress !== undefined && item.cloudProgress < 100)) && (item.downloadedBytes || 0) === 0) {
    return true;
  }
  return false;
}

async function processQueue() {
  const allDownloading = downloadQueue.filter(i => i.status === 'downloading');
  if (allDownloading.length > 0) {
    startPowerSaveBlocker();
  }

  const activeLocalCount = allDownloading.filter(i => !isTorboxCloudPendingItem(i)).length;

  if (activeLocalCount >= config.maxConcurrent) return;

  const serviceMaxLimits = Object.assign({
    gdrive: 1,
    bunkr: 1,
    mediafire: 1,
    terabox: 1,
    vik1ngfile: 1,
    drime: 1,
    turbo: 1,
    pixeldrain: 1,
    gofile: 1,
    torbox: 3
  }, config.serviceMaxConcurrent || {});

  // Contagem de downloads ativos por serviço
  const activeCountsByService = {};
  allDownloading.forEach(i => {
    if (!isTorboxCloudPendingItem(i)) {
      const sKey = getItemServiceKey(i);
      activeCountsByService[sKey] = (activeCountsByService[sKey] || 0) + 1;
    }
  });

  const nextItem = downloadQueue.find(item => {
    if (item.status !== 'pending') return false;
    const sKey = getItemServiceKey(item);
    const activeForService = activeCountsByService[sKey] || 0;
    const maxAllowedForService = Math.min(Math.max(parseInt(serviceMaxLimits[sKey], 10) || 1, 1), 3);

    if (activeForService >= maxAllowedForService) {
      return false; // Respeita o limite individual de concorrência por serviço/hoster
    }
    return true;
  });
  if (!nextItem) {
    // Se a fila estiver vazia e não tiver nada baixando, finalizou tudo!
    const activeAndPending = downloadQueue.filter(i => i.status === 'downloading' || i.status === 'pending').length;
    if (activeAndPending === 0) {
      stopPowerSaveBlocker(); // Libera o PC para suspender normalmente
      if (downloadQueue.length > 0) {
        const completedCount = downloadQueue.filter(i => i.status === 'completed').length;
        if (completedCount > 0 && config.notificationsEnabled) {
          new Notification({
            title: 'Downloads Concluídos',
            body: `Todos os ${completedCount} downloads foram finalizados com sucesso!`
          }).show();
        }
      }
    }
    return;
  }

  // Inicia download
  nextItem.status = 'downloading';
  nextItem.downloadedBytes = 0;
  nextItem.progress = 0;
  nextItem.speed = 0;
  nextItem.eta = 0;
  updateQueueUI();

  // Guard de 30 segundos: se o item não receber nenhum byte dentro de 30s (e não estiver processando na nuvem Torbox), aborta e passa para o próximo da fila
  let startTimeoutTimer = setTimeout(() => {
    if (nextItem.status === 'downloading' && (nextItem.downloadedBytes || 0) === 0 && !isTorboxCloudPendingItem(nextItem)) {
      console.warn(`[Queue Guard] Item "${nextItem.name}" não iniciou a transferência em 30s. Cancelando e avançando para o próximo...`);
      const downloadData = activeDownloads.get(nextItem.id);
      if (downloadData && downloadData.abortController) {
        try { downloadData.abortController.abort(); } catch (e) {}
      }
    }
  }, 30000);

  downloadFile(nextItem)
    .then(() => {
      clearTimeout(startTimeoutTimer);
      nextItem.status = 'completed';
      nextItem.completedAt = Date.now();
      nextItem.progress = 100;
      nextItem.speed = 0;
      nextItem.eta = 0;
      saveCompletedDownloadToHistory(nextItem);
      activeDownloads.delete(nextItem.id);
      updateQueueUI();
      processQueue(); // Pega o próximo
    })
    .catch((err) => {
      clearTimeout(startTimeoutTimer);
      console.error(`[ERROR] Download falhou para "${nextItem.name}":`, err);
      if (nextItem.useTorboxFallback && config.torboxApiKey && config.torboxApiKey.trim().length > 0) {
        console.log(`[Stagnation Handler] Alternando "${nextItem.name}" para o Torbox após 10 min a 0 KB/s...`);
        nextItem.status = 'pending';
        nextItem.error = null;
        updateQueueUI();
        activeDownloads.delete(nextItem.id);
        setTimeout(() => { processQueue(); }, 1000);
        return;
      }
      if (nextItem.status !== 'paused') {
        nextItem.status = 'failed';
        nextItem.error = err.message || '[ERR_TIMEOUT_30S] Servidor CDN sem resposta em 30s. Verifique a disponibilidade do arquivo no site do Bunkr.';
        updateQueueUI();
      }
      activeDownloads.delete(nextItem.id);
      
      // Delay de 1 segundo antes de processar o próximo item para continuar a fila
      setTimeout(() => {
        processQueue();
      }, 1000);
    });

  // Tenta processar mais arquivos se o limite de concorrência permitir
  processQueue();
}

function sanitizePathSegment(segment) {
  if (!segment || typeof segment !== 'string') return 'Download';
  return segment.replace(/[\r\n\t]/g, ' ').replace(/[\\/:*?"<>|]/g, '_').trim() || 'Download';
}

function sanitizeLocalPath(relPath) {
  if (!relPath || typeof relPath !== 'string') return 'Download';
  const parts = relPath.split(/[/\\]+/);
  const cleanParts = parts.map(p => p.replace(/[\r\n\t]/g, ' ').replace(/[\\/:*?"<>|]/g, '_').trim()).filter(Boolean);
  return cleanParts.join(path.sep) || 'Download';
}

function downloadBunkrFile(queueItem) {
  return new Promise(async (resolve, reject) => {
    let isAborted = false;
    const abortController = new AbortController();
    let currentReqs = [];
    let progressInterval = null;

    const cleanupAndAbort = () => {
      isAborted = true;
      if (progressInterval) clearInterval(progressInterval);
      queueItem.speed = 0;
      queueItem.eta = 0;
      currentReqs.forEach(req => {
        try { req.destroy(); } catch (e) {}
      });
      currentReqs = [];
      updateQueueUI();
    };

    abortController.signal.addEventListener('abort', cleanupAndAbort, { once: true });

    activeDownloads.set(queueItem.id, {
      abortController,
      queueItem
    });

    const localFilePath = path.join(config.downloadPath, sanitizeLocalPath(queueItem.relativePath || queueItem.name));
    const localDir = path.dirname(localFilePath);

    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }

    try {
      if (isAborted || abortController.signal.aborted) {
        cleanupAndAbort();
        return reject(new Error('Download pausado/cancelado pelo usuário'));
      }
      let directUrl = '';
      let referer = 'https://bunkr.cr/';
      let cookieHeader = '';

      if (queueItem.id && queueItem.id.startsWith('terabox_')) {
        console.log(`[TeraBox Worker] Resolvendo link direto de alta velocidade para "${queueItem.name}"...`);
        const tbInfo = await resolveTeraBoxDirectUrl(
          queueItem.numericId,
          queueItem.teraboxUrl,
          queueItem.teraboxDlink,
          queueItem.teraboxPath,
          queueItem.teraboxShareId,
          queueItem.teraboxUk,
          queueItem.teraboxThumbs
        );
        directUrl = tbInfo.directUrl;
        referer = tbInfo.referer || 'https://www.terabox.com/';
        cookieHeader = tbInfo.cookie || '';
      } else if (queueItem.id && queueItem.id.startsWith('mediafire_')) {
        console.log(`[MediaFire Worker] Resolvendo link direto CDN para "${queueItem.name}"...`);
        const mfInfo = await resolveMediaFireDirectUrl(queueItem.numericId, queueItem.mediafireUrl);
        directUrl = mfInfo.directUrl;
        referer = mfInfo.referer || 'https://www.mediafire.com/';
      } else if (queueItem.id && (queueItem.id.startsWith('onedrive_') || isOneDriveUrl(queueItem.oneDriveUrl))) {
        console.log(`[OneDrive Worker] Resolvendo link direto para "${queueItem.name}"...`);
        const odInfo = await resolveOneDriveDirectUrl(queueItem.numericId, queueItem.oneDriveUrl, queueItem.oneDriveDirectUrl);
        directUrl = odInfo.directUrl;
        referer = odInfo.referer || 'https://sharepoint.com/';
        cookieHeader = odInfo.cookie || queueItem.oneDriveCookie || '';
      } else if (queueItem.id && (queueItem.id.startsWith('torbox_') || queueItem.torboxType)) {
        console.log(`[Torbox Worker] Verificando progresso na nuvem e resolvendo CDN para "${queueItem.name}"...`);
        const tbType = queueItem.torboxType || ((queueItem.id && queueItem.id.includes('_webdl_')) ? 'webdl' : 'torrent');
        const tbId = queueItem.torboxId || (queueItem.id ? (queueItem.id.match(/\d+/g) || [0])[0] : 0);
        const tbFileId = queueItem.torboxFileId !== undefined ? queueItem.torboxFileId : 0;

        const isZip = queueItem.isZipDownload || (queueItem.id && String(queueItem.id).endsWith('_zip'));
        const tbInfo = await resolveTorboxDirectUrl(
          queueItem.fileId || queueItem.id,
          config.torboxApiKey,
          tbType,
          tbId,
          tbFileId,
          (statusMsg, percent) => {
            queueItem.cloudProgress = percent;
            queueItem.cloudMessage = statusMsg;
            updateQueueUI();
          },
          isZip
        );
        directUrl = tbInfo.directUrl;
        referer = tbInfo.referer || 'https://torbox.app/';
      } else if (queueItem.id && queueItem.id.startsWith('drime_')) {
        console.log(`[Drime Worker] Preparando URL direta para "${queueItem.name}"...`);
        directUrl = queueItem.url || queueItem.directUrl || queueItem.downloadUrl || '';
        if (!directUrl && queueItem.id) {
          const parts = queueItem.id.split('_');
          if (parts.length >= 3) {
            const hash = parts[1];
            const childId = parts[2];
            const childHash = Buffer.from(`${childId}|`).toString('base64');
            directUrl = `https://app.drime.cloud/api/v1/file-entries/download/${childHash}`;
            if (!referer || referer === 'https://bunkr.cr/') {
              referer = `https://app.drime.cloud/drive/s/${hash}`;
            }
          }
        }
        referer = queueItem.referer || referer || 'https://app.drime.cloud/';
        cookieHeader = queueItem.cookieHeader || '';
      } else if (queueItem.id && (queueItem.id.startsWith('turbo_') || queueItem.turboFileId)) {
        console.log(`[Turbo Worker] Resolvendo URL direta assinada para "${queueItem.name}"...`);
        const turboInfo = await resolveTurboDirectUrl(queueItem.turboFileId);
        directUrl = turboInfo ? turboInfo.directUrl : (queueItem.url || directUrl);
        referer = 'https://turbo.cr/';
      } else if (queueItem.id && (queueItem.id.startsWith('pixeldrain_') || (queueItem.downloadUrl && queueItem.downloadUrl.includes('pixeldrain.com')))) {
        console.log(`[PixelDrain Worker] Preparando download para "${queueItem.name}"...`);
        const useTorbox = isTorboxEnabledForService('pixeldrain');
        if (useTorbox && config.torboxApiKey && config.torboxApiKey.trim().length > 0) {
          try {
            const individualFileUrl = queueItem.fileId ? `https://pixeldrain.com/u/${queueItem.fileId}` : (queueItem.sourceUrl || queueItem.downloadUrl);
            console.log(`[PixelDrain Worker] Desprotegendo arquivo individual via Torbox: ${individualFileUrl}`);
            const tbFiles = await scanTorboxLink(individualFileUrl, config.torboxApiKey);
            if (tbFiles && tbFiles.length > 0 && tbFiles[0].directUrl) {
              directUrl = tbFiles[0].directUrl;
              referer = 'https://torbox.app/';
            }
          } catch (e) {
            console.warn('[PixelDrain Worker] Torbox falhou, fallback para download nativo:', e.message);
          }
        }
        if (!directUrl) {
          directUrl = queueItem.directUrl || (queueItem.fileId ? `https://pixeldrain.com/api/file/${queueItem.fileId}` : queueItem.downloadUrl);
          referer = 'https://pixeldrain.com/';
        }
      } else if (queueItem.id && queueItem.id.startsWith('mediafire_')) {
        console.log(`[MediaFire Worker] Utilizando link direto do MediaFire para "${queueItem.name}"...`);
        directUrl = queueItem.url || directUrl;
        referer = 'https://www.mediafire.com/';
      } else if (queueItem.id && (queueItem.id.startsWith('send_') || queueItem.sendUrl)) {
        console.log(`[Send Worker] Resolvendo URL direta do Send para "${queueItem.name}"...`);
        const fileCode = queueItem.numericId || (queueItem.sendUrl ? queueItem.sendUrl.split('/').pop() : '');
        const useTorbox = isTorboxEnabledForService('send');
        const sendInfo = await resolveSendDirectUrl(
          fileCode,
          queueItem.sendUrl || queueItem.url || queueItem.directUrl,
          config.torboxApiKey,
          useTorbox,
          (statusMsg, percent) => {
            queueItem.cloudProgress = percent;
            queueItem.cloudMessage = statusMsg;
            updateQueueUI();
          }
        );
        if (sendInfo && sendInfo.isTorbox) {
          delete queueItem.cloudMessage;
        }
        directUrl = sendInfo ? sendInfo.directUrl : (queueItem.url || queueItem.downloadUrl || directUrl);
        referer = sendInfo ? sendInfo.referer : 'https://send.now/';
      } else {
        // Bunkr realiza download 100% NATIVO e de alta velocidade por padrão (como no v1.2.2)
        // O Torbox só é acionado como fallback se o arquivo ficar estagnado por 10 minutos a 0 KB/s
        if (queueItem.useTorboxFallback && config.torboxApiKey && config.torboxApiKey.trim().length > 0) {
          console.log(`[Stagnation Worker] Tentando desproteger "${queueItem.name}" via Torbox após 10 min a 0 KB/s...`);
          try {
            const targetUrl = queueItem.bunkrPageUrl || (queueItem.fileId ? `https://bunkr.ph/f/${queueItem.fileId}` : (queueItem.sourceUrl || queueItem.url));
            const tbFiles = await scanTorboxLink(targetUrl, config.torboxApiKey);
            if (tbFiles && tbFiles.length > 0 && (tbFiles[0].directUrl || tbFiles[0].torboxId)) {
              const tbItem = tbFiles[0];
              const tbType = tbItem.torboxType || 'webdl';
              const tbId = tbItem.torboxId || 0;
              const tbFileId = tbItem.torboxFileId !== undefined ? tbItem.torboxFileId : 0;
              const tbInfo = await resolveTorboxDirectUrl(
                tbItem.fileId || tbItem.id,
                config.torboxApiKey,
                tbType,
                tbId,
                tbFileId,
                (statusMsg, percent) => {
                  queueItem.cloudProgress = percent;
                  queueItem.cloudMessage = statusMsg;
                  updateQueueUI();
                }
              );
              directUrl = tbInfo.directUrl;
              referer = tbInfo.referer || 'https://torbox.app/';
            }
          } catch (errStag) {
            console.warn('[Stagnation Worker] Falha no fallback Torbox:', errStag.message);
          }
        }

        if (!directUrl) {
          console.log(`[Bunkr Worker] Resolvendo URL direta e cookies para "${queueItem.name}" nativamente pelo Nexus...`);
          const bunkrInfo = await resolveBunkrDirectUrl(
            queueItem.numericId,
            queueItem.fileId,
            queueItem.bunkrPageUrl || (queueItem.fileId ? `https://bunkr.ph/f/${queueItem.fileId}` : (queueItem.sourceUrl || queueItem.url))
          );
          directUrl = bunkrInfo.directUrl || bunkrInfo;
          referer = bunkrInfo.referer || 'https://bunkr.ph/';
          cookieHeader = bunkrInfo.cookieHeader || '';
        }
      }

      console.log(`[HTTP Direct Worker] URL direta obtida com sucesso:`, directUrl);

      if (abortController.signal.aborted) {
        return reject(new Error('Download cancelado'));
      }

      let parsedUrl = new URL(directUrl);
      let transport = parsedUrl.protocol === 'https:' ? https : http;

      const reqOptions = {
        rejectUnauthorized: false,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
          'Referer': referer,
          'Cookie': cookieHeader
        }
      };

      let service = 'bunkr';
      if (queueItem.id && queueItem.id.startsWith('send_')) service = 'send';
      else if (queueItem.id && queueItem.id.startsWith('drime_')) service = 'drime';
      else if (queueItem.id && (queueItem.id.startsWith('turbo_') || queueItem.turboFileId)) service = 'turbo';
      else if (queueItem.id && queueItem.id.startsWith('terabox_')) service = 'terabox';
      else if (queueItem.id && queueItem.id.startsWith('mediafire_')) service = 'mediafire';
      else if (queueItem.id && (queueItem.id.startsWith('onedrive_') || isOneDriveUrl(queueItem.oneDriveUrl))) service = 'onedrive';
      if (service === 'bunkr' && parsedUrl && offlineBunkrSubdomains.has(parsedUrl.hostname)) {
        return reject(new Error(`Servidor CDN ${parsedUrl.hostname} marcado como off-line/bloqueado no provedor. Ignorado instantaneamente.`));
      }

      // Pré-Flight para obter URL CDN final real e tamanho autoritativo dos cabeçalhos (suporta até 5 redirecionamentos HTTP 3xx)
      let supportsRangeHeader = true;

      try {
        let probeUrl = directUrl;
        let probeRedirects = 0;

        while (probeRedirects < 5) {
          const probeParsed = new URL(probeUrl);
          const probeTransport = probeParsed.protocol === 'https:' ? https : http;

          const pfResult = await new Promise((resPf) => {
            const pfReq = probeTransport.request(probeUrl, {
              method: 'GET',
              headers: {
                ...reqOptions.headers,
                'Range': 'bytes=0-0'
              },
              rejectUnauthorized: false
            }, res => {
              const statusCode = res.statusCode;
              const location = res.headers.location;
              let realSize = 0;

              if (res.headers['content-range']) {
                const match = res.headers['content-range'].match(/\/(\d+)$/);
                if (match) realSize = parseInt(match[1], 10);
              }
              if (!realSize && res.headers['content-length'] && statusCode === 200) {
                realSize = parseInt(res.headers['content-length'], 10);
              }

              const isRangeOk = (statusCode === 206 || res.headers['accept-ranges'] === 'bytes');

              pfReq.destroy();
              resPf({ statusCode, location, realSize, isRangeOk });
            });

            pfReq.setTimeout(4000, () => {
              try { pfReq.destroy(); } catch (e) {}
              resPf({ statusCode: 500 });
            });

            pfReq.on('error', (err) => {
              if (err && (err.code === 'EPROTO' || (err.message && err.message.includes('WRONG_VERSION_NUMBER'))) && probeUrl.startsWith('https:')) {
                console.warn('[HTTP Direct Worker] SSL/TLS EPROTO detectado no pré-flight (WRONG_VERSION_NUMBER). Revertendo URL para HTTP puro...');
                probeUrl = probeUrl.replace(/^https:/i, 'http:');
                directUrl = directUrl.replace(/^https:/i, 'http:');
                parsedUrl = new URL(directUrl);
                transport = http;
                resPf({ statusCode: 307, location: probeUrl, realSize: 0, isRangeOk: false });
              } else {
                resPf({ statusCode: 500 });
              }
            });
            pfReq.end();
          });

          if (pfResult.location && pfResult.statusCode >= 300 && pfResult.statusCode < 400) {
            let nextUrl = pfResult.location;
            if (nextUrl.startsWith('/')) {
              const u = new URL(probeUrl);
              nextUrl = `${u.protocol}//${u.host}${nextUrl}`;
            }
            probeUrl = nextUrl;
            directUrl = nextUrl;
            parsedUrl = new URL(directUrl);
            transport = parsedUrl.protocol === 'https:' ? https : http;
            probeRedirects++;
          } else {
            if (pfResult.realSize > 0) {
              console.log(`[HTTP Direct Worker] Tamanho autoritativo retornado pelo CDN: ${pfResult.realSize} bytes (anterior: ${queueItem.size})`);
              queueItem.size = pfResult.realSize;
              queueItem.sizeFormatted = formatBytes(pfResult.realSize);
              updateQueueUI();
            }
            supportsRangeHeader = pfResult.isRangeOk;
            break;
          }
        }
      } catch (e) {
        console.warn('[HTTP Direct Worker] Erro no pré-flight de cabeçalhos:', e.message);
      }

      const mode = getDownloadMode(service);
      const isMultiMode = (service !== 'terabox' && service !== 'onedrive') && mode === 'multi' && (queueItem.size > 5 * 1024 * 1024) && supportsRangeHeader;

      let lastTime = Date.now();
      let lastBytes = 0;
      let stagnantStartTime = null;

      progressInterval = setInterval(() => {
        if (isAborted) return;
        const now = Date.now();
        const timeDiff = (now - lastTime) / 1000;
        if (timeDiff > 0.5) {
          const bytesDiff = queueItem.downloadedBytes - lastBytes;
          queueItem.speed = bytesDiff / timeDiff;
          lastTime = now;
          lastBytes = queueItem.downloadedBytes;

          if (queueItem.downloadedBytes > 0) {
            delete queueItem.cloudMessage;
            delete queueItem.cloudProgress;
          }

          if (queueItem.size > 0 && queueItem.speed > 0) {
            const remainingBytes = queueItem.size - queueItem.downloadedBytes;
            queueItem.eta = Math.max(0, Math.ceil(remainingBytes / queueItem.speed));
            queueItem.progress = Math.min(100, Math.floor((queueItem.downloadedBytes / queueItem.size) * 100));
          }

          // Monitora estagnação: Válido EXCLUSIVAMENTE para 0 KB/s contínuo por 10 minutos
          if (queueItem.speed === 0) {
            if (!stagnantStartTime) {
              stagnantStartTime = now;
            } else if (now - stagnantStartTime >= 10 * 60 * 1000) { // 10 minutos (600.000 ms) estagnado
              console.warn(`[Stagnation Guard] Download de "${queueItem.name}" parado a 0 KB/s por 10 minutos.`);
              if (config.torboxApiKey && config.torboxApiKey.trim().length > 0) {
                console.log(`[Stagnation Guard] Alternando "${queueItem.name}" para o Torbox devido a 10 min a 0 KB/s...`);
                queueItem.useTorboxFallback = true;
                queueItem.cloudMessage = 'Download estagnado por 10min (0 KB/s). Alternando para o Torbox...';
                updateQueueUI();
                cleanupAndAbort();
                return reject(new Error('Download estagnado por 10 minutos a 0 KB/s. Alternando para o Torbox...'));
              } else {
                cleanupAndAbort();
                return reject(new Error('Download estagnado a 0 KB/s por 10 minutos consecutivos.'));
              }
            }
          } else {
            // Se houver velocidade de download (> 0 KB/s), reseta a contagem de estagnação imediatamente!
            stagnantStartTime = null;
          }

          updateQueueUI();
        }
      }, 500);

      // Multiconexão Otimizada (4 segmentos paralelos)
      if (isMultiMode && queueItem.size > 0) {
        console.log(`[HTTP Direct Worker] Iniciando multiconexão (4 conexões) para ${service}: "${queueItem.name}"`);
        const numSegments = 4;
        const totalSize = queueItem.size;
        const segmentSize = Math.floor(totalSize / numSegments);

        fs.writeFileSync(localFilePath, '');
        fs.truncateSync(localFilePath, totalSize);

        let segmentsProgress = new Array(numSegments).fill(0);
        const segmentPromises = [];

        for (let i = 0; i < numSegments; i++) {
          const start = i * segmentSize;
          const end = (i === numSegments - 1) ? totalSize - 1 : (start + segmentSize - 1);
          const segmentIndex = i;

          const p = new Promise((resSeg, rejSeg) => {
            const segOptions = {
              ...reqOptions,
              headers: {
                ...reqOptions.headers,
                'Range': `bytes=${start}-${end}`
              }
            };

            const segReq = transport.get(directUrl, segOptions, res => {
              if (res.statusCode !== 200 && res.statusCode !== 206) {
                return rejSeg(new Error(`Servidor retornou HTTP ${res.statusCode}`));
              }

              const writeStream = fs.createWriteStream(localFilePath, {
                flags: 'r+',
                start: start,
                highWaterMark: 1024 * 1024
              });

              res.on('data', chunk => {
                if (isAborted) return;
                segmentsProgress[segmentIndex] += chunk.length;
                queueItem.downloadedBytes = segmentsProgress.reduce((a, b) => a + b, 0);
              });

              res.pipe(writeStream);

              writeStream.on('finish', () => {
                writeStream.close();
                resSeg();
              });

              writeStream.on('error', rejSeg);
              res.on('error', rejSeg);
            });

            segReq.setTimeout(8000, () => {
              try { segReq.destroy(); } catch (e) {}
              rejSeg(new Error('Timeout de conexão com servidor CDN'));
            });

            segReq.on('error', rejSeg);
          });

          segmentPromises.push(p);
        }

        try {
          await Promise.all(segmentPromises);
          clearInterval(progressInterval);
          return resolve();
        } catch (err) {
          console.warn(`[HTTP Direct Worker] Multiconexão falhou (${err.message}). Migrando para conexão única de segurança...`);
          try { fs.writeFileSync(localFilePath, ''); } catch (e) {}
          queueItem.downloadedBytes = 0;
          return startSingleDownload(directUrl, reqOptions);
        }
      }

      // Conexão Única (Single stream fallback)
      console.log(`[HTTP Direct Worker] Iniciando conexão única para ${service}: "${queueItem.name}"`);
      const writeStream = fs.createWriteStream(localFilePath, { highWaterMark: 1024 * 1024 });

      function startSingleDownload(targetUrl, currentReqOptions, redirectCount = 0) {
        if (redirectCount > 10) {
          clearInterval(progressInterval);
          writeStream.destroy();
          return reject(new Error('Muitos redirecionamentos HTTP no download'));
        }

        const targetParsed = new URL(targetUrl);
        const targetTransport = targetParsed.protocol === 'https:' ? https : http;

        const req = targetTransport.get(targetUrl, currentReqOptions, res => {
          const cleanupFileOnFailure = () => {
            if (fs.existsSync(localFilePath)) {
              try { fs.unlinkSync(localFilePath); } catch (e) {}
            }
          };

          // Trata redirecionamentos HTTP 301, 302, 303, 307, 308
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            let nextUrl = res.headers.location;
            if (nextUrl.startsWith('/')) {
              nextUrl = `${targetParsed.protocol}//${targetParsed.host}${nextUrl}`;
            }
            console.log(`[HTTP Direct Worker] Redirecionando (${res.statusCode}) para: ${nextUrl}`);

            if (nextUrl.toLowerCase().includes('malwarebytes') || (nextUrl.toLowerCase().includes('block') && nextUrl.toLowerCase().includes('cat='))) {
              clearInterval(progressInterval);
              writeStream.destroy();
              cleanupFileOnFailure();
              return reject(new Error('Download bloqueado pelo antivírus/firewall local (Malwarebytes). Adicione uma exceção para *.tb-cdn.cx ou desative a Proteção Web.'));
            }

            let updatedCookie = currentReqOptions.headers['Cookie'] || '';
            if (res.headers['set-cookie']) {
              const newCookies = res.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
              updatedCookie = updatedCookie ? `${updatedCookie}; ${newCookies}` : newCookies;
            }

            const nextOptions = {
              ...currentReqOptions,
              headers: {
                ...currentReqOptions.headers,
                'Cookie': updatedCookie,
                'Referer': targetUrl
              }
            };

            return startSingleDownload(nextUrl, nextOptions, redirectCount + 1);
          }

          if (res.statusCode !== 200 && res.statusCode !== 206) {
            clearInterval(progressInterval);
            writeStream.destroy();
            cleanupFileOnFailure();
            return reject(new Error(`Servidor retornou HTTP ${res.statusCode}`));
          }

          if (res.headers['content-type'] && res.headers['content-type'].includes('text/html')) {
            clearInterval(progressInterval);
            writeStream.destroy();
            cleanupFileOnFailure();
            return reject(new Error('Servidor ou antivírus retornou página HTML em vez do arquivo binário.'));
          }

          const totalLength = parseInt(res.headers['content-length'], 10);
          if (totalLength && totalLength > 0 && (!queueItem.size || queueItem.size === 0)) {
            queueItem.size = totalLength;
            queueItem.sizeFormatted = formatBytes(totalLength);
          }

          let lastDataReceivedTime = Date.now();
          const stallWatchdog = setInterval(() => {
            if (isAborted) {
              clearInterval(stallWatchdog);
              return;
            }
            const timeSinceLastData = Date.now() - lastDataReceivedTime;
            if (timeSinceLastData > 15000) {
              console.warn(`[HTTP Direct Worker] Download estagnado (${Math.round(timeSinceLastData / 1000)}s sem transferência de dados). Destruindo conexão travada...`);
              clearInterval(stallWatchdog);
              try { req.destroy(new Error('Conexão estagnada: nenhum dado recebido nos últimos 15 segundos do servidor CDN')); } catch (e) {}
            }
          }, 3000);

          res.on('data', chunk => {
            if (isAborted) return;
            lastDataReceivedTime = Date.now();
            queueItem.downloadedBytes += chunk.length;
          });

          res.pipe(writeStream);

          writeStream.on('finish', () => {
            clearInterval(stallWatchdog);
            clearInterval(progressInterval);
            if (isAborted) {
              cleanupFileOnFailure();
              reject(new Error('Download cancelado pelo usuário'));
            } else if (queueItem.size > 0 && queueItem.downloadedBytes < Math.floor(queueItem.size * 0.95)) {
              cleanupFileOnFailure();
              reject(new Error(`Download bloqueado pelo antivírus (Malwarebytes): baixou apenas ${formatBytes(queueItem.downloadedBytes)} de ${formatBytes(queueItem.size)}. Adicione *.tb-cdn.cx às exceções do Malwarebytes.`));
            } else {
              resolve();
            }
          });

          writeStream.on('error', err => {
            clearInterval(stallWatchdog);
            clearInterval(progressInterval);
            reject(err);
          });
        });

        const onAbort = () => {
          try { req.destroy(); } catch (e) {}
          try { writeStream.destroy(); } catch (e) {}
        };
        abortController.signal.addEventListener('abort', onAbort, { once: true });

        req.setTimeout(8000, () => {
          console.warn('[HTTP Direct Worker] Socket timeout (8s sem dados de resposta do CDN). Destruindo requisição pendente...');
          try { req.destroy(new Error('Tempo limite de conexão esgotado (Servidor CDN sem resposta)')); } catch (e) {}
        });

        req.on('socket', socket => {
          socket.on('error', err => {
            console.warn('[Socket Warning]: Network socket error:', err.message);
          });
        });

        req.on('error', err => {
          if (service === 'bunkr' && parsedUrl && err && (err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED' || (err.message && err.message.includes('Tempo limite')))) {
            console.warn(`[Bunkr Worker] Marcando subdomínio CDN ${parsedUrl.hostname} como off-line em memória (BunkrDownloader 1.3.0)...`);
            offlineBunkrSubdomains.add(parsedUrl.hostname);
          }
          if (err && (err.code === 'EPROTO' || (err.message && err.message.includes('WRONG_VERSION_NUMBER'))) && targetUrl.startsWith('https:')) {
            console.warn('[HTTP Direct Worker] SSL/TLS EPROTO detectado no stream (WRONG_VERSION_NUMBER). Revertendo URL para HTTP puro...');
            const httpUrl = targetUrl.replace(/^https:/i, 'http:');
            return startSingleDownload(httpUrl, currentReqOptions, redirectCount);
          }
          clearInterval(progressInterval);
          writeStream.destroy();
          reject(err);
        });
      }

      startSingleDownload(directUrl, reqOptions, 0);
    } catch (err) {
      reject(err);
    }
  });
}

function downloadFile(queueItem) {
  const id = (queueItem && queueItem.id) || '';
  const isGoogleDrive = !queueItem.isHttpDirect && !queueItem.downloadUrl && (id.length === 33 || id.length === 19 || (!id.includes('_') && !id.startsWith('send') && !id.startsWith('drime') && !id.startsWith('turbo') && !id.startsWith('torbox') && !id.startsWith('gofile') && !id.startsWith('onedrive') && !id.startsWith('terabox') && !id.startsWith('mediafire') && !id.startsWith('bunkr') && !id.startsWith('megaup') && !id.startsWith('generic') && !id.startsWith('scraper')));

  if (!isGoogleDrive || queueItem.downloadUrl || queueItem.isHttpDirect || queueItem.sendUrl) {
    return downloadBunkrFile(queueItem);
  }

  return new Promise(async (resolve, reject) => {
    if (!driveService) {
      return reject(new Error('Google Drive desconectado'));
    }

    const localFilePath = path.join(config.downloadPath, queueItem.relativePath);
    const localDir = path.dirname(localFilePath);

    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }

    let progressInterval = null;
    let tempFileId = null;
    let activeStreams = [];
    let isAborted = false;

    // Abort controller principal da fila
    const mainAbortController = new AbortController();

    activeDownloads.set(queueItem.id, {
      abortController: mainAbortController,
      startTime: Date.now(),
      lastBytes: 0,
      speedSamples: []
    });

    const cleanupTempFile = async () => {
      if (tempFileId) {
        try {
          await driveService.files.delete({
            fileId: tempFileId,
            supportsAllDrives: true
          });
          console.log(`Copia temporaria de cota excedida deletada do Drive: ${tempFileId}`);
        } catch (e) {
          console.error(`Erro ao deletar copia temporaria ${tempFileId}:`, e.message);
        }
      }
    };

    const cleanupStreams = () => {
      isAborted = true;
      activeStreams.forEach(s => {
        try {
          s.abortController.abort();
          if (s.writeStream) {
            s.writeStream.destroy();
          }
        } catch (e) {}
      });
      activeStreams = [];
    };

    // Motor de Download (Conexão Única ou Multiconexão Otimizada)
    const downloadSegmented = async (fileId, totalSize) => {
      let numSegments = 1;
      const isMultiMode = getDownloadMode('gdrive') === 'multi';

      if (isMultiMode && totalSize > 10 * 1024 * 1024) {
        numSegments = 4; // Máximo de 4 conexões paralelas para acelerar sem estourar rate-limit do Google
      }

      if (numSegments > 1) {
        console.log(`Iniciando download de "${queueItem.name}" (${formatBytes(totalSize)}) usando ${numSegments} conexoes simultaneas (Modo Rapido).`);
      } else {
        console.log(`Iniciando download de "${queueItem.name}" (${formatBytes(totalSize)}) usando Conexao Unica (Modo Seguro - Anti-Bloqueio).`);
      }

      // Cria e pré-aloca o arquivo local se for multiconexão
      if (numSegments > 1 && totalSize > 0) {
        fs.writeFileSync(localFilePath, '');
        fs.truncateSync(localFilePath, totalSize);
      } else {
        fs.writeFileSync(localFilePath, '');
      }

      const segmentSize = (numSegments > 1 && totalSize > 0) ? Math.floor(totalSize / numSegments) : totalSize;
      const segmentPromises = [];
      
      // Controla o progresso de cada parte individualmente
      queueItem.downloadedBytes = 0;
      let segmentsProgress = new Array(numSegments).fill(0);

      for (let i = 0; i < numSegments; i++) {
        if (isAborted) break;

        const start = i * segmentSize;
        const end = (i === numSegments - 1) ? totalSize - 1 : (start + segmentSize - 1);
        const segmentIndex = i;

        const segmentAbort = new AbortController();
        const streamInfo = {
          abortController: segmentAbort,
          writeStream: null
        };
        activeStreams.push(streamInfo);

        const promise = (async () => {
          let retries = 3;
          while (retries > 0) {
            try {
              if (isAborted) return;

              const requestHeaders = {};
              if (numSegments > 1 && totalSize > 0) {
                requestHeaders.Range = `bytes=${start + segmentsProgress[segmentIndex]}-${end}`;
              }

              const response = await driveService.files.get(
                { fileId: fileId, alt: 'media', supportsAllDrives: true },
                {
                  headers: requestHeaders,
                  responseType: 'stream',
                  signal: segmentAbort.signal,
                  httpsAgent: httpsAgent // Reutiliza conexões via Keep-Alive
                }
              );

              // Opções de escrita em disco
              const writeOptions = { highWaterMark: 1024 * 1024 }; // 1MB buffer de escrita
              if (numSegments > 1 && totalSize > 0) {
                writeOptions.flags = 'r+';
                writeOptions.start = start + segmentsProgress[segmentIndex];
              }

              const writeStream = fs.createWriteStream(localFilePath, writeOptions);
              streamInfo.writeStream = writeStream;

              response.data.on('data', (chunk) => {
                segmentsProgress[segmentIndex] += chunk.length;
                queueItem.downloadedBytes = segmentsProgress.reduce((a, b) => a + b, 0);
                if (totalSize > 0) {
                  queueItem.progress = Math.min(100, Math.round((queueItem.downloadedBytes / totalSize) * 100));
                }
              });

              await new Promise((res, rej) => {
                response.data.pipe(writeStream);
                writeStream.on('finish', () => {
                  writeStream.close();
                  res();
                });
                writeStream.on('error', (e) => {
                  writeStream.close();
                  rej(e);
                });
                response.data.on('error', (e) => {
                  writeStream.destroy();
                  rej(e);
                });
              });

              break; // Sucesso, sai do loop de tentativas para este segmento
            } catch (err) {
              const errMsg = err.message || '';
              const isQuotaError = errMsg.includes('downloadQuotaExceeded') || 
                                   (err.response && err.response.data && JSON.stringify(err.response.data).includes('downloadQuotaExceeded'));
              
              if (isQuotaError) {
                // Se for erro de cota, nao adianta retentar. Lança o erro imediatamente para ativar o contorno de cópia.
                throw err;
              }

              retries--;
              if (segmentAbort.signal.aborted || isAborted) {
                throw new Error('Cancelado');
              }
              if (retries === 0) {
                throw err;
              }
              console.warn(`[WARN] Tentativa falhou no segmento ${segmentIndex} para "${queueItem.name}". Restam ${retries} retentativas. Erro: ${err.message}`);
              await new Promise(r => setTimeout(r, 1500)); // Espera 1.5s antes de tentar novamente
            }
          }
        })();

        segmentPromises.push(promise);
      }

      await Promise.all(segmentPromises);
    };

    try {
      let fileToDownloadId = queueItem.id;
      let fileSize = queueItem.size;

      // Se o tamanho do arquivo não estiver disponível na fila, busca metadados
      if (fileSize === 0) {
        const metadata = await driveService.files.get(
          {
            fileId: fileToDownloadId,
            fields: 'size',
            supportsAllDrives: true
          },
          {
            httpsAgent: httpsAgent
          }
        );
        fileSize = parseInt(metadata.data.size || '0');
        queueItem.size = fileSize;
      }

      // Monitoramento e atualização periódica de velocidade da Fila
      progressInterval = setInterval(() => {
        const downloadInfo = activeDownloads.get(queueItem.id);
        if (!downloadInfo) return;

        const now = Date.now();
        const currentBytes = queueItem.downloadedBytes;
        const bytesDiff = currentBytes - downloadInfo.lastBytes;

        downloadInfo.lastBytes = currentBytes;
        
        let instantSpeed = bytesDiff;
        downloadInfo.speedSamples.push(instantSpeed);
        if (downloadInfo.speedSamples.length > 5) {
          downloadInfo.speedSamples.shift();
        }
        const avgSpeed = downloadInfo.speedSamples.reduce((a, b) => a + b, 0) / downloadInfo.speedSamples.length;
        queueItem.speed = avgSpeed;

        if (avgSpeed > 0 && queueItem.size > 0) {
          queueItem.eta = Math.round((queueItem.size - queueItem.downloadedBytes) / avgSpeed);
        } else {
          queueItem.eta = 0;
        }

        updateQueueUI();
      }, 1000);

      // Ouvinte para o sinalizador de abortamento global (Pause/Cancel)
      mainAbortController.signal.addEventListener('abort', () => {
        cleanupStreams();
      });

      try {
        await downloadSegmented(fileToDownloadId, fileSize);
      } catch (err) {
        const errMsg = err.message || '';
        const isQuotaError = errMsg.includes('downloadQuotaExceeded') || 
                             (err.response && err.response.data && JSON.stringify(err.response.data).includes('downloadQuotaExceeded')) ||
                             errMsg.includes('403');
        if (isQuotaError) {
          console.log(`[INFO] Erro de cota detectado. Criando copia temporaria de contorno...`);
          
          let copyResponse;
          let copyRetries = 3;
          while (copyRetries > 0) {
            try {
              copyResponse = await driveService.files.copy(
                {
                  fileId: queueItem.id,
                  supportsAllDrives: true,
                  requestBody: {
                    name: `GDD_TEMP_${Date.now()}_${queueItem.name}`
                  }
                },
                {
                  httpsAgent: httpsAgent
                }
              );
              break; // Sucesso, sai do loop de retentativas
            } catch (copyErr) {
              copyRetries--;
              if (copyRetries === 0) {
                throw copyErr; // Se esgotou todas, relança a falha
              }
              console.warn(`[WARN] Falha ao criar copia temporaria (Restam ${copyRetries} tentativas). Erro: ${copyErr.message}`);
              await new Promise(r => setTimeout(r, 2000)); // Espera 2s antes do retry
            }
          }

          tempFileId = copyResponse.data.id;
          fileToDownloadId = tempFileId;
          console.log(`[INFO] Copia de contorno criada com ID: ${tempFileId}. Reiniciando download segmentado...`);

          if (isAborted) {
            await cleanupTempFile();
            throw new Error('Cancelado');
          }

          await downloadSegmented(fileToDownloadId, fileSize);
        } else {
          throw err;
        }
      }

      clearInterval(progressInterval);
      await cleanupTempFile();
      resolve();

    } catch (err) {
      clearInterval(progressInterval);
      cleanupStreams();
      if (fs.existsSync(localFilePath) && queueItem.status !== 'paused') {
        try { fs.unlinkSync(localFilePath); } catch (e) {}
      }
      await cleanupTempFile();

      if (err.message && (err.message.includes('invalid_grant') || err.message.includes('Invalid Credentials'))) {
        console.warn('[AUTH] Token do Google Drive expirou (invalid_grant). Removendo token.json invalido...');
        if (fs.existsSync(TOKEN_FILE)) {
          try { fs.unlinkSync(TOKEN_FILE); } catch (e) {}
        }
        driveService = null;
        reject(new Error('Sessão do Google expirada (invalid_grant). Vá em Ajustes, clique em Desconectar e conecte sua Conta Google novamente.'));
        return;
      }

      reject(err);
    }
  });
}

// ==========================================
// Handlers IPC (Comunicação com a UI)
// ==========================================

// Configurações
ipcMain.handle('get-config', () => {
  return config;
});

ipcMain.handle('set-config', (event, newConfig) => {
  config = {
    ...config,
    ...newConfig,
    downloadModes: {
      ...config.downloadModes,
      ...(newConfig.downloadModes || {})
    },
    torboxForServices: {
      ...config.torboxForServices,
      ...(newConfig.torboxForServices || {})
    },
    serviceMaxConcurrent: {
      ...config.serviceMaxConcurrent,
      ...(newConfig.serviceMaxConcurrent || {})
    }
  };
  saveConfig();
  processQueue();
  return config;
});

ipcMain.handle('select-download-dir', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    defaultPath: config.downloadPath
  });

  if (!result.canceled && result.filePaths.length > 0) {
    config.downloadPath = result.filePaths[0];
    saveConfig();
    return config.downloadPath;
  }
  return null;
});

// Autenticação Google
ipcMain.handle('check-auth', () => {
  const hasCreds = fs.existsSync(CREDENTIALS_FILE);
  const hasToken = fs.existsSync(TOKEN_FILE);
  let email = null;

  if (hasToken && driveService) {
    // Opcional: buscar email do usuário
    // Por simplicidade, assumimos verdadeiro se tiver token válido
  }

  return {
    hasCreds,
    hasToken,
    connected: hasToken && driveService !== null
  };
});

ipcMain.handle('save-credentials', (event, credsJsonString) => {
  try {
    JSON.parse(credsJsonString); // Valida se é JSON válido
    fs.writeFileSync(CREDENTIALS_FILE, credsJsonString, 'utf-8');
    initGoogleClient();
    return { success: true };
  } catch (err) {
    return { success: false, error: 'JSON inválido' };
  }
});

ipcMain.handle('login', () => {
  return new Promise((resolve, reject) => {
    if (!oauth2Client) {
      return reject(new Error('Credenciais da API não encontradas. Configure o credentials.json primeiro.'));
    }

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/drive'],
      prompt: 'consent'
    });

    startLocalOAuthServer(resolve, reject);
    shell.openExternal(authUrl).catch(err => {
      console.error('Erro ao abrir link externo:', err);
      reject(new Error('Nao foi possivel abrir o navegador: ' + err.message));
    });
  });
});

ipcMain.handle('logout', () => {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      fs.unlinkSync(TOKEN_FILE);
    }
    driveService = null;
    oauth2Client = null;
    initGoogleClient(); // Tenta re-inicializar apenas cliente limpo
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

function detectHosterNameFromUrl(url) {
  if (!url || typeof url !== 'string') return 'Desconhecido';
  const u = url.toLowerCase();
  if (u.includes('bunkr')) return 'Bunkr';
  if (u.includes('drime.cloud')) return 'Drime Cloud';
  if (u.includes('turbo.cr') || u.includes('turbocdn')) return 'Turbo.cr';
  if (u.includes('vik1ngfile') || u.includes('vikingfile')) return 'Vik1ngFile';
  if (u.includes('pixeldrain')) return 'PixelDrain';
  if (u.includes('mega.nz') || u.includes('mega.co.nz')) return 'MEGA';
  if (u.includes('terabox') || u.includes('1024tera') || u.includes('gibibox') || u.includes('freeterabox')) return 'TeraBox';
  if (u.includes('mediafire')) return 'MediaFire';
  if (u.includes('gofile.io')) return 'GoFile';
  if (u.includes('send.cm') || u.includes('send.now') || u.includes('sendit.cloud')) return 'Send';
  if (u.includes('onedrive') || u.includes('sharepoint')) return 'Microsoft OneDrive';
  if (u.includes('drive.google')) return 'Google Drive';
  if (u.startsWith('magnet:') || u.endsWith('.torrent')) return 'Torrent';
  
  try {
    const parsed = new URL(url.startsWith('http') ? url : 'https://' + url);
    const domainParts = parsed.hostname.replace(/^www\./i, '').split('.');
    if (domainParts.length >= 2) {
      const name = domainParts[domainParts.length - 2];
      if (name && name.length > 2) return name.charAt(0).toUpperCase() + name.slice(1);
    }
  } catch (e) {}
  return 'Download Direto';
}

async function scanSingleUrl(link) {
  // 0. Links do TeraBox
  if (isTeraBoxUrl(link)) {
    return await scanTeraBoxLink(link);
  }

  // 0.1. Links do MediaFire
  if (isMediaFireUrl(link)) {
    if (isTorboxEnabledForService('mediafire')) {
      try {
        const tbFiles = await scanTorboxLink(link, config.torboxApiKey);
        if (tbFiles && tbFiles.length > 0) return tbFiles;
      } catch (e) {}
    }
    return await scanMediaFireLink(link);
  }

  // 0.15. Links do Send
  if (isSendUrl(link)) {
    if (isTorboxEnabledForService('send')) {
      try {
        const tbFiles = await scanTorboxLink(link, config.torboxApiKey);
        if (tbFiles && tbFiles.length > 0) return tbFiles;
      } catch (e) {}
    }
    return await scanSendLink(link);
  }

  // 0.2. Links do Microsoft OneDrive / SharePoint
  if (isOneDriveUrl(link)) {
    return await scanOneDriveLink(link);
  }

  // 0.21. Links do Drime Cloud
  if (isDrimeUrl(link)) {
    return await scanDrimeLink(link);
  }

  // 0.22. Links do Turbo.cr
  if (isTurboUrl(link)) {
    return await scanTurboLink(link);
  }

  // 0.3. Links do Bunkr (Escaneia nativamente via scanBunkrLink para garantir slugs e URLs diretas exclusivas por arquivo)
  if (isBunkrUrl(link)) {
    return await scanBunkrLink(link);
  }

  // 0.4. Links do Google Drive
  const driveInfo = extractDriveId(link);
  if (driveInfo) {
    if (!driveService) {
      throw new Error('Para escanear links do Google Drive, por favor conecte sua conta Google primeiro nas configurações.');
    }
    if (driveInfo.isFolder) {
      let folderName = 'Pasta_Google_Drive';
      try {
        const metadata = await driveService.files.get({ fileId: driveInfo.id, fields: 'name', supportsAllDrives: true }, { httpsAgent });
        folderName = metadata.data.name || folderName;
      } catch (e) {}
      return await scanGoogleDriveFolder(driveInfo.id, folderName);
    } else {
      const file = await getFileInfo(driveInfo.id);
      file.folderName = 'Arquivos Avulsos';
      return [file];
    }
  }

  // 0.5. Magnet Links / Arquivos .torrent
  const isPureMagnetOrTorrent = link.trim().toLowerCase().startsWith('magnet:?') || link.toLowerCase().endsWith('.torrent') || /^[a-fA-F0-9]{40}$/.test(link.trim());
  if (isPureMagnetOrTorrent) {
    if (config.torboxApiKey && config.torboxApiKey.trim().length > 0) {
      return await scanTorboxLink(link, config.torboxApiKey);
    } else {
      throw new Error('Para escanear e baixar Magnet Links / Torrents, por favor insira sua API Key do Torbox em Ajustes.');
    }
  }

  // 1. Links de Hoster / Torbox
  const domainMatch = link.match(/https?:\/\/(?:www\.)?([^\/]+)/i);
  const domainStr = domainMatch ? domainMatch[1].toLowerCase() : '';
  let hosterKey = 'generic';
  if (domainStr.includes('bunkr') || domainStr.includes('balbums')) hosterKey = 'bunkr';
  else if (domainStr.includes('mediafire')) hosterKey = 'mediafire';
  else if (domainStr.includes('terabox') || domainStr.includes('1024tera') || domainStr.includes('freeterabox')) hosterKey = 'terabox';
  else if (domainStr.includes('drime')) hosterKey = 'drime';
  else if (domainStr.includes('turbo')) hosterKey = 'turbo';
  else if (domainStr.includes('send.now') || domainStr.includes('send.cm')) hosterKey = 'send';
  else if (domainStr.includes('pixeldrain')) hosterKey = 'pixeldrain';
  else if (domainStr.includes('mega.')) hosterKey = 'mega';
  else if (domainStr.includes('rapidgator')) hosterKey = 'rapidgator';
  else if (domainStr.includes('1fichier')) hosterKey = '1fichier';

  if (hosterKey !== 'generic' && isTorboxEnabledForService(hosterKey)) {
    try {
      const tbFiles = await scanTorboxLink(link, config.torboxApiKey);
      if (tbFiles && tbFiles.length > 0) return tbFiles;
    } catch (err) {}
  }

  // 2. Fallback Universal: Motor Genérico
  return await scanGenericLink(link, config.torboxApiKey);
}

// Escaneamento de links (suporta múltiplos links do Google Drive, Bunkr e Provedores)
ipcMain.handle('scan-link', async (event, inputLinks) => {
  if (!inputLinks || typeof inputLinks !== 'string') {
    throw new Error('Por favor, forneça pelo menos um link válido.');
  }

  const rawSegments = inputLinks.split(/(?=https?:\/\/|magnet:\?)/gi);
  const inputLines = [];
  rawSegments.forEach(seg => {
    seg.split(/\r?\n/).forEach(l => {
      const trimmed = l.trim();
      if (trimmed) inputLines.push(trimmed);
    });
  });
  const lines = [];

  for (let rawLine of inputLines) {
    rawLine = rawLine.trim();
    if (rawLine.toLowerCase().startsWith('magnet:?')) {
      lines.push(rawLine);
      continue;
    }

    const magnetMatch = rawLine.match(/(magnet:\?[^\r\n"<>]+)/i);
    if (magnetMatch) {
      lines.push(magnetMatch[1].trim());
      continue;
    }

    const httpMatch = rawLine.match(/(https?:\/\/[^\s"'<>]+)/i);
    if (httpMatch) {
      lines.push(httpMatch[1]);
      continue;
    }

    const cleanHash = rawLine.replace(/[^a-zA-Z0-9]/g, '');
    if (/^[a-fA-F0-9]{40}$/.test(cleanHash) || /^[a-zA-Z2-7]{32}$/.test(cleanHash)) {
      lines.push(`magnet:?xt=urn:btih:${cleanHash}`);
      continue;
    }
  }

  if (lines.length === 0) {
    throw new Error('Nenhum link válido (URL ou Magnet Link) encontrado no texto colado.');
  }

  let aggregatedFiles = [];
  const summaryResults = [];

  for (const link of lines) {
    const hosterName = detectHosterNameFromUrl(link);
    try {
      const linkFiles = await scanSingleUrl(link);
      if (linkFiles && linkFiles.length > 0) {
        linkFiles.forEach(f => {
          if (!f.sourceUrl) f.sourceUrl = link;
          if (!f.url) f.url = link;
        });
        aggregatedFiles = aggregatedFiles.concat(linkFiles);
        summaryResults.push({
          url: link,
          status: 'success',
          filesFound: linkFiles.length,
          hoster: hosterName
        });
      } else {
        summaryResults.push({
          url: link,
          status: 'error',
          error: 'Nenhum arquivo disponível encontrado neste link.',
          hoster: hosterName
        });
      }
    } catch (err) {
      summaryResults.push({
        url: link,
        status: 'error',
        error: err.message || 'Falha ao acessar o link.',
        hoster: hosterName
      });
    }
  }

  if (aggregatedFiles.length === 0) {
    const firstErr = summaryResults.find(r => r.status === 'error' && r.error);
    throw new Error((firstErr && firstErr.error) || 'Nenhum arquivo disponível encontrado nos links informados.');
  }

  const successCount = summaryResults.filter(r => r.status === 'success').length;
  const errorCount = summaryResults.filter(r => r.status === 'error').length;

  return {
    files: aggregatedFiles,
    summary: {
      totalLinks: lines.length,
      successCount: successCount,
      errorCount: errorCount,
      results: summaryResults
    }
  };
});

// Ações da Fila
ipcMain.handle('add-to-queue', (event, files) => {
  files.forEach(file => {
    // Remove qualquer versão antiga existente do mesmo ID (ex: falhado, concluído, etc) para garantir um início limpo
    const existingIndex = downloadQueue.findIndex(item => item.id === file.id);
    if (existingIndex !== -1) {
      const oldItem = downloadQueue[existingIndex];
      if (oldItem.status === 'downloading') {
        const active = activeDownloads.get(file.id);
        if (active) {
          try { active.abortController.abort(); } catch (e) {}
        }
        activeDownloads.delete(file.id);
      }
      downloadQueue.splice(existingIndex, 1);
    }
      let folderName = file.folderName || (file.relativePath && (file.relativePath.includes('/') || file.relativePath.includes('\\')) ? file.relativePath.split(/[/\\]/)[0] : file.name);
      if (!folderName || folderName === 'Downloads' || folderName === 'Arquivos Avulsos') {
        folderName = file.name || 'Downloads';
      }

      let pureFileName = file.name || 'Arquivo';
      if (pureFileName.includes('/')) pureFileName = pureFileName.split('/').pop();
      if (pureFileName.includes('\\')) pureFileName = pureFileName.split('\\').pop();

      let folderSegment = sanitizePathSegment(folderName);
      const extIdx = folderSegment.lastIndexOf('.');
      if (extIdx > 0 && extIdx > folderSegment.length - 6) {
        folderSegment = folderSegment.substring(0, extIdx);
      }

      let finalRelativePath = file.relativePath;
      if (!finalRelativePath || (!finalRelativePath.includes('/') && !finalRelativePath.includes('\\'))) {
        finalRelativePath = `${folderSegment}/${pureFileName}`;
      }

      const itemSourceUrl = file.bunkrPageUrl || file.sourceUrl || file.originUrl || file.albumUrl || file.pageUrl || file.teraboxUrl || file.mediafireUrl || file.oneDriveUrl || file.url || file.directUrl || file.link || null;

      downloadQueue.push({
        id: file.id,
        fileId: file.fileId,
        numericId: file.numericId,
        bunkrPageUrl: file.bunkrPageUrl || itemSourceUrl,
        isHttpDirect: file.isHttpDirect || (file.id && (file.id.startsWith('send_') || file.id.startsWith('drime_') || file.id.startsWith('turbo_') || file.id.startsWith('terabox_') || file.id.startsWith('mediafire_') || file.id.startsWith('bunkr_') || file.id.startsWith('onedrive_') || file.id.startsWith('torbox_'))),
        sendUrl: file.sendUrl || file.url || file.directUrl || file.downloadUrl || null,
        mediafireUrl: file.mediafireUrl || null,
        teraboxUrl: file.teraboxUrl || null,
        teraboxDlink: file.teraboxDlink || null,
        teraboxCookie: file.teraboxCookie || null,
        oneDriveUrl: file.oneDriveUrl || null,
        oneDriveDirectUrl: file.oneDriveDirectUrl || null,
        torboxType: file.torboxType || null,
        torboxId: file.torboxId || 0,
        torboxFileId: file.torboxFileId || 0,
        torboxDownloadUrl: file.torboxDownloadUrl || file.directUrl || file.downloadUrl || null,
        sourceUrl: itemSourceUrl,
        url: file.url || file.sendUrl || file.directUrl || file.downloadUrl || itemSourceUrl || null,
        directUrl: file.directUrl || file.url || file.sendUrl || file.downloadUrl || file.torboxDownloadUrl || null,
        downloadUrl: file.downloadUrl || file.directUrl || file.url || file.sendUrl || null,
        referer: file.referer || null,
        cookieHeader: file.cookieHeader || null,
        name: pureFileName,
        size: file.size,
        relativePath: finalRelativePath,
        folderName: folderName,
        status: 'pending',
        progress: 0,
        downloadedBytes: 0,
        speed: 0,
        eta: 0,
        error: null
      });
  });

  updateQueueUI();
  processQueue();
  return downloadQueue.length;
});

ipcMain.handle('test-torbox-api-key', async (event, apiKey) => {
  try {
    const result = await testTorboxApiKey(apiKey);
    return result;
  } catch (err) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle('get-torbox-user-downloads', async () => {
  try {
    if (!config.torboxApiKey) {
      throw new Error('API Key do Torbox não configurada. Por favor acesse os Ajustes para informar sua chave.');
    }
    const files = await fetchTorboxUserDownloads(config.torboxApiKey);
    return { success: true, files };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

function saveCompletedDownloadToHistory(item) {
  if (!item || !item.name) return;
  config.downloadHistory = config.downloadHistory || [];

  const existsIndex = config.downloadHistory.findIndex(h => h.id === item.id || (h.name === item.name && h.size === item.size));
  if (existsIndex !== -1) {
    config.downloadHistory.splice(existsIndex, 1);
  }

  const rawSourceUrl = item.sourceUrl || item.originUrl || item.albumUrl || item.pageUrl || item.teraboxUrl || item.mediafireUrl || item.oneDriveUrl || item.url || item.directUrl || item.link || '';
  const rawDirectUrl = item.url || item.downloadUrl || item.directUrl || rawSourceUrl;

  const historyEntry = {
    id: item.id || ('hist_' + Date.now()),
    name: item.name,
    size: item.size || 0,
    sizeFormatted: item.sizeFormatted || formatBytes(item.size || 0),
    folderName: item.folderName || 'Downloads',
    url: rawDirectUrl,
    sourceUrl: rawSourceUrl,
    timestamp: Date.now()
  };

  config.downloadHistory.unshift(historyEntry);
  if (config.downloadHistory.length > 500) {
    config.downloadHistory = config.downloadHistory.slice(0, 500);
  }
  saveConfig();
}

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('open-external-url', async (event, url) => {
  if (url && typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))) {
    await shell.openExternal(url);
  }
});

ipcMain.handle('pause-download', (event, fileId) => {
  const item = downloadQueue.find(i => i.id === fileId);
  if (item && item.status === 'downloading') {
    item.status = 'paused';
    const active = activeDownloads.get(fileId);
    if (active) {
      active.abortController.abort();
    }
    activeDownloads.delete(fileId);
    updateQueueUI();
    processQueue();
  }
});

ipcMain.handle('resume-download', (event, fileId) => {
  const item = downloadQueue.find(i => i.id === fileId);
  if (item && (item.status === 'paused' || item.status === 'failed')) {
    item.status = 'pending';
    item.error = null;
    item.progress = (item.size > 0 && item.downloadedBytes) ? Math.min(100, Math.floor((item.downloadedBytes / item.size) * 100)) : 0;
    updateQueueUI();
    processQueue();
  }
});

/**
 * Limpa arquivos parciais/incompletos (.part) e pastas de álbuns não concluídos do disco
 */
async function cleanupIncompleteItemDiskData(item) {
  if (!item || item.status === 'completed') return;

  try {
    const relPath = item.relativePath || item.name;
    const cleanRelPath = sanitizeLocalPath(relPath);
    const localFilePath = path.join(config.downloadPath, cleanRelPath);
    const parentDir = path.dirname(localFilePath);

    // 1. Apaga arquivo local incompleto se existir (com retry para liberar handles no Windows)
    for (let attempt = 0; attempt < 5; attempt++) {
      if (!fs.existsSync(localFilePath)) break;
      try {
        fs.unlinkSync(localFilePath);
        console.log(`[Disk Cleanup] Arquivo incompleto removido do disco: ${localFilePath}`);
        break;
      } catch (e) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // 2. Apaga arquivos temporários de partes (.part, .tmp)
    if (fs.existsSync(parentDir)) {
      const baseName = path.basename(localFilePath);
      const dirFiles = fs.readdirSync(parentDir);
      for (const f of dirFiles) {
        if (f.startsWith(baseName) && (f.includes('.part') || f.includes('.tmp'))) {
          const pFile = path.join(parentDir, f);
          for (let a = 0; a < 5; a++) {
            if (!fs.existsSync(pFile)) break;
            try { fs.unlinkSync(pFile); break; } catch (e) { await new Promise(r => setTimeout(r, 100)); }
          }
        }
      }
    }

    // 3. Se o item pertencia a uma subpasta/pasta de álbum (ex: "gio/video.mp4" ou "Drime_Downloads")
    if (parentDir && parentDir !== config.downloadPath && parentDir.startsWith(config.downloadPath)) {
      if (fs.existsSync(parentDir)) {
        const remainingInDir = fs.readdirSync(parentDir);
        // Verifica se resta algum arquivo com status 'completed' na fila associado a esta pasta
        const hasCompletedInQueue = downloadQueue.some(qItem => {
          if (qItem.status !== 'completed') return false;
          const qPath = path.join(config.downloadPath, sanitizeLocalPath(qItem.relativePath || qItem.name));
          return qPath.startsWith(parentDir);
        });

        if (!hasCompletedInQueue || remainingInDir.length === 0) {
          for (let a = 0; a < 5; a++) {
            if (!fs.existsSync(parentDir)) break;
            try {
              fs.rmSync(parentDir, { recursive: true, force: true });
              console.log(`[Disk Cleanup] Pasta de álbum/subpasta incompleta removida do disco: ${parentDir}`);
              break;
            } catch (e) {
              await new Promise(r => setTimeout(r, 100));
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('[Disk Cleanup Warning] Erro ao limpar pasta/arquivo incompleto:', err.message);
  }
}

ipcMain.handle('cancel-download', async (event, fileId) => {
  const itemIndex = downloadQueue.findIndex(i => i.id === fileId);
  if (itemIndex !== -1) {
    const item = downloadQueue[itemIndex];
    if (item.status === 'downloading') {
      const active = activeDownloads.get(fileId);
      if (active) {
        active.abortController.abort();
      }
      activeDownloads.delete(fileId);
    }
    
    // Limpa arquivos incompletos e pastas de álbuns incompletos do disco
    await cleanupIncompleteItemDiskData(item);

    downloadQueue.splice(itemIndex, 1);
    updateQueueUI();
    processQueue();
  }
});

ipcMain.handle('cancel-downloads', async (event, fileIds) => {
  if (!Array.isArray(fileIds) || fileIds.length === 0) return;
  const idSet = new Set(fileIds);

  const itemsToCancel = downloadQueue.filter(item => idSet.has(item.id));
  downloadQueue = downloadQueue.filter(item => !idSet.has(item.id));

  for (const item of itemsToCancel) {
    if (item.status === 'downloading') {
      const active = activeDownloads.get(item.id);
      if (active) {
        active.abortController.abort();
      }
      activeDownloads.delete(item.id);
    }
    await cleanupIncompleteItemDiskData(item);
  }

  updateQueueUI();
  processQueue();
});

function saveCompletedDownloadToHistory(item) {
  if (!item || !item.name) return;
  config.downloadHistory = config.downloadHistory || [];

  const existsIndex = config.downloadHistory.findIndex(h => h.id === item.id || (h.name === item.name && h.size === item.size));
  if (existsIndex !== -1) {
    config.downloadHistory.splice(existsIndex, 1);
  }

  const historyEntry = {
    id: item.id || ('hist_' + Date.now()),
    name: item.name,
    size: item.size || 0,
    sizeFormatted: item.sizeFormatted || formatBytes(item.size || 0),
    folderName: item.folderName || 'Downloads',
    url: item.url || item.downloadUrl || item.directUrl || '',
    sourceUrl: item.sourceUrl || item.originalUrl || item.url || '',
    timestamp: Date.now()
  };

  config.downloadHistory.unshift(historyEntry);
  if (config.downloadHistory.length > 500) {
    config.downloadHistory = config.downloadHistory.slice(0, 500);
  }
  saveConfig();
}

ipcMain.handle('get-download-history', () => {
  return config.downloadHistory || [];
});

ipcMain.handle('clear-download-history', () => {
  config.downloadHistory = [];
  saveConfig();
  return true;
});

ipcMain.handle('clear-completed', () => {
  downloadQueue = downloadQueue.filter(item => item.status !== 'completed' && item.status !== 'failed');
  updateQueueUI();
});

ipcMain.handle('clear-queue', async () => {
  // Aborta downloads ativos
  for (const [fileId, active] of activeDownloads.entries()) {
    active.abortController.abort();
  }
  activeDownloads.clear();

  const currentItems = [...downloadQueue];
  downloadQueue = [];

  // Limpa todos os arquivos e pastas de álbuns incompletos do disco
  for (const item of currentItems) {
    await cleanupIncompleteItemDiskData(item);
  }

  stopPowerSaveBlocker(); // Desliga o blocker ao limpar a fila
  updateQueueUI();
});

ipcMain.handle('pause-all-downloads', () => {
  downloadQueue.forEach(item => {
    if (item.status === 'downloading' || item.status === 'pending') {
      item.status = 'paused';
    }
  });
  for (const [fileId, active] of activeDownloads.entries()) {
    active.abortController.abort();
  }
  activeDownloads.clear();
  stopPowerSaveBlocker();
  updateQueueUI();
});

ipcMain.handle('resume-all-downloads', () => {
  downloadQueue.forEach(item => {
    if (item.status === 'paused' || item.status === 'failed') {
      item.status = 'pending';
      item.error = null;
    }
  });
  updateQueueUI();
  processQueue();
});

ipcMain.handle('restart-queue', () => {
  downloadQueue.forEach(item => {
    if (item.status !== 'completed') {
      item.status = 'pending';
      item.progress = 0;
      item.downloadedBytes = 0;
      item.error = null;
    }
  });

  updateQueueUI();
  processQueue();
});

ipcMain.handle('open-downloads-folder', (event, itemPath) => {
  if (itemPath && typeof itemPath === 'string') {
    const fullPath = path.isAbsolute(itemPath) ? itemPath : path.join(config.downloadPath, itemPath);
    if (fs.existsSync(fullPath)) {
      shell.showItemInFolder(fullPath);
      return;
    }
  }
  shell.openPath(config.downloadPath);
});

// ==========================================
// ARQUITETURA DO SISTEMA DE ATUALIZAÇÃO (GITHUB RELEASES API + AUTO-UPDATER)
// ==========================================
let cachedLatestRelease = null;
let downloadedInstallerPath = null;

function parseSemVer(v) {
  if (!v) return [0, 0, 0];
  const cleaned = String(v).trim().replace(/^v/i, '').split('-')[0];
  const parts = cleaned.split('.').map(n => parseInt(n, 10) || 0);
  while (parts.length < 3) parts.push(0);
  return parts;
}

function isNewerVersion(remoteVer, currentVer) {
  const [rMajor, rMinor, rPatch] = parseSemVer(remoteVer);
  const [cMajor, cMinor, cPatch] = parseSemVer(currentVer);

  if (rMajor > cMajor) return true;
  if (rMajor < cMajor) return false;
  if (rMinor > cMinor) return true;
  if (rMinor < cMinor) return false;
  return rPatch > cPatch;
}

async function fetchLatestGitHubRelease() {
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.github.com',
      path: '/repos/alazter/nexus-downloader/releases',
      method: 'GET',
      headers: {
        'User-Agent': 'Nexus-Downloader-App',
        'Accept': 'application/vnd.github.v3+json'
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode === 200) {
            const releases = JSON.parse(body);
            if (Array.isArray(releases) && releases.length > 0) {
              const latest = releases.find(r => !r.draft) || releases[0];
              resolve(latest);
              return;
            }
          }
          resolve(null);
        } catch (e) {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.end();
  });
}

// IPC Handlers para Auto-Updater
ipcMain.handle('check-for-updates', async () => {
  const currentVersion = app.getVersion();

  try {
    const release = await fetchLatestGitHubRelease();
    if (release) {
      cachedLatestRelease = release;
      const remoteVersion = release.tag_name || release.name || currentVersion;
      const updateAvailable = isNewerVersion(remoteVersion, currentVersion);

      if (updateAvailable && Notification.isSupported()) {
        try {
          new Notification({
            title: '⚡ Nexus Downloader',
            body: `Nova versão ${remoteVersion} disponível para download!`,
            icon: path.join(__dirname, 'renderer', 'icon.png')
          }).show();
        } catch (e) {}
      }

      const payload = {
        success: true,
        updateAvailable,
        currentVersion,
        version: remoteVersion,
        title: release.name || `⚡ Nexus ${remoteVersion}`,
        body: release.body || 'Melhorias de desempenho e correções gerais de estabilidade.',
        publishedAt: release.published_at,
        assets: release.assets || []
      };

      if (mainWindow) {
        mainWindow.webContents.send('updater-status', {
          status: updateAvailable ? 'available' : 'not-available',
          ...payload
        });
      }

      return payload;
    }
  } catch (err) {
    console.error('[AutoUpdater] Erro ao consultar GitHub Releases API:', err.message);
  }

  // Fallback para electron-updater
  try {
    const result = await autoUpdater.checkForUpdates();
    return { success: true, updateInfo: result ? result.updateInfo : null };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('download-update', async () => {
  try {
    if (cachedLatestRelease && cachedLatestRelease.assets && cachedLatestRelease.assets.length > 0) {
      const assets = cachedLatestRelease.assets;
      const isPortable = !!process.env.PORTABLE_EXECUTABLE_DIR || app.getPath('exe').toLowerCase().includes('portable');

      let targetAsset = null;
      if (isPortable) {
        targetAsset = assets.find(a => a.name.toLowerCase().includes('portable') && a.name.endsWith('.exe'));
      }
      if (!targetAsset) {
        targetAsset = assets.find(a => a.name.toLowerCase().includes('setup') && a.name.endsWith('.exe'));
      }
      if (!targetAsset) {
        targetAsset = assets.find(a => a.name.endsWith('.exe'));
      }

      if (targetAsset && targetAsset.browser_download_url) {
        const downloadUrl = targetAsset.browser_download_url;
        const destDir = path.join(app.getPath('temp'), 'NexusDownloaderUpdates');
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

        const destPath = path.join(destDir, targetAsset.name);
        downloadedInstallerPath = destPath;

        // Stream download via https
        await new Promise((resolve, reject) => {
          const fileStream = fs.createWriteStream(destPath);
          let downloadedBytes = 0;
          const totalBytes = targetAsset.size || 0;
          const startTime = Date.now();

          const downloadReq = (urlStr) => {
            https.get(urlStr, { headers: { 'User-Agent': 'Nexus-Downloader-App' } }, (res) => {
              if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                downloadReq(res.headers.location);
                return;
              }

              if (res.statusCode !== 200) {
                reject(new Error(`HTTP Error ${res.statusCode}`));
                return;
              }

              res.on('data', (chunk) => {
                downloadedBytes += chunk.length;
                fileStream.write(chunk);

                const elapsedSec = (Date.now() - startTime) / 1000 || 0.1;
                const bytesPerSec = downloadedBytes / elapsedSec;
                const mbps = ((bytesPerSec * 8) / (1024 * 1024)).toFixed(2);
                const percent = totalBytes > 0 ? ((downloadedBytes / totalBytes) * 100).toFixed(1) : 0;

                if (mainWindow) {
                  mainWindow.webContents.send('updater-status', {
                    status: 'downloading',
                    percent,
                    transferred: downloadedBytes,
                    total: totalBytes,
                    bytesPerSecond: bytesPerSec,
                    mbps
                  });
                }
              });

              res.on('end', () => {
                fileStream.end();
                resolve();
              });

              res.on('error', (err) => {
                fileStream.destroy();
                reject(err);
              });
            }).on('error', reject);
          };

          downloadReq(downloadUrl);
        });

        if (mainWindow) {
          mainWindow.webContents.send('updater-status', {
            status: 'downloaded',
            version: cachedLatestRelease.tag_name,
            exePath: downloadedInstallerPath,
            msg: 'Atualização baixada e pronta para instalar!'
          });
        }

        return { success: true, exePath: downloadedInstallerPath };
      }
    }

    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (err) {
    console.error('[AutoUpdater] Erro no download da atualização:', err.message);
    try {
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (e) {
      return { success: false, error: err.message };
    }
  }
});

ipcMain.handle('restart-and-install', () => {
  if (downloadedInstallerPath && fs.existsSync(downloadedInstallerPath)) {
    try {
      app.releaseSingleInstanceLock();
      shell.openPath(downloadedInstallerPath);
      setTimeout(() => {
        app.quit();
      }, 500);
      return;
    } catch (e) {
      console.error('[AutoUpdater] Erro ao abrir executável atualizado:', e);
    }
  }
  autoUpdater.quitAndInstall();
});
