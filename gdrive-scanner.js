const https = require('https');
const http = require('http');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

function decodeHtmlEntities(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function fixMojibakeFilename(raw) {
  if (!raw || typeof raw !== 'string') return '';
  if (/[ÃÂ][^\s]/.test(raw)) {
    try {
      const converted = Buffer.from(raw, 'latin1').toString('utf8');
      if (converted && !converted.includes('\ufffd')) {
        return converted;
      }
    } catch (e) {}
  }
  return raw;
}

function parseFilenameFromContentDisposition(cd) {
  if (!cd || typeof cd !== 'string') return '';
  const utfMatch = cd.match(/filename\*\s*=\s*(?:UTF-8''|utf-8'')([^;\r\n]+)/i);
  if (utfMatch && utfMatch[1]) {
    try {
      return decodeURIComponent(utfMatch[1].trim().replace(/^["']|["']$/g, ''));
    } catch (e) {}
  }
  const stdMatch = cd.match(/filename\s*=\s*"([^"]+)"/i) || cd.match(/filename\s*=\s*([^;\r\n]+)/i);
  if (stdMatch && stdMatch[1]) {
    return fixMojibakeFilename(stdMatch[1].trim().replace(/^["']|["']$/g, ''));
  }
  return '';
}

function isGoogleDriveUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return false;
  const u = urlStr.toLowerCase();
  return u.includes('drive.google.com') || u.includes('drive.usercontent.google.com') || u.includes('docs.google.com');
}

function extractDriveId(link) {
  if (!link || typeof link !== 'string') return null;

  let resourceKey = null;
  const rkMatch = link.match(/[?&]resourcekey=([a-zA-Z0-9_-]+)/i);
  if (rkMatch && rkMatch[1]) {
    resourceKey = rkMatch[1];
  }

  // Regex para ID de Pasta (/drive/u/0/folders/..., /drive/folders/..., /drive/mobile/folders/...)
  const folderMatch = link.match(/\/folders\/([a-zA-Z0-9_-]{10,})/);
  if (folderMatch) {
    return { id: folderMatch[1], isFolder: true, resourceKey };
  }

  // Regex para embeddedfolderview?id=...
  if (link.includes('embeddedfolderview')) {
    const embMatch = link.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
    if (embMatch) {
      return { id: embMatch[1], isFolder: true, resourceKey };
    }
  }

  // Regex para ID de Arquivo (/file/d/..., /d/...)
  const fileMatch = link.match(/\/(?:file\/d|document\/d|spreadsheets\/d|presentation\/d|d)\/([a-zA-Z0-9_-]{10,})/);
  if (fileMatch) {
    return { id: fileMatch[1], isFolder: false, resourceKey };
  }

  // Query param ?id=
  const idQueryMatch = link.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (idQueryMatch) {
    const isFolder = link.toLowerCase().includes('folder');
    return { id: idQueryMatch[1], isFolder, resourceKey };
  }

  // ID cru (apenas caracteres validos de ID Drive)
  const rawIdMatch = link.trim().match(/^([a-zA-Z0-9_-]{25,})$/);
  if (rawIdMatch) {
    return { id: rawIdMatch[1], isFolder: false, resourceKey };
  }

  return null;
}

function buildPublicDownloadUrl(fileId, resourceKey = null, docType = null) {
  if (docType === 'document') {
    return `https://docs.google.com/document/d/${fileId}/export?format=docx`;
  }
  if (docType === 'spreadsheets') {
    return `https://docs.google.com/spreadsheets/d/${fileId}/export?format=xlsx`;
  }
  if (docType === 'presentation') {
    return `https://docs.google.com/presentation/d/${fileId}/export?format=pptx`;
  }
  let url = `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download&confirm=t`;
  if (resourceKey) {
    url += `&resourcekey=${encodeURIComponent(resourceKey)}`;
  }
  return url;
}

function fetchHttpText(targetUrl, redirectCount = 0, cookies = []) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 6) {
      return reject(new Error('Muitos redirecionamentos no Google Drive.'));
    }
    const parsed = new URL(targetUrl);
    const transport = parsed.protocol === 'https:' ? https : http;
    const headers = {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
    };
    if (cookies.length > 0) {
      headers['Cookie'] = cookies.join('; ');
    }

    const req = transport.get(targetUrl, { headers, rejectUnauthorized: false }, (res) => {
      const setCookies = res.headers['set-cookie'];
      const nextCookies = [...cookies];
      if (Array.isArray(setCookies)) {
        setCookies.forEach(c => {
          const kv = c.split(';')[0];
          if (kv) nextCookies.push(kv);
        });
      }

      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let nextUrl = res.headers.location;
        if (nextUrl.startsWith('/')) {
          nextUrl = `${parsed.protocol}//${parsed.host}${nextUrl}`;
        }
        res.resume();
        if (nextUrl.includes('accounts.google.com')) {
          return resolve({
            statusCode: 401,
            finalUrl: nextUrl,
            headers: res.headers,
            cookies: nextCookies,
            body: '',
            requiresAuth: true
          });
        }
        return fetchHttpText(nextUrl, redirectCount + 1, nextCookies).then(resolve).catch(reject);
      }

      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          finalUrl: targetUrl,
          headers: res.headers,
          cookies: nextCookies,
          body: Buffer.concat(chunks).toString('utf8'),
          requiresAuth: false
        });
      });
    });

    req.setTimeout(20000, () => {
      req.destroy(new Error('Tempo limite excedido ao acessar o Google Drive.'));
    });
    req.on('error', reject);
  });
}

function guessMimeFromIconUrl(iconUrl) {
  if (!iconUrl || typeof iconUrl !== 'string') return '';
  const m = iconUrl.match(/\/type\/([^"'?\s]+)/i);
  return m && m[1] ? decodeURIComponent(m[1]) : '';
}

function sanitizeSegment(seg) {
  return String(seg || 'Pasta')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim() || 'Pasta';
}

function parseEmbeddedFolderHtml(html) {
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const folderTitle = sanitizeSegment(decodeHtmlEntities(titleMatch ? titleMatch[1] : 'Pasta_Google_Drive'));

  const entries = [];
  const entryRegex = /<div\s+class="flip-entry"\s+id="entry-([^"]+)"[\s\S]*?<a\s+href="([^"]+)"[\s\S]*?<div\s+class="flip-entry-title">([\s\S]*?)<\/div>/gi;
  let match;

  while ((match = entryRegex.exec(html)) !== null) {
    const fullBlock = match[0];
    const id = match[1].trim();
    const href = decodeHtmlEntities(match[2].trim());
    const titleRaw = match[3].replace(/<[^>]+>/g, '');
    const name = sanitizeSegment(decodeHtmlEntities(titleRaw));
    const isFolder = href.includes('/folders/') || fullBlock.includes('aria-label="Folder"') || fullBlock.includes('drive-sprite-folder');

    let docType = null;
    if (!isFolder) {
      if (href.includes('docs.google.com/document/')) docType = 'document';
      else if (href.includes('docs.google.com/spreadsheets/')) docType = 'spreadsheets';
      else if (href.includes('docs.google.com/presentation/')) docType = 'presentation';
    }

    const imgMatch = fullBlock.match(/<img[^>]+src="([^"]+)"/i);
    const mimeType = guessMimeFromIconUrl(imgMatch ? imgMatch[1] : '');

    let rk = null;
    const rkM = href.match(/[?&]resourcekey=([a-zA-Z0-9_-]+)/i);
    if (rkM && rkM[1]) rk = rkM[1];

    entries.push({
      id,
      href,
      name,
      isFolder,
      docType,
      mimeType,
      resourceKey: rk
    });
  }

  return { folderTitle, entries };
}

async function scanPublicGoogleDriveFolder(folderId, resourceKey = null, concurrency = 12) {
  if (!folderId) throw new Error('ID de pasta do Google Drive inválido.');

  const queue = [{ id: folderId, pathParts: [], resourceKey }];
  const visitedFolders = new Set([folderId]);
  const files = [];
  let rootFailedAuth = false;
  let rootStatus = 200;

  while (queue.length > 0) {
    const batch = queue.splice(0, concurrency);
    await Promise.all(batch.map(async (node) => {
      let targetUrl = `https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(node.id)}`;
      const rkToUse = node.resourceKey || resourceKey;
      if (rkToUse) {
        targetUrl += `&resourcekey=${encodeURIComponent(rkToUse)}`;
      }

      const res = await fetchHttpText(targetUrl);
      if (node.pathParts.length === 0) {
        rootStatus = res.statusCode;
        if (res.requiresAuth || res.statusCode === 401 || res.statusCode === 403) {
          rootFailedAuth = true;
          return;
        }
        if (res.statusCode === 404) {
          throw new Error('Pasta do Google Drive não encontrada ou removida (HTTP 404).');
        }
      }

      if (res.statusCode !== 200 || !res.body) return;

      const { folderTitle, entries } = parseEmbeddedFolderHtml(res.body);
      const currentParts = node.pathParts.length === 0 ? [folderTitle] : node.pathParts;

      for (const entry of entries) {
        if (entry.isFolder) {
          if (!visitedFolders.has(entry.id)) {
            visitedFolders.add(entry.id);
            queue.push({
              id: entry.id,
              pathParts: [...currentParts, entry.name],
              resourceKey: entry.resourceKey || rkToUse
            });
          }
        } else {
          const entryRk = entry.resourceKey || rkToUse;
          const directUrl = buildPublicDownloadUrl(entry.id, entryRk, entry.docType);
          let finalName = entry.name;
          if (entry.docType === 'document' && !finalName.toLowerCase().endsWith('.docx')) finalName += '.docx';
          else if (entry.docType === 'spreadsheets' && !finalName.toLowerCase().endsWith('.xlsx')) finalName += '.xlsx';
          else if (entry.docType === 'presentation' && !finalName.toLowerCase().endsWith('.pptx')) finalName += '.pptx';

          const folderPath = currentParts.join('/');
          const relativePath = `${folderPath}/${finalName}`;

          files.push({
            id: `gdrive_${entry.id}`,
            fileId: entry.id,
            gdriveFileId: entry.id,
            resourceKey: entryRk || null,
            docType: entry.docType || null,
            name: finalName,
            size: 0,
            sizeFormatted: '',
            mimeType: entry.mimeType || 'application/octet-stream',
            relativePath,
            folderPath,
            folderName: currentParts[0] || folderTitle,
            preserveRelativePath: true,
            service: 'Google Drive',
            isHttpDirect: true,
            url: `https://drive.google.com/file/d/${entry.id}/view`,
            sourceUrl: `https://drive.google.com/drive/folders/${folderId}`,
            directUrl,
            downloadUrl: directUrl,
            referer: 'https://drive.google.com/'
          });
        }
      }
    }));
  }

  if (rootFailedAuth) {
    throw new Error('Esta pasta do Google Drive é privada ou exige login. Conecte sua conta Google nas configurações ou torne o link público.');
  }

  if (files.length === 0) {
    if (rootStatus >= 400) {
      throw new Error(`Não foi possível acessar a pasta do Google Drive (HTTP ${rootStatus}).`);
    }
    throw new Error('Nenhum arquivo encontrado nesta pasta do Google Drive.');
  }

  return files;
}

async function probePublicFileMeta(targetUrl, redirectCount = 0, cookies = []) {
  return new Promise((resolve) => {
    if (redirectCount > 6) return resolve(null);
    let parsed;
    try {
      parsed = new URL(targetUrl);
    } catch (e) {
      return resolve(null);
    }
    const transport = parsed.protocol === 'https:' ? https : http;
    const headers = {
      'User-Agent': USER_AGENT,
      'Referer': 'https://drive.google.com/',
      'Range': 'bytes=0-0'
    };
    if (cookies.length > 0) headers['Cookie'] = cookies.join('; ');

    const req = transport.get(targetUrl, { headers, rejectUnauthorized: false }, (res) => {
      const setCookies = res.headers['set-cookie'];
      const nextCookies = [...cookies];
      if (Array.isArray(setCookies)) {
        setCookies.forEach(c => {
          const kv = c.split(';')[0];
          if (kv) nextCookies.push(kv);
        });
      }

      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let nextUrl = res.headers.location;
        if (nextUrl.startsWith('/')) {
          nextUrl = `${parsed.protocol}//${parsed.host}${nextUrl}`;
        }
        res.resume();
        if (nextUrl.includes('accounts.google.com')) {
          return resolve({ requiresAuth: true, statusCode: 401 });
        }
        return probePublicFileMeta(nextUrl, redirectCount + 1, nextCookies).then(resolve);
      }

      const ct = (res.headers['content-type'] || '').toLowerCase();
      const cd = res.headers['content-disposition'] || '';

      if (ct.includes('text/html') && !cd.toLowerCase().includes('attachment')) {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            finalUrl: targetUrl,
            contentType: ct,
            contentDisposition: cd,
            cookies: nextCookies,
            isHtml: true,
            htmlBody: Buffer.concat(chunks).toString('utf8')
          });
        });
        return;
      }

      let realSize = 0;
      if (res.headers['content-range']) {
        const m = res.headers['content-range'].match(/\/(\d+)$/);
        if (m) realSize = parseInt(m[1], 10);
      }
      if (!realSize && res.headers['content-length'] && res.statusCode === 200) {
        realSize = parseInt(res.headers['content-length'], 10);
      }

      res.destroy();
      resolve({
        statusCode: res.statusCode,
        finalUrl: targetUrl,
        contentType: ct,
        contentDisposition: cd,
        size: realSize,
        cookies: nextCookies,
        isHtml: false
      });
    });

    req.setTimeout(15000, () => {
      try { req.destroy(); } catch (e) {}
      resolve(null);
    });
    req.on('error', () => resolve(null));
  });
}

function extractConfirmUrlFromHtml(html, baseUrl) {
  if (!html || typeof html !== 'string') return null;

  const formMatch = html.match(/<form[^>]+id=["']download-form["'][^>]*action=["']([^"']+)["'][^>]*>([\s\S]*?)<\/form>/i) ||
                    html.match(/<form[^>]+action=["']([^"']+)["'][^>]*id=["']download-form["'][^>]*>([\s\S]*?)<\/form>/i) ||
                    html.match(/<form[^>]+action=["']([^"']*download[^"']*)["'][^>]*>([\s\S]*?)<\/form>/i);

  if (formMatch) {
    let actionUrl = decodeHtmlEntities(formMatch[1]);
    if (actionUrl.startsWith('/')) {
      const b = new URL(baseUrl);
      actionUrl = `${b.protocol}//${b.host}${actionUrl}`;
    }
    const formBody = formMatch[2];
    const params = new URLSearchParams();
    const inputRegex = /<input[^>]+>/gi;
    let inp;
    while ((inp = inputRegex.exec(formBody)) !== null) {
      const tag = inp[0];
      const nameM = tag.match(/name=["']([^"']+)["']/i);
      const valM = tag.match(/value=["']([^"']*)["']/i);
      if (nameM && nameM[1]) {
        params.append(nameM[1], decodeHtmlEntities(valM ? valM[1] : ''));
      }
    }
    const sep = actionUrl.includes('?') ? '&' : '?';
    return `${actionUrl}${sep}${params.toString()}`;
  }

  return null;
}

async function resolveGoogleDriveDirectUrl(fileId, resourceKey = null, fallbackUrl = '') {
  const candidate = buildPublicDownloadUrl(fileId, resourceKey);
  const probe = await probePublicFileMeta(candidate);

  if (!probe) {
    return {
      directUrl: fallbackUrl || candidate,
      referer: 'https://drive.google.com/',
      cookieHeader: ''
    };
  }

  if (probe.requiresAuth || probe.statusCode === 401 || probe.statusCode === 403) {
    throw new Error('Arquivo do Google Drive privado ou com permissão restrita (HTTP ' + probe.statusCode + ').');
  }

  if (probe.isHtml && probe.htmlBody) {
    const lowerHtml = probe.htmlBody.toLowerCase();
    if (lowerHtml.includes('too many users have viewed or downloaded') || lowerHtml.includes('download quota exceeded') || lowerHtml.includes('cota de download excedida')) {
      const err = new Error('downloadQuotaExceeded: Cota de download pública deste arquivo no Google Drive foi excedida temporariamente.');
      err.isQuotaError = true;
      throw err;
    }

    const confirmedUrl = extractConfirmUrlFromHtml(probe.htmlBody, probe.finalUrl);
    if (confirmedUrl) {
      return {
        directUrl: confirmedUrl,
        referer: 'https://drive.google.com/',
        cookieHeader: (probe.cookies || []).join('; ')
      };
    }

    throw new Error('O Google Drive retornou uma página HTML ao tentar obter o arquivo.');
  }

  return {
    directUrl: probe.finalUrl || candidate,
    referer: 'https://drive.google.com/',
    cookieHeader: (probe.cookies || []).join('; '),
    size: probe.size || 0,
    fileName: parseFilenameFromContentDisposition(probe.contentDisposition)
  };
}

async function scanPublicGoogleDriveFile(fileId, resourceKey = null) {
  if (!fileId) throw new Error('ID de arquivo do Google Drive inválido.');

  const resolved = await resolveGoogleDriveDirectUrl(fileId, resourceKey);
  let fileName = resolved.fileName || '';

  if (!fileName) {
    try {
      const viewPage = await fetchHttpText(`https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`);
      if (viewPage && viewPage.body) {
        const titleM = viewPage.body.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i) ||
                       viewPage.body.match(/<title>([\s\S]*?)<\/title>/i);
        if (titleM && titleM[1]) {
          fileName = decodeHtmlEntities(titleM[1]).replace(/\s*-\s*Google Drive\s*$/i, '').trim();
        }
      }
    } catch (e) {}
  }

  fileName = sanitizeSegment(fileName || `arquivo_${fileId}`);

  return [{
    id: `gdrive_${fileId}`,
    fileId: fileId,
    gdriveFileId: fileId,
    resourceKey: resourceKey || null,
    name: fileName,
    size: resolved.size || 0,
    sizeFormatted: '',
    relativePath: fileName,
    folderName: null,
    isAvulso: true,
    isSingleFile: true,
    service: 'Google Drive',
    isHttpDirect: true,
    url: `https://drive.google.com/file/d/${fileId}/view`,
    sourceUrl: `https://drive.google.com/file/d/${fileId}/view`,
    directUrl: resolved.directUrl,
    downloadUrl: resolved.directUrl,
    referer: resolved.referer || 'https://drive.google.com/',
    cookieHeader: resolved.cookieHeader || ''
  }];
}

module.exports = {
  isGoogleDriveUrl,
  extractDriveId,
  buildPublicDownloadUrl,
  scanPublicGoogleDriveFolder,
  scanPublicGoogleDriveFile,
  resolveGoogleDriveDirectUrl
};
