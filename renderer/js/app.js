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
    
    navItems.forEach(nav => nav.classList.remove('active'));
    tabContents.forEach(tab => tab.classList.remove('active'));
    
    document.querySelectorAll('.top-tab-content').forEach(el => el.style.display = 'none');

    item.classList.add('active');
    document.getElementById(`${tabId}-tab`).classList.add('active');

    const topContent = document.getElementById(`${tabId}-top-content`);
    if (topContent) topContent.style.display = 'block';
  });
});

function switchTab(tabId) {
  const item = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
  if (item) {
    item.click();
  }
}

// ==========================================
// Status de Autenticação Google
// ==========================================
async function checkAuthStatus() {
  try {
    const auth = await window.api.checkAuth();
    
    if (auth.connected) {
      // Estado Conectado
      authIndicator.className = 'status-indicator connected';
      authStatusText.textContent = 'Conta Google Conectada';
      
      settingsAuthDisconnected.style.display = 'none';
      settingsAuthConnected.style.display = 'block';
    } else {
      // Estado Desconectado
      authIndicator.className = 'status-indicator disconnected';
      authStatusText.textContent = 'Conta Desconectada';
      
      settingsAuthDisconnected.style.display = 'block';
      settingsAuthConnected.style.display = 'none';
      
      // Mantém o botão ativo para podermos dar feedback amigável se clicado sem credenciais
      btnGoogleLogin.disabled = false;
    }
  } catch (err) {
    console.error('Erro ao verificar status de autenticação:', err);
  }
}

const btnCheckVersion = document.getElementById('btn-check-version');
const updateNotice = document.getElementById('update-notice');

if (btnCheckVersion) {
  btnCheckVersion.addEventListener('click', async () => {
    const icon = btnCheckVersion.querySelector('.version-refresh-icon');
    if (icon) icon.classList.add('spinning');

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
        await showCustomAlert('Seu Nexus Downloader já está atualizado na versão mais recente (v1.0.1)!', 'Verificação de Atualização');
      }
    } catch (err) {
      if (icon) icon.classList.remove('spinning');
      if (updateNotice) updateNotice.style.display = 'none';
      await showCustomAlert('Seu Nexus Downloader já está atualizado na versão mais recente (v1.0.1)!', 'Verificação de Atualização');
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
  settingNotifications.checked = config.notificationsEnabled;
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
    await showCustomAlert('Por favor, cole um link do Google Drive ou Bunkr para escanear.', 'Link Inválido');
    return;
  }

  // Prepara animação
  btnScan.disabled = true;
  scanSpinner.style.display = 'block';
  btnScan.querySelector('.btn-text').textContent = 'Escaneando...';
  
  resultsContainer.style.display = 'none';
  scanEmptyState.style.display = 'none';
  resultsList.innerHTML = '';
  scannedFiles = [];

  try {
    const files = await window.api.scanLink(url);
    if (!files || files.length === 0) {
      await showCustomAlert('Nenhum arquivo encontrado no link fornecido.', 'Escaneamento Concluído');
      scanEmptyState.style.display = 'flex';
      return;
    }

    scannedFiles = files;
    renderResults();
  } catch (err) {
    await showCustomAlert('Erro ao escanear link: ' + err.message, 'Erro no Escaneamento');
    scanEmptyState.style.display = 'flex';
  } finally {
    btnScan.disabled = false;
    scanSpinner.style.display = 'none';
    btnScan.querySelector('.btn-text').textContent = 'Escanear Links';
  }
});

function renderResults() {
  resultsList.innerHTML = '';
  resultsContainer.style.display = 'flex';
  scanEmptyState.style.display = 'none';
  
  selectAllFiles.checked = true;

  scannedFiles.forEach((file, index) => {
    const row = document.createElement('tr');
    
    // Checkbox
    const tdCheck = document.createElement('td');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = true;
    checkbox.dataset.index = index;
    checkbox.addEventListener('change', updateSelectionSummary);
    tdCheck.appendChild(checkbox);
    
    // Nome do arquivo
    const tdName = document.createElement('td');
    tdName.className = 'text-truncate';
    tdName.textContent = file.name;
    tdName.title = file.name;

    // Caminho relativo
    const tdPath = document.createElement('td');
    tdPath.className = 'text-truncate';
    tdPath.textContent = file.relativePath || file.name;
    tdPath.title = file.relativePath || file.name;
    
    // Tamanho do arquivo
    const tdSize = document.createElement('td');
    tdSize.textContent = formatBytes(file.size);
    
    row.appendChild(tdCheck);
    row.appendChild(tdName);
    row.appendChild(tdPath);
    row.appendChild(tdSize);
    
    resultsList.appendChild(row);
  });
  
  updateSelectionSummary();
}

selectAllFiles.addEventListener('change', () => {
  const checkboxes = resultsList.querySelectorAll('input[type="checkbox"]');
  checkboxes.forEach(cb => {
    cb.checked = selectAllFiles.checked;
  });
  updateSelectionSummary();
});

function updateSelectionSummary() {
  const checkboxes = resultsList.querySelectorAll('input[type="checkbox"]');
  let selectedCount = 0;
  let selectedSize = 0;
  
  checkboxes.forEach(cb => {
    if (cb.checked) {
      selectedCount++;
      const index = parseInt(cb.dataset.index);
      selectedSize += scannedFiles[index].size;
    }
  });

  selectedCountText.textContent = `${selectedCount} arquivos selecionados (${formatBytes(selectedSize)})`;
  btnAddSelected.disabled = selectedCount === 0;

  // Atualiza checkbox mestre
  if (selectedCount === 0) {
    selectAllFiles.checked = false;
    selectAllFiles.indeterminate = false;
  } else if (selectedCount === checkboxes.length) {
    selectAllFiles.checked = true;
    selectAllFiles.indeterminate = false;
  } else {
    selectAllFiles.checked = false;
    selectAllFiles.indeterminate = true;
  }
}

btnAddSelected.addEventListener('click', async () => {
  const checkboxes = resultsList.querySelectorAll('input[type="checkbox"]');
  const selectedFiles = [];
  
  checkboxes.forEach(cb => {
    if (cb.checked) {
      const index = parseInt(cb.dataset.index);
      selectedFiles.push(scannedFiles[index]);
    }
  });

  if (selectedFiles.length > 0) {
    const queueLength = await window.api.addToQueue(selectedFiles);
    
    // Reset scanner
    inputDriveLink.value = '';
    resultsContainer.style.display = 'none';
    scanEmptyState.style.display = 'flex';
    resultsList.innerHTML = '';
    scannedFiles = [];
    
    // Redireciona para fila
    switchTab('queue');
  }
});

// ==========================================
// Monitor e Gerenciador da Fila
// ==========================================
window.api.onQueueUpdated((queue) => {
  renderQueue(queue);
});

// Estado local de pastas recolhidas/expandidas no accordion da fila
const collapsedFolders = new Set();
const expandedFolders = new Set();

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

  // Renderiza card ativo no topo
  if (activeDownloads.length > 0) {
    const active = activeDownloads[0]; // Exibe o primeiro ativo no card principal
    if (activeDownloadPanel.style.display !== 'flex') {
      activeDownloadPanel.style.display = 'flex';
    }
    
    if (activeFilename.textContent !== active.name) {
      activeFilename.textContent = active.name;
      activeFilename.title = active.name;
    }
    activeProgressText.textContent = `${active.progress}%`;
    activeSpeedText.textContent = `${formatBytes(active.speed)}/s`;
    activeEtaText.textContent = formatETA(active.eta);
    activeBytesText.textContent = `${formatBytes(active.downloadedBytes)} / ${formatBytes(active.size)}`;
    activeProgressBar.style.width = `${active.progress}%`;

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

  // Processa e atualiza in-place cada card de pasta
  folderMap.forEach((folderItems, folderName) => {
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

    const hasActiveItem = folderItems.some(f => f.status === 'downloading');

    let isCollapsed = false;
    if (collapsedFolders.has(folderName)) {
      isCollapsed = true;
    } else if (expandedFolders.has(folderName)) {
      isCollapsed = false;
    } else {
      isCollapsed = folderPercent === 100 || !hasActiveItem;
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

      const titleGroup = document.createElement('div');
      titleGroup.className = 'queue-folder-title-group';
      titleGroup.innerHTML = `
        <div class="queue-folder-icon">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
          </svg>
        </div>
        <span class="queue-folder-name" title="${folderName}">${folderName}</span>
      `;

      const badgeGroup = document.createElement('div');
      badgeGroup.className = 'queue-folder-badge-group';
      badgeGroup.innerHTML = `
        <span class="queue-folder-badge"></span>
        <span class="queue-folder-percent"></span>
        <div class="queue-folder-toggle-icon">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </div>
      `;

      titleRow.appendChild(titleGroup);
      titleRow.appendChild(badgeGroup);

      const progressBg = document.createElement('div');
      progressBg.className = 'queue-folder-progress-bg';
      const progressFill = document.createElement('div');
      progressFill.className = 'queue-folder-progress-fill';
      progressBg.appendChild(progressFill);

      folderHeader.appendChild(titleRow);
      folderHeader.appendChild(progressBg);

      folderHeader.onclick = () => {
        if (folderCard.classList.contains('collapsed')) {
          collapsedFolders.delete(folderName);
          expandedFolders.add(folderName);
          folderCard.classList.remove('collapsed');
        } else {
          expandedFolders.delete(folderName);
          collapsedFolders.add(folderName);
          folderCard.classList.add('collapsed');
        }
      };

      const folderItemsContainer = document.createElement('div');
      folderItemsContainer.className = 'queue-folder-items';

      folderCard.appendChild(folderHeader);
      folderCard.appendChild(folderItemsContainer);
      queueItemsList.appendChild(folderCard);
    }

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

    // Atualiza ou insere itens da pasta
    folderItems.forEach(item => {
      let itemEl = folderItemsContainer.querySelector(`.queue-item[data-item-id="${CSS.escape(item.id)}"]`);
      if (!itemEl) {
        itemEl = createQueueItemElement(item);
        folderItemsContainer.appendChild(itemEl);
      } else {
        updateQueueItemElement(itemEl, item);
      }
    });
  });
}

function createQueueItemElement(item) {
  const div = document.createElement('div');
  div.className = 'queue-item';
  div.dataset.itemId = item.id;

  const divInfo = document.createElement('div');
  divInfo.className = 'queue-item-info';

  const divName = document.createElement('div');
  divName.className = 'queue-item-name text-truncate';
  divName.textContent = item.name;
  divName.title = item.name;

  const divMeta = document.createElement('div');
  divMeta.className = 'queue-item-meta';

  const spanSize = document.createElement('span');
  spanSize.className = 'queue-item-size-text';
  spanSize.textContent = formatBytes(item.size);

  const spanStatus = document.createElement('span');
  spanStatus.className = `queue-item-status-badge ${item.status}`;
  spanStatus.textContent = getStatusLabel(item.status);

  divMeta.appendChild(spanSize);
  divMeta.appendChild(spanStatus);

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

function updateQueueItemElement(itemEl, item) {
  const spanStatus = itemEl.querySelector('.queue-item-status-badge');
  if (spanStatus) {
    if (spanStatus.className !== `queue-item-status-badge ${item.status}`) {
      spanStatus.className = `queue-item-status-badge ${item.status}`;
    }
    const label = getStatusLabel(item.status);
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
  if (await showCustomConfirm('Deseja realmente limpar toda a fila de downloads? Todos os processos ativos serão cancelados.', 'Limpar Fila')) {
    window.api.clearQueue();
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
// Inicialização do App
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
  checkAuthStatus();
  loadConfig();
});
