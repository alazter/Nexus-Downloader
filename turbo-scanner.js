const https = require('https');
const path = require('path');

function isTurboUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return false;
  return /turbo\.cr/i.test(urlStr);
}

function getFileType(fileName) {
  if (!fileName) return 'other';
  const ext = path.extname(fileName).toLowerCase();
  if (['.mp4', '.mkv', '.avi', '.mov', '.webm', '.flv', '.wmv', '.m4v'].includes(ext)) return 'video';
  if (['.mp3', '.flac', '.wav', '.aac', '.ogg', '.m4a'].includes(ext)) return 'audio';
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'].includes(ext)) return 'image';
  if (['.zip', '.rar', '.7z', '.tar', '.gz', '.iso'].includes(ext)) return 'archive';
  if (['.pdf', '.txt', '.doc', '.docx', '.epub'].includes(ext)) return 'document';
  return 'other';
}

function httpGet(urlStr) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/html, */*'
      }
    };
    https.get(urlStr, options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpGet(res.headers.location).then(resolve).catch(reject);
      }
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve(body));
    }).on('error', reject);
  });
}

async function resolveTurboDirectUrl(fileId) {
  if (!fileId) return null;
  try {
    const signUrl = `https://turbo.cr/api/sign?v=${fileId}`;
    const jsonStr = await httpGet(signUrl);
    const data = JSON.parse(jsonStr);
    if (data && data.success && data.url) {
      return {
        directUrl: data.url,
        originalFilename: data.original_filename || data.filename
      };
    }
  } catch (e) {
    console.warn(`[turbo-scanner] Failed to resolve direct URL for ${fileId}:`, e.message);
  }
  return null;
}

async function scanTurboLink(linkUrl) {
  if (!isTurboUrl(linkUrl)) return [];

  // 1. Link de Álbum / Pasta: turbo.cr/a/{albumId}
  if (linkUrl.includes('/a/')) {
    const html = await httpGet(linkUrl);

    // Extrai título do álbum
    let albumTitle = 'Álbum Turbo.cr';
    const titleMatch = html.match(/<h1[^>]*class="[^"]*text-2xl[^"]*"[^>]*>([^<]+)<\/h1>/i) || html.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      albumTitle = titleMatch[1].replace(/- turbo\.cr$/i, '').trim();
    }

    // Extrai todas as linhas de arquivo da tabela: <tr ... class="file-row" data-id="..." data-name="..." data-size="...">
    const rowMatches = html.match(/<tr[^>]*class="[^"]*file-row[^"]*"[^>]*>/gi);
    if (!rowMatches || rowMatches.length === 0) {
      throw new Error('Nenhum arquivo encontrado neste álbum do Turbo.cr.');
    }

    const scannedItems = [];
    for (const rowHtml of rowMatches) {
      const idMatch = rowHtml.match(/data-id="([^"]+)"/i);
      const nameMatch = rowHtml.match(/data-name="([^"]+)"/i);
      const sizeMatch = rowHtml.match(/data-size="([^"]+)"/i);

      if (idMatch && idMatch[1]) {
        const fileId = idMatch[1];
        const fileName = nameMatch ? nameMatch[1] : `Video_${fileId}.mp4`;
        const fileSize = sizeMatch ? parseInt(sizeMatch[1], 10) || 0 : 0;

        try {
          const resolved = await resolveTurboDirectUrl(fileId);
          const directUrl = resolved ? resolved.directUrl : `https://turbo.cr/d/${fileId}`;
          const finalName = resolved && resolved.originalFilename ? resolved.originalFilename : fileName;

          scannedItems.push({
            id: `turbo_${fileId}`,
            turboFileId: fileId,
            name: finalName,
            size: fileSize,
            url: directUrl,
            service: 'Turbo.cr',
            fileType: getFileType(finalName),
            folderName: albumTitle
          });
        } catch (e) {
          scannedItems.push({
            id: `turbo_${fileId}`,
            turboFileId: fileId,
            name: fileName,
            size: fileSize,
            url: `https://turbo.cr/d/${fileId}`,
            service: 'Turbo.cr',
            fileType: getFileType(fileName),
            folderName: albumTitle
          });
        }
      }
    }

    return scannedItems;
  }

  // 2. Link de Vídeo / Download Único: turbo.cr/v/{fileId} ou /d/{fileId}
  const fileIdMatch = linkUrl.match(/turbo\.cr\/(?:v|d)\/([a-zA-Z0-9_-]+)/i);
  if (fileIdMatch && fileIdMatch[1]) {
    const fileId = fileIdMatch[1];
    const resolved = await resolveTurboDirectUrl(fileId);

    const fileName = resolved && resolved.originalFilename ? resolved.originalFilename : `Video_${fileId}.mp4`;
    const directUrl = resolved ? resolved.directUrl : linkUrl;

    return [{
      id: `turbo_${fileId}`,
      turboFileId: fileId,
      name: fileName,
      size: 0,
      url: directUrl,
      service: 'Turbo.cr',
      fileType: getFileType(fileName),
      folderName: 'Turbo.cr Package'
    }];
  }

  return [];
}

module.exports = {
  isTurboUrl,
  scanTurboLink,
  resolveTurboDirectUrl
};
