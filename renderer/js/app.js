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
    
    item.classList.add('active');
    document.getElementById(`${tabId}-tab`).classList.add('active');
  });
});

function switchTab(tabId) {
  const item = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
  if (item) {
    item.click();
  }
}

// ==========================================
// Gerenciamento de Autenticação Google
// ==========================================
async function checkAuthStatus() {
  try {
    const auth = await window.api.checkAuth();
    
    if (auth.connected) {
      // Estado Conectado
      authIndicator.className = 'status-indicator connected';
      authStatusText.textContent = 'Conta Conectada';
      authSidebarBtn.textContent = 'Desconectar';
      authSidebarBtn.className = 'btn btn-sm btn-outline-danger btn-block';
      
      settingsAuthDisconnected.style.display = 'none';
      settingsAuthConnected.style.display = 'block';
    } else {
      // Estado Desconectado
      authIndicator.className = 'status-indicator disconnected';
      authStatusText.textContent = 'Conta Desconectada';
      authSidebarBtn.textContent = 'Conectar';
      authSidebarBtn.className = 'btn btn-sm btn-outline-primary btn-block';
      
      settingsAuthDisconnected.style.display = 'block';
      settingsAuthConnected.style.display = 'none';
      
      // Mantém o botão ativo para podermos dar feedback amigável se clicado sem credenciais
      btnGoogleLogin.disabled = false;
    }
  } catch (err) {
    console.error('Erro ao verificar status de autenticação:', err);
  }
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
    alert('Erro no login: ' + err.message);
  } finally {
    btnGoogleLogin.textContent = 'Conectar Conta Google';
    btnGoogleLogin.disabled = false;
  }
});

btnGoogleLogout.addEventListener('click', async () => {
  if (confirm('Deseja realmente desconectar sua conta Google?')) {
    await window.api.logout();
    checkAuthStatus();
  }
});

authSidebarBtn.addEventListener('click', () => {
  const isConnected = authIndicator.classList.contains('connected');
  if (isConnected) {
    btnGoogleLogout.click();
  } else {
    switchTab('settings');
  }
});

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
btnPaste.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    inputDriveLink.value = text;
  } catch (err) {
    console.error('Falha ao ler área de transferência:', err);
  }
});

btnScan.addEventListener('click', async () => {
  const url = inputDriveLink.value.trim();
  if (!url) {
    alert('Por favor, cole um link do Google Drive para escanear.');
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
      alert('Nenhum arquivo encontrado no link fornecido.');
      scanEmptyState.style.display = 'flex';
      return;
    }

    scannedFiles = files;
    renderResults();
  } catch (err) {
    alert('Erro ao escanear link: ' + err.message);
    scanEmptyState.style.display = 'flex';
  } finally {
    btnScan.disabled = false;
    scanSpinner.style.display = 'none';
    btnScan.querySelector('.btn-text').textContent = 'Escanear Drive';
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
    queueBadge.textContent = pendingAndActive.toString();
    queueBadge.style.display = 'inline-block';
  } else {
    queueBadge.style.display = 'none';
  }

  // Renderiza card ativo no topo
  if (activeDownloads.length > 0) {
    const active = activeDownloads[0]; // Exibe o primeiro ativo no card principal
    activeDownloadPanel.style.display = 'flex';
    
    activeFilename.textContent = active.name;
    activeFilename.title = active.name;
    activeProgressText.textContent = `${active.progress}%`;
    activeSpeedText.textContent = `${formatBytes(active.speed)}/s`;
    activeEtaText.textContent = formatETA(active.eta);
    activeBytesText.textContent = `${formatBytes(active.downloadedBytes)} / ${formatBytes(active.size)}`;
    activeProgressBar.style.width = `${active.progress}%`;

    // Atualiza botões do painel ativo
    btnActivePause.onclick = () => window.api.pauseDownload(active.id);
    btnActiveCancel.onclick = () => {
      if (confirm(`Cancelar o download do arquivo "${active.name}"?`)) {
        window.api.cancelDownload(active.id);
      }
    };
  } else {
    activeDownloadPanel.style.display = 'none';
  }

  // 2. Renderiza lista da fila (Agrupada por Pasta)
  queueItemsList.innerHTML = '';
  queueTotalCount.textContent = queue.length.toString();

  if (queue.length === 0) {
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

  // Renderiza um Card de Pasta para cada grupo
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
      // Padrão inicial: recolhe pastas 100% concluídas ou pastas que não estão baixando ativamente
      isCollapsed = folderPercent === 100 || !hasActiveItem;
    }

    // Container do Card da Pasta
    const folderCard = document.createElement('div');
    folderCard.className = `queue-folder-card ${isCollapsed ? 'collapsed' : ''}`;

    // Cabeçalho da Pasta (Click alterna accordion)
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
      <span class="queue-folder-badge">${completedFiles}/${totalFiles} concluídos (${formatBytes(folderDownloadedBytes)} / ${formatBytes(folderTotalBytes)})</span>
      <span class="queue-folder-percent">${folderPercent}%</span>
      <div class="queue-folder-toggle-icon">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </div>
    `;

    titleRow.appendChild(titleGroup);
    titleRow.appendChild(badgeGroup);

    // Barra de Progresso do Acumulado da Pasta
    const progressBg = document.createElement('div');
    progressBg.className = 'queue-folder-progress-bg';
    
    const progressFill = document.createElement('div');
    progressFill.className = 'queue-folder-progress-fill';
    progressFill.style.width = `${folderPercent}%`;
    progressBg.appendChild(progressFill);

    folderHeader.appendChild(titleRow);
    folderHeader.appendChild(progressBg);

    // Toggle expandir/recolher
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

    // Container de Itens de Arquivo da Pasta
    const folderItemsContainer = document.createElement('div');
    folderItemsContainer.className = 'queue-folder-items';

    folderItems.forEach(item => {
      const itemEl = createQueueItemElement(item);
      folderItemsContainer.appendChild(itemEl);
    });

    folderCard.appendChild(folderHeader);
    folderCard.appendChild(folderItemsContainer);

    queueItemsList.appendChild(folderCard);
  });
}

function createQueueItemElement(item) {
  const div = document.createElement('div');
  div.className = 'queue-item';

  // Info do Arquivo
  const divInfo = document.createElement('div');
  divInfo.className = 'queue-item-info';

  const divName = document.createElement('div');
  divName.className = 'queue-item-name text-truncate';
  divName.textContent = item.name;
  divName.title = item.name;

  const divMeta = document.createElement('div');
  divMeta.className = 'queue-item-meta';

  const spanSize = document.createElement('span');
  spanSize.textContent = formatBytes(item.size);

  const spanStatus = document.createElement('span');
  spanStatus.className = `queue-item-status-badge ${item.status}`;
  spanStatus.textContent = getStatusLabel(item.status);

  divMeta.appendChild(spanSize);
  divMeta.appendChild(spanStatus);

  if (item.error) {
    const spanError = document.createElement('span');
    spanError.style.color = 'var(--danger)';
    spanError.textContent = `| Erro: ${item.error}`;
    divMeta.appendChild(spanError);
  }

  divInfo.appendChild(divName);
  divInfo.appendChild(divMeta);

  // Ações
  const divActions = document.createElement('div');
  divActions.className = 'queue-item-actions';

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
  btnCancel.onclick = (e) => {
    e.stopPropagation();
    if (confirm(`Remover "${item.name}" da fila?`)) {
      window.api.cancelDownload(item.id);
    }
  };
  divActions.appendChild(btnCancel);

  div.appendChild(divInfo);
  div.appendChild(divActions);
  return div;
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

btnClearAll.addEventListener('click', () => {
  if (confirm('Deseja realmente limpar toda a fila de downloads? Todos os processos ativos serão cancelados.')) {
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
    if (confirm('Deseja realmente reiniciar toda a fila de downloads a partir do zero (0%)?')) {
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
