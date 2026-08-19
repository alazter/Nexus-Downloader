const https = require('https');
const http = require('http');

/**
 * Lista de domínios reconhecidos do TeraBox
 */
function isTeraBoxUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return false;
  const lower = urlStr.toLowerCase();
  return lower.includes('terabox.com') ||
         lower.includes('terabox.app') ||
         lower.includes('1024tera.com') ||
         lower.includes('freeterabox.com') ||
         lower.includes('terabox.link') ||
         lower.includes('teraboxshare.com') ||
         lower.includes('mirrobox.com') ||
         lower.includes('nebox.com') ||
         lower.includes('4funbox.com') ||
         lower.includes('momobox.com');
}

/**
 * Utilitário HTTP GET resiliente para chamadas JSON
 */
function fetchTeraBoxJson(urlStr, cookieStr = '') {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(urlStr);
    } catch (e) {
      return reject(new Error('URL malformada: ' + urlStr));
    }

    const transport = u.protocol === 'https:' ? https : http;

    const req = transport.get(urlStr, {
      rejectUnauthorized: false,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9,pt-BR;q=0.8',
        ...(cookieStr ? { 'Cookie': cookieStr } : {}),
        'Referer': 'https://www.terabox.com/'
      },
      timeout: 20000
    }, res => {
      let d = '';
      res.on('data', chunk => d += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(d);
          resolve(parsed);
        } catch (e) {
          reject(new Error('Resposta inválida (não JSON) do TeraBox: ' + d.slice(0, 100)));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Tempo esgotado na API do TeraBox (Timeout 20s).'));
    });

    req.on('error', (err) => {
      reject(new Error('Falha de conexão com a API TeraBox: ' + err.message));
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

function sanitizeFolderName(name) {
  if (!name) return 'TeraBox_Downloads';
  return name.replace(/[\\/:*?"<>|]/g, '_').trim();
}

/**
 * Extrai o surl da URL do TeraBox
 */
function extractSurl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return '';
  const u = urlStr.trim();
  
  let surl = '';
  if (u.includes('surl=')) {
    const match = u.match(/surl=([a-zA-Z0-9_-]+)/i);
    if (match) surl = match[1];
  } else if (u.includes('/s/')) {
    const match = u.match(/\/s\/(1[a-zA-Z0-9_-]+|[a-zA-Z0-9_-]+)/i);
    if (match) surl = match[1];
  } else if (u.includes('/single/')) {
    const match = u.match(/\/single\/([a-zA-Z0-9_-]+)/i);
    if (match) surl = match[1];
  }

  if (surl.startsWith('1')) {
    surl = surl.substring(1);
  }

  return surl;
}

let teraBoxProxyWindow = null;
let isProxyWindowReady = false;

async function getOrCreateProxyWindow() {
  try {
    const { BrowserWindow } = require('electron');
    if (teraBoxProxyWindow && !teraBoxProxyWindow.isDestroyed()) {
      return teraBoxProxyWindow;
    }

    teraBoxProxyWindow = new BrowserWindow({
      width: 1000,
      height: 700,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: false
      }
    });

    isProxyWindowReady = false;
    await teraBoxProxyWindow.loadURL('https://teraboxdl.site/');
    await new Promise(r => setTimeout(r, 3000));
    isProxyWindowReady = true;
    return teraBoxProxyWindow;
  } catch (e) {
    console.warn('[TeraBox Proxy Electron] Erro ao criar janela proxy:', e.message);
    return null;
  }
}

/**
 * Consulta a API de proxy de alta velocidade do TeraBox via Electron BrowserWindow (TeraboxDL Proxy Engine)
 */
async function fetchTeraBoxProxyApiElectron(surl, dirPath = '', shareId = null, uk = null) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const win = await getOrCreateProxyWindow();
      if (!win) continue;

      const targetUrl = `https://www.terabox.com/sharing/link?surl=${surl}`;

      const scriptCode = `
        (async () => {
          try {
            const payload = { url: ${JSON.stringify(targetUrl)} };
            ${dirPath ? `payload.dir = ${JSON.stringify(dirPath)};` : ''}
            ${shareId ? `payload.shareid = ${JSON.stringify(shareId)};` : ''}
            ${uk ? `payload.uk = ${JSON.stringify(uk)};` : ''}

            const res = await fetch('/api/proxy', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });
            return await res.json();
          } catch (e) {
            return { error: e.message };
          }
        })();
      `;

      const data = await win.webContents.executeJavaScript(scriptCode);
      if (data && data.errno === 0 && data.list && Array.isArray(data.list)) {
        return data;
      }
      console.warn(`[TeraBox Proxy Electron] Tentativa ${attempt} falhou. Tentando novamente em 1.5s...`);
      await new Promise(r => setTimeout(r, 1500));
    } catch (e) {
      console.warn(`[TeraBox Proxy Electron] Erro na tentativa ${attempt}:`, e.message);
      await new Promise(r => setTimeout(r, 1500));
    }
  }
  return null;
}

/**
 * Consulta a API de proxy de alta velocidade do TeraBox em ambiente Node (TeraboxDL Proxy Engine)
 */
function fetchTeraBoxProxyApiNode(surl, dirPath = '', shareId = null, uk = null) {
  return new Promise((resolve) => {
    try {
      const targetUrl = `https://www.terabox.com/sharing/link?surl=${surl}`;
      const payload = { url: targetUrl };
      if (dirPath) payload.dir = dirPath;
      if (shareId) payload.shareid = shareId;
      if (uk) payload.uk = uk;

      const bodyStr = JSON.stringify(payload);

      const req = https.request('https://teraboxdl.site/api/proxy', {
        method: 'POST',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyStr),
          'Referer': 'https://teraboxdl.site/'
        },
        timeout: 15000
      }, res => {
        let d = '';
        res.on('data', chunk => d += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(d);
            if (parsed && parsed.errno === 0 && parsed.list && Array.isArray(parsed.list)) {
              return resolve(parsed);
            }
            resolve(null);
          } catch (e) {
            resolve(null);
          }
        });
      });

      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.write(bodyStr);
      req.end();
    } catch (e) {
      resolve(null);
    }
  });
}

/**
 * Realiza a consulta de diretório (TeraboxDL Gateway com Fallback Público de Leitura)
 */
async function queryTeraBoxDirectory(surl, dirPath, shareId, uk) {
  // 1. Tenta a API de Proxy via Electron (Chromium) se disponível
  const proxyElectronData = await fetchTeraBoxProxyApiElectron(surl, dirPath, shareId, uk);
  if (proxyElectronData && proxyElectronData.errno === 0 && proxyElectronData.list && Array.isArray(proxyElectronData.list)) {
    console.log(`[TeraBox Scanner] Sucesso via TeraboxDL Proxy Electron para diretório: "${dirPath || '/'}"`);
    return proxyElectronData;
  }

  // 2. Tenta a API de Proxy via Node
  const proxyNodeData = await fetchTeraBoxProxyApiNode(surl, dirPath, shareId, uk);
  if (proxyNodeData && proxyNodeData.errno === 0 && proxyNodeData.list && Array.isArray(proxyNodeData.list)) {
    console.log(`[TeraBox Scanner] Sucesso via TeraboxDL Proxy Node para diretório: "${dirPath || '/'}"`);
    return proxyNodeData;
  }

  // 3. Fallback infalível para a API de leitura de diretórios do TeraBox (obtém a estrutura completa de pastas/subpastas)
  console.warn(`[TeraBox Scanner] TeraboxDL Proxy temporariamente indisponível para leitura. Usando API direta de estrutura de diretório para "${dirPath || '/'}"...`);
  const domains = ['www.1024tera.com', 'www.terabox.com', 'www.terabox.app'];
  
  for (const domain of domains) {
    const urlsToTry = [];
    if (!dirPath) {
      urlsToTry.push(`https://${domain}/share/list?app_id=250528&web=1&channel=dubox&clienttype=0&shorturl=${surl}&root=1`);
      urlsToTry.push(`https://${domain}/share/list?app_id=250528&shorturl=${surl}&root=1`);
    } else {
      if (shareId && uk) {
        urlsToTry.push(`https://${domain}/share/list?app_id=250528&web=1&channel=dubox&clienttype=0&shorturl=${surl}&dir=${encodeURIComponent(dirPath)}&shareid=${shareId}&uk=${uk}&root=0`);
        urlsToTry.push(`https://${domain}/share/list?app_id=250528&shorturl=${surl}&dir=${encodeURIComponent(dirPath)}&shareid=${shareId}&uk=${uk}&root=0`);
      }
      urlsToTry.push(`https://${domain}/share/list?app_id=250528&web=1&channel=dubox&clienttype=0&shorturl=${surl}&dir=${encodeURIComponent(dirPath)}&root=0`);
      urlsToTry.push(`https://${domain}/share/list?app_id=250528&shorturl=${surl}&dir=${encodeURIComponent(dirPath)}&root=0`);
    }

    for (const url of urlsToTry) {
      try {
        const data = await fetchTeraBoxJson(url);
        if (data && data.errno === 0 && data.list && Array.isArray(data.list)) {
          return data;
        }
      } catch (e) {}
    }
  }

  return null;
}

/**
 * Função principal de escaneamento de links do TeraBox (Infalível com BFS)
 */
async function scanTeraBoxLink(urlStr) {
  console.log('[TeraBox Scanner] Iniciando escaneamento para:', urlStr);

  const surl = extractSurl(urlStr);
  if (!surl) {
    throw new Error('Não foi possível identificar a chave do link do TeraBox (surl).');
  }

  const dirQueue = [{ dirPath: '', shareId: null, uk: null, parentFolderName: 'TeraBox_Downloads' }];
  const files = [];

  while (dirQueue.length > 0) {
    const current = dirQueue.shift();

    const data = await queryTeraBoxDirectory(surl, current.dirPath, current.shareId, current.uk);

    if (data && data.errno === 0 && data.list && Array.isArray(data.list)) {
      const shareId = data.share_id || current.shareId;
      const uk = data.uk || current.uk;

      let currentFolderName = current.parentFolderName;
      if (!current.dirPath && data.title) {
        const cleanTitle = data.title.replace(/^\//, '').trim();
        if (cleanTitle) {
          currentFolderName = sanitizeFolderName(cleanTitle);
        }
      }

      const hasFiles = data.list.some(i => i.isdir !== 1 && i.isdir !== '1');
      const folderTotalSize = parseInt(data.folder_total_size || '0', 10) 
        || data.list.reduce((acc, i) => acc + (i.isdir !== 1 && i.isdir !== '1' ? (parseInt(i.size, 10) || 0) : 0), 0);

      if ((hasFiles || data.folder_download_url) && folderTotalSize > 0) {
        const rawName = current.dirPath ? current.dirPath.split('/').pop() : (data.title || currentFolderName);
        const folderNameClean = sanitizeFolderName(rawName);
        const folderZipName = `${folderNameClean} (Download All - Pacote Completo).zip`;

        files.push({
          id: 'terabox_folder_' + (shareId || 'folder') + '_' + (current.dirPath.replace(/[^a-zA-Z0-9]/g, '_') || 'root'),
          fileId: 'tb_folder_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
          numericId: shareId || 'folder',
          name: folderZipName,
          size: folderTotalSize,
          sizeFormatted: formatBytes(folderTotalSize),
          relativePath: current.dirPath ? `${currentFolderName}/${folderNameClean}/${folderZipName}` : `${folderNameClean}/${folderZipName}`,
          folderName: currentFolderName,
          isHttpDirect: true,
          teraboxUrl: `https://www.terabox.com/sharing/link?surl=${surl}`,
          teraboxDlink: data.folder_download_url || '',
          teraboxShareId: shareId,
          teraboxUk: uk,
          teraboxPath: current.dirPath,
          isFolderZip: true
        });
      }

      for (const item of data.list) {
        const isDir = item.isdir === 1 || item.isdir === '1';
        if (isDir) {
          dirQueue.push({
            dirPath: item.path,
            shareId: shareId,
            uk: uk,
            parentFolderName: currentFolderName
          });
        }
      }
    } else {
      console.warn(`[TeraBox Scanner] Aviso: pasta "${current.dirPath || '/'}" sem retorno ou vazia.`);
    }
  }

  if (files.length === 0) {
    throw new Error('Nenhum arquivo encontrado no link do TeraBox.');
  }

  console.log(`[TeraBox Scanner] Sucesso! ${files.length} arquivo(s) encontrado(s).`);
  return files;
}

/**
 * Resolve OBRIGATORIAMENTE o link de download via TeraboxDL Gateway
 */
async function resolveTeraBoxDirectUrl(fsId, teraboxUrl, dlink, teraboxPath, shareId, uk, thumbs) {
  console.log('[TeraBox Resolver] Resolvendo link direto FRESCO via TeraboxDL Gateway para fs_id:', fsId);

  const surl = extractSurl(teraboxUrl || '');

  let parentDirPath = '';
  if (teraboxPath) {
    const parts = teraboxPath.split('/').filter(Boolean);
    parts.pop();
    parentDirPath = parts.length > 0 ? '/' + parts.join('/') : '';
  }

  if (surl) {
    const pathsToTry = [teraboxPath, parentDirPath, ''].filter((v, i, a) => v !== undefined && a.indexOf(v) === i);

    for (const targetPath of pathsToTry) {
      const proxyData = await fetchTeraBoxProxyApiElectron(surl, targetPath, shareId, uk) 
        || await fetchTeraBoxProxyApiNode(surl, targetPath, shareId, uk);

      if (proxyData) {
        if (proxyData.folder_download_url && proxyData.folder_download_url.startsWith('http')) {
          console.log(`[TeraBox Resolver] Link de Download All (folder-download) obtido com sucesso para path: "${targetPath}"!`);
          return {
            directUrl: proxyData.folder_download_url,
            referer: 'https://teraboxdl.site/'
          };
        }

        if (proxyData.list && Array.isArray(proxyData.list)) {
          const match = proxyData.list.find(i => String(i.fs_id) === String(fsId));
          if (match && match.direct_link && match.direct_link.startsWith('http')) {
            console.log('[TeraBox Resolver] Link direto de arquivo obtido com sucesso via TeraboxDL Gateway!');
            return {
              directUrl: match.direct_link,
              referer: 'https://teraboxdl.site/'
            };
          }
        }
      }
    }
  }

  // Se já possui o dlink direto do teraboxdl.site como fallback
  if (dlink && typeof dlink === 'string' && (dlink.includes('teraboxdl.site') || dlink.includes('/download') || dlink.includes('folder-download'))) {
    console.log('[TeraBox Resolver] Usando dlink em cache como fallback válido.');
    return {
      directUrl: dlink,
      referer: 'https://teraboxdl.site/'
    };
  }

  throw new Error('Não foi possível gerar o link de download de alta velocidade via TeraboxDL Gateway. Tente novamente.');
}

module.exports = {
  isTeraBoxUrl,
  scanTeraBoxLink,
  resolveTeraBoxDirectUrl
};

