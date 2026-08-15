const { app, BrowserWindow, ipcMain, shell, dialog, Notification, powerSaveBlocker } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const url = require('url');
const { google } = require('googleapis');
const { isBunkrUrl, scanBunkrLink, resolveBunkrDirectUrl } = require('./bunkr-scanner');
const { isMediaFireUrl, scanMediaFireLink, resolveMediaFireDirectUrl } = require('./mediafire-scanner');

// Desativa o congelamento de processos/rede do Chromium em segundo plano quando os monitores desligam
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

// Agente HTTPS customizado com Keep-Alive ativado para reutilização extrema de conexões TCP/TLS
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 128,          // Permite até 128 sockets paralelos
  keepAliveMsecs: 30000,    // Mantém as conexões ativas por 30 segundos
  freeSocketTimeout: 30000, // Timeout de sockets ociosos
  timeout: 60000            // Timeout de conexão geral
});

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
  downloadMode: 'single', // Legado
  downloadModes: {
    gdrive: 'single',
    bunkr: 'multi',
    mediafire: 'multi'
  }
};

function getDownloadMode(service) {
  if (config.downloadModes && config.downloadModes[service]) {
    return config.downloadModes[service];
  }
  return config.downloadMode || 'single';
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
      isHttpDirect: item.isHttpDirect || (item.id && (item.id.startsWith('mediafire_') || item.id.startsWith('bunkr_'))),
      mediafireUrl: item.mediafireUrl || null,
      name: item.name,
      size: item.size,
      relativePath: item.relativePath,
      folderName: item.folderName || 'Downloads',
      status: item.status === 'downloading' ? 'pending' : item.status,
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
        downloadQueue = data.map(item => ({
          ...item,
          folderName: item.folderName || 'Downloads',
          status: item.status === 'downloading' ? 'pending' : item.status,
          speed: 0,
          eta: 0
        }));
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
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 720,
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
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.webContents.on('did-finish-load', () => {
    updateQueueUI();
  });

  // Abre o console de desenvolvedor para ajudar no debug dos logs de rede/erros
  mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
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
      mainWindow.webContents.send('updater-status', {
        status: 'downloading',
        percent: progressObj.percent.toFixed(1),
        speed: progressObj.bytesPerSecond
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

// Inicializa a janela quando o app estiver pronto
app.whenReady().then(() => {
  createWindow();

  // Tenta inicializar o cliente do Google com credenciais existentes
  initGoogleClient();

  // Configura e verifica atualizações automaticamente
  setupAutoUpdater();
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify().catch(err => console.error('[AutoUpdater] erro inicial:', err));
  }, 4000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
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
      error: item.error
    }));
    mainWindow.webContents.send('queue-updated', serializedQueue);
  }
}

async function processQueue() {
  const activeCount = Array.from(downloadQueue.values()).filter(i => i.status === 'downloading').length;
  
  if (activeCount > 0) {
    startPowerSaveBlocker();
  }

  if (activeCount >= config.maxConcurrent) return;

  const nextItem = downloadQueue.find(item => item.status === 'pending');
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

  downloadFile(nextItem)
    .then(() => {
      nextItem.status = 'completed';
      nextItem.progress = 100;
      nextItem.speed = 0;
      nextItem.eta = 0;
      activeDownloads.delete(nextItem.id);
      updateQueueUI();
      processQueue(); // Pega o próximo
    })
    .catch((err) => {
      console.error(`[ERROR] Download falhou para "${nextItem.name}":`, err);
      if (nextItem.status !== 'paused') {
        nextItem.status = 'failed';
        nextItem.error = err.message || 'Erro desconhecido';
        updateQueueUI();
      }
      activeDownloads.delete(nextItem.id);
      
      // Delay de 2 segundos antes de processar o próximo item para evitar bombardeio/flood na API
      setTimeout(() => {
        processQueue();
      }, 2000);
    });

  // Tenta processar mais arquivos se o limite de concorrência permitir
  processQueue();
}

function downloadBunkrFile(queueItem) {
  return new Promise(async (resolve, reject) => {
    let isAborted = false;
    const abortController = new AbortController();

    activeDownloads.set(queueItem.id, {
      abortController,
      queueItem
    });

    const localFilePath = path.join(config.downloadPath, queueItem.relativePath);
    const localDir = path.dirname(localFilePath);

    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }

    try {
      let directUrl = '';
      let referer = 'https://bunkr.cr/';
      let cookieHeader = '';

      if (queueItem.id && queueItem.id.startsWith('mediafire_')) {
        console.log(`[MediaFire Worker] Resolvendo link direto CDN para "${queueItem.name}"...`);
        const mfInfo = await resolveMediaFireDirectUrl(queueItem.numericId, queueItem.mediafireUrl);
        directUrl = mfInfo.directUrl;
        referer = mfInfo.referer || 'https://www.mediafire.com/';
      } else {
        console.log(`[Bunkr Worker] Resolvendo URL direta e cookies para "${queueItem.name}"...`);
        const bunkrInfo = await resolveBunkrDirectUrl(queueItem.numericId, queueItem.fileId);
        directUrl = bunkrInfo.directUrl || bunkrInfo;
        referer = bunkrInfo.referer || 'https://bunkr.cr/';
        cookieHeader = bunkrInfo.cookieHeader || '';
      }

      console.log(`[HTTP Direct Worker] URL direta obtida com sucesso:`, directUrl);

      if (abortController.signal.aborted) {
        return reject(new Error('Download cancelado'));
      }

      const parsedUrl = new URL(directUrl);
      const transport = parsedUrl.protocol === 'https:' ? https : http;

      const reqOptions = {
        rejectUnauthorized: false,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
          'Referer': referer,
          'Cookie': cookieHeader
        }
      };

      const service = (queueItem.id && queueItem.id.startsWith('mediafire_')) ? 'mediafire' : 'bunkr';
      const mode = getDownloadMode(service);
      const isMultiMode = mode === 'multi' && (queueItem.size > 5 * 1024 * 1024);

      let lastTime = Date.now();
      let lastBytes = 0;

      const progressInterval = setInterval(() => {
        if (isAborted) return;
        const now = Date.now();
        const timeDiff = (now - lastTime) / 1000;
        if (timeDiff > 0.5) {
          const bytesDiff = queueItem.downloadedBytes - lastBytes;
          queueItem.speed = bytesDiff / timeDiff;
          lastTime = now;
          lastBytes = queueItem.downloadedBytes;

          if (queueItem.size > 0 && queueItem.speed > 0) {
            const remainingBytes = queueItem.size - queueItem.downloadedBytes;
            queueItem.eta = Math.max(0, Math.ceil(remainingBytes / queueItem.speed));
            queueItem.progress = Math.min(100, Math.floor((queueItem.downloadedBytes / queueItem.size) * 100));
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

            segReq.on('error', rejSeg);
          });

          segmentPromises.push(p);
        }

        try {
          await Promise.all(segmentPromises);
          clearInterval(progressInterval);
          return resolve();
        } catch (err) {
          clearInterval(progressInterval);
          return reject(err);
        }
      }

      // Conexão Única (Single stream fallback)
      console.log(`[HTTP Direct Worker] Iniciando conexão única para ${service}: "${queueItem.name}"`);
      const writeStream = fs.createWriteStream(localFilePath, { highWaterMark: 1024 * 1024 });

      const req = transport.get(directUrl, reqOptions, res => {
        if (res.statusCode !== 200 && res.statusCode !== 206) {
          clearInterval(progressInterval);
          writeStream.destroy();
          return reject(new Error(`Servidor retornou HTTP ${res.statusCode}`));
        }

        if (res.headers['content-type'] && res.headers['content-type'].includes('text/html')) {
          clearInterval(progressInterval);
          writeStream.destroy();
          return reject(new Error('Servidor retornou HTML (desafio não resolvido)'));
        }

        const totalLength = parseInt(res.headers['content-length'], 10);
        if (totalLength && totalLength > 0 && (!queueItem.size || queueItem.size === 0)) {
          queueItem.size = totalLength;
          queueItem.sizeFormatted = formatBytes(totalLength);
        }

        res.on('data', chunk => {
          if (isAborted) return;
          queueItem.downloadedBytes += chunk.length;
        });

        res.pipe(writeStream);

        writeStream.on('finish', () => {
          clearInterval(progressInterval);
          if (isAborted) {
            reject(new Error('Download cancelado'));
          } else {
            resolve();
          }
        });

        writeStream.on('error', err => {
          clearInterval(progressInterval);
          reject(err);
        });

      });
    } catch (err) {
      reject(err);
    }
  });
}

function downloadFile(queueItem) {
  if (queueItem.isHttpDirect || (queueItem.id && (queueItem.id.startsWith('mediafire_') || queueItem.id.startsWith('bunkr_')))) {
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
    }
  };
  saveConfig();
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

// Escaneamento de links (suporta múltiplos links do Google Drive e Bunkr)
ipcMain.handle('scan-link', async (event, inputLinks) => {
  if (!inputLinks || typeof inputLinks !== 'string') {
    throw new Error('Por favor, forneça pelo menos um link válido.');
  }

  const normalizedInput = inputLinks.replace(/(https?:\/\/[^\s"'<>]+?)(https?:\/\/)/gi, '$1\n$2');
  const extractedUrls = normalizedInput.match(/(https?:\/\/[^\s"'<>]+)/gi) || [];
  const lines = extractedUrls
    .map(l => l.trim().replace(/[,;]+$/, ''))
    .filter(l => l.length > 0);

  if (lines.length === 0) {
    throw new Error('Nenhum link válido encontrado no texto colado.');
  }

  let aggregatedFiles = [];

  for (const link of lines) {
    // 0. Links do MediaFire
    if (isMediaFireUrl(link)) {
      try {
        console.log('[main.js] Link do MediaFire detectado! Escaneando:', link);
        const mfFiles = await scanMediaFireLink(link);
        if (mfFiles && mfFiles.length > 0) {
          aggregatedFiles = aggregatedFiles.concat(mfFiles);
        } else {
          console.warn('[main.js] Nenhum arquivo retornado do MediaFire para:', link);
        }
      } catch (err) {
        console.error('Erro ao escanear link MediaFire:', link, err.message);
        throw new Error(`Erro ao escanear MediaFire: ${err.message}`);
      }
      continue;
    }
    // 1. Verifica se é um link do Bunkr
    if (isBunkrUrl(link)) {
      try {
        const bunkrFiles = await scanBunkrLink(link);
        aggregatedFiles = aggregatedFiles.concat(bunkrFiles);
      } catch (err) {
        console.error('Erro ao escanear link Bunkr:', link, err.message);
      }
      continue;
    }

    // 2. Links do Google Drive
    if (!driveService) {
      throw new Error('Para escanear links do Google Drive, por favor conecte sua conta Google primeiro nas configurações.');
    }

    const driveInfo = extractDriveId(link);
    if (!driveInfo) continue;

    if (driveInfo.isFolder) {
      let folderName = '';
      try {
        const metadata = await driveService.files.get(
          {
            fileId: driveInfo.id,
            fields: 'name',
            supportsAllDrives: true
          },
          {
            httpsAgent: httpsAgent
          }
        );
        folderName = metadata.data.name || 'Pasta_Google_Drive';
      } catch (err) {
        console.warn('Nao foi possivel obter o nome da pasta pai, usando padrao:', err.message);
        folderName = 'Pasta_Google_Drive';
      }
      const files = await scanGoogleDriveFolder(driveInfo.id, folderName);
      aggregatedFiles = aggregatedFiles.concat(files);
    } else {
      const file = await getFileInfo(driveInfo.id);
      file.folderName = 'Arquivos Avulsos';
      aggregatedFiles.push(file);
    }
  }

  if (aggregatedFiles.length === 0) {
    throw new Error('Nenhum arquivo encontrado nos links informados.');
  }

  return aggregatedFiles;
});

// Ações da Fila
ipcMain.handle('add-to-queue', (event, files) => {
  files.forEach(file => {
    // Evita duplicatas na fila se já existir o mesmo ID com status pendente ou baixando
    const exists = downloadQueue.some(item => item.id === file.id && (item.status === 'pending' || item.status === 'downloading'));
    if (!exists) {
      const folderName = file.folderName || (file.relativePath ? file.relativePath.split(path.sep)[0] : 'Downloads');
      downloadQueue.push({
        id: file.id,
        fileId: file.fileId,
        numericId: file.numericId,
        isHttpDirect: file.isHttpDirect || (file.id && (file.id.startsWith('mediafire_') || file.id.startsWith('bunkr_'))),
        mediafireUrl: file.mediafireUrl || null,
        name: file.name,
        size: file.size,
        relativePath: file.relativePath,
        folderName: folderName,
        status: 'pending',
        progress: 0,
        downloadedBytes: 0,
        speed: 0,
        eta: 0,
        error: null
      });
    }
  });

  updateQueueUI();
  processQueue();
  return downloadQueue.length;
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
    item.progress = 0;
    updateQueueUI();
    processQueue();
  }
});

ipcMain.handle('cancel-download', (event, fileId) => {
  const itemIndex = downloadQueue.findIndex(i => i.id === fileId);
  if (itemIndex !== -1) {
    const item = downloadQueue[itemIndex];
    if (item.status === 'downloading') {
      const active = activeDownloads.get(fileId);
      if (active) {
        active.abortController.abort();
      }
      activeDownloads.delete(fileId);

      // Deleta o arquivo parcial se existir
      const localFilePath = path.join(config.downloadPath, item.relativePath);
      if (fs.existsSync(localFilePath)) {
        try { fs.unlinkSync(localFilePath); } catch (e) {}
      }
    }
    
    downloadQueue.splice(itemIndex, 1);
    updateQueueUI();
    processQueue();
  }
});

ipcMain.handle('clear-completed', () => {
  downloadQueue = downloadQueue.filter(item => item.status !== 'completed' && item.status !== 'failed');
  updateQueueUI();
});

ipcMain.handle('clear-queue', () => {
  // Aborta downloads ativos
  for (const [fileId, active] of activeDownloads.entries()) {
    active.abortController.abort();
  }
  activeDownloads.clear();
  downloadQueue = [];
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

ipcMain.handle('open-downloads-folder', () => {
  shell.openPath(config.downloadPath);
});

// IPC Handlers para Auto-Updater
ipcMain.handle('check-for-updates', async () => {
  try {
    const result = await autoUpdater.checkForUpdates();
    return { success: true, updateInfo: result ? result.updateInfo : null };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('download-update', async () => {
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('restart-and-install', () => {
  autoUpdater.quitAndInstall();
});
