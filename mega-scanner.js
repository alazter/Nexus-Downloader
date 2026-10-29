const https = require('https');
const crypto = require('crypto');
const path = require('path');

function isMegaUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return false;
  const lower = urlStr.toLowerCase();
  return lower.includes('mega.nz') || lower.includes('mega.co.nz') || lower.includes('mega.io');
}

function isMegaFolderUrl(urlStr) {
  if (!isMegaUrl(urlStr)) return false;
  return urlStr.includes('/folder/') || urlStr.includes('/#F!') || urlStr.includes('#F!');
}

function base64UrlDecode(str) {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return Buffer.from(b64, 'base64');
}

function base64UrlEncode(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function sanitizeFolderName(name) {
  if (!name) return 'Pasta_MEGA';
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'Pasta_MEGA';
}

function parseMegaFolderUrl(urlStr) {
  if (!urlStr) return null;
  // Formato moderno: https://mega.nz/folder/3BEUhYyL#N01wMLOxsmg8sdmb8tyzzw
  let match = urlStr.match(/\/folder\/([a-zA-Z0-9_-]+)#([a-zA-Z0-9_-]+)/i);
  if (match) {
    return { folderId: match[1], folderKey: match[2] };
  }
  // Formato legado: https://mega.nz/#F!3BEUhYyL!N01wMLOxsmg8sdmb8tyzzw
  match = urlStr.match(/#F!([a-zA-Z0-9_-]+)!([a-zA-Z0-9_-]+)/i);
  if (match) {
    return { folderId: match[1], folderKey: match[2] };
  }
  return null;
}

function decryptNodeAttrs(encryptedB64, keyBuffer) {
  try {
    const encBuffer = base64UrlDecode(encryptedB64);
    const decipher = crypto.createDecipheriv('aes-128-cbc', keyBuffer, Buffer.alloc(16, 0));
    decipher.setAutoPadding(false);
    const decrypted = Buffer.concat([decipher.update(encBuffer), decipher.final()]);
    const str = decrypted.toString('utf8');
    const start = str.indexOf('MEGA{');
    if (start !== -1) {
      const jsonStr = str.substring(start + 4);
      const end = jsonStr.lastIndexOf('}');
      if (end !== -1) {
        return JSON.parse(jsonStr.substring(0, end + 1));
      }
    }
  } catch (e) {}
  return null;
}

function queryMegaApi(payload, folderId = null) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);
    let apiUrl = `https://g.api.mega.co.nz/cs?id=${Math.floor(Math.random() * 1e9)}`;
    if (folderId) apiUrl += `&n=${folderId}`;

    const req = https.request(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 20000
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (err) {
          reject(new Error('Resposta inválida da API do MEGA: ' + data.slice(0, 100)));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Tempo esgotado ao consultar a API do MEGA (Timeout 20s).'));
    });

    req.on('error', err => reject(err));
    req.write(postData);
    req.end();
  });
}

/**
 * Escaneia uma pasta do MEGA e retorna a lista de arquivos individuais contidos nela
 */
async function scanMegaFolderLink(urlStr) {
  const parsed = parseMegaFolderUrl(urlStr);
  if (!parsed) {
    throw new Error('Link de pasta do MEGA inválido ou malformado.');
  }

  const { folderId, folderKey } = parsed;
  console.log(`[MEGA Scanner] Consultando API pública para pasta ID: ${folderId}...`);

  const keyBuf = base64UrlDecode(folderKey);
  const resp = await queryMegaApi([{ a: 'f', c: 1, r: 1, ca: 1 }], folderId);

  if (!Array.isArray(resp) || !resp[0] || !resp[0].f) {
    if (typeof resp === 'number') {
      if (resp === -9) throw new Error('A pasta do MEGA informada não existe ou foi removida.');
      if (resp === -16) throw new Error('Acesso bloqueado temporariamente pelo MEGA (cota/IP).');
    }
    throw new Error('Não foi possível obter os arquivos da pasta do MEGA.');
  }

  const nodes = resp[0].f;
  console.log(`[MEGA Scanner] Pasta ${folderId} contém ${nodes.length} nós.`);

  // Identifica o nome da pasta raiz (nó tipo 1 sem parent válido ou primeiro tipo 1)
  let rootFolderName = 'Pasta_MEGA';
  const folderNodes = nodes.filter(n => n.t === 1);
  for (const fn of folderNodes) {
    if (fn.k && fn.a) {
      const parts = fn.k.split(':');
      if (parts.length === 2) {
        try {
          const encKey = base64UrlDecode(parts[1]);
          const decipher = crypto.createDecipheriv('aes-128-ecb', keyBuf, null);
          decipher.setAutoPadding(false);
          const nodeKey = Buffer.concat([decipher.update(encKey), decipher.final()]);
          const attrs = decryptNodeAttrs(fn.a, nodeKey.slice(0, 16));
          if (attrs && attrs.n) {
            rootFolderName = sanitizeFolderName(attrs.n);
            break;
          }
        } catch (e) {}
      }
    }
  }

  const results = [];

  for (let idx = 0; idx < nodes.length; idx++) {
    const n = nodes[idx];
    if (n.t !== 0) continue; // Pula pastas, processa apenas arquivos (t === 0)

    let nodeKey = null;
    if (n.k) {
      const parts = n.k.split(':');
      if (parts.length === 2) {
        try {
          const encKey = base64UrlDecode(parts[1]);
          const decipher = crypto.createDecipheriv('aes-128-ecb', keyBuf, null);
          decipher.setAutoPadding(false);
          nodeKey = Buffer.concat([decipher.update(encKey), decipher.final()]);
        } catch (e) {}
      }
    }

    let fileName = `arquivo_${n.h}`;
    if (nodeKey && n.a) {
      let actualKey = nodeKey;
      if (nodeKey.length === 32) {
        const k1 = nodeKey.slice(0, 16);
        const k2 = nodeKey.slice(16, 32);
        const xorKey = Buffer.alloc(16);
        for (let b = 0; b < 16; b++) xorKey[b] = k1[b] ^ k2[b];
        actualKey = xorKey;
      }
      const attrs = decryptNodeAttrs(n.a, actualKey);
      if (attrs && attrs.n) fileName = attrs.n.replace(/[\\/:*?"<>|]/g, '_');
    }

    const fileSize = n.s || 0;
    const standaloneUrl = `https://mega.nz/folder/${folderId}#${folderKey}/file/${n.h}`;

    results.push({
      id: `mega_${folderId}_${n.h}`,
      fileId: n.h,
      numericId: n.h,
      name: fileName,
      size: fileSize,
      sizeFormatted: formatBytes(fileSize),
      downloadUrl: standaloneUrl,
      directUrl: standaloneUrl,
      sourceUrl: urlStr,
      originalUrl: urlStr,
      folderName: rootFolderName,
      relativePath: `${rootFolderName}/${fileName}`,
      service: 'mega',
      megaFolderId: folderId,
      megaFolderKey: folderKey,
      megaNodeId: n.h,
      megaFileHandle: n.h,
      megaNodeKeyHex: nodeKey ? nodeKey.toString('hex') : null,
      megaFileKeyHex: nodeKey ? nodeKey.toString('hex') : null,
      isHttpDirect: true,
      isAvulso: false,
      isSingleFile: false
    });
  }

  console.log(`[MEGA Scanner] Descompactados com sucesso ${results.length} arquivos individuais da pasta "${rootFolderName}".`);
  return results;
}

/**
 * Obtém URL direta de streaming e chaves de decodificação para download de um arquivo do MEGA
 */
async function resolveMegaFileDirectUrl(folderId, fileHandle, nodeKeyHex) {
  const resp = await queryMegaApi([{ a: 'g', g: 1, ssl: 2, n: fileHandle }], folderId);
  if (!Array.isArray(resp) || !resp[0] || !resp[0].g) {
    throw new Error('Falha ao obter link de streaming do arquivo no MEGA.');
  }

  const streamUrl = resp[0].g;
  let aesKey = null;
  let iv = null;

  if (nodeKeyHex) {
    const nodeKey = Buffer.from(nodeKeyHex, 'hex');
    const k1 = nodeKey.slice(0, 16);
    const k2 = nodeKey.slice(16, 32);
    aesKey = Buffer.alloc(16);
    for (let b = 0; b < 16; b++) aesKey[b] = k1[b] ^ k2[b];

    iv = Buffer.alloc(16, 0);
    nodeKey.copy(iv, 0, 16, 24);
  }

  return {
    streamUrl,
    directDownloadUrl: streamUrl,
    directUrl: streamUrl,
    aesKey,
    iv,
    aesKeyHex: aesKey ? aesKey.toString('hex') : null,
    ivHex: iv ? iv.toString('hex') : null
  };
}

module.exports = {
  isMegaUrl,
  isMegaFolderUrl,
  scanMegaFolderLink,
  resolveMegaFileDirectUrl,
  parseMegaFolderUrl
};
