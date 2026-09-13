const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { URL } = require('url');

// Localiza a pasta de dados do usuário para persistência de sessão
const getAppDataDir = () => {
  const appData = process.env.APPDATA || (process.platform === 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + '/.local/share');
  const dir = path.join(appData, 'nexus-downloader');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
};

const SESSION_FILE = path.join(getAppDataDir(), 'gofile_session.json');

let memorySession = null;
let cachedWtGenerator = null;
let cachedWtFetchTime = 0;

/**
 * Utilitário de formatação de tamanho de arquivo
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
 * Utilitário HTTP resiliente para chamadas à API do GoFile
 */
function makeHttpRequest(urlStr, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      const parsed = new URL(urlStr);
      const client = parsed.protocol === 'https:' ? https : http;

      const reqOpts = {
        method: options.method || 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9,pt-BR;q=0.8,pt;q=0.7',
          ...(options.headers || {})
        },
        timeout: options.timeout || 20000
      };

      if (options.token) {
        reqOpts.headers['Authorization'] = `Bearer ${options.token}`;
      }

      const req = client.request(urlStr, reqOpts, (res) => {
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
        reject(new Error('Tempo limite da requisição GoFile esgotado'));
      });

      if (options.body) {
        req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
      }
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Valida se a URL pertence ao GoFile
 */
function isGoFileUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return false;
  const u = urlStr.toLowerCase();
  return u.includes('gofile.io') || u.includes('gofile');
}

/**
 * Carrega a sessão de conta salva em disco (evita criar novas contas repetidas e bater em rate-limit)
 */
function loadPersistedSession() {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      const data = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
      if (data && data.token && typeof data.token === 'string') {
        return data;
      }
    }
  } catch (e) {}
  return null;
}

/**
 * Salva a sessão no disco
 */
function savePersistedSession(session) {
  try {
    fs.writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2), 'utf8');
  } catch (e) {}
}

/**
 * Baixa e compila o algoritmo oficial de assinatura do GoFile (wt.obf.js)
 * Necessário para gerar o cabeçalho 'X-Website-Token', sem o qual o GoFile
 * retorna erro 'error-notPremium' para todas as requisições públicas.
 */
async function getWtGenerator() {
  const now = Date.now();
  // Mantém em cache por até 3 horas (o GoFile rotaciona a cada 6 horas)
  if (cachedWtGenerator && (now - cachedWtFetchTime) < 3 * 3600 * 1000) {
    return cachedWtGenerator;
  }

  const res = await makeHttpRequest('https://gofile.io/js/wt.obf.js', { timeout: 15000 });
  if (res.statusCode !== 200 || !res.bodyText) {
    throw new Error(`Falha ao obter script gerador de token do GoFile (HTTP ${res.statusCode})`);
  }

  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Date,
    Math,
    String,
    Number,
    Array,
    Object,
    RegExp,
    JSON,
    Promise,
    navigator: {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      language: 'en-US'
    },
    location: {
      hostname: 'gofile.io',
      href: 'https://gofile.io/'
    }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  vm.runInContext(res.bodyText, vm.createContext(sandbox));
  if (typeof sandbox.generateWT !== 'function') {
    throw new Error('Função generateWT não encontrada no script do GoFile.');
  }

  cachedWtGenerator = sandbox.generateWT;
  cachedWtFetchTime = now;
  return cachedWtGenerator;
}

/**
 * Obtém ou reutiliza a sessão do GoFile (token de conta convidado + website token)
 */
async function getGoFileSession(forceNew = false) {
  if (!forceNew) {
    if (memorySession && memorySession.token) {
      const gen = await getWtGenerator();
      const wt = await gen(memorySession.token);
      return { token: memorySession.token, wt };
    }
    const persisted = loadPersistedSession();
    if (persisted && persisted.token) {
      memorySession = persisted;
      const gen = await getWtGenerator();
      const wt = await gen(memorySession.token);
      return { token: memorySession.token, wt };
    }
  }

  console.log('[GoFile Scanner] Criando nova sessão de convidado no GoFile...');
  const res = await makeHttpRequest('https://api.gofile.io/accounts', { method: 'POST', timeout: 15000 });
  let json;
  try {
    json = JSON.parse(res.bodyText);
  } catch (err) {
    throw new Error('Resposta inválida do GoFile ao criar conta');
  }

  if (json.status !== 'ok' || !json.data || !json.data.token) {
    if (json.status === 'error-rateLimit') {
      const persisted = loadPersistedSession();
      if (persisted && persisted.token) {
        console.warn('[GoFile Scanner] Rate limit atingido em /accounts, utilizando token persistido anterior.');
        memorySession = persisted;
        const gen = await getWtGenerator();
        const wt = await gen(memorySession.token);
        return { token: memorySession.token, wt };
      }
      throw new Error('Limite temporário de requisições do GoFile atingido (error-rateLimit). Aguarde 1 minuto ou ative a chave Torbox.');
    }
    throw new Error(json.status || 'Falha ao registrar conta de convidado no GoFile');
  }

  memorySession = {
    token: json.data.token,
    rootFolder: json.data.rootFolder,
    tier: json.data.tier,
    createdAt: Date.now()
  };
  savePersistedSession(memorySession);

  const gen = await getWtGenerator();
  const wt = await gen(memorySession.token);
  return { token: memorySession.token, wt };
}

/**
 * Retorna apenas o accountToken (para retrocompatibilidade com main.js)
 */
async function getGoFileAccountToken() {
  const session = await getGoFileSession(false);
  return session.token;
}

/**
 * Consulta a API de conteúdos do GoFile com autenticação e token de website (X-Website-Token)
 */
async function fetchGoFileContent(contentId, password = null, retry = true) {
  let session = await getGoFileSession(false);
  const query = new URLSearchParams();
  if (password) query.set('password', password);

  const queryStr = query.toString() ? `?${query.toString()}` : '';
  const url = `https://api.gofile.io/contents/${encodeURIComponent(contentId)}${queryStr}`;

  const res = await makeHttpRequest(url, {
    token: session.token,
    headers: {
      'X-Website-Token': session.wt,
      'X-BL': 'en-US',
      'Origin': 'https://gofile.io',
      'Referer': 'https://gofile.io/'
    }
  });

  let json;
  try {
    json = JSON.parse(res.bodyText);
  } catch (errParse) {
    throw new Error(`Resposta JSON inválida do GoFile (HTTP ${res.statusCode})`);
  }

  if (json.status === 'error-token' || json.status === 'error-wrongToken') {
    if (retry) {
      console.warn('[GoFile Scanner] Token do GoFile rejeitado. Renovando sessão...');
      session = await getGoFileSession(true);
      return fetchGoFileContent(contentId, password, false);
    }
  }

  return { json, session };
}

/**
 * Escaneia uma pasta ou subpasta recursivamente no GoFile
 */
async function scanGoFileFolder(contentId, folderPath = '', password = null) {
  const { json, session } = await fetchGoFileContent(contentId, password);

  if (json.status !== 'ok' || !json.data) {
    if (json.status === 'error-notPremium') {
      throw new Error('Este conteúdo no GoFile é exclusivo para contas Premium do GoFile (error-notPremium). Para baixar pelo Nexus, ative a chave do Torbox nos Ajustes.');
    }
    if (json.status === 'error-passwordRequired' || json.status === 'error-wrongPassword') {
      throw new Error('Esta pasta do GoFile é protegida por senha (passwordRequired).');
    }
    if (json.status === 'error-rateLimit') {
      throw new Error('Limite temporário de requisições do GoFile atingido (error-rateLimit). Aguarde alguns instantes.');
    }
    throw new Error(json.status || 'Falha ao acessar API de conteúdo do GoFile');
  }

  const data = json.data;
  const results = [];

  // Caso 1: O link fornecido é diretamente um arquivo único
  if (data.type === 'file') {
    results.push({
      id: `gofile_${data.id}`,
      fileId: data.id,
      name: data.name,
      size: data.size || 0,
      sizeFormatted: formatBytes(data.size || 0),
      downloadUrl: data.link,
      directUrl: data.link,
      folderName: folderPath || null,
      relativePath: folderPath ? `${folderPath}/${data.name}` : data.name,
      gofileToken: session.token,
      cookieHeader: `accountToken=${session.token}`,
      referer: 'https://gofile.io/',
      isHttpDirect: true,
      service: 'gofile',
      sourceUrl: `https://gofile.io/d/${contentId}`,
      url: data.link
    });
    return results;
  }

  // Caso 2: O link é uma pasta contendo múltiplos arquivos e/ou subpastas
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
          sizeFormatted: formatBytes(child.size || 0),
          downloadUrl: child.link,
          directUrl: child.link,
          folderName: currentFolderName,
          relativePath: `${currentFolderName}/${child.name}`,
          gofileToken: session.token,
          cookieHeader: `accountToken=${session.token}`,
          referer: 'https://gofile.io/',
          isHttpDirect: true,
          service: 'gofile',
          sourceUrl: `https://gofile.io/d/${contentId}`,
          url: child.link
        });
      } else if (child.type === 'folder') {
        // Varredura recursiva de subpasta
        const subFiles = await scanGoFileFolder(child.id, currentFolderName, password);
        results.push(...subFiles);
      }
    }
  }

  return results;
}

/**
 * Escaneia um link do GoFile (https://gofile.io/d/:id)
 */
async function scanGoFileLink(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return null;
  const match = urlStr.match(/gofile\.io\/d\/([a-zA-Z0-9_-]+)/i);
  if (!match) return null;

  const contentId = match[1];
  console.log(`[GoFile Scanner] Escaneando pasta/conteúdo GoFile ID: ${contentId}`);

  const files = await scanGoFileFolder(contentId);
  if (!files || files.length === 0) {
    throw new Error('Nenhum arquivo encontrado nesta pasta do GoFile.');
  }

  // Se for apenas 1 arquivo avulso isolado, respeita a regra de link individual
  if (files.length === 1) {
    files[0].folderName = null;
    files[0].isAvulso = true;
    files[0].isSingleFile = true;
    files[0].service = 'gofile';
    files[0].relativePath = files[0].name;
  }

  return files;
}

/**
 * Resolve a URL direta e os cabeçalhos de cookie para download de alta velocidade
 */
async function resolveGoFileDirectUrl(fileId, currentUrl = '', fallbackToken = null) {
  // Se a URL já for um link de CDN do GoFile funcional (file-*.gofile.io/download/web/...)
  if (currentUrl && currentUrl.includes('.gofile.io/download/web/') && !currentUrl.includes('/d/')) {
    let session = memorySession || loadPersistedSession();
    const token = (session && session.token) || fallbackToken;
    return {
      directUrl: currentUrl,
      cookieHeader: token ? `accountToken=${token}` : '',
      referer: 'https://gofile.io/'
    };
  }

  console.log(`[GoFile Worker] Resolvendo link direto via API GoFile para ID: ${fileId}...`);
  const { json, session } = await fetchGoFileContent(fileId);
  if (json.status !== 'ok' || !json.data) {
    throw new Error(json.status || 'Falha ao resolver URL direta no GoFile');
  }

  const directUrl = json.data.link;
  if (!directUrl) {
    throw new Error('A API do GoFile não retornou um link de download válido para este arquivo.');
  }

  return {
    directUrl: directUrl,
    cookieHeader: `accountToken=${session.token}`,
    referer: 'https://gofile.io/'
  };
}

module.exports = {
  isGoFileUrl,
  scanGoFileLink,
  scanGoFile: scanGoFileLink,
  resolveGoFileDirectUrl,
  getGoFileSession,
  getGoFileAccountToken
};
