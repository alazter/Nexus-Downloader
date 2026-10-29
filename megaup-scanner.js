const https = require('https');
const http = require('http');
const { URL } = require('url');

/**
 * Verifica se a URL fornecida pertence ao MegaUp
 */
function isMegaUpUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return false;
  const lower = urlStr.toLowerCase();
  return lower.includes('megaup.net') || lower.includes('download.megaup.net');
}

/**
 * Formata bytes em formato legivel (KB, MB, GB)
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
 * Requisicao HTTP resiliente com suporte a User-Agent de navegador
 */
function fetchHtml(targetUrl) {
  return new Promise((resolve, reject) => {
    try {
      const parsedUrl = new URL(targetUrl);
      const transport = parsedUrl.protocol === 'https:' ? https : http;
      const req = transport.get(targetUrl, {
        rejectUnauthorized: false,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
        },
        timeout: 15000
      }, res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          resolve({ statusCode: res.statusCode, headers: res.headers, body });
        });
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Tempo esgotado ao acessar o MegaUp (Timeout 15s)'));
      });

      req.on('error', err => {
        reject(err);
      });
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Escaneia um link do MegaUp e extrai nome, tamanho e URL direta
 */
async function scanMegaUpLink(urlStr) {
  if (!isMegaUpUrl(urlStr)) {
    throw new Error('URL fornecida nao pertence ao MegaUp.');
  }

  const res = await fetchHtml(urlStr);
  const body = res.body || '';

  const setCookies = res.headers ? (res.headers['set-cookie'] || []) : [];
  const cookieHeader = Array.isArray(setCookies) ? setCookies.map(c => c.split(';')[0]).join('; ') : '';

  // 1. Extrair link direto gerado no countdown do MegaUp
  const megaUpDlMatch = body.match(/href=['"](https?:\/\/download\.megaup\.net\/\?url=[^'"]+)['"]/i) ||
                        body.match(/(https?:\/\/download\.megaup\.net\/\?url=[^\s"'<>]+)/i);

  // 2. Extrair nome e tamanho da tabela de informacoes
  let megaUpName = '';
  let megaUpSize = 0;
  let megaUpSizeFormatted = '';

  const tableMatch = body.match(/<th[^>]*responsiveInfoTable[^>]*>\s*<strong>(.*?)<\/strong>/is) ||
                     body.match(/<strong>\s*(.*?\.(?:rar|zip|7z|bin|iso|exe|mp4|mkv)\s*\([\d\.]+\s*(?:MB|GB|KB)\))\s*<\/strong>/i);
  if (tableMatch && tableMatch[1]) {
    const rawContent = tableMatch[1].trim();
    const sizeMatch = rawContent.match(/\(([\d\.]+)\s*(MB|GB|KB)\)/i);
    if (sizeMatch) {
      const num = parseFloat(sizeMatch[1]);
      const unit = sizeMatch[2].toUpperCase();
      const mult = unit === 'GB' ? 1073741824 : unit === 'MB' ? 1048576 : 1024;
      megaUpSize = Math.round(num * mult);
      megaUpSizeFormatted = `${sizeMatch[1]} ${unit}`;
      megaUpName = rawContent.replace(/\s*\([\d\.]+\s*(?:MB|GB|KB)\)/i, '').trim();
    } else {
      megaUpName = rawContent;
    }
  }

  if (!megaUpName) {
    const megaUpTitleMatch = body.match(/<title>(.*?) - MegaUp<\/title>/i) || body.match(/<title>(.*?)<\/title>/i);
    megaUpName = megaUpTitleMatch ? megaUpTitleMatch[1].replace(/[-_] MegaUp.*/i, '').trim() : 'arquivo.rar';
  }

  const directDlUrl = megaUpDlMatch ? megaUpDlMatch[1].replace(/&amp;/g, '&') : urlStr;

  console.log(`[MegaUp Scanner] Arquivo detectado: "${megaUpName}" (${megaUpSizeFormatted || (megaUpSize ? formatBytes(megaUpSize) : 'Tamanho dinamico')})`);

  return [{
    id: `megaup_${Buffer.from(urlStr).toString('hex').slice(0, 16)}`,
    name: megaUpName,
    size: megaUpSize,
    sizeFormatted: megaUpSizeFormatted || (megaUpSize ? formatBytes(megaUpSize) : 'Calculando...'),
    url: urlStr,
    sourceUrl: urlStr,
    referer: urlStr,
    downloadUrl: directDlUrl,
    directUrl: directDlUrl,
    folderName: 'MegaUp',
    relativePath: megaUpName,
    service: 'megaup',
    isHttpDirect: true,
    headers: {
      'Referer': urlStr,
      'Cookie': cookieHeader,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
    }
  }];
}

/**
 * Resolve a URL direta do MegaUp para download
 */
async function resolveMegaUpDirectUrl(urlStr) {
  const items = await scanMegaUpLink(urlStr);
  if (items && items.length > 0 && items[0].directUrl) {
    return {
      directUrl: items[0].directUrl,
      name: items[0].name,
      size: items[0].size,
      referer: urlStr
    };
  }
  return {
    directUrl: urlStr,
    referer: 'https://megaup.net/'
  };
}

module.exports = {
  isMegaUpUrl,
  scanMegaUpLink,
  resolveMegaUpDirectUrl
};
