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

function resolveVikingFileDirectUrl(pageUrl) {
  return new Promise((resolve, reject) => {
    try {
      const parsed = new URL(pageUrl);
      const client = parsed.protocol === 'https:' ? https : http;
      
      const reqOpts = {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      };

      client.get(pageUrl, reqOpts, (res) => {
        let html = '';
        res.on('data', chunk => html += chunk);
        res.on('end', async () => {
          const nameMatch = html.match(/<h2[^>]*id=["']filename["'][^>]*>([^<]+)<\/h2>/i) || html.match(/<title>([^<]+)<\/title>/i);
          const sizeMatch = html.match(/<p[^>]*id=["']size["'][^>]*>([^<]+)<\/p>/i);

          const fileName = nameMatch ? nameMatch[1].trim() : 'Arquivo_Vik1ngFile';
          const sizeText = sizeMatch ? sizeMatch[1].trim() : '';
          const sizeInBytes = parseFileSizeText(sizeText);

          // Tenta requisitar POST para receber o JSON do link
          try {
            const postRes = await new Promise((pRes) => {
              const pReqOpts = {
                method: 'POST',
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                  'Content-Type': 'application/x-www-form-urlencoded',
                  'X-Requested-With': 'XMLHttpRequest',
                  'Referer': pageUrl
                }
              };
              const pReq = client.request(pageUrl, pReqOpts, (r) => {
                let body = '';
                r.on('data', c => body += c);
                r.on('end', () => pRes(body));
              });
              pReq.on('error', () => pRes(''));
              pReq.write('');
              pReq.end();
            });

            if (postRes && postRes.includes('{')) {
              try {
                const data = JSON.parse(postRes);
                if (data.link) {
                  return resolve({
                    fileName: data.name || fileName,
                    size: data.size || sizeInBytes,
                    directUrl: data.link
                  });
                }
              } catch (e) {}
            }
          } catch (e) {}

          // Fallback para link de fast-download na página
          const fastMatch = html.match(/href=["'](\/fast-download\/[^"']+)["']/i);
          if (fastMatch) {
            const fullFastUrl = `${parsed.protocol}//${parsed.host}${fastMatch[1]}`;
            return resolve({
              fileName,
              size: sizeInBytes,
              directUrl: fullFastUrl
            });
          }

          // Se não encontrou link direto no HTML, usa a própria página
          resolve({
            fileName,
            size: sizeInBytes,
            directUrl: pageUrl
          });
        });
      }).on('error', err => reject(err));
    } catch (err) {
      reject(err);
    }
  });
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
