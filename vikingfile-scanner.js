const https = require('https');
const http = require('http');
const { URL } = require('url');

function isVikingFileUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return false;
  const u = urlStr.toLowerCase();
  return u.includes('vik1ngfile') || u.includes('vikingfile');
}

function parseFileSizeText(sizeText) {
  if (!sizeText) return 0;
  const match = sizeText.match(/([\d.,]+)\s*([KMGT]?B)/i);
  if (!match) return 0;
  const num = parseFloat(match[1].replace(',', '.'));
  const unit = match[2].toUpperCase();
  if (unit === 'KB') return Math.round(num * 1024);
  if (unit === 'MB') return Math.round(num * 1024 * 1024);
  if (unit === 'GB') return Math.round(num * 1024 * 1024 * 1024);
  if (unit === 'TB') return Math.round(num * 1024 * 1024 * 1024 * 1024);
  return Math.round(num);
}

function requestWithRedirects(urlStr, options = {}, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects < 0) return reject(new Error('Muitos redirecionamentos HTTP ao acessar VikingFile'));
    try {
      const parsed = new URL(urlStr);
      const client = parsed.protocol === 'https:' ? https : http;
      const reqOpts = {
        method: options.method || 'GET',
        headers: Object.assign({
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
          'Accept': options.accept || 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Referer': options.referer || urlStr
        }, options.headers || {})
      };

      const req = client.request(urlStr, reqOpts, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const nextUrl = new URL(res.headers.location, urlStr).href;
          return resolve(requestWithRedirects(nextUrl, options, maxRedirects - 1));
        }
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          resolve({ statusCode: res.statusCode, headers: res.headers, body, finalUrl: urlStr });
        });
      });

      req.on('error', reject);
      if (options.body) req.write(options.body);
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

async function probeCdnStorageUrl(directUrl) {
  if (!directUrl || typeof directUrl !== 'string' || !directUrl.includes('/d/')) return directUrl;
  return new Promise((resolve) => {
    try {
      const u = new URL(directUrl);
      const transport = u.protocol === 'https:' ? https : http;
      const req = transport.request(directUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
          'Range': 'bytes=0-0'
        },
        timeout: 6000
      }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          resolve(res.headers.location);
        } else {
          resolve(directUrl);
        }
        res.destroy();
      });
      req.on('error', () => resolve(directUrl));
      req.on('timeout', () => { req.destroy(); resolve(directUrl); });
      req.end();
    } catch (e) {
      resolve(directUrl);
    }
  });
}

function resolveVikingViaElectron(pageUrl) {
  return new Promise((resolve, reject) => {
    try {
      const electron = require('electron');
      const BrowserWindow = electron.BrowserWindow || (electron.remote && electron.remote.BrowserWindow);
      if (!BrowserWindow) return reject(new Error('Electron BrowserWindow nao disponivel'));

      const win = new BrowserWindow({
        show: false,
        width: 800,
        height: 600,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true
        }
      });

      let resolved = false;
      const cleanup = () => {
        if (!win.isDestroyed()) {
          try { win.destroy(); } catch (e) {}
        }
      };

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          reject(new Error('Timeout ao resolver VikingFile no Electron'));
        }
      }, 10000);

      win.loadURL(pageUrl).catch(() => {});

      const checkInterval = setInterval(async () => {
        if (resolved || win.isDestroyed()) {
          clearInterval(checkInterval);
          return;
        }

        try {
          const result = await win.webContents.executeJavaScript(`
            (() => {
              const dlLink = document.getElementById('download-link') || document.querySelector('a[href*="/d/"]');
              const nameEl = document.getElementById('filename') || document.querySelector('h2');
              const sizeEl = document.getElementById('size') || document.querySelector('p#size');
              return {
                href: dlLink ? dlLink.href : null,
                text: dlLink ? dlLink.innerText : null,
                fileName: nameEl ? nameEl.innerText : null,
                sizeText: sizeEl ? sizeEl.innerText : null,
                title: document.title
              };
            })()
          `);

          if (result && result.href && result.href.includes('/d/')) {
            resolved = true;
            clearInterval(checkInterval);
            clearTimeout(timeout);
            cleanup();

            let cleanName = (result.fileName || result.title || 'Arquivo_Vik1ngFile').trim();
            cleanName = cleanName.replace(/[-_] ViKiNG FiLE.*/i, '').replace(/[-_] Vik1ngFile.*/i, '').trim() || 'Arquivo_Vik1ngFile';
            const sizeInBytes = parseFileSizeText(result.sizeText);

            // Probe CDN se possivel para obter a URL direta estavel
            const finalCdnUrl = await probeCdnStorageUrl(result.href);

            resolve({
              fileName: cleanName,
              size: sizeInBytes,
              directUrl: finalCdnUrl
            });
          }
        } catch (eCheck) {}
      }, 500);
    } catch (e) {
      reject(e);
    }
  });
}

async function resolveVikingFileDirectUrl(pageUrl) {
  // 1. Tentar resolucao via BrowserWindow oculta (processa JS ofuscado do VikingFile em ~3s)
  try {
    const electronResult = await resolveVikingViaElectron(pageUrl);
    if (electronResult && electronResult.directUrl && electronResult.directUrl.includes('/d/')) {
      console.log(`[VikingFile Scanner] Link real extraido com sucesso via Electron: ${electronResult.directUrl}`);
      return electronResult;
    }
  } catch (eElectron) {
    // Continua para o fallback HTTP padrao
  }

  try {
    // 2. Requisicao GET seguindo redirecionamentos (ex: vik1ngfile.site -> vikingfile.com)
    const getRes = await requestWithRedirects(pageUrl, {
      method: 'GET',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });

    const html = getRes.body || '';
    const finalPageUrl = getRes.finalUrl || pageUrl;

    // Extrair nome e tamanho do HTML
    const nameMatch = html.match(/<h2[^>]*id=["']filename["'][^>]*>([^<]+)<\/h2>/i) ||
                      html.match(/<title>([^<]+)<\/title>/i);
    const sizeMatch = html.match(/<p[^>]*id=["']size["'][^>]*>([^<]+)<\/p>/i) ||
                      html.match(/id=["']size["'][^>]*>([^<]+)</i);

    let fileName = nameMatch ? nameMatch[1].trim() : 'Arquivo_Vik1ngFile';
    fileName = fileName.replace(/[-_] ViKiNG FiLE.*/i, '').replace(/[-_] Vik1ngFile.*/i, '').trim() || 'Arquivo_Vik1ngFile';

    const sizeText = sizeMatch ? sizeMatch[1].trim() : '';
    const sizeInBytes = parseFileSizeText(sizeText);

    // 3. Tentar requisitar POST na URL final para receber o JSON do link de download direto
    try {
      const postRes = await requestWithRedirects(finalPageUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': finalPageUrl
        },
        body: ''
      });

      if (postRes.body && postRes.body.includes('{')) {
        try {
          const data = JSON.parse(postRes.body);
          if (data.link && !data.link.includes('fast-download')) {
            const finalCdnUrl = await probeCdnStorageUrl(data.link);
            return {
              fileName: data.name || fileName,
              size: data.size || sizeInBytes,
              directUrl: finalCdnUrl
            };
          }
        } catch (eJson) {}
      }
    } catch (ePost) {}

    // 4. Fallback: procurar por link /d/ no proprio HTML retornado (nunca fast-download)
    const dlLinkMatch = html.match(/id=["']download-link["'][^>]*href=["'](https?:\/\/[^"']*\/d\/[^"']+)["']/i) ||
                        html.match(/href=["'](https?:\/\/[^"']*\/d\/[^"']+)["']/i);
    if (dlLinkMatch && dlLinkMatch[1]) {
      const finalCdnUrl = await probeCdnStorageUrl(dlLinkMatch[1].trim());
      return {
        fileName,
        size: sizeInBytes,
        directUrl: finalCdnUrl
      };
    }

    // 5. Fallback final com URL da pagina
    return {
      fileName,
      size: sizeInBytes,
      directUrl: finalPageUrl
    };
  } catch (err) {
    return {
      fileName: 'Arquivo_Vik1ngFile',
      size: 0,
      directUrl: pageUrl
    };
  }
}

async function scanVikingFileLink(pageUrl) {
  const result = await resolveVikingFileDirectUrl(pageUrl);
  const cleanId = (pageUrl.split('/f/')[1] || pageUrl.split('/').pop() || Date.now().toString()).replace(/[^a-zA-Z0-9_-]/g, '');

  return [{
    id: `vik1ng_${cleanId}`,
    fileId: cleanId,
    name: result.fileName,
    size: result.size,
    url: result.directUrl,
    directUrl: result.directUrl,
    downloadUrl: result.directUrl,
    sourceUrl: pageUrl,
    bunkrPageUrl: pageUrl,
    isHttpDirect: true,
    service: 'Vik1ngFile',
    folderName: null,
    relativePath: result.fileName,
    isAvulso: true,
    isSingleFile: true
  }];
}

module.exports = {
  isVikingFileUrl,
  scanVikingFileLink,
  resolveVikingFileDirectUrl
};
