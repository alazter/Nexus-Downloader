const { BrowserWindow } = require('electron');

/**
 * Verifica se a URL é do Microsoft OneDrive ou SharePoint
 */
function isOneDriveUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return false;
  const lower = urlStr.toLowerCase();
  return (
    lower.includes('onedrive.aspx') ||
    lower.includes('sharepoint.com') ||
    lower.includes('onedrive.live.com') ||
    lower.includes('1drv.ms') ||
    lower.includes('onmicrosoft.com') ||
    lower.includes(':f:') ||
    lower.includes(':u:') ||
    lower.includes(':v:')
  );
}

/**
 * Formata bytes para exibição legível
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
 * Converte string de tamanho (ex: "526 MB", "1.4 GB") para bytes inteiros
 */
function parseSizeStrToBytes(sizeStr) {
  if (!sizeStr) return 0;
  const m = sizeStr.match(/([\d\.]+)\s*(KB|MB|GB|TB|B)/i);
  if (!m) return 0;
  const val = parseFloat(m[1]);
  const unit = m[2].toUpperCase();
  if (unit === 'KB') return Math.round(val * 1024);
  if (unit === 'MB') return Math.round(val * 1024 * 1024);
  if (unit === 'GB') return Math.round(val * 1024 * 1024 * 1024);
  if (unit === 'TB') return Math.round(val * 1024 * 1024 * 1024 * 1024);
  return Math.round(val);
}

/**
 * Sanitiza nome de pasta ou arquivo
 */
function sanitizeName(str) {
  if (!str) return 'OneDrive_Download';
  return str.replace(/[\\/:*?"<>|]/g, '_').trim();
}

/**
 * Extrai dados estruturados a partir de URLs do OneDrive/SharePoint
 */
function parseOneDriveUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    const host = u.hostname;
    const origin = u.origin;
    
    let folderPath = '';
    let folderName = '';

    const idParam = u.searchParams.get('id');
    if (idParam) {
      folderPath = decodeURIComponent(idParam);
      const parts = folderPath.split('/').filter(Boolean);
      if (parts.length > 0) {
        folderName = parts[parts.length - 1];
      }
    } else {
      const pathParts = u.pathname.split('/').filter(Boolean);
      if (pathParts.length > 0) {
        folderName = pathParts[pathParts.length - 1];
      }
      folderPath = u.pathname;
    }

    let personalPath = '';
    const matchPersonal = u.pathname.match(/(\/personal\/[^\/]+)/i);
    if (matchPersonal) {
      personalPath = matchPersonal[1];
    }

    return {
      host,
      origin,
      personalPath,
      folderPath,
      folderName: sanitizeName(folderName || 'OneDrive_Folder')
    };
  } catch (err) {
    return {
      host: '',
      origin: '',
      personalPath: '',
      folderPath: '',
      folderName: 'OneDrive_Folder'
    };
  }
}

/**
 * Escaneia o link do Microsoft OneDrive / SharePoint via Electron BrowserWindow
 */
async function scanOneDriveLink(urlStr) {
  console.log('[OneDrive Scanner] Iniciando escaneamento no Electron para:', urlStr);

  const initialParsed = parseOneDriveUrl(urlStr);

  return new Promise(async (resolve, reject) => {
    const win = new BrowserWindow({
      width: 1280,
      height: 900,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: false
      }
    });

    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
    win.webContents.setUserAgent(ua);

    try {
      await win.loadURL(urlStr, { userAgent: ua });

      let attempts = 0;
      let filesFound = [];
      let pageTitle = '';

      // Aguarda até 12 tentativas (12s) para a SPA renderizar os elementos da lista no DOM
      while (attempts < 12) {
        await new Promise(r => setTimeout(r, 1000));
        attempts++;

        const evalResult = await win.webContents.executeJavaScript(`
          (() => {
            try {
              const currentUrl = window.location.href;
              const rawTitle = document.title || '';
              const cleanTitle = rawTitle.replace('- OneDrive', '').replace('- SharePoint', '').trim();

              const rows = Array.from(document.querySelectorAll('[data-automationid="DetailsRow"], [role="row"]'));
              
              const parsedFiles = [];
              rows.forEach(r => {
                const nameEl = r.querySelector('[data-automationid="name"], a[href], button[data-automationid="name"]');
                const textContent = (r.innerText || '').trim();
                const lines = textContent.split('\\n').map(l => l.trim()).filter(Boolean);

                const fileName = nameEl ? (nameEl.innerText || '').trim() : (lines[0] || '');
                if (!fileName || fileName.toLowerCase().includes('nome') || fileName.toLowerCase().includes('modificado')) return;

                let sizeStr = '';
                lines.forEach(l => {
                  if (l.match(/\\d+(\\.\\d+)?\\s*(KB|MB|GB|TB)/i)) {
                    sizeStr = l.match(/\\d+(\\.\\d+)?\\s*(KB|MB|GB|TB)/i)[0];
                  }
                });

                if (fileName && (fileName.includes('.') || sizeStr)) {
                  parsedFiles.push({
                    name: fileName,
                    sizeStr: sizeStr || ''
                  });
                }
              });

              return {
                title: cleanTitle && !cleanTitle.includes('Entrar') ? cleanTitle : '',
                files: parsedFiles,
                currentUrl
              };
            } catch (err) {
              return { error: err.message, files: [] };
            }
          })();
        `);

        if (evalResult && evalResult.files && evalResult.files.length > 0) {
          filesFound = evalResult.files;
          if (evalResult.title) pageTitle = evalResult.title;
          break;
        }
      }

      const finalUrl = win.webContents.getURL();
      const finalParsed = parseOneDriveUrl(finalUrl);

      // Captura cookies de sessão do SharePoint ANTES de fechar a janela
      let sessionCookieHeader = '';
      try {
        const { session } = require('electron');
        const targetDomain = finalParsed.host || initialParsed.host;
        if (targetDomain) {
          const cookies = await session.defaultSession.cookies.get({ domain: targetDomain });
          if (cookies && cookies.length > 0) {
            sessionCookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
          }
        }
      } catch (e) {}

      win.close();

      const origin = finalParsed.origin || initialParsed.origin;
      const personalPath = finalParsed.personalPath || initialParsed.personalPath;
      const folderPath = finalParsed.folderPath || initialParsed.folderPath;
      const folderName = pageTitle || finalParsed.folderName || initialParsed.folderName || 'OneDrive_Folder';

      const resultList = [];
      let totalFolderBytes = 0;

      // Cria a lista de arquivos individuais
      filesFound.forEach((f, idx) => {
        const bytes = parseSizeStrToBytes(f.sizeStr);
        totalFolderBytes += bytes;

        let fileDirectUrl = '';
        if (origin && personalPath && folderPath) {
          const fileServerPath = `${folderPath}/${f.name}`;
          fileDirectUrl = `${origin}${personalPath}/_layouts/15/download.aspx?SourceUrl=${encodeURIComponent(fileServerPath)}`;
        } else {
          fileDirectUrl = urlStr + (urlStr.includes('?') ? '&download=1' : '?download=1');
        }

        resultList.push({
          id: 'onedrive_file_' + Date.now() + '_' + idx,
          fileId: 'od_f_' + idx,
          numericId: 'od_f_' + idx,
          name: f.name,
          size: bytes,
          sizeFormatted: bytes > 0 ? formatBytes(bytes) : (f.sizeStr || 'Download Direto'),
          relativePath: `${folderName}/${f.name}`,
          folderName: folderName,
          isHttpDirect: true,
          oneDriveUrl: urlStr,
          oneDriveDirectUrl: fileDirectUrl,
          oneDriveCookie: sessionCookieHeader
        });
      });

      console.log(`[OneDrive Scanner] Sucesso! ${resultList.length} arquivo(s) de mídia gerado(s). Pasta: "${folderName}" (${formatBytes(totalFolderBytes)}) | Cookies: ${sessionCookieHeader ? 'SIM' : 'NÃO'}`);
      resolve(resultList);
    } catch (err) {
      win.close();
      console.error('[OneDrive Scanner] Erro no escaneamento:', err.message);
      reject(err);
    }
  });
}

/**
 * Resolve o link direto de download para o Microsoft OneDrive / SharePoint
 */
async function resolveOneDriveDirectUrl(fsId, oneDriveUrl, directUrl) {
  console.log('[OneDrive Resolver] Resolvendo link direto e cookies para OneDrive/SharePoint...');

  const { session } = require('electron');
  let allCookies = await session.defaultSession.cookies.get({});
  let fedAuthCookie = allCookies.find(c => c.name === 'FedAuth');

  // Se o cookie FedAuth de autenticação do SharePoint não estiver na sessão, faz o carregamento em segundo plano para obter o token
  if (!fedAuthCookie && (oneDriveUrl || directUrl)) {
    console.log('[OneDrive Resolver] Cookie FedAuth ausente. Carregando URL de convidado para obter autenticação...');
    const win = new BrowserWindow({
      width: 1280,
      height: 900,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: false
      }
    });
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
    win.webContents.setUserAgent(ua);

    try {
      await win.loadURL(oneDriveUrl || directUrl, { userAgent: ua });
      await new Promise(r => setTimeout(r, 4000));
      allCookies = await session.defaultSession.cookies.get({});
      fedAuthCookie = allCookies.find(c => c.name === 'FedAuth');
    } catch (e) {}

    try { win.close(); } catch (e) {}
  }

  const targetHost = (new URL(directUrl || oneDriveUrl || 'https://sharepoint.com')).hostname;
  const spCookies = allCookies.filter(c => c.domain.includes(targetHost) || targetHost.includes(c.domain.replace(/^\./, '')));
  const sessionCookieHeader = spCookies.map(c => `${c.name}=${c.value}`).join('; ');

  console.log(`[OneDrive Resolver] Cookies obtidos (${spCookies.length}) | FedAuth: ${fedAuthCookie ? 'SIM' : 'NÃO'}`);

  if (directUrl && typeof directUrl === 'string' && directUrl.startsWith('http')) {
    return {
      directUrl: directUrl,
      referer: 'https://sharepoint.com/',
      cookie: sessionCookieHeader
    };
  }

  if (oneDriveUrl && typeof oneDriveUrl === 'string') {
    const parsed = parseOneDriveUrl(oneDriveUrl);
    if (parsed.origin && parsed.personalPath && parsed.folderPath) {
      const generated = `${parsed.origin}${parsed.personalPath}/_layouts/15/download.aspx?SourceUrl=${encodeURIComponent(parsed.folderPath)}`;
      return {
        directUrl: generated,
        referer: 'https://sharepoint.com/',
        cookie: sessionCookieHeader
      };
    }
  }

  throw new Error('Não foi possível gerar o link de download direto do Microsoft OneDrive / SharePoint.');
}

module.exports = {
  isOneDriveUrl,
  scanOneDriveLink,
  resolveOneDriveDirectUrl
};
