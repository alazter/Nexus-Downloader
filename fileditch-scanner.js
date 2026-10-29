const https = require('https');
const http = require('http');
const { URL } = require('url');

function isFileditchUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return false;
  const lower = urlStr.toLowerCase();
  return lower.includes('fileditchfiles.st') || lower.includes('fileditch.com') || lower.includes('blehpooffileditchvids.org');
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

function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function getFileSizeFromDirectUrl(directUrl, referer) {
  return new Promise((resolve) => {
    try {
      const u = new URL(directUrl);
      const transport = u.protocol === 'https:' ? https : http;
      const req = transport.request(directUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
          'Referer': referer || 'https://fileditchfiles.st/',
          'Range': 'bytes=0-0'
        },
        timeout: 6000
      }, res => {
        const cr = res.headers['content-range'];
        if (cr) {
          const m = cr.match(/\/(\d+)/);
          if (m) {
            req.destroy();
            return resolve(parseInt(m[1], 10));
          }
        }
        const cl = parseInt(res.headers['content-length'] || '0', 10);
        req.destroy();
        resolve(cl);
      });
      req.on('timeout', () => { req.destroy(); resolve(0); });
      req.on('error', () => resolve(0));
      req.end();
    } catch (e) {
      resolve(0);
    }
  });
}

function resolveFileditchViaElectron(pageUrl) {
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
          contextIsolation: false,
          sandbox: false
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
          reject(new Error('Timeout ao resolver FileDitch no Electron (20s)'));
        }
      }, 20000);

      win.loadURL(pageUrl).catch(() => {});

      const checkInterval = setInterval(async () => {
        if (resolved || win.isDestroyed()) {
          clearInterval(checkInterval);
          return;
        }

        try {
          const title = win.webContents.getTitle() || '';
          if (title.includes('Just a moment') || title.includes('Um momento')) {
            return;
          }

          const pageData = await win.webContents.executeJavaScript(`
            (() => {
              const video = document.querySelector('video, source');
              const dlLink = Array.from(document.querySelectorAll('a')).find(a => 
                (a.innerText && a.innerText.toLowerCase().includes('download')) || 
                (a.href && a.href.includes('blehpooffileditchvids.org'))
              );
              return {
                title: document.title,
                videoSrc: video ? video.src : null,
                dlHref: dlLink ? dlLink.href : null
              };
            })()
          `);

          const targetDirectUrl = (pageData && pageData.dlHref) || (pageData && pageData.videoSrc);
          if (targetDirectUrl && targetDirectUrl.startsWith('http')) {
            resolved = true;
            clearInterval(checkInterval);
            clearTimeout(timeout);
            cleanup();

            let cleanName = (pageData.title || '').trim();
            cleanName = cleanName.replace(/[-_] FileDitch.*/i, '').trim();
            if (!cleanName || cleanName === 'FileDitch') {
              try {
                const u = new URL(targetDirectUrl);
                cleanName = decodeURIComponent(u.pathname.split('/').pop());
              } catch (eName) {
                cleanName = 'video.mp4';
              }
            }

            resolve({
              fileName: cleanName,
              directUrl: targetDirectUrl,
              referer: pageUrl
            });
          }
        } catch (eCheck) {}
      }, 1000);
    } catch (e) {
      reject(e);
    }
  });
}

async function resolveFileditchDirectUrl(pageUrl) {
  if (!pageUrl) throw new Error('URL FileDitch invalida');

  // Se ja for o stream de video direto
  if (pageUrl.includes('blehpooffileditchvids.org')) {
    let rawName = 'video.mp4';
    try {
      const u = new URL(pageUrl);
      rawName = decodeURIComponent(u.pathname.split('/').pop());
    } catch (e) {}
    const size = await getFileSizeFromDirectUrl(pageUrl, 'https://fileditchfiles.st/');
    return {
      fileName: rawName,
      size,
      directUrl: pageUrl,
      referer: 'https://fileditchfiles.st/'
    };
  }

  // 1. Tentar resolucao com BrowserWindow oculta
  try {
    const elResult = await resolveFileditchViaElectron(pageUrl);
    if (elResult && elResult.directUrl) {
      const size = await getFileSizeFromDirectUrl(elResult.directUrl, pageUrl);
      return {
        fileName: elResult.fileName,
        size,
        directUrl: elResult.directUrl,
        referer: pageUrl
      };
    }
  } catch (eEl) {
    console.warn('[FileDitch Scanner] Resolucao Electron falhou:', eEl.message);
  }

  // Fallback se nao foi possivel resolver
  let nameFallback = 'video.mp4';
  try {
    const u = new URL(pageUrl);
    nameFallback = decodeURIComponent(u.pathname.split('/').pop()) || 'video.mp4';
  } catch (e) {}

  return {
    fileName: nameFallback,
    size: 0,
    directUrl: pageUrl,
    referer: pageUrl
  };
}

async function scanFileditchLink(pageUrl) {
  const result = await resolveFileditchDirectUrl(pageUrl);
  const cleanId = Buffer.from(pageUrl).toString('hex').slice(0, 16);

  return [{
    id: `fileditch_${cleanId}`,
    fileId: cleanId,
    name: result.fileName,
    size: result.size,
    sizeFormatted: result.size > 0 ? formatBytes(result.size) : 'Tamanho dinamico',
    url: pageUrl,
    directUrl: result.directUrl,
    downloadUrl: result.directUrl,
    sourceUrl: pageUrl,
    referer: result.referer || pageUrl,
    isHttpDirect: true,
    service: 'FileDitch',
    folderName: 'FileDitch',
    relativePath: result.fileName,
    isAvulso: true,
    isSingleFile: true
  }];
}

module.exports = {
  isFileditchUrl,
  scanFileditchLink,
  resolveFileditchDirectUrl
};
