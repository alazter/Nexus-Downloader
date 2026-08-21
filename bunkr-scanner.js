const https = require('https');
const http = require('http');
const { URL } = require('url');

/**
 * Verifica se a URL fornecida pertence ao Bunkr
 */
function isBunkrUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return false;
  return /bunkr\.|bunkrr\.|balbums\./i.test(urlStr);
}

/**
 * Utilitário de requisição HTTP GET retornando Texto/HTML
 */
function fetchText(targetUrl, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      const parsedUrl = new URL(targetUrl);
      const transport = parsedUrl.protocol === 'https:' ? https : http;
      const reqOptions = {
        rejectUnauthorized: false,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Referer': 'https://bunkr.cr/',
          ...options.headers
        }
      };

      const req = transport.get(targetUrl, reqOptions, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirectUrl = new URL(res.headers.location, targetUrl).toString();
          return fetchText(redirectUrl, options).then(resolve).catch(reject);
        }
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      });
      req.on('error', reject);
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Utilitário de requisição HTTP POST para JSON
 */
function postJson(targetUrl, bodyData, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      const parsedUrl = new URL(targetUrl);
      const transport = parsedUrl.protocol === 'https:' ? https : http;
      const postPayload = JSON.stringify(bodyData);
      const reqOptions = {
        method: 'POST',
        rejectUnauthorized: false,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postPayload),
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
          'Referer': 'https://dl.bunkr.cr/',
          ...options.headers
        }
      };

      const req = transport.request(targetUrl, reqOptions, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      });
      req.on('error', reject);
      req.write(postPayload);
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Formata bytes em string legível
 */
function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Resolve os detalhes de um arquivo individual Bunkr a partir do ID da página
 */
async function getBunkrFileDetails(fileId, folderName) {
  try {
    const pageUrl = `https://bunkr.cr/f/${fileId}`;
    const html = await fetchText(pageUrl);

    // Extrai o nome do arquivo
    let filename = `bunkr_${fileId}`;
    const titleMatch = html.match(/<h1[^>]*>(.*?)<\/h1>/i) || html.match(/<title>(.*?)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      let cleanTitle = titleMatch[1].replace(/Download /i, '').replace(/ - Bunkr.*/i, '').trim();
      if (cleanTitle && cleanTitle !== 'Bunkr') {
        filename = cleanTitle;
      }
    }

    // Extrai o ID numérico do botão de download ou meta tag
    let numericId = null;
    const dlBtnMatch = html.match(/data-id="(\d+)"/i) || html.match(/href="https:\/\/dl\.bunkr\.[^/]+\/file\/(\d+)"/i);
    if (dlBtnMatch) {
      numericId = dlBtnMatch[1];
    }

    // Tenta obter o tamanho do arquivo
    let sizeInBytes = 0;
    const sizeMatch = html.match(/(\d+(?:\.\d+)?)\s*(MB|GB|KB|Bytes)/i);
    if (sizeMatch) {
      const val = parseFloat(sizeMatch[1]);
      const unit = sizeMatch[2].toUpperCase();
      if (unit === 'GB') sizeInBytes = Math.round(val * 1024 * 1024 * 1024);
      else if (unit === 'MB') sizeInBytes = Math.round(val * 1024 * 1024);
      else if (unit === 'KB') sizeInBytes = Math.round(val * 1024);
      else sizeInBytes = Math.round(val);
    }

    const relativePath = folderName ? `${folderName}/${filename}` : filename;

    return {
      id: `bunkr_${fileId}`,
      fileId: fileId,
      numericId: numericId,
      name: filename,
      relativePath: relativePath,
      folderName: folderName || 'Bunkr_Downloads',
      size: sizeInBytes,
      sizeFormatted: formatBytes(sizeInBytes),
      isHttpDirect: true,
      bunkrPageUrl: pageUrl
    };
  } catch (err) {
    console.error(`[Bunkr] Erro ao resolver arquivo ${fileId}:`, err.message);
    return {
      id: `bunkr_${fileId}`,
      fileId: fileId,
      name: `bunkr_${fileId}.bin`,
      relativePath: folderName ? `${folderName}/bunkr_${fileId}.bin` : `bunkr_${fileId}.bin`,
      folderName: folderName || 'Bunkr_Downloads',
      size: 0,
      sizeFormatted: 'Desconhecido',
      isHttpDirect: true,
      bunkrPageUrl: `https://bunkr.cr/f/${fileId}`
    };
  }
}

/**
 * Obtém a URL final assinada e os cookies de autorização para um arquivo Bunkr
 */
async function resolveBunkrDirectUrl(numericId, fileId) {
  try {
    const idToUse = numericId || fileId;
    if (!idToUse) throw new Error('ID do arquivo não informado');
    const pageUrl = `https://bunkr.cr/f/${fileId || idToUse}`;

    // 1. Obter metadados via API POST
    const meta = await postJson('https://dl.bunkr.cr/api/_001_v2', { id: idToUse });
    if (!meta || !meta.path) {
      throw new Error('Metadados da API Bunkr inválidos');
    }

    // 2. Obter assinaturas token e ex
    const rawPath = meta.path.startsWith('/') ? meta.path : '/' + meta.path;
    const signUrl = `https://glb-apisign.cdn.cr/sign?path=${encodeURIComponent(rawPath)}`;
    const signData = await fetchText(signUrl).then(data => JSON.parse(data));

    // 3. Montar URL do CDN
    let mediaHost = meta.mediafiles || 'https://get.bunkrr.su';
    const cleanHost = mediaHost.endsWith('/') ? mediaHost.slice(0, -1) : mediaHost;
    const cleanPath = rawPath.startsWith('/') ? rawPath : '/' + rawPath;

    const finalUrl = new URL(cleanHost + cleanPath);
    if (meta.original) finalUrl.searchParams.set('n', meta.original);
    if (signData && signData.token) {
      finalUrl.searchParams.set('token', signData.token);
      finalUrl.searchParams.set('ex', signData.ex);
    }

    const cdnUrlStr = finalUrl.toString();
    const cookieJar = [];

    // 4. Testar resposta inicial do CDN e capturar cookies
    const https = require('https');
    const http = require('http');

    const rawReq = (u, opts = {}) => new Promise((res, rej) => {
      const p = new URL(u);
      const tr = p.protocol === 'https:' ? https : http;
      let chunks = [];
      let bytesRead = 0;
      const maxBytes = 64 * 1024; // Apenas os primeiros 64KB para verificar desafios HTML/JS

      const req = tr.request({
        hostname: p.hostname,
        port: p.port || (p.protocol === 'https:' ? 443 : 80),
        path: p.pathname + p.search,
        method: opts.method || 'GET',
        rejectUnauthorized: false,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
          ...(opts.headers || {})
        }
      }, response => {
        let isDone = false;
        const finish = () => {
          if (isDone) return;
          isDone = true;
          const buf = Buffer.concat(chunks);
          let text = '';
          try { text = buf.toString('utf8'); } catch (e) {}
          res({ statusCode: response.statusCode, headers: response.headers, text });
        };

        response.on('data', c => {
          if (bytesRead < maxBytes) {
            chunks.push(c);
            bytesRead += c.length;
            if (bytesRead >= maxBytes) {
              try { req.destroy(); } catch (e) {}
              finish();
            }
          }
        });
        response.on('end', finish);
        response.on('close', finish);
      });

      req.on('error', err => {
        if (chunks.length > 0) {
          const buf = Buffer.concat(chunks);
          let text = '';
          try { text = buf.toString('utf8'); } catch (e) {}
          return res({ statusCode: 200, headers: {}, text });
        }
        rej(err);
      });

      if (opts.body) req.write(opts.body);
      req.end();
    });

    const firstGet = await rawReq(cdnUrlStr, { headers: { 'Referer': pageUrl } });
    if (firstGet.headers['set-cookie']) {
      firstGet.headers['set-cookie'].forEach(c => cookieJar.push(c.split(';')[0]));
    }

    // 5. Se veio o desafio js_probe, envia o POST de conclusão
    const nonceMatch = firstGet.text.match(/nonce:\s*"([^"]+)"/);
    const pathMatch = firstGet.text.match(/path:\s*"([^"]+)"/);

    if (nonceMatch && pathMatch) {
      const nonce = nonceMatch[1];
      const chPath = pathMatch[1];

      const challengeRes = await rawReq(`${cleanHost}/_challenge/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': cdnUrlStr,
          'Cookie': cookieJar.join('; ')
        },
        body: JSON.stringify({ nonce, path: chPath })
      });

      if (challengeRes.headers['set-cookie']) {
        challengeRes.headers['set-cookie'].forEach(c => cookieJar.push(c.split(';')[0]));
      }
    }

    return {
      directUrl: cdnUrlStr,
      cookieHeader: cookieJar.join('; '),
      referer: pageUrl
    };
  } catch (err) {
    console.error('[Bunkr] Erro ao resolver URL direta:', err.message);
    throw err;
  }
}

/**
 * Escaneia uma URL do Bunkr (Álbum ou Arquivo Único)
 */
async function scanBunkrLink(urlStr) {
  console.log('[Bunkr] Iniciando escaneamento de:', urlStr);
  const files = [];

  // Verifica se é um álbum (/a/{albumId})
  const albumMatch = urlStr.match(/\/a\/([a-zA-Z0-9]+)/);
  if (albumMatch) {
    const albumId = albumMatch[1];
    const fileIds = [];
    let page = 1;
    let hasMorePages = true;
    let folderName = `Bunkr_Album_${albumId}`;

    while (hasMorePages) {
      const pageUrl = page === 1 ? `https://bunkr.cr/a/${albumId}` : `https://bunkr.cr/a/${albumId}?page=${page}`;
      console.log(`[Bunkr] Escaneando página ${page} do álbum ${albumId}...`);
      const pageHtml = await fetchText(pageUrl);

      if (page === 1) {
        const titleMatch = pageHtml.match(/<h1[^>]*>(.*?)<\/h1>/i) || pageHtml.match(/<title>(.*?)<\/title>/i);
        if (titleMatch && titleMatch[1]) {
          let cleanFolder = titleMatch[1].replace(/ - Bunkr.*/i, '').trim();
          if (cleanFolder && cleanFolder !== 'Bunkr') {
            folderName = cleanFolder;
          }
        }
        folderName = folderName.replace(/[\\/:*?"<>|]/g, '_').trim();
      }

      const fileRegex = /href="(?:\.\.\/|\/)?(?:f|v|i)\/([a-zA-Z0-9]+)"/g;
      let match;
      let newFilesOnPage = 0;
      while ((match = fileRegex.exec(pageHtml)) !== null) {
        const fileId = match[1];
        if (!fileIds.includes(fileId) && fileId !== albumId) {
          fileIds.push(fileId);
          newFilesOnPage++;
        }
      }

      const nextPageRegex = new RegExp(`href="[^"]*\\?page=${page + 1}"`, 'i');
      if (newFilesOnPage === 0 || !nextPageRegex.test(pageHtml)) {
        hasMorePages = false;
      } else {
        page++;
      }
    }

    console.log(`[Bunkr] Encontrados ${fileIds.length} arquivos no total (em ${page} página(s)) no álbum "${folderName}"`);

    // Processa os detalhes dos arquivos em paralelo com concorrência controlada (batch de 5)
    const BATCH_SIZE = 5;
    for (let i = 0; i < fileIds.length; i += BATCH_SIZE) {
      const batch = fileIds.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(fileId => getBunkrFileDetails(fileId, folderName))
      );
      files.push(...batchResults);
    }
    // É um arquivo individual (/f/{id}, /v/{id}, /i/{id}, /d/{id} ou final da URL)
    const fileMatch = urlStr.match(/\/(?:f|v|i|d)\/([a-zA-Z0-9_-]+)/i) || urlStr.match(/bunkr\.[^/]+\/([a-zA-Z0-9_-]+)/i);
    let fileId = fileMatch ? fileMatch[1] : null;
    if (!fileId && urlStr.includes('/')) {
      const parts = urlStr.split(/[/?#]/).filter(Boolean);
      fileId = parts.pop();
    }
    if (fileId && fileId.length >= 3) {
      const singleFile = await getBunkrFileDetails(fileId, 'Bunkr_Downloads');
      if (singleFile) files.push(singleFile);
    }
  }

  return files;
}

module.exports = {
  isBunkrUrl,
  scanBunkrLink,
  resolveBunkrDirectUrl
};
