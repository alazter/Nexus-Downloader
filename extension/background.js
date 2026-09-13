// Nexus Downloader Extension - Background Service Worker (Manifest V3)
const BRIDGE_URL = 'http://127.0.0.1:41523';

let activeBrowserDownloads = [];
let lastReportedSpeed = '0.0 MB/s';
let lastBytesTotal = 0;
let lastSpeedCheckTime = Date.now();

// Inicialização padrão de configurações
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get([
    'monitoringMode',
    'downloadEngine',
    'torboxApiKey',
    'telemetryEnabled',
    'hudHiddenTabs',
    'hudState'
  ], (res) => {
    const defaults = {};
    if (!res.monitoringMode) defaults.monitoringMode = 'supported'; // 'disabled' | 'supported' | 'supported_torbox' | 'universal'
    if (!res.downloadEngine) defaults.downloadEngine = 'bridge'; // 'bridge' | 'browser'
    if (res.torboxApiKey === undefined) defaults.torboxApiKey = '';
    if (res.telemetryEnabled === undefined) defaults.telemetryEnabled = true;
    if (!res.hudHiddenTabs) defaults.hudHiddenTabs = {};
    if (!res.hudState) defaults.hudState = 'compact'; // 'compact' | 'expanded'

    if (Object.keys(defaults).length > 0) {
      chrome.storage.local.set(defaults);
    }
  });

  // Criar menu de contexto
  chrome.contextMenus.create({
    id: 'nexus-download-link',
    title: 'Baixar com Nexus Downloader',
    contexts: ['link', 'image', 'video', 'audio']
  });
  // Inicia sincronização de estado com o Bridge Server do desktop
  syncBridgeConnectionState();
});

// Listener de alterações em configurações para refletir status de conexão instantaneamente
chrome.storage.onChanged.addListener((changes) => {
  if (changes.downloadEngine || changes.downloadOnlyViaExtension || changes.monitoringMode) {
    syncBridgeConnectionState();
  }
});

// Heartbeat periódico (a cada 8 segundos) enquanto a ponte desktop estiver ativa
setInterval(() => {
  syncBridgeConnectionState();
}, 8000);

async function syncBridgeConnectionState() {
  try {
    const storage = await chrome.storage.local.get(['downloadEngine', 'downloadOnlyViaExtension', 'monitoringMode']);
    const isBridge = storage.downloadOnlyViaExtension !== true && storage.downloadEngine !== 'browser' && storage.monitoringMode !== 'disabled';
    await fetch(`${BRIDGE_URL}/api/bridge/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connected: isBridge })
    }).catch(() => {});
    return { success: true, isBridge };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// Listener do menu de contexto
chrome.contextMenus.onClicked.addListener((info, tab) => {
  const targetUrl = info.linkUrl || info.srcUrl || info.pageUrl;
  if (!targetUrl) return;

  const item = {
    url: targetUrl,
    filename: getFilenameFromUrl(targetUrl),
    service: 'DirectLink',
    type: getFileType(targetUrl)
  };

  dispatchDownload([item], tab ? tab.id : null);
});

// Mensageria interna (Content Scripts <-> Popup <-> Background)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'SYNC_BRIDGE_STATE') {
    syncBridgeConnectionState().then(sendResponse);
    return true;
  }

  if (message.action === 'CHECK_BRIDGE_STATUS') {
    checkBridgeStatus().then(sendResponse);
    return true;
  }

  if (message.action === 'SCAN_PAGE_URL') {
    scanPageViaBridge(message.url).then(sendResponse);
    return true;
  }

  if (message.action === 'START_DOWNLOAD') {
    const targetTabId = message.tabId || (sender && sender.tab ? sender.tab.id : null);
    dispatchDownload(message.items, targetTabId)
      .then(result => sendResponse(result));
    return true;
  }

  if (message.action === 'PAUSE_DOWNLOADS') {
    pauseDownloads(message.ids).then(sendResponse);
    return true;
  }

  if (message.action === 'RESUME_DOWNLOADS') {
    resumeDownloads(message.ids).then(sendResponse);
    return true;
  }

  if (message.action === 'RESTART_DOWNLOADS') {
    const targetTabId = message.tabId || (sender && sender.tab ? sender.tab.id : null);
    restartDownloads(message.items, targetTabId).then(sendResponse);
    return true;
  }

  if (message.action === 'OPEN_DOWNLOAD_FOLDER') {
    openDownloadFolder().then(sendResponse);
    return true;
  }

  if (message.action === 'GET_ACTIVE_DOWNLOAD_PROGRESS') {
    getDownloadProgress().then(sendResponse);
    return true;
  }

  if (message.action === 'CLEAR_COMPLETED_DOWNLOADS') {
    clearCompletedDownloads().then(sendResponse);
    return true;
  }

  if (message.action === 'CANCEL_ACTIVE_DOWNLOADS') {
    cancelActiveDownloads(message.ids).then(sendResponse);
    return true;
  }
});

// Varredura de links completos através do bridge do desktop
async function scanPageViaBridge(url) {
  if (!url) return { success: false, files: [] };
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(`${BRIDGE_URL}/api/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      return data;
    }
  } catch (err) {
    console.warn('[Background] Scan via bridge indisponível:', err.message);
  }
  return { success: false, files: [] };
}

// Função para checar conexão com o Nexus Desktop
async function checkBridgeStatus() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${BRIDGE_URL}/api/status`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      if (data && data.torboxConfigured !== undefined) {
        chrome.storage.local.set({
          bridgeTorboxConfigured: !!data.torboxConfigured,
          bridgeTorboxKeyMasked: data.torboxKeyMasked || ''
        });
      }
      return { connected: true, data };
    }
  } catch (e) {
    // Desktop bridge offline
  }
  return { connected: false, data: null };
}

// Disparo de Download (Bridge Desktop vs Motor do Navegador)
async function dispatchDownload(items, tabId) {
  if (!items || !items.length) return { success: false, error: 'Nenhum item' };

  const storage = await chrome.storage.local.get(['downloadEngine', 'downloadOnlyViaExtension', 'torboxApiKey', 'telemetryEnabled']);
  const isOnlyExtension = storage.downloadOnlyViaExtension === true;
  const engine = isOnlyExtension ? 'browser' : (storage.downloadEngine || 'bridge');

  // Modo 1: Enviar para o Desktop via Bridge Server se engine === 'bridge'
  if (engine === 'bridge') {
    try {
      const bridgeCheck = await checkBridgeStatus();
      if (bridgeCheck.connected) {
        const response = await fetch(`${BRIDGE_URL}/api/queue/add`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: items,
            sourceTabId: tabId,
            telemetryEnabled: storage.telemetryEnabled
          })
        });

        if (response.ok) {
          const resJson = await response.json();
          // Notificar tab para atualizar o HUD
          if (tabId) {
            chrome.tabs.sendMessage(tabId, {
              action: 'DOWNLOAD_STARTED',
              itemsCount: items.length,
              engine: 'bridge',
              items: items.map((it, idx) => ({
                id: it.id || idx,
                name: it.filename || it.name || 'arquivo',
                status: 'downloading',
                progress: 0,
                speed: '',
                size: it.size || 0,
                service: it.service || 'Web',
                type: it.type || '.Arquivo'
              }))
            }).catch(() => {});
            startBridgePolling(tabId, items);
          }
          return { success: true, engine: 'bridge', data: resJson };
        } else {
          console.warn('[Background] Falha ao enviar para o Bridge Desktop (status ' + response.status + ')');
        }
      } else {
        // Bridge offline quando o modo Portable está selecionado
        if (tabId) {
          chrome.tabs.sendMessage(tabId, {
            action: 'DESKTOP_BRIDGE_OFFLINE',
            message: 'O Nexus Portable PC precisa estar aberto no Windows para realizar os downloads via Portable.'
          }).catch(() => {});
        }
        return { success: false, error: 'Nexus Portable PC offline. Abra o aplicativo para baixar.' };
      }
    } catch (err) {
      console.warn('Falha de conexão com o Nexus Portable PC:', err);
      if (tabId) {
        chrome.tabs.sendMessage(tabId, {
          action: 'DESKTOP_BRIDGE_OFFLINE',
          message: 'Não foi possível conectar ao Nexus Portable PC. Verifique se o aplicativo está aberto no Windows.'
        }).catch(() => {});
      }
      return { success: false, error: err.message };
    }
  }

  // Modo 2: Motor Nativo do Navegador (Extensão)
  return await startBrowserDownload(items, tabId);
}

// Polling ativo no Bridge Desktop para notificar a aba sobre o progresso de cada arquivo
function startBridgePolling(tabId, batchItemsList) {
  const batchTotal = Array.isArray(batchItemsList) ? batchItemsList.length : (Number(batchItemsList) || 1);
  const batchIds = new Set((Array.isArray(batchItemsList) ? batchItemsList : []).map(i => String(i.id)));
  const batchNames = new Set((Array.isArray(batchItemsList) ? batchItemsList : []).map(i => String(i.filename || i.name || '').toLowerCase().trim()));
  const batchUrls = new Set((Array.isArray(batchItemsList) ? batchItemsList : []).map(i => i.url || i.directUrl || i.sourceUrl).filter(Boolean));
  let maxCompleted = 0;

  const bridgePollInterval = setInterval(async () => {
    try {
      const res = await fetch(`${BRIDGE_URL}/api/status`);
      if (!res.ok) return;
      const statusData = await res.json();
      if (!statusData || !statusData.success) return;

      const queueItems = statusData.items || [];
      const matchedBatchItems = queueItems.filter(i => 
        batchIds.has(String(i.id)) || 
        (i.name && batchNames.has(String(i.name).toLowerCase().trim())) ||
        (i.url && batchUrls.has(String(i.url))) ||
        (i.sourceUrl && batchUrls.has(String(i.sourceUrl)))
      );

      let completed = matchedBatchItems.length > 0 
        ? matchedBatchItems.filter(i => i.status === 'completed').length 
        : (statusData.downloading === 0 && statusData.pending === 0 && statusData.completed > 0 ? batchTotal : 0);

      maxCompleted = Math.max(maxCompleted, completed);
      completed = Math.min(batchTotal, maxCompleted);

      const total = batchTotal;
      const isCompleted = total > 0 && completed >= total;
      const speed = statusData.speedFormatted || `${(statusData.speedMBs || 0).toFixed(1)} MB/s`;

      chrome.tabs.sendMessage(tabId, {
        action: 'DOWNLOAD_PROGRESS',
        completed,
        total,
        speed,
        speedFormatted: speed,
        isCompleted,
        items: queueItems
      }).catch(() => {
        clearInterval(bridgePollInterval);
      });

      if (isCompleted) {
        clearInterval(bridgePollInterval);
      }
    } catch (e) {
      // Bridge temporariamente indisponível
    }
  }, 800);
}

function sanitizeDownloadFilename(filename) {
  if (!filename) return undefined;
  let clean = filename.replace(/[<>:"/\\|?*]/g, '_').trim();
  if (!clean || clean === '.') clean = 'download';
  return clean;
}

function isWebpageUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return false;
  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();

    // 1. Terminações explícitas de documento HTML
    if (pathname.endsWith('.html') || pathname.endsWith('.htm') || pathname.endsWith('.php') || pathname.endsWith('.asp') || pathname.endsWith('.aspx')) {
      return true;
    }

    // 2. Bunkr: rotas de páginas HTML de visualização do site (álbum, vídeo, arquivo, download, embed)
    if (host.includes('bunkr') || host.includes('bunkrr') || host.includes('balbums')) {
      if (!host.startsWith('media-files') && !host.startsWith('cdn') && !host.startsWith('stream')) {
        if (pathname.startsWith('/v/') || pathname.startsWith('/a/') || pathname.startsWith('/d/') || pathname.startsWith('/i/') || pathname.startsWith('/f/') || pathname.startsWith('/e/')) {
          return true;
        }
      }
    }

    // 3. MediaFire: páginas de pasta ou visualização
    if (host.includes('mediafire.com')) {
      if (!host.startsWith('download') && (pathname.includes('/file/') || pathname.includes('/folder/') || pathname.startsWith('/?'))) {
        return true;
      }
    }

    // 4. GoFile: páginas de pasta web
    if (host.includes('gofile.io')) {
      if (pathname.startsWith('/d/')) {
        return true;
      }
    }

    // 5. TeraBox: páginas de compartilhamento
    if (host.includes('terabox') || host.includes('1024tera') || host.includes('4funbox') || host.includes('gibibox')) {
      if (pathname.startsWith('/s/') || pathname.startsWith('/sharing/')) {
        return true;
      }
    }

    // 6. Google Drive: páginas de visualizador
    if (host.includes('drive.google.com')) {
      if (pathname.includes('/view') || pathname.includes('/preview')) {
        return true;
      }
    }
  } catch (e) {
    return false;
  }
  return false;
}

/**
 * Resolve o link direto de download assinado para arquivos do Bunkr
 * Portado diretamente da lógica de busca e resolução do Nexus Desktop (bunkr-scanner.js)
 */
async function resolveBunkrDirectUrl(item) {
  try {
    const rawUrl = item.downloadUrl || item.directUrl || item.url || '';
    let fileSlug = item.bunkrSlug || item.fileSlug || item.slug || '';
    if (!fileSlug && rawUrl) {
      const m = rawUrl.match(/\/(?:f|v|i|d)\/([a-zA-Z0-9_-]+)/i);
      if (m && m[1]) fileSlug = m[1];
    }
    if (!fileSlug && item.numericId) fileSlug = String(item.numericId);
    if (!fileSlug) return null;

    // Determina o domínio base
    let baseDomain = 'https://bunkr.cr';
    const domainMatch = rawUrl.match(/(https?:\/\/[^/]+)/i);
    if (domainMatch && domainMatch[1]) {
      baseDomain = domainMatch[1];
    }

    let baseUrl = null;
    let originalName = null;
    let dataFileId = null;

    // 1. Tentar ler o HTML da página do arquivo (/f/slug ou URL fornecida)
    const pageCandidates = [
      `${baseDomain}/f/${fileSlug}`,
      rawUrl,
      `https://bunkr.cr/f/${fileSlug}`,
      `https://bunkr.ph/f/${fileSlug}`
    ];

    for (const testPage of pageCandidates) {
      if (!testPage || !testPage.startsWith('http')) continue;
      try {
        const ctrl = new AbortController();
        const tId = setTimeout(() => ctrl.abort(), 4000);
        const resp = await fetch(testPage, {
          signal: ctrl.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Referer': 'https://dl.bunkrr.cr/'
          }
        });
        clearTimeout(tId);

        if (resp.ok) {
          const html = await resp.text();
          if (html.includes('Resource not found') || html.includes('404 Not Found')) {
            continue;
          }

          // Extrair nome original
          const titleMatch = html.match(/<h1[^>]*>(.*?)<\/h1>/i) || html.match(/<title>(.*?)<\/title>/i);
          if (titleMatch && titleMatch[1]) {
            let cleanTitle = titleMatch[1].replace(/Download /i, '').replace(/ - Bunkr.*/i, '').trim();
            if (cleanTitle && cleanTitle !== 'Bunkr' && cleanTitle.length > 2) {
              originalName = cleanTitle;
            }
          }

          // Extrair jsCDN
          const jsCdnMatch = html.match(/var\s+jsCDN\s*=\s*["']([^"']+)["']/i);
          if (jsCdnMatch && jsCdnMatch[1]) {
            baseUrl = jsCdnMatch[1].replace(/\\\/|\\/g, '/');
          }

          // Extrair data-file-id ou data-id
          const idMatch = html.match(/data-file-id=["']([^"']+)["']/i) ||
                          html.match(/data-id=["'](\d+)["']/i) ||
                          html.match(/href="https:\/\/dl\.bunkr\.[^/]+\/file\/(\d+)"/i);
          if (idMatch && idMatch[1]) {
            dataFileId = idMatch[1];
          }

          // Extrair link direto se presente no HTML
          if (!baseUrl) {
            const directHrefMatch = html.match(/href=["'](https?:\/\/[^"']*(?:cdn|media|storage|get)\.[^"']+)["']/i) ||
                                   html.match(/src=["'](https?:\/\/[^"']*(?:cdn|media|storage)\.[^"']+)["']/i);
            if (directHrefMatch && directHrefMatch[1]) {
              baseUrl = directHrefMatch[1];
            }
          }

          if (baseUrl) break;
        }
      } catch (ePage) {}
    }

    // 2. Se baseUrl não foi achada no HTML, consultar API POST _001_v2 (BunkrDownloader 1.3.0)
    if (!baseUrl) {
      const targetId = dataFileId || item.numericId || fileSlug;
      const apiEndpoints = [
        'https://dl.bunkr.cr/api/_001_v2',
        'https://dl.bunkr.ph/api/_001_v2',
        'https://dl.bunkrr.cr/api/_001_v2'
      ];

      for (const apiEndpoint of apiEndpoints) {
        try {
          const ctrl = new AbortController();
          const tId = setTimeout(() => ctrl.abort(), 4500);
          const postResp = await fetch(apiEndpoint, {
            method: 'POST',
            signal: ctrl.signal,
            headers: {
              'Content-Type': 'application/json',
              'Referer': 'https://dl.bunkrr.cr/'
            },
            body: JSON.stringify({ id: targetId })
          });
          clearTimeout(tId);

          if (postResp.ok) {
            const meta = await postResp.json();
            if (meta && meta.mediafiles && meta.path) {
              const cleanMediaHost = meta.mediafiles.endsWith('/') ? meta.mediafiles.slice(0, -1) : meta.mediafiles;
              const cleanPath = meta.path.startsWith('/') ? meta.path : '/' + meta.path;
              baseUrl = `${cleanMediaHost}${cleanPath}`;
              if (meta.original) originalName = meta.original;
              break;
            }
          }
        } catch (ePost) {}
      }
    }

    if (!baseUrl) {
      console.warn('[Background Bunkr] Não foi possível obter URL base do CDN para:', fileSlug);
      return null;
    }

    // Se a baseUrl já possuir tokens assinados
    try {
      const testP = new URL(baseUrl);
      if (testP.searchParams.has('token') && testP.searchParams.has('ex')) {
        if (originalName) {
          item.filename = originalName;
          item.name = originalName;
        }
        return baseUrl;
      }
    } catch (e) {}

    // 3. Extrair slug da mídia e assinar via glb-apisign API (BunkrDownloader 1.3.0)
    try {
      const p = new URL(baseUrl);
      const mediaSlug = p.pathname.split('/').pop();
      const mediaPath = `/storage/media/${mediaSlug}`;

      const signUrl = `https://glb-apisign.cdn.cr/sign?path=${encodeURIComponent(mediaPath)}`;
      const signCtrl = new AbortController();
      const sTimeout = setTimeout(() => signCtrl.abort(), 4000);
      const signResp = await fetch(signUrl, { signal: signCtrl.signal });
      clearTimeout(sTimeout);

      if (signResp.ok) {
        const signData = await signResp.json();
        const finalUrl = new URL(baseUrl);
        if (signData && signData.token) {
          finalUrl.searchParams.set('token', signData.token);
          finalUrl.searchParams.set('ex', signData.ex);
        }
        if (originalName) {
          finalUrl.searchParams.set('n', originalName);
          item.filename = originalName;
          item.name = originalName;
        }
        return finalUrl.toString();
      }
    } catch (eSign) {
      console.warn('[Background Bunkr] Assinatura glb-apisign falhou, utilizando baseUrl:', eSign);
    }

    if (originalName) {
      item.filename = originalName;
      item.name = originalName;
    }
    return baseUrl;
  } catch (err) {
    console.error('[Background Bunkr] Erro na resolução:', err);
    return null;
  }
}

/**
 * Resolve a URL direta do MediaFire
 * Portado diretamente da versão Portable Desktop (mediafire-scanner.js)
 */
async function resolveMediaFireDirectUrl(item) {
  try {
    const rawUrl = item.downloadUrl || item.directUrl || item.url || '';
    if (!rawUrl.includes('mediafire.com')) return null;

    const ctrl = new AbortController();
    const tId = setTimeout(() => ctrl.abort(), 6000);
    const resp = await fetch(rawUrl, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    clearTimeout(tId);

    if (resp.ok) {
      const html = await resp.text();

      // Extrair nome real do arquivo
      const nameMatch = html.match(/class="filename">([^<]+)<\/div>/i) ||
                        html.match(/<meta property="og:title" content="([^"]+)"/i) ||
                        html.match(/<div class="dl-btn-label"[^>]*title="([^"]+)"/i);
      if (nameMatch && nameMatch[1]) {
        const cleanName = nameMatch[1].trim();
        if (cleanName) {
          item.filename = cleanName;
          item.name = cleanName;
        }
      }

      // Extrair tamanho se disponível
      const sizeMatch = html.match(/<span>\(([^)]+)\)<\/span>/i) || html.match(/id="downloadButton"[^>]*>\s*Download\s*\(([^)]+)\)/i);
      if (sizeMatch && sizeMatch[1]) {
        const sizeStr = sizeMatch[1].trim();
        let sizeBytes = 0;
        if (sizeStr.includes('MB')) sizeBytes = parseFloat(sizeStr) * 1024 * 1024;
        else if (sizeStr.includes('GB')) sizeBytes = parseFloat(sizeStr) * 1024 * 1024 * 1024;
        else if (sizeStr.includes('KB')) sizeBytes = parseFloat(sizeStr) * 1024;
        if (sizeBytes > 0) {
          item.size = Math.round(sizeBytes);
          item.sizeFormatted = formatBytes(Math.round(sizeBytes));
        }
      }

      // Extrair link direto
      const match = html.match(/href="(https?:\/\/download\d*?\.mediafire\.com\/[^"]+)"/i) ||
                    html.match(/aria-label="Download file"\s+href="(https?:\/\/[^"]+)"/i) ||
                    html.match(/id="downloadButton"\s+href="(https?:\/\/[^"]+)"/i) ||
                    html.match(/id=["']downloadButton["'][^>]*href=["']([^"']+)["']/i);
      if (match && match[1] && !match[1].includes('/file/')) {
        return match[1];
      }
    }
  } catch (err) {
    console.warn('[Background MediaFire] Erro ao resolver MediaFire:', err);
  }
  return null;
}

// Resolução client-side / background de links diretos de download (MediaFire, Bunkr, etc.)
async function resolveDirectDownloadUrl(item) {
  if (item.directUrl && !isWebpageUrl(item.directUrl)) return item.directUrl;
  if (item.downloadUrl && !isWebpageUrl(item.downloadUrl)) return item.downloadUrl;
  const rawUrl = item.downloadUrl || item.directUrl || item.url;
  if (!rawUrl) return null;

  // 1. Tentar resolver via bridge do desktop se estiver disponível
  try {
    const scanRes = await scanPageViaBridge(rawUrl);
    if (scanRes && scanRes.success && scanRes.files && scanRes.files.length > 0) {
      const match = scanRes.files[0];
      const resolved = match.directUrl || match.downloadUrl || match.url;
      if (resolved && !isWebpageUrl(resolved)) {
        if (match.name) {
          item.filename = match.name;
          item.name = match.name;
        }
        if (match.size) item.size = match.size;
        return resolved;
      }
    }
  } catch (e) {}

  // 2. Bunkr direct media resolver (com algoritmo completo da versão portable)
  if (rawUrl.includes('bunkr.') || rawUrl.includes('bunkrr.') || rawUrl.includes('balbums.') || item.service === 'Bunkr') {
    const bunkrResolved = await resolveBunkrDirectUrl(item);
    if (bunkrResolved && !isWebpageUrl(bunkrResolved)) {
      return bunkrResolved;
    }
  }

  // 3. MediaFire direct resolver (com algoritmo completo da versão portable)
  if (rawUrl.includes('mediafire.com') || item.service === 'MediaFire') {
    const mfResolved = await resolveMediaFireDirectUrl(item);
    if (mfResolved && !isWebpageUrl(mfResolved)) {
      return mfResolved;
    }
  }

  // 4. Se já for uma URL direta de arquivo binário (não página web), retorna direto
  if (!isWebpageUrl(rawUrl)) {
    return rawUrl;
  }

  // 5. Se a URL ainda for uma página HTML não resolvida, NUNCA chamar o download nativo
  console.warn('[Background] URL é uma página web intermediária não resolvida, evitando download de .html:', rawUrl);
  return null;
}

// Motor de Download Standalone no Navegador
async function startBrowserDownload(items, tabId) {
  let startedCount = 0;
  const downloadIds = [];
  activeBrowserDownloads = [];
  lastBytesTotal = 0;
  lastSpeedCheckTime = Date.now();
  lastReportedSpeed = '0.0 MB/s';

  const storage = await chrome.storage.local.get(['downloadFolder']);
  const folder = (storage.downloadFolder || 'Nexus Downloads').replace(/^[/\\]+|[/\\]+$/g, '').trim();

  // Notificar imediatamente a aba que os downloads estão iniciando
  if (tabId) {
    chrome.tabs.sendMessage(tabId, {
      action: 'DOWNLOAD_STARTED',
      itemsCount: items.length,
      engine: 'browser',
      items: items.map((it, idx) => ({
        id: it.id || idx,
        name: sanitizeDownloadFilename(it.filename || it.name) || 'arquivo',
        status: 'downloading',
        progress: 0,
        speed: 'Iniciando...',
        size: it.size || 0,
        sizeFormatted: it.sizeFormatted || (it.size ? formatBytes(it.size) : ''),
        service: it.service || 'Navegador',
        type: it.type || '.Arquivo'
      }))
    }).catch(() => {});
  }

  for (const item of items) {
    const downloadUrl = await resolveDirectDownloadUrl(item);
    if (!downloadUrl || isWebpageUrl(downloadUrl)) {
      activeBrowserDownloads.push({
        id: `unres_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        url: item.url || '',
        directUrl: '',
        name: sanitizeDownloadFilename(item.filename || item.name) || 'arquivo',
        status: 'failed',
        error: 'Stream direto não resolvido (evitou salvar .html)',
        progress: 0,
        speed: '',
        size: item.size || 0,
        sizeFormatted: item.sizeFormatted || '',
        service: item.service || 'Navegador',
        type: item.type || '.Arquivo'
      });
      continue;
    }

    // Pre-flight anti-HTML: verificar se o servidor responde com text/html
    let isHtmlResponse = false;
    try {
      const preflightCtrl = new AbortController();
      const preTimeout = setTimeout(() => preflightCtrl.abort(), 2500);
      const headResp = await fetch(downloadUrl, {
        method: 'HEAD',
        signal: preflightCtrl.signal,
        headers: { 'Range': 'bytes=0-0' }
      });
      clearTimeout(preTimeout);
      const ct = (headResp.headers.get('content-type') || '').toLowerCase();
      const cd = (headResp.headers.get('content-disposition') || '').toLowerCase();
      if (ct.includes('text/html') && !cd.includes('attachment')) {
        isHtmlResponse = true;
      }
    } catch (eHead) {}

    if (isHtmlResponse) {
      console.warn('[Background Pre-flight] Bloqueado download de página HTML:', downloadUrl);
      activeBrowserDownloads.push({
        id: `html_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        url: item.url || '',
        directUrl: downloadUrl,
        name: sanitizeDownloadFilename(item.filename || item.name) || 'arquivo',
        status: 'failed',
        error: 'Servidor retornou página HTML ao invés de mídia binária',
        progress: 0,
        speed: '',
        size: item.size || 0,
        sizeFormatted: item.sizeFormatted || '',
        service: item.service || 'Navegador',
        type: item.type || '.Arquivo'
      });
      continue;
    }

    try {
      let cleanName = sanitizeDownloadFilename(item.filename || item.name);
      if (cleanName.toLowerCase().endsWith('.html') || cleanName.toLowerCase().endsWith('.htm')) {
        cleanName = cleanName.replace(/\.html?$/i, '.mp4');
      }
      const targetFilename = folder ? `${folder}/${cleanName}` : cleanName;

      const downloadId = await new Promise((resolve, reject) => {
        chrome.downloads.download({
          url: downloadUrl,
          filename: targetFilename,
          conflictAction: 'uniquify',
          saveAs: false
        }, (id) => {
          if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
          else resolve(id);
        });
      });

      downloadIds.push(downloadId);
      activeBrowserDownloads.push({
        id: downloadId,
        url: item.url || downloadUrl,
        directUrl: downloadUrl,
        name: cleanName || item.filename || item.name || 'download',
        status: 'downloading',
        progress: 0,
        speed: '',
        size: item.size || 0,
        sizeFormatted: item.sizeFormatted || (item.size ? formatBytes(item.size) : ''),
        service: item.service || 'Navegador',
        type: item.type || '.Arquivo'
      });
      startedCount++;

      // Pequena pausa (120ms) entre disparos para não acionar throttle de popups do navegador
      if (items.length > 1) {
        await new Promise(r => setTimeout(r, 120));
      }
    } catch (e) {
      console.error('Erro ao baixar item no navegador:', e);
    }
  }

  // Notificar imediatamente a aba sobre todos os itens no gerenciador
  if (tabId) {
    chrome.tabs.sendMessage(tabId, {
      action: 'DOWNLOAD_STARTED',
      itemsCount: items.length,
      engine: 'browser',
      items: activeBrowserDownloads
    }).catch(() => {});
  }

  // Monitorar downloads ativos do navegador e reportar para a aba
  if (downloadIds.length > 0 && tabId) {
    trackBrowserDownloads(downloadIds, tabId, items.length);
  } else if (tabId) {
    chrome.tabs.sendMessage(tabId, {
      action: 'DOWNLOAD_PROGRESS',
      completed: 0,
      total: items.length,
      speed: '0.0 MB/s',
      speedFormatted: '0.0 MB/s',
      isCompleted: true,
      items: activeBrowserDownloads
    }).catch(() => {});
  }

  return { success: startedCount > 0, engine: 'browser', count: startedCount };
}

// Monitoramento dos downloads em andamento no navegador para atualizar o HUD
function trackBrowserDownloads(ids, tabId, totalItems) {
  const checkInterval = setInterval(async () => {
    try {
      let completed = 0;
      let inProgress = 0;
      let totalBytesReceived = 0;

      for (const item of activeBrowserDownloads) {
        const [d] = await chrome.downloads.search({ id: item.id });
        if (!d) continue;

        if (d.state === 'complete') {
          completed++;
          item.status = 'completed';
          item.progress = 100;
          if (d.totalBytes > 0) {
            item.size = d.totalBytes;
            item.sizeFormatted = formatBytes(d.totalBytes);
          }
        } else if (d.paused) {
          item.status = 'paused';
          if (d.totalBytes > 0) {
            item.progress = Math.min(99, Math.round((d.bytesReceived / d.totalBytes) * 100));
            item.size = d.totalBytes;
            item.sizeFormatted = formatBytes(d.totalBytes);
          }
        } else if (d.state === 'in_progress') {
          inProgress++;
          totalBytesReceived += d.bytesReceived || 0;
          item.status = 'downloading';
          if (d.totalBytes > 0) {
            item.progress = Math.min(99, Math.round((d.bytesReceived / d.totalBytes) * 100));
            item.size = d.totalBytes;
            item.sizeFormatted = formatBytes(d.totalBytes);
          }
        } else if (d.state === 'interrupted') {
          item.status = 'failed';
        }
      }

      // Cálculo de velocidade dinâmica
      const now = Date.now();
      const timeDiffSec = (now - lastSpeedCheckTime) / 1000;
      if (timeDiffSec >= 0.8) {
        const bytesDiff = Math.max(0, totalBytesReceived - lastBytesTotal);
        const speedMBs = (bytesDiff / timeDiffSec) / (1024 * 1024);
        lastReportedSpeed = `${speedMBs.toFixed(1)} MB/s`;
        lastBytesTotal = totalBytesReceived;
        lastSpeedCheckTime = now;
      }

      // Atualizar velocidade nos itens individuais
      for (const item of activeBrowserDownloads) {
        if (item.status === 'downloading') {
          item.speed = lastReportedSpeed;
        } else if (item.status === 'completed' || item.status === 'paused') {
          item.speed = '';
        }
      }

      if (inProgress > 0) {
        chrome.tabs.sendMessage(tabId, {
          action: 'DOWNLOAD_PROGRESS',
          completed,
          total: totalItems,
          bytesReceived: totalBytesReceived,
          speed: lastReportedSpeed,
          speedFormatted: lastReportedSpeed,
          isCompleted: false,
          items: activeBrowserDownloads
        }).catch(() => {});
      } else {
        clearInterval(checkInterval);
        lastReportedSpeed = '0.0 MB/s';
        chrome.tabs.sendMessage(tabId, {
          action: 'DOWNLOAD_PROGRESS',
          completed,
          total: totalItems,
          speed: '0.0 MB/s',
          speedFormatted: '0.0 MB/s',
          isCompleted: true,
          items: activeBrowserDownloads
        }).catch(() => {});
      }
    } catch (err) {
      clearInterval(checkInterval);
    }
  }, 800);
}

// Pausar downloads do navegador
async function pauseDownloads(ids) {
  let targetIds = ids;
  if (!targetIds || !targetIds.length) {
    targetIds = activeBrowserDownloads.filter(i => i.status === 'downloading').map(i => i.id);
  }
  for (const id of targetIds) {
    try {
      await new Promise(res => chrome.downloads.pause(Number(id), res));
      const item = activeBrowserDownloads.find(i => String(i.id) === String(id));
      if (item) item.status = 'paused';
    } catch (e) {}
  }
  return { success: true, items: activeBrowserDownloads };
}

// Retomar downloads do navegador
async function resumeDownloads(ids) {
  let targetIds = ids;
  if (!targetIds || !targetIds.length) {
    targetIds = activeBrowserDownloads.filter(i => i.status === 'paused').map(i => i.id);
  }
  for (const id of targetIds) {
    try {
      await new Promise(res => chrome.downloads.resume(Number(id), res));
      const item = activeBrowserDownloads.find(i => String(i.id) === String(id));
      if (item) item.status = 'downloading';
    } catch (e) {}
  }
  return { success: true, items: activeBrowserDownloads };
}

// Reiniciar downloads
async function restartDownloads(items, tabId) {
  return await dispatchDownload(items, tabId);
}

// Abrir pasta de downloads
async function openDownloadFolder() {
  const storage = await chrome.storage.local.get(['downloadOnlyViaExtension', 'downloadEngine']);
  const isExtensionOnly = storage.downloadOnlyViaExtension === true || storage.downloadEngine === 'browser';

  if (!isExtensionOnly) {
    try {
      const res = await fetch(`${BRIDGE_URL}/api/open-download-dir`, { method: 'POST' });
      if (res.ok) return { success: true };
    } catch (e) {}
  }

  // No navegador, abre a pasta nativa do Windows Explorer ou página de downloads
  try {
    if (chrome.downloads && typeof chrome.downloads.showDefaultFolder === 'function') {
      chrome.downloads.showDefaultFolder();
      return { success: true };
    }
  } catch (e) {}

  chrome.tabs.create({ url: 'chrome://downloads' });
  return { success: true };
}

// Polling de status para abas com HUD ativo
async function getDownloadProgress() {
  const storage = await chrome.storage.local.get(['downloadOnlyViaExtension', 'downloadEngine']);
  const isExtensionOnly = storage.downloadOnlyViaExtension === true || storage.downloadEngine === 'browser';

  if (!isExtensionOnly) {
    try {
      const res = await fetch(`${BRIDGE_URL}/api/status`);
      if (res.ok) {
        const data = await res.json();
        return { connected: true, data };
      }
    } catch (e) {}
  }

  const completed = activeBrowserDownloads.filter(i => i.status === 'completed').length;
  const downloading = activeBrowserDownloads.filter(i => i.status === 'downloading').length;
  const isFinished = activeBrowserDownloads.length > 0 && downloading === 0;

  return {
    connected: false,
    total: activeBrowserDownloads.length,
    completed,
    downloading,
    speedFormatted: lastReportedSpeed,
    isCompleted: isFinished,
    items: activeBrowserDownloads
  };
}

// Limpar lista de concluídos - ESTRITAMENTE LOCAL NA EXTENSÃO (NÃO APAGA DO PORTABLE)
async function clearCompletedDownloads() {
  activeBrowserDownloads = activeBrowserDownloads.filter(item => item.status !== 'completed' && item.status !== 'failed');
  return { success: true, remaining: activeBrowserDownloads };
}

// Cancelar downloads do navegador - ESTRITAMENTE LOCAL NA EXTENSÃO
async function cancelActiveDownloads(ids) {
  let targetItems = activeBrowserDownloads.filter(i => i.status === 'downloading' || i.status === 'paused');
  if (ids && ids.length) {
    const set = new Set(ids.map(String));
    targetItems = targetItems.filter(i => set.has(String(i.id)));
  }
  for (const item of targetItems) {
    try {
      await new Promise(resolve => chrome.downloads.cancel(Number(item.id), resolve));
    } catch (e) {}
    item.status = 'failed';
  }

  lastReportedSpeed = '0.0 MB/s';
  return { success: true, items: activeBrowserDownloads };
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Utilitários de Nomes e Tipos
function getFilenameFromUrl(url) {
  try {
    const cleanUrl = url.split('?')[0];
    const parts = cleanUrl.split('/');
    return decodeURIComponent(parts[parts.length - 1]) || 'download';
  } catch (e) {
    return 'download';
  }
}

function getFileType(url) {
  const lower = url.toLowerCase();
  if (lower.match(/\.(mp4|mkv|avi|mov|wmv|webm|flv|m4v)/)) return '.Vídeo';
  if (lower.match(/\.(zip|rar|7z|tar|gz|bz2)/)) return '.Zip';
  if (lower.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)/)) return '.Foto';
  if (lower.match(/\.(torrent|magnet)/)) return '.Torrents';
  if (lower.match(/\.(mp3|wav|flac|aac|ogg|m4a)/)) return '.Áudio';
  return '.Arquivo';
}
