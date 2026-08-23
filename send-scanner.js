const https = require('https');
const http = require('http');

/**
 * Verifica se a URL é do Send (send.now / send.cm / sendit.cloud / userscloud / tusfiles)
 */
function isSendUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return false;
  const str = urlStr.toLowerCase();
  return (
    str.includes('send.now') ||
    str.includes('send.cm') ||
    str.includes('sendit.cloud') ||
    str.includes('userscloud.com') ||
    str.includes('tusfiles.com') ||
    str.includes('tusfiles.net') ||
    str.includes('usersfiles.com')
  );
}

/**
 * Utilitário HTTP GET resiliente com suporte a redirecionamentos e SSL bypass
 */
function fetchWithRedirects(urlStr, options = {}, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) {
      return reject(new Error('Muitos redirecionamentos ao acessar Send.'));
    }

    let u;
    try {
      u = new URL(urlStr);
    } catch (e) {
      return reject(new Error('URL do Send malformada: ' + urlStr));
    }

    const transport = u.protocol === 'https:' ? https : http;

    const req = transport.get(urlStr, {
      rejectUnauthorized: false,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        'Accept': options.json ? 'application/json, text/plain, */*' : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
        ...(options.headers || {})
      },
      timeout: 20000
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (redirectUrl.startsWith('/')) {
          redirectUrl = u.origin + redirectUrl;
        }
        return resolve(fetchWithRedirects(redirectUrl, options, maxRedirects - 1));
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`Servidor Send retornou HTTP ${res.statusCode}`));
      }

      let d = '';
      res.on('data', chunk => d += chunk);
      res.on('end', () => {
        if (options.json) {
          try {
            resolve(JSON.parse(d));
          } catch (e) {
            reject(new Error('Resposta inválida (não JSON) do Send: ' + d.slice(0, 100)));
          }
        } else {
          resolve(d);
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Tempo de conexão esgotado ao acessar o Send (Timeout 20s).'));
    });

    req.on('error', (err) => {
      reject(new Error('Falha de rede com Send: ' + err.message));
    });
  });
}

function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function parseSizeBytes(sizeStr) {
  if (!sizeStr) return 0;
  const s = sizeStr.trim();
  const match = s.match(/([\d.]+)\s*(GB|MB|KB|B)/i);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  if (unit === 'GB') return Math.round(num * 1024 * 1024 * 1024);
  if (unit === 'MB') return Math.round(num * 1024 * 1024);
  if (unit === 'KB') return Math.round(num * 1024);
  return Math.round(num);
}

function sanitizeFolderName(name) {
  if (!name) return 'Send_Downloads';
  return name.replace(/[\\/:*?"<>|]/g, '_').trim();
}

/**
 * Escaneia uma pasta do Send.now / Send.cm
 */
async function scanSendFolder(folderUrl) {
  console.log('[Send Scanner] Escaneando pasta Send:', folderUrl);
  const html = await fetchWithRedirects(folderUrl);

  // Determina o nome da pasta
  let folderName = 'Send_Downloads';
  const urlParts = folderUrl.split('?')[0].split('/').filter(Boolean);
  const lastPart = urlParts[urlParts.length - 1];
  if (lastPart && lastPart.length > 0) {
    const cleanName = lastPart.replace(/^0+/, '');
    if (cleanName.length > 0) {
      folderName = sanitizeFolderName(cleanName);
    }
  }

  const trMatches = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  const files = [];

  trMatches.forEach(tr => {
    const linkMatch = tr.match(/href="(https?:\/\/[^"]+)"/i) || tr.match(/href="([^"]+)"/i);
    if (!linkMatch) return;

    let fullUrl = linkMatch[1];
    if (fullUrl.startsWith('/')) {
      const u = new URL(folderUrl);
      fullUrl = u.origin + fullUrl;
    }

    const fileCode = fullUrl.split('?')[0].split('/').pop();
    if (!fileCode || fileCode === 's' || fileCode === 'upload' || fileCode === 'login' || fileCode === 'about' || fileCode === 'help' || fileCode.startsWith('?')) return;

    // Extrai o nome do arquivo da tag <a> dentro da linha
    let fileName = `Arquivo_${fileCode}`;
    const nameMatch = tr.match(/<a[^>]*class="[^"]*tx-dark[^"]*"[^>]*>([\s\S]*?)<\/a>/i) ||
                      tr.match(/<a[^>]*href="[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
    if (nameMatch && nameMatch[1]) {
      fileName = nameMatch[1].replace(/<[^>]+>/g, '').trim();
    }

    // Extrai o tamanho da tag <span class="label ...">
    let sizeStr = '';
    const sizeMatch = tr.match(/<span[^>]*class="[^"]*label[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
    if (sizeMatch && sizeMatch[1]) {
      sizeStr = sizeMatch[1].replace(/<[^>]+>/g, '').trim();
    }

    const sizeBytes = parseSizeBytes(sizeStr);

    files.push({
      id: 'send_' + fileCode,
      fileId: 'send_' + fileCode,
      numericId: fileCode,
      name: fileName,
      size: sizeBytes,
      sizeFormatted: formatBytes(sizeBytes),
      relativePath: `${folderName}/${fileName}`,
      folderName: folderName,
      service: 'Send',
      isHttpDirect: true,
      url: fullUrl,
      downloadUrl: fullUrl,
      directUrl: fullUrl,
      sendUrl: fullUrl,
      sourceUrl: fullUrl,
      originalUrl: fullUrl
    });
  });

  return files;
}

/**
 * Escaneia um arquivo individual do Send.now / Send.cm
 */
async function scanSendFile(fileUrl) {
  console.log('[Send Scanner] Escaneando arquivo Send:', fileUrl);
  const cleanUrl = fileUrl.trim();
  const fileCode = cleanUrl.split('?')[0].split('/').pop() || ('file_' + Date.now());

  let fileName = `Arquivo_${fileCode}`;
  let sizeBytes = 0;

  try {
    const html = await fetchWithRedirects(cleanUrl);
    const titleMatch = html.match(/<h\d[^>]*>([^<]+)<\/h\d>/i) || html.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      fileName = titleMatch[1].replace(/-\s*Send\.(?:cm|now)/i, '').trim();
    }
  } catch (e) {
    console.warn('[Send Scanner] Não foi possível obter HTML da página individual, usando padrão:', e.message);
  }

  return [{
    id: 'send_' + fileCode,
    fileId: 'send_' + fileCode,
    numericId: fileCode,
    name: fileName,
    size: sizeBytes,
    sizeFormatted: formatBytes(sizeBytes),
    relativePath: `Send_Downloads/${fileName}`,
    folderName: 'Send_Downloads',
    service: 'Send',
    isHttpDirect: true,
    url: cleanUrl,
    downloadUrl: cleanUrl,
    directUrl: cleanUrl,
    sendUrl: cleanUrl,
    sourceUrl: cleanUrl,
    originalUrl: cleanUrl
  }];
}

/**
 * Resolve a URL direta de um arquivo do Send (com suporte a Torbox WebDL e fallback direto)
 */
async function resolveSendDirectUrl(fileCode, fileUrl, torboxApiKey, useTorbox = true, onStatusUpdate = null) {
  console.log(`[Send Resolver] Resolvendo link do Send: code="${fileCode}" URL="${fileUrl}" (useTorbox=${useTorbox})...`);
  const targetUrl = fileUrl || `https://send.now/${fileCode}`;

  if (useTorbox && torboxApiKey) {
    try {
      console.log(`[Send Resolver] Tentando resolução via Torbox WebDL API...`);
      const torboxScanner = require('./torbox-scanner');
      const tbRes = await torboxScanner.scanTorboxLink(targetUrl, torboxApiKey);
      if (tbRes && tbRes.length > 0) {
        const item = tbRes[0];
        const tbType = item.torboxType || 'webdl';
        const tbId = item.torboxId || (item.id ? (item.id.match(/\d+/g) || [0])[0] : 0);
        const tbFileId = item.torboxFileId !== undefined ? item.torboxFileId : 0;

        console.log(`[Send Resolver] Invocando resolveTorboxDirectUrl para ${tbType} ID ${tbId}...`);
        const tbInfo = await torboxScanner.resolveTorboxDirectUrl(
          item.id,
          torboxApiKey,
          tbType,
          tbId,
          tbFileId,
          onStatusUpdate
        );
        return {
          directUrl: tbInfo.directUrl,
          referer: 'https://send.now/',
          isTorbox: true
        };
      }
    } catch (e) {
      console.warn('[Send Resolver] Resolução Torbox WebDL falhou:', e.message);
    }
  }

  return {
    directUrl: targetUrl,
    referer: 'https://send.now/',
    isTorbox: false
  };
}

/**
 * Ponto de entrada do Send Scanner
 */
async function scanSendLink(urlStr) {
  console.log('[Send Scanner] Processando URL:', urlStr);
  const cleanUrl = urlStr.trim();
  if (cleanUrl.includes('/s/')) {
    return await scanSendFolder(cleanUrl);
  } else {
    return await scanSendFile(cleanUrl);
  }
}

module.exports = {
  isSendUrl,
  scanSendLink,
  scanSendFolder,
  scanSendFile,
  resolveSendDirectUrl
};
