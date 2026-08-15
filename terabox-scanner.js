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
 * Utilitário HTTP GET resiliente com suporte a redirecionamentos, cookies e timeouts
 */
function fetchWithRedirects(urlStr, options = {}, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) {
      return reject(new Error('Muitos redirecionamentos ao acessar o TeraBox.'));
    }

    let u;
    try {
      u = new URL(urlStr);
    } catch (e) {
      return reject(new Error('URL do TeraBox malformada: ' + urlStr));
    }

    const transport = u.protocol === 'https:' ? https : http;

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      'Accept': options.json ? 'application/json, text/plain, */*' : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9,pt-BR;q=0.8',
      'Cache-Control': 'no-cache',
      'Referer': options.referer || 'https://www.terabox.com/',
      ...(options.headers || {})
    };

    if (options.cookie) {
      headers['Cookie'] = options.cookie;
    }

    const req = transport.get(urlStr, {
      rejectUnauthorized: false, // Evita falhas de SSL por antivírus/proxy no Windows
      headers: headers,
      timeout: 25000
    }, res => {
      // Captura cookies retornados
      const setCookies = res.headers['set-cookie'] || [];
      const cookieHeader = setCookies.map(c => c.split(';')[0]).join('; ');

      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (redirectUrl.startsWith('/')) {
          redirectUrl = u.origin + redirectUrl;
        }
        const nextCookie = [options.cookie, cookieHeader].filter(Boolean).join('; ');
        return resolve(fetchWithRedirects(redirectUrl, { ...options, cookie: nextCookie }, maxRedirects - 1));
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`Servidor TeraBox retornou HTTP ${res.statusCode}`));
      }

      let d = '';
      res.on('data', chunk => d += chunk);
      res.on('end', () => {
        const finalCookie = [options.cookie, cookieHeader].filter(Boolean).join('; ');
        if (options.json) {
          try {
            const parsed = JSON.parse(d);
            resolve({ data: parsed, cookies: finalCookie, rawHtml: d });
          } catch (e) {
            reject(new Error('Resposta inválida (não JSON) do TeraBox: ' + d.slice(0, 100)));
          }
        } else {
          resolve({ rawHtml: d, cookies: finalCookie });
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Tempo de conexão esgotado ao acessar o TeraBox (Timeout 25s).'));
    });

    req.on('error', (err) => {
      reject(new Error('Falha de rede com TeraBox: ' + err.message));
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
  let surl = '';
  const u = urlStr.trim();
  
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

/**
 * Varre recursivamente arquivos e pastas do TeraBox
 */
async function scanTeraBoxFolder(surl, jsToken, sessionCookie, dirPath = '', folderName = 'TeraBox_Downloads') {
  let files = [];

  let listUrl = `https://www.terabox.com/share/list?app_id=250528&shorturl=${surl}&root=1`;
  if (jsToken) {
    listUrl += `&jsToken=${encodeURIComponent(jsToken)}`;
  }
  if (dirPath) {
    listUrl += `&dir=${encodeURIComponent(dirPath)}`;
  }

  const response = await fetchWithRedirects(listUrl, { json: true, cookie: sessionCookie, referer: `https://www.terabox.com/main?surl=${surl}` });
  const data = response.data;

  if (data && data.errno === 0 && data.list && Array.isArray(data.list)) {
    for (const item of data.list) {
      const isDir = item.isdir === 1 || item.isdir === '1';
      const sizeBytes = parseInt(item.size, 10) || 0;
      const itemName = item.server_filename || item.filename || 'arquivo_terabox';
      const relativePath = dirPath ? folderName + '/' + sanitizeFolderName(dirPath.replace(/^\//, '')) + '/' + itemName : folderName + '/' + itemName;

      if (isDir) {
        // Varre subpasta recursivamente
        const subFiles = await scanTeraBoxFolder(surl, jsToken, response.cookies || sessionCookie, item.path, folderName);
        files = files.concat(subFiles);
      } else {
        const fsId = item.fs_id || 'tb_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        const directDlink = item.dlink || '';

        files.push({
          id: 'terabox_' + fsId,
          fileId: 'tb_' + fsId,
          numericId: fsId,
          name: itemName,
          size: sizeBytes,
          sizeFormatted: formatBytes(sizeBytes),
          relativePath: relativePath,
          folderName: folderName,
          isHttpDirect: true,
          teraboxUrl: `https://www.terabox.com/main?surl=${surl}`,
          teraboxDlink: directDlink,
          teraboxCookie: response.cookies || sessionCookie,
          teraboxShareId: data.shareid || null,
          teraboxUk: data.uk || null,
          teraboxSign: data.sign || null,
          teraboxTimestamp: data.timestamp || null
        });
      }
    }
  } else if (data && data.errno !== 0) {
    throw new Error(`TeraBox API erro ${data.errno}: ${data.errmsg || 'Link expirado ou protegido por senha'}`);
  }

  return files;
}

/**
 * Função principal de escaneamento de links do TeraBox
 */
async function scanTeraBoxLink(urlStr) {
  console.log('[TeraBox Scanner] Iniciando escaneamento para:', urlStr);

  const surl = extractSurl(urlStr);
  if (!surl) {
    throw new Error('Não foi possível identificar a chave do link do TeraBox (surl).');
  }

  const initialUrl = `https://www.terabox.com/main?surl=${surl}`;
  let sessionCookie = '';
  let jsToken = '';

  try {
    const initRes = await fetchWithRedirects(initialUrl, { json: false });
    sessionCookie = initRes.cookies;

    // Tenta extrair o jsToken do HTML
    const tokenMatch = initRes.rawHtml.match(/jsToken\s*=\s*["']([^"']+)["']/i) ||
                       initRes.rawHtml.match(/"jsToken"\s*:\s*["']([^"']+)["']/i);
    if (tokenMatch) {
      jsToken = tokenMatch[1];
    }
  } catch (e) {
    console.warn('[TeraBox Scanner] Aviso ao buscar página inicial do TeraBox:', e.message);
  }

  const folderName = 'TeraBox_Downloads';
  const files = await scanTeraBoxFolder(surl, jsToken, sessionCookie, '', folderName);

  if (files.length === 0) {
    throw new Error('Nenhum arquivo encontrado no link do TeraBox.');
  }

  console.log(`[TeraBox Scanner] Sucesso! ${files.length} arquivo(s) encontrado(s).`);
  return files;
}

/**
 * Resolve o link direto de download de alta velocidade do TeraBox
 */
async function resolveTeraBoxDirectUrl(fsId, teraboxUrl, dlink, cookie) {
  console.log('[TeraBox Resolver] Resolvendo link direto de alta velocidade para fs_id:', fsId);

  // Se o dlink já estiver disponível no escaneamento e for válido
  if (dlink && typeof dlink === 'string' && dlink.startsWith('http')) {
    return {
      directUrl: dlink,
      referer: 'https://www.terabox.com/',
      cookie: cookie || ''
    };
  }

  // Se precisar consultar a API de download direto
  const surl = extractSurl(teraboxUrl || '');
  if (surl) {
    const apiRes = await fetchWithRedirects(`https://www.terabox.com/share/list?app_id=250528&shorturl=${surl}&root=1`, {
      json: true,
      cookie: cookie || '',
      referer: 'https://www.terabox.com/'
    });

    if (apiRes.data && apiRes.data.list && Array.isArray(apiRes.data.list)) {
      const match = apiRes.data.list.find(i => String(i.fs_id) === String(fsId));
      if (match && match.dlink) {
        return {
          directUrl: match.dlink,
          referer: 'https://www.terabox.com/',
          cookie: apiRes.cookies || cookie || ''
        };
      }
    }
  }

  throw new Error('Não foi possível obter o link direto de download do TeraBox.');
}

module.exports = {
  isTeraBoxUrl,
  scanTeraBoxLink,
  resolveTeraBoxDirectUrl
};
