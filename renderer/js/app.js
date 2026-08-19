// Elementos do DOM
const navItems = document.querySelectorAll('.nav-item');
const tabContents = document.querySelectorAll('.tab-content');

// Status Auth Sidebar
const authIndicator = document.getElementById('auth-indicator');
const authStatusText = document.getElementById('auth-status-text');
const authSidebarBtn = document.getElementById('auth-sidebar-btn');

// Scanner Elements
const inputDriveLink = document.getElementById('drive-link');
const btnPaste = document.getElementById('btn-paste');
const btnScan = document.getElementById('btn-scan');
const scanSpinner = document.getElementById('scan-spinner');
const scanEmptyState = document.getElementById('scan-empty-state');
const resultsContainer = document.getElementById('results-container');
const selectAllFiles = document.getElementById('select-all-files');
const selectedCountText = document.getElementById('selected-count');
const btnAddSelected = document.getElementById('btn-add-selected');
const resultsList = document.getElementById('results-list');

// Queue Elements
const activeDownloadPanel = document.getElementById('active-download-panel');
const activeFilename = document.getElementById('active-filename');
const activeProgressText = document.getElementById('active-progress-text');
const activeSpeedText = document.getElementById('active-speed-text');
const activeEtaText = document.getElementById('active-eta-text');
const activeBytesText = document.getElementById('active-bytes-text');
const activeProgressBar = document.getElementById('active-progress-bar');
const btnActivePause = document.getElementById('btn-active-pause');
const btnActiveCancel = document.getElementById('btn-active-cancel');
const queueTotalCount = document.getElementById('queue-total-count');
const queueItemsList = document.getElementById('queue-items-list');
const queueEmptyState = document.getElementById('queue-empty-state');
const queueBadge = document.getElementById('queue-badge');

const btnOpenDir = document.getElementById('btn-open-dir');
const btnClearCompleted = document.getElementById('btn-clear-completed');
const btnClearAll = document.getElementById('btn-clear-all');
const btnResumeAll = document.getElementById('btn-resume-all');
const btnPauseAll = document.getElementById('btn-pause-all');
const btnRestartAll = document.getElementById('btn-restart-all');

// Settings Elements
const settingDownloadPath = document.getElementById('setting-download-path');
const btnChangePath = document.getElementById('btn-change-path');
const settingConcurrency = document.getElementById('setting-concurrency');
const settingDownloadMode = document.getElementById('setting-download-mode');
const settingNotifications = document.getElementById('setting-notifications');

const settingsAuthDisconnected = document.getElementById('settings-auth-disconnected');
const settingsAuthConnected = document.getElementById('settings-auth-connected');
const credentialsDropzone = document.getElementById('credentials-dropzone');
const credentialsFileInput = document.getElementById('credentials-file-input');
const btnGoogleLogin = document.getElementById('btn-google-login');
const btnGoogleLogout = document.getElementById('btn-google-logout');
const credentialsError = document.getElementById('credentials-error');
const credentialsSuccess = document.getElementById('credentials-success');

const btnToggleWizard = document.getElementById('btn-toggle-wizard');
const wizardContent = document.getElementById('wizard-content');
const accordionContainer = document.querySelector('.accordion');

// Estado local dos arquivos escaneados
let scannedFiles = [];


// ==========================================
// Sistema Personalizado de Caixa de Diálogo (Modal Dark-Glass)
// ==========================================
function showCustomAlert(message, title = 'Nexus Downloader') {
  return new Promise((resolve) => {
    const overlay = document.getElementById('custom-modal-overlay');
    const titleEl = document.getElementById('custom-modal-title');
    const msgEl = document.getElementById('custom-modal-message');
    const cancelBtn = document.getElementById('custom-modal-cancel-btn');
    const okBtn = document.getElementById('custom-modal-ok-btn');

    if (!overlay) {
      alert(message);
      return resolve(true);
    }

    titleEl.textContent = title;
    msgEl.textContent = message;
    cancelBtn.style.display = 'none';
    okBtn.textContent = 'OK';
    overlay.style.display = 'flex';

    const handleOk = () => {
      okBtn.removeEventListener('click', handleOk);
      overlay.style.display = 'none';
      resolve(true);
    };

    okBtn.addEventListener('click', handleOk);
  });
}

function showCustomConfirm(message, title = 'Nexus Downloader') {
  return new Promise((resolve) => {
    const overlay = document.getElementById('custom-modal-overlay');
    const titleEl = document.getElementById('custom-modal-title');
    const msgEl = document.getElementById('custom-modal-message');
    const cancelBtn = document.getElementById('custom-modal-cancel-btn');
    const okBtn = document.getElementById('custom-modal-ok-btn');

    if (!overlay) {
      const res = confirm(message);
      return resolve(res);
    }

    titleEl.textContent = title;
    msgEl.textContent = message;
    cancelBtn.style.display = 'inline-block';
    cancelBtn.textContent = 'Cancelar';
    okBtn.textContent = 'Confirmar';
    overlay.style.display = 'flex';

    const handleOk = () => {
      cleanup();
      resolve(true);
    };

    const handleCancel = () => {
      cleanup();
      resolve(false);
    };

    const cleanup = () => {
      okBtn.removeEventListener('click', handleOk);
      cancelBtn.removeEventListener('click', handleCancel);
      overlay.style.display = 'none';
    };

    okBtn.addEventListener('click', handleOk);
    cancelBtn.addEventListener('click', handleCancel);
  });
}
// ==========================================
// Formatação Auxiliar
// ==========================================
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function formatETA(seconds) {
  if (!seconds || seconds === Infinity) return '--:--:--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [
    h.toString().padStart(2, '0'),
    m.toString().padStart(2, '0'),
    s.toString().padStart(2, '0')
  ].join(':');
}

// ==========================================
// Navegação por Abas
// ==========================================
navItems.forEach(item => {
  item.addEventListener('click', () => {
    const tabId = item.getAttribute('data-tab');
    console.log('[Tab Switch] Switching to tab:', tabId);
    
    navItems.forEach(nav => nav.classList.remove('active'));

    document.querySelectorAll('.tab-content').forEach(tab => {
      tab.classList.remove('active');
      tab.style.display = 'none';
    });

    document.querySelectorAll('.top-tab-content').forEach(el => {
      el.classList.remove('active');
      el.style.display = 'none';
    });

    item.classList.add('active');

    const targetTab = document.getElementById(`${tabId}-tab`);
    if (targetTab) {
      targetTab.classList.add('active');
      targetTab.style.display = 'flex';
      console.log(`[Tab Switch] ${tabId}-tab rect:`, targetTab.getBoundingClientRect());
    }

    const topContent = document.getElementById(`${tabId}-top-content`);
    if (topContent) {
      topContent.classList.add('active');
      topContent.style.display = 'block';
    }

    if (tabId === 'torbox') {
      loadTorboxDownloads();
      if (typeof startTorboxLivePolling === 'function') startTorboxLivePolling();
    } else {
      if (typeof stopTorboxLivePolling === 'function') stopTorboxLivePolling();
    }
  });
});

function switchTab(tabId) {
  const item = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
  if (item) {
    item.click();
  }
}

// ==========================================
// Status de Autenticação & Rodapé Duplo
// ==========================================
let currentFooterServiceIndex = 0;
let currentDisplayedService = 'gdrive';
let footerCycleInterval = null;

async function updateFooterStatus() {
  try {
    const auth = await window.api.checkAuth();
    const config = await window.api.getConfig();

    const gdriveConnected = auth && auth.connected;
    const torboxConnected = config && config.torboxApiKey && config.torboxEnabled;

    const container = document.getElementById('footer-status-container') || document.querySelector('.auth-status-container');
    const indicator = document.getElementById('footer-status-indicator') || document.getElementById('auth-indicator');
    const textSpan = document.getElementById('footer-status-text') || document.getElementById('auth-status-text');

    if (!container || !indicator || !textSpan) return;

    let targetService = 'gdrive';
    let isConnected = false;
    let label = '';

    if (gdriveConnected && torboxConnected) {
      // Cenário 1: Ambos conectados -> Alterna a cada 4s
      targetService = currentFooterServiceIndex % 2 === 0 ? 'gdrive' : 'torbox';
      isConnected = true;
      label = targetService === 'gdrive' ? 'Google Drive: Conectado' : 'Torbox API: Conectada';
      currentFooterServiceIndex++;
    } else if (!gdriveConnected && !torboxConnected) {
      // Cenário 3: Ambos desconectados -> Alterna a cada 4s
      targetService = currentFooterServiceIndex % 2 === 0 ? 'gdrive' : 'torbox';
      isConnected = false;
      label = targetService === 'gdrive' ? 'Google Drive: Desconectado' : 'Torbox API: Desconectada';
      currentFooterServiceIndex++;
    } else if (!gdriveConnected && torboxConnected) {
      // Cenário 2A: Apenas Google Drive desconectado -> Trava no Google Drive
      targetService = 'gdrive';
      isConnected = false;
      label = 'Google Drive: Desconectado';
    } else {
      // Cenário 2B: Apenas Torbox desconectado -> Trava no Torbox
      targetService = 'torbox';
      isConnected = false;
      label = 'Torbox API: Desconectada';
    }

    currentDisplayedService = targetService;

    // Transição suave de opacidade (fade-out / fade-in)
    container.classList.add('fade-out');
    setTimeout(() => {
      indicator.className = `status-indicator ${isConnected ? 'connected' : 'disconnected'}`;
      textSpan.textContent = label;
      applyFooterStatusPosition();
      container.classList.remove('fade-out');
    }, 300);

  } catch (err) {
    console.error('Erro ao atualizar status do rodapé:', err);
  }
}

function startFooterStatusCycle() {
  if (footerCycleInterval) clearInterval(footerCycleInterval);
  updateFooterStatus();
  footerCycleInterval = setInterval(updateFooterStatus, 4000);
}

async function checkAuthStatus() {
  try {
    const auth = await window.api.checkAuth();
    
    if (auth.connected) {
      settingsAuthDisconnected.style.display = 'none';
      settingsAuthConnected.style.display = 'block';
    } else {
      settingsAuthDisconnected.style.display = 'block';
      settingsAuthConnected.style.display = 'none';
      btnGoogleLogin.disabled = false;
    }
    updateFooterStatus();
  } catch (err) {
    console.error('Erro ao verificar status de autenticação:', err);
  }
}

// Evento de clique no status do rodapé -> Navega diretamente até o card correspondente em Ajustes
const footerStatusContainer = document.getElementById('footer-status-container') || document.querySelector('.auth-status-container');
if (footerStatusContainer) {
  footerStatusContainer.addEventListener('click', () => {
    switchTab('settings');
    setTimeout(() => {
      const targetId = currentDisplayedService === 'torbox' ? 'card-torbox-settings' : 'card-gdrive-settings';
      const targetCard = document.getElementById(targetId);
      if (targetCard) {
        targetCard.scrollIntoView({ behavior: 'smooth' });
      }
    }, 150);
  });
}

const btnCheckVersion = document.getElementById('btn-check-version');
const updateNotice = document.getElementById('update-notice');

if (btnCheckVersion) {
  btnCheckVersion.addEventListener('click', async () => {
    const icon = btnCheckVersion.querySelector('.version-refresh-icon');
    if (icon) icon.classList.add('spinning');

    const currentVer = (window.api && window.api.getAppVersion) ? (await window.api.getAppVersion()) : '1.2.0';

    try {
      const res = await window.api.checkForUpdates();
      if (icon) icon.classList.remove('spinning');

      if (res && res.success && res.updateInfo && res.updateInfo.version) {
        if (updateNotice) {
          updateNotice.textContent = 'Nova versão disponível';
          updateNotice.style.display = 'block';
        }
        await showCustomAlert(`Uma nova versão (v${res.updateInfo.version}) foi encontrada e está sendo baixada automaticamente!`, 'Atualização Disponível');
      } else {
        if (updateNotice) updateNotice.style.display = 'none';
        await showCustomAlert(`Seu Nexus Downloader já está atualizado na versão mais recente (v${currentVer})!`, 'Verificação de Atualização');
      }
    } catch (err) {
      if (icon) icon.classList.remove('spinning');
      if (updateNotice) updateNotice.style.display = 'none';
      await showCustomAlert(`Seu Nexus Downloader já está atualizado na versão mais recente (v${currentVer})!`, 'Verificação de Atualização');
    }
  });
}

// Escuta automática de eventos do Auto-Updater
if (window.api && window.api.onUpdaterStatus) {
  let updatePromptShown = false;

  window.api.onUpdaterStatus(async (data) => {
    if (!data) return;

    const updaterModal = document.getElementById('updater-modal-overlay');
    const progressBar = document.getElementById('updater-progress-bar');
    const percentText = document.getElementById('updater-progress-percent');
    const sizeText = document.getElementById('updater-size-text');
    const speedText = document.getElementById('updater-speed-text');

    if (data.status === 'available') {
      if (updateNotice) {
        updateNotice.textContent = `Nova v${data.version || ''} disponível`;
        updateNotice.style.display = 'block';
      }

      if (!updatePromptShown) {
        updatePromptShown = true;
        const wantDownload = await showCustomConfirm(
          `Uma nova versão (v${data.version || ''}) do Nexus Downloader está disponível! Deseja baixar e instalar a nova versão agora?`,
          'Atualização Disponível'
        );

        if (wantDownload) {
          if (updateNotice) {
            updateNotice.textContent = 'Iniciando download...';
          }
          await window.api.downloadUpdate();
        }
      }
    } else if (data.status === 'downloading') {
      if (updateNotice) {
        updateNotice.textContent = `Baixando atualização: ${data.percent || 0}%...`;
        updateNotice.style.display = 'block';
      }

      if (updaterModal) updaterModal.style.display = 'flex';
      if (progressBar) progressBar.style.width = `${data.percent || 0}%`;
      if (percentText) percentText.textContent = `${data.percent || 0}%`;
      if (sizeText) sizeText.textContent = `${formatBytes(data.transferred || 0)} / ${formatBytes(data.total || 0)}`;
      if (speedText) speedText.textContent = `${data.mbps || '0.00'} Mbps`;
    } else if (data.status === 'downloaded') {
      if (updaterModal) updaterModal.style.display = 'none';
      if (updateNotice) {
        updateNotice.textContent = 'Versão pronta para instalar';
        updateNotice.style.display = 'block';
      }
      const wantInstall = await showCustomConfirm(
        `A nova versão v${data.version || ''} foi baixada com sucesso! Clique em Confirmar para reiniciar o Nexus Downloader, atualizar o ícone na área de trabalho e abrir na nova versão.`,
        'Atualização Pronta'
      );

      if (wantInstall) {
        window.api.restartAndInstall();
      }
    } else if (data.status === 'error') {
      if (updaterModal) updaterModal.style.display = 'none';
    }
  });
}
// Configuração do drag & drop do credentials.json
credentialsDropzone.addEventListener('click', () => {
  credentialsFileInput.click();
});

credentialsDropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  credentialsDropzone.classList.add('dragover');
});

credentialsDropzone.addEventListener('dragleave', () => {
  credentialsDropzone.classList.remove('dragover');
});

credentialsDropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  credentialsDropzone.classList.remove('dragover');
  
  if (e.dataTransfer.files.length > 0) {
    handleCredentialsFile(e.dataTransfer.files[0]);
  }
});

credentialsFileInput.addEventListener('change', () => {
  if (credentialsFileInput.files.length > 0) {
    handleCredentialsFile(credentialsFileInput.files[0]);
  }
});

function handleCredentialsFile(file) {
  if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
    showToast(credentialsError, 'Por favor, selecione um arquivo JSON válido.');
    return;
  }

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const content = e.target.result;
      const res = await window.api.saveCredentials(content);
      if (res.success) {
        showToast(credentialsSuccess, 'Arquivo credentials.json carregado com sucesso!');
        checkAuthStatus();
      } else {
        showToast(credentialsError, 'Erro ao validar o JSON do arquivo de credenciais.');
      }
    } catch (err) {
      showToast(credentialsError, 'Erro ao ler arquivo.');
    }
  };
  reader.readAsText(file);
}

function showToast(element, message) {
  element.textContent = message;
  element.style.display = 'block';
  setTimeout(() => {
    element.style.display = 'none';
  }, 4000);
}

// Botões de login / logout
btnGoogleLogin.addEventListener('click', async () => {
  const auth = await window.api.checkAuth();
  if (!auth.hasCreds) {
    showToast(credentialsError, 'Por favor, adicione seu arquivo credentials.json acima antes de conectar.');
    // Rola a tela até a zona de upload para chamar atenção do usuário
    credentialsDropzone.scrollIntoView({ behavior: 'smooth' });
    return;
  }

  try {
    btnGoogleLogin.disabled = true;
    btnGoogleLogin.textContent = 'Aguardando Login no Navegador...';
    await window.api.login();
    checkAuthStatus();
  } catch (err) {
    await showCustomAlert('Erro no login: ' + err.message, 'Erro de Conexão');
  } finally {
    btnGoogleLogin.textContent = 'Conectar Conta Google';
    btnGoogleLogin.disabled = false;
  }
});

btnGoogleLogout.addEventListener('click', async () => {
  if (await showCustomConfirm('Deseja realmente desconectar sua conta Google?', 'Desconectar Conta')) {
    await window.api.logout();
    checkAuthStatus();
  }
});

if (authSidebarBtn) {
  authSidebarBtn.addEventListener('click', () => {
    const isConnected = authIndicator.classList.contains('connected');
    if (isConnected) {
      btnGoogleLogout.click();
    } else {
      switchTab('settings');
    }
  });
}

// Accordion do guia de credenciais
btnToggleWizard.addEventListener('click', () => {
  accordionContainer.classList.toggle('open');
  if (accordionContainer.classList.contains('open')) {
    wizardContent.style.maxHeight = wizardContent.scrollHeight + "px";
  } else {
    wizardContent.style.maxHeight = 0;
  }
});

// ==========================================
// Configurações do App
// ==========================================
async function loadConfig() {
  const config = await window.api.getConfig();
  settingDownloadPath.value = config.downloadPath;
  settingConcurrency.value = config.maxConcurrent.toString();
  if (settingDownloadMode) {
    settingDownloadMode.value = config.downloadMode || 'single';
  }

  const modes = config.downloadModes || {};
  const elGdrive = document.getElementById('setting-mode-gdrive');
  const elBunkr = document.getElementById('setting-mode-bunkr');
  const elMediaFire = document.getElementById('setting-mode-mediafire');
  const elTeraBox = document.getElementById('setting-mode-terabox');
  const elOneDrive = document.getElementById('setting-mode-onedrive');
  const elTorbox = document.getElementById('setting-mode-torbox');

  if (elGdrive) elGdrive.value = modes.gdrive || 'single';
  if (elBunkr) elBunkr.value = modes.bunkr || 'multi';
  if (elMediaFire) elMediaFire.value = modes.mediafire || 'multi';
  if (elTeraBox) elTeraBox.value = modes.terabox || 'multi';
  if (elOneDrive) elOneDrive.value = modes.onedrive || 'single';
  if (elTorbox) elTorbox.value = modes.torbox || 'multi';

  const settingTorboxKey = document.getElementById('setting-torbox-api-key');
  const settingTorboxEnabled = document.getElementById('setting-torbox-enabled');
  if (settingTorboxKey) settingTorboxKey.value = config.torboxApiKey || '';
  if (settingTorboxEnabled) settingTorboxEnabled.checked = !!config.torboxEnabled;

  settingNotifications.checked = config.notificationsEnabled;
}

['gdrive', 'bunkr', 'mediafire', 'terabox', 'onedrive', 'torbox'].forEach(service => {
  const el = document.getElementById(`setting-mode-${service}`);
  if (el) {
    el.addEventListener('change', async () => {
      const config = await window.api.getConfig();
      const modes = config.downloadModes || { gdrive: 'single', bunkr: 'multi', mediafire: 'multi', terabox: 'multi', onedrive: 'single', torbox: 'multi' };
      modes[service] = el.value;
      await window.api.setConfig({ downloadModes: modes });
    });
  }
});

const settingTorboxKey = document.getElementById('setting-torbox-api-key');
const settingTorboxEnabled = document.getElementById('setting-torbox-enabled');
const btnTestTorboxKey = document.getElementById('btn-test-torbox-key');
const torboxKeyStatus = document.getElementById('torbox-key-status');
const btnToggleTorboxKey = document.getElementById('btn-toggle-torbox-key');
const iconEyeShow = document.getElementById('icon-eye-show');
const iconEyeHide = document.getElementById('icon-eye-hide');

if (btnToggleTorboxKey && settingTorboxKey) {
  btnToggleTorboxKey.addEventListener('click', () => {
    const isPassword = settingTorboxKey.type === 'password';
    settingTorboxKey.type = isPassword ? 'text' : 'password';
    if (iconEyeShow && iconEyeHide) {
      iconEyeShow.style.display = isPassword ? 'none' : 'block';
      iconEyeHide.style.display = isPassword ? 'block' : 'none';
    }
  });
}

if (settingTorboxKey) {
  settingTorboxKey.addEventListener('change', async () => {
    await window.api.setConfig({ torboxApiKey: settingTorboxKey.value.trim() });
  });
}

if (settingTorboxEnabled) {
  settingTorboxEnabled.addEventListener('change', async () => {
    await window.api.setConfig({ torboxEnabled: settingTorboxEnabled.checked });
  });
}

if (btnTestTorboxKey) {
  btnTestTorboxKey.addEventListener('click', async () => {
    const key = settingTorboxKey ? settingTorboxKey.value.trim() : '';
    if (!key) {
      if (torboxKeyStatus) {
        torboxKeyStatus.style.display = 'block';
        torboxKeyStatus.style.color = '#ef4444';
        torboxKeyStatus.textContent = 'Por favor, insira uma API Key antes de testar.';
      }
      return;
    }

    btnTestTorboxKey.disabled = true;
    btnTestTorboxKey.textContent = 'Testando...';
    if (torboxKeyStatus) torboxKeyStatus.style.display = 'none';

    try {
      const res = await window.api.testTorboxApiKey(key);
      if (torboxKeyStatus) {
        torboxKeyStatus.style.display = 'block';
        if (res.success) {
          torboxKeyStatus.style.color = '#10b981';
          torboxKeyStatus.textContent = '✓ ' + res.message;
          await window.api.setConfig({ torboxApiKey: key, torboxEnabled: true });
          if (settingTorboxEnabled) settingTorboxEnabled.checked = true;
        } else {
          torboxKeyStatus.style.color = '#ef4444';
          torboxKeyStatus.textContent = '✕ ' + (res.message || 'Falha na conexão.');
        }
      }
    } catch (e) {
      if (torboxKeyStatus) {
        torboxKeyStatus.style.display = 'block';
        torboxKeyStatus.style.color = '#ef4444';
        torboxKeyStatus.textContent = '✕ Erro ao validar a chave.';
      }
    } finally {
      btnTestTorboxKey.disabled = false;
      btnTestTorboxKey.textContent = 'Validar Conexão';
    }
  });
}

btnChangePath.addEventListener('click', async () => {
  const newPath = await window.api.selectDownloadDir();
  if (newPath) {
    settingDownloadPath.value = newPath;
  }
});

settingConcurrency.addEventListener('change', async () => {
  const val = parseInt(settingConcurrency.value);
  await window.api.setConfig({ maxConcurrent: val });
});

if (settingDownloadMode) {
  settingDownloadMode.addEventListener('change', async () => {
    const val = settingDownloadMode.value;
    await window.api.setConfig({ downloadMode: val });
  });
}

settingNotifications.addEventListener('change', async () => {
  const checked = settingNotifications.checked;
  await window.api.setConfig({ notificationsEnabled: checked });
});

// ==========================================
// Scanner de Links do Drive
// ==========================================
function formatUrlsText(rawText) {
  if (!rawText || typeof rawText !== 'string') return '';
  let normalized = rawText.replace(/(https?:\/\/[^\s"'<>]+?)(https?:\/\/)/gi, '$1\n$2');
  const matches = normalized.match(/(https?:\/\/[^\s"'<>]+)/gi) || [];
  const cleanUrls = matches
    .map(u => u.trim().replace(/[,;]+$/, ''))
    .filter(u => u.length > 0);
  return [...new Set(cleanUrls)].join('\n');
}

function autoResizeTextarea(el) {
  if (!el) return;
  el.style.height = '44px';
  const newHeight = Math.min(Math.max(el.scrollHeight, 44), 260);
  el.style.height = `${newHeight}px`;
}

btnPaste.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    const formatted = formatUrlsText(text);
    inputDriveLink.value = formatted || text;
    autoResizeTextarea(inputDriveLink);
  } catch (err) {
    console.error('Falha ao ler área de transferência:', err);
  }
});

if (inputDriveLink) {
  inputDriveLink.addEventListener('input', () => autoResizeTextarea(inputDriveLink));
  inputDriveLink.addEventListener('paste', (e) => {
    e.preventDefault();
    const pastedData = (e.clipboardData || window.clipboardData).getData('text');
    const formatted = formatUrlsText(pastedData);

    const start = inputDriveLink.selectionStart;
    const end = inputDriveLink.selectionEnd;
    const val = inputDriveLink.value;

    const before = val.substring(0, start);
    const after = val.substring(end);

    const prefix = (before && !before.endsWith('\n')) ? '\n' : '';
    const suffix = (after && !after.startsWith('\n')) ? '\n' : '';

    const insertText = formatted || pastedData;
    inputDriveLink.value = before + prefix + insertText + suffix + after;
    inputDriveLink.selectionStart = inputDriveLink.selectionEnd = before.length + prefix.length + insertText.length;
    autoResizeTextarea(inputDriveLink);
  });
}

btnScan.addEventListener('click', async () => {
  const url = inputDriveLink.value.trim();
  if (!url) {
    await showCustomAlert('Por favor, cole um link do Google Drive, Bunkr, MediaFire, TeraBox, Microsoft OneDrive ou Torbox (Torrents/Debrid) para escanear.', 'Link Inválido');
    return;
  }

  // Prepara animação
  btnScan.disabled = true;
  scanSpinner.style.display = 'block';
  btnScan.querySelector('.btn-text').textContent = 'Escaneando...';
  
  scanEmptyState.style.display = 'none';

  try {
    const files = await window.api.scanLink(url);
    if (!files || files.length === 0) {
      await showCustomAlert('Nenhum arquivo encontrado no link fornecido.', 'Escaneamento Concluído');
      if (scannedFiles.length === 0) scanEmptyState.style.display = 'flex';
      return;
    }

    files.forEach(nf => {
      if (!scannedFiles.some(existing => existing.id === nf.id)) {
        scannedFiles.push(nf);
      }
    });

    if (inputDriveLink) inputDriveLink.value = '';
    renderResults();
  } catch (err) {
    await showCustomAlert('Erro ao escanear link: ' + err.message, 'Erro no Escaneamento');
    if (scannedFiles.length === 0) scanEmptyState.style.display = 'flex';
  } finally {
    btnScan.disabled = false;
    scanSpinner.style.display = 'none';
    btnScan.querySelector('.btn-text').textContent = 'Escanear Links';
  }
});

const btnClearScanned = document.getElementById('btn-clear-scanned');
if (btnClearScanned) {
  btnClearScanned.addEventListener('click', () => {
    scannedFiles = [];
    if (resultsGroupsContainer) resultsGroupsContainer.innerHTML = '';
    if (resultsList) resultsList.innerHTML = '';
    resultsContainer.style.display = 'none';
    if (btnStartDownloadMain) btnStartDownloadMain.style.display = 'none';
    scanEmptyState.style.display = 'flex';
  });
}

const resultsGroupsContainer = document.getElementById('results-groups-container');
const resultsTableWrapperSingle = document.getElementById('results-table-wrapper-single');

function updateGroupCheckboxState(groupCb, tbody) {
  const itemCbs = tbody.querySelectorAll('.file-checkbox');
  let checkedCount = 0;
  itemCbs.forEach(c => { if (c.checked) checkedCount++; });

  if (checkedCount === 0) {
    groupCb.checked = false;
    groupCb.indeterminate = false;
  } else if (checkedCount === itemCbs.length) {
    groupCb.checked = true;
    groupCb.indeterminate = false;
  } else {
    groupCb.checked = false;
    groupCb.indeterminate = true;
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderResults() {
  if (resultsGroupsContainer) resultsGroupsContainer.innerHTML = '';
  if (resultsList) resultsList.innerHTML = '';
  resultsContainer.style.display = 'flex';
  scanEmptyState.style.display = 'none';
  
  selectAllFiles.checked = true;

  if (!scannedFiles || scannedFiles.length === 0) {
    updateSelectionSummary();
    return;
  }

  // Agrupa arquivos por caminho de subpasta/diretório
  const groupsMap = new Map();
  scannedFiles.forEach((file, index) => {
    let groupKey = file.folderName || 'Downloads';
    if (!file.folderName && file.relativePath && file.relativePath.includes('/')) {
      const parts = file.relativePath.split('/').filter(Boolean);
      const cleanParts = parts.filter((part, idx) => idx === 0 || part !== parts[idx - 1]);
      groupKey = cleanParts.length > 1 ? cleanParts.slice(0, -1).join(' / ') : cleanParts[0];
    }

    if (!groupsMap.has(groupKey)) {
      groupsMap.set(groupKey, []);
    }
    groupsMap.get(groupKey).push({ file, index });
  });

  const isMultiGroup = groupsMap.size >= 1;

  if (isMultiGroup && resultsGroupsContainer) {
    if (resultsTableWrapperSingle) resultsTableWrapperSingle.style.display = 'none';
    resultsGroupsContainer.style.display = 'flex';

    groupsMap.forEach((groupItems, groupName) => {
      const totalGroupSize = groupItems.reduce((acc, item) => acc + item.file.size, 0);

      const card = document.createElement('div');
      card.className = 'folder-group-card collapsed';

      // Header
      const header = document.createElement('div');
      header.className = 'folder-group-header';

      const titleGroup = document.createElement('div');
      titleGroup.className = 'folder-group-title-group';

      const groupCb = document.createElement('input');
      groupCb.type = 'checkbox';
      groupCb.className = 'folder-group-checkbox';
      groupCb.checked = true;

      const folderIcon = document.createElement('div');
      folderIcon.className = 'queue-folder-icon';
      folderIcon.style.marginRight = '2px';
      folderIcon.innerHTML = `
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
        </svg>
      `;

      const sampleFile = groupItems[0].file;
      const serviceTag = getServiceTag(sampleFile);
      const folderTag = getFolderTypeTag(groupItems.map(gi => gi.file), groupName);

      const serviceSpan = document.createElement('span');
      serviceSpan.style.cssText = `background: ${serviceTag.bg}; color: ${serviceTag.color}; border: 1px solid ${serviceTag.border}; font-weight: 700; padding: 2px 7px; border-radius: 4px; font-size: 11px; margin-right: 6px; display: inline-block; vertical-align: middle;`;
      serviceSpan.textContent = serviceTag.text;

      const folderTypeSpan = document.createElement('span');
      folderTypeSpan.style.cssText = `background: ${folderTag.bg}; color: ${folderTag.color}; border: 1px solid ${folderTag.border}; font-weight: 700; padding: 2px 7px; border-radius: 4px; font-size: 11px; margin-right: 8px; display: inline-block; vertical-align: middle;`;
      folderTypeSpan.textContent = folderTag.text;

      const nameSpan = document.createElement('span');
      nameSpan.className = 'folder-group-name';
      nameSpan.textContent = groupName;

      titleGroup.appendChild(groupCb);
      titleGroup.appendChild(folderIcon);
      titleGroup.appendChild(serviceSpan);
      titleGroup.appendChild(folderTypeSpan);
      titleGroup.appendChild(nameSpan);

      const metaDiv = document.createElement('div');
      metaDiv.className = 'folder-group-meta';

      const badge = document.createElement('span');
      badge.className = 'badge-cyan folder-group-badge';
      badge.textContent = `${groupItems.length} arquivo(s) • ${formatBytes(totalGroupSize)}`;

      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'folder-group-toggle';
      toggleBtn.title = 'Expandir / Recolher';
      toggleBtn.innerHTML = `
        <svg class="folder-group-chevron" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      `;

      metaDiv.appendChild(badge);
      metaDiv.appendChild(toggleBtn);

      header.appendChild(titleGroup);
      header.appendChild(metaDiv);

      // Body (Tabela)
      const body = document.createElement('div');
      body.className = 'folder-group-body';

      const tableWrapper = document.createElement('div');
      tableWrapper.className = 'results-table-wrapper';

      const table = document.createElement('table');
      table.className = 'results-table';
      table.innerHTML = `
        <thead>
          <tr>
            <th width="40"></th>
            <th>Nome do Arquivo</th>
            <th>Caminho Relativo</th>
            <th width="120">Tamanho</th>
          </tr>
        </thead>
      `;

      const tbody = document.createElement('tbody');

      groupItems.forEach(({ file, index }) => {
        const row = document.createElement('tr');

        const tdCheck = document.createElement('td');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = true;
        cb.dataset.index = index;
        cb.className = 'file-checkbox';
        cb.addEventListener('change', () => {
          updateGroupCheckboxState(groupCb, tbody);
          updateSelectionSummary();
        });
        tdCheck.appendChild(cb);

        const tdName = document.createElement('td');
        tdName.className = 'text-truncate';
        const sTag = getServiceTag(file);
        const fTag = getFileTypeTag(file);
        tdName.innerHTML = `<span style="background: ${sTag.bg}; color: ${sTag.color}; border: 1px solid ${sTag.border}; font-weight: 700; padding: 2px 6px; border-radius: 4px; font-size: 10px; margin-right: 6px; display: inline-block; vertical-align: middle;">${sTag.text}</span><span style="background: ${fTag.bg}; color: ${fTag.color}; border: 1px solid ${fTag.border}; font-weight: 700; padding: 2px 6px; border-radius: 4px; font-size: 10px; margin-right: 6px; display: inline-block; vertical-align: middle;">${fTag.text}</span>${file.name}`;
        tdName.title = file.name;

        const tdPath = document.createElement('td');
        tdPath.className = 'text-truncate';
        tdPath.textContent = file.relativePath || file.name;
        tdPath.title = file.relativePath || file.name;

        const tdSize = document.createElement('td');
        tdSize.textContent = formatBytes(file.size);

        row.appendChild(tdCheck);
        row.appendChild(tdName);
        row.appendChild(tdPath);
        row.appendChild(tdSize);

        tbody.appendChild(row);
      });

      table.appendChild(tbody);
      tableWrapper.appendChild(table);
      body.appendChild(tableWrapper);

      card.appendChild(header);
      card.appendChild(body);

      // Eventos
      header.addEventListener('click', (e) => {
        if (e.target === groupCb || e.target.type === 'checkbox') return;
        card.classList.toggle('collapsed');
      });

      groupCb.addEventListener('change', () => {
        const itemCbs = tbody.querySelectorAll('.file-checkbox');
        itemCbs.forEach(c => c.checked = groupCb.checked);
        groupCb.indeterminate = false;
        updateSelectionSummary();
      });

      resultsGroupsContainer.appendChild(card);
    });
  } else {
    // Exibição simples
    if (resultsGroupsContainer) resultsGroupsContainer.style.display = 'none';
    if (resultsTableWrapperSingle) resultsTableWrapperSingle.style.display = 'block';

    scannedFiles.forEach((file, index) => {
      const row = document.createElement('tr');
      
      const tdCheck = document.createElement('td');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = true;
      checkbox.dataset.index = index;
      checkbox.className = 'file-checkbox';
      checkbox.addEventListener('change', updateSelectionSummary);
      tdCheck.appendChild(checkbox);
      
      const tdName = document.createElement('td');
      tdName.className = 'text-truncate';
      const sTag = getServiceTag(file);
      const fTag = getFileTypeTag(file);
      tdName.innerHTML = `<span style="background: ${sTag.bg}; color: ${sTag.color}; border: 1px solid ${sTag.border}; font-weight: 700; padding: 2px 6px; border-radius: 4px; font-size: 10px; margin-right: 6px; display: inline-block; vertical-align: middle;">${sTag.text}</span><span style="background: ${fTag.bg}; color: ${fTag.color}; border: 1px solid ${fTag.border}; font-weight: 700; padding: 2px 6px; border-radius: 4px; font-size: 10px; margin-right: 6px; display: inline-block; vertical-align: middle;">${fTag.text}</span>${file.name}`;
      tdName.title = file.name;
      
      const tdPath = document.createElement('td');
      tdPath.className = 'text-truncate';
      tdPath.textContent = file.relativePath || file.name;
      tdPath.title = file.relativePath || file.name;
      
      const tdSize = document.createElement('td');
      tdSize.textContent = formatBytes(file.size);
      
      row.appendChild(tdCheck);
      row.appendChild(tdName);
      row.appendChild(tdPath);
      row.appendChild(tdSize);
      
      resultsList.appendChild(row);
    });
  }

  updateSelectionSummary();
  if (scannedFiles.length > 0) {
    btnAddSelected.style.display = 'inline-flex';
  }
}

selectAllFiles.addEventListener('change', () => {
  const allFileCbs = document.querySelectorAll('.file-checkbox');
  const allGroupCbs = document.querySelectorAll('.folder-group-checkbox');
  
  allFileCbs.forEach(cb => cb.checked = selectAllFiles.checked);
  allGroupCbs.forEach(cb => {
    cb.checked = selectAllFiles.checked;
    cb.indeterminate = false;
  });

  updateSelectionSummary();
});

function updateSelectionSummary() {
  const allFileCbs = document.querySelectorAll('.file-checkbox');
  let selectedCount = 0;
  let selectedSize = 0;
  
  allFileCbs.forEach(cb => {
    if (cb.checked) {
      selectedCount++;
      const index = parseInt(cb.dataset.index);
      if (scannedFiles[index]) {
        selectedSize += scannedFiles[index].size;
      }
    }
  });

  selectedCountText.textContent = `${selectedCount} arquivos selecionados (${formatBytes(selectedSize)})`;
  btnAddSelected.disabled = selectedCount === 0;

  if (allFileCbs.length > 0) {
    if (selectedCount === 0) {
      selectAllFiles.checked = false;
      selectAllFiles.indeterminate = false;
    } else if (selectedCount === allFileCbs.length) {
      selectAllFiles.checked = true;
      selectAllFiles.indeterminate = false;
    } else {
      selectAllFiles.checked = false;
      selectAllFiles.indeterminate = true;
    }
  }
}

btnAddSelected.addEventListener('click', async () => {
  const allFileCbs = document.querySelectorAll('.file-checkbox');
  const selectedFiles = [];
  
  allFileCbs.forEach(cb => {
    if (cb.checked) {
      const index = parseInt(cb.dataset.index);
      if (scannedFiles[index]) {
        selectedFiles.push(scannedFiles[index]);
      }
    }
  });

  if (selectedFiles.length > 0) {
    const queueLength = await window.api.addToQueue(selectedFiles);
    
    // Alterna automaticamente para a aba Fila de Downloads sem aviso na tela
    switchTab('queue');
    
    // Reset scanner
    inputDriveLink.value = '';
    resultsContainer.style.display = 'none';
    scanEmptyState.style.display = 'flex';
    btnAddSelected.style.display = 'none';
    if (resultsList) resultsList.innerHTML = '';
    if (resultsGroupsContainer) resultsGroupsContainer.innerHTML = '';
    scannedFiles = [];
  }
});

// ==========================================
// Monitor e Gerenciador da Fila
// ==========================================
if (window.api && window.api.onQueueUpdated) {
  window.api.onQueueUpdated((queue) => {
    renderQueue(queue);
  });
}

// Estado local de pastas recolhidas/expandidas no accordion da fila
const collapsedFolders = new Set();
const expandedFolders = new Set();
const selectedQueueItemIds = new Set();

function getFileTypeTag(item) {
  const name = (item && item.name ? item.name : '').toLowerCase();

  const videoExts = ['.mkv', '.mp4', '.avi', '.webm', '.mov', '.flv', '.wmv', '.m4v', '.ts', '.m2ts', '.3gp', '.iso'];
  if (videoExts.some(ext => name.endsWith(ext))) {
    return { text: '.video', bg: 'rgba(6, 182, 212, 0.18)', color: '#38bdf8', border: 'rgba(6, 182, 212, 0.4)' };
  }

  if (name.endsWith('.zip') || name.endsWith('.7z') || name.endsWith('.tar') || name.endsWith('.gz') || name.endsWith('.bz2')) {
    return { text: '.Zip', bg: 'rgba(16, 185, 129, 0.18)', color: '#34d399', border: 'rgba(16, 185, 129, 0.4)' };
  }

  if (name.endsWith('.rar')) {
    return { text: '.Rar', bg: 'rgba(245, 158, 11, 0.18)', color: '#fbbf24', border: 'rgba(245, 158, 11, 0.4)' };
  }

  if (name.endsWith('.torrent') || (item && item.torboxType === 'torrent' && !name.includes('.'))) {
    return { text: '.Torrents', bg: 'rgba(139, 92, 246, 0.18)', color: '#a78bfa', border: 'rgba(139, 92, 246, 0.4)' };
  }

  return { text: 'Outros', bg: 'rgba(100, 116, 139, 0.18)', color: '#94a3b8', border: 'rgba(100, 116, 139, 0.4)' };
}

function getFolderTypeTag(folderItems, folderName) {
  const videoExts = ['.mkv', '.mp4', '.avi', '.webm', '.mov', '.flv', '.wmv', '.m4v', '.ts', '.m2ts', '.3gp', '.iso'];
  if (folderItems.some(i => videoExts.some(ext => (i.name || '').toLowerCase().endsWith(ext)))) {
    return { text: '.video', bg: 'rgba(6, 182, 212, 0.18)', color: '#38bdf8', border: 'rgba(6, 182, 212, 0.4)' };
  }
  if (folderItems.some(i => i.torboxType === 'torrent' || (i.id && i.id.startsWith('torbox_torrent_')))) {
    return { text: '.Torrents', bg: 'rgba(139, 92, 246, 0.18)', color: '#a78bfa', border: 'rgba(139, 92, 246, 0.4)' };
  }
  if (folderItems.some(i => (i.name || '').toLowerCase().endsWith('.zip') || (i.name || '').toLowerCase().endsWith('.7z'))) {
    return { text: '.Zip', bg: 'rgba(16, 185, 129, 0.18)', color: '#34d399', border: 'rgba(16, 185, 129, 0.4)' };
  }
  if (folderItems.some(i => (i.name || '').toLowerCase().endsWith('.rar'))) {
    return { text: '.Rar', bg: 'rgba(245, 158, 11, 0.18)', color: '#fbbf24', border: 'rgba(245, 158, 11, 0.4)' };
  }
  return { text: 'Outros', bg: 'rgba(100, 116, 139, 0.18)', color: '#94a3b8', border: 'rgba(100, 116, 139, 0.4)' };
}

function getServiceTag(file) {
  const id = (file && file.id) || '';
  const url = (file && (file.downloadUrl || file.directUrl || '')) || '';

  if (id.startsWith('torbox_') || id.startsWith('gofile_') || id.startsWith('megaup_') || id.startsWith('turbocr_') || id.startsWith('generic_') || id.startsWith('scraper_') || (file && file.torboxType) || url.includes('gofile') || url.includes('megaup') || url.includes('turbo.cr') || url.includes('tb-cdn')) {
    return { text: 'Torbox', bg: 'rgba(139, 92, 246, 0.18)', color: '#a78bfa', border: 'rgba(139, 92, 246, 0.4)' };
  }
  if (id.startsWith('terabox_')) {
    return { text: 'TeraBox', bg: 'rgba(245, 158, 11, 0.18)', color: '#fbbf24', border: 'rgba(245, 158, 11, 0.4)' };
  }
  if (id.startsWith('onedrive_') || (file && file.oneDriveUrl && file.oneDriveUrl.includes('sharepoint'))) {
    return { text: 'Microsoft OneDrive', bg: 'rgba(255, 255, 255, 0.18)', color: '#ffffff', border: 'rgba(255, 255, 255, 0.4)' };
  }
  if (id.startsWith('mediafire_')) {
    return { text: 'MediaFire', bg: 'rgba(6, 182, 212, 0.18)', color: '#38bdf8', border: 'rgba(6, 182, 212, 0.4)' };
  }
  if (id.startsWith('bunkr_')) {
    return { text: 'Bunkr', bg: 'rgba(59, 130, 246, 0.18)', color: '#60a5fa', border: 'rgba(59, 130, 246, 0.4)' };
  }
  return { text: 'Google Drive', bg: 'rgba(34, 197, 94, 0.18)', color: '#4ade80', border: 'rgba(34, 197, 94, 0.4)' };
}

function getItemSortRank(item) {
  if (!item) return 4;
  if (item.status === 'downloading') return 1;
  if (item.status === 'pending') return 2;
  if (item.status === 'paused') return 3;
  return 4;
}

function getFolderSortRank(folderItems) {
  if (!folderItems || folderItems.length === 0) return 4;
  if (folderItems.some(i => i.status === 'downloading')) return 1;
  if (folderItems.some(i => i.status === 'pending')) return 2;
  if (folderItems.some(i => i.status === 'paused')) return 3;
  return 4;
}

function renderQueue(queue) {
  // 1. Filtrar downloads ativos
  const activeDownloads = queue.filter(item => item.status === 'downloading');
  const pendingAndActive = queue.filter(item => item.status === 'pending' || item.status === 'downloading').length;

  // Atualiza badge na barra lateral
  if (pendingAndActive > 0) {
    if (queueBadge.textContent !== pendingAndActive.toString()) {
      queueBadge.textContent = pendingAndActive.toString();
    }
    queueBadge.style.display = 'inline-block';
  } else {
    queueBadge.style.display = 'none';
  }
  window._updateQueueUIForTest = (q) => {
    renderQueue(q);
  };

  // Renderiza card ativo no topo
  if (activeDownloads.length > 0) {
    const active = activeDownloads[0]; // Exibe o primeiro ativo no card principal
    if (activeDownloadPanel.style.display !== 'flex') {
      activeDownloadPanel.style.display = 'flex';
    }
    
    if (activeDownloadPanel.dataset.activeItemName !== active.name) {
      activeDownloadPanel.dataset.activeItemName = active.name;
      const pureFileName = (active.name || '').includes('/') ? active.name.split('/').pop() : active.name;
      const tag = getFileTypeTag(active);
      const spanTag = `<span style="background: ${tag.bg}; color: ${tag.color}; border: 1px solid ${tag.border}; font-weight: 700; padding: 2px 7px; border-radius: 4px; font-size: 11px; margin-right: 8px; display: inline-block; vertical-align: middle;">${tag.text}</span>`;
      activeFilename.innerHTML = `${spanTag}${escapeHtml(pureFileName)}`;
      activeFilename.title = pureFileName;
    }

    if (active && torboxCloudFiles && torboxCloudFiles.length > 0) {
      const matchingCloudItem = torboxCloudFiles.find(f => 
        String(f.id) === String(active.id) ||
        (f.torboxId && (String(f.torboxId) === String(active.torboxId) || String(f.torboxId) === String(active.numericId)))
      );
      if (matchingCloudItem && !matchingCloudItem.isFinished && matchingCloudItem.progress !== undefined && matchingCloudItem.progress < 100) {
        active.cloudProgress = matchingCloudItem.progress;
        active.cloudMessage = `☁️ Torbox baixando na nuvem (${matchingCloudItem.progress}%)...`;
      }
    }

    const activeCloudNotice = document.getElementById('active-cloud-notice-container');
    if (active.cloudMessage || active.cloudProgress !== undefined) {
      const cProg = active.cloudProgress !== undefined ? active.cloudProgress : (active.progress || 0);
      if (activeCloudNotice) {
        activeCloudNotice.style.display = 'block';
        activeCloudNotice.innerHTML = `
          <div style="background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.4); border-radius: 8px; padding: 10px 14px; display: flex; align-items: center; gap: 12px;">
            <span style="font-size: 1.4rem;">☁️</span>
            <div style="flex: 1;">
              <div style="color: #38bdf8; font-weight: 700; font-size: 0.85rem; margin-bottom: 2px;">
                Torbox baixando na nuvem (${cProg}%) — Aguarde...
              </div>
              <div style="color: var(--text-secondary); font-size: 0.78rem;">
                O Torbox está baixando este arquivo nos servidores em nuvem. O salvamento no seu PC iniciará automaticamente assim que for concluído!
              </div>
            </div>
          </div>
        `;
      }
      activeProgressText.textContent = `☁️ Nuvem ${cProg}%`;
      activeProgressBar.style.width = `${cProg}%`;
      activeSpeedText.textContent = active.cloudMessage || `Baixando no Torbox (${cProg}%)`;
      activeEtaText.textContent = 'Aguardando Torbox';
    } else {
      if (activeCloudNotice) activeCloudNotice.style.display = 'none';
      activeProgressText.textContent = `${active.progress || 0}%`;
      activeProgressBar.style.width = `${active.progress || 0}%`;
      activeSpeedText.textContent = `${formatBytes(active.speed)}/s`;
      activeEtaText.textContent = formatETA(active.eta);
    }
    activeBytesText.textContent = `${formatBytes(active.downloadedBytes)} / ${formatBytes(active.size)}`;

    // Atualiza botões do painel ativo se o ID mudou
    if (activeDownloadPanel.dataset.activeId !== active.id) {
      activeDownloadPanel.dataset.activeId = active.id;
      btnActivePause.onclick = () => window.api.pauseDownload(active.id);
      btnActiveCancel.onclick = async () => {
        if (await showCustomConfirm(`Cancelar o download do arquivo "${active.name}"?`, 'Cancelar Download')) {
          window.api.cancelDownload(active.id);
        }
      };
    }
  } else {
    if (activeDownloadPanel.style.display !== 'none') {
      activeDownloadPanel.style.display = 'none';
    }
    activeDownloadPanel.dataset.activeId = '';
  }

  // 2. Renderiza lista da fila (Reconciliação In-Place para EVITAR PISCAR no hover)
  if (queueTotalCount.textContent !== queue.length.toString()) {
    queueTotalCount.textContent = queue.length.toString();
  }

  if (queue.length === 0) {
    queueItemsList.innerHTML = '';
    queueEmptyState.style.display = 'block';
    return;
  }

  queueEmptyState.style.display = 'none';

  // Agrupa arquivos por folderName
  const folderMap = new Map();
  queue.forEach(item => {
    const folder = item.folderName || 'Downloads';
    if (!folderMap.has(folder)) {
      folderMap.set(folder, []);
    }
    folderMap.get(folder).push(item);
  });

  // Remove pastas do DOM que não existem mais na fila atual
  const existingFolderCards = Array.from(queueItemsList.querySelectorAll('.queue-folder-card'));
  existingFolderCards.forEach(card => {
    const folder = card.dataset.folderName;
    if (!folderMap.has(folder)) {
      card.remove();
    }
  });

  // Ordena os grupos de pasta pela ordem de prioridade: 1º Baixando, 2º Aguardando Início (Pendente), 3º Pausado, 4º Concluído/Falhado
  const sortedFolderEntries = Array.from(folderMap.entries()).sort((a, b) => {
    const rankA = getFolderSortRank(a[1]);
    const rankB = getFolderSortRank(b[1]);
    if (rankA !== rankB) return rankA - rankB;
    return a[0].localeCompare(b[0]);
  });

  // Processa e atualiza in-place cada card de pasta na ordem de prioridade
  sortedFolderEntries.forEach(([folderName, folderItems]) => {
    folderItems.sort((a, b) => getItemSortRank(a) - getItemSortRank(b));
    const totalFiles = folderItems.length;
    const completedFiles = folderItems.filter(f => f.status === 'completed').length;
    const folderTotalBytes = folderItems.reduce((sum, f) => sum + (f.size || 0), 0);
    const folderDownloadedBytes = folderItems.reduce((sum, f) => {
      if (f.status === 'completed') return sum + (f.size || 0);
      return sum + (f.downloadedBytes || 0);
    }, 0);

    const folderPercent = folderTotalBytes > 0 
      ? Math.min(100, Math.round((folderDownloadedBytes / folderTotalBytes) * 100))
      : (completedFiles === totalFiles ? 100 : 0);

    const hasActiveOrPausedItem = folderItems.some(f => f.status === 'downloading' || f.status === 'paused' || f.status === 'pending');

    let isCollapsed = false;
    if (collapsedFolders.has(folderName)) {
      isCollapsed = true;
    } else if (expandedFolders.has(folderName)) {
      isCollapsed = false;
    } else {
      isCollapsed = folderPercent === 100 || !hasActiveOrPausedItem;
    }

    let folderCard = queueItemsList.querySelector(`.queue-folder-card[data-folder-name="${CSS.escape(folderName)}"]`);

    if (!folderCard) {
      // Cria novo Card da Pasta se não existir
      folderCard = document.createElement('div');
      folderCard.className = `queue-folder-card ${isCollapsed ? 'collapsed' : ''}`;
      folderCard.dataset.folderName = folderName;

      const folderHeader = document.createElement('div');
      folderHeader.className = 'queue-folder-header';

      const titleRow = document.createElement('div');
      titleRow.className = 'queue-folder-title-row';
      const sampleFile = folderItems[0];
      const serviceTag = getServiceTag(sampleFile);
      const folderTag = getFolderTypeTag(folderItems, folderName);
      const titleGroup = document.createElement('div');
      titleGroup.className = 'queue-folder-title-group';
      titleGroup.innerHTML = `
        <input type="checkbox" class="queue-folder-checkbox" style="margin-right: 8px; cursor: pointer;" title="Selecionar todos da pasta">
        <div class="queue-folder-icon">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
          </svg>
        </div>
        <span style="background: ${serviceTag.bg}; color: ${serviceTag.color}; border: 1px solid ${serviceTag.border}; font-weight: 700; padding: 2px 7px; border-radius: 4px; font-size: 11px; margin-right: 6px; display: inline-block; vertical-align: middle;">${serviceTag.text}</span>
        <span style="background: ${folderTag.bg}; color: ${folderTag.color}; border: 1px solid ${folderTag.border}; font-weight: 700; padding: 2px 7px; border-radius: 4px; font-size: 11px; margin-right: 8px; display: inline-block; vertical-align: middle;">${folderTag.text}</span>
        <span class="queue-folder-name" title="${folderName}">${folderName}</span>
      `;

      const folderChk = titleGroup.querySelector('.queue-folder-checkbox');
      if (folderChk) {
        folderChk.onclick = (e) => {
          e.stopPropagation();
          const isChecked = folderChk.checked;
          folderItems.forEach(f => {
            if (isChecked) selectedQueueItemIds.add(f.id);
            else selectedQueueItemIds.delete(f.id);
          });
          const itemCbs = folderCard.querySelectorAll('.queue-item-checkbox');
          itemCbs.forEach(cb => cb.checked = isChecked);
        };
      }

      const badgeGroup = document.createElement('div');
      badgeGroup.className = 'queue-folder-badge-group';
      badgeGroup.innerHTML = `
        <span class="queue-folder-badge">${completedFiles}/${totalFiles} concluídos (${formatBytes(folderDownloadedBytes)} / ${formatBytes(folderTotalBytes)})</span>
        <span class="queue-folder-percent">${folderPercent}%</span>
        <svg class="queue-folder-chevron" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      `;

      titleRow.appendChild(titleGroup);
      titleRow.appendChild(badgeGroup);

      const progressTrack = document.createElement('div');
      progressTrack.className = 'queue-folder-progress-track';
      progressTrack.innerHTML = `<div class="queue-folder-progress-fill" style="width: ${folderPercent}%;"></div>`;

      folderHeader.appendChild(titleRow);
      folderHeader.appendChild(progressTrack);

      folderHeader.onclick = (e) => {
        if (e.target.tagName === 'INPUT' || e.target.closest('button')) return;
        const willBeCollapsed = !folderCard.classList.contains('collapsed');
        if (willBeCollapsed) {
          expandedFolders.delete(folderName);
          collapsedFolders.add(folderName);
          folderCard.classList.add('collapsed');
        } else {
          collapsedFolders.delete(folderName);
          expandedFolders.add(folderName);
          folderCard.classList.remove('collapsed');
        }
      };

      const folderItemsContainer = document.createElement('div');
      folderItemsContainer.className = 'queue-folder-items';

      folderCard.appendChild(folderHeader);
      folderCard.appendChild(folderItemsContainer);
    }

    // Reposiciona obrigatoriamente no DOM para manter a ordem estrita de prioridade
    queueItemsList.appendChild(folderCard);

    // Atualiza textos e progresso do cabeçalho sem recriar o DOM (sem piscar)
    const badgeSpan = folderCard.querySelector('.queue-folder-badge');
    const percentSpan = folderCard.querySelector('.queue-folder-percent');
    const progressFill = folderCard.querySelector('.queue-folder-progress-fill');

    if (badgeSpan) badgeSpan.textContent = `${completedFiles}/${totalFiles} concluídos (${formatBytes(folderDownloadedBytes)} / ${formatBytes(folderTotalBytes)})`;
    if (percentSpan) percentSpan.textContent = `${folderPercent}%`;
    if (progressFill) progressFill.style.width = `${folderPercent}%`;

    // Atualiza itens de arquivo da pasta in-place
    const folderItemsContainer = folderCard.querySelector('.queue-folder-items');
    const currentItemIds = new Set(folderItems.map(f => f.id));

    // Remove itens do DOM que não estão mais nesta pasta
    const existingItemEls = Array.from(folderItemsContainer.querySelectorAll('.queue-item'));
    existingItemEls.forEach(el => {
      if (!currentItemIds.has(el.dataset.itemId)) {
        el.remove();
      }
    });

    // Atualiza ou insere itens da pasta na ordem exata de prioridade
    const hasActiveDownloading = queue.some(i => i.status === 'downloading');
    folderItems.forEach(item => {
      let itemEl = folderItemsContainer.querySelector(`.queue-item[data-item-id="${CSS.escape(item.id)}"]`);
      if (!itemEl) {
        itemEl = createQueueItemElement(item, hasActiveDownloading);
      } else {
        updateQueueItemElement(itemEl, item, hasActiveDownloading);
      }
      folderItemsContainer.appendChild(itemEl);
    });
  });
}

function createQueueItemElement(item, hasActiveDownloading = false) {
  const div = document.createElement('div');
  div.className = 'queue-item';
  div.dataset.itemId = item.id;

  const divInfo = document.createElement('div');
  divInfo.className = 'queue-item-info';

  const pureFileName = (item.name || '').includes('/') ? item.name.split('/').pop() : item.name;

  const divName = document.createElement('div');
  divName.className = 'queue-item-name';
  divName.title = pureFileName;

  const chkItem = document.createElement('input');
  chkItem.type = 'checkbox';
  chkItem.className = 'queue-item-checkbox';
  chkItem.checked = selectedQueueItemIds.has(item.id);
  chkItem.style.marginRight = '8px';
  chkItem.style.cursor = 'pointer';
  chkItem.onclick = (e) => {
    e.stopPropagation();
    if (chkItem.checked) {
      selectedQueueItemIds.add(item.id);
    } else {
      selectedQueueItemIds.delete(item.id);
    }
  };

  const tagInfo = getFileTypeTag(item);
  const tagSpan = document.createElement('span');
  tagSpan.className = 'queue-file-tag';
  tagSpan.textContent = tagInfo.text;
  tagSpan.style.cssText = `background: ${tagInfo.bg}; color: ${tagInfo.color}; border: 1px solid ${tagInfo.border}; font-weight: 700; padding: 2px 7px; border-radius: 4px; font-size: 11px; margin-right: 8px; display: inline-block; vertical-align: middle;`;

  const spanNameText = document.createElement('span');
  spanNameText.textContent = pureFileName;

  divName.appendChild(chkItem);
  divName.appendChild(tagSpan);
  divName.appendChild(spanNameText);

  const divMeta = document.createElement('div');
  divMeta.className = 'queue-item-meta';

  const spanSize = document.createElement('span');
  spanSize.className = 'queue-item-size-text';
  spanSize.textContent = formatBytes(item.size);

  const spanStatus = document.createElement('span');
  let statusClass = `queue-item-status-badge ${item.status}`;
  if (item.status === 'pending' && hasActiveDownloading) {
    statusClass += ' waiting';
  }
  spanStatus.className = statusClass;
  spanStatus.textContent = getStatusLabel(item.status, hasActiveDownloading);

  // Barra de progresso individual + Porcentagem no estilo Nexus
  const divProgressGroup = document.createElement('div');
  divProgressGroup.className = 'queue-item-progress-group';

  const spanPercent = document.createElement('span');
  spanPercent.className = 'queue-item-percent-text';
  const progressVal = item.progress || (item.status === 'completed' ? 100 : 0);
  spanPercent.textContent = `${progressVal}%`;

  const barContainer = document.createElement('div');
  barContainer.className = 'queue-item-progress-bar-container';

  const barFill = document.createElement('div');
  barFill.className = `queue-item-progress-bar-fill ${item.status}`;
  barFill.style.width = `${progressVal}%`;

  barContainer.appendChild(barFill);
  divProgressGroup.appendChild(spanPercent);
  divProgressGroup.appendChild(barContainer);

  divMeta.appendChild(spanSize);
  divMeta.appendChild(spanStatus);
  divMeta.appendChild(divProgressGroup);

  const spanError = document.createElement('span');
  spanError.className = 'queue-item-error-text';
  spanError.style.color = 'var(--danger)';
  if (item.error) {
    spanError.textContent = ` | Erro: ${item.error}`;
  }
  divMeta.appendChild(spanError);

  divInfo.appendChild(divName);
  divInfo.appendChild(divMeta);

  const divActions = document.createElement('div');
  divActions.className = 'queue-item-actions';

  div.appendChild(divInfo);
  div.appendChild(divActions);

  updateQueueItemActions(divActions, item);
  return div;
}

function updateQueueItemElement(itemEl, item, hasActiveDownloading = false) {
  const spanStatus = itemEl.querySelector('.queue-item-status-badge');
  if (spanStatus) {
    let statusClass = `queue-item-status-badge ${item.status}`;
    if (item.status === 'pending' && hasActiveDownloading) {
      statusClass += ' waiting';
    }
    if (spanStatus.className !== statusClass) {
      spanStatus.className = statusClass;
    }
    let label = getStatusLabel(item.status, hasActiveDownloading);
    if (item.cloudMessage || item.cloudProgress !== undefined) {
      const cProg = item.cloudProgress !== undefined ? item.cloudProgress : (item.progress || 0);
      label = `☁️ Nuvem (${cProg}%)`;
    }
    if (spanStatus.textContent !== label) {
      spanStatus.textContent = label;
    }
  }

  const spanSize = itemEl.querySelector('.queue-item-size-text');
  if (spanSize) {
    const formatted = formatBytes(item.size);
    if (spanSize.textContent !== formatted) {
      spanSize.textContent = formatted;
    }
  }
  const spanPercent = itemEl.querySelector('.queue-item-percent-text');
  const barFill = itemEl.querySelector('.queue-item-progress-bar-fill');
  const progressVal = item.progress || (item.status === 'completed' ? 100 : 0);

  if (spanPercent && spanPercent.textContent !== `${progressVal}%`) {
    spanPercent.textContent = `${progressVal}%`;
  }
  if (barFill) {
    if (barFill.className !== `queue-item-progress-bar-fill ${item.status}`) {
      barFill.className = `queue-item-progress-bar-fill ${item.status}`;
    }
    barFill.style.width = `${progressVal}%`;
  }

  const spanError = itemEl.querySelector('.queue-item-error-text');
  if (spanError) {
    const errText = item.error ? ` | Erro: ${item.error}` : '';
    if (spanError.textContent !== errText) {
      spanError.textContent = errText;
    }
  }

  const divActions = itemEl.querySelector('.queue-item-actions');
  if (divActions) {
    updateQueueItemActions(divActions, item);
  }
}

function createQueueItemElement(item, hasActiveDownloading = false) {
  const div = document.createElement('div');
  div.className = 'queue-item';
  div.dataset.itemId = item.id;

  const divInfo = document.createElement('div');
  divInfo.className = 'queue-item-info';

  const pureFileName = (item.name || '').includes('/') ? item.name.split('/').pop() : item.name;

  const divName = document.createElement('div');
  divName.className = 'queue-item-name';
  divName.title = pureFileName;

  const chkItem = document.createElement('input');
  chkItem.type = 'checkbox';
  chkItem.className = 'queue-item-checkbox';
  chkItem.checked = selectedQueueItemIds.has(item.id);
  chkItem.style.marginRight = '8px';
  chkItem.style.cursor = 'pointer';
  chkItem.onclick = (e) => {
    e.stopPropagation();
    if (chkItem.checked) {
      selectedQueueItemIds.add(item.id);
    } else {
      selectedQueueItemIds.delete(item.id);
    }
  };

  const tagInfo = getFileTypeTag(item);
  const tagSpan = document.createElement('span');
  tagSpan.className = 'queue-file-tag';
  tagSpan.textContent = tagInfo.text;
  tagSpan.style.cssText = `background: ${tagInfo.bg}; color: ${tagInfo.color}; border: 1px solid ${tagInfo.border}; font-weight: 700; padding: 2px 7px; border-radius: 4px; font-size: 11px; margin-right: 8px; display: inline-block; vertical-align: middle;`;

  const spanNameText = document.createElement('span');
  spanNameText.textContent = pureFileName;

  divName.appendChild(chkItem);
  divName.appendChild(tagSpan);
  divName.appendChild(spanNameText);

  const divMeta = document.createElement('div');
  divMeta.className = 'queue-item-meta';

  const spanSize = document.createElement('span');
  spanSize.className = 'queue-item-size-text';
  spanSize.textContent = formatBytes(item.size);

  const spanStatus = document.createElement('span');
  let statusClass = `queue-item-status-badge ${item.status}`;
  if (item.status === 'pending' && hasActiveDownloading) {
    statusClass += ' waiting';
  }
  spanStatus.className = statusClass;
  spanStatus.textContent = getStatusLabel(item.status, hasActiveDownloading);

  // Barra de progresso individual + Porcentagem no estilo Nexus
  const divProgressGroup = document.createElement('div');
  divProgressGroup.className = 'queue-item-progress-group';

  const spanPercent = document.createElement('span');
  spanPercent.className = 'queue-item-percent-text';
  const progressVal = item.progress || (item.status === 'completed' ? 100 : 0);
  spanPercent.textContent = `${progressVal}%`;

  const barContainer = document.createElement('div');
  barContainer.className = 'queue-item-progress-bar-container';

  const barFill = document.createElement('div');
  barFill.className = `queue-item-progress-bar-fill ${item.status}`;
  barFill.style.width = `${progressVal}%`;

  barContainer.appendChild(barFill);
  divProgressGroup.appendChild(spanPercent);
  divProgressGroup.appendChild(barContainer);

  divMeta.appendChild(spanSize);
  divMeta.appendChild(spanStatus);
  divMeta.appendChild(divProgressGroup);

  const spanError = document.createElement('span');
  spanError.className = 'queue-item-error-text';
  spanError.style.color = 'var(--danger)';
  if (item.error) {
    spanError.textContent = ` | Erro: ${item.error}`;
  }
  divMeta.appendChild(spanError);

  divInfo.appendChild(divName);
  divInfo.appendChild(divMeta);

  const divActions = document.createElement('div');
  divActions.className = 'queue-item-actions';

  div.appendChild(divInfo);
  div.appendChild(divActions);

  updateQueueItemActions(divActions, item);
  return div;
}

function updateQueueItemElement(itemEl, item, hasActiveDownloading = false) {
  const spanStatus = itemEl.querySelector('.queue-item-status-badge');
  if (spanStatus) {
    let statusClass = `queue-item-status-badge ${item.status}`;
    if (item.status === 'pending' && hasActiveDownloading) {
      statusClass += ' waiting';
    }
    if (spanStatus.className !== statusClass) {
      spanStatus.className = statusClass;
    }
    let label = getStatusLabel(item.status, hasActiveDownloading);
    if (item.cloudMessage || item.cloudProgress !== undefined) {
      const cProg = item.cloudProgress !== undefined ? item.cloudProgress : (item.progress || 0);
      label = `☁️ Nuvem (${cProg}%)`;
    }
    if (spanStatus.textContent !== label) {
      spanStatus.textContent = label;
    }
  }

  const spanSize = itemEl.querySelector('.queue-item-size-text');
  if (spanSize) {
    const formatted = formatBytes(item.size);
    if (spanSize.textContent !== formatted) {
      spanSize.textContent = formatted;
    }
  }

  const spanPercent = itemEl.querySelector('.queue-item-percent-text');
  const barFill = itemEl.querySelector('.queue-item-progress-bar-fill');
  const progressVal = item.progress || (item.status === 'completed' ? 100 : 0);

  if (spanPercent && spanPercent.textContent !== `${progressVal}%`) {
    spanPercent.textContent = `${progressVal}%`;
  }
  if (barFill) {
    if (barFill.className !== `queue-item-progress-bar-fill ${item.status}`) {
      barFill.className = `queue-item-progress-bar-fill ${item.status}`;
    }
    barFill.style.width = `${progressVal}%`;
  }

  const spanError = itemEl.querySelector('.queue-item-error-text');
  if (spanError) {
    const errText = item.error ? ` | Erro: ${item.error}` : '';
    if (spanError.textContent !== errText) {
      spanError.textContent = errText;
    }
  }

  const divActions = itemEl.querySelector('.queue-item-actions');
  if (divActions) {
    updateQueueItemActions(divActions, item);
  }
}

function updateQueueItemActions(divActions, item) {
  if (divActions.dataset.lastStatus === item.status) return;
  divActions.dataset.lastStatus = item.status;
  divActions.innerHTML = '';

  if (item.status === 'paused' || item.status === 'failed') {
    const btnPlay = document.createElement('button');
    btnPlay.className = 'btn-action';
    btnPlay.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="5 3 19 12 5 21 5 3"></polygon>
      </svg>
    `;
    btnPlay.title = item.status === 'failed' ? 'Tentar Novamente' : 'Retomar';
    btnPlay.onclick = (e) => {
      e.stopPropagation();
      window.api.resumeDownload(item.id);
    };
    divActions.appendChild(btnPlay);
  } else if (item.status === 'downloading') {
    const btnPause = document.createElement('button');
    btnPause.className = 'btn-action';
    btnPause.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="6" y="4" width="4" height="16"></rect>
        <rect x="14" y="4" width="4" height="16"></rect>
      </svg>
    `;
    btnPause.title = 'Pausar';
    btnPause.onclick = (e) => {
      e.stopPropagation();
      window.api.pauseDownload(item.id);
    };
    divActions.appendChild(btnPause);
  }

  const btnCancel = document.createElement('button');
  btnCancel.className = 'btn-action btn-action-danger';
  btnCancel.innerHTML = `
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  `;
  btnCancel.title = 'Remover';
  btnCancel.onclick = async (e) => {
    e.stopPropagation();
    if (await showCustomConfirm(`Remover "${item.name}" da fila?`, 'Remover Item')) {
      window.api.cancelDownload(item.id);
    }
  };
  divActions.appendChild(btnCancel);
}

function getStatusLabel(status) {
  switch (status) {
    case 'pending': return 'Pendente';
    case 'downloading': return 'Baixando';
    case 'completed': return 'Concluído';
    case 'failed': return 'Falhou';
    case 'paused': return 'Pausado';
    default: return status;
  }
}

// Botoes globais da fila
btnOpenDir.addEventListener('click', () => {
  window.api.openDownloadsFolder();
});

btnClearCompleted.addEventListener('click', () => {
  window.api.clearCompleted();
});

btnClearAll.addEventListener('click', async () => {
  if (selectedQueueItemIds.size > 0) {
    const count = selectedQueueItemIds.size;
    if (await showCustomConfirm(`Deseja remover os ${count} item(ns) selecionado(s) da fila de downloads?`, 'Remover Selecionados')) {
      for (const id of selectedQueueItemIds) {
        window.api.cancelDownload(id);
      }
      selectedQueueItemIds.clear();
    }
  } else {
    if (await showCustomConfirm('Deseja realmente limpar toda a fila de downloads? Todos os processos ativos serão cancelados.', 'Limpar Fila')) {
      selectedQueueItemIds.clear();
      window.api.clearQueue();
    }
  }
});

if (btnResumeAll) {
  btnResumeAll.addEventListener('click', async () => {
    await window.api.resumeAllDownloads();
  });
}

if (btnPauseAll) {
  btnPauseAll.addEventListener('click', async () => {
    await window.api.pauseAllDownloads();
  });
}

if (btnRestartAll) {
  btnRestartAll.addEventListener('click', async () => {
    if (await showCustomConfirm('Deseja reiniciar todos os downloads pendentes ou com falhas?', 'Reiniciar Pendentes')) {
      await window.api.restartQueue();
    }
  });
}

// ==========================================
// Torbox Cloud Page Engine
// ==========================================
let torboxCloudFiles = [];
let selectedTorboxFileIds = new Set();
let currentTorboxStatusFilter = 'all';
let currentTorboxTypeFilter = 'all';
let currentTorboxSort = 'default';
let torboxLivePollInterval = null;

let hiddenTorboxFileIds = new Set();
try {
  const savedHidden = localStorage.getItem('nexus_hidden_torbox_ids');
  if (savedHidden) {
    JSON.parse(savedHidden).forEach(id => hiddenTorboxFileIds.add(id));
  }
} catch (e) {}

let showHiddenTorboxFiles = false;

function startTorboxLivePolling() {
  if (torboxLivePollInterval) return;
  console.log('[Torbox Live Polling] Iniciando monitoramento em tempo real (3s)...');
  torboxLivePollInterval = setInterval(() => {
    const torboxTab = document.getElementById('torbox-tab');
    if (torboxTab && torboxTab.classList.contains('active')) {
      loadTorboxDownloads(true);
    }
  }, 3000);
}

function stopTorboxLivePolling() {
  if (torboxLivePollInterval) {
    console.log('[Torbox Live Polling] Parando monitoramento em tempo real.');
    clearInterval(torboxLivePollInterval);
    torboxLivePollInterval = null;
  }
}

window._setTorboxCloudFilesForTest = (files) => {
  torboxCloudFiles = files;
  updateTorboxStatsBar();
  applyTorboxFilters();
};

function updateTorboxStatsBar() {
  const btnTotal = document.getElementById('btn-filter-total');
  const btnActive = document.getElementById('btn-filter-active');
  const btnReady = document.getElementById('btn-filter-ready');
  const btnInactive = document.getElementById('btn-filter-inactive');

  const groupsMap = new Map();
  torboxCloudFiles.forEach(f => {
    const k = f.folderName || 'Downloads Torbox';
    if (!groupsMap.has(k)) groupsMap.set(k, []);
    groupsMap.get(k).push(f);
  });

  const totalGroups = groupsMap.size;

  let activeCount = 0;
  let readyCount = 0;
  let inactiveCount = 0;

  groupsMap.forEach(groupItems => {
    if (groupItems.some(f => f.isInactive)) {
      inactiveCount++;
    } else if (groupItems.every(f => f.isFinished)) {
      readyCount++;
    } else {
      activeCount++;
    }
  });

  if (btnTotal) btnTotal.textContent = `${totalGroups} DOWNLOADS`;
  if (btnActive) btnActive.textContent = `${activeCount} active downloads`;
  if (btnReady) btnReady.textContent = `${readyCount} downloads ready`;
  if (btnInactive) btnInactive.textContent = `${inactiveCount} inactive downloads`;

  [btnTotal, btnActive, btnReady, btnInactive].forEach(b => b && b.classList.remove('active-filter'));
  if (currentTorboxStatusFilter === 'all' && btnTotal) btnTotal.classList.add('active-filter');
  if (currentTorboxStatusFilter === 'active' && btnActive) btnActive.classList.add('active-filter');
  if (currentTorboxStatusFilter === 'ready' && btnReady) btnReady.classList.add('active-filter');
  if (currentTorboxStatusFilter === 'inactive' && btnInactive) btnInactive.classList.add('active-filter');
}

function applyTorboxFilters() {
  const searchInput = document.getElementById('input-search-torbox');
  const query = searchInput ? searchInput.value.trim().toLowerCase() : '';

  const videoExts = ['.mkv', '.mp4', '.avi', '.webm', '.mov', '.flv', '.wmv', '.m4v', '.ts', '.m2ts', '.3gp', '.iso'];

  let filtered = torboxCloudFiles.filter(file => {
    const isHidden = hiddenTorboxFileIds.has(file.id);
    if (isHidden && !showHiddenTorboxFiles) return false;

    if (query) {
      const matchName = (file.name || '').toLowerCase().includes(query);
      const matchFolder = (file.folderName || '').toLowerCase().includes(query);
      if (!matchName && !matchFolder) return false;
    }

    if (currentTorboxStatusFilter === 'ready' && !file.isFinished) return false;
    if (currentTorboxStatusFilter === 'active' && (file.isFinished || file.isInactive)) return false;
    if (currentTorboxStatusFilter === 'inactive' && !file.isInactive) return false;

    if (currentTorboxTypeFilter === 'torrent' && file.torboxType !== 'torrent') return false;
    if (currentTorboxTypeFilter === 'webdl' && file.torboxType !== 'webdl') return false;
    if (currentTorboxTypeFilter === 'video') {
      const isVid = videoExts.some(ext => (file.name || '').toLowerCase().endsWith(ext));
      if (!isVid) return false;
    }

    return true;
  });

  // Aplicação da Ordenação (Sort By)
  if (currentTorboxSort === 'name') {
    filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  } else if (currentTorboxSort === 'size') {
    filtered.sort((a, b) => (b.size || 0) - (a.size || 0));
  } else if (currentTorboxSort === 'added') {
    filtered.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  } else if (currentTorboxSort === 'cached') {
    filtered.sort((a, b) => new Date(b.cachedAt || 0) - new Date(a.cachedAt || 0));
  } else if (currentTorboxSort === 'updated') {
    filtered.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  } else if (currentTorboxSort === 'progress') {
    filtered.sort((a, b) => (b.progress || 0) - (a.progress || 0));
  } else if (currentTorboxSort === 'ratio') {
    filtered.sort((a, b) => (b.ratio || 0) - (a.ratio || 0));
  } else if (currentTorboxSort === 'speed_dl') {
    filtered.sort((a, b) => (b.downloadSpeed || 0) - (a.downloadSpeed || 0));
  } else if (currentTorboxSort === 'speed_ul') {
    filtered.sort((a, b) => (b.uploadSpeed || 0) - (a.uploadSpeed || 0));
  }

  updateTorboxStatsBar();
  renderTorboxDownloads(filtered);
  return filtered;
}

async function loadTorboxDownloads(isSilent = false) {
  const torboxResultsContainer = document.getElementById('torbox-results-container');
  const torboxEmptyState = document.getElementById('torbox-empty-state');
  const torboxEmptyTitle = document.getElementById('torbox-empty-title');
  const torboxEmptyDesc = document.getElementById('torbox-empty-desc');
  const torboxBadge = document.getElementById('torbox-badge');

  if (!torboxResultsContainer || !torboxEmptyState) return;

  try {
    const res = await window.api.getTorboxUserDownloads();
    if (!res.success) {
      if (!isSilent) {
        torboxResultsContainer.style.display = 'none';
        torboxEmptyState.style.display = 'flex';
        if (torboxEmptyTitle) torboxEmptyTitle.textContent = 'API Key do Torbox Desconectada';
        if (torboxEmptyDesc) torboxEmptyDesc.textContent = res.error || 'Por favor acesse os Ajustes para informar sua API Key do Torbox.';
        if (torboxBadge) torboxBadge.style.display = 'none';
      }
      return;
    }

    torboxCloudFiles = res.files || [];

    const groupsMap = new Map();
    torboxCloudFiles.forEach(file => {
      const key = file.folderName || 'Downloads Torbox';
      if (!groupsMap.has(key)) groupsMap.set(key, []);
      groupsMap.get(key).push(file);
    });

    if (torboxBadge) {
      if (groupsMap.size > 0) {
        torboxBadge.textContent = groupsMap.size;
        torboxBadge.style.display = 'inline-block';
      } else {
        torboxBadge.style.display = 'none';
      }
    }

    updateTorboxStatsBar();

    if (torboxCloudFiles.length === 0) {
      if (!isSilent) {
        torboxResultsContainer.style.display = 'none';
        torboxEmptyState.style.display = 'flex';
        if (torboxEmptyTitle) torboxEmptyTitle.textContent = 'Nenhum download encontrado na sua conta Torbox';
        if (torboxEmptyDesc) torboxEmptyDesc.textContent = 'Adicione torrents ou links diretos à sua conta Torbox para visualizá-los aqui.';
      }
      return;
    }

    torboxEmptyState.style.display = 'none';
    torboxResultsContainer.style.display = 'block';

    if (!isSilent) {
      selectedTorboxFileIds.clear();
      torboxCloudFiles.forEach(f => selectedTorboxFileIds.add(f.id));
    }

    applyTorboxFilters();
  } catch (err) {
    console.error('Erro ao carregar downloads do Torbox:', err);
    if (!isSilent) {
      torboxResultsContainer.style.display = 'none';
      torboxEmptyState.style.display = 'flex';
    }
  }
}

let torboxRenderLimit = 30;
let expandedTorboxGroups = new Set();
let collapsedTorboxGroups = new Set();

function renderTorboxDownloads(filesToRender, limit = torboxRenderLimit) {
  const groupsContainer = document.getElementById('torbox-groups-container');
  if (!groupsContainer) return;

  groupsContainer.innerHTML = '';

  const groupsMap = new Map();
  filesToRender.forEach(file => {
    const key = file.folderName || 'Downloads Torbox';
    if (!groupsMap.has(key)) groupsMap.set(key, []);
    groupsMap.get(key).push(file);
  });

  const entries = Array.from(groupsMap.entries());
  const visibleEntries = entries.slice(0, limit);

  visibleEntries.forEach(([groupName, groupItems]) => {
    const totalSize = groupItems.reduce((a, b) => a + b.size, 0);

    let isCollapsed = true;
    if (expandedTorboxGroups.has(groupName)) {
      isCollapsed = false;
    } else if (collapsedTorboxGroups.has(groupName)) {
      isCollapsed = true;
    }

    const card = document.createElement('div');
    card.className = `folder-group-card ${isCollapsed ? 'collapsed' : ''}`;

    const header = document.createElement('div');
    header.className = 'folder-group-header';

    const titleGroup = document.createElement('div');
    titleGroup.className = 'folder-group-title-group';

    const groupCb = document.createElement('input');
    groupCb.type = 'checkbox';
    groupCb.className = 'folder-group-checkbox';
    groupCb.checked = groupItems.every(f => selectedTorboxFileIds.has(f.id));

    const folderIcon = document.createElement('div');
    folderIcon.className = 'queue-folder-icon';
    folderIcon.style.marginRight = '2px';
    folderIcon.innerHTML = `
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
      </svg>
    `;

    const serviceTag = { text: 'Torbox', bg: 'rgba(139, 92, 246, 0.18)', color: '#a78bfa', border: 'rgba(139, 92, 246, 0.4)' };
    const folderTag = getFolderTypeTag(groupItems, groupName);

    const serviceSpan = document.createElement('span');
    serviceSpan.style.cssText = `background: ${serviceTag.bg}; color: ${serviceTag.color}; border: 1px solid ${serviceTag.border}; font-weight: 700; padding: 2px 7px; border-radius: 4px; font-size: 11px; margin-right: 6px; display: inline-block; vertical-align: middle;`;
    serviceSpan.textContent = serviceTag.text;

    const folderTypeSpan = document.createElement('span');
    folderTypeSpan.style.cssText = `background: ${folderTag.bg}; color: ${folderTag.color}; border: 1px solid ${folderTag.border}; font-weight: 700; padding: 2px 7px; border-radius: 4px; font-size: 11px; margin-right: 8px; display: inline-block; vertical-align: middle;`;
    folderTypeSpan.textContent = folderTag.text;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'folder-group-name';
    nameSpan.textContent = groupName;

    titleGroup.appendChild(groupCb);
    titleGroup.appendChild(folderIcon);
    titleGroup.appendChild(serviceSpan);
    titleGroup.appendChild(folderTypeSpan);
    titleGroup.appendChild(nameSpan);

    const metaDiv = document.createElement('div');
    metaDiv.className = 'folder-group-meta';

    // Status Badge para o Cabeçalho da Pasta (Item 2)
    const headerStatusSpan = document.createElement('span');
    headerStatusSpan.className = 'folder-group-status-badge';
    if (groupItems.some(f => f.isInactive)) {
      headerStatusSpan.innerHTML = `<span style="background: rgba(244, 63, 94, 0.18); color: #fb7185; border: 1px solid rgba(244, 63, 94, 0.4); padding: 2px 8px; border-radius: 10px; font-size: 0.75rem; font-weight: 700; margin-right: 6px;">Inativo</span>`;
    } else if (groupItems.every(f => f.isFinished)) {
      headerStatusSpan.innerHTML = `<span style="background: rgba(52, 211, 153, 0.18); color: #34d399; border: 1px solid rgba(52, 211, 153, 0.4); padding: 2px 8px; border-radius: 10px; font-size: 0.75rem; font-weight: 700; margin-right: 6px;">Ready (100%)</span>`;
    } else {
      const activeItem = groupItems.find(f => !f.isFinished) || groupItems[0];
      const activeProg = activeItem.progress || 0;
      headerStatusSpan.innerHTML = `<span style="background: rgba(56, 189, 248, 0.18); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.4); padding: 2px 8px; border-radius: 10px; font-size: 0.75rem; font-weight: 700; margin-right: 6px;">☁️ Baixando (${activeProg}%)</span>`;
    }
    metaDiv.appendChild(headerStatusSpan);

    const isGroupHidden = groupItems.some(f => hiddenTorboxFileIds.has(f.id));
    if (isGroupHidden && showHiddenTorboxFiles) {
      card.style.opacity = '0.7';
      card.style.border = '1px dashed rgba(244, 63, 94, 0.5)';
      const hiddenBadge = document.createElement('span');
      hiddenBadge.innerHTML = `<span style="background: rgba(244, 63, 94, 0.2); color: #fb7185; border: 1px solid rgba(244, 63, 94, 0.4); padding: 2px 8px; border-radius: 10px; font-size: 0.75rem; font-weight: 700; margin-right: 6px;">Ocultado</span>`;
      metaDiv.appendChild(hiddenBadge);

      const unhideBtn = document.createElement('button');
      unhideBtn.className = 'btn btn-sm btn-outline';
      unhideBtn.style.cssText = 'padding: 2px 8px; font-size: 0.75rem; margin-right: 6px; color: #fb7185; border-color: rgba(244, 63, 94, 0.4);';
      unhideBtn.innerHTML = '👁️ Desocultar';
      unhideBtn.onclick = (e) => {
        e.stopPropagation();
        groupItems.forEach(f => hiddenTorboxFileIds.delete(f.id));
        saveHiddenTorboxFileIds();
        applyTorboxFilters();
      };
      metaDiv.appendChild(unhideBtn);
    }

    const badge = document.createElement('span');
    badge.className = 'badge-cyan folder-group-badge';
    badge.textContent = `${groupItems.length} arquivo(s) • ${formatBytes(totalSize)}`;

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'folder-group-toggle';
    toggleBtn.title = 'Expandir / Recolher';
    toggleBtn.innerHTML = `
      <svg class="folder-group-chevron" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
    `;

    metaDiv.appendChild(badge);
    metaDiv.appendChild(toggleBtn);

    header.appendChild(titleGroup);
    header.appendChild(metaDiv);

    const body = document.createElement('div');
    body.className = 'folder-group-body';

    const tableWrapper = document.createElement('div');
    tableWrapper.className = 'results-table-wrapper';

    const table = document.createElement('table');
    table.className = 'results-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th width="40"></th>
          <th>Nome do Arquivo</th>
          <th>Status Nuvem</th>
          <th width="120">Tamanho</th>
          <th width="90">Ação</th>
        </tr>
      </thead>
    `;

    const tbody = document.createElement('tbody');
    let isPopulated = false;

    function populateRows() {
      if (isPopulated) return;
      isPopulated = true;
      groupItems.forEach(file => {
        const row = document.createElement('tr');

        const tdCheck = document.createElement('td');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = selectedTorboxFileIds.has(file.id);
        cb.className = 'file-checkbox';
        cb.addEventListener('change', () => {
          if (cb.checked) selectedTorboxFileIds.add(file.id);
          else selectedTorboxFileIds.delete(file.id);
          updateTorboxSelectionSummary();
        });
        tdCheck.appendChild(cb);

        const tdName = document.createElement('td');
        tdName.className = 'text-truncate';
        const fTag = getFileTypeTag(file);
        tdName.innerHTML = `<span style="background: ${fTag.bg}; color: ${fTag.color}; border: 1px solid ${fTag.border}; font-weight: 700; padding: 2px 6px; border-radius: 4px; font-size: 10px; margin-right: 6px; display: inline-block; vertical-align: middle;">${fTag.text}</span>${file.name}`;
        tdName.title = file.name;

        const tdStatus = document.createElement('td');
        if (file.isFinished) {
          tdStatus.innerHTML = `<span style="background: rgba(52, 211, 153, 0.18); color: #34d399; border: 1px solid rgba(52, 211, 153, 0.4); padding: 2px 8px; border-radius: 10px; font-size: 0.75rem; font-weight: 700;">Ready (100%)</span>`;
        } else if (file.isInactive) {
          tdStatus.innerHTML = `<span style="background: rgba(244, 63, 94, 0.18); color: #fb7185; border: 1px solid rgba(244, 63, 94, 0.4); padding: 2px 8px; border-radius: 10px; font-size: 0.75rem; font-weight: 700;">Inativo</span>`;
        } else {
          tdStatus.innerHTML = `<span style="background: rgba(56, 189, 248, 0.18); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.4); padding: 2px 8px; border-radius: 10px; font-size: 0.75rem; font-weight: 700;">☁️ Baixando (${file.progress || 0}%)</span>`;
        }

        const tdSize = document.createElement('td');
        tdSize.textContent = formatBytes(file.size);

        const tdAction = document.createElement('td');
        const dlBtn = document.createElement('button');
        dlBtn.className = 'btn btn-sm btn-success';
        dlBtn.style.padding = '3px 8px';
        dlBtn.style.fontSize = '0.75rem';
        dlBtn.innerHTML = '⬇️ Baixar';
        dlBtn.onclick = async (e) => {
          e.stopPropagation();
          await window.api.addToQueue([file]);
          switchTab('queue');
        };
        tdAction.appendChild(dlBtn);

        row.appendChild(tdCheck);
        row.appendChild(tdName);
        row.appendChild(tdStatus);
        row.appendChild(tdSize);
        row.appendChild(tdAction);
        tbody.appendChild(row);
      });
    }

    if (!isCollapsed) {
      populateRows();
    }

    table.appendChild(tbody);
    tableWrapper.appendChild(table);
    body.appendChild(tableWrapper);

    card.appendChild(header);
    card.appendChild(body);

    header.addEventListener('click', (e) => {
      if (e.target.type === 'checkbox' || e.target.closest('button')) return;
      card.classList.toggle('collapsed');
      if (!card.classList.contains('collapsed')) {
        collapsedTorboxGroups.delete(groupName);
        expandedTorboxGroups.add(groupName);
        populateRows();
      } else {
        expandedTorboxGroups.delete(groupName);
        collapsedTorboxGroups.add(groupName);
      }
    });

    groupCb.addEventListener('change', () => {
      populateRows();
      const isChecked = groupCb.checked;
      groupItems.forEach(f => {
        if (isChecked) selectedTorboxFileIds.add(f.id);
        else selectedTorboxFileIds.delete(f.id);
      });
      tbody.querySelectorAll('.file-checkbox').forEach(c => c.checked = isChecked);
      updateTorboxSelectionSummary();
    });

    groupsContainer.appendChild(card);
  });

  if (entries.length > limit) {
    const loadMoreContainer = document.createElement('div');
    loadMoreContainer.style.cssText = 'display: flex; justify-content: center; margin: 16px 0;';
    const loadMoreBtn = document.createElement('button');
    loadMoreBtn.className = 'btn btn-outline';
    loadMoreBtn.innerHTML = `Carregar mais downloads (${entries.length - limit} restantes)...`;
    loadMoreBtn.onclick = () => {
      torboxRenderLimit += 30;
      renderTorboxDownloads(filesToRender, torboxRenderLimit);
    };
    loadMoreContainer.appendChild(loadMoreBtn);
    groupsContainer.appendChild(loadMoreContainer);
  }

  updateTorboxSelectionSummary();
}

function updateTorboxSelectionSummary() {
  const selectedCountText = document.getElementById('selected-torbox-count');
  const selectAllCb = document.getElementById('select-all-torbox-files');

  if (!selectedCountText) return;

  const total = torboxCloudFiles.length;
  const count = selectedTorboxFileIds.size;
  let totalBytes = 0;

  torboxCloudFiles.forEach(f => {
    if (selectedTorboxFileIds.has(f.id)) totalBytes += f.size;
  });

  selectedCountText.textContent = `${count} arquivo(s) selecionado(s) (${formatBytes(totalBytes)})`;

  if (selectAllCb) {
    if (count === 0) {
      selectAllCb.checked = false;
      selectAllCb.indeterminate = false;
    } else if (count === total) {
      selectAllCb.checked = true;
      selectAllCb.indeterminate = false;
    } else {
      selectAllCb.checked = false;
      selectAllCb.indeterminate = true;
    }
  }
}

const selectAllTorboxFiles = document.getElementById('select-all-torbox-files');
if (selectAllTorboxFiles) {
  selectAllTorboxFiles.addEventListener('change', () => {
    const isChecked = selectAllTorboxFiles.checked;
    selectedTorboxFileIds.clear();
    if (isChecked) {
      const filtered = applyTorboxFilters();
      filtered.forEach(f => selectedTorboxFileIds.add(f.id));
    }
    const filtered = applyTorboxFilters();
    renderTorboxDownloads(filtered);
  });
}

const btnRefreshTorbox = document.getElementById('btn-refresh-torbox');
if (btnRefreshTorbox) {
  btnRefreshTorbox.addEventListener('click', () => {
    loadTorboxDownloads();
  });
}

const inputSearchTorbox = document.getElementById('input-search-torbox');
if (inputSearchTorbox) {
  inputSearchTorbox.addEventListener('input', () => {
    applyTorboxFilters();
  });
}

function selectCategoryFilesAndFilter(statusFilter) {
  currentTorboxStatusFilter = statusFilter;
  selectedTorboxFileIds.clear();
  const filtered = applyTorboxFilters();
  filtered.forEach(f => selectedTorboxFileIds.add(f.id));
  renderTorboxDownloads(filtered);
}

const btnFilterTotal = document.getElementById('btn-filter-total');
if (btnFilterTotal) {
  btnFilterTotal.addEventListener('click', () => {
    selectCategoryFilesAndFilter('all');
  });
}

const btnFilterActive = document.getElementById('btn-filter-active');
if (btnFilterActive) {
  btnFilterActive.addEventListener('click', () => {
    const nextStatus = currentTorboxStatusFilter === 'active' ? 'all' : 'active';
    selectCategoryFilesAndFilter(nextStatus);
  });
}

const btnFilterReady = document.getElementById('btn-filter-ready');
if (btnFilterReady) {
  btnFilterReady.addEventListener('click', () => {
    const nextStatus = currentTorboxStatusFilter === 'ready' ? 'all' : 'ready';
    selectCategoryFilesAndFilter(nextStatus);
  });
}

const btnFilterInactive = document.getElementById('btn-filter-inactive');
if (btnFilterInactive) {
  btnFilterInactive.addEventListener('click', () => {
    const nextStatus = currentTorboxStatusFilter === 'inactive' ? 'all' : 'inactive';
    selectCategoryFilesAndFilter(nextStatus);
  });
}

const btnTorboxFilter = document.getElementById('btn-torbox-filter');
const dropdownTorboxFilter = document.getElementById('torbox-filter-dropdown');
if (btnTorboxFilter && dropdownTorboxFilter) {
  btnTorboxFilter.addEventListener('click', (e) => {
    e.stopPropagation();
    const isVisible = dropdownTorboxFilter.style.display === 'flex';
    dropdownTorboxFilter.style.display = isVisible ? 'none' : 'flex';
  });

  document.addEventListener('click', () => {
    dropdownTorboxFilter.style.display = 'none';
  });

  dropdownTorboxFilter.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  const filterOptions = dropdownTorboxFilter.querySelectorAll('.filter-option');
  filterOptions.forEach(opt => {
    opt.addEventListener('click', () => {
      const statusVal = opt.getAttribute('data-filter-status');
      const typeVal = opt.getAttribute('data-filter-type');
      const sortVal = opt.getAttribute('data-filter-sort');

      if (statusVal) {
        dropdownTorboxFilter.querySelectorAll('[data-filter-status]').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        selectCategoryFilesAndFilter(statusVal);
      }

      if (typeVal) {
        currentTorboxTypeFilter = typeVal;
        dropdownTorboxFilter.querySelectorAll('[data-filter-type]').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        applyTorboxFilters();
      }

      if (sortVal) {
        currentTorboxSort = sortVal;
        dropdownTorboxFilter.querySelectorAll('[data-filter-sort]').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        applyTorboxFilters();
      }
    });
  });
}



const btnAddTorboxSelected = document.getElementById('btn-add-torbox-selected');
if (btnAddTorboxSelected) {
  btnAddTorboxSelected.addEventListener('click', async () => {
    const selected = torboxCloudFiles.filter(f => selectedTorboxFileIds.has(f.id));
    if (selected.length === 0) {
      await showCustomAlert('Por favor, selecione pelo menos um arquivo da sua nuvem Torbox para baixar.', 'Torbox Cloud');
      return;
    }
    await window.api.addToQueue(selected);
    switchTab('queue');
  });
}

const btnHideTorboxSelected = document.getElementById('btn-hide-torbox-selected');
if (btnHideTorboxSelected) {
  btnHideTorboxSelected.addEventListener('click', async () => {
    if (selectedTorboxFileIds.size === 0) {
      await showCustomAlert('Por favor, selecione pelo menos um arquivo/cartão do Torbox para ocultar.', 'Ocultar Selecionados');
      return;
    }
    const count = selectedTorboxFileIds.size;
    if (await showCustomConfirm(`Deseja ocultar os ${count} item(ns) selecionado(s)? Você poderá exibi-los novamente através do menu de Filtros.`, 'Ocultar Selecionados')) {
      selectedTorboxFileIds.forEach(id => hiddenTorboxFileIds.add(id));
      saveHiddenTorboxFileIds();
      selectedTorboxFileIds.clear();
      applyTorboxFilters();
      updateTorboxSelectionSummary();
    }
  });
}

const btnToggleShowHidden = document.getElementById('btn-toggle-show-hidden');
if (btnToggleShowHidden) {
  btnToggleShowHidden.addEventListener('click', () => {
    showHiddenTorboxFiles = !showHiddenTorboxFiles;
    btnToggleShowHidden.classList.toggle('active', showHiddenTorboxFiles);
    btnToggleShowHidden.textContent = showHiddenTorboxFiles ? '✓ Exibir Itens Ocultados' : '👁️ Exibir Itens Ocultados';
    applyTorboxFilters();
  });
}

const btnCollapseAllTorbox = document.getElementById('btn-collapse-all-torbox');
if (btnCollapseAllTorbox) {
  btnCollapseAllTorbox.addEventListener('click', () => {
    if (expandedTorboxGroups.size > 0) {
      expandedTorboxGroups.clear();
      torboxCloudFiles.forEach(f => {
        const key = f.folderName || 'Downloads Torbox';
        collapsedTorboxGroups.add(key);
      });
    } else {
      collapsedTorboxGroups.clear();
      torboxCloudFiles.forEach(f => {
        const key = f.folderName || 'Downloads Torbox';
        expandedTorboxGroups.add(key);
      });
    }
    applyTorboxFilters();
  });
}

// ==========================================
// Rodapé Draggable & Posicionamento
// ==========================================
let savedFooterOffsetX = parseFloat(localStorage.getItem('footer_status_offset_x')) || 0;

function applyFooterStatusPosition() {
  const container = document.querySelector('.auth-status-container');
  if (container) {
    container.style.position = 'relative';
    container.style.zIndex = '30';
    container.style.transform = `translateX(${savedFooterOffsetX}px)`;
  }
}

function initFooterStatusDraggable() {
  const container = document.querySelector('.auth-status-container');
  const bottomBar = document.querySelector('.app-bottom-bar');
  if (!container || !bottomBar) return;

  container.style.position = 'relative';
  container.style.zIndex = '30';
  container.style.cursor = 'grab';

  let isDragging = false;
  let hasMoved = false;
  let startX = 0;
  let initialOffsetX = 0;

  applyFooterStatusPosition();

  container.addEventListener('mousedown', (e) => {
    isDragging = true;
    hasMoved = false;
    startX = e.clientX;
    initialOffsetX = savedFooterOffsetX;
    container.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const deltaX = e.clientX - startX;
    if (Math.abs(deltaX) > 3) hasMoved = true;

    let targetX = initialOffsetX + deltaX;

    const barRect = bottomBar.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    if (containerRect.left + deltaX < 255 && deltaX < 0) return;
    if (containerRect.right + deltaX > barRect.right - 10 && deltaX > 0) return;

    savedFooterOffsetX = targetX;
    container.style.transform = `translateX(${savedFooterOffsetX}px)`;
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      container.style.cursor = 'grab';
      document.body.style.userSelect = '';
      localStorage.setItem('footer_status_offset_x', savedFooterOffsetX);
    }
  });

  container.addEventListener('click', (e) => {
    if (hasMoved) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);
}

let savedGithubOffsetX = parseFloat(localStorage.getItem('github_button_offset_x')) || 0;

function applyGithubButtonPosition() {
  const btn = document.getElementById('btn-github-link');
  if (btn) {
    btn.style.position = 'relative';
    btn.style.zIndex = '30';
    btn.style.transform = `translateX(${savedGithubOffsetX}px)`;
  }
}

function initGithubButtonDraggable() {
  const btn = document.getElementById('btn-github-link');
  const bottomBar = document.querySelector('.app-bottom-bar');
  if (!btn || !bottomBar) return;

  btn.style.position = 'relative';
  btn.style.zIndex = '30';
  btn.style.cursor = 'grab';

  let isDragging = false;
  let hasMoved = false;
  let startX = 0;
  let initialOffsetX = 0;

  applyGithubButtonPosition();

  btn.addEventListener('mousedown', (e) => {
    isDragging = true;
    hasMoved = false;
    startX = e.clientX;
    initialOffsetX = savedGithubOffsetX;
    btn.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const deltaX = e.clientX - startX;
    if (Math.abs(deltaX) > 3) hasMoved = true;

    let targetX = initialOffsetX + deltaX;

    const barRect = bottomBar.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();

    if (btnRect.left + deltaX < 10 && deltaX < 0) return;
    if (btnRect.right + deltaX > barRect.right - 10 && deltaX > 0) return;

    savedGithubOffsetX = targetX;
    btn.style.transform = `translateX(${savedGithubOffsetX}px)`;
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      btn.style.cursor = 'grab';
      document.body.style.userSelect = '';
      localStorage.setItem('github_button_offset_x', savedGithubOffsetX);
    }
  });

  btn.addEventListener('click', (e) => {
    if (hasMoved) {
      e.preventDefault();
      e.stopPropagation();
    } else {
      e.preventDefault();
      if (window.api && window.api.openExternalUrl) {
        window.api.openExternalUrl('https://github.com/alazt/Nexus-Downloader');
      }
    }
  }, true);
}

// ==========================================
// Inicialização do App
// ==========================================
window.addEventListener('DOMContentLoaded', async () => {
  checkAuthStatus();
  loadConfig();
  startFooterStatusCycle();
  initFooterStatusDraggable();
  initGithubButtonDraggable();
  loadTorboxDownloads();

  if (window.api && window.api.getAppVersion) {
    try {
      const version = await window.api.getAppVersion();
      const verSpan = document.querySelector('#btn-check-version .version-num');
      if (verSpan && version) {
        verSpan.textContent = `v${version}`;
      }
    } catch (e) {}
  }
});

window.addEventListener('resize', () => {
  if (typeof applyFooterStatusPosition === 'function') applyFooterStatusPosition();
  if (typeof applyGithubButtonPosition === 'function') applyGithubButtonPosition();
});
