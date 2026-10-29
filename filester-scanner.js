const https = require('https');
const http = require('http');
const { URL } = require('url');

function isFilesterUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return false;
  const lower = urlStr.toLowerCase();
  return lower.includes('filester.si') || lower.includes('filester.sh') || lower.includes('filester.me') || lower.includes('filester.');
}

function extractFilesterSlug(urlStr) {
  if (!urlStr) return '';
  const match = urlStr.match(/\/(?:d|v|download)\/([a-zA-Z0-9_-]+)/i) || urlStr.match(/\/([a-zA-Z0-9_-]+)$/i);
  return match ? match[1] : '';
}

function parseSizeToBytes(sizeStr) {
  if (!sizeStr) return 0;
  const match = sizeStr.match(/([\d.]+)\s*(GB|MB|KB|B)/i);
  if (!match) return 0;
  const val = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  if (unit === 'GB') return Math.round(val * 1024 * 1024 * 1024);
  if (unit === 'MB') return Math.round(val * 1024 * 1024);
  if (unit === 'KB') return Math.round(val * 1024);
  return Math.round(val);
}

function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

async function requestFilesterToken(slug, domain = 'filester.si') {
  const cleanDomain = domain.replace(/^www\./, '');
  const candidateDomains = [cleanDomain, 'filester.si', 'filester.me', 'filester.sh'].filter((v, i, a) => a.indexOf(v) === i);

  let lastError = null;
  for (const dom of candidateDomains) {
    try {
      const result = await new Promise((resolve, reject) => {
        const postData = JSON.stringify({ file_slug: slug });
        const req = https.request(`https://${dom}/v2/api/public/download`, {
          method: 'POST',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
            'Content-Type': 'application/json',
            'Referer': `https://${dom}/d/${slug}`,
            'Origin': `https://${dom}`,
            'Content-Length': Buffer.byteLength(postData)
          },
          timeout: 12000
        }, res => {
          let data = '';
          res.on('data', c => data += c);
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              if (res.statusCode === 200 && json && json.success) {
                resolve(json);
              } else {
                reject(new Error(json.error || json.message || `Erro na API do Filester (${dom} HTTP ${res.statusCode})`));
              }
            } catch (e) {
              reject(new Error(`Resposta invalida do Filester (${dom}): ${data.slice(0, 100)}`));
            }
          });
        });

        req.on('timeout', () => {
          req.destroy();
          reject(new Error(`Tempo esgotado na API do Filester (${dom})`));
        });

        req.on('error', err => reject(err));
        req.write(postData);
        req.end();
      });
      return result;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('Nao foi possivel obter token em nenhum dominio do Filester');
}

async function fetchHtml(urlStr) {
  return new Promise((resolve, reject) => {
    https.get(urlStr, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
      }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

/**
 * Escaneia uma pasta ou album do Filester (/f/slug)
 */
async function scanFilesterFolder(urlStr) {
  const u = new URL(urlStr);
  const domain = u.hostname || 'filester.sh';
  const folderSlugMatch = urlStr.match(/\/f\/([a-zA-Z0-9_-]+)/i);
  if (!folderSlugMatch) throw new Error('Slug da pasta do Filester nao encontrado.');
  const folderSlug = folderSlugMatch[1];

  let page = 1;
  let allFiles = [];
  let folderName = 'Filester_Album';

  while (page <= 25) {
    const pageUrl = `https://${domain}/f/${folderSlug}?page=${page}`;
    const html = await fetchHtml(pageUrl);
    
    if (page === 1) {
      const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i) 
        || html.match(/<title>([^<|]+)/i);
      if (titleMatch) {
        folderName = titleMatch[1].trim().replace(/[\\/:*?"<>|]/g, '_');
      }
    }

    const cardRegex = /onclick="window\.location\.href='\/d\/([a-zA-Z0-9_-]+)'"([^>]*>[\s\S]*?)(?=(?:onclick="window\.location\.href='\/d\/|<\/body>))/gi;
    const matches = [...html.matchAll(cardRegex)];

    if (matches.length === 0) {
      break;
    }

    let foundOnThisPage = 0;
    for (const m of matches) {
      const slug = m[1];
      const cardHtml = m[2];
      const nameMatch = cardHtml.match(/class="[^"]*file-name[^"]*"[^>]*>([\s\S]*?)<\//i)
        || cardHtml.match(/<p[^>]*font-medium[^>]*>([\s\S]*?)<\/p>/i);
      const sizeMatch = cardHtml.match(/(\d+(?:\.\d+)?\s*(?:GB|MB|KB|B))/i);

      const name = nameMatch ? nameMatch[1].trim().replace(/[\\/:*?"<>|]/g, '_') : `filester_${slug}`;
      const sizeBytes = sizeMatch ? parseSizeToBytes(sizeMatch[1]) : 0;

      if (!allFiles.some(f => f.fileId === slug)) {
        allFiles.push({
          id: `filester_${slug}`,
          fileId: slug,
          numericId: slug,
          name: name,
          size: sizeBytes,
          sizeFormatted: sizeBytes ? formatBytes(sizeBytes) : 'Calculando...',
          downloadUrl: `https://${domain}/d/${slug}`,
          sourceUrl: `https://${domain}/d/${slug}`,
          originalUrl: `https://${domain}/d/${slug}`,
          folderName: folderName,
          relativePath: `${folderName}/${name}`,
          service: 'filester',
          isHttpDirect: true,
          isFolder: false,
          headers: {
            'Referer': `https://${domain}/`,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
          }
        });
        foundOnThisPage++;
      }
    }

    if (foundOnThisPage === 0 || !html.includes(`page=${page + 1}`)) {
      break;
    }
    page++;
  }

  console.log(`[Filester Folder Scanner] Total de arquivos encontrados em '${folderName}': ${allFiles.length}`);
  return allFiles;
}

/**
 * Escaneia um link do Filester (arquivo ou pasta) e retorna a lista de itens
 */
async function scanFilesterLink(urlStr) {
  if (urlStr.includes('/f/')) {
    return await scanFilesterFolder(urlStr);
  }

  const slug = extractFilesterSlug(urlStr);
  if (!slug) {
    throw new Error('Identificador de arquivo do Filester nao encontrado na URL.');
  }

  let domain = 'filester.si';
  try {
    const u = new URL(urlStr);
    if (u.hostname && u.hostname.includes('filester')) {
      domain = u.hostname;
    }
  } catch (e) {}

  console.log(`[Filester Scanner] Obtendo token CDN para slug: ${slug} (${domain})...`);
  const tokenData = await requestFilesterToken(slug, domain);

  const server = tokenData.server || 'https://fsc3.cdn.cr';
  const file = tokenData.file;
  const token = tokenData.token;
  const rawFileName = tokenData.name || `filester_${slug}.mp4`;
  const fileName = rawFileName.replace(/[\\/:*?"<>|]/g, '_');

  const directUrl = `${server}/v2/${file}?token=${encodeURIComponent(token)}&download=true&n=${encodeURIComponent(rawFileName)}`;

  let fileSize = 0;
  try {
    const headRes = await new Promise((resolve) => {
      const u = new URL(directUrl);
      const transport = u.protocol === 'https:' ? https : http;
      const req = transport.request(directUrl, {
        method: 'HEAD',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
          'Referer': `https://${domain}/`
        },
        timeout: 5000
      }, resolve);
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.end();
    });

    if (headRes && headRes.headers) {
      fileSize = parseInt(headRes.headers['content-length'] || '0', 10);
    }
  } catch (e) {}

  console.log(`[Filester Scanner] Sucesso! Arquivo: ${fileName} (${fileSize ? formatBytes(fileSize) : 'Tamanho dinamico'})`);

  return [{
    id: `filester_${slug}`,
    fileId: slug,
    numericId: slug,
    name: fileName,
    size: fileSize,
    sizeFormatted: fileSize ? formatBytes(fileSize) : 'Calculando...',
    downloadUrl: directUrl,
    directUrl: directUrl,
    sourceUrl: urlStr,
    originalUrl: urlStr,
    folderName: null,
    relativePath: fileName,
    service: 'filester',
    isHttpDirect: true,
    isAvulso: true,
    isSingleFile: true,
    headers: {
      'Referer': `https://${domain}/`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
    }
  }];
}

/**
 * Resolve URL direta para download em alta velocidade do Filester
 */
async function resolveFilesterDirectUrl(urlStr) {
  const items = await scanFilesterLink(urlStr);
  if (items && items.length > 0) {
    let domain = 'filester.si';
    try {
      const u = new URL(urlStr);
      if (u.hostname && u.hostname.includes('filester')) domain = u.hostname;
    } catch (e) {}

    return {
      directUrl: items[0].directUrl,
      name: items[0].name,
      size: items[0].size,
      referer: `https://${domain}/`
    };
  }
  throw new Error('Nao foi possivel resolver a URL direta do Filester.');
}

module.exports = {
  isFilesterUrl,
  extractFilesterSlug,
  scanFilesterFolder,
  scanFilesterLink,
  resolveFilesterDirectUrl
};
