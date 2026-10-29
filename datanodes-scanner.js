const https = require('https');
const http = require('http');
const { URL } = require('url');

function isDataNodesUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return false;
  const lower = urlStr.toLowerCase();
  return lower.includes('datanodes.to') || lower.includes('datanodes.');
}

function extractDataNodesCode(urlStr) {
  if (!urlStr) return '';
  const match = urlStr.match(/datanodes\.to\/([a-zA-Z0-9_-]+)/i);
  if (match && match[1] !== 'download' && match[1] !== 'faq' && match[1] !== 'contact' && match[1] !== 'app') {
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
 * Escaneia metadados e resolve link do DataNodes
 */
async function scanDataNodesLink(urlStr) {
  const code = extractDataNodesCode(urlStr);

  // 1. GET inicial seguindo redirecionamento e capturando cookie
  const res1 = await fetch(urlStr, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
    },
    redirect: 'manual'
  });

  const cookie = res1.headers.get('set-cookie') ? res1.headers.get('set-cookie').split(';')[0] : (code ? `file_code=${code}` : '');
  const downloadPageUrl = res1.headers.get('location') || 'https://datanodes.to/download';

  const pageRes = await fetch(downloadPageUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      'Cookie': cookie,
      'Referer': urlStr
    }
  });

  const html = await pageRes.text();

  // Extrair informacoes do arquivo a partir de file-actions, scanCard, header ou meta tags
  const fileActionsMatch = html.match(/<file-actions[^>]+link="([^"]+)"/i);
  let nameFromFa = '';
  if (fileActionsMatch && fileActionsMatch[1]) {
    const rawLink = fileActionsMatch[1];
    const slashParts = rawLink.split('/');
    if (slashParts.length > 0) {
      nameFromFa = decodeURIComponent(slashParts[slashParts.length - 1] || '').trim();
    }
  }

  const scanCardFileMatch = html.match(/data-scan-file="([^"]+)"/i);
  const scanCardSizeMatch = html.match(/data-scan-size="([^"]+)"/i);
  const dlCountdownNameMatch = html.match(/<download-countdown[^>]+name="([^"]+)"/i);
  const headerNameMatch = html.match(/class="[^"]*text-white[^"]*text-xl[^"]*truncate[^"]*"[^>]*>\s*([\s\S]*?)\s*<\/div>/i);
  const idMatch = html.match(/name="id"\s+value="([^"]+)"/i);
  const fnameMatch = html.match(/name="fname"\s+value="([^"]+)"/i);

  const fileCode = idMatch ? idMatch[1] : (code || Date.now().toString());
  
  let candidateName = nameFromFa ||
    (scanCardFileMatch ? scanCardFileMatch[1].trim() : '') ||
    (dlCountdownNameMatch ? dlCountdownNameMatch[1].trim() : '') ||
    (headerNameMatch ? headerNameMatch[1].trim() : '');

  if (!candidateName || /^(download|datanodes|free cloud)/i.test(candidateName)) {
    if (fnameMatch && fnameMatch[1] && !/^(download|datanodes)/i.test(fnameMatch[1])) {
      candidateName = fnameMatch[1].trim();
    }
  }

  let fileName = candidateName || `datanodes_${fileCode}`;
  
  // Limpa entidades HTML no nome do arquivo (ex: &#40; -> (, &#41; -> ))
  fileName = fileName
    .replace(/&#40;/g, '(')
    .replace(/&#41;/g, ')')
    .replace(/&amp;/g, '&')
    .replace(/[\\/:*?"<>|]/g, '_');

  const sizeStr = scanCardSizeMatch ? scanCardSizeMatch[1].trim() : '';
  const fileSize = sizeStr ? parseSizeToBytes(sizeStr) : 0;

  return [{
    id: `datanodes_${fileCode}`,
    fileId: fileCode,
    numericId: fileCode,
    name: fileName,
    size: fileSize,
    sizeFormatted: fileSize ? formatBytes(fileSize) : (sizeStr || 'Calculando...'),
    downloadUrl: urlStr,
    directUrl: urlStr,
    sourceUrl: urlStr,
    originalUrl: urlStr,
    folderName: null,
    relativePath: fileName,
    service: 'datanodes',
    isHttpDirect: true,
    isAvulso: true,
    isSingleFile: true,
    headers: {
      'Referer': 'https://datanodes.to/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
    }
  }];
}

module.exports = {
  isDataNodesUrl,
  extractDataNodesCode,
  scanDataNodesLink
};
