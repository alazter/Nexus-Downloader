const https = require('https');
const http = require('http');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

/**
 * Verifica se a URL pertence ao MediaFire
 */
function isMediaFireUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return false;
  return urlStr.toLowerCase().includes('mediafire.com');
}

/**
 * Extrai tipo e chave(s) de qualquer formato de URL do MediaFire
 * Suporta /folder/, /file/, /file_premium/, /download/, /view/, /listen/, /watch/, /?quickkey e download*.mediafire.com
 */
function parseMediaFireUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return null;
  const clean = urlStr.trim();
  let u;
  try {
    u = new URL(clean);
  } catch (e) {
    return null;
  }

  const host = u.hostname.toLowerCase();
  const pathname = u.pathname;

  if (host.startsWith('download') && host.endsWith('mediafire.com')) {
    return { type: 'direct', url: clean };
  }

  const folderMatch = pathname.match(/\/folder\/([a-zA-Z0-9,_-]+)/i);
  if (folderMatch && folderMatch[1]) {
    return { type: 'folder', keys: folderMatch[1].split(',').filter(Boolean), key: folderMatch[1].split(',')[0], url: clean };
  }

  const fileMatch = pathname.match(/\/(?:file|file_premium|download|view|listen|watch)\/([a-zA-Z0-9]+)/i);
  if (fileMatch && fileMatch[1]) {
    return { type: 'file', key: fileMatch[1], url: clean };
  }

  // Formato curto clássico: https://www.mediafire.com/?quickkey ou ?sharekey=...
  if (u.search && u.search.length > 1) {
    const shareKeyParam = u.searchParams.get('sharekey');
    if (shareKeyParam && /^[a-zA-Z0-9]+$/.test(shareKeyParam)) {
      return { type: 'file_or_folder', key: shareKeyParam, url: clean };
    }
    const rawQueryKey = u.search.slice(1).split('&')[0].split('=')[0].trim();
    if (/^[a-zA-Z0-9]{10,25}$/.test(rawQueryKey)) {
      return { type: 'file_or_folder', key: rawQueryKey, url: clean };
    }
  }

  return null;
}

/**
 * Utilitário HTTP GET resiliente com suporte a redirecionamentos (301/302/307/308), cookies e SSL bypass
 */
function fetchWithRedirects(urlStr, options = {}, maxRedirects = 6, cookieJar = []) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) {
      return reject(new Error('Muitos redirecionamentos ao acessar o MediaFire.'));
    }

    let u;
    try {
      u = new URL(urlStr);
    } catch (e) {
      return reject(new Error('URL do MediaFire malformada: ' + urlStr));
    }

    const transport = u.protocol === 'https:' ? https : http;
    const headers = {
      'User-Agent': USER_AGENT,
      'Accept': options.json ? 'application/json, text/plain, */*' : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      'Cache-Control': 'no-cache',
      ...(options.headers || {})
    };
    if (cookieJar.length > 0) {
      headers['Cookie'] = cookieJar.join('; ');
    }

    const req = transport.get(urlStr, {
      rejectUnauthorized: false,
      headers,
      timeout: 20000
    }, res => {
      const setCookies = res.headers['set-cookie'];
      const nextCookies = [...cookieJar];
      if (Array.isArray(setCookies)) {
        setCookies.forEach(c => {
          const kv = c.split(';')[0];
          if (kv) nextCookies.push(kv);
        });
      }

      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (redirectUrl.startsWith('/')) {
          redirectUrl = u.origin + redirectUrl;
        }
        res.resume();
        return resolve(fetchWithRedirects(redirectUrl, options, maxRedirects - 1, nextCookies));
      }

      let d = '';
      res.on('data', chunk => d += chunk);
      res.on('end', () => {
        if (options.returnMeta) {
          return resolve({
            statusCode: res.statusCode,
            finalUrl: urlStr,
            headers: res.headers,
            cookies: nextCookies,
            body: d
          });
        }

        if (res.statusCode !== 200) {
          const err = new Error(`Servidor MediaFire retornou HTTP ${res.statusCode}`);
          err.statusCode = res.statusCode;
          err.body = d;
          return reject(err);
        }

        if (options.json) {
          try {
            resolve(JSON.parse(d));
          } catch (e) {
            reject(new Error('Resposta inválida (não JSON) do MediaFire: ' + d.slice(0, 100)));
          }
        } else {
          resolve(d);
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Tempo de conexão esgotado ao acessar o MediaFire (Timeout 20s).'));
    });

    req.on('error', (err) => {
      reject(new Error('Falha de rede com MediaFire: ' + err.message));
    });
  });
}

function fetchJson(url) {
  return fetchWithRedirects(url, { json: true });
}

function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function sanitizeFolderName(name) {
  if (!name) return 'MediaFire_Downloads';
  return String(name).replace(/[\\/:*?"<>|]/g, '_').trim();
}

function decodeHtmlEntities(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseHumanSizeToBytes(sizeStr) {
  if (!sizeStr || typeof sizeStr !== 'string') return 0;
  const m = sizeStr.match(/([\d.,]+)\s*(TB|GB|MB|KB|Bytes|B)/i);
  if (!m) return 0;
  const val = parseFloat(m[1].replace(',', '.'));
  if (isNaN(val)) return 0;
  const unit = m[2].toUpperCase();
  if (unit === 'TB') return Math.round(val * 1024 * 1024 * 1024 * 1024);
  if (unit === 'GB') return Math.round(val * 1024 * 1024 * 1024);
  if (unit === 'MB') return Math.round(val * 1024 * 1024);
  if (unit === 'KB') return Math.round(val * 1024);
  return Math.round(val);
}

/**
 * Extrai link direto, nome e tamanho de qualquer HTML do MediaFire
 * Suporta data-scrambled-url (Base64), href em #downloadButton / a.popsok e CDN direta no HTML
 */
function extractMediaFireDataFromHtml(html) {
  if (!html || typeof html !== 'string') return { directUrl: null, filename: null, size: 0 };

  let filename = null;
  const nameMatch = html.match(/<div[^>]*class=["'][^"']*filename[^"']*["'][^>]*>([^<]+)<\/div>/i) ||
                    html.match(/<div[^>]*class=["'][^"']*dl-btn-label[^"']*["'][^>]*title=["']([^"']+)["']/i) ||
                    html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
                    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
  if (nameMatch && nameMatch[1]) {
    filename = decodeHtmlEntities(nameMatch[1].trim());
  }

  let size = 0;
  const sizeMatch = html.match(/<span>\(([^)]+)\)<\/span>/i) ||
                    html.match(/id=["']downloadButton["'][^>]*>\s*Download\s*\(([^)]+)\)/i);
  if (sizeMatch && sizeMatch[1]) {
    size = parseHumanSizeToBytes(sizeMatch[1].trim());
  }

  let directUrl = null;

  // 1. Prioridade maxima: atributo data-scrambled-url (Base64 usado pelo MediaFire moderno)
  const scrambledMatch = html.match(/data-scrambled-url=["']([A-Za-z0-9+/=_-]+)["']/i);
  if (scrambledMatch && scrambledMatch[1]) {
    try {
      const decoded = Buffer.from(scrambledMatch[1].trim(), 'base64').toString('utf8').trim();
      if (decoded.startsWith('http') && !decoded.includes('/file/') && !decoded.includes('/folder/')) {
        directUrl = decoded;
      }
    } catch (e) {}
  }

  // 2. Link CDN direto explícito em href ou scripts
  if (!directUrl) {
    const cdnMatch = html.match(/(https?:\/\/download\d*\.mediafire\.com\/[^"'\s<>]+)/i);
    if (cdnMatch && cdnMatch[1]) {
      directUrl = decodeHtmlEntities(cdnMatch[1]);
    }
  }

  // 3. Fallback por atributos do botao #downloadButton / aria-label="Download file" / .popsok
  if (!directUrl) {
    const anchorMatches = html.match(/<a\b[^>]*>/gi) || [];
    for (const tag of anchorMatches) {
      if (
        /id=["']downloadButton["']/i.test(tag) ||
        /aria-label=["']Download file["']/i.test(tag) ||
        /class=["'][^"']*\bpopsok\b[^"']*["']/i.test(tag)
      ) {
        const tagScrambled = tag.match(/data-scrambled-url=["']([^"']+)["']/i);
        if (tagScrambled && tagScrambled[1]) {
          try {
            const dec = Buffer.from(tagScrambled[1].trim(), 'base64').toString('utf8').trim();
            if (dec.startsWith('http')) {
              directUrl = dec;
              break;
            }
          } catch (e) {}
        }
        const hrefM = tag.match(/href=["'](https?:\/\/[^"']+)["']/i);
        if (hrefM && hrefM[1] && !hrefM[1].includes('/file/') && !hrefM[1].includes('#')) {
          directUrl = decodeHtmlEntities(hrefM[1]);
          break;
        }
      }
    }
  }

  return { directUrl, filename, size };
}

/**
 * Fallback via Electron Chromium (contorna Cloudflare Turnstile / JS challenge do MediaFire quando Node HTTPS e bloqueado)
 */
async function resolveMediaFireViaElectron(targetUrl) {
  let win = null;
  try {
    const { BrowserWindow, session } = require('electron');
    if (!BrowserWindow) return null;

    win = new BrowserWindow({
      width: 960,
      height: 680,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    await win.loadURL(targetUrl, { userAgent: USER_AGENT });

    for (let attempt = 0; attempt < 16; attempt++) {
      if (win.isDestroyed()) break;
      const result = await win.webContents.executeJavaScript(`
        (() => {
          const btn = document.querySelector('#downloadButton') ||
                      document.querySelector('a[data-scrambled-url]') ||
                      document.querySelector('a.popsok') ||
                      document.querySelector('a[aria-label="Download file"]');
          const nameEl = document.querySelector('.dl-btn-label') || document.querySelector('.filename');
          const ogTitle = document.querySelector('meta[property="og:title"]');
          const title = (nameEl && (nameEl.getAttribute('title') || nameEl.innerText)) || (ogTitle && ogTitle.getAttribute('content')) || '';
          if (!btn) return { ready: false };
          const scrambled = btn.getAttribute('data-scrambled-url') || '';
          let directUrl = '';
          if (scrambled) {
            try { directUrl = atob(scrambled.trim()); } catch (e) {}
          }
          if (!directUrl) {
            const href = btn.href || btn.getAttribute('href') || '';
            if (href && href.startsWith('http') && !href.includes('/file/') && !href.endsWith('#')) {
              directUrl = href;
            }
          }
          return {
            ready: Boolean(directUrl && directUrl.startsWith('http')),
            directUrl,
            filename: title.trim()
          };
        })();
      `).catch(() => null);

      if (result && result.ready && result.directUrl) {
        let cookieHeader = '';
        try {
          const cookies = await session.defaultSession.cookies.get({ url: 'https://www.mediafire.com' });
          if (cookies && cookies.length > 0) {
            cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
          }
        } catch (e) {}
        return {
          directUrl: result.directUrl,
          filename: result.filename || null,
          referer: targetUrl,
          cookieHeader
        };
      }

      await new Promise(r => setTimeout(r, 500));
    }
  } catch (e) {
    // Electron indisponivel ou janela fechada
  } finally {
    if (win && !win.isDestroyed()) {
      try { win.destroy(); } catch (e) {}
    }
  }
  return null;
}

async function fetchMediaFireFileApiInfo(quickkey) {
  try {
    const infoUrl = `https://www.mediafire.com/api/1.4/file/get_info.php?quick_key=${encodeURIComponent(quickkey)}&response_format=json`;
    const data = await fetchJson(infoUrl);
    if (data && data.response && data.response.result === 'Success' && data.response.file_info) {
      return data.response.file_info;
    }
  } catch (e) {}
  return null;
}

async function scanMediaFireFolder(folderKey, currentPath = '') {
  let files = [];

  let folderName = currentPath;
  if (!folderName) {
    try {
      const infoUrl = 'https://www.mediafire.com/api/1.4/folder/get_info.php?folder_key=' + encodeURIComponent(folderKey) + '&response_format=json';
      const infoData = await fetchJson(infoUrl);
      if (infoData && infoData.response && infoData.response.folder_info) {
        folderName = sanitizeFolderName(infoData.response.folder_info.name);
      }
    } catch (e) {
      folderName = 'MediaFire_Downloads';
    }
  }

  let chunk = 1;
  let moreChunks = true;

  while (moreChunks) {
    const filesUrl = 'https://www.mediafire.com/api/1.4/folder/get_content.php?folder_key=' + encodeURIComponent(folderKey) + '&content_type=files&chunk=' + chunk + '&response_format=json';
    const filesData = await fetchJson(filesUrl);

    if (filesData && filesData.response && filesData.response.folder_content && filesData.response.folder_content.files) {
      const itemList = filesData.response.folder_content.files;
      itemList.forEach(item => {
        const sizeBytes = parseInt(item.size, 10) || 0;
        const pageUrl = item.links && item.links.normal_download ? item.links.normal_download : 'https://www.mediafire.com/file/' + item.quickkey + '/' + encodeURIComponent(item.filename) + '/file';
        const relativePath = folderName ? folderName + '/' + item.filename : item.filename;

        files.push({
          id: 'mediafire_' + item.quickkey,
          fileId: 'mf_' + item.quickkey,
          numericId: item.quickkey,
          name: item.filename,
          size: sizeBytes,
          sizeFormatted: formatBytes(sizeBytes),
          relativePath: relativePath,
          folderPath: folderName || 'MediaFire_Downloads',
          folderName: folderName ? folderName.split('/')[0] : 'MediaFire_Downloads',
          preserveRelativePath: true,
          isHttpDirect: true,
          service: 'MediaFire',
          url: pageUrl,
          sourceUrl: pageUrl,
          mediafireUrl: pageUrl
        });
      });

      moreChunks = filesData.response.folder_content.more_chunks === 'yes';
      chunk++;
    } else {
      moreChunks = false;
    }
  }

  try {
    const subUrl = 'https://www.mediafire.com/api/1.4/folder/get_content.php?folder_key=' + encodeURIComponent(folderKey) + '&content_type=folders&response_format=json';
    const subData = await fetchJson(subUrl);

    if (subData && subData.response && subData.response.folder_content && subData.response.folder_content.folders) {
      const subFolders = subData.response.folder_content.folders;
      for (const sub of subFolders) {
        const subPath = folderName ? folderName + '/' + sanitizeFolderName(sub.name) : sanitizeFolderName(sub.name);
        const subFiles = await scanMediaFireFolder(sub.folderkey, subPath);
        files = files.concat(subFiles);
      }
    }
  } catch (e) {
    console.warn('[MediaFire Scanner] Erro ao buscar subpastas:', e.message);
  }

  return files;
}

async function scanMediaFireFile(fileUrl, knownKey = null) {
  const parsed = parseMediaFireUrl(fileUrl);
  const quickkey = knownKey || (parsed && parsed.key) || ('file_' + Date.now());

  if (parsed && parsed.type === 'direct') {
    const cleanName = decodeURIComponent(new URL(fileUrl).pathname.split('/').pop() || 'arquivo_mediafire');
    return [{
      id: 'mediafire_' + Buffer.from(fileUrl).toString('hex').slice(0, 12),
      fileId: 'mf_direct',
      numericId: quickkey,
      name: cleanName,
      size: 0,
      sizeFormatted: '',
      relativePath: cleanName,
      folderName: null,
      isSingleFile: true,
      isAvulso: true,
      isHttpDirect: true,
      service: 'MediaFire',
      url: fileUrl,
      sourceUrl: fileUrl,
      directUrl: fileUrl,
      downloadUrl: fileUrl,
      mediafireUrl: fileUrl
    }];
  }

  // 1. Consulta metadados exatos via API pública oficial 1.4/1.5 (sem bloqueio Cloudflare)
  const apiInfo = /^[a-zA-Z0-9]+$/.test(quickkey) ? await fetchMediaFireFileApiInfo(quickkey) : null;
  let filename = apiInfo && apiInfo.filename ? apiInfo.filename.trim() : null;
  let sizeBytes = apiInfo && apiInfo.size ? parseInt(apiInfo.size, 10) || 0 : 0;
  let canonicalUrl = (apiInfo && apiInfo.links && apiInfo.links.normal_download) ? apiInfo.links.normal_download : fileUrl;
  let directUrl = null;

  // 2. Complementa / resolve HTML (e usa Electron se bloqueado por Cloudflare)
  try {
    const res = await fetchWithRedirects(canonicalUrl, { returnMeta: true });
    if (res && res.statusCode === 200 && res.body) {
      const parsedHtml = extractMediaFireDataFromHtml(res.body);
      if (!filename && parsedHtml.filename) filename = parsedHtml.filename;
      if (!sizeBytes && parsedHtml.size) sizeBytes = parsedHtml.size;
      if (parsedHtml.directUrl) directUrl = parsedHtml.directUrl;
    }
  } catch (e) {}

  if (!filename || !directUrl) {
    const elec = await resolveMediaFireViaElectron(canonicalUrl);
    if (elec) {
      if (!filename && elec.filename) filename = elec.filename;
      if (!directUrl && elec.directUrl) directUrl = elec.directUrl;
    }
  }

  filename = sanitizeFolderName(filename || ('arquivo_' + quickkey)).replace(/^MediaFire_Downloads$/, 'arquivo_mediafire');

  return [{
    id: 'mediafire_' + quickkey,
    fileId: 'mf_' + quickkey,
    numericId: quickkey,
    name: filename,
    size: Math.round(sizeBytes),
    sizeFormatted: sizeBytes > 0 ? formatBytes(Math.round(sizeBytes)) : '',
    relativePath: filename,
    folderName: null,
    isSingleFile: true,
    isAvulso: true,
    isHttpDirect: true,
    service: 'MediaFire',
    url: canonicalUrl,
    sourceUrl: fileUrl,
    mediafireUrl: canonicalUrl,
    ...(directUrl ? { directUrl, downloadUrl: directUrl } : {})
  }];
}

async function scanMediaFireLink(urlStr) {
  console.log('[MediaFire Scanner] Escaneando URL:', urlStr);

  const parsed = parseMediaFireUrl(urlStr);
  if (!parsed) {
    throw new Error('Formato de link do MediaFire não reconhecido.');
  }

  if (parsed.type === 'folder') {
    let allFiles = [];
    for (const k of parsed.keys) {
      const chunkFiles = await scanMediaFireFolder(k);
      allFiles = allFiles.concat(chunkFiles);
    }
    return allFiles;
  }

  if (parsed.type === 'file_or_folder') {
    // Verifica se a key curta (?key) corresponde a arquivo ou pasta na API
    const apiFile = await fetchMediaFireFileApiInfo(parsed.key);
    if (apiFile) {
      return await scanMediaFireFile(urlStr, parsed.key);
    }
    try {
      const folderFiles = await scanMediaFireFolder(parsed.key);
      if (folderFiles && folderFiles.length > 0) return folderFiles;
    } catch (e) {}
    return await scanMediaFireFile(urlStr, parsed.key);
  }

  return await scanMediaFireFile(urlStr, parsed.key);
}

async function resolveMediaFireDirectUrl(quickkey, fileUrl) {
  const parsed = fileUrl ? parseMediaFireUrl(fileUrl) : null;
  if (parsed && parsed.type === 'direct') {
    return {
      directUrl: fileUrl,
      referer: 'https://www.mediafire.com/',
      cookieHeader: ''
    };
  }

  let targetUrl = fileUrl;
  const resolvedKey = (parsed && parsed.key) || quickkey;
  if (!targetUrl || !targetUrl.includes('mediafire.com')) {
    if (resolvedKey && resolvedKey !== 'null' && resolvedKey !== 'undefined') {
      targetUrl = 'https://www.mediafire.com/file/' + resolvedKey + '/file';
    } else {
      throw new Error('URL/Chave do MediaFire ausente para resolução de download.');
    }
  }

  console.log('[MediaFire Resolver] Resolvendo link direto para:', targetUrl);

  // 1. Tenta via HTTP direto capturando cookies + data-scrambled-url / href
  try {
    const res = await fetchWithRedirects(targetUrl, { returnMeta: true });
    if (res && res.statusCode === 200 && res.body) {
      const extracted = extractMediaFireDataFromHtml(res.body);
      if (extracted.directUrl) {
        return {
          directUrl: extracted.directUrl,
          referer: res.finalUrl || targetUrl,
          cookieHeader: (res.cookies || []).join('; '),
          fileName: extracted.filename || null,
          size: extracted.size || 0
        };
      }
    }
  } catch (e) {
    console.warn('[MediaFire Resolver] HTTP direto falhou, acionando fallback Electron:', e.message);
  }

  // 2. Fallback via Electron BrowserWindow (resolve Cloudflare Turnstile / JS rendering / data-scrambled-url)
  const elec = await resolveMediaFireViaElectron(targetUrl);
  if (elec && elec.directUrl) {
    return elec;
  }

  // 3. Ultimo recurso via API file/get_info.php para obter normal_download canonica e re-tentar Electron
  if (resolvedKey && /^[a-zA-Z0-9]+$/.test(resolvedKey)) {
    const info = await fetchMediaFireFileApiInfo(resolvedKey);
    if (info && info.links && info.links.normal_download && info.links.normal_download !== targetUrl) {
      const elec2 = await resolveMediaFireViaElectron(info.links.normal_download);
      if (elec2 && elec2.directUrl) {
        if (!elec2.filename && info.filename) elec2.filename = info.filename;
        return elec2;
      }
    }
  }

  throw new Error('Não foi possível extrair o link direto de download do MediaFire (proteção Cloudflare ou link expirado).');
}

module.exports = {
  isMediaFireUrl,
  parseMediaFireUrl,
  scanMediaFireLink,
  resolveMediaFireDirectUrl
};
