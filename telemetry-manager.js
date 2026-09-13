// Nexus Downloader - Gerenciador de Telemetria e Diagnósticos
// Grava os 6 dados vitais e sincroniza com a pasta 'Nexus Downloader Logs' no Google Drive
const fs = require('fs');
const path = require('path');
const stream = require('stream');

const PRIMARY_TELEMETRY_DIR = 'C:\\Users\\alazt\\Documents\\GitHub\\Projetos\\Telemetria\\Nexus Downloader';

let telemetryLogsDir = null;
let currentDayLogFile = null;
let memoryLogBuffer = [];
let googleDriveFolderId = null;

function initTelemetry(customPath) {
  // Prioridade: pasta C:\Users\alazt\Documents\GitHub\Projetos\Telemetria\Nexus Downloader
  if (customPath && typeof customPath === 'string' && fs.existsSync(customPath)) {
    telemetryLogsDir = customPath;
  } else if (fs.existsSync(PRIMARY_TELEMETRY_DIR)) {
    telemetryLogsDir = PRIMARY_TELEMETRY_DIR;
  } else {
    try {
      fs.mkdirSync(PRIMARY_TELEMETRY_DIR, { recursive: true });
      telemetryLogsDir = PRIMARY_TELEMETRY_DIR;
    } catch (e) {
      telemetryLogsDir = customPath ? path.join(customPath, 'telemetry_logs') : path.join(process.cwd(), 'telemetry_logs');
      if (!fs.existsSync(telemetryLogsDir)) {
        fs.mkdirSync(telemetryLogsDir, { recursive: true });
      }
    }
  }

  const today = new Date().toISOString().split('T')[0];
  currentDayLogFile = path.join(telemetryLogsDir, `nexus_telemetry_${today}.json`);
  loadMemoryBuffer();
  console.log(`[Telemetry] Diretório de telemetria ativo: ${telemetryLogsDir}`);
}

function getTelemetryLogsDir() {
  return telemetryLogsDir || PRIMARY_TELEMETRY_DIR;
}

function loadMemoryBuffer() {
  if (currentDayLogFile && fs.existsSync(currentDayLogFile)) {
    try {
      const content = fs.readFileSync(currentDayLogFile, 'utf-8');
      memoryLogBuffer = JSON.parse(content);
      if (!Array.isArray(memoryLogBuffer)) memoryLogBuffer = [];
    } catch (e) {
      memoryLogBuffer = [];
    }
  }
}

function saveLocalLog() {
  if (!currentDayLogFile) return;
  try {
    fs.writeFileSync(currentDayLogFile, JSON.stringify(memoryLogBuffer, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Telemetry] Erro ao salvar log local:', err.message);
  }
}

// 1. Gravação dos 6 Dados Vitais ao Concluir Download
function recordDownloadSuccess(queueItem) {
  const record = buildVitalMetrics(queueItem, true, null);
  memoryLogBuffer.push(record);
  saveLocalLog();
}

// 2. Gravação em Caso de Falha de Download
function recordDownloadFailure(queueItem, error) {
  const record = buildVitalMetrics(queueItem, false, error);
  memoryLogBuffer.push(record);
  saveLocalLog();
}

// Constrói o objeto com os 6 dados vitais padronizados
function buildVitalMetrics(item, isSuccess, error) {
  const origUrl = item.sourceUrl || item.bunkrPageUrl || item.url || item.directUrl || 'Desconhecido';
  const service = item.service || detectServiceFromItem(item);
  const route = (item.torboxId || (item.id && item.id.startsWith('torbox_')) || item.torboxType) ? 'Torbox Cloud' : 'Motor Nativo Direto';
  const fileType = detectFileType(item.name || item.url || '');

  // Cálculo de velocidade média e tempo
  const duration = item.completedAt && item.addedAt ? Math.max(1, Math.round((item.completedAt - item.addedAt) / 1000)) : 0;
  const sizeBytes = item.size || item.downloadedBytes || 0;
  const avgSpeedMBs = duration > 0 ? parseFloat((sizeBytes / (1024 * 1024 * duration)).toFixed(2)) : parseFloat(((item.speed || 0) / (1024 * 1024)).toFixed(2));

  let errorDetails = null;
  if (!isSuccess && error) {
    errorDetails = {
      message: error.message || String(error),
      code: error.code || null,
      statusCode: error.statusCode || (error.response ? error.response.status : null),
      reason: parseErrorReason(error)
    };
  }

  return {
    timestamp: new Date().toISOString(),
    originalUrl: origUrl,
    totalFiles: item.batchTotalFiles || 1,
    route: route,
    status: isSuccess ? 'success' : 'failed',
    service: service,
    fileType: fileType,
    fileName: item.name || 'arquivo',
    fileSizeBytes: sizeBytes,
    avgSpeedMBs: avgSpeedMBs,
    durationSeconds: duration,
    errorDetails: errorDetails
  };
}

function parseErrorReason(err) {
  const msg = (err.message || '').toLowerCase();
  if (msg.includes('401') || msg.includes('unauthorized')) return 'HTTP 401 Unauthorized (Token ou API Key expirada)';
  if (msg.includes('403') || msg.includes('forbidden')) return 'HTTP 403 Forbidden (Bloqueio de IP ou Limite)';
  if (msg.includes('404')) return 'HTTP 404 Not Found (Arquivo removido pelo hoster)';
  if (msg.includes('416')) return 'HTTP 416 Range Not Satisfiable (Segmentação não suportada)';
  if (msg.includes('malwarebytes') || msg.includes('antivírus')) return 'Bloqueio de Antivírus / Falso Positivo Local';
  if (msg.includes('timeout') || msg.includes('tempo limite')) return 'CDN Timeout (Servidor sem resposta)';
  if (msg.includes('econnreset')) return 'Conexão reiniciada pelo servidor remoto';
  return 'Falha geral de transferência';
}

function detectServiceFromItem(item) {
  const id = (item.id || '').toLowerCase();
  const url = (item.sourceUrl || item.url || '').toLowerCase();

  if (id.startsWith('gofile') || url.includes('gofile.io')) return 'GoFile';
  if (id.startsWith('bunkr') || url.includes('bunkr')) return 'Bunkr';
  if (id.startsWith('torbox') || url.includes('torbox')) return 'Torbox';
  if (id.startsWith('pixeldrain') || url.includes('pixeldrain')) return 'PixelDrain';
  if (id.startsWith('viking') || url.includes('vikingfile')) return 'Vik1ngFile';
  if (id.startsWith('mediafire') || url.includes('mediafire')) return 'MediaFire';
  if (id.startsWith('send') || url.includes('send.cm') || url.includes('send.now')) return 'Send';
  if (id.startsWith('terabox') || url.includes('terabox') || url.includes('1024tera')) return 'TeraBox';
  if (id.startsWith('turbo') || url.includes('turbo.cr')) return 'Turbo.cr';
  if (id.startsWith('drime') || url.includes('drime.cloud')) return 'Drime Cloud';
  if (url.includes('drive.google.com')) return 'Google Drive';
  return 'Genérico / Web';
}

function detectFileType(nameOrUrl) {
  const lower = nameOrUrl.toLowerCase();
  if (lower.match(/\.(mp4|mkv|avi|mov|wmv|webm|flv|m4v)/)) return '.Vídeo';
  if (lower.match(/\.(zip|rar|7z|tar|gz|bz2)/)) return '.Zip';
  if (lower.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)/)) return '.Foto';
  if (lower.match(/\.(torrent|magnet)/)) return '.Torrents';
  if (lower.match(/\.(mp3|wav|flac|aac|ogg|m4a)/)) return '.Áudio';
  return '.Arquivo';
}

// 3. Sincronização Automática com a Pasta 'Nexus Downloader Logs' no Google Drive
async function syncWithGoogleDrive(driveService) {
  if (!driveService) {
    return { success: false, reason: 'Google Drive desconectado' };
  }

  try {
    // Localizar ou Criar pasta 'Nexus Downloader Logs'
    if (!googleDriveFolderId) {
      const searchRes = await driveService.files.list({
        q: "name = 'Nexus Downloader Logs' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
        fields: 'files(id, name)',
        spaces: 'drive'
      });

      if (searchRes.data.files && searchRes.data.files.length > 0) {
        googleDriveFolderId = searchRes.data.files[0].id;
        console.log(`[Telemetry] Pasta 'Nexus Downloader Logs' encontrada: ${googleDriveFolderId}`);
      } else {
        const createRes = await driveService.files.create({
          requestBody: {
            name: 'Nexus Downloader Logs',
            mimeType: 'application/vnd.google-apps.folder',
            description: 'Relatórios analíticos e métricas anônimas de desempenho do Nexus Downloader'
          },
          fields: 'id'
        });
        googleDriveFolderId = createRes.data.id;
        console.log(`[Telemetry] Pasta 'Nexus Downloader Logs' criada com sucesso: ${googleDriveFolderId}`);
      }
    }

    // Preparar arquivo de log do dia atual
    const today = new Date().toISOString().split('T')[0];
    const logFileName = `nexus_telemetry_${today}.json`;
    const logContent = JSON.stringify(memoryLogBuffer, null, 2);

    // Verificar se arquivo do dia já existe na pasta
    const fileSearch = await driveService.files.list({
      q: `name = '${logFileName}' and '${googleDriveFolderId}' in parents and trashed = false`,
      fields: 'files(id, name)',
      spaces: 'drive'
    });

    const bufferStream = new stream.PassThrough();
    bufferStream.end(Buffer.from(logContent, 'utf-8'));

    const media = {
      mimeType: 'application/json',
      body: bufferStream
    };

    if (fileSearch.data.files && fileSearch.data.files.length > 0) {
      const fileId = fileSearch.data.files[0].id;
      await driveService.files.update({
        fileId: fileId,
        media: media
      });
      console.log(`[Telemetry] Relatório diário '${logFileName}' atualizado no Google Drive.`);
    } else {
      await driveService.files.create({
        requestBody: {
          name: logFileName,
          parents: [googleDriveFolderId]
        },
        media: media,
        fields: 'id'
      });
      console.log(`[Telemetry] Novo relatório diário '${logFileName}' enviado para o Google Drive.`);
    }

    return { success: true, count: memoryLogBuffer.length, folderId: googleDriveFolderId };
  } catch (err) {
    console.error('[Telemetry] Erro ao sincronizar com Google Drive:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = {
  initTelemetry,
  getTelemetryLogsDir,
  recordDownloadSuccess,
  recordDownloadFailure,
  syncWithGoogleDrive,
  getMemoryLogs: () => memoryLogBuffer
};
