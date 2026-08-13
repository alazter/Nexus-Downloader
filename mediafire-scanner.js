const https = require('https');
const http = require('http');

/**
 * Verifica se a URL é do MediaFire
 */
function isMediaFireUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return false;
  return urlStr.toLowerCase().includes('mediafire.com');
}

/**
 * Utilitário HTTP GET resiliente com suporte a redirecionamentos (301/302/307/308), SSL proxy bypass e timeouts
 */
function fetchWithRedirects(urlStr, options = {}, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) {
      return reject(new Error('Muitos redirecionamentos ao acessar o MediaFire.'));
    }

    let u;
    try {
      u = new URL(urlStr);
    } catch (e) {
      return reject(new Error('URL do MediaFire malformada: ' + urlStr));
    }

    const transport = u.protocol === 'https:' ? https : http;

    const req = transport.get(urlStr, {
      rejectUnauthorized: false, // Previne falhas de SSL por Antivírus ou Proxy no Windows
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
        return reject(new Error(`Servidor MediaFire retornou HTTP ${res.statusCode}`));
      }

      let d = '';
      res.on('data', chunk => d += chunk);
      res.on('end', () => {
        if (options.json) {
          try {
            resolve(JSON.parse(d));
          } catch (e) {
            reject(new Error('Resposta inválida (não JSON) do MediaFire: ' + d.slice(0, 100)));
          }
        } else {
          resolve(d);
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Tempo de conexão esgotado ao acessar o MediaFire (Timeout 20s).'));
    });

    req.on('error', (err) => {
      reject(new Error('Falha de rede com MediaFire: ' + err.message));
    });
  });
}

function fetchJson(url) {
  return fetchWithRedirects(url, { json: true });
}

function fetchHtml(url) {
  return fetchWithRedirects(url, { json: false });
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
  if (!name) return 'MediaFire_Downloads';
  return name.replace(/[\\/:*?"<>|]/g, '_').trim();
}

async function scanMediaFireFolder(folderKey, currentPath = '') {
  let files = [];

  let folderName = currentPath;
  if (!folderName) {
    try {
      const infoUrl = 'https://www.mediafire.com/api/1.4/folder/get_info.php?folder_key=' + folderKey + '&response_format=json';
      const infoData = await fetchJson(infoUrl);
      if (infoData && infoData.response && infoData.response.folder_info) {
        folderName = sanitizeFolderName(infoData.response.folder_info.name);
      }
    } catch (e) {
      folderName = 'MediaFire_Downloads';
    }
  }

  let chunk = 1;
  let moreChunks = true;

  while (moreChunks) {
    const filesUrl = 'https://www.mediafire.com/api/1.4/folder/get_content.php?folder_key=' + folderKey + '&content_type=files&chunk=' + chunk + '&response_format=json';
    const filesData = await fetchJson(filesUrl);

    if (filesData && filesData.response && filesData.response.folder_content && filesData.response.folder_content.files) {
      const itemList = filesData.response.folder_content.files;
      itemList.forEach(item => {
        const sizeBytes = parseInt(item.size, 10) || 0;
        const pageUrl = item.links && item.links.normal_download ? item.links.normal_download : 'https://www.mediafire.com/file/' + item.quickkey + '/' + encodeURIComponent(item.filename) + '/file';
        const relativePath = folderName ? folderName + '/' + item.filename : item.filename;

        files.push({
          id: 'mediafire_' + item.quickkey,
          fileId: 'mf_' + item.quickkey,
          numericId: item.quickkey,
          name: item.filename,
          size: sizeBytes,
          sizeFormatted: formatBytes(sizeBytes),
          relativePath: relativePath,
          folderName: folderName,
          isHttpDirect: true,
          mediafireUrl: pageUrl
        });
      });

      moreChunks = filesData.response.folder_content.more_chunks === 'yes';
      chunk++;
    } else {
      moreChunks = false;
    }
  }

  try {
    const subUrl = 'https://www.mediafire.com/api/1.4/folder/get_content.php?folder_key=' + folderKey + '&content_type=folders&response_format=json';
    const subData = await fetchJson(subUrl);

    if (subData && subData.response && subData.response.folder_content && subData.response.folder_content.folders) {
      const subFolders = subData.response.folder_content.folders;
      for (const sub of subFolders) {
        const subPath = folderName ? folderName + '/' + sanitizeFolderName(sub.name) : sanitizeFolderName(sub.name);
        const subFiles = await scanMediaFireFolder(sub.folderkey, subPath);
        files = files.concat(subFiles);
      }
    }
  } catch (e) {
    console.warn('[MediaFire Scanner] Erro ao buscar subpastas:', e.message);
  }

  return files;
}

async function scanMediaFireFile(fileUrl) {
  const match = fileUrl.match(/\/file\/([a-zA-Z0-9]+)/i);
  const quickkey = match ? match[1] : 'file_' + Date.now();

  const html = await fetchHtml(fileUrl);
  
  let filename = 'arquivo_mediafire';
  const nameMatch = html.match(/class="filename">([^<]+)<\/div>/i) ||
                    html.match(/<meta property="og:title" content="([^"]+)"/i) ||
                    html.match(/<div class="dl-btn-label"[^>]*title="([^"]+)"/i);
  if (nameMatch) {
    filename = nameMatch[1].trim();
  }

  let sizeBytes = 0;
  const sizeMatch = html.match(/<span>\(([^)]+)\)<\/span>/i) || html.match(/id="downloadButton"[^>]*>\s*Download\s*\(([^)]+)\)/i);
  if (sizeMatch) {
    const sizeStr = sizeMatch[1].trim();
    if (sizeStr.includes('MB')) sizeBytes = parseFloat(sizeStr) * 1024 * 1024;
    else if (sizeStr.includes('GB')) sizeBytes = parseFloat(sizeStr) * 1024 * 1024 * 1024;
    else if (sizeStr.includes('KB')) sizeBytes = parseFloat(sizeStr) * 1024;
  }

  return [{
    id: 'mediafire_' + quickkey,
    fileId: 'mf_' + quickkey,
    numericId: quickkey,
    name: filename,
    size: Math.round(sizeBytes),
    sizeFormatted: formatBytes(Math.round(sizeBytes)),
    relativePath: 'MediaFire_Downloads/' + filename,
    folderName: 'MediaFire_Downloads',
    isHttpDirect: true,
    mediafireUrl: fileUrl
  }];
}

async function scanMediaFireLink(urlStr) {
  console.log('[MediaFire Scanner] Escaneando URL:', urlStr);

  const cleanUrl = urlStr.trim();
  if (cleanUrl.includes('/folder/')) {
    const match = cleanUrl.match(/\/folder\/([a-zA-Z0-9]+)/i);
    if (!match) {
      throw new Error('Link de pasta do MediaFire inválido.');
    }
    const folderKey = match[1];
    return await scanMediaFireFolder(folderKey);
  } else if (cleanUrl.includes('/file/')) {
    return await scanMediaFireFile(cleanUrl);
  } else {
    throw new Error('Formato de link do MediaFire não reconhecido.');
  }
}

async function resolveMediaFireDirectUrl(quickkey, fileUrl) {
  const targetUrl = fileUrl || 'https://www.mediafire.com/file/' + quickkey + '/file';
  console.log('[MediaFire Resolver] Resolvendo link direto para:', targetUrl);

  const html = await fetchHtml(targetUrl);

  const match = html.match(/href="(https?:\/\/download\d*?\.mediafire\.com\/[^"]+)"/i) ||
                html.match(/aria-label="Download file"\s+href="(https?:\/\/[^"]+)"/i) ||
                html.match(/id="downloadButton"\s+href="(https?:\/\/[^"]+)"/i);

  if (!match) {
    throw new Error('Não foi possível extrair o link direto de download do MediaFire.');
  }

  return {
    directUrl: match[1],
    referer: targetUrl
  };
}

module.exports = {
  isMediaFireUrl,
  scanMediaFireLink,
  resolveMediaFireDirectUrl
};
