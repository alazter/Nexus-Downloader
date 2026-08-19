const https = require('https');
const http = require('http');

/**
 * Verifica se a URL ou string é compatível com o Torbox (Magnet Link, Torrent ou Hoster)
 */
function isTorboxUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return false;
  const lower = urlStr.trim().toLowerCase();
  
  if (lower.startsWith('magnet:?')) return true;
  if (lower.endsWith('.torrent')) return true;
  
  const magnetDomains = ['mgnet.me', 'shortmagnet', 'magnetat', 'torrage', 'btcache', 'itorrents'];
  if (magnetDomains.some(d => lower.includes(d))) return true;

  const cleanHash = lower.replace(/[^a-z0-9]/g, '');
  if (/^[a-f0-9]{40}$/.test(cleanHash) || /^[a-z2-7]{32}$/.test(cleanHash)) return true;

  const hosterDomains = [
    'rapidgator', '1fichier', 'mega.nz', 'mega.co.nz', 'turbobit', 'ddownload',
    'katfile', 'nitroflare', 'filefactory', 'uptobox', 'drop.download', 'filestore',
    'clicknupload', 'hexupload', 'filedot', 'rosefile', 'fikper', 'send.cm'
  ];

  return hosterDomains.some(d => lower.includes(d));
}

/**
 * Formata bytes para exibição legível
 */
function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Helper HTTP/HTTPS para chamadas à API v1 do Torbox
 */
function callTorboxApi(endpoint, method = 'GET', apiKey = '', payload = null) {
  return new Promise((resolve, reject) => {
    const fullUrl = `https://api.torbox.app/v1/api${endpoint}`;
    const parsed = new URL(fullUrl);

    const headers = {
      'User-Agent': 'NexusDownloader/1.0',
      'Accept': 'application/json'
    };

    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey.trim()}`;
    }

    let postData = null;
    if (payload && method === 'POST') {
      if (typeof payload === 'object' && !(payload instanceof URLSearchParams)) {
        headers['Content-Type'] = 'application/json';
        postData = JSON.stringify(payload);
      } else if (payload instanceof URLSearchParams) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        postData = payload.toString();
      }
    }

    const req = https.request(fullUrl, {
      method,
      headers,
      rejectUnauthorized: false
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve({ statusCode: res.statusCode, data: json });
        } catch (e) {
          resolve({ statusCode: res.statusCode, rawBody: body, error: 'JSON_PARSE_ERROR' });
        }
      });
    });

    req.on('error', err => reject(err));
    if (postData) req.write(postData);
    req.end();
  });
}

/**
 * Testa a validade de uma API Key do Torbox
 */
async function testTorboxApiKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string') {
    return { success: false, message: 'API Key do Torbox não fornecida.' };
  }

  try {
    const res = await callTorboxApi('/user/me', 'GET', apiKey);
    if (res.statusCode === 200 && res.data && res.data.success) {
      const user = res.data.data || {};
      const planStr = user.plan !== undefined ? `Plano ${user.plan}` : 'Premium';
      const emailStr = user.email ? ` (${user.email})` : '';
      return {
        success: true,
        message: `Conexão efetuada com sucesso! ${planStr}${emailStr}`,
        user
      };
    }
    const detail = (res.data && res.data.detail) ? res.data.detail : 'Chave de API inválida ou não autorizada.';
    return { success: false, message: detail };
  } catch (err) {
    return { success: false, message: `Erro de conexão com o Torbox: ${err.message}` };
  }
}

function extractNameFromMagnet(magnetUrl) {
  if (!magnetUrl || typeof magnetUrl !== 'string') return '';
  try {
    const match = magnetUrl.match(/[?&]dn=([^&\r\n\t]+)/i);
    if (match && match[1]) {
      let raw = match[1].trim();
      try {
        raw = decodeURIComponent(raw.replace(/\+/g, ' ')).trim();
      } catch (e) {}
      if (raw) return raw;
    }
  } catch (e) {}
  return '';
}

/**
 * Escaneia um link (Magnet/Torrent ou Hoster) via API Key do Torbox
 */
async function scanTorboxLink(urlStr, apiKey) {
  console.log('[Torbox Scanner] Escaneando via API Key do Torbox:', urlStr);

  if (!apiKey) {
    throw new Error('API Key do Torbox não configurada. Por favor, adicione sua chave em Ajustes.');
  }

  const isMagnet = urlStr.trim().toLowerCase().startsWith('magnet:?') || isTorboxUrl(urlStr);

  if (urlStr.trim().toLowerCase().startsWith('magnet:?') || urlStr.toLowerCase().endsWith('.torrent') || /^[a-fA-F0-9]{40}$/.test(urlStr.trim()) || /^[a-zA-Z2-7]{32}$/.test(urlStr.trim())) {
    // 1. Processa Magnet Link / Torrent
    const payload = new URLSearchParams();
    payload.append('magnet', urlStr.trim());

    console.log('[Torbox Scanner] Adicionando Magnet Link à API do Torbox...');
    const createRes = await callTorboxApi('/torrents/createtorrent', 'POST', apiKey, payload);

    if (createRes.statusCode !== 200 && createRes.statusCode !== 201) {
      const detail = (createRes.data && createRes.data.detail) ? createRes.data.detail : 'Falha ao adicionar torrent no Torbox';
      throw new Error(detail);
    }

    const dnName = extractNameFromMagnet(urlStr);
    const torrentData = createRes.data.data || {};
    const torrentId = torrentData.torrent_id || torrentData.id;

    // Aguarda rápida resposta se os arquivos foram listados
    const listRes = await callTorboxApi('/torrents/mylist?bypass_cache=true', 'GET', apiKey);
    let myTorrents = (listRes.data && listRes.data.data) ? listRes.data.data : [];
    let currentTorrent = myTorrents.find(t => t.id === torrentId || t.torrent_id === torrentId) || torrentData;

    const files = currentTorrent.files || [];
    const resultList = [];

    // O folderName da pasta no Scanner e na Fila de Downloads SEMPRE usará o nome completo extraído do dn= se disponível
    const folderDisplayName = (dnName && dnName.length > 2) ? dnName : (currentTorrent.name || torrentData.name || 'Torrent_Download');

    if (files.length > 0) {
      files.forEach((f, idx) => {
        let rawName = f.name || f.short_name || `Arquivo_${idx + 1}`;
        let pureFileName = rawName.includes('/') ? rawName.split('/').pop() : rawName;
        const fSize = f.size || 0;
        const relPath = `${folderDisplayName}/${pureFileName}`;

        resultList.push({
          id: 'torbox_torrent_' + torrentId + '_' + (f.id !== undefined ? f.id : idx),
          fileId: 'tb_t_' + torrentId + '_' + idx,
          numericId: 'tb_t_' + idx,
          name: pureFileName,
          size: fSize,
          sizeFormatted: formatBytes(fSize),
          relativePath: relPath,
          folderName: folderDisplayName,
          isHttpDirect: true,
          torboxType: 'torrent',
          torboxId: torrentId,
          torboxFileId: f.id !== undefined ? f.id : idx,
          torboxDownloadUrl: ''
        });
      });
    } else {
      // Torrent em progresso na nuvem
      const fSize = currentTorrent.size || 0;
      let rawName = currentTorrent.name || folderDisplayName;
      let pureFileName = rawName.includes('/') ? rawName.split('/').pop() : rawName;
      if (!/\.[a-zA-Z0-9]{2,4}$/.test(pureFileName)) {
        pureFileName = pureFileName + '.mkv';
      }
      resultList.push({
        id: 'torbox_torrent_' + torrentId + '_0',
        fileId: 'tb_t_' + torrentId,
        numericId: 'tb_t_0',
        name: pureFileName,
        size: fSize,
        sizeFormatted: formatBytes(fSize),
        relativePath: `${folderDisplayName}/${pureFileName}`,
        folderName: folderDisplayName,
        isHttpDirect: true,
        torboxType: 'torrent',
        torboxId: torrentId,
        torboxFileId: 0,
        torboxDownloadUrl: ''
      });
    }

    return resultList;
  } else {
    // 2. Processa Hoster Link (Web Download - 1fichier, Rapidgator, Mega, etc.)
    const payload = new URLSearchParams();
    payload.append('link', urlStr.trim());

    console.log('[Torbox Scanner] Criando Web Download no Torbox para Hoster Link...');
    const createRes = await callTorboxApi('/webdl/createwebdownload', 'POST', apiKey, payload);

    if (createRes.statusCode !== 200 && createRes.statusCode !== 201) {
      // Tenta verificar se o link já foi adicionado/processado anteriormente em /webdl/mylist
      try {
        const listRes = await callTorboxApi('/webdl/mylist?bypass_cache=true', 'GET', apiKey);
        const myWebdls = (listRes.data && listRes.data.data) ? listRes.data.data : [];
        const cleanUrl = urlStr.trim().toLowerCase();
        const existing = myWebdls.find(w => (w.original_url && w.original_url.toLowerCase().includes(cleanUrl)) || (w.name && cleanUrl.includes(w.name.toLowerCase())));
        if (existing) {
          const webdlId = existing.id || existing.webdownload_id;
          const eName = existing.name || 'Hoster_Download';
          return [{
            id: 'torbox_webdl_' + webdlId + '_0',
            fileId: 'tb_w_' + webdlId,
            numericId: 'tb_w_0',
            name: eName,
            size: existing.size || 0,
            sizeFormatted: formatBytes(existing.size || 0),
            relativePath: eName,
            folderName: eName,
            isHttpDirect: true,
            torboxType: 'webdl',
            torboxId: webdlId,
            torboxFileId: 0,
            torboxDownloadUrl: ''
          }];
        }
      } catch (e) {}

      const detail = (createRes.data && createRes.data.detail) ? createRes.data.detail : 'Falha ao desproteger link no Torbox';
      throw new Error(detail);
    }

    const webData = createRes.data.data || {};
    const webdlId = webData.webdownload_id || webData.webdl_id || webData.id;

    // Busca detalhes em /webdl/mylist para obter nome real e tamanho do arquivo
    let fileName = webData.name || 'Hoster_Download';
    let fileSize = webData.size || 0;

    try {
      const listRes = await callTorboxApi('/webdl/mylist?bypass_cache=true', 'GET', apiKey);
      const myWebdls = (listRes.data && listRes.data.data) ? listRes.data.data : [];
      const currentWebdl = myWebdls.find(w => w.id === webdlId || w.webdownload_id === webdlId) || webData;
      if (currentWebdl) {
        fileName = currentWebdl.name || fileName;
        fileSize = currentWebdl.size || fileSize;
      }
    } catch (e) {
      console.warn('[Torbox Scanner] Não foi possível buscar detalhes da lista webdl:', e.message);
    }

    const resultList = [{
      id: 'torbox_webdl_' + webdlId + '_0',
      fileId: 'tb_w_' + webdlId,
      numericId: 'tb_w_0',
      name: fileName,
      size: fileSize,
      sizeFormatted: formatBytes(fileSize),
      relativePath: fileName,
      folderName: fileName,
      isHttpDirect: true,
      torboxType: 'webdl',
      torboxId: webdlId,
      torboxFileId: 0,
      torboxDownloadUrl: ''
    }];

    return resultList;
  }
}

/**
 * Resolve o link direto de download do Torbox (solicita temporário via API)
 */
async function resolveTorboxDirectUrl(fileId, apiKey, torboxType = 'webdl', torboxId = 0, torboxFileId = 0, onStatusUpdate = null) {
  console.log(`[Torbox Resolver] Solicitando URL de download para ${torboxType} (ID: ${torboxId})...`);

  if (!apiKey) {
    throw new Error('API Key do Torbox ausente.');
  }

  const requestDirect = async () => {
    const endpoint = torboxType === 'torrent' 
      ? `/torrents/requestdl?token=${encodeURIComponent(apiKey)}&torrent_id=${torboxId}&file_id=${torboxFileId}&redirect=false`
      : `/webdl/requestdl?token=${encodeURIComponent(apiKey)}&web_id=${torboxId}&redirect=false`;

    const res = await callTorboxApi(endpoint, 'GET', apiKey);
    if (res.statusCode === 200 && res.data && res.data.success) {
      const dUrl = res.data.data || res.data.url;
      if (dUrl && typeof dUrl === 'string') return dUrl;
    }
    return null;
  };

  let dUrl = await requestDirect();
  if (dUrl) {
    return { directUrl: dUrl, referer: 'https://torbox.app/' };
  }

  // Se o link direto ainda não está pronto (nuvem Torbox baixando/gerando cache)
  console.log(`[Torbox Resolver] Arquivo sendo baixado na nuvem do Torbox. Aguardando conclusão...`);
  let attempts = 0;
  const maxAttempts = 120; // Tenta por até ~10 minutos (120 * 5s)

  while (attempts < maxAttempts) {
    attempts++;

    // Tenta obter status da nuvem Torbox
    try {
      const listEndpoint = torboxType === 'torrent' ? '/torrents/mylist?bypass_cache=true' : '/webdl/mylist?bypass_cache=true';
      const listRes = await callTorboxApi(listEndpoint, 'GET', apiKey);
      const items = (listRes.data && listRes.data.data) ? listRes.data.data : [];
      const item = items.find(i => (String(i.id) === String(torboxId) || String(i.torrent_id) === String(torboxId) || String(i.webdownload_id) === String(torboxId)));

      if (item) {
        const rawProg = item.progress !== undefined ? item.progress : 0;
        const percent = rawProg <= 1 ? Math.round(rawProg * 100) : Math.round(rawProg);
        console.log(`[Torbox Resolver] Progresso na nuvem Torbox: ${percent}%`);
        if (onStatusUpdate && typeof onStatusUpdate === 'function') {
          onStatusUpdate(`☁️ Torbox baixando na nuvem (${percent}%)...`, percent);
        }
      }
    } catch (e) {
      console.warn('[Torbox Resolver] Erro ao verificar progresso na nuvem:', e.message);
    }

    await new Promise(r => setTimeout(r, 5000));

    dUrl = await requestDirect();
    if (dUrl) {
      console.log(`[Torbox Resolver] Download na nuvem concluído! Link direto de alta velocidade gerado.`);
      return { directUrl: dUrl, referer: 'https://torbox.app/' };
    }
  }

  // Fallback Permalink com token direto
  const permalink = torboxType === 'torrent'
    ? `https://api.torbox.app/v1/api/torrents/requestdl?token=${encodeURIComponent(apiKey)}&torrent_id=${torboxId}&file_id=${torboxFileId}&redirect=true`
    : `https://api.torbox.app/v1/api/webdl/requestdl?token=${encodeURIComponent(apiKey)}&web_id=${torboxId}&redirect=true`;

  return {
    directUrl: permalink,
    referer: 'https://torbox.app/'
  };
}

/**
 * Busca todos os torrents e downloads WebDL da conta do usuário no Torbox
 */
async function fetchTorboxUserDownloads(apiKey) {
  if (!apiKey) throw new Error('API Key do Torbox não fornecida.');

  let allFiles = [];

  // 1. Busca Torrents da conta
  try {
    let torrentsRes = await callTorboxApi('/torrents/mylist?bypass_cache=true', 'GET', apiKey);
    if (!torrentsRes.data || !torrentsRes.data.data) {
      torrentsRes = await callTorboxApi('/torrents/mylist', 'GET', apiKey);
    }
    const torrents = (torrentsRes.data && torrentsRes.data.data) ? torrentsRes.data.data : [];

    for (const t of torrents) {
      const folderName = t.name || `Torrent_${t.id}`;
      const rawProg = t.progress !== undefined ? t.progress : 0;
      const percent = Math.round(rawProg <= 1 ? rawProg * 100 : rawProg);
      const isFinished = !!t.download_finished || t.download_state === 'completed';
      const isInactive = !!t.inactive || (t.download_state && (t.download_state.toLowerCase().includes('inactive') || t.download_state.toLowerCase().includes('stalled') || t.download_state.toLowerCase().includes('error')));

      let statusText = isFinished ? 'Concluído' : (isInactive ? 'Inativo' : `Baixando (${percent}%)`);

      if (t.files && Array.isArray(t.files) && t.files.length > 0) {
        t.files.forEach((f, fIdx) => {
          const fileName = f.name ? f.name.split('/').pop() : `Arquivo_${f.id !== undefined ? f.id : fIdx}`;
          const fileId = f.id !== undefined ? f.id : fIdx;
          const directUrl = `https://api.torbox.app/v1/api/torrents/requestdl?token=${encodeURIComponent(apiKey)}&torrent_id=${t.id}&file_id=${fileId}&redirect=true`;

          allFiles.push({
            id: `torbox_cloud_t_${t.id}_f_${fileId}`,
            name: fileName,
            size: f.size || 0,
            folderName: folderName,
            relativePath: f.name || fileName,
            downloadUrl: directUrl,
            directUrl: directUrl,
            isHttpDirect: true,
            torboxType: 'torrent',
            torboxId: t.id,
            torboxFileId: fileId,
            isFinished: isFinished,
            isInactive: isInactive,
            progress: percent,
            cloudStatus: statusText,
            createdAt: t.created_at || t.added_at || '',
            updatedAt: t.updated_at || '',
            cachedAt: t.cached_at || t.expires_at || '',
            ratio: t.ratio !== undefined ? t.ratio : 0,
            downloadSpeed: t.download_speed || 0,
            uploadSpeed: t.upload_speed || 0
          });
        });
      } else {
        const directUrl = `https://api.torbox.app/v1/api/torrents/requestdl?token=${encodeURIComponent(apiKey)}&torrent_id=${t.id}&file_id=0&redirect=true`;
        allFiles.push({
          id: `torbox_cloud_t_${t.id}`,
          name: folderName,
          size: t.size || 0,
          folderName: folderName,
          relativePath: folderName,
          downloadUrl: directUrl,
          directUrl: directUrl,
          isHttpDirect: true,
          torboxType: 'torrent',
          torboxId: t.id,
          torboxFileId: 0,
          isFinished: isFinished,
          isInactive: isInactive,
          progress: percent,
          cloudStatus: statusText,
          createdAt: t.created_at || t.added_at || '',
          updatedAt: t.updated_at || '',
          cachedAt: t.cached_at || t.expires_at || '',
          ratio: t.ratio !== undefined ? t.ratio : 0,
          downloadSpeed: t.download_speed || 0,
          uploadSpeed: t.upload_speed || 0
        });
      }
    }
  } catch (err) {
    console.warn('[Torbox Fetch] Erro ao buscar lista de torrents:', err.message);
  }

  // 2. Busca WebDL / Hosters da conta
  try {
    let webdlRes = await callTorboxApi('/webdl/mylist?bypass_cache=true', 'GET', apiKey);
    if (!webdlRes.data || !webdlRes.data.data) {
      webdlRes = await callTorboxApi('/webdl/mylist', 'GET', apiKey);
    }
    const webdls = (webdlRes.data && webdlRes.data.data) ? webdlRes.data.data : [];

    for (const w of webdls) {
      const folderName = w.name || `WebDL_${w.id}`;
      const rawProg = w.progress !== undefined ? w.progress : 0;
      const percent = Math.round(rawProg <= 1 ? rawProg * 100 : rawProg);
      const isFinished = !!w.download_finished || w.download_state === 'completed';
      const isInactive = !!w.inactive || (w.download_state && (w.download_state.toLowerCase().includes('inactive') || w.download_state.toLowerCase().includes('stalled') || w.download_state.toLowerCase().includes('error')));

      let statusText = isFinished ? 'Concluído' : (isInactive ? 'Inativo' : `Baixando (${percent}%)`);
      const directUrl = `https://api.torbox.app/v1/api/webdl/requestdl?token=${encodeURIComponent(apiKey)}&web_id=${w.id}&redirect=true`;

      allFiles.push({
        id: `torbox_cloud_w_${w.id}`,
        name: folderName,
        size: w.size || 0,
        folderName: folderName,
        relativePath: folderName,
        downloadUrl: directUrl,
        directUrl: directUrl,
        isHttpDirect: true,
        torboxType: 'webdl',
        torboxId: w.id,
        isFinished: isFinished,
        isInactive: isInactive,
        progress: percent,
        cloudStatus: statusText,
        createdAt: w.created_at || w.added_at || '',
        updatedAt: w.updated_at || '',
        cachedAt: w.cached_at || '',
        ratio: 0,
        downloadSpeed: w.download_speed || 0,
        uploadSpeed: 0
      });
    }
  } catch (err) {
    console.warn('[Torbox Fetch] Erro ao buscar lista de WebDL:', err.message);
  }

  return allFiles;
}

module.exports = {
  isTorboxUrl,
  testTorboxApiKey,
  scanTorboxLink,
  resolveTorboxDirectUrl,
  fetchTorboxUserDownloads
};
