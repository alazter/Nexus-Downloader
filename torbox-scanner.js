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

function sanitizePathSegment(str) {
  if (!str || typeof str !== 'string') return 'Download';
  let cleaned = str.replace(/[\r\n\t]/g, ' ').replace(/[\\/:*?"<>|]/g, '_').trim();
  cleaned = cleaned.replace(/\s+/g, ' ');
  return cleaned || 'Download';
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
      if (raw) return sanitizePathSegment(raw);
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

    // Aguarda rápida resposta se os arquivos foram listados (tenta até 4x se a lista de arquivos ainda estiver inicializando)
    let files = [];
    let currentTorrent = torrentData;

    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const listRes = await callTorboxApi('/torrents/mylist?bypass_cache=true', 'GET', apiKey);
        let myTorrents = (listRes.data && listRes.data.data) ? listRes.data.data : [];
        currentTorrent = myTorrents.find(t => t.id === torrentId || t.torrent_id === torrentId) || torrentData;
        if (currentTorrent && currentTorrent.files && Array.isArray(currentTorrent.files) && currentTorrent.files.length > 0) {
          files = currentTorrent.files;
          break;
        }
      } catch (e) {}
      if (attempt < 3) await new Promise(r => setTimeout(r, 1200));
    }

    const resultList = [];
    const rawFolderName = (dnName && dnName.length > 2) ? dnName : (currentTorrent.name || torrentData.name || 'Torrent_Download');
    const folderDisplayName = sanitizePathSegment(rawFolderName);

    if (files.length > 0) {
      files.forEach((f, idx) => {
        let rawName = f.name || f.short_name || `Arquivo_${idx + 1}`;
        let pureFileName = rawName.includes('/') ? rawName.split('/').pop() : rawName;
        pureFileName = sanitizePathSegment(pureFileName);
        const fSize = f.size || 0;
        const relPath = `${folderDisplayName}/${pureFileName}`;
        const fFileId = (f.id !== undefined ? f.id : idx);
        const permalinkUrl = `https://api.torbox.app/v1/api/torrents/requestdl?token=${encodeURIComponent(apiKey)}&torrent_id=${torrentId}&file_id=${fFileId}&redirect=true`;

        resultList.push({
          id: 'torbox_torrent_' + torrentId + '_' + fFileId,
          fileId: 'tb_t_' + torrentId + '_' + fFileId,
          numericId: 'tb_t_' + fFileId,
          name: pureFileName,
          size: fSize,
          sizeFormatted: formatBytes(fSize),
          relativePath: relPath,
          folderName: folderDisplayName,
          isHttpDirect: true,
          torboxType: 'torrent',
          torboxId: torrentId,
          torboxFileId: fFileId,
          torboxDownloadUrl: permalinkUrl,
          directUrl: permalinkUrl,
          downloadUrl: permalinkUrl
        });
      });
    } else {
      // Torrent em progresso na nuvem
      const fSize = currentTorrent.size || 0;
      let rawName = currentTorrent.name || folderDisplayName;
      let pureFileName = rawName.includes('/') ? rawName.split('/').pop() : rawName;
      pureFileName = sanitizePathSegment(pureFileName);
      if (!/\.[a-zA-Z0-9]{2,4}$/.test(pureFileName)) {
        pureFileName = pureFileName + '.mkv';
      }
      const permalinkUrl = `https://api.torbox.app/v1/api/torrents/requestdl?token=${encodeURIComponent(apiKey)}&torrent_id=${torrentId}&file_id=0&redirect=true`;

      resultList.push({
        id: 'torbox_torrent_' + torrentId + '_0',
        fileId: 'tb_t_' + torrentId + '_0',
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
        torboxDownloadUrl: permalinkUrl,
        directUrl: permalinkUrl,
        downloadUrl: permalinkUrl
      });
    }

    return resultList;
  } else {
    // 2. Processa Hoster Link (Web Download - 1fichier, Rapidgator, Pixeldrain, Mega, etc.)
    const cleanUrlStr = urlStr.trim().split('#')[0];
    console.log('[Torbox Scanner] Processando Hoster Link (URL limpa):', cleanUrlStr);

    // 2.1 Verifica PRIMEIRO se a WebDL do link completo/álbum já existe na conta do usuário
    try {
      const listRes = await callTorboxApi('/webdl/mylist?bypass_cache=true', 'GET', apiKey);
      const myWebdls = (listRes.data && listRes.data.data) ? listRes.data.data : [];
      const targetClean = cleanUrlStr.toLowerCase();
      const targetFull = urlStr.trim().toLowerCase();

      // Procura em primeiro lugar uma WebDL do álbum completo (com a matriz de 6 arquivos)
      let existing = myWebdls.find(w => {
        if (!w.original_url) return false;
        const wOrig = w.original_url.trim().toLowerCase();
        const matches = wOrig === targetClean || wOrig.includes(targetClean) || targetClean.includes(wOrig);
        return matches && w.files && Array.isArray(w.files) && w.files.length > 1;
      });

      if (!existing) {
        existing = myWebdls.find(w => {
          if (!w.original_url) return false;
          const wOrig = w.original_url.trim().toLowerCase();
          return wOrig === targetClean || wOrig.includes(targetClean) || targetClean.includes(wOrig);
        });
      }

      if (existing) {
        console.log(`[Torbox Scanner] WebDL pré-existente encontrada na conta do Torbox! ID: ${existing.id} (${existing.name})`);
        return buildWebdlResultList(existing, apiKey);
      }
    } catch (e) {
      console.warn('[Torbox Scanner] Não foi possível consultar lista prévia de WebDLs:', e.message);
    }

    // 2.2 Se não existir previamente, envia a URL limpa para o Torbox desproteger e baixar a pasta/álbum inteira
    const payload = new URLSearchParams();
    payload.append('link', cleanUrlStr);

    console.log('[Torbox Scanner] Criando Web Download no Torbox para URL limpa:', cleanUrlStr);
    const createRes = await callTorboxApi('/webdl/createwebdownload', 'POST', apiKey, payload);

    if (createRes.statusCode !== 200 && createRes.statusCode !== 201) {
      try {
        const listRes = await callTorboxApi('/webdl/mylist?bypass_cache=true', 'GET', apiKey);
        const myWebdls = (listRes.data && listRes.data.data) ? listRes.data.data : [];
        const targetClean = cleanUrlStr.toLowerCase();
        const existing = myWebdls.find(w => (w.original_url && w.original_url.toLowerCase().includes(targetClean)) || (w.name && targetClean.includes(w.name.toLowerCase())));
        if (existing) {
          return buildWebdlResultList(existing, apiKey);
        }
      } catch (e) {}

      const detail = (createRes.data && createRes.data.detail) ? createRes.data.detail : 'Falha ao desproteger link no Torbox';
      throw new Error(detail);
    }

    const webData = createRes.data.data || {};
    const webdlId = webData.webdownload_id || webData.webdl_id || webData.id;

    let currentWebdl = webData;
    try {
      const listRes = await callTorboxApi('/webdl/mylist?bypass_cache=true', 'GET', apiKey);
      const myWebdls = (listRes.data && listRes.data.data) ? listRes.data.data : [];
      const found = myWebdls.find(w => w.id === webdlId || w.webdownload_id === webdlId);
      if (found) currentWebdl = found;
    } catch (e) {
      console.warn('[Torbox Scanner] Não foi possível buscar detalhes da lista webdl recém-criada:', e.message);
    }

    return buildWebdlResultList(currentWebdl, apiKey);
  }
}

/**
 * Função auxiliar para montar a lista de resultados de uma WebDL (Arquivos individuais ou Pacote ZIP)
 */
function buildWebdlResultList(webdlItem, apiKey) {
  const webdlId = webdlItem.id || webdlItem.webdownload_id;
  const folderDisplayName = sanitizePathSegment(webdlItem.name || 'Hoster_Download');
  const resultList = [];

  // Se o Torbox descompactou os arquivos da WebDL (ex: Pixeldrain album com 6 vídeos)
  if (webdlItem.files && Array.isArray(webdlItem.files) && webdlItem.files.length > 0) {
    webdlItem.files.forEach((f, idx) => {
      let rawName = f.short_name || f.name || `Arquivo_${idx + 1}`;
      let pureFileName = rawName.includes('/') ? rawName.split('/').pop() : rawName;
      pureFileName = sanitizePathSegment(pureFileName);
      const fSize = f.size || 0;
      const relPath = `${folderDisplayName}/${pureFileName}`;
      const fFileId = (f.id !== undefined ? f.id : idx);
      const permalinkUrl = `https://api.torbox.app/v1/api/webdl/requestdl?token=${encodeURIComponent(apiKey)}&web_id=${webdlId}&file_id=${fFileId}&redirect=true`;

      resultList.push({
        id: 'torbox_webdl_' + webdlId + '_' + fFileId,
        fileId: 'tb_w_' + webdlId + '_' + fFileId,
        numericId: 'tb_w_' + fFileId,
        name: pureFileName,
        size: fSize,
        sizeFormatted: formatBytes(fSize),
        relativePath: relPath,
        folderName: folderDisplayName,
        isHttpDirect: true,
        torboxType: 'webdl',
        torboxId: webdlId,
        torboxFileId: fFileId,
        torboxDownloadUrl: permalinkUrl,
        directUrl: permalinkUrl,
        downloadUrl: permalinkUrl
      });
    });
  } else {
    // Se for arquivo único ou empacotado pelo Torbox como .zip / .rar
    let fileName = folderDisplayName;
    if (!/\.[a-zA-Z0-9]{2,4}$/.test(fileName)) {
      fileName = fileName + '.zip';
    }
    const fileSize = webdlItem.size || 0;
    const webdlPermalink = `https://api.torbox.app/v1/api/webdl/requestdl?token=${encodeURIComponent(apiKey)}&web_id=${webdlId}&redirect=true`;

    resultList.push({
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
      torboxDownloadUrl: webdlPermalink,
      directUrl: webdlPermalink,
      downloadUrl: webdlPermalink
    });
  }

  return resultList;
}

/**
 * Resolve o link direto de download do Torbox (solicita temporário via API)
 */
async function resolveTorboxDirectUrl(fileId, apiKey, torboxType = 'torrent', torboxId = 0, torboxFileId = 0, onStatusUpdate = null) {
  console.log(`[Torbox Resolver] Resolvendo URL para ${torboxType} (ID: ${torboxId}, FileID: ${torboxFileId})...`);

  if (!apiKey) {
    throw new Error('API Key do Torbox ausente.');
  }

  let currentFileId = torboxFileId;

  const requestDirect = async (targetFileId) => {
    let fid = (targetFileId !== undefined && targetFileId !== null) ? targetFileId : 0;
    const endpoint = torboxType === 'torrent' 
      ? `/torrents/requestdl?token=${encodeURIComponent(apiKey)}&torrent_id=${torboxId}&file_id=${fid}&redirect=false`
      : `/webdl/requestdl?token=${encodeURIComponent(apiKey)}&web_id=${torboxId}&redirect=false`;

    const res = await callTorboxApi(endpoint, 'GET', apiKey);
    if (res.statusCode === 200 && res.data && res.data.success) {
      const dUrl = res.data.data || res.data.url;
      if (dUrl && typeof dUrl === 'string') return dUrl;
    }
    return null;
  };

  // 1. Verifica se o item já está 100% concluído na nuvem antes de tentar a CDN
  let isCloudReady = false;
  try {
    const listEndpoint = torboxType === 'torrent' ? '/torrents/mylist?bypass_cache=true' : '/webdl/mylist?bypass_cache=true';
    const listRes = await callTorboxApi(listEndpoint, 'GET', apiKey);
    const items = (listRes.data && listRes.data.data) ? listRes.data.data : [];
    const item = items.find(i => (String(i.id) === String(torboxId) || String(i.torrent_id) === String(torboxId) || String(i.webdownload_id) === String(torboxId)));
    if (item) {
      const rawProg = item.progress !== undefined ? item.progress : 0;
      const percent = Math.min(100, Math.round(rawProg <= 1 ? rawProg * 100 : rawProg));
      isCloudReady = !!item.download_finished || item.download_state === 'completed' || percent >= 100;
    }
  } catch (e) {
    console.warn('[Torbox Resolver] Não foi possível checar lista inicial:', e.message);
  }

  if (isCloudReady) {
    let dUrl = await requestDirect(currentFileId);
    if (dUrl) {
      return { directUrl: dUrl, referer: 'https://torbox.app/' };
    }
  }

  // 2. Se o arquivo ainda estiver baixando na nuvem do Torbox, inicia o loop de aguardo em tempo real
  console.log(`[Torbox Resolver] Arquivo em progresso na nuvem Torbox (${torboxType} ID: ${torboxId}). Aguardando conclusão na nuvem...`);
  let attempts = 0;
  const maxAttempts = 180; // Até ~15 minutos (180 * 4s)
  let consecutiveStalled = 0;

  while (attempts < maxAttempts) {
    attempts++;

    try {
      const listEndpoint = torboxType === 'torrent' ? '/torrents/mylist?bypass_cache=true' : '/webdl/mylist?bypass_cache=true';
      const listRes = await callTorboxApi(listEndpoint, 'GET', apiKey);
      const items = (listRes.data && listRes.data.data) ? listRes.data.data : [];
      const item = items.find(i => (String(i.id) === String(torboxId) || String(i.torrent_id) === String(torboxId) || String(i.webdownload_id) === String(torboxId)));

      if (item) {
        const rawProg = item.progress !== undefined ? item.progress : 0;
        const percent = Math.min(100, Math.round(rawProg <= 1 ? rawProg * 100 : rawProg));
        const isFinished = !!item.download_finished || item.download_state === 'completed' || percent >= 100;
        const isInactive = !!item.inactive || (item.download_state && (item.download_state.toLowerCase().includes('inactive') || item.download_state.toLowerCase().includes('stalled') || item.download_state.toLowerCase().includes('error')));

        if (isInactive) {
          consecutiveStalled++;
          if (consecutiveStalled >= 6) {
            throw new Error(`Torrent/arquivo inativo ou sem seeds na nuvem Torbox (${percent}% concluído).`);
          }
        } else {
          consecutiveStalled = 0;
        }

        console.log(`[Torbox Resolver] Progresso na nuvem Torbox: ${percent}% (Concluído: ${isFinished})`);
        if (onStatusUpdate && typeof onStatusUpdate === 'function') {
          onStatusUpdate(`☁️ Torbox baixando na nuvem (${percent}%)...`, percent);
        }

        // Se o torrent foi concluído na nuvem, atualiza o ID do arquivo se estivesse como 0/indefinido
        if (isFinished && torboxType === 'torrent' && (currentFileId === 0 || currentFileId === undefined)) {
          if (item.files && Array.isArray(item.files) && item.files.length > 0) {
            const largestFile = item.files.reduce((max, curr) => (curr.size > max.size ? curr : max), item.files[0]);
            if (largestFile && largestFile.id !== undefined) {
              currentFileId = largestFile.id;
              console.log(`[Torbox Resolver] Arquivo principal identificado no torrent concluído: ID ${currentFileId} (${largestFile.name})`);
            }
          }
        }
      }
    } catch (e) {
      if (e.message.includes('inativo ou sem seeds')) throw e;
      console.warn('[Torbox Resolver] Erro ao verificar progresso na nuvem:', e.message);
    }

    await new Promise(r => setTimeout(r, 4000));

    // Tenta solicitar a URL de download direto novamente após aguardar
    dUrl = await requestDirect(currentFileId);
    if (dUrl) {
      console.log(`[Torbox Resolver] Download na nuvem Torbox concluído com sucesso! Link CDN obtido.`);
      return { directUrl: dUrl, referer: 'https://torbox.app/' };
    }
  }

  throw new Error('Tempo limite excedido aguardando a conclusão do download na nuvem Torbox (Timeout 15 min).');
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
      const folderDisplayName = sanitizePathSegment(w.name || `WebDL_${w.id}`);

      if (w.files && Array.isArray(w.files) && w.files.length > 0) {
        w.files.forEach((f, idx) => {
          let rawName = f.short_name || f.name || `Arquivo_${idx + 1}`;
          let pureFileName = rawName.includes('/') ? rawName.split('/').pop() : rawName;
          pureFileName = sanitizePathSegment(pureFileName);
          const fSize = f.size || 0;
          const relPath = `${folderDisplayName}/${pureFileName}`;
          const fFileId = (f.id !== undefined ? f.id : idx);
          const directUrl = `https://api.torbox.app/v1/api/webdl/requestdl?token=${encodeURIComponent(apiKey)}&web_id=${w.id}&file_id=${fFileId}&redirect=true`;

          allFiles.push({
            id: `torbox_cloud_w_${w.id}_${fFileId}`,
            name: pureFileName,
            size: fSize,
            folderName: folderDisplayName,
            relativePath: relPath,
            downloadUrl: directUrl,
            directUrl: directUrl,
            isHttpDirect: true,
            torboxType: 'webdl',
            torboxId: w.id,
            torboxFileId: fFileId,
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
        });
      } else {
        let fileName = folderDisplayName;
        if (!/\.[a-zA-Z0-9]{2,4}$/.test(fileName)) {
          fileName = fileName + '.zip';
        }
        const directUrl = `https://api.torbox.app/v1/api/webdl/requestdl?token=${encodeURIComponent(apiKey)}&web_id=${w.id}&redirect=true`;

        allFiles.push({
          id: `torbox_cloud_w_${w.id}_0`,
          name: fileName,
          size: w.size || 0,
          folderName: fileName,
          relativePath: fileName,
          downloadUrl: directUrl,
          directUrl: directUrl,
          isHttpDirect: true,
          torboxType: 'webdl',
          torboxId: w.id,
          torboxFileId: 0,
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
