// Nexus Downloader - Local Bridge Server para Extensões Chromium
// Roda em loopback local seguro: 127.0.0.1:41523
const http = require('http');
const { shell } = require('electron');

const BRIDGE_PORT = 41523;
const BRIDGE_HOST = '127.0.0.1';

let serverInstance = null;
let lastActivityTime = 0;
let isExtensionConnected = false;
let bridgeCallbacks = {
  getQueue: () => [],
  addItemsToQueue: () => {},
  scanUrl: async () => [],
  getConfig: () => ({}),
  setConfig: () => {},
  getSpeedStats: () => ({ speedMBs: 0, activeCount: 0 })
};

function startBridgeServer(callbacks) {
  if (callbacks) {
    bridgeCallbacks = { ...bridgeCallbacks, ...callbacks };
  }

  if (serverInstance) {
    return serverInstance;
  }

  serverInstance = http.createServer(async (req, res) => {
    // Cabeçalhos CORS padrão para permitir requisições da extensão
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const parsedUrl = new URL(req.url, `http://${BRIDGE_HOST}:${BRIDGE_PORT}`);
    const pathname = parsedUrl.pathname;

    // 1. GET /api/status - Telemetria e progresso para o HUD da extensão
    if (req.method === 'GET' && pathname === '/api/status') {
      try {
        const queue = bridgeCallbacks.getQueue() || [];
        const stats = bridgeCallbacks.getSpeedStats ? bridgeCallbacks.getSpeedStats() : { speedMBs: 0, activeCount: 0 };
        const downloadingItems = queue.filter(i => i.status === 'downloading');
        const completedItems = queue.filter(i => i.status === 'completed');
        const pendingItems = queue.filter(i => i.status === 'pending');

        let activeFile = null;
        if (downloadingItems.length > 0) {
          const first = downloadingItems[0];
          activeFile = {
            id: first.id,
            name: first.name,
            progress: first.progress || 0,
            speed: first.speed || 0,
            service: first.service || 'GoFile',
            type: first.type || '.Vídeo'
          };
        }

        const isFinished = queue.length > 0 && downloadingItems.length === 0 && pendingItems.length === 0;

        const appConfig = bridgeCallbacks.getConfig ? bridgeCallbacks.getConfig() : {};
        const hasTorboxKey = !!(appConfig.torboxApiKey && String(appConfig.torboxApiKey).trim().length > 0);
        const torboxConfigured = hasTorboxKey && appConfig.torboxEnabled !== false;
        const torboxKeyMasked = (hasTorboxKey || torboxConfigured) ? '••••••••••••••••••••••••' : '';

        const activeAndPending = [...downloadingItems, ...pendingItems];
        const recentCompleted = completedItems.slice(-100).reverse();
        const prioritizedItems = [...activeAndPending, ...recentCompleted];

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          connected: true,
          total: queue.length,
          completed: completedItems.length,
          downloading: downloadingItems.length,
          pending: pendingItems.length,
          speedMBs: stats.speedMBs || 0,
          speedFormatted: `${(stats.speedMBs || 0).toFixed(1)} MB/s`,
          activeFile: activeFile,
          isCompleted: isFinished,
          torboxConfigured,
          torboxKeyMasked,
          items: prioritizedItems.slice(0, 150).map(i => ({
            id: i.id,
            name: i.name,
            status: i.status,
            progress: i.progress || 0,
            speed: i.speed || 0,
            size: i.size || 0,
            sizeFormatted: i.sizeFormatted || '',
            service: i.service || '',
            type: i.type || '',
            url: i.url || i.directUrl || i.sourceUrl || null,
            sourceUrl: i.sourceUrl || i.bunkrPageUrl || i.url || null,
            folderName: i.folderName || null,
            batchId: i.batchId || null
          }))
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    // 1.5. POST /api/bridge/state - Sincronização explícita de conexão/desconexão da extensão
    if (req.method === 'POST' && pathname === '/api/bridge/state') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');
          isExtensionConnected = payload.connected === true;
          if (isExtensionConnected) {
            lastActivityTime = Date.now();
          } else {
            lastActivityTime = 0;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, isConnected: isExtensionConnected }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      });
      return;
    }

    // 2. POST /api/queue/add - Recebe lista de downloads da extensão
    if (req.method === 'POST' && pathname === '/api/queue/add') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');
          const rawItems = payload.items || [];
          if (!rawItems.length) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Lista de arquivos vazia' }));
            return;
          }

          const items = rawItems.map(item => ({
            ...item,
            source: 'web'
          }));

          if (bridgeCallbacks.addItemsToQueue) {
            Promise.resolve(bridgeCallbacks.addItemsToQueue(items, payload.telemetryEnabled))
              .catch(err => console.error('[Bridge Server] Erro ao adicionar itens à fila:', err));
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, count: items.length }));
        } catch (err) {
          console.error('[Bridge Server] Erro no endpoint /api/queue/add:', err);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message || 'JSON malformado' }));
        }
      });
      return;
    }

    // 2.5. POST /api/scan - Varre uma URL usando os scanners nativos do desktop (GoFile, Bunkr, etc.)
    if (req.method === 'POST' && pathname === '/api/scan') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const payload = JSON.parse(body);
          const targetUrl = payload.url;
          if (!targetUrl) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'URL não informada' }));
            return;
          }

          if (bridgeCallbacks.scanUrl) {
            const files = await bridgeCallbacks.scanUrl(targetUrl);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, files: files || [] }));
          } else {
            res.writeHead(501, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Scanner de URL não inicializado' }));
          }
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message || 'Erro durante a varredura' }));
        }
      });
      return;
    }

    // 3. POST /api/open-download-dir - Abre pasta de downloads no Windows Explorer
    if (req.method === 'POST' && pathname === '/api/open-download-dir') {
      try {
        const config = bridgeCallbacks.getConfig ? bridgeCallbacks.getConfig() : {};
        const targetPath = config.downloadPath || process.cwd();
        shell.openPath(targetPath);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, path: targetPath }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    // 3.5. POST /api/queue/clear-completed - Limpa downloads concluídos da fila
    if (req.method === 'POST' && pathname === '/api/queue/clear-completed') {
      try {
        if (bridgeCallbacks.clearCompleted) {
          bridgeCallbacks.clearCompleted();
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    // 3.6. POST /api/queue/cancel-all - Cancela downloads ativos da fila
    if (req.method === 'POST' && pathname === '/api/queue/cancel-all') {
      try {
        if (bridgeCallbacks.cancelAll) {
          bridgeCallbacks.cancelAll();
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    // 4. GET & POST /api/settings - Sincronização de configurações com a extensão
    if (pathname === '/api/settings') {
      if (req.method === 'GET') {
        const config = bridgeCallbacks.getConfig ? bridgeCallbacks.getConfig() : {};
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          monitoringMode: config.extensionMonitoringMode || 'supported',
          telemetryEnabled: config.telemetryEnabled !== false
        }));
      } else if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            const newSettings = JSON.parse(body);
            if (bridgeCallbacks.setConfig) {
              bridgeCallbacks.setConfig(newSettings);
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
          } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: e.message }));
          }
        });
      }
      return;
    }

    // 404 para rotas desconhecidas
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Rota não encontrada' }));
  });

  serverInstance.listen(BRIDGE_PORT, BRIDGE_HOST, () => {
    console.log(`[Bridge Server] Nexus Downloader Extension Bridge escutando em http://${BRIDGE_HOST}:${BRIDGE_PORT}`);
  });

  serverInstance.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[Bridge Server] Porta ${BRIDGE_PORT} já em uso. Tentando reutilizar...`);
    } else {
      console.error('[Bridge Server] Erro ao iniciar:', err.message);
    }
  });

  return serverInstance;
}

function getBridgeActivity() {
  const isRunning = !!serverInstance;
  const config = bridgeCallbacks.getConfig ? bridgeCallbacks.getConfig() : {};
  if (config.extensionMonitoringMode === 'disabled') {
    return { isRunning, isConnected: false, lastActivityTime: 0 };
  }
  const isConnected = isRunning && isExtensionConnected && (Date.now() - lastActivityTime < 15000);
  return { isRunning, isConnected, lastActivityTime };
}

function stopBridgeServer() {
  if (serverInstance) {
    serverInstance.close();
    serverInstance = null;
  }
}

module.exports = {
  startBridgeServer,
  stopBridgeServer,
  getBridgeActivity
};
