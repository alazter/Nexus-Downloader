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

// Escuta automática de eventos do Auto-Updater (Arquitetura em 5 Camadas)
if (window.api && window.api.onUpdaterStatus) {
  const updaterModal = document.getElementById('updater-modal-overlay');
  const modalTitle = document.getElementById('updater-modal-title');
  const modalSubtitle = document.getElementById('updater-modal-subtitle');
  const changelogCard = document.getElementById('updater-changelog-card');
  const releaseTag = document.getElementById('updater-release-tag');
  const releaseDate = document.getElementById('updater-release-date');
  const changelogBody = document.getElementById('updater-changelog-body');
  const progressContainer = document.getElementById('updater-progress-container');
  const progressBar = document.getElementById('updater-progress-bar');
  const percentText = document.getElementById('updater-progress-percent');
  const metaRow = document.getElementById('updater-meta-row');
  const sizeText = document.getElementById('updater-size-text');
  const speedText = document.getElementById('updater-speed-text');
  const modalFooter = document.getElementById('updater-modal-footer');
  const btnUpdateNow = document.getElementById('btn-update-now');
  const btnUpdateIgnore = document.getElementById('btn-update-ignore');

  if (btnUpdateIgnore) {
    btnUpdateIgnore.addEventListener('click', () => {
      if (updaterModal) updaterModal.style.display = 'none';
    });
  }

  if (btnUpdateNow) {
    btnUpdateNow.addEventListener('click', async () => {
      if (btnUpdateNow.dataset.mode === 'install') {
        window.api.restartAndInstall();
        return;
      }

      if (changelogCard) changelogCard.style.display = 'none';
      if (modalFooter) modalFooter.style.display = 'none';
      if (progressContainer) progressContainer.style.display = 'flex';
      if (metaRow) metaRow.style.display = 'flex';
      if (modalSubtitle) modalSubtitle.textContent = 'Baixando nova versão do software. O Nexus será reiniciado automaticamente ao concluir.';

      try {
        await window.api.downloadUpdate();
      } catch (err) {
        console.error('Erro ao iniciar download da atualização:', err);
      }
    });
  }

  window.api.onUpdaterStatus(async (data) => {
    if (!data) return;

    if (data.status === 'available' || data.updateAvailable) {
      if (updateNotice) {
        updateNotice.textContent = `Nova v${data.version || ''} disponível`;
        updateNotice.style.display = 'block';
      }

      if (modalTitle) modalTitle.textContent = data.title || `⚡ Nova Versão v${data.version || ''} Disponível`;
      if (modalSubtitle) modalSubtitle.textContent = 'Uma nova versão do Nexus Downloader está disponível com melhorias e correções.';
      if (releaseTag) releaseTag.textContent = data.version ? `v${data.version.replace(/^v/i, '')}` : 'vNova';
      if (releaseDate) releaseDate.textContent = data.publishedAt ? new Date(data.publishedAt).toLocaleDateString('pt-BR') : 'GitHub Releases';
      if (changelogBody) changelogBody.textContent = data.body || 'Melhorias de desempenho e correções gerais de estabilidade.';

      if (changelogCard) changelogCard.style.display = 'block';
      if (progressContainer) progressContainer.style.display = 'none';
      if (metaRow) metaRow.style.display = 'none';
      if (modalFooter) {
        modalFooter.style.display = 'flex';
        if (btnUpdateNow) {
          btnUpdateNow.textContent = 'Atualizar Agora';
          btnUpdateNow.dataset.mode = 'download';
        }
        if (btnUpdateIgnore) btnUpdateIgnore.style.display = 'inline-flex';
      }
      if (updaterModal) updaterModal.style.display = 'flex';

    } else if (data.status === 'downloading') {
      if (updateNotice) {
        updateNotice.textContent = `Baixando atualização: ${data.percent || 0}%...`;
        updateNotice.style.display = 'block';
      }

      if (updaterModal) updaterModal.style.display = 'flex';
      if (changelogCard) changelogCard.style.display = 'none';
      if (modalFooter) modalFooter.style.display = 'none';
      if (progressContainer) progressContainer.style.display = 'flex';
      if (metaRow) metaRow.style.display = 'flex';

      if (progressBar) progressBar.style.width = `${data.percent || 0}%`;
      if (percentText) percentText.textContent = `${data.percent || 0}%`;
      if (sizeText) sizeText.textContent = `${formatBytes(data.transferred || 0)} / ${formatBytes(data.total || 0)}`;
      if (speedText) speedText.textContent = `${data.mbps || '0.00'} Mbps`;

    } else if (data.status === 'downloaded') {
      if (updateNotice) {
        updateNotice.textContent = 'Versão pronta para instalar';
        updateNotice.style.display = 'block';
      }

      if (modalTitle) modalTitle.textContent = '⚡ Atualização Concluída';
      if (modalSubtitle) modalSubtitle.textContent = 'O download foi concluído com sucesso! Clique em Reiniciar e Instalar para aplicar a nova versão.';
      if (progressBar) progressBar.style.width = '100%';
      if (percentText) percentText.textContent = '100%';

      if (modalFooter) {
        modalFooter.style.display = 'flex';
        if (btnUpdateNow) {
          btnUpdateNow.textContent = 'Reiniciar e Instalar';
          btnUpdateNow.dataset.mode = 'install';
        }
        if (btnUpdateIgnore) btnUpdateIgnore.style.display = 'none';
      }
      if (updaterModal) updaterModal.style.display = 'flex';

    } else if (data.status === 'error') {
      if (updaterModal && progressContainer && progressContainer.style.display === 'none') {
        updaterModal.style.display = 'none';
      }
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
  const elDrime = document.getElementById('setting-mode-drime');
  const elTurbo = document.getElementById('setting-mode-turbo');
  const elSend = document.getElementById('setting-mode-send');

  if (elGdrive) elGdrive.value = modes.gdrive || 'single';
  if (elBunkr) elBunkr.value = modes.bunkr || 'multi';
  if (elMediaFire) elMediaFire.value = modes.mediafire || 'multi';
  if (elTeraBox) elTeraBox.value = modes.terabox || 'multi';
  if (elOneDrive) elOneDrive.value = modes.onedrive || 'single';
  if (elTorbox) elTorbox.value = modes.torbox || 'multi';
  if (elDrime) elDrime.value = modes.drime || 'multi';
  if (elTurbo) elTurbo.value = modes.turbo || 'multi';
  if (elSend) elSend.value = modes.send || 'multi';

  const settingTorboxKey = document.getElementById('setting-torbox-api-key');
  const settingTorboxEnabled = document.getElementById('setting-torbox-enabled');
  if (settingTorboxKey) settingTorboxKey.value = config.torboxApiKey || '';
  if (settingTorboxEnabled) settingTorboxEnabled.checked = !!config.torboxEnabled;

  const torboxServices = config.torboxForServices || {
    gdrive: false, bunkr: false, mediafire: false, terabox: false, onedrive: false, torbox: true, drime: false, turbo: false, send: true
  };
  ['gdrive', 'bunkr', 'mediafire', 'terabox', 'onedrive', 'torbox', 'drime', 'turbo', 'send'].forEach(svc => {
    const chk = document.getElementById(`setting-torbox-service-${svc}`);
    if (chk) {
      chk.checked = torboxServices[svc] !== undefined ? !!torboxServices[svc] : (svc === 'send' || svc === 'torbox');
    }
  });

  settingNotifications.checked = config.notificationsEnabled;

  const settingMinimizeToTray = document.getElementById('setting-minimize-to-tray');
  if (settingMinimizeToTray) {
    settingMinimizeToTray.checked = !!config.minimizeToTray;
  }

  const settingShowStartDownloadPopup = document.getElementById('setting-show-start-download-popup');
  if (settingShowStartDownloadPopup) {
    settingShowStartDownloadPopup.checked = config.showStartDownloadPopup !== false;
  }

  const settingEnableMultilinkAudit = document.getElementById('setting-enable-multilink-audit');
  if (settingEnableMultilinkAudit) {
    settingEnableMultilinkAudit.checked = config.enableMultilinkAuditAlerts !== false;
  }

  const serviceMaxObj = config.serviceMaxConcurrent || {};
  ['gdrive', 'bunkr', 'mediafire', 'terabox', 'vik1ngfile', 'drime', 'turbo', 'pixeldrain', 'gofile', 'torbox'].forEach(svc => {
    const sel = document.getElementById(`setting-service-max-${svc}`);
    if (sel) {
      sel.value = (serviceMaxObj[svc] !== undefined ? serviceMaxObj[svc] : 1).toString();
    }
  });
}

['gdrive', 'bunkr', 'mediafire', 'terabox', 'vik1ngfile', 'drime', 'turbo', 'pixeldrain', 'gofile', 'torbox'].forEach(svc => {
  const sel = document.getElementById(`setting-service-max-${svc}`);
  if (sel) {
    sel.addEventListener('change', async () => {
      const config = await window.api.getConfig();
      const serviceMaxConcurrent = config.serviceMaxConcurrent || {};
      serviceMaxConcurrent[svc] = parseInt(sel.value, 10) || 1;
      await window.api.setConfig({ serviceMaxConcurrent });
    });
  }
});

['gdrive', 'bunkr', 'mediafire', 'terabox', 'onedrive', 'torbox', 'drime', 'turbo', 'send'].forEach(service => {
  const el = document.getElementById(`setting-mode-${service}`);
  if (el) {
    el.addEventListener('change', async () => {
      const config = await window.api.getConfig();
      const modes = config.downloadModes || { gdrive: 'single', bunkr: 'multi', mediafire: 'multi', terabox: 'multi', onedrive: 'single', torbox: 'multi', drime: 'multi', turbo: 'multi', send: 'multi' };
      modes[service] = el.value;
      await window.api.setConfig({ downloadModes: modes });
    });
  }
});

['gdrive', 'bunkr', 'mediafire', 'terabox', 'onedrive', 'torbox', 'drime', 'turbo', 'send'].forEach(svc => {
  const chk = document.getElementById(`setting-torbox-service-${svc}`);
  if (chk) {
    chk.addEventListener('change', async () => {
      const config = await window.api.getConfig();
      const currentServices = config.torboxForServices || {
        gdrive: false, bunkr: false, mediafire: false, terabox: false, onedrive: false, torbox: true, drime: false, turbo: false, send: true
      };
      currentServices[svc] = chk.checked;
      await window.api.setConfig({ torboxForServices: currentServices });
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

const settingMinimizeToTray = document.getElementById('setting-minimize-to-tray');
if (settingMinimizeToTray) {
  settingMinimizeToTray.addEventListener('change', async () => {
    await window.api.setConfig({ minimizeToTray: settingMinimizeToTray.checked });
  });
}

const settingShowStartDownloadPopup = document.getElementById('setting-show-start-download-popup');
if (settingShowStartDownloadPopup) {
  settingShowStartDownloadPopup.addEventListener('change', async () => {
    await window.api.setConfig({ showStartDownloadPopup: settingShowStartDownloadPopup.checked });
  });
}

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
  if (!el.value || el.value.trim().length === 0) {
    el.style.height = '44px';
    return;
  }
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
  inputDriveLink.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
      const val = inputDriveLink.value.trim();
      if (val.length > 0) {
        e.preventDefault();
        btnScan.click();
      }
    }
  });
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
  if (btnAddSelected) btnAddSelected.style.display = 'none';

  try {
    const res = await window.api.scanLink(url);
    const files = Array.isArray(res) ? res : (res && res.files ? res.files : []);
    const summary = res && res.summary ? res.summary : null;

    if (!files || files.length === 0) {
      await showCustomAlert('Nenhum arquivo encontrado no link fornecido.', 'Escaneamento Concluído');
      if (scannedFiles.length === 0) scanEmptyState.style.display = 'flex';
      if (btnAddSelected) btnAddSelected.style.display = 'none';
      return;
    }

    files.forEach(nf => {
      if (!scannedFiles.some(existing => existing.id === nf.id)) {
        scannedFiles.push(nf);
      }
    });

    if (inputDriveLink) {
      inputDriveLink.value = '';
      autoResizeTextarea(inputDriveLink);
    }
    renderResults();
    renderMultilinkAuditSummary(summary);
  } catch (err) {
    let cleanErrorMsg = (err && err.message ? err.message : 'Erro ao escanear o link.')
      .replace(/^Error invoking remote method '[^']+':\s*/i, '')
      .replace(/^Error:\s*/i, '');
    await showCustomAlert(cleanErrorMsg, 'Aviso no Escaneamento');
    if (scannedFiles.length === 0) scanEmptyState.style.display = 'flex';
    if (btnAddSelected) btnAddSelected.style.display = 'none';
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
    accumulatedMultilinkSummary = null;
    lastMultilinkSummary = null;
    if (scanAuditSummaryBar) scanAuditSummaryBar.style.display = 'none';
    if (resultsGroupsContainer) resultsGroupsContainer.innerHTML = '';
    if (resultsList) resultsList.innerHTML = '';
    resultsContainer.style.display = 'none';
    if (btnAddSelected) btnAddSelected.style.display = 'none';
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
    if (btnAddSelected) btnAddSelected.style.display = 'none';
    updateSelectionSummary();
    return;
  }

  // Agrupa arquivos por Serviço e caminho de subpasta/diretório
  const groupsMap = new Map();
  scannedFiles.forEach((file, index) => {
    let rawGroupName = file.folderName || 'Downloads';
    if (!file.folderName && file.relativePath && file.relativePath.includes('/')) {
      const parts = file.relativePath.split('/').filter(Boolean);
      const cleanParts = parts.filter((part, idx) => idx === 0 || part !== parts[idx - 1]);
      rawGroupName = cleanParts.length > 1 ? cleanParts.slice(0, -1).join(' / ') : cleanParts[0];
    }

    const sTag = getServiceTag(file);
    const serviceName = sTag ? (sTag.hoster ? `${sTag.text} ${sTag.hoster}` : sTag.text) : 'Google Drive';
    const groupKey = `${serviceName}:::${rawGroupName}`;

    if (!groupsMap.has(groupKey)) {
      groupsMap.set(groupKey, { groupName: rawGroupName, groupItems: [] });
    }
    groupsMap.get(groupKey).groupItems.push({ file, index });
  });

  const isMultiGroup = groupsMap.size >= 1;

  if (isMultiGroup && resultsGroupsContainer) {
    if (resultsTableWrapperSingle) resultsTableWrapperSingle.style.display = 'none';
    resultsGroupsContainer.style.display = 'flex';

    groupsMap.forEach(({ groupName, groupItems }) => {
      const totalGroupSize = groupItems.reduce((acc, item) => acc + item.file.size, 0);

      const card = document.createElement('div');
      card.className = 'folder-group-card';

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

      const serviceTagSpanWrapper = document.createElement('span');
      serviceTagSpanWrapper.style.display = 'inline-flex';
      serviceTagSpanWrapper.style.alignItems = 'center';
      serviceTagSpanWrapper.style.verticalAlign = 'middle';
      serviceTagSpanWrapper.innerHTML = renderServiceTagHTML(serviceTag, false);

      const folderTypeSpan = document.createElement('span');
      folderTypeSpan.style.cssText = `background: ${folderTag.bg}; color: ${folderTag.color}; border: 1px solid ${folderTag.border}; font-weight: 700; padding: 2px 7px; border-radius: 4px; font-size: 11px; margin-right: 8px; display: inline-block; vertical-align: middle;`;
      folderTypeSpan.textContent = folderTag.text;

      const nameSpan = document.createElement('span');
      nameSpan.className = 'folder-group-name';
      nameSpan.textContent = groupName;

      titleGroup.appendChild(groupCb);
      titleGroup.appendChild(folderIcon);
      titleGroup.appendChild(serviceTagSpanWrapper);
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
        tdName.innerHTML = `${renderServiceTagHTML(sTag, true)}<span style="background: ${fTag.bg}; color: ${fTag.color}; border: 1px solid ${fTag.border}; font-weight: 700; padding: 2px 6px; border-radius: 4px; font-size: 10px; margin-right: 6px; display: inline-block; vertical-align: middle;">${fTag.text}</span>${file.name}`;
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

      // Eventos do Folder Group Card
      groupCb.addEventListener('click', (e) => {
        e.stopPropagation();
      });

      groupCb.addEventListener('change', () => {
        const itemCbs = tbody.querySelectorAll('.file-checkbox');
        itemCbs.forEach(c => {
          c.checked = groupCb.checked;
        });
        groupCb.indeterminate = false;
        updateSelectionSummary();
      });

      header.addEventListener('click', (e) => {
        if (e.target === groupCb || e.target.type === 'checkbox' || (e.target.classList && e.target.classList.contains('folder-group-checkbox'))) return;
        card.classList.toggle('collapsed');
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
      tdName.innerHTML = `${renderServiceTagHTML(sTag, true)}<span style="background: ${fTag.bg}; color: ${fTag.color}; border: 1px solid ${fTag.border}; font-weight: 700; padding: 2px 6px; border-radius: 4px; font-size: 10px; margin-right: 6px; display: inline-block; vertical-align: middle;">${fTag.text}</span>${file.name}`;
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
  const container = resultsContainer || document;
  const allFileCbs = container.querySelectorAll('.file-checkbox');
  let selectedCount = 0;
  let selectedSize = 0;
  
  allFileCbs.forEach(cb => {
    if (cb.checked) {
      selectedCount++;
      const index = parseInt(cb.dataset.index, 10);
      if (!isNaN(index) && scannedFiles[index]) {
        selectedSize += scannedFiles[index].size;
      }
    }
  });

  if (selectedCountText) {
    selectedCountText.textContent = `${selectedCount} arquivos selecionados (${formatBytes(selectedSize)})`;
  }

  if (btnAddSelected) {
    btnAddSelected.disabled = (selectedCount === 0);
    if (scannedFiles && scannedFiles.length > 0) {
      btnAddSelected.style.display = 'inline-flex';
    }
  }

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

  if (resultsGroupsContainer) {
    const cards = resultsGroupsContainer.querySelectorAll('.folder-group-card');
    cards.forEach(card => {
      const gCb = card.querySelector('.folder-group-checkbox');
      const tbody = card.querySelector('tbody');
      if (gCb && tbody) {
        updateGroupCheckboxState(gCb, tbody);
      }
    });
  }
}

btnAddSelected.addEventListener('click', async () => {
  const container = resultsContainer || document;
  const allFileCbs = container.querySelectorAll('.file-checkbox');
  const selectedFiles = [];
  
  allFileCbs.forEach(cb => {
    if (cb.checked) {
      const index = parseInt(cb.dataset.index, 10);
      if (!isNaN(index) && scannedFiles[index]) {
        selectedFiles.push(scannedFiles[index]);
      }
    }
  });

  // Fallback infalível: Se nenhum checkbox individual foi capturado, mas scannedFiles possui itens
  if (selectedFiles.length === 0 && scannedFiles && scannedFiles.length > 0) {
    console.log('[Scanner UI] Fallback acionado: adicionando todos os scannedFiles à fila');
    selectedFiles.push(...scannedFiles);
  }

  if (selectedFiles.length > 0) {
    try {
      const countAdded = selectedFiles.length;
      const queueLength = await window.api.addToQueue(selectedFiles);
      const appConfig = await window.api.getConfig();
      if (appConfig.showStartDownloadPopup !== false && appConfig.enableMultilinkAuditAlerts !== false) {
        await showCustomAlert(`Todos os ${countAdded} arquivo(s) selecionado(s) foram inseridos na Fila de Downloads sem erros.`, 'Fila de Downloads');
      }
      switchQueueSubtab('active');
      switchTab('queue');
      
      // Reset scanner
      if (inputDriveLink) inputDriveLink.value = '';
      if (resultsContainer) resultsContainer.style.display = 'none';
      if (scanEmptyState) scanEmptyState.style.display = 'flex';
      if (btnAddSelected) btnAddSelected.style.display = 'none';
      if (resultsList) resultsList.innerHTML = '';
      if (resultsGroupsContainer) resultsGroupsContainer.innerHTML = '';
      scannedFiles = [];
      accumulatedMultilinkSummary = null;
      lastMultilinkSummary = null;
      if (scanAuditSummaryBar) scanAuditSummaryBar.style.display = 'none';
    } catch (err) {
      console.error('[Scanner UI] Erro ao adicionar arquivos à fila:', err);
      await showCustomAlert('Erro ao adicionar arquivos à fila: ' + err.message, 'Erro na Fila');
    }
  } else {
    await showCustomAlert('Nenhum arquivo selecionado para iniciar o download.', 'Escanear Links');
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

function detectTorboxHoster(file) {
  if (!file) return null;
  const str = (
    (file.sourceUrl || '') + ' ' + 
    (file.originalUrl || '') + ' ' + 
    (file.originalLink || '') + ' ' + 
    (file.downloadUrl || '') + ' ' + 
    (file.directUrl || '') + ' ' + 
    (file.url || '') + ' ' +
    (file.folderName || '') + ' ' + 
    (file.name || '')
  ).toLowerCase();
  
  if (str.includes('vik1ngfile') || str.includes('vikingfile')) return 'Vik1ngFile';
  if (str.includes('pixeldrain') || str.includes('pixeldrain.com')) return 'PixelDrain';
  if (str.includes('1fichier') || str.includes('1fichier.com')) return '1Fichier';
  if (str.includes('rapidgator') || str.includes('rapidgator.net') || str.includes('rg.to')) return 'Rapidgator';
  if (str.includes('mega.nz') || str.includes('mega.co.nz')) return 'MEGA';
  if (str.includes('mediafire') || str.includes('mediafire.com')) return 'MediaFire';
  if (str.includes('ddownload') || str.includes('ddownload.com')) return 'DDownload';
  if (str.includes('katfile') || str.includes('katfile.com') || str.includes('katfile.cloud')) return 'KatFile';
  if (str.includes('turbobit') || str.includes('turbobit.net') || str.includes('turbo.to')) return 'Turbobit';
  if (str.includes('nitroflare') || str.includes('nitroflare.com') || str.includes('nitro.download')) return 'Nitroflare';
  if (str.includes('uptobox') || str.includes('uptobox.com') || str.includes('uptostream')) return 'Uptobox';
  if (str.includes('gofile') || str.includes('gofile.io')) return 'GoFile';
  if (str.includes('filefactory') || str.includes('filefactory.com')) return 'FileFactory';
  if (str.includes('sendspace') || str.includes('sendspace.com')) return 'SendSpace';
  if (str.includes('megaup') || str.includes('megaup.net')) return 'MegaUp';
  if (str.includes('drop.download') || str.includes('dropapk')) return 'DropDownload';
  if (str.includes('terabox') || str.includes('1024tera') || str.includes('gibibox') || str.includes('freeterabox')) return 'TeraBox';
  if (str.includes('send.cm') || str.includes('send.now') || str.includes('sendit.cloud') || str.includes('userscloud') || str.includes('tusfiles') || str.includes('usersfiles')) return 'Send';
  if (str.includes('swisstransfer')) return 'SwissTransfer';
  if (str.includes('nexusmods')) return 'NexusMods';
  if (str.includes('mixdrop')) return 'Mixdrop';
  if (str.includes('uploady')) return 'Uploady';
  if (str.includes('cyberdrop')) return 'Cyberdrop';
  if (str.includes('catbox')) return 'Catbox';
  if (str.includes('darkibox')) return 'Darkibox';
  if (str.includes('filespace')) return 'FileSpace';
  if (str.includes('hubcloud')) return 'HubCloud';
  if (str.includes('drive.google') || str.includes('googledrive')) return 'Google Drive';
  if (str.includes('bunkr') || str.includes('balbums')) return 'Bunkr';
  if (str.includes('onedrive') || str.includes('sharepoint')) return 'OneDrive';
  if (str.includes('workupload')) return 'Workupload';
  if (str.includes('krakenfiles')) return 'Krakenfiles';
  if (str.includes('clicknupload')) return 'ClicknUpload';
  if (str.includes('streamtape')) return 'Streamtape';
  if (str.includes('filedot')) return 'Filedot';
  if (str.includes('filemoon')) return 'Filemoon';
  if (str.includes('doodstream') || str.includes('dood.')) return 'DoodStream';
  if (str.includes('voe.sx')) return 'Voe';
  if (str.includes('downmedialink')) return 'DownMediaLink';
  if (str.includes('fshare.vn')) return 'Fshare';
  if (str.includes('wupfile')) return 'Wupfile';
  if (str.includes('userload')) return 'Userload';
  if (str.includes('bowfile')) return 'Bowfile';
  if (str.includes('fastclick')) return 'FastClick';
  if (str.includes('uploadgig')) return 'Uploadgig';
  if (str.includes('hexupload')) return 'Hexupload';
  if (str.includes('filerio')) return 'Filerio';
  if (str.includes('drime.cloud')) return 'Drime Cloud';
  if (str.includes('turbo.cr') || str.includes('turbocdn')) return 'Turbo.cr';
  if (str.includes('e-hentai')) return 'E-Hentai';
  if (str.includes('eporner')) return 'EPorner';
  if (str.includes('fansly')) return 'Fansly';
  if (str.includes('gelbooru')) return 'Gelbooru';
  if (str.includes('hitomi')) return 'Hitomi';
  if (str.includes('koofr')) return 'Koofr';
  if (str.includes('mangadex')) return 'Mangadex';
  if (str.includes('webtoon')) return 'Webtoon';
  if (str.includes('hubdrive')) return 'HubDrive';
  if (str.includes('driveseed')) return 'DriveSeed';
  if (str.includes('datavaults')) return 'DataVaults';
  if (str.includes('transfernow')) return 'TransferNow';
  if (str.includes('t.me') || str.includes('telegram')) return 'Telegram';
  if (str.includes('discord')) return 'Discord';

  // Fallback de extração dinâmica de domínio para QUALQUER site/hoster não catalogado
  const candidateUrls = [file.sourceUrl, file.originalUrl, file.originalLink, file.downloadUrl, file.directUrl, file.url, file.id];
  for (const rawUrl of candidateUrls) {
    if (!rawUrl || typeof rawUrl !== 'string') continue;
    try {
      const uStr = rawUrl.startsWith('http') ? rawUrl : 'https://' + rawUrl;
      const parsed = new URL(uStr);
      const domainParts = parsed.hostname.replace(/^www\./i, '').split('.');
      if (domainParts.length >= 2) {
        const hName = domainParts[domainParts.length - 2];
        if (hName && hName.length > 2 && hName !== 'tb-cdn' && hName !== 'torbox' && hName !== 'localhost' && hName !== '127') {
          return hName.charAt(0).toUpperCase() + hName.slice(1);
        }
      }
    } catch (e) {}
  }

  return null;
}

function renderServiceTagHTML(sTag, isTableRow = false) {
  if (!sTag) return '';
  const pad = isTableRow ? '2px 6px' : '2px 7px';
  const fontSize = isTableRow ? '10px' : '11px';
  let html = `<span style="background: ${sTag.bg}; color: ${sTag.color}; border: 1px solid ${sTag.border}; font-weight: 700; padding: ${pad}; border-radius: 4px; font-size: ${fontSize}; margin-right: 6px; display: inline-block; vertical-align: middle; flex-shrink: 0; white-space: nowrap;">${sTag.text}</span>`;
  if (sTag.hosterTag) {
    const ht = sTag.hosterTag;
    html += `<span style="background: ${ht.bg}; color: ${ht.color}; border: 1px solid ${ht.border}; font-weight: 700; padding: ${pad}; border-radius: 4px; font-size: ${fontSize}; margin-right: 6px; display: inline-block; vertical-align: middle; flex-shrink: 0; white-space: nowrap;">${ht.text}</span>`;
  }
  return html;
}

function getServiceTag(file) {
  const id = (file && file.id) || '';
  const service = (file && file.service) || '';
  const url = (file && (file.downloadUrl || file.directUrl || file.sourceUrl || file.originalUrl || '')) || '';

  if (id.startsWith('pixeldrain_') || service === 'PixelDrain' || url.includes('pixeldrain.com')) {
    return { text: 'PixelDrain', bg: 'rgba(245, 158, 11, 0.18)', color: '#fbbf24', border: 'rgba(245, 158, 11, 0.4)' };
  }
  if (id.startsWith('drime_') || service === 'Drime Cloud' || url.includes('drime.cloud')) {
    return { text: 'Drime Cloud', bg: 'rgba(16, 185, 129, 0.18)', color: '#34d399', border: 'rgba(16, 185, 129, 0.4)' };
  }
  if (id.startsWith('turbo_') || service === 'Turbo.cr' || (url.includes('turbocdn.st') && !file.torboxType)) {
    return { text: 'Turbo.cr', bg: 'rgba(244, 63, 94, 0.18)', color: '#fb7185', border: 'rgba(244, 63, 94, 0.4)' };
  }
  if (id.startsWith('torbox_') || (file && file.torboxType) || url.includes('tb-cdn') || service === 'Torrent' || url.startsWith('magnet:') || url.endsWith('.torrent')) {
    const isTorrent = (file && file.torboxType === 'torrent') || service === 'Torrent' || id.includes('torrent') || !!(file && file.hash) || (url && (url.startsWith('magnet:') || url.endsWith('.torrent')));
    const hosterName = detectTorboxHoster(file);
    const result = { 
      text: 'Torbox', 
      bg: 'rgba(139, 92, 246, 0.18)', 
      color: '#a78bfa', 
      border: 'rgba(139, 92, 246, 0.4)' 
    };
    if (isTorrent) {
      result.hoster = 'Torrent';
      result.hosterTag = {
        text: 'Torrent',
        bg: 'rgba(59, 130, 246, 0.18)',
        color: '#60a5fa',
        border: 'rgba(59, 130, 246, 0.4)'
      };
    } else if (hosterName) {
      result.hoster = hosterName;
      result.hosterTag = {
        text: hosterName,
        bg: 'rgba(236, 72, 153, 0.18)',
        color: '#f472b6',
        border: 'rgba(236, 72, 153, 0.4)'
      };
    }
    return result;
  }
  if (id.startsWith('terabox_')) {
    return { text: 'TeraBox', bg: 'rgba(245, 158, 11, 0.18)', color: '#fbbf24', border: 'rgba(245, 158, 11, 0.4)' };
  }
  if (id.startsWith('onedrive_') || (file && file.oneDriveUrl && file.oneDriveUrl.includes('sharepoint'))) {
    return { text: 'Microsoft OneDrive', bg: 'rgba(255, 255, 255, 0.18)', color: '#ffffff', border: 'rgba(255, 255, 255, 0.4)' };
  }
  if (id.startsWith('send_') || service === 'Send' || url.includes('send.now') || url.includes('send.cm')) {
    return { text: 'Send', bg: 'rgba(236, 72, 153, 0.18)', color: '#f472b6', border: 'rgba(236, 72, 153, 0.4)' };
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

  // Renderiza card ativo no topo (100% Livre de Piscar / Sem repaints desnecessários)
  if (activeDownloads.length > 0 && activeDownloadPanel) {
    const active = activeDownloads[0]; // Exibe o primeiro ativo no card principal
    
    if (activeDownloadPanel.style.display !== 'flex') {
      activeDownloadPanel.style.display = 'flex';
    }
    
    // Atualiza título e tags SOMENTE quando o item ativo muda de arquivo (sem re-parse de HTML em loop)
    if (activeDownloadPanel.dataset.activeItemId !== active.id) {
      activeDownloadPanel.dataset.activeItemId = active.id;
      const pureFileName = (active.name || '').includes('/') ? active.name.split('/').pop() : active.name;
      const sTag = getServiceTag(active);
      const tag = getFileTypeTag(active);
      const spanServiceTags = renderServiceTagHTML(sTag, false);
      const spanFileTag = `<span style="background: ${tag.bg}; color: ${tag.color}; border: 1px solid ${tag.border}; font-weight: 700; padding: 2px 7px; border-radius: 4px; font-size: 11px; margin-right: 8px; display: inline-block; vertical-align: middle;">${tag.text}</span>`;
      if (activeFilename) {
        activeFilename.innerHTML = `${spanServiceTags}${spanFileTag}${escapeHtml(pureFileName)}`;
        activeFilename.title = pureFileName;
      }
      if (btnActivePause) btnActivePause.onclick = () => window.api.pauseDownload(active.id);
      if (btnActiveCancel) {
        btnActiveCancel.onclick = async () => {
          if (await showCustomConfirm(`Cancelar o download do arquivo "${active.name}"?`, 'Cancelar Download')) {
            window.api.cancelDownload(active.id);
          }
        };
      }
    }

    if (active && torboxCloudFiles && torboxCloudFiles.length > 0) {
      const matchingCloudItem = torboxCloudFiles.find(f => 
        String(f.id) === String(active.id) ||
        (f.torboxId && (String(f.torboxId) === String(active.torboxId) || String(f.torboxId) === String(active.numericId)))
      );
      if (matchingCloudItem && !matchingCloudItem.isFinished && matchingCloudItem.progress !== undefined && matchingCloudItem.progress < 100) {
        active.cloudProgress = matchingCloudItem.progress;
        active.cloudMessage = `Torbox baixando no servidor (${matchingCloudItem.progress}%)...`;
      }
    }

    const isTorboxActive = active && (active.id.startsWith('torbox_') || active.torboxType || active.torboxId);
    if (isTorboxActive && (active.downloadedBytes === 0 || active.downloadedBytes === undefined) && (active.cloudProgress === undefined && !active.cloudMessage)) {
      active.cloudProgress = active.progress || 0;
      active.cloudMessage = `Torbox baixando no servidor (${active.cloudProgress}%)...`;
    }

    const activeBadgeEl = document.getElementById('active-badge-element');
    const activeCloudNotice = document.getElementById('active-cloud-notice-container');

    if (active.cloudMessage || active.cloudProgress !== undefined) {
      const cProg = active.cloudProgress !== undefined ? active.cloudProgress : (active.progress || 0);
      
      if (activeBadgeEl && activeBadgeEl.dataset.state !== 'cloud') {
        activeBadgeEl.dataset.state = 'cloud';
        activeBadgeEl.innerHTML = '<img src="assets/torbox_box_logo.png" width="14" height="14" style="vertical-align: middle; margin-right: 4px;"> AGUARDANDO TORBOX';
        activeBadgeEl.classList.add('cloud-waiting');
      }

      if (activeCloudNotice && activeCloudNotice.style.display !== 'flex') {
        activeCloudNotice.style.display = 'flex';
        activeCloudNotice.innerHTML = `
          <span class="notice-icon" style="display: flex; align-items: center;"><img src="assets/torbox_box_logo.png" width="22" height="22" style="filter: drop-shadow(0 0 6px rgba(167,139,250,0.6));"></span>
          <div class="notice-body">
            <div class="notice-title">Aguardando download nos servidores do Torbox (${cProg}%)</div>
            <div class="notice-desc">O arquivo está sendo baixado no servidor Torbox. O download local no Nexus iniciará automaticamente assim que o Torbox finalizar.</div>
          </div>
        `;
      }
      if (activeProgressText) activeProgressText.textContent = `Torbox ${cProg}%`;
      if (activeProgressBar) activeProgressBar.style.width = `${cProg}%`;
      if (activeSpeedText) activeSpeedText.textContent = 'Servidor Torbox Processando';
      if (activeEtaText) activeEtaText.textContent = 'Aguardando Conclusão';
    } else {
      if (activeBadgeEl && activeBadgeEl.dataset.state !== 'local') {
        activeBadgeEl.dataset.state = 'local';
        activeBadgeEl.textContent = 'BAIXANDO AGORA';
        activeBadgeEl.classList.remove('cloud-waiting');
      }
      if (activeCloudNotice && activeCloudNotice.style.display !== 'none') {
        activeCloudNotice.style.display = 'none';
      }
      if (activeProgressText) activeProgressText.textContent = `${active.progress || 0}%`;
      if (activeProgressBar) activeProgressBar.style.width = `${active.progress || 0}%`;
      if (activeSpeedText) activeSpeedText.textContent = `${formatBytes(active.speed)}/s`;
      if (activeEtaText) activeEtaText.textContent = formatETA(active.eta);
    }
    if (activeBytesText) activeBytesText.textContent = `${formatBytes(active.downloadedBytes)} / ${formatBytes(active.size)}`;
  } else if (activeDownloadPanel) {
    if (activeDownloadPanel.style.display !== 'none') {
      activeDownloadPanel.style.display = 'none';
    }
    activeDownloadPanel.dataset.activeItemId = '';
  }

  // 2. Renderiza lista da fila (Reconciliação In-Place para EVITAR PISCAR no hover)
  if (queueTotalCount.textContent !== queue.length.toString()) {
    queueTotalCount.textContent = queue.length.toString();
  }

  const emptyStateElem = document.getElementById('queue-empty-state');
  if (queue.length === 0) {
    queueItemsList.innerHTML = '';
    if (emptyStateElem) emptyStateElem.style.display = 'flex';
    return;
  }

  if (emptyStateElem) emptyStateElem.style.display = 'none';

  // Agrupa arquivos por Serviço + Hoster e folderName
  const folderMap = new Map();
  queue.forEach(item => {
    const sTag = getServiceTag(item);
    const serviceName = sTag ? (sTag.hoster ? `${sTag.text} ${sTag.hoster}` : sTag.text) : 'Google Drive';
    const rawFolder = item.folderName || 'Downloads';
    const groupKey = `${serviceName}:::${rawFolder}`;
    if (!folderMap.has(groupKey)) {
      folderMap.set(groupKey, { serviceName, folderName: rawFolder, items: [] });
    }
    folderMap.get(groupKey).items.push(item);
  });

  // Helper para identificar se um item está pendente/processando na nuvem Torbox
  const isTorboxPendingItem = (item) => {
    if (!item || item.status === 'completed') return false;
    if (item.cloudMessage || (item.cloudProgress !== undefined && item.cloudProgress < 100)) return true;
    if (item.torboxType || (item.id && item.id.startsWith('torbox_')) || item.torboxId) return true;
    return false;
  };

  // Garante a existência dos três containers de seção na fila
  let activeSection = queueItemsList.querySelector('#queue-active-section');
  if (!activeSection) {
    activeSection = document.createElement('div');
    activeSection.id = 'queue-active-section';
    activeSection.innerHTML = `
      <div class="queue-section-header">
        <div class="queue-section-title">
          <span>⚡ Em Progresso e Fila Ativa</span>
          <span class="queue-section-count" id="queue-active-count">0</span>
        </div>
      </div>
      <div class="queue-section-body" id="queue-active-body"></div>
    `;
    queueItemsList.appendChild(activeSection);
  }

  let torboxSection = queueItemsList.querySelector('#queue-torbox-section');
  if (!torboxSection) {
    torboxSection = document.createElement('div');
    torboxSection.id = 'queue-torbox-section';
    torboxSection.innerHTML = `
      <div class="queue-section-header" style="border-left-color: #a78bfa;">
        <div class="queue-section-title">
          <span><img src="assets/torbox_box_logo.png" width="18" height="18" style="vertical-align: middle; margin-right: 6px; filter: drop-shadow(0 0 4px rgba(167,139,250,0.5));"> Aguardando / Processando no Torbox</span>
          <span class="queue-section-count" id="queue-torbox-count" style="background: rgba(167, 139, 250, 0.2); color: #a78bfa;">0</span>
        </div>
      </div>
      <div class="queue-section-body" id="queue-torbox-body"></div>
    `;
    queueItemsList.appendChild(torboxSection);
  }

  let completedSection = queueItemsList.querySelector('#queue-completed-section');
  if (!completedSection) {
    completedSection = document.createElement('div');
    completedSection.id = 'queue-completed-section';
    completedSection.innerHTML = `
      <div class="queue-section-header completed-header">
        <div class="queue-section-title">
          <span>✅ Downloads Concluídos</span>
          <span class="queue-section-count" id="queue-completed-count">0</span>
        </div>
        <button class="btn btn-outline-success btn-sm" id="btn-clear-completed-sec" title="Limpar downloads concluídos" style="display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; font-size: 12px; border-radius: 6px;">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span>Limpar Concluídos</span>
        </button>
      </div>
      <div class="queue-section-body" id="queue-completed-body"></div>
    `;
    queueItemsList.appendChild(completedSection);

    const btnClearCompletedSec = completedSection.querySelector('#btn-clear-completed-sec');
    if (btnClearCompletedSec) {
      btnClearCompletedSec.onclick = () => window.api.clearCompleted();
    }
  }

  const activeBody = activeSection.querySelector('#queue-active-body');
  const torboxBody = torboxSection.querySelector('#queue-torbox-body');
  const completedBody = completedSection.querySelector('#queue-completed-body');

  // Separa diretórios entre ativos, aguardando Torbox e concluídos
  const activeEntries = [];
  const torboxEntries = [];
  const completedEntries = [];

  folderMap.forEach(({ serviceName, folderName, items: folderItems }, groupKey) => {
    const completedItems = folderItems.filter(f => f.status === 'completed');
    if (completedItems.length > 0) {
      completedEntries.push([groupKey, folderName, completedItems]);
    }

    const torboxItems = folderItems.filter(f => f.status !== 'completed' && isTorboxPendingItem(f));
    if (torboxItems.length > 0) {
      torboxEntries.push([groupKey, folderName, torboxItems]);
    }

    const activeItems = folderItems.filter(f => f.status !== 'completed' && !isTorboxPendingItem(f));
    if (activeItems.length > 0) {
      activeEntries.push([groupKey, folderName, activeItems]);
    }
  });

  activeEntries.sort((a, b) => {
    const rankA = getFolderSortRank(a[2]);
    const rankB = getFolderSortRank(b[2]);
    if (rankA !== rankB) return rankA - rankB;
    return a[1].localeCompare(b[1]);
  });

  torboxEntries.sort((a, b) => a[1].localeCompare(b[1]));

  const getCompletedTime = (item) => {
    if (!item) return 0;
    if (item.completedAt && typeof item.completedAt === 'number') return item.completedAt;
    if (item.completedTime && typeof item.completedTime === 'number') return item.completedTime;
    if (item.finishedAt && typeof item.finishedAt === 'number') return item.finishedAt;
    if (item.status === 'completed') {
      item.completedAt = Date.now();
      return item.completedAt;
    }
    return Number(item.timestamp || 0);
  };

  // Ordena itens internos e pastas da aba Concluídos do mais recente ao mais antigo (último arquivo baixado no topo)
  completedEntries.forEach(entry => {
    entry[2].sort((a, b) => getCompletedTime(b) - getCompletedTime(a));
  });

  completedEntries.sort((a, b) => {
    const maxA = Math.max(...a[2].map(item => getCompletedTime(item)), 0);
    const maxB = Math.max(...b[2].map(item => getCompletedTime(item)), 0);
    if (maxA !== maxB) return maxB - maxA;
    return a[1].localeCompare(b[1]);
  });

  lastQueueData = queue;

  // Atualiza Badges das 3 Sub-Abas com acendimento dinâmico quando count >= 1
  const activeItemsCount = queue.filter(item => item.status !== 'completed' && !isTorboxPendingItem(item)).length;
  const torboxItemsCount = queue.filter(item => item.status !== 'completed' && isTorboxPendingItem(item)).length;
  const completedItemsCount = queue.filter(item => item.status === 'completed').length;

  const badgeSubtabActive = document.getElementById('badge-subtab-active');
  const badgeSubtabTorbox = document.getElementById('badge-subtab-torbox');
  const badgeSubtabCompleted = document.getElementById('badge-subtab-completed');

  const updateSubtabBadgeStyle = (badgeEl, count, activeBg, activeBorder, activeShadow) => {
    if (!badgeEl) return;
    badgeEl.textContent = count.toString();
    if (count > 0) {
      badgeEl.style.background = activeBg;
      badgeEl.style.color = '#ffffff';
      badgeEl.style.border = activeBorder;
      badgeEl.style.boxShadow = activeShadow;
      badgeEl.style.opacity = '1';
    } else {
      badgeEl.style.background = 'rgba(255, 255, 255, 0.08)';
      badgeEl.style.color = '#94a3b8';
      badgeEl.style.border = '1px solid rgba(255, 255, 255, 0.12)';
      badgeEl.style.boxShadow = 'none';
      badgeEl.style.opacity = '0.7';
    }
  };

  updateSubtabBadgeStyle(badgeSubtabActive, activeItemsCount, '#3b82f6', '1px solid rgba(59, 130, 246, 0.6)', '0 0 8px rgba(59, 130, 246, 0.5)');
  updateSubtabBadgeStyle(badgeSubtabTorbox, torboxItemsCount, 'linear-gradient(135deg, #f59e0b, #d97706)', '1px solid rgba(245, 158, 11, 0.6)', '0 0 10px rgba(245, 158, 11, 0.5)');
  updateSubtabBadgeStyle(badgeSubtabCompleted, completedItemsCount, '#10b981', '1px solid rgba(16, 185, 129, 0.6)', '0 0 8px rgba(16, 185, 129, 0.4)');

  // Controla visibilidade das seções baseando-se na sub-aba ativa (currentQueueSubtab)
  const subtabEmptyState = document.getElementById('queue-empty-state');
  const queueEmptyTitle = document.getElementById('queue-empty-title');
  const queueEmptyDesc = document.getElementById('queue-empty-desc');

  if (currentQueueSubtab === 'active') {
    activeSection.style.display = activeEntries.length > 0 ? 'block' : 'none';
    torboxSection.style.display = 'none';
    completedSection.style.display = 'none';
    const activeCountSpan = activeSection.querySelector('#queue-active-count');
    if (activeCountSpan) activeCountSpan.textContent = activeEntries.length.toString();

    if (activeEntries.length === 0) {
      if (subtabEmptyState) subtabEmptyState.style.display = 'flex';
      if (queueEmptyTitle) queueEmptyTitle.textContent = 'Nenhum download em andamento';
      if (queueEmptyDesc) queueEmptyDesc.textContent = 'Adicione links de arquivos ou álbuns para iniciar o download.';
    } else {
      if (subtabEmptyState) subtabEmptyState.style.display = 'none';
    }
  } else if (currentQueueSubtab === 'torbox') {
    activeSection.style.display = 'none';
    torboxSection.style.display = torboxEntries.length > 0 ? 'block' : 'none';
    completedSection.style.display = 'none';
    const torboxCountSpan = torboxSection.querySelector('#queue-torbox-count');
    if (torboxCountSpan) torboxCountSpan.textContent = torboxEntries.length.toString();

    if (torboxEntries.length === 0) {
      if (subtabEmptyState) subtabEmptyState.style.display = 'flex';
      if (queueEmptyTitle) queueEmptyTitle.textContent = 'Nenhum download aguardando no Torbox';
      if (queueEmptyDesc) queueEmptyDesc.textContent = 'Os arquivos em processamento nos servidores do Torbox aparecerão nesta aba.';
    } else {
      if (subtabEmptyState) subtabEmptyState.style.display = 'none';
    }
  } else {
    activeSection.style.display = 'none';
    torboxSection.style.display = 'none';
    completedSection.style.display = completedEntries.length > 0 ? 'block' : 'none';
    const completedCountSpan = completedSection.querySelector('#queue-completed-count');
    if (completedCountSpan) completedCountSpan.textContent = completedEntries.length.toString();

    if (completedEntries.length > 0) {
      if (subtabEmptyState) subtabEmptyState.style.display = 'none';
    } else {
      if (subtabEmptyState) subtabEmptyState.style.display = 'flex';
      if (queueEmptyTitle) queueEmptyTitle.textContent = 'Nenhum download concluído ainda';
      if (queueEmptyDesc) queueEmptyDesc.textContent = 'Os arquivos finalizados com sucesso aparecerão nesta aba.';
    }
  }

  // Função interna auxiliar para renderizar os cartões em cada container de seção
  const renderEntriesToContainer = (entries, container) => {
    // Remove cartões de pasta que não estão mais presentes em 'entries'
    const validKeys = new Set(entries.map(([key]) => key));
    Array.from(container.querySelectorAll('.queue-folder-card')).forEach(card => {
      const cardKey = card.dataset.groupKey || card.dataset.folderName;
      if (!validKeys.has(cardKey)) {
        card.remove();
      }
    });

    entries.forEach(([groupKey, folderName, folderItems]) => {
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
      if (collapsedFolders.has(groupKey) || collapsedFolders.has(folderName)) {
        isCollapsed = true;
      } else if (expandedFolders.has(groupKey) || expandedFolders.has(folderName)) {
        isCollapsed = false;
      } else {
        isCollapsed = folderPercent === 100 || !hasActiveOrPausedItem;
      }

      let folderCard = container.querySelector(`.queue-folder-card[data-group-key="${CSS.escape(groupKey)}"]`);

      if (!folderCard) {
        folderCard = document.createElement('div');
        folderCard.className = `queue-folder-card ${isCollapsed ? 'collapsed' : ''}`;
        folderCard.dataset.groupKey = groupKey;
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
          ${renderServiceTagHTML(serviceTag, false)}
          <span style="background: ${folderTag.bg}; color: ${folderTag.color}; border: 1px solid ${folderTag.border}; font-weight: 700; padding: 2px 7px; border-radius: 4px; font-size: 11px; margin-right: 8px; display: inline-block; vertical-align: middle; flex-shrink: 0; white-space: nowrap;">${folderTag.text}</span>
          <span class="queue-folder-name" title="${folderName}">${folderName}</span>
        `;

        const badgeGroup = document.createElement('div');
        badgeGroup.className = 'queue-folder-badge-group';
        badgeGroup.innerHTML = `
          <span class="queue-folder-badge">${completedFiles}/${totalFiles} concluídos (${formatBytes(folderDownloadedBytes)} / ${formatBytes(folderTotalBytes)})</span>
          <div class="queue-folder-status-chips" style="display: inline-flex; align-items: center; gap: 4px; margin: 0 4px;"></div>
          <span class="queue-folder-percent">${folderPercent}%</span>
          <button class="btn-icon btn-folder-copy-link" data-group-key="${groupKey}" title="Copiar link original do álbum" style="margin-left: 6px; margin-right: 2px; padding: 4px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.06); color: #60a5fa; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; vertical-align: middle;">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          </button>
          <button class="btn-icon btn-folder-open-dir" data-group-key="${groupKey}" title="Mostrar na pasta de downloads" style="margin-right: 6px; padding: 4px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.06); color: #94a3b8; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; vertical-align: middle;">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
          </button>
          <svg class="queue-folder-chevron" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        `;

        titleRow.appendChild(titleGroup);
        titleRow.appendChild(badgeGroup);

        const progressTrack = document.createElement('div');
        progressTrack.className = 'queue-folder-progress-track';
        progressTrack.innerHTML = `<div class="queue-folder-progress-fill" style="width: ${folderPercent}%"></div>`;

        folderHeader.appendChild(titleRow);
        folderHeader.appendChild(progressTrack);

        folderHeader.onclick = (e) => {
          if (e.target.tagName === 'INPUT' || e.target.closest('button')) return;
          const willBeCollapsed = !folderCard.classList.contains('collapsed');
          if (willBeCollapsed) {
            expandedFolders.delete(groupKey);
            collapsedFolders.add(groupKey);
            folderCard.classList.add('collapsed');
          } else {
            collapsedFolders.delete(groupKey);
            expandedFolders.add(groupKey);
            folderCard.classList.remove('collapsed');
          }
        };

        const folderItemsContainer = document.createElement('div');
        folderItemsContainer.className = 'queue-folder-items';

        folderCard.appendChild(folderHeader);
        folderCard.appendChild(folderItemsContainer);
      }

      const btnFolderCopyLink = folderCard.querySelector('.btn-folder-copy-link');
      if (btnFolderCopyLink) {
        btnFolderCopyLink.onclick = (e) => {
          e.stopPropagation();
          const sampleFile = folderItems[0];
          const rawUrl = sampleFile ? (sampleFile.bunkrAlbumUrl || sampleFile.albumUrl || sampleFile.bunkrPageUrl || sampleFile.sourceUrl || sampleFile.originUrl || sampleFile.url || sampleFile.directUrl || '') : '';
          if (rawUrl) {
            if (window.api && window.api.openExternalUrl) {
              window.api.openExternalUrl(rawUrl);
            }
            navigator.clipboard.writeText(rawUrl).then(() => {
              const origTitle = btnFolderCopyLink.title;
              btnFolderCopyLink.title = '✓ Link copiado e aberto no navegador!';
              btnFolderCopyLink.style.color = '#10b981';
              setTimeout(() => {
                btnFolderCopyLink.title = origTitle;
                btnFolderCopyLink.style.color = '#60a5fa';
              }, 2000);
            }).catch(() => {
              if (window.api && window.api.openExternalUrl) {
                window.api.openExternalUrl(rawUrl);
              }
            });
          }
        };
      }

      const btnFolderOpenDir = folderCard.querySelector('.btn-folder-open-dir');
      if (btnFolderOpenDir) {
        btnFolderOpenDir.onclick = (e) => {
          e.stopPropagation();
          const sampleFile = folderItems[0];
          const pathTarget = sampleFile ? (sampleFile.relativePath || sampleFile.folderName || sampleFile.name) : folderName;
          window.api.openDownloadsFolder(pathTarget);
        };
      }

      // Atualiza listener e estado da caixa de seleção do cabeçalho da pasta
      const folderChk = folderCard.querySelector('.queue-folder-checkbox');
      if (folderChk) {
        const allSelected = folderItems.length > 0 && folderItems.every(f => selectedQueueItemIds.has(f.id));
        folderChk.checked = allSelected;
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



      // Reposiciona no container correto da seção
      container.appendChild(folderCard);

      // Atualiza textos e progresso do cabeçalho sem recriar o DOM (sem piscar)
      const badgeSpan = folderCard.querySelector('.queue-folder-badge');
      const percentSpan = folderCard.querySelector('.queue-folder-percent');
      const progressFill = folderCard.querySelector('.queue-folder-progress-fill');

      // Garante que itens do Torbox em fase de aguardo contenham cloudMessage/cloudProgress para sinalização nos cartões
      folderItems.forEach(f => {
        const isTb = f && (f.id.startsWith('torbox_') || f.torboxType || f.torboxId);
        if (isTb && f.status === 'downloading' && (f.downloadedBytes === 0 || f.downloadedBytes === undefined)) {
          if (f.cloudProgress === undefined) f.cloudProgress = f.progress || 0;
          if (!f.cloudMessage) f.cloudMessage = `Torbox baixando no servidor (${f.cloudProgress}%)...`;
        }
      });

      const cloudDownloadingItem = folderItems.find(f => f.status === 'downloading' && (f.cloudMessage || f.cloudProgress !== undefined));
      if (cloudDownloadingItem) {
        const cProg = cloudDownloadingItem.cloudProgress !== undefined ? cloudDownloadingItem.cloudProgress : (cloudDownloadingItem.progress || 0);
        if (badgeSpan) {
          badgeSpan.innerHTML = `<img src="assets/torbox_box_logo.png" width="14" height="14" style="vertical-align: middle; margin-right: 4px;"> Torbox (${cProg}%) • Aguardando término no servidor`;
          badgeSpan.style.background = 'rgba(245, 158, 11, 0.18)';
          badgeSpan.style.color = '#fbbf24';
          badgeSpan.style.border = '1px solid rgba(245, 158, 11, 0.5)';
          badgeSpan.style.padding = '3px 10px';
          badgeSpan.style.borderRadius = '20px';
          badgeSpan.style.fontWeight = '700';
        }
      } else {
        if (badgeSpan) {
          badgeSpan.textContent = `${completedFiles}/${totalFiles} concluídos (${formatBytes(folderDownloadedBytes)} / ${formatBytes(folderTotalBytes)})`;
          badgeSpan.style.background = '';
          badgeSpan.style.color = '';
          badgeSpan.style.border = '';
          badgeSpan.style.padding = '';
          badgeSpan.style.borderRadius = '';
          badgeSpan.style.fontWeight = '';
        }
      }
      if (percentSpan) percentSpan.textContent = `${folderPercent}%`;
      if (progressFill) progressFill.style.width = `${folderPercent}%`;

      // Atualiza os chips de status no cabeçalho da pasta sem recriar o DOM (ex: ⚡ 1 baixando, ⏸️ 3 pausados, ⚠️ 1 com erro, ⏳ 10 aguardando)
      let statusChipsContainer = folderCard.querySelector('.queue-folder-status-chips');
      if (!statusChipsContainer) {
        const badgeGroupEl = folderCard.querySelector('.queue-folder-badge-group');
        if (badgeGroupEl) {
          statusChipsContainer = document.createElement('div');
          statusChipsContainer.className = 'queue-folder-status-chips';
          statusChipsContainer.style.display = 'inline-flex';
          statusChipsContainer.style.alignItems = 'center';
          statusChipsContainer.style.gap = '4px';
          statusChipsContainer.style.margin = '0 4px';
          if (percentSpan) {
            badgeGroupEl.insertBefore(statusChipsContainer, percentSpan);
          } else {
            badgeGroupEl.appendChild(statusChipsContainer);
          }
        }
      }

      if (statusChipsContainer) {
        const downloadingCount = folderItems.filter(f => f.status === 'downloading').length;
        const pausedCount = folderItems.filter(f => f.status === 'paused').length;
        const errorCount = folderItems.filter(f => f.status === 'error').length;
        const pendingCount = folderItems.filter(f => !f.status || f.status === 'pending' || f.status === 'queued' || f.status === 'waiting').length;

        let chipsHTML = '';
        if (downloadingCount > 0) {
          chipsHTML += `<span class="folder-status-chip chip-downloading" title="${downloadingCount} arquivo(s) baixando" style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.35); font-size: 0.72rem; font-weight: 700; padding: 2px 7px; border-radius: 12px; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap;">⚡ ${downloadingCount} baixando</span>`;
        }
        if (pausedCount > 0) {
          chipsHTML += `<span class="folder-status-chip chip-paused" title="${pausedCount} arquivo(s) pausados" style="background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.35); font-size: 0.72rem; font-weight: 700; padding: 2px 7px; border-radius: 12px; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap;">⏸️ ${pausedCount} pausado${pausedCount > 1 ? 's' : ''}</span>`;
        }
        if (errorCount > 0) {
          chipsHTML += `<span class="folder-status-chip chip-error" title="${errorCount} arquivo(s) com erro" style="background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.35); font-size: 0.72rem; font-weight: 700; padding: 2px 7px; border-radius: 12px; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap;">⚠️ ${errorCount} com erro</span>`;
        }
        if (pendingCount > 0 && (downloadingCount > 0 || pausedCount > 0 || errorCount > 0)) {
          chipsHTML += `<span class="folder-status-chip chip-pending" title="${pendingCount} arquivo(s) aguardando" style="background: rgba(148, 163, 184, 0.15); color: #94a3b8; border: 1px solid rgba(148, 163, 184, 0.3); font-size: 0.72rem; font-weight: 600; padding: 2px 7px; border-radius: 12px; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap;">⏳ ${pendingCount} aguardando</span>`;
        }
        statusChipsContainer.innerHTML = chipsHTML;
      }

      // Reconcilia e atualiza a lista de itens/arquivos dentro do card da pasta
      const itemsContainer = folderCard.querySelector('.queue-folder-items');
      const existingItemRows = Array.from(itemsContainer.querySelectorAll('.queue-item-row'));
      const activeItemIds = new Set(folderItems.map(f => f.id));

      existingItemRows.forEach(row => {
        if (!activeItemIds.has(row.dataset.itemId)) {
          row.remove();
        }
      });

      folderItems.forEach(item => {
        let itemRow = itemsContainer.querySelector(`.queue-item-row[data-item-id="${CSS.escape(item.id)}"]`);
        const sTag = getServiceTag(item);
        const itemTag = getFileTypeTag(item);
        const pureFileName = (item.name || '').includes('/') ? item.name.split('/').pop() : item.name;

        if (!itemRow) {
          itemRow = document.createElement('div');
          itemRow.className = 'queue-item-row';
          itemRow.dataset.itemId = item.id;
        }

        let statusText = '';
        let statusClass = '';
        let showProgress = false;

        if (item.status === 'downloading') {
          const isTbItem = item && (item.id.startsWith('torbox_') || item.torboxType || item.torboxId);
          if (item.cloudMessage || item.cloudProgress !== undefined || (isTbItem && (item.downloadedBytes === 0 || item.downloadedBytes === undefined))) {
            const cProg = item.cloudProgress !== undefined ? item.cloudProgress : (item.progress || 0);
            statusText = `Torbox baixando no servidor (${cProg}%)... Aguardando término para iniciar local`;
            statusClass = 'status-downloading';
            showProgress = true;
          } else {
            statusText = `Baixando (${item.progress || 0}%) • ${formatBytes(item.speed)}/s • ETA ${formatETA(item.eta)}`;
            statusClass = 'status-downloading';
            showProgress = true;
          }
        } else if (item.status === 'pending') {
          statusText = 'Aguardando início...';
          statusClass = 'status-pending';
        } else if (item.status === 'paused') {
          statusText = `Pausado (${item.progress || 0}%)`;
          statusClass = 'status-paused';
          showProgress = true;
        } else if (item.status === 'completed') {
          statusText = 'Concluído (100%)';
          statusClass = 'status-completed';
        } else if (item.status === 'error') {
          statusText = `Erro: ${item.error || 'Falha no download'}`;
          statusClass = 'status-error';
        }

        const isChecked = selectedQueueItemIds.has(item.id);

        itemRow.innerHTML = `
          <div class="queue-item-main">
            <input type="checkbox" class="queue-item-checkbox" data-id="${item.id}" ${isChecked ? 'checked' : ''} style="margin-right: 10px; cursor: pointer;">
            <div class="queue-item-info">
              <div class="queue-item-title-line">
                ${renderServiceTagHTML(sTag, true)}
                <span style="background: ${itemTag.bg}; color: ${itemTag.color}; border: 1px solid ${itemTag.border}; font-weight: 700; padding: 1px 6px; border-radius: 4px; font-size: 10px; margin-right: 6px; display: inline-block; vertical-align: middle; flex-shrink: 0; white-space: nowrap;">${itemTag.text}</span>
                <span class="queue-item-name" title="${escapeHtml(pureFileName)}">${escapeHtml(pureFileName)}</span>
              </div>
              <div class="queue-item-sub">
                <span class="queue-item-status ${statusClass}">${statusText}</span>
                <span class="queue-item-size">${formatBytes(item.downloadedBytes || 0)} / ${formatBytes(item.size || 0)}</span>
              </div>
              ${showProgress ? `
                <div class="queue-item-progress-track">
                  <div class="queue-item-progress-fill" style="width: ${item.progress || 0}%;"></div>
                </div>
              ` : ''}
            </div>
            <div class="queue-item-actions">
              <button class="btn-icon btn-item-copy-link" data-id="${item.id}" title="Copiar link original do download">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              </button>
              ${item.status === 'downloading' ? `
                <button class="btn-icon btn-item-pause" data-id="${item.id}" title="Pausar download">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
                </button>
              ` : ''}
              ${item.status === 'paused' ? `
                <button class="btn-icon btn-item-resume" data-id="${item.id}" title="Retomar download">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                </button>
              ` : ''}
              ${item.status === 'completed' ? `
                <button class="btn-icon btn-item-folder" data-id="${item.id}" title="Mostrar na pasta de downloads">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                </button>
              ` : ''}
              <button class="btn-icon btn-item-delete" data-id="${item.id}" title="Remover da fila">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
          </div>
        `;

        const chk = itemRow.querySelector('.queue-item-checkbox');
        if (chk) {
          chk.onclick = (e) => {
            e.stopPropagation();
            if (chk.checked) selectedQueueItemIds.add(item.id);
            else selectedQueueItemIds.delete(item.id);
          };
        }

        const btnCopyLinkItem = itemRow.querySelector('.btn-item-copy-link');
        if (btnCopyLinkItem) {
          btnCopyLinkItem.onclick = (e) => {
            e.stopPropagation();
            const rawUrl = item.bunkrPageUrl || item.originalUrl || item.sourceUrl || item.originUrl || item.albumUrl || item.url || item.downloadUrl || item.directUrl || '';
            if (rawUrl) {
              if (window.api && window.api.openExternalUrl) {
                window.api.openExternalUrl(rawUrl);
              }
              navigator.clipboard.writeText(rawUrl).then(() => {
                const origTitle = btnCopyLinkItem.title;
                btnCopyLinkItem.title = '✓ Link copiado e aberto no navegador!';
                btnCopyLinkItem.style.color = '#10b981';
                setTimeout(() => {
                  btnCopyLinkItem.title = origTitle;
                  btnCopyLinkItem.style.color = '';
                }, 2000);
              }).catch(() => {
                if (window.api && window.api.openExternalUrl) {
                  window.api.openExternalUrl(rawUrl);
                }
              });
            }
          };
        }

        const btnPause = itemRow.querySelector('.btn-item-pause');
        if (btnPause) btnPause.onclick = (e) => { e.stopPropagation(); window.api.pauseDownload(item.id); };

        const btnResume = itemRow.querySelector('.btn-item-resume');
        if (btnResume) btnResume.onclick = (e) => { e.stopPropagation(); window.api.resumeDownload(item.id); };

        const btnFolder = itemRow.querySelector('.btn-item-folder');
        if (btnFolder) btnFolder.onclick = (e) => {
          e.stopPropagation();
          const pathTarget = item.relativePath || item.name;
          window.api.openDownloadsFolder(pathTarget);
        };

        const btnDelete = itemRow.querySelector('.btn-item-delete');
        if (btnDelete) btnDelete.onclick = async (e) => {
          e.stopPropagation();
          if (window.api && window.api.cancelDownload) {
            window.api.cancelDownload(item.id);
          } else if (window.api && window.api.removeQueueItem) {
            window.api.removeQueueItem(item.id);
          }
        };

        itemsContainer.appendChild(itemRow);
      });
    });
  };

  renderEntriesToContainer(activeEntries, activeBody);
  renderEntriesToContainer(torboxEntries, torboxBody);
  renderEntriesToContainer(completedEntries, completedBody);
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
      label = `Torbox (${cProg}%)`;
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
      label = `Torbox (${cProg}%)`;
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

  // Botão Copiar Link Original e Botão Abrir no Navegador
  const originalUrlToCopy = item.originalUrl || item.sourceUrl || item.bunkrPageUrl || item.url || '';
  if (originalUrlToCopy) {
    const btnOpenBrowser = document.createElement('button');
    btnOpenBrowser.className = 'btn-action';
    btnOpenBrowser.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
        <polyline points="15 3 21 3 21 9"></polyline>
        <line x1="10" y1="14" x2="21" y2="3"></line>
      </svg>
    `;
    btnOpenBrowser.title = 'Abrir Página do Arquivo no Navegador';
    btnOpenBrowser.onclick = (e) => {
      e.stopPropagation();
      window.api.openExternalUrl(originalUrlToCopy);
    };
    divActions.appendChild(btnOpenBrowser);

    const btnCopyLink = document.createElement('button');
    btnCopyLink.className = 'btn-action';
    btnCopyLink.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
    `;
    btnCopyLink.title = 'Copiar Link Original';
    btnCopyLink.onclick = (e) => {
      e.stopPropagation();
      if (window.api && window.api.openExternalUrl) {
        window.api.openExternalUrl(originalUrlToCopy);
      }
      navigator.clipboard.writeText(originalUrlToCopy).then(() => {
        showCustomAlert(`Link original copiado e aberto no navegador:\n${originalUrlToCopy}`, 'Link Copiado');
      }).catch(err => {
        console.error('Erro ao copiar link:', err);
      });
    };
    divActions.appendChild(btnCopyLink);
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

// Gerenciamento de Sub-Abas da Fila ("Em Andamento" vs "Concluídos")
let currentQueueSubtab = 'active';
let lastQueueData = [];

const subtabActiveBtn = document.getElementById('subtab-active');
const subtabTorboxBtn = document.getElementById('subtab-torbox');
const subtabCompletedBtn = document.getElementById('subtab-completed');

function switchQueueSubtab(targetSubtab) {
  currentQueueSubtab = targetSubtab;

  const buttons = [
    { id: 'active', btn: subtabActiveBtn },
    { id: 'torbox', btn: subtabTorboxBtn },
    { id: 'completed', btn: subtabCompletedBtn }
  ];

  buttons.forEach(({ id, btn }) => {
    if (!btn) return;
    if (targetSubtab === id) {
      btn.classList.add('active');
      btn.style.background = 'rgba(59, 130, 246, 0.2)';
      btn.style.borderColor = 'var(--primary-color, #3b82f6)';
      btn.style.color = '#fff';
    } else {
      btn.classList.remove('active');
      btn.style.background = 'transparent';
      btn.style.borderColor = 'rgba(255,255,255,0.1)';
      btn.style.color = 'var(--text-muted, #94a3b8)';
    }
  });

  if (lastQueueData) {
    renderQueue(lastQueueData);
  }
}

if (subtabActiveBtn) subtabActiveBtn.addEventListener('click', () => switchQueueSubtab('active'));
if (subtabTorboxBtn) subtabTorboxBtn.addEventListener('click', () => switchQueueSubtab('torbox'));
if (subtabCompletedBtn) subtabCompletedBtn.addEventListener('click', () => switchQueueSubtab('completed'));

// Botoes globais da fila (Ações restritas à aba atualmente selecionada)
btnOpenDir.addEventListener('click', () => {
  window.api.openDownloadsFolder();
});

btnClearCompleted.addEventListener('click', () => {
  window.api.clearCompleted();
});

btnClearAll.addEventListener('click', async () => {
  if (selectedQueueItemIds.size > 0) {
    const selectedIds = Array.from(selectedQueueItemIds);
    const count = selectedIds.length;
    if (await showCustomConfirm(`Deseja remover os ${count} item(ns) selecionado(s) da fila de downloads? (Os arquivos incompletos e pastas serão limpos do disco)`, 'Remover Selecionados')) {
      await window.api.cancelDownloads(selectedIds);
      selectedQueueItemIds.clear();
    }
  } else {
    if (currentQueueSubtab === 'active') {
      const activeOrIncompleteItems = (lastQueueData || []).filter(item => item.status !== 'completed');
      if (activeOrIncompleteItems.length === 0) {
        showCustomAlert('Não há downloads em andamento para limpar.', 'Fila Vazia');
        return;
      }
      if (await showCustomConfirm('Deseja limpar todos os downloads em andamento da fila? Todos os arquivos incompletos e pastas serão removidos do disco.', 'Limpar Em Andamento')) {
        const incompleteIds = activeOrIncompleteItems.map(i => i.id);
        await window.api.cancelDownloads(incompleteIds);
        selectedQueueItemIds.clear();
      }
    } else {
      const completedItems = (lastQueueData || []).filter(item => item.status === 'completed');
      if (completedItems.length === 0) {
        showCustomAlert('Não há downloads concluídos para limpar.', 'Fila Vazia');
        return;
      }
      if (await showCustomConfirm('Deseja limpar a lista de downloads concluídos?', 'Limpar Concluídos')) {
        window.api.clearCompleted();
      }
    }
  }
});

if (btnResumeAll) {
  btnResumeAll.addEventListener('click', async () => {
    if (currentQueueSubtab === 'active') {
      if (selectedQueueItemIds && selectedQueueItemIds.size > 0) {
        for (const id of selectedQueueItemIds) {
          await window.api.resumeDownload(id);
        }
      } else {
        await window.api.resumeAllDownloads();
      }
    }
  });
}

if (btnPauseAll) {
  btnPauseAll.addEventListener('click', async () => {
    if (currentQueueSubtab === 'active') {
      if (selectedQueueItemIds && selectedQueueItemIds.size > 0) {
        for (const id of selectedQueueItemIds) {
          await window.api.pauseDownload(id);
        }
      } else {
        await window.api.pauseAllDownloads();
      }
    }
  });
}

if (btnRestartAll) {
  btnRestartAll.addEventListener('click', async () => {
    if (currentQueueSubtab === 'active') {
      if (await showCustomConfirm('Reiniciar o download de todos os arquivos da fila em andamento?', 'Reiniciar Fila')) {
        await window.api.restartQueue();
      }
    }
  });
}

// ==========================================
// Torbox Cloud Page Engine
// ==========================================
let torboxCloudFiles = [];
let selectedTorboxFileIds = new Set();
try {
  const savedSelected = localStorage.getItem('nexus_selected_torbox_ids');
  if (savedSelected) {
    JSON.parse(savedSelected).forEach(id => selectedTorboxFileIds.add(id));
  }
} catch (e) {}

function saveSelectedTorboxFileIds() {
  try {
    localStorage.setItem('nexus_selected_torbox_ids', JSON.stringify(Array.from(selectedTorboxFileIds)));
  } catch (e) {}
}

let currentTorboxStatusFilter = localStorage.getItem('nexus_torbox_status_filter') || 'all';
let currentTorboxTypeFilter = localStorage.getItem('nexus_torbox_type_filter') || 'all';
let currentTorboxSort = localStorage.getItem('nexus_torbox_sort') || 'added';
let torboxLivePollInterval = null;

let hiddenTorboxFileIds = new Set();
try {
  const savedHidden = localStorage.getItem('nexus_hidden_torbox_ids');
  if (savedHidden) {
    JSON.parse(savedHidden).forEach(id => hiddenTorboxFileIds.add(id));
  }
} catch (e) {}

function saveHiddenTorboxFileIds() {
  try {
    const array = Array.from(hiddenTorboxFileIds);
    localStorage.setItem('nexus_hidden_torbox_ids', JSON.stringify(array));
  } catch (e) {}
}

let showHiddenTorboxFiles = localStorage.getItem('nexus_torbox_show_hidden') === 'true';

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

  const visibleFiles = torboxCloudFiles.filter(f => showHiddenTorboxFiles || !hiddenTorboxFileIds.has(f.id));

  const groupsMap = new Map();
  visibleFiles.forEach(f => {
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
  if (btnActive) btnActive.textContent = `${activeCount} ACTIVE DOWNLOADS`;
  if (btnReady) btnReady.textContent = `${readyCount} DOWNLOAD READY`;
  if (btnInactive) btnInactive.textContent = `${inactiveCount} INACTIVE DOWNLOADS`;

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

  // Aplicação da Ordenação Padrão: Data da Adição (Mais Recentes Primeiro)
  if (currentTorboxSort === 'name') {
    filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  } else if (currentTorboxSort === 'size') {
    filtered.sort((a, b) => (b.size || 0) - (a.size || 0));
  } else if (currentTorboxSort === 'progress') {
    filtered.sort((a, b) => (b.progress || 0) - (a.progress || 0));
  } else if (currentTorboxSort === 'ratio') {
    filtered.sort((a, b) => (b.ratio || 0) - (a.ratio || 0));
  } else if (currentTorboxSort === 'speed_dl') {
    filtered.sort((a, b) => (b.downloadSpeed || 0) - (a.downloadSpeed || 0));
  } else if (currentTorboxSort === 'speed_ul') {
    filtered.sort((a, b) => (b.uploadSpeed || 0) - (a.uploadSpeed || 0));
  } else {
    // Padrão ('added' ou 'default'): Data da adição / IDs mais recentes primeiro
    filtered.sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (timeA !== timeB) return timeB - timeA;
      return (b.torboxId || 0) - (a.torboxId || 0);
    });
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

    const validIds = new Set(torboxCloudFiles.map(f => f.id));
    selectedTorboxFileIds = new Set(Array.from(selectedTorboxFileIds).filter(id => validIds.has(id)));
    saveSelectedTorboxFileIds();

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

    const serviceTag = getServiceTag(groupItems[0]);
    const folderTag = getFolderTypeTag(groupItems, groupName);

    const serviceTagSpanWrapper = document.createElement('span');
    serviceTagSpanWrapper.style.display = 'inline-flex';
    serviceTagSpanWrapper.style.alignItems = 'center';
    serviceTagSpanWrapper.style.verticalAlign = 'middle';
    serviceTagSpanWrapper.innerHTML = renderServiceTagHTML(serviceTag, false);

    const folderTypeSpan = document.createElement('span');
    folderTypeSpan.style.cssText = `background: ${folderTag.bg}; color: ${folderTag.color}; border: 1px solid ${folderTag.border}; font-weight: 700; padding: 2px 7px; border-radius: 4px; font-size: 11px; margin-right: 8px; display: inline-block; vertical-align: middle; flex-shrink: 0; white-space: nowrap;`;
    folderTypeSpan.textContent = folderTag.text;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'folder-group-name';
    nameSpan.textContent = groupName;

    titleGroup.appendChild(groupCb);
    titleGroup.appendChild(folderIcon);
    titleGroup.appendChild(serviceTagSpanWrapper);
    titleGroup.appendChild(folderTypeSpan);
    titleGroup.appendChild(nameSpan);

    const metaDiv = document.createElement('div');
    metaDiv.className = 'folder-group-meta';

    // Status Badge para o Cabeçalho da Pasta (Item 2)
    const headerStatusSpan = document.createElement('span');
    headerStatusSpan.className = 'folder-group-status-badge';
    if (groupItems.some(f => f.isInactive)) {
      headerStatusSpan.innerHTML = `<span style="background: rgba(244, 63, 94, 0.18); color: #fb7185; border: 1px solid rgba(244, 63, 94, 0.4); padding: 2px 8px; border-radius: 10px; font-size: 0.75rem; font-weight: 700; margin-right: 6px; white-space: nowrap; display: inline-block; flex-shrink: 0;">Inativo</span>`;
    } else if (groupItems.every(f => f.isFinished)) {
      headerStatusSpan.innerHTML = `<span style="background: rgba(52, 211, 153, 0.18); color: #34d399; border: 1px solid rgba(52, 211, 153, 0.4); padding: 2px 8px; border-radius: 10px; font-size: 0.75rem; font-weight: 700; margin-right: 6px; white-space: nowrap; display: inline-block; flex-shrink: 0;">Ready (100%)</span>`;
    } else {
      const activeItem = groupItems.find(f => !f.isFinished) || groupItems[0];
      const activeProg = activeItem.progress || 0;
      headerStatusSpan.innerHTML = `<span style="background: rgba(56, 189, 248, 0.18); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.4); padding: 2px 8px; border-radius: 10px; font-size: 0.75rem; font-weight: 700; margin-right: 6px; white-space: nowrap; display: inline-block; flex-shrink: 0;"><img src="assets/torbox_box_logo.png" width="13" height="13" style="vertical-align: middle; margin-right: 4px;"> Baixando (${activeProg}%)</span>`;
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

    metaDiv.appendChild(headerStatusSpan);
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
          groupCb.checked = groupItems.every(f => selectedTorboxFileIds.has(f.id));
          saveSelectedTorboxFileIds();
          updateTorboxSelectionSummary();
        });
        tdCheck.appendChild(cb);

        const tdName = document.createElement('td');
        tdName.className = 'text-truncate';
        const sTag = getServiceTag(file);
        const fTag = getFileTypeTag(file);
        tdName.innerHTML = `${renderServiceTagHTML(sTag, true)}<span style="background: ${fTag.bg}; color: ${fTag.color}; border: 1px solid ${fTag.border}; font-weight: 700; padding: 2px 6px; border-radius: 4px; font-size: 10px; margin-right: 6px; display: inline-block; vertical-align: middle;">${fTag.text}</span>${file.name}`;
        tdName.title = file.name;

        const tdStatus = document.createElement('td');
        if (file.isFinished) {
          tdStatus.innerHTML = `<span style="background: rgba(52, 211, 153, 0.18); color: #34d399; border: 1px solid rgba(52, 211, 153, 0.4); padding: 2px 8px; border-radius: 10px; font-size: 0.75rem; font-weight: 700;">Ready (100%)</span>`;
        } else if (file.isInactive) {
          tdStatus.innerHTML = `<span style="background: rgba(244, 63, 94, 0.18); color: #fb7185; border: 1px solid rgba(244, 63, 94, 0.4); padding: 2px 8px; border-radius: 10px; font-size: 0.75rem; font-weight: 700;">Inativo</span>`;
        } else {
          tdStatus.innerHTML = `<span style="background: rgba(56, 189, 248, 0.18); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.4); padding: 2px 8px; border-radius: 10px; font-size: 0.75rem; font-weight: 700;"><img src="assets/torbox_box_logo.png" width="13" height="13" style="vertical-align: middle; margin-right: 4px;"> Baixando (${file.progress || 0}%)</span>`;
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
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.closest('button') || e.target.closest('input')) {
        return;
      }
      isCollapsed = !isCollapsed;
      card.classList.toggle('collapsed', isCollapsed);
      if (!isCollapsed) {
        populateRows();
        expandedTorboxGroups.add(groupName);
        collapsedTorboxGroups.delete(groupName);
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
      saveSelectedTorboxFileIds();
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

  const count = selectedTorboxFileIds.size;
  let totalBytes = 0;

  torboxCloudFiles.forEach(f => {
    if (selectedTorboxFileIds.has(f.id)) totalBytes += f.size;
  });

  selectedCountText.textContent = `${count} arquivo(s) selecionado(s) (${formatBytes(totalBytes)})`;

  if (selectAllCb) {
    const searchInput = document.getElementById('input-search-torbox');
    const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
    const videoExts = ['.mkv', '.mp4', '.avi', '.webm', '.mov', '.flv', '.wmv', '.m4v', '.ts', '.m2ts', '.3gp', '.iso'];

    const visibleFiles = torboxCloudFiles.filter(file => {
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

    const visibleTotal = visibleFiles.length;
    let selectedVisibleCount = 0;
    visibleFiles.forEach(f => {
      if (selectedTorboxFileIds.has(f.id)) selectedVisibleCount++;
    });

    if (visibleTotal === 0 || selectedVisibleCount === 0) {
      selectAllCb.checked = false;
      selectAllCb.indeterminate = false;
    } else if (selectedVisibleCount === visibleTotal) {
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
    const filtered = applyTorboxFilters();
    if (isChecked) {
      filtered.forEach(f => selectedTorboxFileIds.add(f.id));
    } else {
      filtered.forEach(f => selectedTorboxFileIds.delete(f.id));
    }
    saveSelectedTorboxFileIds();
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

function syncTorboxFilterDropdownUI() {
  const dropdownTorboxFilter = document.getElementById('torbox-filter-dropdown');
  if (!dropdownTorboxFilter) return;

  dropdownTorboxFilter.querySelectorAll('[data-filter-status]').forEach(o => {
    o.classList.toggle('active', o.getAttribute('data-filter-status') === currentTorboxStatusFilter);
  });

  dropdownTorboxFilter.querySelectorAll('[data-filter-type]').forEach(o => {
    o.classList.toggle('active', o.getAttribute('data-filter-type') === currentTorboxTypeFilter);
  });

  dropdownTorboxFilter.querySelectorAll('[data-filter-sort]').forEach(o => {
    o.classList.toggle('active', o.getAttribute('data-filter-sort') === currentTorboxSort);
  });

  const btnToggleHidden = document.getElementById('btn-toggle-show-hidden');
  if (btnToggleHidden) {
    btnToggleHidden.classList.toggle('active', showHiddenTorboxFiles);
    btnToggleHidden.textContent = showHiddenTorboxFiles ? '✓ Exibir Itens Ocultados' : '👁️ Exibir Itens Ocultados';
  }
}

function selectCategoryFilesAndFilter(statusFilter) {
  currentTorboxStatusFilter = statusFilter;
  localStorage.setItem('nexus_torbox_status_filter', currentTorboxStatusFilter);
  syncTorboxFilterDropdownUI();
  applyTorboxFilters();
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
    syncTorboxFilterDropdownUI();
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
        selectCategoryFilesAndFilter(statusVal);
      }

      if (typeVal) {
        currentTorboxTypeFilter = typeVal;
        localStorage.setItem('nexus_torbox_type_filter', currentTorboxTypeFilter);
        syncTorboxFilterDropdownUI();
        applyTorboxFilters();
      }

      if (sortVal) {
        currentTorboxSort = sortVal;
        localStorage.setItem('nexus_torbox_sort', currentTorboxSort);
        syncTorboxFilterDropdownUI();
        applyTorboxFilters();
      }
    });
  });
}

const btnResetTorboxFilters = document.getElementById('btn-reset-torbox-filters');
if (btnResetTorboxFilters) {
  btnResetTorboxFilters.addEventListener('click', () => {
    currentTorboxStatusFilter = 'all';
    currentTorboxTypeFilter = 'all';
    currentTorboxSort = 'default';
    showHiddenTorboxFiles = false;

    localStorage.setItem('nexus_torbox_status_filter', 'all');
    localStorage.setItem('nexus_torbox_type_filter', 'all');
    localStorage.setItem('nexus_torbox_sort', 'default');
    localStorage.setItem('nexus_torbox_show_hidden', 'false');

    syncTorboxFilterDropdownUI();
    applyTorboxFilters();
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
    switchQueueSubtab('active');
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
      saveSelectedTorboxFileIds();
      applyTorboxFilters();
      updateTorboxSelectionSummary();
    }
  });
}

const btnToggleShowHidden = document.getElementById('btn-toggle-show-hidden');
if (btnToggleShowHidden) {
  btnToggleShowHidden.addEventListener('click', () => {
    showHiddenTorboxFiles = !showHiddenTorboxFiles;
    localStorage.setItem('nexus_torbox_show_hidden', showHiddenTorboxFiles ? 'true' : 'false');
    syncTorboxFilterDropdownUI();
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

window.addEventListener('resize', () => {
  applyFooterStatusPosition();
  applyGithubButtonPosition();
});

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

  // Verificação automática de atualizações no startup (Renderer-side)
  setTimeout(() => {
    if (window.api && window.api.checkForUpdates) {
      console.log('[AutoUpdater] Executando verificação automática no startup (Renderer)...');
      window.api.checkForUpdates().catch(err => console.warn('[AutoUpdater] Erro ao checar atualização automaticamente:', err));
    }
  }, 2000);
});

window.addEventListener('resize', () => {
  if (typeof applyFooterStatusPosition === 'function') applyFooterStatusPosition();
  if (typeof applyGithubButtonPosition === 'function') applyGithubButtonPosition();
});

// ==========================================
// Módulo de Auditoria & Histórico de Hosters
// ==========================================
let currentAuditHistoryData = [];

const btnOpenAuditModal = document.getElementById('btn-open-audit-modal');
const btnCloseAuditModal = document.getElementById('btn-close-audit-modal');
const modalHosterAudit = document.getElementById('modal-hoster-audit');
const auditSearchInput = document.getElementById('audit-search-input');
const auditSortSelect = document.getElementById('audit-sort-select');
const btnExportAuditLog = document.getElementById('btn-export-audit-log');
const btnClearAuditHistory = document.getElementById('btn-clear-audit-history');
const auditTableBody = document.getElementById('audit-table-body');
const auditEmptyState = document.getElementById('audit-empty-state');
const auditCountTotal = document.getElementById('audit-count-total');
const auditCountFiltered = document.getElementById('audit-count-filtered');
const auditCopyFeedback = document.getElementById('audit-copy-feedback');

async function openAuditModal() {
  if (!modalHosterAudit) return;
  modalHosterAudit.style.display = 'flex';
  if (window.api && window.api.getDownloadHistory) {
    try {
      currentAuditHistoryData = await window.api.getDownloadHistory();
    } catch (e) {
      currentAuditHistoryData = [];
    }
  }
  refreshAuditTable();
}

function closeAuditModal() {
  if (modalHosterAudit) {
    modalHosterAudit.style.display = 'none';
  }
}

function getItemHosterName(item) {
  if (!item) return 'Desconhecido';
  const tag = getServiceTag(item);
  if (tag) {
    if (tag.hoster) return tag.hoster;
    return tag.text;
  }
  return detectTorboxHoster(item) || 'Download Direto';
}

function refreshAuditTable() {
  if (!auditTableBody) return;
  auditTableBody.innerHTML = '';

  const q = auditSearchInput ? auditSearchInput.value.toLowerCase().trim() : '';
  const sortMode = auditSortSelect ? auditSortSelect.value : 'recent';

  let list = [...currentAuditHistoryData];

  // Filtro por Nome, Tag ou URL
  if (q) {
    list = list.filter(item => {
      const name = (item.name || '').toLowerCase();
      const hoster = getItemHosterName(item).toLowerCase();
      const folder = (item.folderName || '').toLowerCase();
      const url = (item.url || item.sourceUrl || '').toLowerCase();
      const fileTag = getFileTypeTag(item).text.toLowerCase();
      return name.includes(q) || hoster.includes(q) || folder.includes(q) || url.includes(q) || fileTag.includes(q);
    });
  }

  // Ordenação (Recente, Tags A-Z, Tags Z-A, Nome A-Z)
  list.sort((a, b) => {
    const hosterA = getItemHosterName(a);
    const hosterB = getItemHosterName(b);
    if (sortMode === 'tag_asc') {
      const comp = hosterA.localeCompare(hosterB);
      if (comp !== 0) return comp;
      return (b.timestamp || 0) - (a.timestamp || 0);
    }
    if (sortMode === 'tag_desc') {
      const comp = hosterB.localeCompare(hosterA);
      if (comp !== 0) return comp;
      return (b.timestamp || 0) - (a.timestamp || 0);
    }
    if (sortMode === 'name_asc') {
      return (a.name || '').localeCompare(b.name || '');
    }
    // padrão: recent (mais recentes no topo)
    return (b.timestamp || 0) - (a.timestamp || 0);
  });

  if (auditCountTotal) auditCountTotal.textContent = currentAuditHistoryData.length.toString();
  if (auditCountFiltered) auditCountFiltered.textContent = `${list.length} exibidos`;

  if (list.length === 0) {
    if (auditEmptyState) auditEmptyState.style.display = 'block';
    return;
  }
  if (auditEmptyState) auditEmptyState.style.display = 'none';

  list.forEach(item => {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid rgba(255,255,255,0.06)';

    const sTag = getServiceTag(item);
    const tagHtml = renderServiceTagHTML(sTag, true);

    const dateStr = item.timestamp ? new Date(item.timestamp).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'N/A';
    const rawUrl = item.sourceUrl || item.originUrl || item.albumUrl || item.url || item.directUrl || '';
    const cleanUrl = rawUrl.length > 35 ? rawUrl.substring(0, 35) + '...' : (rawUrl || 'N/A');

    tr.innerHTML = `
      <td style="padding: 10px 8px; color: #94a3b8; font-size: 11px;">${dateStr}</td>
      <td style="padding: 10px 8px;">${tagHtml}</td>
      <td style="padding: 10px 8px; font-weight: 600; color: #fff; word-break: break-all;" title="${item.name}">${item.name}</td>
      <td style="padding: 10px 8px; color: #cbd5e1;">${item.sizeFormatted || formatBytes(item.size || 0)}</td>
      <td style="padding: 10px 8px; color: #60a5fa; font-size: 11px; word-break: break-all;">
        ${rawUrl ? `<a href="#" onclick="event.preventDefault(); if (window.api && window.api.openExternalUrl) window.api.openExternalUrl('${rawUrl}');" style="color: #60a5fa; text-decoration: none;">${cleanUrl}</a>` : 'N/A'}
      </td>
    `;
    auditTableBody.appendChild(tr);
  });
}

function copyAuditLogToClipboard() {
  if (!currentAuditHistoryData || currentAuditHistoryData.length === 0) {
    alert('Nenhum histórico de download registrado para exportar.');
    return;
  }

  // Agrupa estatísticas por Hoster
  const hosterStats = new Map();
  currentAuditHistoryData.forEach(item => {
    const hName = getItemHosterName(item);
    hosterStats.set(hName, (hosterStats.get(hName) || 0) + 1);
  });

  const sortedStats = Array.from(hosterStats.entries()).sort((a, b) => b[1] - a[1]);

  let markdownReport = `### 📊 Relatório de Auditoria de Hosters & Downloads (Nexus Downloader)\n\n`;
  markdownReport += `- **Data do Log**: ${new Date().toLocaleString('pt-BR')}\n`;
  markdownReport += `- **Total de Arquivos Registrados**: ${currentAuditHistoryData.length}\n\n`;
  markdownReport += `#### 🏷️ Resumo por Hoster / Provedor:\n`;
  sortedStats.forEach(([hName, count]) => {
    markdownReport += `- **${hName}**: ${count} arquivo(s)\n`;
  });

  markdownReport += `\n#### 📋 Tabela Completa de Registros:\n`;
  markdownReport += `| Data | Hoster | Nome do Arquivo | Tamanho | URL de Origem |\n`;
  markdownReport += `|---|---|---|---|---|\n`;

  currentAuditHistoryData.forEach(item => {
    const hName = getItemHosterName(item);
    const dateStr = item.timestamp ? new Date(item.timestamp).toLocaleString('pt-BR') : 'N/A';
    const sizeStr = item.sizeFormatted || formatBytes(item.size || 0);
    const urlStr = item.sourceUrl || item.url || 'N/A';
    markdownReport += `| ${dateStr} | ${hName} | ${item.name} | ${sizeStr} | ${urlStr} |\n`;
  });

  navigator.clipboard.writeText(markdownReport).then(() => {
    if (auditCopyFeedback) {
      auditCopyFeedback.style.display = 'inline';
      setTimeout(() => { auditCopyFeedback.style.display = 'none'; }, 3500);
    }
  }).catch(err => {
    console.error('Erro ao copiar log:', err);
  });
}

if (btnOpenAuditModal) btnOpenAuditModal.addEventListener('click', openAuditModal);
if (btnCloseAuditModal) btnCloseAuditModal.addEventListener('click', closeAuditModal);
if (modalHosterAudit) {
  modalHosterAudit.addEventListener('click', (e) => {
    if (e.target === modalHosterAudit) closeAuditModal();
  });
}

if (auditSearchInput) auditSearchInput.addEventListener('input', refreshAuditTable);
if (auditSortSelect) auditSortSelect.addEventListener('change', refreshAuditTable);
if (btnExportAuditLog) btnExportAuditLog.addEventListener('click', copyAuditLogToClipboard);

if (btnClearAuditHistory) {
  btnClearAuditHistory.addEventListener('click', async () => {
    if (confirm('Tem certeza de que deseja limpar todo o histórico de downloads baixados?')) {
      if (window.api && window.api.clearDownloadHistory) {
        await window.api.clearDownloadHistory();
      }
      currentAuditHistoryData = [];
      refreshAuditTable();
    }
  });
}

// ==========================================
// Módulo de Auditoria & Diagnóstico Multilink
// ==========================================
let lastMultilinkSummary = null;
let accumulatedMultilinkSummary = null;

function updateAccumulatedMultilinkSummary(newSummary) {
  if (!newSummary) return accumulatedMultilinkSummary;

  if (!accumulatedMultilinkSummary) {
    accumulatedMultilinkSummary = {
      totalLinks: newSummary.totalLinks || 0,
      successCount: newSummary.successCount || 0,
      errorCount: newSummary.errorCount || 0,
      results: Array.isArray(newSummary.results) ? [...newSummary.results] : []
    };
  } else {
    const existingResults = accumulatedMultilinkSummary.results || [];
    const newResults = newSummary.results || [];

    newResults.forEach(nr => {
      const idx = existingResults.findIndex(r => r.url === nr.url);
      if (idx >= 0) {
        existingResults[idx] = nr;
      } else {
        existingResults.push(nr);
      }
    });

    accumulatedMultilinkSummary.results = existingResults;
    accumulatedMultilinkSummary.totalLinks = existingResults.length;
    accumulatedMultilinkSummary.successCount = existingResults.filter(r => r.status === 'success').length;
    accumulatedMultilinkSummary.errorCount = existingResults.filter(r => r.status === 'error').length;
  }

  return accumulatedMultilinkSummary;
}

const scanAuditSummaryBar = document.getElementById('scan-audit-summary-bar');
const scanAuditIcon = document.getElementById('scan-audit-icon');
const scanAuditMessage = document.getElementById('scan-audit-message');
const btnShowFailedLinksDetail = document.getElementById('btn-show-failed-links-detail');
const modalFailedLinksDetail = document.getElementById('modal-failed-links-detail');
const btnCloseFailedLinksModal = document.getElementById('btn-close-failed-links-modal');
const btnDismissFailedModal = document.getElementById('btn-dismiss-failed-modal');
const failedLinksTableBody = document.getElementById('failed-links-table-body');
const settingEnableMultilinkAudit = document.getElementById('setting-enable-multilink-audit');

if (settingEnableMultilinkAudit) {
  settingEnableMultilinkAudit.addEventListener('change', async () => {
    const config = await window.api.getConfig();
    config.enableMultilinkAuditAlerts = settingEnableMultilinkAudit.checked;
    await window.api.setConfig(config);
  });
}

async function renderMultilinkAuditSummary(summary) {
  if (!scanAuditSummaryBar) return;
  const config = await window.api.getConfig();

  const accSummary = updateAccumulatedMultilinkSummary(summary);

  if (!accSummary || config.enableMultilinkAuditAlerts === false || accSummary.totalLinks < 1) {
    scanAuditSummaryBar.style.display = 'none';
    return;
  }

  lastMultilinkSummary = accSummary;
  scanAuditSummaryBar.style.display = 'flex';

  if (accSummary.errorCount === 0) {
    scanAuditSummaryBar.style.background = 'rgba(34, 197, 94, 0.15)';
    scanAuditSummaryBar.style.border = '1px solid rgba(34, 197, 94, 0.35)';
    scanAuditSummaryBar.style.color = '#4ade80';
    if (scanAuditIcon) scanAuditIcon.textContent = '🎉';
    if (scanAuditMessage) {
      scanAuditMessage.textContent = `Sucesso! Todos os ${accSummary.totalLinks} links foram escaneados com sucesso (${scannedFiles.length} arquivos prontos para download).`;
    }
    if (btnShowFailedLinksDetail) btnShowFailedLinksDetail.style.display = 'none';
  } else {
    scanAuditSummaryBar.style.background = 'rgba(245, 158, 11, 0.15)';
    scanAuditSummaryBar.style.border = '1px solid rgba(245, 158, 11, 0.35)';
    scanAuditSummaryBar.style.color = '#fbbf24';
    if (scanAuditIcon) scanAuditIcon.textContent = '⚠️';
    if (scanAuditMessage) {
      scanAuditMessage.textContent = `${accSummary.successCount} de ${accSummary.totalLinks} links foram escaneados com sucesso. ${accSummary.errorCount} link(s) apresentaram inconsistência.`;
    }
    if (btnShowFailedLinksDetail) btnShowFailedLinksDetail.style.display = 'inline-flex';
  }
}

function openFailedLinksModal() {
  if (!modalFailedLinksDetail || !lastMultilinkSummary) return;
  if (!failedLinksTableBody) return;

  failedLinksTableBody.innerHTML = '';
  const failedResults = (lastMultilinkSummary.results || []).filter(r => r.status === 'error');

  failedResults.forEach(res => {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid rgba(255,255,255,0.06)';

    const rawUrl = res.url || '';
    const cleanUrl = rawUrl.length > 40 ? rawUrl.substring(0, 40) + '...' : rawUrl;

    tr.innerHTML = `
      <td style="padding: 10px 8px; font-weight: 700; color: #fb7185;">${res.hoster || 'Desconhecido'}</td>
      <td style="padding: 10px 8px; color: #60a5fa; word-break: break-all;" title="${rawUrl}">${cleanUrl}</td>
      <td style="padding: 10px 8px; color: #f87171; font-weight: 600;">${res.error || 'Erro de conexão/Servidor 404'}</td>
    `;
    failedLinksTableBody.appendChild(tr);
  });

  modalFailedLinksDetail.style.display = 'flex';
}

function closeFailedLinksModal() {
  if (modalFailedLinksDetail) {
    modalFailedLinksDetail.style.display = 'none';
  }
}

if (btnShowFailedLinksDetail) btnShowFailedLinksDetail.addEventListener('click', openFailedLinksModal);
if (btnCloseFailedLinksModal) btnCloseFailedLinksModal.addEventListener('click', closeFailedLinksModal);
if (btnDismissFailedModal) btnDismissFailedModal.addEventListener('click', closeFailedLinksModal);
if (modalFailedLinksDetail) {
  modalFailedLinksDetail.addEventListener('click', (e) => {
    if (e.target === modalFailedLinksDetail) closeFailedLinksModal();
  });
}
