const https = require('https');
const http = require('http');
const { URL } = require('url');

function isFileKeeperUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return false;
  const lower = urlStr.toLowerCase();
  return lower.includes('filekeeper.net') || lower.includes('filekeeper.');
}

function extractFileKeeperCode(urlStr) {
  if (!urlStr) return '';
  const match = urlStr.match(/filekeeper\.net\/([a-zA-Z0-9_-]+)/i);
  if (match && match[1] !== 'download' && match[1] !== 'pages' && match[1] !== 'premium') {
    return match[1];
  }
  return '';
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

/**
 * Resolve o link direto do FileKeeper via POST na rota /download
 */
async function resolveFileKeeperDirectUrl(urlStr) {
  const code = extractFileKeeperCode(urlStr);
  
  // 1. GET inicial para obter cookie e dados da pagina
  const res1 = await fetch(urlStr, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
    },
    redirect: 'manual'
  });

  const cookie = res1.headers.get('set-cookie') ? res1.headers.get('set-cookie').split(';')[0] : (code ? `file_code=${code}` : '');
  const downloadPageUrl = res1.headers.get('location') || 'https://filekeeper.net/download';

  const pageRes = await fetch(downloadPageUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      'Cookie': cookie,
      'Referer': urlStr
    }
  });

  const html = await pageRes.text();
  
  const extractedCode = html.match(/data-code="([^"]+)"/i)?.[1] || code;
  const rand = html.match(/data-rand="([^"]+)"/i)?.[1] || '';
  const referer = html.match(/data-referer="([^"]+)"/i)?.[1] || urlStr;
  const method = html.match(/data-method="([^"]+)"/i)?.[1] || 'Free Download';
  
  const rawFileName = html.match(/id="dl-filename"[^>]*>([\s\S]*?)<\/span>/i)?.[1]?.trim() 
    || html.match(/<title>Download\s+([^<]+)<\/title>/i)?.[1]?.trim()
    || (code ? `filekeeper_${code}` : 'filekeeper_file');

  const fileName = rawFileName.replace(/[\\/:*?"<>|]/g, '_');

  const sizeTextMatch = html.match(/(\d+(?:\.\d+)?\s*(?:GB|MB|KB|Bytes|B))/i);
  const fileSize = sizeTextMatch ? parseSizeToBytes(sizeTextMatch[1]) : 0;

  // 2. Submeter POST para obter o redirecionamento 302 com o link direto
  const body = new URLSearchParams({
    op: 'download2',
    id: extractedCode,
    rand: rand,
    referer: referer,
    method_free: method,
    down_direct: '1'
  });

  const postRes = await fetch('https://filekeeper.net/download', {
    method: 'POST',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookie,
      'Referer': 'https://filekeeper.net/download',
      'Origin': 'https://filekeeper.net'
    },
    body: body.toString(),
    redirect: 'manual'
  });

  const directUrl = postRes.headers.get('location');
  if (!directUrl) {
    throw new Error('Nao foi possivel obter a URL de download direto do FileKeeper.');
  }

  // Probe Range 0-0 para obter tamanho autoritativo da CDN
  let authorativeSize = fileSize;
  let authoritativeFileName = fileName;

  try {
    const probeRes = await fetch(directUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        'Range': 'bytes=0-0',
        'Referer': 'https://filekeeper.net/'
      }
    });

    const contentRange = probeRes.headers.get('content-range');
    if (contentRange) {
      const totalMatch = contentRange.match(/\/(\d+)/);
      if (totalMatch) {
        authorativeSize = parseInt(totalMatch[1], 10);
      }
    } else {
      const cl = probeRes.headers.get('content-length');
      if (cl && parseInt(cl, 10) > 1) {
        authorativeSize = parseInt(cl, 10);
      }
    }

    const disp = probeRes.headers.get('content-disposition');
    if (disp) {
      const fnMatch = disp.match(/filename\*?=(?:UTF-8''|")?([^";\r\n]+)"?/i);
      if (fnMatch && fnMatch[1]) {
        authoritativeFileName = decodeURIComponent(fnMatch[1].replace(/"/g, '')).trim();
      }
    }
  } catch (probeErr) {
    console.warn('[FileKeeper Scanner] Range probe falhou (usando valores da pagina):', probeErr.message);
  }

  return {
    directUrl,
    fileName: authoritativeFileName,
    fileSize: authorativeSize,
    code: extractedCode
  };
}

/**
 * Escaneia link do FileKeeper e retorna estrutura padrao para a fila
 */
async function scanFileKeeperLink(urlStr) {
  const result = await resolveFileKeeperDirectUrl(urlStr);
  const id = result.code || Date.now().toString();

  return [{
    id: `filekeeper_${id}`,
    fileId: id,
    numericId: id,
    name: result.fileName,
    size: result.fileSize,
    sizeFormatted: result.fileSize ? formatBytes(result.fileSize) : 'Calculando...',
    downloadUrl: result.directUrl,
    directUrl: result.directUrl,
    sourceUrl: urlStr,
    originalUrl: urlStr,
    folderName: null,
    relativePath: result.fileName,
    service: 'filekeeper',
    isHttpDirect: true,
    isAvulso: true,
    isSingleFile: true,
    headers: {
      'Referer': 'https://filekeeper.net/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
    }
  }];
}

module.exports = {
  isFileKeeperUrl,
  extractFileKeeperCode,
  scanFileKeeperLink,
  resolveFileKeeperDirectUrl
};
