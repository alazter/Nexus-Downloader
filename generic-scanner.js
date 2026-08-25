const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// Arquivo de cache persistente por domínio
const getAppDataDir = () => {
  const appData = process.env.APPDATA || (process.platform === 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + '/.local/share');
  const dir = path.join(appData, 'nexus-downloader');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
};

const CACHE_FILE = path.join(getAppDataDir(), 'domain_engine_cache.json');
let domainCache = {};

try {
  if (fs.existsSync(CACHE_FILE)) {
    domainCache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  }
} catch (e) {
  domainCache = {};
}

function saveDomainCache() {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(domainCache, null, 2), 'utf8');
  } catch (e) {}
}

function getDomain(urlStr) {
  try {
    const u = new URL(urlStr);
    return u.hostname.toLowerCase().replace(/^www\./, '');
  } catch (e) {
    return null;
  }
}

function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function makeHttpRequest(urlStr, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      const parsed = new URL(urlStr);
      const client = parsed.protocol === 'https:' ? https : http;

      const reqOpts = {
        method: options.method || 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9,pt-BR;q=0.8,pt;q=0.7',
          ...(options.headers || {})
        },
        timeout: options.timeout || 15000
      };

      if (options.token) {
        reqOpts.headers['Authorization'] = `Bearer ${options.token}`;
      }

      const req = client.request(urlStr, reqOpts, (res) => {
        // Lida com redirecionamentos (301, 302, 303, 307, 308)
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && !options.noRedirect) {
          let redirectUrl = res.headers.location;
          if (redirectUrl.startsWith('/')) {
            redirectUrl = `${parsed.protocol}//${parsed.host}${redirectUrl}`;
          }
          return makeHttpRequest(redirectUrl, { ...options, redirectCount: (options.redirectCount || 0) + 1 })
            .then(resolve)
            .catch(reject);
        }

        let body = [];
        res.on('data', chunk => body.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(body);
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            bodyText: buffer.toString('utf8'),
            bodyBuffer: buffer,
            finalUrl: urlStr
          });
        });
      });

      req.on('error', err => reject(err));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timed out'));
      });

      if (options.body) {
        req.write(options.body);
      }
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

// ----------------------------------------------------
// MOTOR 1: GoFile API Engine (Suporte a Pastas e Subpastas)
// ----------------------------------------------------
let gofileAccountToken = null;

async function getGoFileAccountToken() {
  if (gofileAccountToken) return gofileAccountToken;
  try {
    const res = await makeHttpRequest('https://api.gofile.io/accounts', { method: 'POST' });
    const json = JSON.parse(res.bodyText);
    if (json.status === 'ok' && json.data && json.data.token) {
      gofileAccountToken = json.data.token;
      return gofileAccountToken;
    }
  } catch (e) {}
  return 'wt=4fd6a892dcd6'; // Fallback token publico
}

async function scanGoFileFolder(contentId, folderPath = '', token = null) {
  const results = [];
  const accToken = token || await getGoFileAccountToken();
  const url = `https://api.gofile.io/contents/${contentId}`;

  const res = await makeHttpRequest(url, { token: accToken });
  const json = JSON.parse(res.bodyText);

  if (json.status !== 'ok' || !json.data) {
    throw new Error(json.status || 'Falha ao acessar GoFile API');
  }

  const data = json.data;
  const currentFolderName = folderPath ? `${folderPath} / ${data.name || 'GoFile'}` : (data.name || 'GoFile Folder');

  if (data.children) {
    for (const key of Object.keys(data.children)) {
      const child = data.children[key];
      if (child.type === 'file') {
        results.push({
          id: `gofile_${child.id}`,
          fileId: child.id,
          name: child.name,
          size: child.size || 0,
          downloadUrl: child.link,
          directUrl: child.link,
          folderName: currentFolderName,
          relativePath: `${currentFolderName}/${child.name}`,
          gofileToken: accToken
        });
      } else if (child.type === 'folder') {
        // Varredura recursiva de subpasta
        const subFiles = await scanGoFileFolder(child.id, currentFolderName, accToken);
        results.push(...subFiles);
      }
    }
  }

  return results;
}

async function scanGoFile(urlStr) {
  if (!urlStr.includes('gofile.io')) return null;
  const match = urlStr.match(/gofile\.io\/d\/([a-zA-Z0-9_-]+)/i);
  if (!match) return null;

  const contentId = match[1];
  console.log(`[GoFile Engine] Escaneando conteúdo ID: ${contentId}`);
  const files = await scanGoFileFolder(contentId);
  return files;
}

// ----------------------------------------------------
// MOTOR 2: Direct HTTP Probe Engine
// ----------------------------------------------------
async function scanDirectHttpProbe(urlStr) {
  try {
    const res = await makeHttpRequest(urlStr, { method: 'HEAD' });
    const headers = res.headers || {};
    const contentType = (headers['content-type'] || '').toLowerCase();
    const contentLength = parseInt(headers['content-length'] || '0', 10);
    const contentDisp = headers['content-disposition'] || '';

    // Verifica se é uma resposta binária/mídia de download direto
    const isBinaryType = contentType.includes('application/') || 
                         contentType.includes('video/') || 
                         contentType.includes('audio/') || 
                         contentType.includes('image/') ||
                         contentType.includes('octet-stream');

    const isHtml = contentType.includes('text/html');

    if (isHtml && contentLength < 500000 && !contentDisp) {
      return null; // Não é arquivo direto, passar para HTML Scraper
    }

    let fileName = '';
    if (contentDisp) {
      const match = contentDisp.match(/filename\*?=['"]?(?:UTF-8'')?([^;'"]+)['"]?/i);
      if (match) fileName = decodeURIComponent(match[1]);
    }

    if (!fileName) {
      const parsed = new URL(urlStr);
      fileName = path.basename(parsed.pathname);
    }

    if (!fileName || fileName === '/' || fileName === 'download') {
      fileName = 'arquivo_download.bin';
    }

    const domain = getDomain(urlStr) || 'Servidor Genérico';
    return [{
      id: `generic_direct_${Buffer.from(urlStr).toString('hex').slice(0, 16)}`,
      name: fileName,
      size: contentLength,
      downloadUrl: urlStr,
      directUrl: urlStr,
      folderName: `Downloads (${domain})`,
      relativePath: fileName
    }];
  } catch (e) {
    return null;
  }
}

// ----------------------------------------------------
// MOTOR 3: Smart HTML & Hoster Scraper Engine (MegaUp, Turbo.cr, Vik1ngFile, etc.)
// ----------------------------------------------------
async function scanSmartHtmlScraper(urlStr) {
  try {
    const domain = getDomain(urlStr) || 'Site Genérico';
    const res = await makeHttpRequest(urlStr, { method: 'GET' });
    const body = res.bodyText || '';

    // A. SUPORTE ESPECÍFICO PARA MEGAUP (megaup.net)
    if (domain.includes('megaup.net')) {
      const megaUpDlMatch = body.match(/href=['"](https?:\/\/download\.megaup\.net\/\?url=[^'"]+)['"]/i) || 
                            body.match(/(https?:\/\/download\.megaup\.net\/\?url=[^\s"'<>]+)/i);

      const megaUpTitleMatch = body.match(/<title>(.*?) - MegaUp<\/title>/i) || body.match(/<title>(.*?)<\/title>/i);
      let megaUpName = megaUpTitleMatch ? megaUpTitleMatch[1].trim() : 'The_Binding_of_Isaac_Afterbirth.rar';

      if (megaUpDlMatch) {
        const directDlUrl = megaUpDlMatch[1];
        console.log(`[MegaUp Engine] Link direto extraído com sucesso: ${directDlUrl}`);
        return [{
          id: `megaup_${Buffer.from(directDlUrl).toString('hex').slice(0, 16)}`,
          name: megaUpName,
          size: 0,
          downloadUrl: directDlUrl,
          directUrl: directDlUrl,
          folderName: `Downloads (megaup.net)`,
          relativePath: megaUpName
        }];
      }
    }

    // B. SUPORTE ESPECÍFICO PARA TURBO.CR ALBUMS E PASTAS (turbo.cr/a/...)
    if (domain.includes('turbo.cr')) {
      const pageTitleMatch = body.match(/<title>(.*?) - turbo\.cr<\/title>/i) || body.match(/<title>(.*?)<\/title>/i);
      const folderName = pageTitleMatch ? pageTitleMatch[1].trim() : 'Pasta Turbo.cr';

      // Captura e desduplica IDs únicos de arquivo (/v/{id} ou /d/{id})
      const rawMatches = body.match(/\/(?:v|d)\/([a-zA-Z0-9_-]+)/g) || [];
      const fileIds = Array.from(new Set(rawMatches.map(m => m.split('/').pop())));

      if (fileIds.length > 0) {
        console.log(`[Turbo.cr Engine] Álbum detectado com ${fileIds.length} arquivos únicos! Escaneando sub-itens...`);
        const results = [];

        for (const fileId of fileIds) {
          const viewUrl = `https://turbo.cr/v/${fileId}`;
          const directDlUrl = `https://turbo.cr/d/${fileId}`;

          let subFileName = `${fileId}.mp4`;
          try {
            const subRes = await makeHttpRequest(viewUrl, { method: 'GET' });
            const subTitleMatch = subRes.bodyText.match(/<title>(.*?) — turbo\.cr<\/title>/i) || 
                                  subRes.bodyText.match(/<title>(.*?)<\/title>/i);
            if (subTitleMatch && subTitleMatch[1]) {
              subFileName = subTitleMatch[1].replace(/ — turbo\.cr.*/i, '').trim();
            }
          } catch (e) {}

          results.push({
            id: `turbocr_${fileId}`,
            name: subFileName,
            size: 0,
            downloadUrl: directDlUrl,
            directUrl: directDlUrl,
            folderName: folderName,
            relativePath: `${folderName}/${subFileName}`
          });
        }

        if (results.length > 0) return results;
      }
    }

    // C. VARREDURA GENÉRICA EM LANDING PAGES (Tags <a>, <video>, <source>, etc.)
    const fileExtRegex = /https?:\/\/[^\s"'<>]+?\.(rar|zip|mp4|mkv|7z|iso|exe|bin|pdf|apk|tar|gz|3gp|avi|mov|flv|wmv|txt)/gi;
    const matches = Array.from(new Set(body.match(fileExtRegex) || []));

    if (matches.length > 0) {
      const results = [];
      matches.forEach((dlUrl, idx) => {
        const u = new URL(dlUrl);
        const name = path.basename(u.pathname) || `arquivo_${idx + 1}`;
        results.push({
          id: `scraper_${Buffer.from(dlUrl).toString('hex').slice(0, 16)}`,
          name: name,
          size: 0,
          downloadUrl: dlUrl,
          directUrl: dlUrl,
          folderName: `Arquivos Encontrados (${domain})`,
          relativePath: name
        });
      });
      return results;
    }

    // D. FALLBACK DE NOME POR TÍTULO DA PÁGINA
    const titleMatch = body.match(/<title>(.*?)<\/title>/i);
    let titleName = titleMatch ? titleMatch[1].replace(/[-_] (turbo\.cr|megaup|vik1ngfile).*/i, '').trim() : '';

    if (titleName && !titleName.toLowerCase().includes('404') && !titleName.toLowerCase().includes('error')) {
      return [{
        id: `scraper_page_${Buffer.from(urlStr).toString('hex').slice(0, 16)}`,
        name: titleName.endsWith('.rar') || titleName.endsWith('.zip') || titleName.endsWith('.mp4') ? titleName : `${titleName}.rar`,
        size: 0,
        downloadUrl: urlStr,
        directUrl: urlStr,
        folderName: `Downloads (${domain})`,
        relativePath: titleName
      }];
    }

    return null;
  } catch (e) {
    return null;
  }
}

// ----------------------------------------------------
// MOTOR: PixelDrain API Engine (Suporte a Álbuns/Listas e Arquivos Individuais)
// ----------------------------------------------------
async function scanPixelDrain(urlStr) {
  if (!urlStr || typeof urlStr !== 'string' || !urlStr.includes('pixeldrain.com')) return null;

  // 1. Verifica se é um álbum/lista (/l/{id})
  const listMatch = urlStr.match(/pixeldrain\.com\/l\/([a-zA-Z0-9_-]+)/i);
  if (listMatch) {
    const listId = listMatch[1];
    console.log(`[PixelDrain Engine] Escaneando álbum/lista ID: ${listId}`);
    try {
      const apiRes = await makeHttpRequest(`https://pixeldrain.com/api/list/${listId}`);
      if (apiRes.statusCode === 200) {
        const json = JSON.parse(apiRes.bodyText);
        const folderTitle = (json.title || `PixelDrain_Album_${listId}`).replace(/[\\/:*?"<>|]/g, '_').trim();
        const filesList = json.files || [];
        console.log(`[PixelDrain Engine] Álbum "${folderTitle}" possui ${filesList.length} arquivos descompactados.`);

        return filesList.map((f, idx) => {
          const fId = f.id;
          const fileName = (f.name || `Arquivo_${idx + 1}`).replace(/[\\/:*?"<>|]/g, '_');
          const fileSize = f.size || 0;
          const pageUrl = `https://pixeldrain.com/u/${fId}`;
          const directUrl = `https://pixeldrain.com/api/file/${fId}`;

          return {
            id: `pixeldrain_${listId}_${fId}`,
            fileId: fId,
            numericId: fId,
            name: fileName,
            size: fileSize,
            sizeFormatted: formatBytes(fileSize),
            downloadUrl: pageUrl,
            directUrl: directUrl,
            sourceUrl: pageUrl,
            originalUrl: pageUrl,
            folderName: folderTitle,
            relativePath: `${folderTitle}/${fileName}`,
            isHttpDirect: true,
            pixeldrainListId: listId
          };
        });
      }
    } catch (e) {
      console.warn('[PixelDrain Engine] Erro ao consultar API de lista:', e.message);
    }
  }

  // 2. Verifica se é um arquivo individual (/u/{id})
  const fileMatch = urlStr.match(/pixeldrain\.com\/u\/([a-zA-Z0-9_-]+)/i) || urlStr.match(/pixeldrain\.com\/api\/file\/([a-zA-Z0-9_-]+)/i);
  if (fileMatch) {
    const fileId = fileMatch[1];
    console.log(`[PixelDrain Engine] Escaneando arquivo individual ID: ${fileId}`);
    let fileName = `pixeldrain_${fileId}.bin`;
    let fileSize = 0;

    try {
      const infoRes = await makeHttpRequest(`https://pixeldrain.com/api/file/${fileId}/info`);
      if (infoRes.statusCode === 200) {
        const info = JSON.parse(infoRes.bodyText);
        if (info.name) fileName = info.name.replace(/[\\/:*?"<>|]/g, '_');
        if (info.size) fileSize = info.size;
      }
    } catch (e) {}

    const pageUrl = `https://pixeldrain.com/u/${fileId}`;
    const directUrl = `https://pixeldrain.com/api/file/${fileId}`;

    return [{
      id: `pixeldrain_${fileId}`,
      fileId: fileId,
      numericId: fileId,
      name: fileName,
      size: fileSize,
      sizeFormatted: formatBytes(fileSize),
      downloadUrl: pageUrl,
      directUrl: directUrl,
      sourceUrl: pageUrl,
      originalUrl: pageUrl,
      folderName: 'Arquivos Avulsos PixelDrain',
      relativePath: `Arquivos Avulsos PixelDrain/${fileName}`,
      isHttpDirect: true
    }];
  }

  return null;
}

// ----------------------------------------------------
// PIPELINE UNIFICADO COM CACHE ADAPTATIVO POR DOMÍNIO
// ----------------------------------------------------
async function scanGenericLink(urlStr, torboxApiKey = null) {
  const domain = getDomain(urlStr);
  console.log(`[Generic Scanner] Processando URL: ${urlStr} (Domínio: ${domain})`);

  // 0. PixelDrain API Engine (Álbuns e Arquivos Únicos)
  if (urlStr.includes('pixeldrain.com')) {
    try {
      const pdFiles = await scanPixelDrain(urlStr);
      if (pdFiles && pdFiles.length > 0) {
        if (domain) {
          domainCache[domain] = 'PixelDrainEngine';
          saveDomainCache();
        }
        return pdFiles;
      }
    } catch (e) {
      console.log('[Generic Scanner] PixelDrain Engine falhou:', e.message);
    }
  }

  // 1. Verifica se há um motor salvo no cache para este domínio
  const cachedEngine = domain ? domainCache[domain] : null;

  if (cachedEngine) {
    console.log(`[Generic Scanner Cache] Usando atalho de cache para ${domain}: ${cachedEngine}`);
    try {
      let results = null;
      if (cachedEngine === 'PixelDrainEngine') results = await scanPixelDrain(urlStr);
      else if (cachedEngine === 'GoFileEngine') results = await scanGoFile(urlStr);
      else if (cachedEngine === 'SmartHtmlScraper' || domain.includes('turbo.cr') || domain.includes('megaup.net')) results = await scanSmartHtmlScraper(urlStr);
      else if (cachedEngine === 'DirectHttpProbe') results = await scanDirectHttpProbe(urlStr);

      if (results && results.length > 0) {
        console.log(`[Generic Scanner Cache] Sucesso via atalho de cache para ${domain}! (${results.length} arquivos)`);
        return results;
      }
    } catch (e) {
      console.log(`[Generic Scanner Cache] Atalho ${cachedEngine} falhou para ${domain}. Limpando cache e rodando Pipeline do Zero!`);
      delete domainCache[domain];
      saveDomainCache();
    }
  }

  // 2. PIPELINE DE RESILIÊNCIA COMPLETO (Passo 0)

  // Etapa A: Hoster Scrapers Especiais (Turbo.cr, MegaUp)
  if (urlStr.includes('turbo.cr') || urlStr.includes('megaup.net')) {
    try {
      const files = await scanSmartHtmlScraper(urlStr);
      if (files && files.length > 0) {
        if (domain) {
          domainCache[domain] = 'SmartHtmlScraper';
          saveDomainCache();
        }
        return files;
      }
    } catch (e) {}
  }

  // Etapa A: GoFile API Engine
  if (urlStr.includes('gofile.io')) {
    try {
      const files = await scanGoFile(urlStr);
      if (files && files.length > 0) {
        if (domain) {
          domainCache[domain] = 'GoFileEngine';
          saveDomainCache();
        }
        return files;
      }
    } catch (e) {
      console.log('[Generic Scanner] GoFile API falhou:', e.message);
    }
  }

  // Etapa B: Direct HTTP Probe Engine
  try {
    const files = await scanDirectHttpProbe(urlStr);
    if (files && files.length > 0) {
      if (domain) {
        domainCache[domain] = 'DirectHttpProbe';
        saveDomainCache();
      }
      return files;
    }
  } catch (e) {
    console.log('[Generic Scanner] Direct HTTP Probe falhou:', e.message);
  }

  // Etapa C: Smart HTML Scraper Engine
  try {
    const files = await scanSmartHtmlScraper(urlStr);
    if (files && files.length > 0) {
      if (domain) {
        domainCache[domain] = 'SmartHtmlScraper';
        saveDomainCache();
      }
      return files;
    }
  } catch (e) {
    console.log('[Generic Scanner] Smart HTML Scraper falhou:', e.message);
  }

  // Etapa D: Fallback Universal para Links Diretos / Web Sites Sem Scraper Específico
  try {
    const parsed = new URL(urlStr);
    let fileName = path.basename(parsed.pathname) || 'Download_Link.bin';
    if (!/\.[a-zA-Z0-9]{2,5}$/.test(fileName)) {
      fileName = (domain ? domain.split('.')[0] : 'Download') + '_' + Math.random().toString(36).substring(2, 7) + '.bin';
    }
    const cleanFileName = fileName.replace(/[\\/:*?"<>|]/g, '_');

    console.log(`[Generic Scanner] Gerando item de Download Direto Universal para: ${urlStr}`);
    return [{
      id: 'generic_' + Math.random().toString(36).substring(2, 9),
      fileId: 'gen_' + Date.now(),
      numericId: 'gen_' + Date.now(),
      name: cleanFileName,
      size: 0,
      sizeFormatted: 'Procurando...',
      downloadUrl: urlStr,
      directUrl: urlStr,
      folderName: domain ? domain.toUpperCase() : 'Arquivos Avulsos',
      relativePath: (domain ? domain.toUpperCase() : 'Arquivos Avulsos') + '/' + cleanFileName,
      isHttpDirect: true,
      url: urlStr
    }];
  } catch (err) {
    throw new Error(`Não foi possível processar o link fornecido (${urlStr}): ${err.message}`);
  }
}

module.exports = {
  scanGenericLink,
  scanPixelDrain,
  scanGoFile,
  scanDirectHttpProbe,
  scanSmartHtmlScraper
};
