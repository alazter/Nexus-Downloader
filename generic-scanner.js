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

function parseSizeToBytes(sizeStr) {
  if (!sizeStr || typeof sizeStr !== 'string') return 0;
  const match = sizeStr.trim().match(/([\d\.,]+)\s*([a-zA-Z]+)/);
  if (!match) return 0;
  const numPart = parseFloat(match[1].replace(',', '.'));
  const unit = match[2].toLowerCase();
  if (unit.includes('to') || unit.includes('tb')) return Math.round(numPart * 1024 * 1024 * 1024 * 1024);
  if (unit.includes('go') || unit.includes('gb')) return Math.round(numPart * 1024 * 1024 * 1024);
  if (unit.includes('mo') || unit.includes('mb')) return Math.round(numPart * 1024 * 1024);
  if (unit.includes('ko') || unit.includes('kb')) return Math.round(numPart * 1024);
  return Math.round(numPart);
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
// MOTOR 1: GoFile API Engine (Suporte a Pastas e Subpastas com Assinatura WT)
// ----------------------------------------------------
const { scanGoFileLink, getGoFileAccountToken } = require('./gofile-scanner');

async function scanGoFile(urlStr) {
  return await scanGoFileLink(urlStr);
}

// ----------------------------------------------------
// MOTOR: 1Fichier Directory Parser (/dir/)
// ----------------------------------------------------
async function scan1FichierDirectory(urlStr) {
  try {
    const res = await makeHttpRequest(urlStr, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      }
    });

    if (res.statusCode !== 200 || !res.bodyText) {
      throw new Error(`Status ${res.statusCode}`);
    }

    const html = res.bodyText;
    const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
    const files = [];

    for (const r of rows) {
      const linkM = r.match(/href="([^"]*1fichier\.com\/\?[^"]+)"/i);
      const nameM = r.match(/<a[^>]+>([^<]+)<\/a>/i);
      const sizeM = r.match(/<td[^>]*>([\d\.,]+\s*(?:[KMGT]?B|Bytes|o|Ko|Mo|Go|To))<\/td>/i);

      if (linkM) {
        let directLink = linkM[1];
        if (directLink.startsWith('//')) directLink = 'https:' + directLink;
        else if (directLink.startsWith('/')) directLink = 'https://1fichier.com' + directLink;

        let name = nameM ? nameM[1].trim() : path.basename(new URL(directLink).pathname) || '1fichier_file';
        name = name.replace(/[\\/:*?"<>|]/g, '_');
        const sizeFormatted = sizeM ? sizeM[1].trim() : 'Desconhecido';

        let sizeBytes = 0;
        if (sizeM) {
          const numPart = parseFloat(sizeM[1].replace(',', '.'));
          const unit = sizeM[1].toLowerCase();
          if (unit.includes('to') || unit.includes('tb')) sizeBytes = Math.round(numPart * 1024 * 1024 * 1024 * 1024);
          else if (unit.includes('go') || unit.includes('gb')) sizeBytes = Math.round(numPart * 1024 * 1024 * 1024);
          else if (unit.includes('mo') || unit.includes('mb')) sizeBytes = Math.round(numPart * 1024 * 1024);
          else if (unit.includes('ko') || unit.includes('kb')) sizeBytes = Math.round(numPart * 1024);
          else sizeBytes = Math.round(numPart);
        }

        const idSuffix = Math.random().toString(36).substring(2, 9);
        files.push({
          id: `onefichier_${idSuffix}`,
          fileId: `1fichier_${idSuffix}`,
          numericId: Date.now() + files.length,
          name: name,
          size: sizeBytes,
          sizeFormatted: sizeFormatted,
          downloadUrl: directLink,
          directUrl: directLink,
          folderName: '1Fichier Pasta',
          relativePath: name,
          isHttpDirect: true,
          isAvulso: false,
          isSingleFile: false,
          service: '1fichier',
          url: directLink
        });
      }
    }

    if (files.length > 0) {
      console.log(`[Generic Scanner] 1Fichier Directory parseou ${files.length} arquivos com sucesso.`);
      return files;
    }
    throw new Error('Nenhum arquivo encontrado no diretório 1Fichier');
  } catch (err) {
    console.log('[Generic Scanner] Erro ao escanear diretório 1Fichier:', err.message);
    throw err;
  }
}

// ----------------------------------------------------
// MOTOR: 1Fichier Single File Parser Engine
// ----------------------------------------------------
async function scan1FichierSingleFile(urlStr) {
  if (!urlStr || typeof urlStr !== 'string' || !urlStr.includes('1fichier.com')) return null;
  const cleanUrl = urlStr.trim();
  console.log(`[1Fichier Scanner] Escaneando arquivo único: ${cleanUrl}`);

  try {
    const res = await makeHttpRequest(cleanUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });

    const body = res.bodyText || '';
    if (res.statusCode === 404 || body.includes('File not found') || body.includes('Fichier introuvable')) {
      console.warn(`[1Fichier Scanner] Arquivo não encontrado ou removido: ${cleanUrl}`);
      return null;
    }

    // 1. Extração de nome por <span class="tier-name"> ou .normal td
    let fileName = '';
    const tierNameMatch = body.match(/<span[^>]*class=["']tier-name["'][^>]*>([\s\S]*?)<\/span>/i);
    if (tierNameMatch) {
      fileName = tierNameMatch[1].replace(/<[^>]+>/g, '').trim();
    }

    if (!fileName) {
      const tdNameMatch = body.match(/<td[^>]*class=["']normal["'][^>]*>(?:Nom du fichier\s*:|Filename\s*:)<\/td>\s*<td[^>]*class=["']normal["'][^>]*>([\s\S]*?)<\/td>/i);
      if (tdNameMatch) {
        fileName = tdNameMatch[1].replace(/<[^>]+>/g, '').trim();
      }
    }

    // 2. Extração de tamanho por <span class="tier-feat"> ou .normal td
    let fileSize = 0;
    let sizeFormatted = '';
    const tierFeatMatch = body.match(/<span[^>]*class=["']tier-feat["'][^>]*>([\s\S]*?)<\/span>/i);
    if (tierFeatMatch) {
      sizeFormatted = tierFeatMatch[1].replace(/<[^>]+>/g, '').trim();
      fileSize = parseSizeToBytes(sizeFormatted);
    }

    if (!fileSize) {
      const tdSizeMatch = body.match(/<td[^>]*class=["']normal["'][^>]*>(?:Taille\s*:|Size\s*:)<\/td>\s*<td[^>]*class=["']normal["'][^>]*>([\s\S]*?)<\/td>/i);
      if (tdSizeMatch) {
        sizeFormatted = tdSizeMatch[1].replace(/<[^>]+>/g, '').trim();
        fileSize = parseSizeToBytes(sizeFormatted);
      }
    }

    if (!fileName) {
      const urlMatch = cleanUrl.match(/1fichier\.com\/(?:\?|)([a-zA-Z0-9_-]+)/i);
      const fid = urlMatch ? urlMatch[1] : `1f_${Date.now()}`;
      fileName = `1fichier_${fid}.bin`;
    }

    const cleanFileName = fileName.replace(/[\\/:*?"<>|]/g, '_');
    const fileId = `1fichier_${Buffer.from(cleanUrl).toString('hex').slice(0, 12)}`;

    return [{
      id: fileId,
      fileId: fileId,
      numericId: Date.now(),
      name: cleanFileName,
      size: fileSize,
      sizeFormatted: sizeFormatted || (fileSize ? formatBytes(fileSize) : 'Tamanho Desconhecido'),
      downloadUrl: cleanUrl,
      directUrl: cleanUrl,
      folderName: '1Fichier',
      relativePath: cleanFileName,
      isHttpDirect: true,
      isAvulso: true,
      isSingleFile: true,
      service: '1fichier',
      url: cleanUrl
    }];
  } catch (err) {
    console.warn(`[1Fichier Scanner] Erro ao escanear link único:`, err.message);
    return null;
  }
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
      folderName: 'Sites Genéricos',
      relativePath: fileName,
      service: 'generic'
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
      const setCookies = res.headers ? (res.headers['set-cookie'] || []) : [];
      const cookieHeader = Array.isArray(setCookies) ? setCookies.map(c => c.split(';')[0]).join('; ') : '';

      const megaUpDlMatch = body.match(/href=['"](https?:\/\/download\.megaup\.net\/\?url=[^'"]+)['"]/i) || 
                            body.match(/(https?:\/\/download\.megaup\.net\/\?url=[^\s"'<>]+)/i);

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
        megaUpName = megaUpTitleMatch ? megaUpTitleMatch[1].trim() : 'arquivo.rar';
      }

      const directDlUrl = megaUpDlMatch ? megaUpDlMatch[1] : urlStr;
      console.log(`[MegaUp Engine] Arquivo detectado: "${megaUpName}" (${megaUpSizeFormatted || (megaUpSize ? formatBytes(megaUpSize) : 'Tamanho dinâmico')})`);
      return [{
        id: `megaup_${Buffer.from(urlStr).toString('hex').slice(0, 16)}`,
        name: megaUpName,
        size: megaUpSize,
        sizeFormatted: megaUpSizeFormatted || (megaUpSize ? formatBytes(megaUpSize) : 'Calculando...'),
        downloadUrl: directDlUrl,
        directUrl: directDlUrl,
        folderName: 'MegaUp',
        relativePath: megaUpName,
        service: 'megaup',
        isHttpDirect: true,
        headers: {
          'Referer': urlStr,
          'Cookie': cookieHeader,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        }
      }];
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
          folderName: 'Sites Genéricos',
          relativePath: name,
          service: 'generic'
        });
      });
      return results;
    }

    // D. FALLBACK DE NOME POR TÍTULO DA PÁGINA
    const titleMatch = body.match(/<title>(.*?)<\/title>/i);
    let titleName = titleMatch ? titleMatch[1].replace(/[-_] (turbo\.cr|megaup|vik1ngfile|1fichier|datanodes|filekeeper).*/i, '').trim() : '';

    const isGenericTitle = !titleName || 
      /^(1fichier|datanodes|filekeeper|megaup|turbo|bunkr|gofile|pixeldrain|mediafire|google drive|cloud storage|free file|download|home|index|login|register|error|404)/i.test(titleName) ||
      titleName.toLowerCase().includes('cloud storage') ||
      titleName.toLowerCase().includes('file upload');

    if (titleName && !isGenericTitle) {
      return [{
        id: `scraper_page_${Buffer.from(urlStr).toString('hex').slice(0, 16)}`,
        name: titleName,
        size: 0,
        downloadUrl: urlStr,
        directUrl: urlStr,
        folderName: 'Sites Genéricos',
        relativePath: titleName,
        service: 'generic'
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
  const cleanUrl = urlStr.split('#')[0].trim();

  // 1. Verifica se é um álbum/lista (/l/{id})
  const listMatch = cleanUrl.match(/pixeldrain\.com\/l\/([a-zA-Z0-9_-]+)/i);
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
  const fileMatch = cleanUrl.match(/pixeldrain\.com\/u\/([a-zA-Z0-9_-]+)/i) || cleanUrl.match(/pixeldrain\.com\/api\/file\/([a-zA-Z0-9_-]+)/i);
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
      folderName: null,
      relativePath: fileName,
      isHttpDirect: true,
      isAvulso: true,
      isSingleFile: true,
      service: 'pixeldrain'
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

  // 0.0 1Fichier Parser (/dir/ ou arquivo individual)
  if (urlStr.includes('1fichier.com')) {
    if (urlStr.includes('1fichier.com/dir/')) {
      try {
        const oneFiles = await scan1FichierDirectory(urlStr);
        if (oneFiles && oneFiles.length > 0) return oneFiles;
      } catch (e) {
        console.log('[Generic Scanner] scan1FichierDirectory falhou:', e.message);
      }
    } else {
      try {
        const oneFile = await scan1FichierSingleFile(urlStr);
        if (oneFile && oneFile.length > 0) return oneFile;
      } catch (e) {
        console.log('[Generic Scanner] scan1FichierSingleFile falhou:', e.message);
      }
    }
  }

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
      folderName: 'Sites Genéricos',
      relativePath: cleanFileName,
      isHttpDirect: true,
      isAvulso: true,
      isSingleFile: true,
      service: 'generic',
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
  scanSmartHtmlScraper,
  scan1FichierDirectory,
  scan1FichierSingleFile
};

