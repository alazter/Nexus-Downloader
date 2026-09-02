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
 * Verifica se um nome de torrent/job é um nome genérico de scraper/debrid (ex: Torrentio, Stremio)
 */
function isGenericScraperName(name) {
  if (!name || typeof name !== 'string') return true;
  const n = name.trim().toLowerCase();
  if (n === '' || n === 'torrentio' || n === 'stremio' || n === 'debrid' || n === 'torbox' || n === 'unknown') return true;
  if (/^torrentio\s*\d*(p|k)?$/i.test(n)) return true;
  if (/^stremio\s*\d*(p|k)?$/i.test(n)) return true;
  if (/^debrid\s*\d*(p|k)?$/i.test(n)) return true;
  return false;
}

/**
 * Extrai o nome real do lançamento ignorando nomes genéricos do scraper (Torrentio/Stremio)
 */
function extractRealReleaseName(rawName, magnetUrl, fileList) {
  if (!isGenericScraperName(rawName)) return rawName.trim();

  // 1. Tenta extrair o parâmetro dn= do magnet link
  if (magnetUrl && typeof magnetUrl === 'string') {
    const dnMatch = magnetUrl.match(/[?&]dn=([^&]+)/i);
    if (dnMatch && dnMatch[1]) {
      try {
        const decoded = decodeURIComponent(dnMatch[1].replace(/\+/g, ' ')).trim();
        if (decoded && !isGenericScraperName(decoded)) {
          return decoded;
        }
      } catch (e) {}
    }
  }

  // 2. Tenta extrair o nome do primeiro arquivo relevante na lista de arquivos do torrent
  if (fileList && Array.isArray(fileList) && fileList.length > 0) {
    for (const f of fileList) {
      const fName = f.name ? f.name.split(/[/\\]/).pop() : '';
      if (fName && !isGenericScraperName(fName)) {
        const cleanFname = fName.replace(/\.[a-zA-Z0-9]{2,4}$/, '');
        if (cleanFname && !isGenericScraperName(cleanFname)) {
          return cleanFname.trim();
        }
      }
    }
  }

  return rawName || 'Download';
}

/**
 * Extrai o nome limpo da série/anime removendo numerações de episódios e tags para agrupar em pasta única
 */
function extractCleanShowName(title) {
  if (!title || typeof title !== 'string') return title;

  let s = title.trim();

  // Remove a extensão se presente
  s = s.replace(/\.[a-zA-Z0-9]{2,4}$/i, '');

  // Se começar com grupo de release entre colchetes (ex: [Erai-raws], [SubsPlease]), remove
  s = s.replace(/^\[[^\]]+\]\s*/i, '');

  // Remove colchetes e parênteses informativos do final (ex: [1080p], [Multiple Subtitle], [3F69C3A9], [v0], (1080p))
  s = s.replace(/(\[[^\]]+\]|\([^)]+\))\s*/gi, '');

  // Remove numeração de episódios e sufixos no final
  // Ex: " - 01", " - 12 END", " - 05 v2", " S01E02", " E1085", ".S03E01"
  s = s.replace(/\s*-\s*\d+(\s*END|\s*v\d+)?\s*$/i, '');
  s = s.replace(/[\s._]+[Ss]\d+[Ee]\d+.*$/i, '');
  s = s.replace(/[\s._]+[Ee]\d+.*$/i, '');
  s = s.replace(/\s+-\s+\d+.*$/i, '');

  // Substitui pontos e underscores por espaços se o nome estiver no formato dot-separated
  if (s.includes('.') && !s.includes(' ')) {
    s = s.replace(/\./g, ' ');
  }

  s = s.replace(/[-_\s]+$/, '').replace(/^[-_\s]+/, '').trim();

  return s || title;
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
 * Obtém a contagem real-time de jobs ativos na nuvem do Torbox
 * (inclui WebDLs e Torrents ativos, tanto do Nexus quanto externos do painel Torbox)
 */
async function getTorboxActiveCloudJobsCount(apiKey) {
  if (!apiKey || !apiKey.trim()) return 0;
  let activeJobs = 0;
  try {
    const webdlRes = await callTorboxApi('/webdl/mylist?bypass_cache=true', 'GET', apiKey);
    if (webdlRes && webdlRes.data && Array.isArray(webdlRes.data.data)) {
      webdlRes.data.data.forEach(w => {
        const isFinished = !!w.download_finished || w.download_state === 'completed' || (w.progress !== undefined && w.progress >= 1);
        const isInactive = !!w.inactive || (w.download_state && (w.download_state.toLowerCase().includes('error') || w.download_state.toLowerCase().includes('expired')));
        if (!isFinished && !isInactive) activeJobs++;
      });
    }
  } catch (e) {}

  try {
    const torrentRes = await callTorboxApi('/torrents/mylist?bypass_cache=true', 'GET', apiKey);
    if (torrentRes && torrentRes.data && Array.isArray(torrentRes.data.data)) {
      torrentRes.data.data.forEach(t => {
        const isFinished = !!t.download_finished || t.download_state === 'completed' || (t.progress !== undefined && t.progress >= 1);
        const isInactive = !!t.inactive || (t.download_state && (t.download_state.toLowerCase().includes('error') || t.download_state.toLowerCase().includes('expired')));
        if (!isFinished && !isInactive) activeJobs++;
      });
    }
  } catch (e) {}

  return activeJobs;
}

/**
 * Aguarda inteligentemente a liberação de uma vaga na nuvem do Torbox
 * (respeita o limite do plano de 3 downloads simultâneos no Torbox)
 */
async function waitForTorboxSlot(apiKey, maxSlots = 3, onStatusUpdate = null, abortSignal = null) {
  if (!apiKey || !apiKey.trim()) return;
  const limit = Math.max(1, maxSlots || 3);
  let active = await getTorboxActiveCloudJobsCount(apiKey);

  let checkCount = 0;
  while (active >= limit) {
    if (abortSignal && abortSignal.aborted) break;
    checkCount++;
    console.log(`[Torbox Governor] Vagas esgotadas no Torbox (${active}/${limit} ativos na nuvem). Aguardando liberação... (tentativa ${checkCount})`);
    if (onStatusUpdate && typeof onStatusUpdate === 'function') {
      onStatusUpdate(`Aguardando vaga no Torbox (${active}/${limit} na nuvem)...`, 0);
    }
    await new Promise(r => setTimeout(r, 5000));
    if (abortSignal && abortSignal.aborted) break;
    active = await getTorboxActiveCloudJobsCount(apiKey);
  }
}

/**
 * Escaneia um link (Magnet/Torrent ou Hoster) via API Key do Torbox
 */
async function scanTorboxLink(urlStr, apiKey, onStatusUpdate = null) {
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
    const cleanUrlStr = urlStr.trim();
    console.log('[Torbox Scanner] Processando Hoster Link:', cleanUrlStr);

    let existing = null;
    try {
      const listRes = await callTorboxApi('/webdl/mylist?bypass_cache=true', 'GET', apiKey);
      const myWebdls = (listRes.data && listRes.data.data) ? listRes.data.data : [];
      const targetClean = cleanUrlStr.toLowerCase();

      // Procura em primeiro lugar uma WebDL ATIVA do álbum completo (com a matriz de arquivos)
      existing = myWebdls.find(w => {
        if (!w.original_url || w.download_state === 'expired' || w.download_state === 'failed' || w.inactive) return false;
        const wOrig = w.original_url.trim().toLowerCase();
        const matches = wOrig === targetClean || wOrig.includes(targetClean) || targetClean.includes(wOrig);
        return matches && w.files && Array.isArray(w.files) && w.files.length > 1;
      });

      if (!existing) {
        existing = myWebdls.find(w => {
          if (!w.original_url || w.download_state === 'expired' || w.download_state === 'failed' || w.inactive) return false;
          const wOrig = w.original_url.trim().toLowerCase();
          return wOrig === targetClean || wOrig.includes(targetClean) || targetClean.includes(wOrig);
        });
      }
    } catch (e) {
      console.warn('[Torbox Scanner] Não foi possível consultar lista prévia de WebDLs:', e.message);
    }

    let targetWebdl = existing;

    if (!targetWebdl) {
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
          targetWebdl = myWebdls.find(w => (w.original_url && w.original_url.toLowerCase().includes(targetClean)) || (w.name && targetClean.includes(w.name.toLowerCase())));
        } catch (e) {}

        if (!targetWebdl) {
          const detail = (createRes.data && createRes.data.detail) ? createRes.data.detail : 'Falha ao desproteger link no Torbox';
          throw new Error(detail);
        }
      } else {
        const webData = createRes.data.data || {};
        targetWebdl = webData;
      }
    }

    const webdlId = targetWebdl.id || targetWebdl.webdownload_id;

    // Aguarda até 5 segundos caso a lista de arquivos da pasta/álbum do MEGA/Hoster esteja sendo indexada no Torbox
    if (webdlId && (!targetWebdl.files || !Array.isArray(targetWebdl.files) || targetWebdl.files.length <= 1)) {
      console.log('[Torbox Scanner] Aguardando indexação da matriz de arquivos da pasta/álbum no Torbox...');
      for (let attempt = 0; attempt < 5; attempt++) {
        await new Promise(r => setTimeout(r, 1000));
        try {
          const listRes = await callTorboxApi('/webdl/mylist?bypass_cache=true', 'GET', apiKey);
          const myWebdls = (listRes.data && listRes.data.data) ? listRes.data.data : [];
          const found = myWebdls.find(w => w.id === webdlId || w.webdownload_id === webdlId);
          if (found) {
            targetWebdl = found;
            if (found.files && Array.isArray(found.files) && found.files.length > 1) {
              console.log(`[Torbox Scanner] Matriz de ${found.files.length} arquivos descompactados da pasta obtida com sucesso!`);
              break;
            }
          }
        } catch (e) {}
      }
    }

    return buildWebdlResultList(targetWebdl, apiKey, cleanUrlStr);
  }
}

/**
 * Função auxiliar para montar a lista de resultados de uma WebDL (Arquivos individuais ou Pacote ZIP)
 */
function buildWebdlResultList(webdlItem, apiKey, originalLink = '') {
  const webdlId = webdlItem.id || webdlItem.webdownload_id;
  const folderDisplayName = sanitizePathSegment(webdlItem.name || 'Hoster_Download');
  const resultList = [];

  // Se a WebDL do Torbox possui múltiplos arquivos descompactados (ex: pasta/álbum Pixeldrain com vídeos .mp4)
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
        isZipDownload: false,
        sourceUrl: originalLink || webdlItem.original_url || '',
        originalUrl: originalLink || webdlItem.original_url || '',
        torboxDownloadUrl: permalinkUrl,
        directUrl: permalinkUrl,
        downloadUrl: permalinkUrl
      });
    });
    return resultList;
  }

  // Se for arquivo único ou se o Torbox empacotou como .zip único
  let fileName = folderDisplayName;
  if (!/\.[a-zA-Z0-9]{2,4}$/.test(fileName)) {
    fileName = fileName + '.zip';
  }
  const fileSize = webdlItem.size || 0;
  const webdlPermalink = `https://api.torbox.app/v1/api/webdl/requestdl?token=${encodeURIComponent(apiKey)}&web_id=${webdlId}&zip=true&redirect=true`;

  resultList.push({
    id: 'torbox_webdl_' + webdlId + '_zip',
    fileId: 'tb_w_' + webdlId + '_zip',
    numericId: 'tb_w_zip',
    name: fileName,
    size: fileSize,
    sizeFormatted: formatBytes(fileSize),
    relativePath: `${folderDisplayName}/${fileName}`,
    folderName: folderDisplayName,
    isHttpDirect: true,
    torboxType: 'webdl',
    torboxId: webdlId,
    torboxFileId: 0,
    isZipDownload: true,
    sourceUrl: originalLink || webdlItem.original_url || '',
    originalUrl: originalLink || webdlItem.original_url || '',
    torboxDownloadUrl: webdlPermalink,
    directUrl: webdlPermalink,
    downloadUrl: webdlPermalink
  });

  return resultList;
}

/**
 * Resolve o link direto de download do Torbox (solicita temporário via API)
 */
async function resolveTorboxDirectUrl(fileId, apiKey, torboxType = 'torrent', torboxId = 0, torboxFileId = 0, onStatusUpdate = null, isZipDownload = false) {
  console.log(`[Torbox Resolver] Resolvendo URL para ${torboxType} (ID: ${torboxId}, FileID: ${torboxFileId}, Zip: ${isZipDownload})...`);

  if (!apiKey) {
    throw new Error('API Key do Torbox ausente.');
  }

  let currentFileId = torboxFileId;

  const requestDirect = async (targetFileId) => {
    let fid = (targetFileId !== undefined && targetFileId !== null) ? targetFileId : 0;
    let endpoint = '';
    if (torboxType === 'torrent') {
      endpoint = `/torrents/requestdl?token=${encodeURIComponent(apiKey)}&torrent_id=${torboxId}&file_id=${fid}&redirect=false`;
    } else if (isZipDownload || String(fileId).endsWith('_zip')) {
      endpoint = `/webdl/requestdl?token=${encodeURIComponent(apiKey)}&web_id=${torboxId}&zip=true&redirect=false`;
    } else {
      endpoint = `/webdl/requestdl?token=${encodeURIComponent(apiKey)}&web_id=${torboxId}&file_id=${fid}&redirect=false`;
    }

    // Tenta obter a URL direta do CDN com até 5 retentativas
    for (let tryCount = 0; tryCount < 5; tryCount++) {
      try {
        const res = await callTorboxApi(endpoint, 'GET', apiKey);
        if (res.statusCode === 200 && res.data) {
          let dUrl = null;
          if (typeof res.data.data === 'string' && res.data.data.startsWith('http')) {
            dUrl = res.data.data;
          } else if (res.data.data && typeof res.data.data === 'object' && typeof res.data.data.url === 'string' && res.data.data.url.startsWith('http')) {
            dUrl = res.data.data.url;
          } else if (typeof res.data.url === 'string' && res.data.url.startsWith('http')) {
            dUrl = res.data.url;
          } else if (typeof res.data.detail === 'string' && res.data.detail.startsWith('http')) {
            dUrl = res.data.detail;
          }
          if (dUrl) return dUrl;
        }
      } catch (e) {
        console.warn(`[Torbox Resolver] Tentativa ${tryCount + 1}/5 de obter CDN URL falhou:`, e.message);
      }
      if (tryCount < 4) await new Promise(r => setTimeout(r, 1200));
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
      isCloudReady = !!item.download_finished || item.download_state === 'completed' || item.download_state === 'seeding' || item.download_state === 'cached' || percent >= 100;
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

  // Se requestDirect não retornou a URL de CDN de imediato ou se a verificação inicial falhou, 
  // tenta mais 1 vez e faz fallback direto para o link assinado do Torbox com redirect=true
  let fallbackDUrl = await requestDirect(currentFileId);
  if (fallbackDUrl) {
    return { directUrl: fallbackDUrl, referer: 'https://torbox.app/' };
  }

  // Fallback direto e instantâneo assinado pelo Torbox
  const fid = (currentFileId !== undefined && currentFileId !== null) ? currentFileId : 0;
  const signedUrl = torboxType === 'torrent'
    ? `https://api.torbox.app/v1/api/torrents/requestdl?token=${encodeURIComponent(apiKey)}&torrent_id=${torboxId}&file_id=${fid}&redirect=true`
    : `https://api.torbox.app/v1/api/webdl/requestdl?token=${encodeURIComponent(apiKey)}&web_id=${torboxId}&file_id=${fid}&redirect=true`;

  console.log(`[Torbox Resolver] Retornando URL direta assinada para "${torboxId}" (file_id: ${fid}): ${signedUrl}`);
  return { directUrl: signedUrl, referer: 'https://torbox.app/' };
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
      const hashStr = t.hash || '';
      const magnetStr = hashStr ? `magnet:?xt=urn:btih:${hashStr}&dn=${encodeURIComponent(t.name || 'torrent')}` : (t.magnet || '');
      const rawRelName = extractRealReleaseName(t.name || `Torrent_${t.id}`, magnetStr, t.files);
      const folderName = extractCleanShowName(rawRelName);

      const rawProg = t.progress !== undefined ? t.progress : 0;
      const percent = Math.round(rawProg <= 1 ? rawProg * 100 : rawProg);
      const stateLower = (t.download_state || '').toLowerCase();
      const isFinished = !!t.download_finished || stateLower === 'completed' || stateLower === 'seeding' || stateLower === 'cached';
      const isQueued = !isFinished && (stateLower.includes('queued') || stateLower.includes('waiting') || stateLower.includes('metadl'));
      const isInactive = !isFinished && !isQueued && (!!t.inactive || stateLower.includes('inactive') || stateLower.includes('error') || stateLower.includes('failed') || stateLower.includes('cancelled'));

      let statusText = isFinished ? 'Concluído' : (isQueued ? 'Em Fila' : (isInactive ? 'Inativo' : (stateLower.includes('stalled') ? 'Stalled (No Seeds)' : `Baixando (${percent}%)`)));

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
            isQueued: isQueued,
            isInactive: isInactive,
            progress: percent,
            cloudStatus: statusText,
            cloudState: t.download_state || '',
            hash: hashStr,
            seeds: t.seeds || t.num_seeds || 0,
            peers: t.peers || t.num_peers || 0,
            magnetUrl: magnetStr,
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
          isQueued: isQueued,
          isInactive: isInactive,
          progress: percent,
          cloudStatus: statusText,
          cloudState: t.download_state || '',
          hash: hashStr,
          seeds: t.seeds || t.num_seeds || 0,
          peers: t.peers || t.num_peers || 0,
          magnetUrl: magnetStr,
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
      const wStateLower = (w.download_state || '').toLowerCase();
      const isFinished = !!w.download_finished || wStateLower === 'completed' || wStateLower === 'cached';
      const isQueued = !isFinished && (wStateLower.includes('queued') || wStateLower.includes('waiting') || wStateLower.includes('metadl'));
      const isInactive = !isFinished && !isQueued && (!!w.inactive || wStateLower.includes('inactive') || wStateLower.includes('error') || wStateLower.includes('failed') || wStateLower.includes('cancelled'));

      let statusText = isFinished ? 'Concluído' : (isQueued ? 'Em Fila' : (isInactive ? 'Inativo' : `Baixando (${percent}%)`));
      const folderDisplayName = sanitizePathSegment(w.name || `WebDL_${w.id}`);

      const isPixeldrain = (w.original_url && w.original_url.toLowerCase().includes('pixeldrain')) ||
                           (w.name && w.name.toLowerCase().includes('pixeldrain'));

      if (isPixeldrain || !w.files || !Array.isArray(w.files) || w.files.length <= 1) {
        let fileName = folderDisplayName;
        if (!/\.[a-zA-Z0-9]{2,4}$/.test(fileName)) {
          fileName = fileName + '.zip';
        } else if (isPixeldrain && !fileName.toLowerCase().endsWith('.zip')) {
          const extIdx = fileName.lastIndexOf('.');
          if (extIdx > 0) fileName = fileName.substring(0, extIdx);
          fileName = fileName + '.zip';
        }
        const fileSize = w.size || (w.files ? w.files.reduce((acc, f) => acc + (f.size || 0), 0) : 0);
        const directUrl = `https://api.torbox.app/v1/api/webdl/requestdl?token=${encodeURIComponent(apiKey)}&web_id=${w.id}&zip=true&redirect=true`;

        allFiles.push({
          id: `torbox_cloud_w_${w.id}_zip`,
          name: fileName,
          size: fileSize,
          folderName: folderDisplayName,
          relativePath: `${folderDisplayName}/${fileName}`,
          downloadUrl: directUrl,
          directUrl: directUrl,
          isHttpDirect: true,
          torboxType: 'webdl',
          torboxId: w.id,
          torboxFileId: 0,
          isZipDownload: true,
          sourceUrl: w.original_url || '',
          originalUrl: w.original_url || '',
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
      } else {
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
            sourceUrl: w.original_url || '',
            originalUrl: w.original_url || '',
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
      }
    }
  } catch (err) {
    console.warn('[Torbox Fetch] Erro ao buscar lista de WebDL:', err.message);
  }

  return allFiles;
}

/**
 * Controla itens na nuvem Torbox (delete, reannounce, start/force_start, pause, resume)
 */
async function controlTorboxItem(id, type = 'torrent', action = 'delete', apiKey = '') {
  if (!apiKey) throw new Error('API Key do Torbox não informada.');
  const endpoint = type === 'webdl' ? '/webdl/controldl' : '/torrents/controldl';
  
  // Trata mapeamento de ações amigáveis para a API do Torbox
  let mappedAction = action;
  if (action === 'force_start') mappedAction = 'start';
  
  const payload = type === 'webdl'
    ? { webdownload_id: parseInt(id, 10) || id, action: mappedAction }
    : { torrent_id: parseInt(id, 10) || id, action: mappedAction };

  console.log(`[Torbox Control] Enviando ação '${mappedAction}' (${action}) para ${type} ID ${id}...`);
  const res = await callTorboxApi(endpoint, 'POST', apiKey, payload);
  if (!res || res.success === false) {
    throw new Error(res && res.detail ? res.detail : `Falha ao executar ação '${action}' no Torbox.`);
  }
  return res;
}

module.exports = {
  isTorboxUrl,
  testTorboxApiKey,
  scanTorboxLink,
  resolveTorboxDirectUrl,
  fetchTorboxUserDownloads,
  getTorboxActiveCloudJobsCount,
  waitForTorboxSlot,
  controlTorboxItem,
  extractRealReleaseName,
  extractCleanShowName
};
