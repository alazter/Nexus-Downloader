const https = require('https');
const path = require('path');

function isDrimeUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return false;
  return /drime\.cloud/i.test(urlStr);
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
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
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

async function scanDrimeLink(linkUrl) {
  if (!isDrimeUrl(linkUrl)) return [];

  const html = await httpGet(linkUrl);

  const match = html.match(/window\.bootstrapData\s*=\s*"([^"]+)"/);
  if (!match || !match[1]) {
    throw new Error('Não foi possível identificar a lista de arquivos do Drime Cloud nesta página.');
  }

  const decodedStr = Buffer.from(match[1], 'base64').toString('utf8');
  const parsedData = JSON.parse(decodedStr);

  const linkPreload = parsedData.share_link_preload;
  if (!linkPreload || !linkPreload.payload) {
    throw new Error('Link do Drime Cloud inválido ou expirado.');
  }

  const payload = linkPreload.payload;
  const hash = linkPreload.hash || (payload.link && payload.link.hash) || 'drime_hash';
  const folderName = (payload.link && payload.link.entry && payload.link.entry.name) ? payload.link.entry.name : 'Drime Cloud Package';

  // 1. Se for uma PASTA COMPARTILHADA com arquivos dentro (folderChildren.data)
  if (payload.folderChildren && Array.isArray(payload.folderChildren.data) && payload.folderChildren.data.length > 0) {
    return payload.folderChildren.data.map(child => {
      const childName = child.name || child.file_name || `Arquivo_${child.id}`;
      const childSize = child.file_size || child.size || 0;
      const downloadUrl = `https://app.drime.cloud/api/v1/shareable-links/${hash}/download?entry_id=${child.id}`;

      return {
        id: `drime_${hash}_${child.id}`,
        name: childName,
        size: childSize,
        url: downloadUrl,
        service: 'Drime Cloud',
        fileType: getFileType(childName),
        folderName: folderName,
        relativePath: `${folderName}/${childName}`
      };
    });
  }

  // 2. Se for um ARQUIVO ÚNICO
  const linkObj = payload.link || {};
  const entry = linkObj.entry || linkObj;
  const fileName = entry.name || entry.file_name || 'Arquivo_Drime';
  const fileSize = entry.file_size || entry.size || 0;
  const directDownloadUrl = `https://app.drime.cloud/api/v1/shareable-links/${hash}/download`;

  return [{
    id: `drime_${hash}_${entry.id || Date.now()}`,
    name: fileName,
    size: fileSize,
    url: directDownloadUrl,
    service: 'Drime Cloud',
    fileType: getFileType(fileName),
    folderName: folderName
  }];
}

module.exports = {
  isDrimeUrl,
  scanDrimeLink
};
