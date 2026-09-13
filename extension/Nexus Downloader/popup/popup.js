// Nexus Downloader - Popup Script
document.addEventListener('DOMContentLoaded', async () => {
  const statusBadge = document.getElementById('status-badge');
  const statusText = document.getElementById('status-text');
  const chkRestoreHud = document.getElementById('chk-restore-hud');
  const btnEnginePortable = document.getElementById('btn-engine-portable');
  const btnEngineExtension = document.getElementById('btn-engine-extension');
  const chipsContainer = document.getElementById('monitoring-chips');
  const serviceTag = document.getElementById('current-service-tag');
  const detectedCount = document.getElementById('current-detected-count');
  const btnDownload = document.getElementById('btn-popup-download');
  const linkOptions = document.getElementById('link-options');

  let currentTabFiles = [];
  let isStandaloneEngine = false;

  function updateEngineUI() {
    isStandaloneEngine = false;
    if (btnEnginePortable) btnEnginePortable.classList.add('active');
    if (btnEngineExtension) {
      btnEngineExtension.classList.remove('active');
      btnEngineExtension.classList.add('disabled');
    }
    statusBadge.className = 'status-badge portable';
    statusText.innerText = 'Motor do Nexus Portable PC';
    checkBridgeStatus();
    btnDownload.innerText = 'Abrir Gerenciador de Downloads';
  }

  // 1. Checar conexão com o app desktop
  function checkBridgeStatus() {
    chrome.runtime.sendMessage({ action: 'CHECK_BRIDGE_STATUS' }, (res) => {
      if (res && res.connected) {
        statusBadge.className = 'status-badge portable';
        statusText.innerText = 'Motor do Nexus Portable PC';
      } else {
        statusBadge.className = 'status-badge offline';
        statusText.innerText = 'Desktop Desconectado';
      }
    });
  }

  // 2. Carregar configurações de motor, monitoramento e HUD
  chrome.storage.local.get([
    'monitoringMode',
    'hudState'
  ], (res) => {
    updateEngineUI();
    chrome.storage.local.set({
      downloadOnlyViaExtension: false,
      downloadEngine: 'bridge'
    });

    const activeMode = res.monitoringMode || 'supported';
    updateActiveChip(activeMode);

    chkRestoreHud.checked = res.hudState === 'expanded';
  });

  // Motor fixado exclusivamente no Nexus Portable PC
  if (btnEnginePortable) {
    btnEnginePortable.addEventListener('click', () => {
      updateEngineUI();
      chrome.storage.local.set({
        downloadOnlyViaExtension: false,
        downloadEngine: 'bridge'
      }, () => {
        chrome.runtime.sendMessage({ action: 'SYNC_BRIDGE_STATE' });
      });
    });
  }

  // Modos de Monitoramento
  chipsContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('.chip-btn');
    if (!btn) return;
    const mode = btn.getAttribute('data-mode');
    updateActiveChip(mode);
    chrome.storage.local.set({ monitoringMode: mode });
  });

  function updateActiveChip(mode) {
    chipsContainer.querySelectorAll('.chip-btn').forEach(btn => {
      if (btn.getAttribute('data-mode') === mode) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  // 3. Ativar hud de download grande na página ativa
  chkRestoreHud.addEventListener('change', async () => {
    const isLarge = chkRestoreHud.checked;
    chrome.storage.local.set({ hudState: isLarge ? 'expanded' : 'compact' });
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      chrome.tabs.sendMessage(tab.id, {
        action: 'SET_HUD_STATE',
        state: isLarge ? 'expanded' : 'compact'
      }).catch(() => {});
    }
  });

  function renderFileList(files, service) {
    currentTabFiles = files;
    serviceTag.style.display = 'inline-block';
    serviceTag.innerText = service || 'Download';
    detectedCount.innerText = `${files.length} Arquivo(s) detectados na página`;
    btnDownload.disabled = false;
  }

  // 4. Obter arquivos detectados na aba ativa
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      chrome.tabs.sendMessage(tab.id, { action: 'GET_DETECTED_FILES' }, (res) => {
        if (chrome.runtime.lastError || !res || !res.files || !res.files.length) {
          serviceTag.style.display = 'none';
          detectedCount.innerText = 'Nenhum arquivo na página';
          btnDownload.disabled = true;
          return;
        }

        renderFileList(res.files, res.service);

        // Se houver apenas 1 item detectado e a página for um álbum/pasta de hoster, requisitar scan ao bridge
        const tabUrl = tab.url || '';
        const isSupportedHoster = tabUrl.includes('gofile.io') || tabUrl.includes('bunkr') || tabUrl.includes('pixeldrain') || tabUrl.includes('drive.google.com') || tabUrl.includes('mediafire.com');
        if (res.files.length === 1 && isSupportedHoster) {
          chrome.runtime.sendMessage({ action: 'SCAN_PAGE_URL', url: tabUrl }, (scanRes) => {
            if (scanRes && scanRes.success && scanRes.files && scanRes.files.length > 0) {
              const mapped = scanRes.files.map(f => ({
                id: f.id,
                url: f.url || f.downloadUrl || f.directUrl || tabUrl,
                directUrl: f.directUrl || f.downloadUrl || f.url,
                filename: f.name || f.filename || 'arquivo',
                size: f.size || 0,
                service: res.service || 'Download',
                type: f.type || '.Arquivo'
              }));
              renderFileList(mapped, res.service);
            }
          });
        }
      });
    }

    // 4.1. Abrir imediatamente a janela do Gerenciador de Downloads In-Page ao clicar no ícone da extensão
    if (tab && tab.id) {
      chrome.tabs.sendMessage(tab.id, { action: 'SHOW_DOWNLOAD_MANAGER' }).catch(() => {});
    }
  } catch (e) {
    btnDownload.disabled = true;
  }

  // 5. Clique em Abrir Gerenciador de Downloads
  btnDownload.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      chrome.tabs.sendMessage(tab.id, { action: 'SHOW_DOWNLOAD_MANAGER' }).catch(() => {});
    }
    window.close();
  });

  // 6. Abrir tela de configurações (Janela In-Page Modal na página ativa)
  linkOptions.addEventListener('click', async (e) => {
    e.preventDefault();
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id) {
        chrome.tabs.sendMessage(tab.id, { action: 'SHOW_INPAGE_OPTIONS' }).catch(() => {
          chrome.runtime.openOptionsPage();
        });
      } else {
        chrome.runtime.openOptionsPage();
      }
    } catch (err) {
      chrome.runtime.openOptionsPage();
    }
    window.close();
  });
});
