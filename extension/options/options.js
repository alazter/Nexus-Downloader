// Nexus Downloader - Options Script
document.addEventListener('DOMContentLoaded', async () => {
  const inputTorbox = document.getElementById('opt-torbox-key');
  const btnPasteTorbox = document.getElementById('btn-paste-torbox');
  const btnTestTorbox = document.getElementById('btn-test-torbox');
  const torboxStatus = document.getElementById('torbox-status-badge');
  const optTorboxHint = document.getElementById('opt-torbox-hint');
  const optChkExtensionOnly = document.getElementById('opt-chk-extension-only');
  const optEngineTitle = document.getElementById('opt-engine-title');
  const optEngineDesc = document.getElementById('opt-engine-desc');
  const radioEngines = document.querySelectorAll('input[name="downloadEngine"]');
  const optHudEnabled = document.getElementById('opt-hud-enabled');
  const modeCards = document.querySelectorAll('.mode-card');
  const chkTelemetry = document.getElementById('opt-telemetry');
  const btnSave = document.getElementById('btn-save-all');
  const saveStatus = document.getElementById('save-status-text');
  const navBtns = document.querySelectorAll('.nav-btn');
  const tabSections = document.querySelectorAll('.tab-section');

  const optDownloadFolder = document.getElementById('opt-download-folder');
  const optFolderDesc = document.getElementById('opt-folder-desc');
  const optBtnOpenFolder = document.getElementById('opt-btn-open-folder');

  let selectedMode = 'supported';
  let savedTorboxKey = '';
  let savedDownloadFolder = 'Nexus Downloads';
  let bridgeTorboxConfigured = false;

  function updateEngineAndTorboxUI(isExtensionOnly) {
    const isUsingPortable = !isExtensionOnly;
    if (optEngineTitle) {
      optEngineTitle.innerText = isUsingPortable 
        ? 'Baixar Usando Motor do Nexus Portable PC' 
        : 'Baixar usando motor da Extensão Nexus';
    }
    if (optEngineDesc) {
      optEngineDesc.innerText = isUsingPortable 
        ? 'Arquivos e links enviados diretamente para o Nexus Downloader Portable no seu computador.' 
        : 'Arquivos serão baixado somente usando o motor de busca e download da extensão de navegador do Nexus.';
    }    // O motor é fixado exclusivamente no Nexus Portable PC
    radioEngines.forEach(radio => {
      if (radio.value === 'bridge') {
        radio.checked = true;
      } else {
        radio.checked = false;
        radio.disabled = true;
      }
    });

    if (optChkExtensionOnly) {
      optChkExtensionOnly.checked = true;
      optChkExtensionOnly.disabled = true;
    }

    if (optDownloadFolder) {
      optDownloadFolder.disabled = true;
      optDownloadFolder.readOnly = true;
      optDownloadFolder.value = 'Gerenciado pelo Nexus Portable PC';
      optDownloadFolder.style.opacity = '0.5';
      optDownloadFolder.style.cursor = 'not-allowed';
      if (optFolderDesc) optFolderDesc.textContent = 'Desabilitado no navegador: Os arquivos são salvos diretamente na pasta configurada no Nexus Downloader Portable PC.';
    }

    inputTorbox.disabled = true;
    inputTorbox.readOnly = true;
    inputTorbox.value = '••••••••••••••••••••••••';
    btnPasteTorbox.disabled = true;
    btnTestTorbox.disabled = true;
    if (optTorboxHint) {
      optTorboxHint.style.display = 'block';
      optTorboxHint.textContent = 'Chave sincronizada com o Nexus Portable PC. A edição e colagem ficam desabilitadas (gerencie pela versão desktop).';
    }
    torboxStatus.style.display = 'flex';
    torboxStatus.innerHTML = '<span>●</span> Conectado';
    torboxStatus.style.color = '#34d399';
  }

  // 1. Carregar valores salvos e consultar ponte desktop
  chrome.storage.local.get([
    'torboxApiKey',
    'monitoringMode',
    'telemetryEnabled',
    'hudEnabled',
    'hudState'
  ], (res) => {
    savedTorboxKey = res.torboxApiKey || '';

    updateEngineAndTorboxUI(false);
    chrome.storage.local.set({
      downloadEngine: 'bridge',
      downloadOnlyViaExtension: false
    });

    if (res.monitoringMode) {
      selectedMode = res.monitoringMode;
      updateModeCards(selectedMode);
    }
    if (res.telemetryEnabled !== undefined) {
      chkTelemetry.checked = res.telemetryEnabled;
    }
    if (optHudEnabled) {
      optHudEnabled.checked = res.hudState === 'expanded' || res.hudEnabled !== false;
    }

    // Consulta bridge para obter status do Torbox no portable
    chrome.runtime.sendMessage({ action: 'CHECK_BRIDGE_STATUS' }, (bridgeRes) => {
      bridgeTorboxConfigured = !!(bridgeRes && bridgeRes.data && bridgeRes.data.torboxConfigured) || !!savedTorboxKey;
      updateEngineAndTorboxUI(false);
    });
  });

  // 2. Navegação lateral por abas independentes
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      navBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const targetId = btn.getAttribute('data-section');
      
      tabSections.forEach(sec => sec.classList.remove('active'));
      const targetEl = document.getElementById(targetId);
      if (targetEl) {
        targetEl.classList.add('active');
      }
    });
  });

  // 3. Sincronização entre o Toggle do Motor e os Radios
  if (optChkExtensionOnly) {
    optChkExtensionOnly.addEventListener('change', () => {
      const isUsingPortable = optChkExtensionOnly.checked;
      const isOnly = !isUsingPortable;
      const targetRadio = document.querySelector(`input[name="downloadEngine"][value="${isOnly ? 'browser' : 'bridge'}"]`);
      if (targetRadio) targetRadio.checked = true;
      updateEngineAndTorboxUI(isOnly);
    });
  }

  radioEngines.forEach(radio => {
    radio.addEventListener('change', () => {
      const isOnly = (radio.value === 'browser');
      if (optChkExtensionOnly) {
        optChkExtensionOnly.checked = !isOnly;
      }
      updateEngineAndTorboxUI(isOnly);
    });
  });

  // 4. Colar Chave Torbox
  btnPasteTorbox.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        inputTorbox.value = text.trim();
        updateTorboxStatus(text.trim());
      }
    } catch (e) {
      alert('Cole manualmente a chave com Ctrl+V.');
    }
  });

  inputTorbox.addEventListener('input', () => {
    updateTorboxStatus(inputTorbox.value.trim());
  });

  function updateTorboxStatus(key) {
    if (key && key.length > 10) {
      torboxStatus.style.display = 'flex';
      torboxStatus.innerHTML = '<span>●</span> Configurado';
      torboxStatus.style.color = '#6ee7b7';
    } else {
      torboxStatus.style.display = 'none';
    }
  }

  // 4.1. Testar Chave Torbox
  if (btnTestTorbox) {
    btnTestTorbox.addEventListener('click', async () => {
      const key = inputTorbox.value.trim();
      if (!key) {
        alert('Por favor, insira uma chave de API antes de testar.');
        return;
      }
      btnTestTorbox.innerText = 'Testando...';
      try {
        const res = await fetch('https://api.torbox.app/v1/api/user/me', {
          headers: { 'Authorization': `Bearer ${key}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.success) {
            torboxStatus.style.display = 'flex';
            torboxStatus.innerHTML = '<span>●</span> Conectado com Sucesso!';
            torboxStatus.style.color = '#00f5a0';
            btnTestTorbox.innerText = 'Válida';
          } else {
            torboxStatus.style.display = 'flex';
            torboxStatus.innerHTML = '<span>●</span> Chave Inválida';
            torboxStatus.style.color = '#ef4444';
            btnTestTorbox.innerText = 'Inválida';
          }
        } else {
          torboxStatus.style.display = 'flex';
          torboxStatus.innerHTML = '<span>●</span> Chave Recusada';
          torboxStatus.style.color = '#ef4444';
          btnTestTorbox.innerText = 'Erro';
        }
      } catch (err) {
        torboxStatus.style.display = 'flex';
        torboxStatus.innerHTML = '<span>●</span> Erro de Conexão';
        torboxStatus.style.color = '#f59e0b';
        btnTestTorbox.innerText = 'Offline';
      }
      setTimeout(() => {
        btnTestTorbox.innerText = 'Testar';
      }, 3000);
    });
  }

  // 5. Seleção dos Modos de Monitoramento
  modeCards.forEach(card => {
    card.addEventListener('click', () => {
      selectedMode = card.getAttribute('data-mode');
      updateModeCards(selectedMode);
    });
  });

  function updateModeCards(mode) {
    modeCards.forEach(c => {
      if (c.getAttribute('data-mode') === mode) {
        c.classList.add('active');
      } else {
        c.classList.remove('active');
      }
    });
  }

  if (optBtnOpenFolder) {
    optBtnOpenFolder.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'OPEN_DOWNLOAD_FOLDER' });
    });
  }

  // 6. Salvar Configurações
  btnSave.addEventListener('click', () => {
    const settingsToSave = {
      downloadEngine: 'bridge',
      downloadOnlyViaExtension: false,
      monitoringMode: selectedMode,
      telemetryEnabled: chkTelemetry.checked,
      hudEnabled: optHudEnabled ? optHudEnabled.checked : true
    };

    if (isOnlyExtension) {
      settingsToSave.torboxApiKey = inputTorbox.value.trim();
      savedTorboxKey = settingsToSave.torboxApiKey;
      if (optDownloadFolder) {
        settingsToSave.downloadFolder = optDownloadFolder.value.trim() || 'Nexus Downloads';
        savedDownloadFolder = settingsToSave.downloadFolder;
      }
    }

    chrome.storage.local.set(settingsToSave, () => {
      chrome.runtime.sendMessage({ action: 'SYNC_BRIDGE_STATE' });
      saveStatus.innerText = 'Configurações salvas com sucesso!';
      setTimeout(() => {
        saveStatus.innerText = '';
      }, 3000);
    });
  });
});
