// Nexus Downloader - Content Script (Manifest V3)
(function () {
  if (window.__NEXUS_DOWNLOADER_LOADED__) return;
  window.__NEXUS_DOWNLOADER_LOADED__ = true;

  let currentSettings = {
    monitoringMode: 'supported',
    hudState: 'compact',
    downloadEngine: 'bridge',
    downloadOnlyViaExtension: false,
    telemetryEnabled: true
  };

  let detectedFiles = [];
  let downloadProgressState = {
    active: false,
    completed: 0,
    total: 0,
    speed: '',
    isFinished: false,
    service: 'GoFile',
    type: '.Vídeo'
  };

  let currentDownloadItems = [];
  let downloadManagerOverlay = null;
  let downloadManagerInterval = null;
  let activeManagerFilter = localStorage.getItem('nexus_mgr_active_tab') || 'all';
  let selectedItemIds = new Set();
  let torboxCloudData = null;
  let torboxLoading = false;

  let hudContainer = null;
  let hudElement = null;
  let isDragging = false;
  let dragOffset = { x: 0, y: 0 };

  function mergeProgressItems(incomingItems) {
    if (!incomingItems || !Array.isArray(incomingItems)) return;
    const incomingById = new Map();
    const incomingByName = new Map();
    const incomingByUrl = new Map();

    incomingItems.forEach(item => {
      if (item.id !== undefined && item.id !== null) {
        incomingById.set(String(item.id), item);
      }
      if (item.name) {
        incomingByName.set(String(item.name).toLowerCase().trim(), item);
      }
      if (item.url) {
        incomingByUrl.set(String(item.url), item);
      }
    });

    const updatedList = [];
    const matchedIncomingIds = new Set();

    // 1. Atualizar ou preservar itens que já constam na fila local
    currentDownloadItems.forEach(localItem => {
      const keyId = String(localItem.id);
      const nameKey = localItem.name ? String(localItem.name).toLowerCase().trim() : null;
      const urlKey = localItem.url ? String(localItem.url) : null;

      const matched = incomingById.get(keyId) || 
                      (nameKey ? incomingByName.get(nameKey) : null) || 
                      (urlKey ? incomingByUrl.get(urlKey) : null);

      if (matched) {
        Object.assign(localItem, matched);
        matchedIncomingIds.add(String(matched.id));
        updatedList.push(localItem);
      } else {
        // Preserva o item local (baixando, pendente, pausado ou concluído na sessão atual)
        updatedList.push(localItem);
      }
    });

    // 2. Adicionar novos itens do incoming que ainda não estavam na lista local
    incomingItems.forEach(incItem => {
      if (!matchedIncomingIds.has(String(incItem.id))) {
        updatedList.push({ ...incItem });
      }
    });

    currentDownloadItems = updatedList;
  }

  let currentBatchState = {
    active: false,
    total: 0,
    completedCount: 0,
    itemIds: new Set(),
    itemNames: new Set(),
    itemUrls: new Set()
  };

  function setBatchItems(items) {
    if (!items || !items.length) return;
    currentBatchState.active = true;
    currentBatchState.total = items.length;
    currentBatchState.completedCount = 0;
    currentBatchState.itemIds = new Set(items.map(t => String(t.id)));
    currentBatchState.itemNames = new Set(items.map(t => String(t.filename || t.name || '').toLowerCase().trim()));
    currentBatchState.itemUrls = new Set(items.map(t => t.url || t.directUrl || t.sourceUrl || '').filter(Boolean));
  }

  function getBatchProgress() {
    const downloadingItems = (currentDownloadItems || []).filter(i => i.status === 'downloading' || i.status === 'paused' || i.status === 'pending');
    const completedItems = (currentDownloadItems || []).filter(i => i.status === 'completed');

    // 1. Se temos um lote ativo registrado
    if (currentBatchState.active && currentBatchState.total > 0) {
      const batchItems = (currentDownloadItems || []).filter(i =>
        currentBatchState.itemIds.has(String(i.id)) ||
        (i.name && currentBatchState.itemNames.has(String(i.name).toLowerCase().trim())) ||
        (i.url && currentBatchState.itemUrls.has(String(i.url))) ||
        (i.sourceUrl && currentBatchState.itemUrls.has(String(i.sourceUrl))) ||
        (i.directUrl && currentBatchState.itemUrls.has(String(i.directUrl)))
      );

      const completedInBatch = batchItems.filter(i => i.status === 'completed').length;
      const totalInBatch = currentBatchState.total;
      currentBatchState.completedCount = Math.max(currentBatchState.completedCount || 0, completedInBatch);
      const effectiveCompleted = Math.min(totalInBatch, currentBatchState.completedCount);

      let sumProgress = 0;
      if (batchItems.length > 0) {
        batchItems.forEach(item => {
          if (item.status === 'completed') sumProgress += 100;
          else sumProgress += (item.progress || 0);
        });
      } else {
        sumProgress = effectiveCompleted * 100;
      }

      const pct = totalInBatch > 0 ? Math.min(100, Math.round(sumProgress / totalInBatch)) : 0;
      const isFinished = totalInBatch > 0 && effectiveCompleted >= totalInBatch;

      return {
        completed: effectiveCompleted,
        total: totalInBatch,
        pct,
        isFinished,
        activeCount: batchItems.filter(i => i.status === 'downloading' || i.status === 'pending').length
      };
    }

    // 2. Se não temos lote explícito, mas há itens ativos ou concluídos no gerenciador
    const totalFiles = downloadingItems.length + completedItems.length;
    if (totalFiles > 0) {
      let sumProgress = 0;
      completedItems.forEach(() => { sumProgress += 100; });
      downloadingItems.forEach(item => {
        sumProgress += (item.progress || 0);
      });
      const pct = totalFiles > 0 ? Math.min(100, Math.round(sumProgress / totalFiles)) : 0;
      return {
        completed: completedItems.length,
        total: totalFiles,
        pct,
        isFinished: downloadingItems.length === 0 && completedItems.length > 0,
        activeCount: downloadingItems.length
      };
    }

    // 3. Fallback neutro
    return {
      completed: 0,
      total: detectedFiles ? detectedFiles.length : 0,
      pct: 0,
      isFinished: false,
      activeCount: 0
    };
  }

  function getServiceTagStyle(serviceName, urlStr) {
    const service = String(serviceName || '');
    const url = String(urlStr || window.location.href || '').toLowerCase();

    // 1. Google Drive
    if (service === 'Google Drive' || url.includes('drive.google.com') || url.includes('docs.google.com')) {
      return { text: 'Google Drive', bg: 'rgba(34, 197, 94, 0.18)', color: '#4ade80', border: 'rgba(34, 197, 94, 0.4)' };
    }
    // 2. Bunkr
    if (service === 'Bunkr' || url.includes('bunkr') || url.includes('balbums') || url.includes('.cdn.cr')) {
      return { text: 'Bunkr', bg: 'rgba(99, 102, 241, 0.18)', color: '#818cf8', border: 'rgba(99, 102, 241, 0.4)' };
    }
    // 3. TeraBox
    if (service === 'TeraBox' || url.includes('terabox') || url.includes('1024tera') || url.includes('freeterabox') || url.includes('gibibox') || url.includes('4funbox')) {
      return { text: 'TeraBox', bg: 'rgba(255, 170, 0, 0.18)', color: '#ffb703', border: 'rgba(255, 170, 0, 0.4)' };
    }
    // 4. MediaFire
    if (service === 'MediaFire' || url.includes('mediafire.com')) {
      return { text: 'MediaFire', bg: 'rgba(6, 182, 212, 0.18)', color: '#38bdf8', border: 'rgba(6, 182, 212, 0.4)' };
    }
    // 5. Microsoft OneDrive
    if (service === 'Microsoft OneDrive' || url.includes('onedrive') || url.includes('1drv.ms') || url.includes('sharepoint')) {
      return { text: 'Microsoft OneDrive', bg: 'rgba(255, 255, 255, 0.18)', color: '#ffffff', border: 'rgba(255, 255, 255, 0.4)' };
    }
    // 6. Send
    if (service === 'Send' || url.includes('send.now') || url.includes('send.cm') || url.includes('sendit.cloud')) {
      return { text: 'Send', bg: 'rgba(236, 72, 153, 0.18)', color: '#f472b6', border: 'rgba(236, 72, 153, 0.4)' };
    }
    // 7. PixelDrain
    if (service === 'PixelDrain' || url.includes('pixeldrain.com')) {
      return { text: 'PixelDrain', bg: 'rgba(249, 115, 22, 0.18)', color: '#fb923c', border: 'rgba(249, 115, 22, 0.4)' };
    }
    // 8. Drime Cloud
    if (service === 'Drime Cloud' || url.includes('drime.cloud')) {
      return { text: 'Drime Cloud', bg: 'rgba(16, 185, 129, 0.18)', color: '#34d399', border: 'rgba(16, 185, 129, 0.4)' };
    }
    // 9. Turbo.cr
    if (service === 'Turbo.cr' || url.includes('turbo.cr') || url.includes('turbocdn.st')) {
      return { text: 'Turbo.cr', bg: 'rgba(244, 63, 94, 0.18)', color: '#fb7185', border: 'rgba(244, 63, 94, 0.4)' };
    }
    // 10. Vik1ngFile
    if (service === 'Vik1ngFile' || url.includes('vik1ngfile') || url.includes('vikingfile')) {
      return { text: 'Vik1ngFile', bg: 'rgba(168, 85, 247, 0.18)', color: '#c084fc', border: 'rgba(168, 85, 247, 0.4)' };
    }
    // 11. GoFile
    if (service === 'GoFile' || url.includes('gofile.io') || url.includes('gofile')) {
      return { text: 'GoFile', bg: 'rgba(59, 130, 246, 0.18)', color: '#60a5fa', border: 'rgba(59, 130, 246, 0.4)' };
    }
    // 12. Torbox
    if (service === 'Torbox' || url.includes('tb-cdn') || url.includes('torbox')) {
      return { text: 'Torbox', bg: 'rgba(139, 92, 246, 0.18)', color: '#a78bfa', border: 'rgba(139, 92, 246, 0.4)' };
    }

    // Extração dinâmica do domínio real do site
    let hostName = service && service !== 'Download' && service !== 'Web' ? service : '';
    if (!hostName) {
      try {
        if (url && url.startsWith('http')) {
          const parsed = new URL(url);
          const host = parsed.hostname.replace(/^www\./i, '');
          const parts = host.split('.');
          if (parts.length >= 2) {
            const domainName = parts[parts.length - 2];
            if (domainName && domainName.length > 2 && domainName !== 'localhost' && domainName !== '127') {
              hostName = domainName.charAt(0).toUpperCase() + domainName.slice(1);
            }
          }
        }
      } catch (e) {}
    }
    if (!hostName) hostName = 'Web';
    return { text: hostName, bg: 'rgba(148, 163, 184, 0.18)', color: '#cbd5e1', border: 'rgba(148, 163, 184, 0.4)' };
  }

  function getActionBtnText() {
    const isBrowser = currentSettings.downloadOnlyViaExtension === true || currentSettings.downloadEngine === 'browser';
    return isBrowser ? '⬇️ Iniciar Download' : '⬇️ Baixar pelo Nexus Downloader';
  }

  // SVG oficial do Nexus Downloader
  const NEXUS_SVG_LOGO = `
    <svg class="nexus-hud-bg-logo" viewBox="0 0 100 100">
      <defs>
        <linearGradient id="nexusGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#c084fc"/>
          <stop offset="50%" stop-color="#38bdf8"/>
          <stop offset="100%" stop-color="#00f2fe"/>
        </linearGradient>
        <linearGradient id="nexusGrad2" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#38bdf8"/>
          <stop offset="100%" stop-color="#00f2fe"/>
        </linearGradient>
      </defs>
      <g>
        <path d="M 28 64 C 18 64 12 56 12 46 C 12 37 19 30 28 30 C 32 20 42 14 54 14 C 67 14 77 22 80 32 C 87 33 92 40 92 48 C 92 57 85 64 76 64 Z" 
              fill="none" stroke="url(#nexusGrad1)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M 50 18 L 62 46 L 53 46 L 53 60 L 64 60 L 50 82 L 36 60 L 47 60 L 47 46 L 38 46 Z" 
              fill="none" stroke="url(#nexusGrad2)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      </g>
    </svg>
  `;

  // Carregar configurações e inicializar
  chrome.storage.local.get([
    'monitoringMode',
    'hudState',
    'hudHiddenTabs',
    'downloadEngine',
    'downloadOnlyViaExtension'
  ], (res) => {
    if (res.monitoringMode) currentSettings.monitoringMode = res.monitoringMode;
    if (res.hudState) currentSettings.hudState = res.hudState;
    if (res.downloadEngine) currentSettings.downloadEngine = res.downloadEngine;
    if (res.downloadOnlyViaExtension !== undefined) currentSettings.downloadOnlyViaExtension = res.downloadOnlyViaExtension;

    if (currentSettings.monitoringMode === 'disabled') {
      return; // Extensão desativada
    }

    // Executar escaneamento da página
    scanPage();
  });

  // Atualizar quando configurações mudarem em tempo real
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      if (changes.downloadEngine) currentSettings.downloadEngine = changes.downloadEngine.newValue;
      if (changes.downloadOnlyViaExtension !== undefined) currentSettings.downloadOnlyViaExtension = changes.downloadOnlyViaExtension.newValue;
      updateActionButtonsText();
    }
  });

  function updateActionButtonsText() {
    const btnAction = hudElement ? hudElement.querySelector('#nexus-btn-action') : null;
    if (btnAction && !downloadProgressState.isFinished) {
      btnAction.innerText = getActionBtnText();
    }
    const btnModal = document.querySelector('#nexus-btn-confirm-download');
    if (btnModal) {
      btnModal.innerText = getActionBtnText();
    }
  }

  // Listener para mensagens do popup ou background
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'RESTORE_HUD') {
      restoreHud();
      sendResponse({ success: true });
      return;
    }
    if (msg.action === 'SET_HUD_STATE') {
      if (msg.state === 'expanded') {
        expandHud();
      } else {
        minimizeHud();
      }
      sendResponse({ success: true });
      return;
    }
    if (msg.action === 'SHOW_DOWNLOAD_MANAGER') {
      showDownloadManagerModal();
      sendResponse({ success: true });
      return;
    }
    if (msg.action === 'SHOW_INPAGE_OPTIONS') {
      showInpageOptionsModal();
      sendResponse({ success: true });
      return;
    }
    if (msg.action === 'GET_DETECTED_FILES') {
      sendResponse({ files: detectedFiles, service: downloadProgressState.service });
      return;
    }
    if (msg.action === 'DOWNLOAD_STARTED') {
      if (msg.items && Array.isArray(msg.items) && msg.items.length) {
        mergeProgressItems(msg.items);
        setBatchItems(msg.items);
      }
      startHudDownload(msg.itemsCount || detectedFiles.length);
      if (downloadManagerOverlay) {
        activeManagerFilter = 'downloading';
        localStorage.setItem('nexus_mgr_active_tab', 'downloading');
        try {
          const allTabs = downloadManagerOverlay.querySelectorAll('.nexus-filter-tab-btn');
          allTabs.forEach(b => {
            if (b.getAttribute('data-filter') === 'downloading') b.classList.add('active');
            else b.classList.remove('active');
          });
        } catch (eTab) {}
        updateDownloadManagerUI();
      }
      sendResponse({ success: true });
      return;
    }
    if (msg.action === 'DOWNLOAD_PROGRESS') {
      if (msg.items && Array.isArray(msg.items) && msg.items.length) {
        mergeProgressItems(msg.items);
      }
      if (msg.speedFormatted || msg.speed) {
        downloadProgressState.speed = msg.speedFormatted || msg.speed;
      }
      updateHudProgress(msg.completed, msg.total, msg.isCompleted, msg.speed || msg.speedFormatted);
      if (downloadManagerOverlay) {
        updateDownloadManagerUI();
      }
      sendResponse({ success: true });
      return;
    }
    if (msg.action === 'DESKTOP_BRIDGE_OFFLINE') {
      showNexusBridgeOfflineNotification(msg.message);
      sendResponse({ success: true });
      return;
    }
  });

  function showNexusBridgeOfflineNotification(message) {
    const existing = document.getElementById('nexus-bridge-offline-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'nexus-bridge-offline-toast';
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 2147483647;
      background: linear-gradient(135deg, rgba(30, 27, 75, 0.96) 0%, rgba(15, 23, 42, 0.98) 100%);
      border: 1px solid rgba(245, 158, 11, 0.6);
      border-radius: 12px;
      padding: 16px 20px;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6), 0 0 20px rgba(245, 158, 11, 0.2);
      max-width: 420px;
      backdrop-filter: blur(12px);
      display: flex;
      flex-direction: column;
      gap: 8px;
    `;
    toast.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <strong style="font-size:0.95rem; color:#fbbf24; font-weight:700;">Nexus Portable PC Não Detectado</strong>
        </div>
        <button id="nexus-toast-close" style="background:transparent; border:none; color:#94a3b8; font-size:1.1rem; cursor:pointer; padding:2px 6px; line-height:1; display:flex; align-items:center;"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
      <div style="font-size:0.83rem; color:#cbd5e1; line-height:1.4;">
        ${message || 'O download é processado exclusivamente pelo motor do <strong>Nexus Portable PC</strong>. Abra o aplicativo desktop no Windows para iniciar os downloads.'}
      </div>
    `;
    document.body.appendChild(toast);
    const btnClose = toast.querySelector('#nexus-toast-close');
    if (btnClose) btnClose.onclick = () => toast.remove();
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 8000);
  }

  // Função de varredura (Client-Side Standalone + Bridge do Desktop)
  async function scanPage() {
    const host = window.location.hostname.toLowerCase();
    const url = window.location.href;

    const isSupportedHoster = host.includes('gofile.io') ||
      host.includes('bunkr') ||
      host.includes('drive.google.com') ||
      host.includes('pixeldrain.com') ||
      host.includes('vikingfile') ||
      host.includes('mediafire.com') ||
      host.includes('send.cm') ||
      host.includes('terabox') ||
      host.includes('1024tera') ||
      host.includes('turbo.cr') ||
      host.includes('drime.cloud');

    const hasTorrents = url.includes('torbox.app') ||
      document.querySelector('a[href^="magnet:"]') ||
      document.querySelector('a[href*=".torrent"]');

    if (currentSettings.monitoringMode === 'supported' && !isSupportedHoster) {
      return;
    }

    if (currentSettings.monitoringMode === 'supported_torbox' && !isSupportedHoster && !hasTorrents) {
      return;
    }

    // Identificar Provedor
    if (host.includes('gofile.io')) downloadProgressState.service = 'GoFile';
    else if (host.includes('bunkr')) downloadProgressState.service = 'Bunkr';
    else if (host.includes('pixeldrain.com')) downloadProgressState.service = 'PixelDrain';
    else if (host.includes('drive.google.com')) downloadProgressState.service = 'Google Drive';
    else if (host.includes('mediafire.com')) downloadProgressState.service = 'MediaFire';
    else if (host.includes('terabox') || host.includes('1024tera')) downloadProgressState.service = 'TeraBox';
    else if (hasTorrents) downloadProgressState.service = 'Torbox';
    else downloadProgressState.service = 'Download';

    let found = [];
    const seenUrls = new Set();

    // 1. Scanner Autônomo Client-Side para MediaFire
    if (host.includes('mediafire.com')) {
      // Caso A: Pasta do MediaFire (/folder/key)
      const folderMatch = url.match(/\/folder\/([a-zA-Z0-9]+)/i);
      if (folderMatch && folderMatch[1]) {
        const folderKey = folderMatch[1];
        try {
          const res = await fetch(`https://www.mediafire.com/api/1.4/folder/get_content.php?folder_key=${folderKey}&content_type=files&response_format=json`);
          if (res.ok) {
            const data = await res.json();
            const mfFiles = data?.response?.folder_content?.files || [];
            mfFiles.forEach(f => {
              const fileUrl = f.links?.normal_download || `https://www.mediafire.com/file/${f.quickkey}/${encodeURIComponent(f.filename || 'file')}/file`;
              seenUrls.add(fileUrl);
              const sz = parseInt(f.size, 10) || 0;
              found.push({
                id: f.quickkey,
                url: fileUrl,
                directUrl: fileUrl,
                downloadUrl: fileUrl,
                filename: f.filename || 'arquivo',
                size: sz,
                sizeFormatted: formatBytes(sz),
                service: 'MediaFire',
                type: getFileType(f.filename || '')
              });
            });
          }
        } catch (err) {
          console.warn('[Content] Erro na varredura de pasta MediaFire:', err);
        }
      }

      // Caso B: Arquivo único MediaFire (/file/key) ou botão na página
      const dlBtn = document.querySelector('#downloadButton') || document.querySelector('a.popsok') || document.querySelector('a[aria-label="Download file"]');
      if (dlBtn && dlBtn.href) {
        const nameEl = document.querySelector('.dl-btn-label') || document.querySelector('.filename') || document.querySelector('.file_name');
        const fileName = nameEl ? (nameEl.title || nameEl.innerText.trim()) : document.title.replace(/MediaFire/i, '').trim() || 'arquivo';
        seenUrls.add(dlBtn.href);
        found.push({
          id: 'mf-current',
          url: url,
          directUrl: dlBtn.href,
          downloadUrl: dlBtn.href,
          filename: fileName,
          service: 'MediaFire',
          type: getFileType(fileName)
        });
      }
    }

    // 2. Scanner Autônomo Client-Side para Bunkr (Adaptado da versão Portable Desktop)
    if (host.includes('bunkr') || host.includes('bunkrr') || host.includes('balbums')) {
      const bunkrLinks = document.querySelectorAll('a[href*="/v/"], a[href*="/f/"], a[href*="/i/"], a[href*="/d/"]');
      bunkrLinks.forEach(a => {
        if (a.href && !seenUrls.has(a.href)) {
          seenUrls.add(a.href);

          const slugMatch = a.href.match(/\/(?:f|v|i|d)\/([a-zA-Z0-9_-]+)/i);
          const slug = slugMatch ? slugMatch[1] : '';

          let name = '';
          const card = a.closest('.grid-images_box, .the-box, .box, [class*="card"], [class*="box"], div');
          if (card) {
            const titleEl = card.querySelector('h1, h2, h3, h4, p, span.title, .name, [class*="title"], [class*="name"]');
            if (titleEl && titleEl.innerText.trim()) {
              name = titleEl.innerText.trim();
            }
            if (!name) {
              const img = card.querySelector('img');
              if (img && (img.alt || img.title)) {
                name = (img.alt || img.title).trim();
              }
            }
          }
          if (!name) {
            name = a.innerText.trim() || a.getAttribute('title') || '';
          }
          if (!name || name === 'Bunkr' || name.length < 2) {
            name = slug ? `bunkr_${slug}.mp4` : 'arquivo_bunkr.mp4';
          }

          let sizeBytes = 0;
          if (card) {
            const sizeTxt = card.innerText.match(/(\d+(?:\.\d+)?)\s*(GB|MB|KB|Bytes)/i);
            if (sizeTxt) {
              const val = parseFloat(sizeTxt[1]);
              const unit = sizeTxt[2].toUpperCase();
              if (unit === 'GB') sizeBytes = Math.round(val * 1024 * 1024 * 1024);
              else if (unit === 'MB') sizeBytes = Math.round(val * 1024 * 1024);
              else if (unit === 'KB') sizeBytes = Math.round(val * 1024);
              else sizeBytes = Math.round(val);
            }
          }

          found.push({
            id: slug ? `bunkr_${slug}` : undefined,
            url: a.href,
            bunkrSlug: slug,
            filename: name,
            size: sizeBytes,
            sizeFormatted: sizeBytes ? formatBytes(sizeBytes) : '',
            service: 'Bunkr',
            type: getFileType(name || a.href)
          });
        }
      });
    }

    // 3. Links diretos na página
    const links = document.querySelectorAll('a[href]');
    links.forEach(a => {
      const href = a.href;
      if (!href || seenUrls.has(href)) return;

      const lower = href.toLowerCase();
      const isMedia = lower.match(/\.(mp4|mkv|avi|mov|zip|rar|7z|tar|gz|pdf|jpg|jpeg|png|webp|iso|exe|torrent)/i);
      const isMagnet = lower.startsWith('magnet:?');

      if (isMedia || isMagnet || (currentSettings.monitoringMode === 'universal' && href.includes('/download'))) {
        seenUrls.add(href);
        const name = (a.innerText.trim() || a.getAttribute('download') || href.split('/').pop().split('?')[0] || 'arquivo').substring(0, 45);
        found.push({
          url: href,
          filename: name,
          service: downloadProgressState.service,
          type: getFileType(href)
        });
      }
    });

    // 4. Elementos de vídeo/áudio
    const mediaElements = document.querySelectorAll('video source, video[src], audio source, audio[src]');
    mediaElements.forEach(m => {
      const src = m.src || m.getAttribute('src');
      if (src && !seenUrls.has(src)) {
        seenUrls.add(src);
        found.push({
          url: src,
          filename: 'video_media.mp4',
          service: downloadProgressState.service,
          type: '.Vídeo'
        });
      }
    });

    if (found.length > 0 || isSupportedHoster) {
      detectedFiles = found.length > 0 ? found : [
        { url: window.location.href, filename: document.title || 'arquivo', service: downloadProgressState.service, type: '.Vídeo' }
      ];
      downloadProgressState.total = detectedFiles.length;
      downloadProgressState.type = detectedFiles[0].type || '.Vídeo';
      initHudWidget();

      // Re-verificação após 1.2s para botões que carregam assincronamente (ex: MediaFire)
      if (host.includes('mediafire.com') && detectedFiles.length <= 1) {
        setTimeout(() => {
          const dlBtnLate = document.querySelector('#downloadButton') || document.querySelector('a.popsok');
          if (dlBtnLate && dlBtnLate.href && dlBtnLate.href !== window.location.href) {
            const nameEl = document.querySelector('.dl-btn-label') || document.querySelector('.filename');
            const fileName = nameEl ? (nameEl.title || nameEl.innerText.trim()) : document.title.replace(/MediaFire/i, '').trim() || 'arquivo';
            detectedFiles = [{
              id: 'mf-current',
              url: window.location.href,
              directUrl: dlBtnLate.href,
              downloadUrl: dlBtnLate.href,
              filename: fileName,
              service: 'MediaFire',
              type: getFileType(fileName)
            }];
            downloadProgressState.total = 1;
            downloadProgressState.type = detectedFiles[0].type;
            updateHudInitialStats();
          }
        }, 1200);
      }

      // Se bridge do desktop estiver ativo, tentar enriquecer/completar a lista
      if (isSupportedHoster) {
        chrome.runtime.sendMessage({ action: 'SCAN_PAGE_URL', url: window.location.href }, (scanRes) => {
          if (scanRes && scanRes.success && scanRes.files && scanRes.files.length > 0) {
            detectedFiles = scanRes.files.map(f => ({
              id: f.id,
              url: f.url || f.downloadUrl || f.directUrl || window.location.href,
              directUrl: f.directUrl || f.downloadUrl || f.url,
              downloadUrl: f.downloadUrl || f.directUrl || f.url,
              filename: f.name || f.filename || 'arquivo',
              size: f.size || 0,
              sizeFormatted: f.sizeFormatted || (f.size ? formatBytes(f.size) : ''),
              service: downloadProgressState.service,
              type: getFileType(f.name || f.filename || f.url || '')
            }));
            downloadProgressState.total = detectedFiles.length;
            if (detectedFiles[0]) downloadProgressState.type = detectedFiles[0].type;
            updateHudInitialStats();
          }
        });
      }
    }
  }

  function updateHudInitialStats() {
    if (!hudElement) return;
    const speedCompVal = hudElement.querySelector('#nexus-compact-speed-val');
    const countCompVal = hudElement.querySelector('#nexus-compact-count-val');
    const counterExp = hudElement.querySelector('#nexus-exp-counter');
    const tagsExp = hudElement.querySelector('.nexus-exp-tags');
    const ringBar = hudElement.querySelector('#nexus-ring-bar');

    if (ringBar && !downloadProgressState.active) {
      ringBar.classList.add('inactive');
      ringBar.style.stroke = 'transparent';
      ringBar.style.opacity = '0';
    }

    if (countCompVal && !downloadProgressState.active) {
      countCompVal.innerText = `0/${detectedFiles.length}`;
    }
    if (speedCompVal && !downloadProgressState.active) {
      speedCompVal.innerText = `0.0 MB/s`;
    }
    if (counterExp && !downloadProgressState.active) {
      counterExp.innerText = `${detectedFiles.length} Arquivo(s)`;
    }
    if (tagsExp) {
      const sTag = getServiceTagStyle(downloadProgressState.service, window.location.href);
      const cleanType = (downloadProgressState.type || '.Arquivo').replace(/^[.\[\]]+|[\]]+$/g, '');
      const typeTagText = '.' + cleanType.charAt(0).toUpperCase() + cleanType.slice(1);
      tagsExp.innerHTML = `
        <span class="nexus-tag-service" id="nexus-exp-service-tag" style="background: ${sTag.bg}; color: ${sTag.color}; border: 1px solid ${sTag.border};">${sTag.text}</span>
        <span class="nexus-tag-type" id="nexus-exp-type-tag">${typeTagText}</span>
      `;
    }
  }

  // Inicialização do HUD
  function initHudWidget() {
    if (document.getElementById('nexus-hud-container')) return;

    hudContainer = document.createElement('div');
    hudContainer.id = 'nexus-hud-container';
    hudContainer.setAttribute('dir', 'ltr');
    hudContainer.classList.add('nexus-root-container');

    hudElement = document.createElement('div');
    hudElement.className = 'nexus-floating-hud compact';

    const sTag = getServiceTagStyle(downloadProgressState.service, window.location.href);
    const cleanType = (downloadProgressState.type || '.Arquivo').replace(/^[.\[\]]+|[\]]+$/g, '');
    const typeTagText = '.' + cleanType.charAt(0).toUpperCase() + cleanType.slice(1);

    hudElement.innerHTML = `
      <!-- Anel de Progresso SVG no Contorno Interno -->
      <svg class="nexus-hud-svg-ring" viewBox="0 0 100 100">
        <circle class="nexus-hud-ring-track" cx="50" cy="50" r="44" stroke-width="4"></circle>
        <circle class="nexus-hud-ring-bar inactive" id="nexus-ring-bar" cx="50" cy="50" r="44" stroke-width="4" stroke-dasharray="276" stroke-dashoffset="276" style="stroke: transparent; opacity: 0;"></circle>
      </svg>

      <!-- Logotipo Oficial no Background (Marca d'Água - Modo Compacto) -->
      ${NEXUS_SVG_LOGO}

      <!-- Dados no Centro (Modo Compacto Padrão: Velocidade + Contador 0/1) -->
      <div class="nexus-hud-compact-data" id="nexus-compact-data" title="Clique para abrir o Gerenciador de Downloads">
        <div class="nexus-compact-stack" id="nexus-compact-stack">
          <span class="nexus-compact-speed-val" id="nexus-compact-speed-val">${downloadProgressState.speed || '0.0 MB/s'}</span>
          <span class="nexus-compact-count-val" id="nexus-compact-count-val">0/${detectedFiles.length}</span>
        </div>
        <span class="nexus-hud-check" id="nexus-compact-check" style="display:none;"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>
      </div>

      <!-- Dados no Modo Expandido (Espaçoso, sem botão e sem sobreposição) -->
      <div class="nexus-hud-expanded-data" id="nexus-expanded-data" title="Clique para abrir o Gerenciador de Downloads">
        <!-- Bloco Unificado: Status + Contador (Abre a janela ao clicar) -->
        <div class="nexus-exp-header-group" id="nexus-exp-header-group">
          <div class="nexus-exp-status-row">
            <span class="nexus-exp-status" id="nexus-exp-status">Em Espera</span>
            <span class="nexus-exp-check" id="nexus-exp-check" style="display:none;"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>
          </div>
          <span class="nexus-exp-counter" id="nexus-exp-counter">${detectedFiles.length} Arquivo(s)</span>
          <span class="nexus-exp-sub" id="nexus-exp-sub">DETECTADOS NA PÁGINA</span>
        </div>

        <div class="nexus-exp-tags">
          <span class="nexus-tag-service" id="nexus-exp-service-tag" style="background: ${sTag.bg}; color: ${sTag.color}; border: 1px solid ${sTag.border};">${sTag.text}</span>
          <span class="nexus-tag-type" id="nexus-exp-type-tag">${typeTagText}</span>
        </div>
      </div>

      <!-- Controles de Hover no Círculo (Aparece no Hover tanto no Compacto quanto no Expandido) -->
      <div class="nexus-hud-hover-controls">
        <button class="nexus-btn-ctrl" id="nexus-btn-minimize" title="Aumentar para modo grande">+</button>
        <button class="nexus-btn-ctrl close" id="nexus-btn-close" title="Fechar da página"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
    `;

    hudContainer.appendChild(hudElement);
    document.body.appendChild(hudContainer);

    setupHudEvents();
  }

  // Eventos e Interatividade do HUD
  function setupHudEvents() {
    const btnMinimize = hudElement.querySelector('#nexus-btn-minimize');
    const btnClose = hudElement.querySelector('#nexus-btn-close');

    // Clique no HUD
    hudElement.addEventListener('click', (e) => {
      if (isDragging) return;
      if (e.target.closest('#nexus-btn-minimize') || e.target.closest('#nexus-btn-close')) return;

      // 1. Clique nos dados compactos (0/1 ou velocidade ou check)
      if (e.target.closest('#nexus-compact-data')) {
        showDownloadManagerModal();
        return;
      }

      // 2. Clique no HUD expandido (abre diretamente o Gerenciador de Downloads)
      if (hudElement.classList.contains('expanded')) {
        showDownloadManagerModal();
        return;
      }

      if (hudElement.classList.contains('compact')) {
        expandHud();
      }
    });

    // Alternar tamanho (+ / –)
    btnMinimize.addEventListener('click', (e) => {
      e.stopPropagation();
      if (hudElement.classList.contains('compact')) {
        expandHud();
      } else {
        minimizeHud();
      }
    });

    // Fechar
    btnClose.addEventListener('click', (e) => {
      e.stopPropagation();
      closeHud();
    });

    // Drag and Drop (Arrastar Livremente)
    hudElement.addEventListener('pointerdown', onPointerDown);
  }

  function expandHud() {
    hudElement.classList.remove('compact');
    hudElement.classList.add('expanded');
    currentSettings.hudState = 'expanded';
    const btnMin = hudElement.querySelector('#nexus-btn-minimize');
    if (btnMin) {
      btnMin.textContent = '–';
      btnMin.title = 'Diminuir para modo compacto';
    }
  }

  function minimizeHud() {
    hudElement.classList.remove('expanded');
    hudElement.classList.add('compact');
    currentSettings.hudState = 'compact';
    const btnMin = hudElement.querySelector('#nexus-btn-minimize');
    if (btnMin) {
      btnMin.textContent = '+';
      btnMin.title = 'Aumentar para modo grande';
    }
  }

  function closeHud() {
    hudContainer.style.display = 'none';
  }

  function restoreHud() {
    if (!hudContainer) {
      initHudWidget();
    } else {
      hudContainer.style.display = 'flex';
      minimizeHud();
    }
  }

  // Lógica de Arrastar (Pointer Events)
  function onPointerDown(e) {
    if (e.target.tagName === 'BUTTON') return;
    isDragging = false;

    const startX = e.clientX;
    const startY = e.clientY;
    const rect = hudContainer.getBoundingClientRect();
    dragOffset.x = e.clientX - rect.left;
    dragOffset.y = e.clientY - rect.top;

    function onPointerMove(moveEvent) {
      const dist = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
      if (dist > 5) {
        isDragging = true;
        hudContainer.style.bottom = 'auto';
        hudContainer.style.right = 'auto';
        
        let newX = moveEvent.clientX - dragOffset.x;
        let newY = moveEvent.clientY - dragOffset.y;

        // Limites de tela (clamping)
        const maxX = window.innerWidth - hudContainer.offsetWidth - 16;
        const maxY = window.innerHeight - hudContainer.offsetHeight - 16;
        newX = Math.max(16, Math.min(newX, maxX));
        newY = Math.max(16, Math.min(newY, maxY));

        hudContainer.style.left = `${newX}px`;
        hudContainer.style.top = `${newY}px`;
      }
    }

    function onPointerUp() {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }

  // Atualização dos Estados de Download
  function startHudDownload(count) {
    downloadProgressState.active = true;
    downloadProgressState.total = count;
    downloadProgressState.completed = 0;
    downloadProgressState.isFinished = false;

    const stackComp = hudElement.querySelector('#nexus-compact-stack');
    const speedCompVal = hudElement.querySelector('#nexus-compact-speed-val');
    const countCompVal = hudElement.querySelector('#nexus-compact-count-val');
    const checkComp = hudElement.querySelector('#nexus-compact-check');
    const statusExp = hudElement.querySelector('#nexus-exp-status');
    const checkExp = hudElement.querySelector('#nexus-exp-check');
    const counterExp = hudElement.querySelector('#nexus-exp-counter');
    const subExp = hudElement.querySelector('#nexus-exp-sub');
    const ringBar = hudElement.querySelector('#nexus-ring-bar');

    if (stackComp) stackComp.style.display = 'flex';
    if (speedCompVal) speedCompVal.innerText = '0.0 MB/s';
    if (countCompVal) countCompVal.innerText = `0/${count}`;
    if (checkComp) checkComp.style.display = 'none';

    if (statusExp) {
      statusExp.innerText = 'Baixando...';
      statusExp.classList.add('downloading');
    }
    if (checkExp) checkExp.style.display = 'none';
    if (counterExp) counterExp.innerText = `0/${count}`;
    if (subExp) subExp.innerText = 'DOWNLOAD ATIVO';

    if (ringBar) {
      ringBar.classList.remove('inactive');
      ringBar.classList.remove('completed');
      ringBar.style.stroke = '#00f2fe';
      ringBar.style.opacity = '1';
      ringBar.style.strokeDashoffset = '276';
    }
    hudElement.classList.remove('completed');
  }

  function updateHudProgress(completed, total, isCompleted, speed) {
    if (speed) downloadProgressState.speed = speed;
    const batch = getBatchProgress();

    const msgCompleted = (typeof completed === 'number' && !isNaN(completed)) ? completed : 0;
    const msgTotal = (typeof total === 'number' && !isNaN(total) && total > 0) ? total : 0;

    let effectiveTotal = currentBatchState.active && currentBatchState.total > 0 
      ? currentBatchState.total 
      : (batch.total > 0 ? batch.total : (msgTotal > 0 ? msgTotal : 1));

    let effectiveCompleted = Math.max(batch.completed, msgCompleted);
    if (effectiveCompleted > effectiveTotal && effectiveTotal > 0) {
      effectiveTotal = effectiveCompleted;
    }

    const effectivePct = effectiveTotal > 0 ? Math.min(100, Math.round((effectiveCompleted / effectiveTotal) * 100)) : 0;
    const effectiveIsFinished = (effectiveTotal > 0 && effectiveCompleted >= effectiveTotal) || batch.isFinished || isCompleted;

    downloadProgressState.completed = effectiveCompleted;
    downloadProgressState.total = effectiveTotal;
    downloadProgressState.isFinished = effectiveIsFinished;

    const stackComp = hudElement.querySelector('#nexus-compact-stack');
    const speedCompVal = hudElement.querySelector('#nexus-compact-speed-val');
    const countCompVal = hudElement.querySelector('#nexus-compact-count-val');
    const checkComp = hudElement.querySelector('#nexus-compact-check');
    const statusExp = hudElement.querySelector('#nexus-exp-status');
    const checkExp = hudElement.querySelector('#nexus-exp-check');
    const counterExp = hudElement.querySelector('#nexus-exp-counter');
    const subExp = hudElement.querySelector('#nexus-exp-sub');
    const ringBar = hudElement.querySelector('#nexus-ring-bar');

    const offset = Math.round(276 * (1 - effectivePct));

    if (effectiveIsFinished) {
      downloadProgressState.active = false;
      if (stackComp) stackComp.style.display = 'none';
      if (checkComp) checkComp.style.display = 'block';

      if (statusExp) {
        statusExp.innerText = 'Concluído!';
        statusExp.classList.remove('downloading');
        statusExp.style.color = '#00f5a0';
      }
      if (checkExp) checkExp.style.display = 'block';
      if (counterExp) counterExp.innerText = `${effectiveTotal}/${effectiveTotal}`;
      if (subExp) subExp.innerText = 'TODOS ARQUIVOS BAIXADOS';

      if (ringBar) {
        ringBar.classList.remove('inactive');
        ringBar.classList.add('completed');
        ringBar.style.stroke = '#00f5a0';
        ringBar.style.opacity = '1';
        ringBar.style.strokeDashoffset = '0';
      }

      hudElement.classList.add('completed');
    } else {
      if (stackComp) stackComp.style.display = 'flex';
      if (checkComp) checkComp.style.display = 'none';
      if (speedCompVal) speedCompVal.innerText = speed || downloadProgressState.speed || '0.0 MB/s';
      if (countCompVal) countCompVal.innerText = `${effectiveCompleted}/${effectiveTotal}`;
      if (counterExp) counterExp.innerText = `${effectiveCompleted}/${effectiveTotal}`;
      
      if (ringBar) {
        if (!downloadProgressState.active || (effectiveCompleted === 0 && offset === 276)) {
          ringBar.classList.add('inactive');
          ringBar.style.stroke = 'transparent';
          ringBar.style.opacity = '0';
        } else {
          ringBar.classList.remove('inactive');
          ringBar.style.stroke = 'var(--nexus-cyan)';
          ringBar.style.opacity = '1';
          ringBar.style.strokeDashoffset = `${offset}`;
        }
      }
      if (statusExp) {
        statusExp.innerText = speed ? speed : 'Baixando...';
        statusExp.classList.add('downloading');
        statusExp.style.color = 'var(--nexus-cyan)';
      }
      if (checkExp) checkExp.style.display = 'none';
      if (subExp) subExp.innerText = `${Math.round(effectivePct * 100)}% CONCLUÍDO`;
      hudElement.classList.remove('completed');
    }
  }

  // Modal de Seleção de Arquivos (In-Page)
  function showSelectionModal() {
    if (document.getElementById('nexus-modal-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'nexus-modal-overlay';
    overlay.setAttribute('dir', 'ltr');
    overlay.classList.add('nexus-root-container');

    let filesHtml = detectedFiles.map((file, idx) => `
      <div class="nexus-modal-file-row">
        <div class="nexus-modal-file-info">
          <input type="checkbox" class="nexus-file-chk" data-index="${idx}" checked>
          <span title="${file.filename}">${file.filename}</span>
        </div>
        <span class="nexus-tag-type">${file.type}</span>
      </div>
    `).join('');

    const sTag = getServiceTagStyle(downloadProgressState.service, window.location.href);

    overlay.innerHTML = `
      <div class="nexus-modal-card">
        <div class="nexus-modal-header">
          <div class="nexus-modal-brand">
            <svg viewBox="0 0 100 100">
              <path d="M 28 64 C 18 64 12 56 12 46 C 12 37 19 30 28 30 C 32 20 42 14 54 14 C 67 14 77 22 80 32 C 87 33 92 40 92 48 C 92 57 85 64 76 64 Z" 
                    fill="none" stroke="url(#nexusGrad1)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M 50 18 L 62 46 L 53 46 L 53 60 L 64 60 L 50 82 L 36 60 L 47 60 L 47 46 L 38 46 Z" 
                    fill="none" stroke="url(#nexusGrad2)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <div>
              <div class="nexus-modal-title-nexus">NEXUS</div>
              <div class="nexus-modal-title-downloader">DOWNLOADER</div>
            </div>
          </div>
          <button class="nexus-btn-ctrl close" id="nexus-modal-close" style="width:28px; height:28px; display:flex; align-items:center; justify-content:center;"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>

        <div class="nexus-modal-subbar">
          <div style="display:flex; align-items:center; gap:6px;">
            <span class="nexus-tag-service" style="background: ${sTag.bg}; color: ${sTag.color}; border: 1px solid ${sTag.border}; font-weight: 700; padding: 2px 7px; border-radius: 4px; font-size: 9px; line-height: 1.2;">${sTag.text}</span>
            <span style="font-weight:700;">${detectedFiles.length} Arquivos detectados</span>
          </div>
          <label style="cursor:pointer; display:flex; align-items:center; gap:4px;">
            <input type="checkbox" id="nexus-select-all" checked>
            <span>Select all</span>
          </label>
        </div>

        <div class="nexus-modal-files-list">
          ${filesHtml}
        </div>

        <button class="nexus-btn-download-action" id="nexus-btn-confirm-download">
          ${getActionBtnText()}
        </button>
      </div>
    `;

    document.body.appendChild(overlay);

    // Eventos do Modal
    overlay.querySelector('#nexus-modal-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    const chkSelectAll = overlay.querySelector('#nexus-select-all');
    const chks = overlay.querySelectorAll('.nexus-file-chk');
    chkSelectAll.addEventListener('change', () => {
      chks.forEach(c => c.checked = chkSelectAll.checked);
    });

    overlay.querySelector('#nexus-btn-confirm-download').addEventListener('click', () => {
      const selected = [];
      chks.forEach(c => {
        if (c.checked) {
          const idx = parseInt(c.getAttribute('data-index'));
          selected.push(detectedFiles[idx]);
        }
      });

      if (!selected.length) {
        alert('Selecione ao menos um arquivo para baixar.');
        return;
      }

      if (downloadProgressState.active && !downloadProgressState.isFinished) {
        showRestartConfirmModal(() => {
          overlay.remove();
          restartCurrentDownload(selected);
        });
        return;
      }

      overlay.remove();
      startHudDownload(selected.length);

      // Remover os itens selecionados de detectedFiles (movendo-os para Baixando)
      const selIds = new Set(selected.map(s => String(s.id)));
      const selUrls = new Set(selected.map(s => s.url || s.directUrl || ''));
      detectedFiles = detectedFiles.filter(f => !selIds.has(String(f.id)) && !selUrls.has(f.url || f.directUrl || ''));
      updateHudInitialStats();
      setBatchItems(selected);

      const newDownloadingItems = selected.map((t, idx) => ({
        id: t.id || `dl_${Date.now()}_${idx}`,
        url: t.url || t.directUrl || window.location.href,
        directUrl: t.directUrl || t.downloadUrl || t.url,
        downloadUrl: t.downloadUrl || t.directUrl || t.url,
        filename: t.filename || t.name || 'arquivo',
        name: t.name || t.filename || 'arquivo',
        status: 'downloading',
        progress: 0,
        speed: 'Iniciando...',
        size: t.size || 0,
        sizeFormatted: t.sizeFormatted || (t.size ? formatBytes(t.size) : ''),
        service: t.service || downloadProgressState.service,
        type: t.type || downloadProgressState.type,
        source: 'web',
        bunkrSlug: t.bunkrSlug || (t.url ? (t.url.match(/\/(?:f|v|i|d)\/([a-zA-Z0-9_-]+)/i) || [])[1] : null),
        fileId: t.fileId || t.bunkrSlug || (t.url ? (t.url.match(/\/(?:f|v|i|d)\/([a-zA-Z0-9_-]+)/i) || [])[1] : null)
      }));

      const existingIdMap = new Map(currentDownloadItems.map(i => [String(i.id), i]));
      newDownloadingItems.forEach(item => {
        existingIdMap.set(String(item.id), item);
      });
      currentDownloadItems = Array.from(existingIdMap.values());

      activeManagerFilter = 'downloading';
      localStorage.setItem('nexus_mgr_active_tab', 'downloading');

      chrome.runtime.sendMessage({
        action: 'START_DOWNLOAD',
        items: selected
      });
      showDownloadManagerModal();
    });
  }

  function restartCurrentDownload(customItems) {
    const items = customItems && customItems.length ? customItems : detectedFiles;
    startHudDownload(items.length);
    setBatchItems(items);
    currentDownloadItems = items.map((f, idx) => ({
      id: f.id || idx,
      name: f.filename || f.name || 'arquivo',
      status: 'downloading',
      progress: 0,
      speed: '',
      size: f.size || 0,
      sizeFormatted: f.sizeFormatted || (f.size ? formatBytes(f.size) : ''),
      service: f.service || downloadProgressState.service,
      type: f.type || downloadProgressState.type
    }));

    chrome.runtime.sendMessage({
      action: 'START_DOWNLOAD',
      items: items,
      restart: true
    });

    if (downloadManagerOverlay) {
      updateDownloadManagerUI();
    }
  }

  function showRestartConfirmModal(onConfirm) {
    const existing = document.getElementById('nexus-confirm-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'nexus-confirm-overlay';
    overlay.setAttribute('dir', 'ltr');
    overlay.classList.add('nexus-root-container');
    overlay.innerHTML = `
      <div class="nexus-confirm-card">
        <div class="nexus-confirm-icon"><svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>
        <div class="nexus-confirm-title">Reiniciar Download?</div>
        <div class="nexus-confirm-desc">
          O download do lote já está em andamento. Deseja interromper e reiniciar os downloads do início?
        </div>
        <div class="nexus-confirm-actions">
          <button class="nexus-btn-confirm-cancel" id="nexus-confirm-btn-cancel">Continuar Baixando</button>
          <button class="nexus-btn-confirm-restart" id="nexus-confirm-btn-restart">Sim, Reiniciar</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('#nexus-confirm-btn-cancel').addEventListener('click', () => {
      overlay.remove();
    });

    overlay.querySelector('#nexus-confirm-btn-restart').addEventListener('click', () => {
      overlay.remove();
      if (typeof onConfirm === 'function') onConfirm();
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
  }

  function showDownloadManagerModal() {
    let overlay = document.getElementById('nexus-manager-overlay');
    if (overlay) {
      closeDownloadManagerModal();
      return;
    }

    overlay = document.createElement('div');
    overlay.id = 'nexus-manager-overlay';
    overlay.setAttribute('dir', 'ltr');
    overlay.classList.add('nexus-root-container');
    downloadManagerOverlay = overlay;

    const initialBatch = getBatchProgress();
    const total = initialBatch.total;
    const completed = initialBatch.completed;
    const pct = initialBatch.pct;
    const initialLabel = initialBatch.total > 0 ? `${completed} de ${total} (${pct}%)` : (detectedFiles.length > 0 ? `0 de ${detectedFiles.length} (0%)` : '0 de 0 (0%)');
    const initialStatus = initialBatch.activeCount > 0 ? 'Baixando' : (initialBatch.isFinished && initialBatch.total > 0 ? 'Concluído' : 'Pronto');

    // Recuperar aba ativa salva anteriormente
    activeManagerFilter = localStorage.getItem('nexus_mgr_active_tab') || 'all';

    overlay.innerHTML = `
      <div class="nexus-manager-card">
        <!-- CABEÇALHO COM LOGO OFICIAL E TÍTULOS -->
        <div class="nexus-manager-header">
          <div class="nexus-modal-brand">
            <svg class="nexus-brand-svg" viewBox="0 0 100 100" style="width:36px; height:36px; filter: drop-shadow(0 0 8px rgba(0, 242, 254, 0.65));">
              <defs>
                <linearGradient id="mgrGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#c084fc"/>
                  <stop offset="50%" stop-color="#38bdf8"/>
                  <stop offset="100%" stop-color="#00f2fe"/>
                </linearGradient>
                <linearGradient id="mgrGrad2" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stop-color="#38bdf8"/>
                  <stop offset="100%" stop-color="#00f2fe"/>
                </linearGradient>
              </defs>
              <g>
                <path d="M 28 64 C 18 64 12 56 12 46 C 12 37 19 30 28 30 C 32 20 42 14 54 14 C 67 14 77 22 80 32 C 87 33 92 40 92 48 C 92 57 85 64 76 64 Z" 
                      fill="none" stroke="url(#mgrGrad1)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M 50 18 L 62 46 L 53 46 L 53 60 L 64 60 L 50 82 L 36 60 L 47 60 L 47 46 L 38 46 Z" 
                      fill="none" stroke="url(#mgrGrad2)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
              </g>
            </svg>
            <div>
              <div class="nexus-modal-title-nexus">NEXUS</div>
              <div class="nexus-modal-title-downloader">GERENCIADOR DE DOWNLOADS</div>
            </div>
          </div>
          <button class="nexus-btn-ctrl close" id="nexus-mgr-close" style="width:28px; height:28px; display:flex; align-items:center; justify-content:center;"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>

        <!-- PAINEL DE RESUMO ATIVO (ESTILO DOWNLOAD PANEL DA PORTABLE) -->
        <div class="nexus-manager-stats-panel">
          <div class="nexus-manager-stats-grid">
            <div class="nexus-stat-box">
              <span class="nexus-stat-box-label">Velocidade Global</span>
              <span class="nexus-stat-box-val highlight" id="nexus-mgr-speed">${downloadProgressState.speed || '0.0 MB/s'}</span>
            </div>
            <div class="nexus-stat-box">
              <span class="nexus-stat-box-label">Progresso do Lote</span>
              <span class="nexus-stat-box-val" id="nexus-mgr-progress-txt">${initialLabel}</span>
            </div>
            <div class="nexus-stat-box">
              <span class="nexus-stat-box-label">Status</span>
              <span class="nexus-stat-box-val ${initialBatch.isFinished && initialBatch.total > 0 ? 'success' : (initialBatch.activeCount > 0 ? 'highlight' : '')}" id="nexus-mgr-status-txt">
                ${initialStatus}
              </span>
            </div>
          </div>
          <div class="nexus-manager-main-progress-bar-wrap">
            <div class="nexus-manager-main-progress-bar-fill ${initialBatch.isFinished && initialBatch.total > 0 ? 'completed' : ''}" id="nexus-mgr-main-bar" style="width: ${pct}%;"></div>
          </div>
        </div>

        <!-- TOOLBAR DE AÇÕES E SUBTABS (ESTILO DA ABA DOWNLOADS) -->
        <div class="nexus-manager-toolbar">
          <div class="nexus-manager-filter-tabs">
            <button class="nexus-filter-tab-btn ${activeManagerFilter === 'all' ? 'active' : ''}" data-filter="all">Lista para Downloads (<span id="nexus-mgr-count-all">0</span>)</button>
            <button class="nexus-filter-tab-btn ${activeManagerFilter === 'downloading' ? 'active' : ''}" data-filter="downloading">Baixando (<span id="nexus-mgr-count-dl">0</span>)</button>
            <button class="nexus-filter-tab-btn ${activeManagerFilter === 'completed' ? 'active' : ''}" data-filter="completed">Concluídos (<span id="nexus-mgr-count-comp">0</span>)</button>
            <button class="nexus-filter-tab-btn torbox ${activeManagerFilter === 'torbox' ? 'active' : ''}" data-filter="torbox">Torbox Cloud (<span id="nexus-mgr-count-torbox">0</span>)</button>
          </div>
          <div class="nexus-manager-actions-row">
            <button class="nexus-btn-manager-action" id="nexus-mgr-btn-config-folder" title="Configurar pasta onde os arquivos serão salvos">
              Pasta de Download
            </button>
            <button class="nexus-btn-manager-action" id="nexus-mgr-btn-folder" title="Abrir pasta de downloads">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px;"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>Abrir Pasta
            </button>
          </div>
        </div>

        <!-- SUB-BARRA DINÂMICA DE AÇÕES DE LOTE E SELEÇÃO -->
        <div class="nexus-manager-subbar" id="nexus-mgr-subbar"></div>

        <!-- LISTA DE ARQUIVOS (SCROLLÁVEL) -->
        <div class="nexus-manager-list" id="nexus-mgr-list"></div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('#nexus-mgr-close').addEventListener('click', () => closeDownloadManagerModal());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeDownloadManagerModal();
    });

    const filterBtns = overlay.querySelectorAll('.nexus-filter-tab-btn');
    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeManagerFilter = btn.getAttribute('data-filter');
        localStorage.setItem('nexus_mgr_active_tab', activeManagerFilter);
        selectedItemIds.clear();
        updateDownloadManagerUI();
      });
    });

    const btnConfigFolder = overlay.querySelector('#nexus-mgr-btn-config-folder');
    if (btnConfigFolder) {
      btnConfigFolder.addEventListener('click', () => {
        showInpageOptionsModal('folder');
      });
    }

    overlay.querySelector('#nexus-mgr-btn-folder').addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'OPEN_DOWNLOAD_FOLDER' });
    });

    updateDownloadManagerUI();

    downloadManagerInterval = setInterval(() => {
      chrome.runtime.sendMessage({ action: 'GET_ACTIVE_DOWNLOAD_PROGRESS' }, (res) => {
        if (res && res.data) {
          const d = res.data;
          downloadProgressState.completed = d.completed || 0;
          downloadProgressState.total = d.total || downloadProgressState.total;
          downloadProgressState.speed = d.speedFormatted || (d.speedMBs ? `${d.speedMBs.toFixed(1)} MB/s` : '');
          downloadProgressState.isFinished = d.isCompleted || false;
          if (d.items && d.items.length) {
            mergeProgressItems(d.items);
          }
          updateDownloadManagerUI();
        } else if (res && res.items) {
          if (res.items && res.items.length) {
            mergeProgressItems(res.items);
          }
          if (res.completed !== undefined) downloadProgressState.completed = res.completed;
          if (res.total !== undefined) downloadProgressState.total = res.total;
          if (res.speedFormatted) downloadProgressState.speed = res.speedFormatted;
          if (res.isCompleted !== undefined) downloadProgressState.isFinished = res.isCompleted;
          updateDownloadManagerUI();
        }
      });
    }, 800);
  }

  function closeDownloadManagerModal() {
    if (downloadManagerInterval) {
      clearInterval(downloadManagerInterval);
      downloadManagerInterval = null;
    }
    if (downloadManagerOverlay) {
      downloadManagerOverlay.remove();
      downloadManagerOverlay = null;
    }
  }

  function updateDownloadManagerUI() {
    if (!downloadManagerOverlay) return;

    const listEl = downloadManagerOverlay.querySelector('#nexus-mgr-list');
    const subbarEl = downloadManagerOverlay.querySelector('#nexus-mgr-subbar');
    const speedEl = downloadManagerOverlay.querySelector('#nexus-mgr-speed');
    const progressTxt = downloadManagerOverlay.querySelector('#nexus-mgr-progress-txt');
    const statusTxt = downloadManagerOverlay.querySelector('#nexus-mgr-status-txt');
    const mainBar = downloadManagerOverlay.querySelector('#nexus-mgr-main-bar');
    const countAll = downloadManagerOverlay.querySelector('#nexus-mgr-count-all');
    const countDl = downloadManagerOverlay.querySelector('#nexus-mgr-count-dl');
    const countComp = downloadManagerOverlay.querySelector('#nexus-mgr-count-comp');
    const countTorbox = downloadManagerOverlay.querySelector('#nexus-mgr-count-torbox');

    const detectedQueueItems = (detectedFiles || []).map((f, idx) => ({
      id: f.id || `det_${idx}`,
      url: f.url || f.directUrl || window.location.href,
      directUrl: f.directUrl || f.downloadUrl || f.url,
      downloadUrl: f.downloadUrl || f.directUrl || f.url,
      filename: f.filename || f.name || 'arquivo',
      name: f.filename || f.name || 'arquivo',
      status: 'pending',
      progress: 0,
      speed: '',
      size: f.size || 0,
      sizeFormatted: f.sizeFormatted || (f.size ? formatBytes(f.size) : ''),
      service: f.service || downloadProgressState.service,
      type: f.type || downloadProgressState.type,
      source: 'web',
      bunkrSlug: f.bunkrSlug || (f.url ? (f.url.match(/\/(?:f|v|i|d)\/([a-zA-Z0-9_-]+)/i) || [])[1] : null),
      fileId: f.fileId || f.bunkrSlug || (f.url ? (f.url.match(/\/(?:f|v|i|d)\/([a-zA-Z0-9_-]+)/i) || [])[1] : null)
    }));

    const downloadingItems = (currentDownloadItems || []).filter(i => i.status === 'downloading' || i.status === 'paused' || i.status === 'pending');
    const completedItems = (currentDownloadItems || []).filter(i => i.status === 'completed');

    let visibleItems = detectedQueueItems;
    if (activeManagerFilter === 'downloading') {
      visibleItems = downloadingItems;
    } else if (activeManagerFilter === 'completed') {
      visibleItems = completedItems;
    }

    const activeDlCount = downloadingItems.filter(i => i.status === 'downloading').length;
    const activePendingCount = downloadingItems.filter(i => i.status === 'pending').length;
    const batch = getBatchProgress();

    if (countAll) countAll.innerText = detectedFiles.length;
    if (countDl) countDl.innerText = downloadingItems.length;
    if (countComp) countComp.innerText = completedItems.length;
    if (countTorbox && torboxCloudData) countTorbox.innerText = torboxCloudData.length;

    if (speedEl) speedEl.innerText = downloadProgressState.speed || (activeDlCount > 0 ? 'Calculando...' : '0.0 MB/s');
    if (progressTxt) {
      if (batch.total > 0) {
        progressTxt.innerText = `${batch.completed} de ${batch.total} (${batch.pct}%)`;
      } else if (detectedFiles.length > 0) {
        progressTxt.innerText = `0 de ${detectedFiles.length} (0%)`;
      } else {
        progressTxt.innerText = `0 de 0 (0%)`;
      }
    }
    if (statusTxt) {
      if (activeDlCount > 0) {
        statusTxt.innerText = 'Baixando';
        statusTxt.className = 'nexus-stat-box-val highlight';
      } else if (activePendingCount > 0) {
        statusTxt.innerText = 'Em Espera';
        statusTxt.className = 'nexus-stat-box-val';
      } else if (batch.isFinished && batch.total > 0) {
        statusTxt.innerText = 'Concluído';
        statusTxt.className = 'nexus-stat-box-val success';
      } else {
        statusTxt.innerText = 'Pronto';
        statusTxt.className = 'nexus-stat-box-val';
      }
    }

    if (mainBar) {
      mainBar.style.width = `${batch.pct}%`;
      if (batch.isFinished && batch.total > 0) {
        mainBar.classList.add('completed');
      } else {
        mainBar.classList.remove('completed');
      }
    }

    // Contagem de selecionados na visualização atual
    const selectedVisibleCount = visibleItems.filter(i => selectedItemIds.has(String(i.id))).length;
    const allSelected = visibleItems.length > 0 && selectedVisibleCount === visibleItems.length;
    const pausedVisibleCount = visibleItems.filter(i => i.status === 'paused').length;

    // RENDERIZAR SUB-BARRA DINÂMICA
    if (subbarEl) {
      if (activeManagerFilter === 'all') {
        const startDlLabel = selectedVisibleCount > 0 
          ? `Iniciar Download (${selectedVisibleCount})` 
          : `Iniciar Download (${visibleItems.length})`;

        subbarEl.innerHTML = `
          <div class="nexus-subbar-left">
            <label class="nexus-subbar-select-all">
              <input type="checkbox" id="nexus-subbar-chk-all" ${allSelected ? 'checked' : ''}>
              <span>Selecionar Todos</span>
            </label>
            <button class="nexus-btn-manager-action primary" id="nexus-mgr-btn-start-dl" ${visibleItems.length === 0 ? 'disabled' : ''}>
              ${startDlLabel}
            </button>
          </div>
          <div class="nexus-subbar-actions">
            <button class="nexus-btn-manager-action" id="nexus-mgr-btn-copy-album" title="Copiar link do álbum ou página atual">
              Copiar Link do Álbum / Site
            </button>
            <button class="nexus-btn-manager-action clear" id="nexus-mgr-btn-clear-all" title="Limpar lista da extensão">
              Limpar Lista
            </button>
          </div>
        `;

        const chkAll = subbarEl.querySelector('#nexus-subbar-chk-all');
        if (chkAll) {
          chkAll.addEventListener('change', () => {
            if (chkAll.checked) {
              visibleItems.forEach(i => selectedItemIds.add(String(i.id)));
            } else {
              visibleItems.forEach(i => selectedItemIds.delete(String(i.id)));
            }
            updateDownloadManagerUI();
          });
        }

        const btnStartDl = subbarEl.querySelector('#nexus-mgr-btn-start-dl');
        if (btnStartDl) {
          btnStartDl.addEventListener('click', () => {
            const targets = selectedVisibleCount > 0
              ? visibleItems.filter(i => selectedItemIds.has(String(i.id)))
              : visibleItems;
            if (!targets.length) return;

            // Remover os itens iniciados de detectedFiles (movendo-os definitivamente para a aba Baixando)
            const targetIds = new Set(targets.map(t => String(t.id)));
            const targetUrls = new Set(targets.map(t => t.url || t.directUrl || ''));
            detectedFiles = detectedFiles.filter(f => !targetIds.has(String(f.id)) && !targetUrls.has(f.url || f.directUrl || ''));
            updateHudInitialStats();
            setBatchItems(targets);

            // Registrar imediatamente os arquivos selecionados na lista de downloads ativos
            const newDownloadingItems = targets.map((t, idx) => ({
              id: t.id || `dl_${Date.now()}_${idx}`,
              url: t.url || t.directUrl || window.location.href,
              directUrl: t.directUrl || t.downloadUrl || t.url,
              downloadUrl: t.downloadUrl || t.directUrl || t.url,
              filename: t.filename || t.name || 'arquivo',
              name: t.name || t.filename || 'arquivo',
              status: 'downloading',
              progress: 0,
              speed: 'Iniciando...',
              size: t.size || 0,
              sizeFormatted: t.sizeFormatted || (t.size ? formatBytes(t.size) : ''),
              service: t.service || downloadProgressState.service,
              type: t.type || downloadProgressState.type,
              source: 'web',
              bunkrSlug: t.bunkrSlug || (t.url ? (t.url.match(/\/(?:f|v|i|d)\/([a-zA-Z0-9_-]+)/i) || [])[1] : null),
              fileId: t.fileId || t.bunkrSlug || (t.url ? (t.url.match(/\/(?:f|v|i|d)\/([a-zA-Z0-9_-]+)/i) || [])[1] : null)
            }));

            const existingIdMap = new Map(currentDownloadItems.map(i => [String(i.id), i]));
            newDownloadingItems.forEach(item => {
              existingIdMap.set(String(item.id), item);
            });
            currentDownloadItems = Array.from(existingIdMap.values());

            startHudDownload(targets.length);
            chrome.runtime.sendMessage({
              action: 'START_DOWNLOAD',
              items: targets
            });

            // Alternar para a aba Baixando para acompanhar o progresso imediatamente
            activeManagerFilter = 'downloading';
            localStorage.setItem('nexus_mgr_active_tab', 'downloading');
            try {
              if (downloadManagerOverlay) {
                const allTabs = downloadManagerOverlay.querySelectorAll('.nexus-filter-tab-btn');
                allTabs.forEach(b => {
                  if (b.getAttribute('data-filter') === 'downloading') b.classList.add('active');
                  else b.classList.remove('active');
                });
              }
            } catch (eTab) {
              console.warn('[Nexus Manager] Falha ao alternar classes da aba:', eTab);
            }
            selectedItemIds.clear();
            updateDownloadManagerUI();
          });
        }

        const btnCopyAlbum = subbarEl.querySelector('#nexus-mgr-btn-copy-album');
        if (btnCopyAlbum) {
          btnCopyAlbum.addEventListener('click', () => {
            navigator.clipboard.writeText(window.location.href);
            const orig = btnCopyAlbum.innerText;
            btnCopyAlbum.innerText = 'Link Copiado!';
            setTimeout(() => { btnCopyAlbum.innerText = orig; }, 1500);
          });
        }

        const btnClearAll = subbarEl.querySelector('#nexus-mgr-btn-clear-all');
        if (btnClearAll) {
          btnClearAll.addEventListener('click', () => {
            detectedFiles = [];
            selectedItemIds.clear();
            updateDownloadManagerUI();
            updateHudInitialStats();
          });
        }
      } else if (activeManagerFilter === 'downloading') {
        const pauseLabel = selectedVisibleCount > 0 ? `Pausar (${selectedVisibleCount})` : 'Pausar Todos';
        const restartLabel = selectedVisibleCount > 0 ? `Reiniciar (${selectedVisibleCount})` : 'Reiniciar Todos';
        let resumeLabel = 'Retomar Todos os Downloads';
        if (selectedVisibleCount === 1) resumeLabel = 'Retomar 1 Download';
        else if (selectedVisibleCount > 1) resumeLabel = `Retomar (${selectedVisibleCount}) Downloads`;

        subbarEl.innerHTML = `
          <label class="nexus-subbar-select-all">
            <input type="checkbox" id="nexus-subbar-chk-all" ${allSelected ? 'checked' : ''}>
            <span>Selecionar Todos</span>
          </label>
          <div class="nexus-subbar-actions">
            <button class="nexus-btn-manager-action pause" id="nexus-mgr-btn-pause" ${visibleItems.length === 0 ? 'disabled' : ''}>
              ${pauseLabel}
            </button>
            ${pausedVisibleCount > 0 ? `
              <button class="nexus-btn-manager-action resume" id="nexus-mgr-btn-resume">
                ${resumeLabel}
              </button>
            ` : ''}
            <button class="nexus-btn-manager-action restart" id="nexus-mgr-btn-restart-active" ${visibleItems.length === 0 ? 'disabled' : ''}>
              ${restartLabel}
            </button>
            <button class="nexus-btn-manager-action clear" id="nexus-mgr-btn-clear-downloading" ${visibleItems.length === 0 ? 'disabled' : ''}>
              Limpar Baixando
            </button>
          </div>
        `;

        const chkAll = subbarEl.querySelector('#nexus-subbar-chk-all');
        if (chkAll) {
          chkAll.addEventListener('change', () => {
            if (chkAll.checked) {
              visibleItems.forEach(i => selectedItemIds.add(String(i.id)));
            } else {
              visibleItems.forEach(i => selectedItemIds.delete(String(i.id)));
            }
            updateDownloadManagerUI();
          });
        }

        const btnPause = subbarEl.querySelector('#nexus-mgr-btn-pause');
        if (btnPause) {
          btnPause.addEventListener('click', () => {
            const targetIds = selectedVisibleCount > 0
              ? visibleItems.filter(i => selectedItemIds.has(String(i.id))).map(i => i.id)
              : visibleItems.map(i => i.id);
            chrome.runtime.sendMessage({ action: 'PAUSE_DOWNLOADS', ids: targetIds }, (res) => {
              const idSet = new Set(targetIds.map(String));
              currentDownloadItems.forEach(i => {
                if (idSet.has(String(i.id))) i.status = 'paused';
              });
              updateDownloadManagerUI();
            });
          });
        }

        const btnResume = subbarEl.querySelector('#nexus-mgr-btn-resume');
        if (btnResume) {
          btnResume.addEventListener('click', () => {
            const targetIds = selectedVisibleCount > 0
              ? visibleItems.filter(i => selectedItemIds.has(String(i.id))).map(i => i.id)
              : visibleItems.filter(i => i.status === 'paused').map(i => i.id);
            chrome.runtime.sendMessage({ action: 'RESUME_DOWNLOADS', ids: targetIds }, (res) => {
              const idSet = new Set(targetIds.map(String));
              currentDownloadItems.forEach(i => {
                if (idSet.has(String(i.id))) i.status = 'downloading';
              });
              updateDownloadManagerUI();
            });
          });
        }

        const btnRestart = subbarEl.querySelector('#nexus-mgr-btn-restart-active');
        if (btnRestart) {
          btnRestart.addEventListener('click', () => {
            const targetItems = selectedVisibleCount > 0
              ? visibleItems.filter(i => selectedItemIds.has(String(i.id)))
              : visibleItems;
            showRestartConfirmModal(() => {
              restartCurrentDownload(targetItems);
            });
          });
        }

        const btnClearDl = subbarEl.querySelector('#nexus-mgr-btn-clear-downloading');
        if (btnClearDl) {
          btnClearDl.addEventListener('click', () => {
            const idsToCancel = visibleItems.map(i => i.id);
            chrome.runtime.sendMessage({ action: 'CANCEL_ACTIVE_DOWNLOADS', ids: idsToCancel }, () => {
              const set = new Set(idsToCancel.map(String));
              currentDownloadItems = currentDownloadItems.filter(i => !set.has(String(i.id)));
              selectedItemIds.clear();
              updateDownloadManagerUI();
            });
          });
        }
      } else if (activeManagerFilter === 'completed') {
        const redownloadText = selectedVisibleCount > 0 ? `Baixar Novamente (${selectedVisibleCount})` : 'Baixar Novamente';
        const deleteText = selectedVisibleCount > 0 ? `Deletar (${selectedVisibleCount})` : 'Deletar';

        subbarEl.innerHTML = `
          <label class="nexus-subbar-select-all">
            <input type="checkbox" id="nexus-subbar-chk-all" ${allSelected ? 'checked' : ''}>
            <span>Selecionar Todos</span>
          </label>
          <div class="nexus-subbar-actions">
            <button class="nexus-btn-manager-action restart" id="nexus-mgr-btn-redownload" ${selectedVisibleCount === 0 ? 'disabled' : ''} title="Baixar novamente os itens selecionados">
              ${redownloadText}
            </button>
            <button class="nexus-btn-manager-action cancel" id="nexus-mgr-btn-delete-selected" ${selectedVisibleCount === 0 ? 'disabled' : ''} title="Deletar itens selecionados da lista">
              ${deleteText}
            </button>
            <button class="nexus-btn-manager-action clear" id="nexus-mgr-btn-clear-completed" ${visibleItems.length === 0 ? 'disabled' : ''} title="Limpar todos os concluídos da lista">
              Limpar Concluídos
            </button>
          </div>
        `;

        const chkAll = subbarEl.querySelector('#nexus-subbar-chk-all');
        if (chkAll) {
          chkAll.addEventListener('change', () => {
            if (chkAll.checked) {
              visibleItems.forEach(i => selectedItemIds.add(String(i.id)));
            } else {
              visibleItems.forEach(i => selectedItemIds.delete(String(i.id)));
            }
            updateDownloadManagerUI();
          });
        }

        const btnRedownload = subbarEl.querySelector('#nexus-mgr-btn-redownload');
        if (btnRedownload) {
          btnRedownload.addEventListener('click', () => {
            const targets = visibleItems.filter(i => selectedItemIds.has(String(i.id)));
            if (!targets.length) return;
            startHudDownload(targets.length);
            chrome.runtime.sendMessage({ action: 'START_DOWNLOAD', items: targets });
            selectedItemIds.clear();
            updateDownloadManagerUI();
          });
        }

        const btnDeleteSel = subbarEl.querySelector('#nexus-mgr-btn-delete-selected');
        if (btnDeleteSel) {
          btnDeleteSel.addEventListener('click', () => {
            const targets = new Set(visibleItems.filter(i => selectedItemIds.has(String(i.id))).map(i => String(i.id)));
            currentDownloadItems = currentDownloadItems.filter(i => !targets.has(String(i.id)));
            selectedItemIds.clear();
            updateDownloadManagerUI();
          });
        }

        const btnClearComp = subbarEl.querySelector('#nexus-mgr-btn-clear-completed');
        if (btnClearComp) {
          btnClearComp.addEventListener('click', () => {
            // ESTRITAMENTE LOCAL na extensão (NÃO APAGA PC PORTABLE)
            currentDownloadItems = currentDownloadItems.filter(i => i.status !== 'completed');
            selectedItemIds.clear();
            chrome.runtime.sendMessage({ action: 'CLEAR_COMPLETED_DOWNLOADS' });
            updateDownloadManagerUI();
          });
        }
      } else if (activeManagerFilter === 'torbox') {
        subbarEl.innerHTML = `
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="color:#c084fc; font-weight:800; font-size:0.8rem; display:inline-flex; align-items:center;"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 5px;"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>Torbox Cloud Storage</span>
          </div>
          <div class="nexus-subbar-actions">
            <button class="nexus-btn-manager-action" id="nexus-mgr-btn-refresh-torbox" title="Atualizar dados da nuvem">
              Atualizar Nuvem
            </button>
          </div>
        `;

        const btnRefresh = subbarEl.querySelector('#nexus-mgr-btn-refresh-torbox');
        if (btnRefresh) {
          btnRefresh.addEventListener('click', () => {
            torboxCloudData = null;
            loadTorboxCloudFiles();
          });
        }
      }
    }

    // RENDERIZAR LISTA DE ARQUIVOS
    if (!listEl) return;

    // ABA TORBOX CLOUD
    if (activeManagerFilter === 'torbox') {
      renderTorboxCloudList(listEl);
      return;
    }

    // DEMAIS ABAS (all, downloading, completed)
    if (!visibleItems.length) {
      listEl.innerHTML = `
        <div style="text-align:center; padding: 36px 16px; color:#94a3b8; font-size:0.85rem;">
          Nenhum arquivo nesta categoria.
        </div>
      `;
      return;
    }

    listEl.innerHTML = visibleItems.map(item => {
      const isChecked = selectedItemIds.has(String(item.id));
      const itemPct = item.progress !== undefined ? Math.round(item.progress) : (item.status === 'completed' ? 100 : 0);
      let statusLabel = 'Na Fila';
      let statusClass = 'pending';
      if (item.status === 'completed') {
        statusLabel = 'Concluído';
        statusClass = 'completed';
      } else if (item.status === 'paused') {
        statusLabel = 'Pausado';
        statusClass = 'pending';
      } else if (item.status === 'downloading') {
        statusLabel = `Baixando ${itemPct}%`;
        statusClass = 'downloading';
      } else if (item.status === 'failed') {
        statusLabel = 'Cancelado / Falha';
        statusClass = 'failed';
      }

      const originalUrl = item.url || item.directUrl || window.location.href;
      const sTag = getServiceTagStyle(item.service, item.url || item.directUrl);
      const cleanType = (item.type || '.Arquivo').replace(/[\[\]]/g, '').replace(/^\.+/, '');
      const typeTagText = '.' + cleanType.charAt(0).toUpperCase() + cleanType.slice(1);
      const sTagText = String(sTag.text || 'Web').replace(/[\[\]]/g, '');

      return `
        <div class="nexus-manager-item" data-item-id="${item.id}">
          <div class="nexus-item-row-top">
            <div class="nexus-item-title-group">
              <input type="checkbox" class="nexus-item-chk" data-item-id="${item.id}" ${isChecked ? 'checked' : ''}>
              <span style="font-size: 1rem; flex-shrink: 0; display: inline-flex; align-items: center;">${getFileIcon(item.type)}</span>
              <span class="nexus-item-name" title="${item.name}">${item.name}</span>
            </div>
          </div>
          <div class="nexus-item-progress-bar-wrap">
            <div class="nexus-item-progress-bar-fill ${item.status === 'completed' ? 'completed' : ''}" style="width: ${itemPct}%;"></div>
          </div>
          <div class="nexus-item-row-bottom">
            <div class="nexus-item-bottom-left">
              <span class="nexus-item-status-tag ${statusClass}">${statusLabel}</span>
              ${item.sizeFormatted ? `<span class="nexus-item-size">${item.sizeFormatted}</span>` : ''}
              <span class="nexus-tag-service" style="background: ${sTag.bg}; color: ${sTag.color}; border: 1px solid ${sTag.border}; font-weight: 700; padding: 1px 6px; border-radius: 4px; font-size: 8.5px; white-space: nowrap;">${sTagText}</span>
              ${sTagText !== 'Web' ? `<span class="nexus-tag-origin" style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.35); font-weight: 700; padding: 1px 6px; border-radius: 4px; font-size: 8.5px; white-space: nowrap;">Web</span>` : ''}
              <span class="nexus-tag-type" style="padding: 1px 6px; font-size: 8.5px; white-space: nowrap;">${typeTagText}</span>
              ${item.speed ? `<span style="color:#38bdf8; font-weight:700; font-size:0.72rem;">${item.speed}</span>` : ''}
            </div>
            <div class="nexus-item-actions-btn-group">
              <button class="nexus-btn-item-action copy-link" data-url="${originalUrl}" title="Copiar Link Original"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
              <button class="nexus-btn-item-action open-browser" data-url="${originalUrl}" title="Abrir Página"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></button>
              <button class="nexus-btn-item-action remove-item" data-remove-id="${item.id}" title="Remover da lista"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Eventos dos Checkboxes Individuais
    listEl.querySelectorAll('.nexus-item-chk').forEach(chk => {
      chk.addEventListener('change', (e) => {
        e.stopPropagation();
        const id = chk.getAttribute('data-item-id');
        if (chk.checked) selectedItemIds.add(String(id));
        else selectedItemIds.delete(String(id));
        updateDownloadManagerUI();
      });
    });

    // Eventos de Copiar Link
    listEl.querySelectorAll('.nexus-btn-item-action.copy-link').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const targetUrl = btn.getAttribute('data-url');
        if (targetUrl) {
          navigator.clipboard.writeText(targetUrl);
          btn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#34d399" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
          setTimeout(() => {
            btn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
          }, 1200);
        }
      });
    });

    // Eventos de Abrir no Navegador
    listEl.querySelectorAll('.nexus-btn-item-action.open-browser').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const targetUrl = btn.getAttribute('data-url');
        if (targetUrl) {
          window.open(targetUrl, '_blank');
        }
      });
    });

    // Eventos de Remover da Lista
    listEl.querySelectorAll('.nexus-btn-item-action.remove-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const removeId = btn.getAttribute('data-remove-id');
        if (activeManagerFilter === 'all') {
          detectedFiles = detectedFiles.filter((f, idx) => String(f.id || `det_${idx}`) !== String(removeId));
        } else {
          currentDownloadItems = currentDownloadItems.filter(i => String(i.id) !== String(removeId));
        }
        selectedItemIds.delete(String(removeId));
        updateDownloadManagerUI();
        updateHudInitialStats();
      });
    });
  }

  async function loadTorboxCloudFiles() {
    torboxLoading = true;
    updateDownloadManagerUI();
    try {
      const storage = await chrome.storage.local.get(['torboxApiKey']);
      if (!storage.torboxApiKey) {
        torboxCloudData = null;
        torboxLoading = false;
        updateDownloadManagerUI();
        return;
      }
      const res = await fetch('https://api.torbox.app/v1/api/torrents/mylist?bypass_cache=true', {
        headers: { 'Authorization': 'Bearer ' + storage.torboxApiKey }
      });
      if (res.ok) {
        const json = await res.json();
        torboxCloudData = json.data || [];
      } else {
        torboxCloudData = [];
      }
    } catch (e) {
      console.warn('[Content] Erro ao carregar Torbox Cloud:', e);
      torboxCloudData = [];
    }
    torboxLoading = false;
    updateDownloadManagerUI();
  }

  function renderTorboxCloudList(listEl) {
    chrome.storage.local.get(['torboxApiKey'], (storage) => {
      if (!storage.torboxApiKey) {
        listEl.innerHTML = `
          <div style="text-align:center; padding: 40px 20px; color:#cbd5e1;">
            <div style="margin-bottom:12px; display:flex; justify-content:center;">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-1.5 1.5L14 9l-3-3L2 15l4 4 9-9 3.5-3.5z"/><circle cx="7.5" cy="16.5" r="1.5"/></svg>
            </div>
            <div style="font-weight:700; font-size:1.05rem; color:#f8fafc; margin-bottom:6px;">Torbox API Não Configurada</div>
            <div style="font-size:0.82rem; color:#94a3b8; max-width:380px; margin:0 auto 18px auto; line-height:1.45;">
              Insira sua API Key do Torbox nas opções da extensão para acompanhar downloads e gerenciar arquivos da sua nuvem diretamente aqui.
            </div>
            <button class="nexus-btn-manager-action restart" id="nexus-mgr-btn-open-options" style="padding:8px 18px; margin:0 auto; display:inline-flex; align-items:center; gap:6px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              Abrir Opções da Extensão
            </button>
          </div>
        `;
        const btnOpt = listEl.querySelector('#nexus-mgr-btn-open-options');
        if (btnOpt) {
          btnOpt.addEventListener('click', () => {
            showInpageOptionsModal();
          });
        }
        return;
      }

      if (torboxLoading) {
        listEl.innerHTML = `
          <div style="text-align:center; padding: 36px 16px; color:#a78bfa; font-size:0.85rem; display:flex; align-items:center; justify-content:center; gap:8px;">
            <svg class="nexus-spin" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            Conectando à nuvem Torbox e listando arquivos...
          </div>
        `;
        return;
      }

      if (!torboxCloudData) {
        loadTorboxCloudFiles();
        return;
      }

      if (!torboxCloudData.length) {
        listEl.innerHTML = `
          <div style="text-align:center; padding: 36px 16px; color:#94a3b8; font-size:0.85rem;">
            Nenhum arquivo ou download ativo encontrado na sua nuvem Torbox.
          </div>
        `;
        return;
      }

      listEl.innerHTML = torboxCloudData.map(t => {
        const pct = Math.min(100, Math.round((t.progress || 0) * 100));
        const state = t.download_state || (pct === 100 ? 'completed' : 'downloading');
        const isCompleted = state === 'completed' || pct === 100;
        const sizeFormatted = t.size ? formatBytes(t.size) : '';
        const speedFormatted = t.download_speed ? `${(t.download_speed / (1024 * 1024)).toFixed(1)} MB/s` : '';

        return `
          <div class="nexus-manager-item">
            <div class="nexus-item-row-top">
              <div class="nexus-item-title-group">
                <span style="display:inline-flex; align-items:center; flex-shrink:0;">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>
                </span>
                <span class="nexus-item-name" title="${t.name}">${t.name}</span>
              </div>
              <div class="nexus-item-meta">
                ${sizeFormatted ? `<span>${sizeFormatted}</span>` : ''}
                <span class="nexus-tag-service" style="background:rgba(139,92,246,0.18); color:#a78bfa; border:1px solid rgba(139,92,246,0.4); font-weight: 700; padding: 1px 6px; border-radius: 4px; font-size: 8.5px; white-space: nowrap;">Torbox Cloud</span>
                <div class="nexus-item-actions-btn-group">
                  <button class="nexus-btn-item-action torbox-dl" data-torrent-id="${t.id}" data-name="${t.name}" title="Baixar arquivo da nuvem">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>
                  </button>
                </div>
              </div>
            </div>
            <div class="nexus-item-progress-bar-wrap">
              <div class="nexus-item-progress-bar-fill ${isCompleted ? 'completed' : ''}" style="width: ${pct}%;"></div>
            </div>
            <div class="nexus-item-row-bottom">
              <span class="nexus-item-status-tag ${isCompleted ? 'completed' : 'downloading'}">
                ${isCompleted ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle; margin-right:4px;"><polyline points="20 6 9 17 4 12"/></svg>Concluído na Nuvem' : `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle; margin-right:4px;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>Baixando ${pct}%`}
              </span>
              <span>${speedFormatted || (isCompleted ? 'Pronto para download' : '')}</span>
            </div>
          </div>
        `;
      }).join('');

      listEl.querySelectorAll('.nexus-btn-item-action.torbox-dl').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const torrentId = btn.getAttribute('data-torrent-id');
          const torrentName = btn.getAttribute('data-name');
          btn.innerHTML = '<svg class="nexus-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>';
          try {
            const dlRes = await fetch(`https://api.torbox.app/v1/api/torrents/requestdl?token=${storage.torboxApiKey}&torrent_id=${torrentId}&zip=true`);
            if (dlRes.ok) {
              const dlData = await dlRes.json();
              const link = dlData.data || dlData.detail;
              if (link && typeof link === 'string' && link.startsWith('http')) {
                chrome.runtime.sendMessage({
                  action: 'START_DOWNLOAD',
                  items: [{
                    url: link,
                    filename: `${torrentName}.zip`,
                    service: 'Torbox',
                    type: '.Zip'
                  }]
                });
                btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>';
                return;
              }
            }
          } catch (err) {}
          btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
          setTimeout(() => { btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>'; }, 1500);
        });
      });
    });
  }

  let inpageOptionsBackdrop = null;

  function showInpageOptionsModal(focusSection) {
    const existing = document.getElementById('nexus-inpage-options-backdrop');
    if (existing) {
      existing.classList.add('active');
      if (focusSection === 'folder') {
        const folderCard = existing.querySelector('#nexus-inpage-folder-card');
        if (folderCard) {
          folderCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
          folderCard.classList.add('nexus-highlight-pulse');
          setTimeout(() => folderCard.classList.remove('nexus-highlight-pulse'), 1500);
        }
      }
      return;
    }

    inpageOptionsBackdrop = document.createElement('div');
    inpageOptionsBackdrop.id = 'nexus-inpage-options-backdrop';
    inpageOptionsBackdrop.setAttribute('dir', 'ltr');
    inpageOptionsBackdrop.classList.add('nexus-root-container');

    chrome.storage.local.get([
      'downloadEngine',
      'downloadOnlyViaExtension',
      'torboxApiKey',
      'monitoringMode',
      'telemetryEnabled',
      'hudEnabled',
      'downloadFolder'
    ], (res) => {
      let isExtensionOnly = false;
      let isUsingPortable = true;
      let currentMode = res.monitoringMode || 'supported';
      let torboxKey = res.torboxApiKey || '';
      let isTelemetry = res.telemetryEnabled !== false;
      let isHudLarge = res.hudState === 'expanded';
      let downloadFolder = res.downloadFolder || 'Nexus Downloads';

      chrome.runtime.sendMessage({ action: 'CHECK_BRIDGE_STATUS' }, (bridgeRes) => {
        inpageOptionsBackdrop.innerHTML = `
          <div id="nexus-inpage-options-window">
            <div class="nexus-inpage-header">
              <div class="nexus-inpage-header-left">
                ${NEXUS_SVG_LOGO}
                <div class="nexus-inpage-title">Configurações do Nexus Downloader</div>
              </div>
              <button class="nexus-inpage-btn-close" id="nexus-inpage-btn-close" title="Fechar configurações">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div class="nexus-inpage-body">
              <!-- CARD 1: SELETOR DUAL DO MOTOR DE DOWNLOAD -->
              <div class="nexus-inpage-card">
                <div class="nexus-inpage-card-title">Motor de Download Ativo</div>
                <div class="nexus-inpage-card-desc">Selecione o motor responsável por processar e baixar os arquivos detectados.</div>
                <div class="nexus-inpage-engine-modes">
                  <div class="nexus-inpage-engine-option mode-portable active" id="nexus-opt-engine-portable">
                    <div class="nexus-inpage-engine-radio">
                      <span class="nexus-inpage-radio-dot"></span>
                    </div>
                    <div>
                      <div class="nexus-inpage-engine-opt-title">Baixar Usando Motor do Nexus Portable PC</div>
                      <div class="nexus-inpage-engine-opt-desc">Arquivos e links serão enviados diretamente para o Nexus Downloader Portable no seu computador.</div>
                    </div>
                  </div>
                  <div class="nexus-inpage-engine-option mode-extension disabled" id="nexus-opt-engine-extension" style="opacity: 0.4; pointer-events: none; cursor: not-allowed;">
                    <div class="nexus-inpage-engine-radio">
                      <span class="nexus-inpage-radio-dot"></span>
                    </div>
                    <div>
                      <div class="nexus-inpage-engine-opt-title">Baixar usando motor da Extensão Nexus <span style="font-size:0.75rem; color:#ef4444; font-weight:normal;">(Desabilitado)</span></div>
                      <div class="nexus-inpage-engine-opt-desc">O download pelo navegador está desabilitado. Utilize o motor do Nexus Portable PC.</div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- CARD 2: CHAVE TORBOX E GATE VISUAL -->
              <div class="nexus-inpage-card">
                <div class="nexus-inpage-card-title" style="display:flex; align-items:center; gap:8px;">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-1.5 1.5L14 9l-3-3L2 15l4 4 9-9 3.5-3.5z"/><circle cx="7.5" cy="16.5" r="1.5"/></svg>
                  Integração Torbox Debrid
                </div>
                <div class="nexus-inpage-card-desc" id="nexus-inpage-torbox-desc">
                  ${isUsingPortable 
                    ? 'Chave sincronizada com a versão Portable. Edição e colagem desabilitadas (gerencie pela versão desktop).'
                    : 'Insira sua chave de API para desbloqueio direto no navegador de Torrents e hosts premium.'}
                </div>
                <div class="nexus-inpage-torbox-row">
                  <input type="password" class="nexus-inpage-torbox-input" id="nexus-inpage-torbox-key"
                    placeholder="Chave de API do Torbox"
                    value="${isUsingPortable ? '••••••••••••••••••••••••' : torboxKey}"
                    ${isUsingPortable ? 'disabled readonly' : ''}>
                  <button class="nexus-inpage-btn-action" id="nexus-inpage-btn-paste-torbox" ${isUsingPortable ? 'disabled' : ''} style="display:inline-flex; align-items:center; gap:4px;">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    Colar
                  </button>
                  <button class="nexus-inpage-btn-action" id="nexus-inpage-btn-test-torbox" ${isUsingPortable ? 'disabled' : ''} style="display:inline-flex; align-items:center; gap:4px;">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                    Testar
                  </button>
                  <span id="nexus-inpage-torbox-status" style="font-size:0.75rem; font-weight:700; color:${isUsingPortable ? '#34d399' : (torboxKey ? '#34d399' : '#94a3b8')};">
                    ${isUsingPortable ? '● Conectado' : (torboxKey ? '● Conectado' : '● Desconectado')}
                  </span>
                </div>
              </div>

              <!-- CARD 3: PASTA DE SALVAMENTO DOS DOWNLOADS (CONTEXTUAL) -->
              <div class="nexus-inpage-card" id="nexus-inpage-folder-card">
                <div class="nexus-inpage-card-title" style="display:flex; align-items:center; gap:8px;">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                  Pasta de Salvamento dos Downloads
                </div>
                <div class="nexus-inpage-card-desc" id="nexus-inpage-folder-desc">
                  ${isUsingPortable 
                    ? 'Desabilitado no navegador: Os arquivos são salvos diretamente na pasta configurada no Nexus Downloader Portable PC.'
                    : 'Escolha a subpasta dentro dos Downloads do seu navegador onde os arquivos serão salvos.'}
                </div>
                <div class="nexus-inpage-folder-row" style="display:flex; gap:8px; margin-top:8px; align-items:center;">
                  <input type="text" class="nexus-inpage-folder-input" id="nexus-inpage-folder-input"
                    style="flex:1; background:rgba(15,23,42,0.6); border:1px solid rgba(148,163,184,0.3); border-radius:8px; padding:7px 12px; color:#f1f5f9; font-size:0.82rem; ${isUsingPortable ? 'opacity:0.5; cursor:not-allowed;' : ''}"
                    placeholder="Subpasta (ex: Nexus Downloads)"
                    value="${isUsingPortable ? 'Gerenciado pelo Nexus Portable PC' : downloadFolder}"
                    ${isUsingPortable ? 'disabled readonly' : ''}>
                  <button class="nexus-inpage-btn-action" id="nexus-inpage-btn-open-folder" title="Abrir pasta de downloads" style="display:inline-flex; align-items:center; gap:4px;">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                    Abrir
                  </button>
                </div>
              </div>

              <!-- CARD 4: MODOS DE MONITORAMENTO -->
              <div class="nexus-inpage-card">
                <div class="nexus-inpage-card-title">Modo de Monitoramento</div>
                <div class="nexus-inpage-card-desc">Escolha onde o HUD e os detectores automáticos da extensão devem operar.</div>
                <div class="nexus-inpage-chips-row" id="nexus-inpage-monitoring-chips">
                  <button class="nexus-inpage-chip ${currentMode === 'disabled' ? 'active' : ''}" data-mode="disabled">Desligado</button>
                  <button class="nexus-inpage-chip ${currentMode === 'supported' ? 'active' : ''}" data-mode="supported">Sites Suportados</button>
                  <button class="nexus-inpage-chip ${currentMode === 'supported_torbox' ? 'active' : ''}" data-mode="supported_torbox">Sites Suportados + Torbox</button>
                  <button class="nexus-inpage-chip ${currentMode === 'universal' ? 'active' : ''}" data-mode="universal">Universal</button>
                </div>
              </div>

              <!-- CARD 5: HUD FLUTUANTE (TOGGLE VERDE) -->
              <div class="nexus-inpage-card">
                <div class="nexus-inpage-card-header">
                  <div>
                    <div class="nexus-inpage-card-title" style="display:flex; align-items:center; gap:8px;">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
                      Ativar HUD de Download Grande
                    </div>
                    <div class="nexus-inpage-card-desc">Exibir o HUD holográfico expandido. Se desligado, o ícone grande some e fica apenas o ícone pequeno.</div>
                  </div>
                  <label class="nexus-green-toggle">
                    <input type="checkbox" id="nexus-inpage-chk-hud" ${isHudLarge ? 'checked' : ''}>
                    <span class="nexus-green-slider"></span>
                  </label>
                </div>
              </div>

              <!-- CARD 6: TELEMETRIA (TOGGLE VERDE) -->
              <div class="nexus-inpage-card">
                <div class="nexus-inpage-card-header">
                  <div>
                    <div class="nexus-inpage-card-title" style="display:flex; align-items:center; gap:8px;">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                      Telemetria Analítica & Logs Locais
                    </div>
                    <div class="nexus-inpage-card-desc">Registrar diagnósticos locais de velocidade, provedores e integridade de rede.</div>
                  </div>
                  <label class="nexus-green-toggle">
                    <input type="checkbox" id="nexus-inpage-chk-telemetry" ${isTelemetry ? 'checked' : ''}>
                    <span class="nexus-green-slider"></span>
                  </label>
                </div>
              </div>
            </div>

            <div class="nexus-inpage-footer">
              <span id="nexus-inpage-save-feedback" style="font-size:0.82rem; font-weight:700; color:#34d399; margin-right:auto; display:none; align-items:center; gap:5px;">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Configurações Salvas com Sucesso!
              </span>
              <button class="nexus-inpage-btn-action" id="nexus-inpage-btn-cancel">Fechar</button>
              <button class="nexus-inpage-btn-save" id="nexus-inpage-btn-save" style="display:inline-flex; align-items:center; gap:6px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                Salvar Configurações
              </button>
            </div>
          </div>
        `;

        document.body.appendChild(inpageOptionsBackdrop);

        requestAnimationFrame(() => {
          inpageOptionsBackdrop.classList.add('active');
          if (focusSection === 'folder') {
            const folderCard = inpageOptionsBackdrop.querySelector('#nexus-inpage-folder-card');
            if (folderCard) {
              folderCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
              folderCard.classList.add('nexus-highlight-pulse');
              setTimeout(() => folderCard.classList.remove('nexus-highlight-pulse'), 1500);
            }
          }
        });

        setupInpageOptionsEvents(inpageOptionsBackdrop, isExtensionOnly, currentMode, torboxKey, downloadFolder);
      });
    });
  }

  function setupInpageOptionsEvents(backdrop, initialIsExtensionOnly, initialMode, initialTorboxKey, initialDownloadFolder) {
    let isUsingPort = true;
    let selectedMode = initialMode;
    let currentTorboxKey = initialTorboxKey;
    let currentDownloadFolder = initialDownloadFolder || 'Nexus Downloads';

    const optEnginePortable = backdrop.querySelector('#nexus-opt-engine-portable');
    const optEngineExtension = backdrop.querySelector('#nexus-opt-engine-extension');
    const descTorbox = backdrop.querySelector('#nexus-inpage-torbox-desc');
    const inputTorbox = backdrop.querySelector('#nexus-inpage-torbox-key');
    const btnPasteTorbox = backdrop.querySelector('#nexus-inpage-btn-paste-torbox');
    const btnTestTorbox = backdrop.querySelector('#nexus-inpage-btn-test-torbox');
    const torboxStatus = backdrop.querySelector('#nexus-inpage-torbox-status');
    const descFolder = backdrop.querySelector('#nexus-inpage-folder-desc');
    const inputFolder = backdrop.querySelector('#nexus-inpage-folder-input');
    const btnOpenFolder = backdrop.querySelector('#nexus-inpage-btn-open-folder');
    const chipsContainer = backdrop.querySelector('#nexus-inpage-monitoring-chips');
    const chkHud = backdrop.querySelector('#nexus-inpage-chk-hud');
    const chkTelemetry = backdrop.querySelector('#nexus-inpage-chk-telemetry');
    const btnClose = backdrop.querySelector('#nexus-inpage-btn-close');
    const btnCancel = backdrop.querySelector('#nexus-inpage-btn-cancel');
    const btnSave = backdrop.querySelector('#nexus-inpage-btn-save');
    const feedback = backdrop.querySelector('#nexus-inpage-save-feedback');

    function closeModal() {
      backdrop.classList.remove('active');
      setTimeout(() => {
        if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
      }, 250);
    }

    if (btnClose) btnClose.addEventListener('click', closeModal);
    if (btnCancel) btnCancel.addEventListener('click', closeModal);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeModal();
    });

    function setEngineMode() {
      isUsingPort = true;
      if (optEnginePortable) optEnginePortable.classList.add('active');
      if (optEngineExtension) {
        optEngineExtension.classList.remove('active');
        optEngineExtension.classList.add('disabled');
      }
      if (descTorbox) descTorbox.textContent = 'Chave sincronizada com a versão Portable. Edição e colagem desabilitadas (gerencie pela versão desktop).';
      if (inputTorbox) {
        inputTorbox.disabled = true;
        inputTorbox.readOnly = true;
        inputTorbox.value = '••••••••••••••••••••••••';
      }
      if (btnPasteTorbox) btnPasteTorbox.disabled = true;
      if (btnTestTorbox) btnTestTorbox.disabled = true;
      if (torboxStatus) {
        torboxStatus.textContent = '● Conectado';
        torboxStatus.style.color = '#34d399';
      }
      if (descFolder) {
        descFolder.textContent = 'Desabilitado no navegador: Os arquivos são salvos diretamente na pasta configurada no Nexus Downloader Portable PC.';
      }
      if (inputFolder) {
        inputFolder.disabled = true;
        inputFolder.readOnly = true;
        inputFolder.value = 'Gerenciado pelo Nexus Portable PC';
        inputFolder.style.opacity = '0.5';
        inputFolder.style.cursor = 'not-allowed';
      }
    }

    setEngineMode();

    if (optEnginePortable) {
      optEnginePortable.addEventListener('click', () => setEngineMode());
    }

    if (inputFolder) {
      inputFolder.addEventListener('input', () => {
        if (!isUsingPort) currentDownloadFolder = inputFolder.value;
      });
    }

    if (btnOpenFolder) {
      btnOpenFolder.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'OPEN_DOWNLOAD_FOLDER' });
      });
    }

    if (chkHud) {
      chkHud.addEventListener('change', () => {
        if (chkHud.checked) {
          expandHud();
        } else {
          minimizeHud();
        }
      });
    }

    if (btnPasteTorbox) {
      btnPasteTorbox.addEventListener('click', async () => {
        try {
          const text = await navigator.clipboard.readText();
          if (text) {
            inputTorbox.value = text.trim();
            currentTorboxKey = text.trim();
            torboxStatus.textContent = '● Conectado';
            torboxStatus.style.color = '#34d399';
          }
        } catch (e) {
          alert('Cole com Ctrl+V');
        }
      });
    }

    if (btnTestTorbox) {
      btnTestTorbox.addEventListener('click', async () => {
        const key = inputTorbox.value.trim();
        if (!key) {
          alert('Insira uma chave para testar.');
        } else {
          btnTestTorbox.innerHTML = '<svg class="nexus-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>';
          try {
            const res = await fetch('https://api.torbox.app/v1/api/user/me', {
              headers: { 'Authorization': `Bearer ${key}` }
            });
            if (res.ok) {
              torboxStatus.textContent = '● Conectado (Válida)';
              torboxStatus.style.color = '#34d399';
            } else {
              torboxStatus.textContent = '● Chave Inválida';
              torboxStatus.style.color = '#f87171';
            }
          } catch (e) {
            torboxStatus.textContent = '● Erro de Rede';
            torboxStatus.style.color = '#f87171';
          }
          btnTestTorbox.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> Testar';
        }
      });
    }

    if (chipsContainer) {
      chipsContainer.addEventListener('click', (e) => {
        const chip = e.target.closest('.nexus-inpage-chip');
        if (!chip) return;
        chipsContainer.querySelectorAll('.nexus-inpage-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        selectedMode = chip.getAttribute('data-mode');
      });
    }

    if (btnSave) {
      btnSave.addEventListener('click', () => {
        const isHudExpanded = chkHud ? chkHud.checked : false;
        const newSettings = {
          downloadOnlyViaExtension: false,
          downloadEngine: 'bridge',
          monitoringMode: selectedMode,
          telemetryEnabled: chkTelemetry ? chkTelemetry.checked : true,
          hudState: isHudExpanded ? 'expanded' : 'compact',
          hudEnabled: true
        };

        if (!isUsingPort) {
          newSettings.torboxApiKey = inputTorbox.value.trim();
          newSettings.downloadFolder = inputFolder ? (inputFolder.value.trim() || 'Nexus Downloads') : 'Nexus Downloads';
        }

        if (isHudExpanded) {
          expandHud();
        } else {
          minimizeHud();
        }

        chrome.storage.local.set(newSettings, () => {
          chrome.runtime.sendMessage({ action: 'SYNC_BRIDGE_STATE' });
          if (feedback) feedback.style.display = 'inline-flex';
          btnSave.disabled = true;
          setTimeout(() => {
            closeModal();
          }, 600);
        });
      });
    }
  }

  function getFileIcon(type) {
    if (!type) return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
    const lower = type.toLowerCase();
    if (lower.includes('vídeo') || lower.includes('video')) {
      return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>';
    }
    if (lower.includes('zip') || lower.includes('rar')) {
      return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>';
    }
    if (lower.includes('foto') || lower.includes('image')) {
      return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ec4899" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
    }
    if (lower.includes('torrent')) {
      return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 4.24 4.24"/><path d="m14.83 9.17 4.24-4.24"/><path d="m14.83 14.83 4.24 4.24"/><path d="m9.17 14.83-4.24 4.24"/><circle cx="12" cy="12" r="4"/></svg>';
    }
    if (lower.includes('áudio') || lower.includes('audio')) {
      return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#a855f7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';
    }
    return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function getFileType(url) {
    const lower = url.toLowerCase();
    if (lower.match(/\.(mp4|mkv|avi|mov|wmv|webm|flv|m4v)/)) return '.Vídeo';
    if (lower.match(/\.(zip|rar|7z|tar|gz|bz2)/)) return '.Zip';
    if (lower.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)/)) return '.Foto';
    if (lower.match(/\.(torrent|magnet)/)) return '.Torrents';
    if (lower.match(/\.(mp3|wav|flac|aac|ogg|m4a)/)) return '.Áudio';
    return '.Arquivo';
  }
})();
