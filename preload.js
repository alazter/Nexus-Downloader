const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Configurações
  getConfig: () => ipcRenderer.invoke('get-config'),
  setConfig: (config) => ipcRenderer.invoke('set-config', config),
  selectDownloadDir: () => ipcRenderer.invoke('select-download-dir'),
  openDownloadsFolder: () => ipcRenderer.invoke('open-downloads-folder'),

  // Autenticação
  checkAuth: () => ipcRenderer.invoke('check-auth'),
  saveCredentials: (credsJsonString) => ipcRenderer.invoke('save-credentials', credsJsonString),
  login: () => ipcRenderer.invoke('login'),
  logout: () => ipcRenderer.invoke('logout'),

  // Escaneamento e Fila
  scanLink: (link) => ipcRenderer.invoke('scan-link', link),
  addToQueue: (files) => ipcRenderer.invoke('add-to-queue', files),
  pauseDownload: (fileId) => ipcRenderer.invoke('pause-download', fileId),
  resumeDownload: (fileId) => ipcRenderer.invoke('resume-download', fileId),
  cancelDownload: (fileId) => ipcRenderer.invoke('cancel-download', fileId),
  clearCompleted: () => ipcRenderer.invoke('clear-completed'),
  clearQueue: () => ipcRenderer.invoke('clear-queue'),
  pauseAllDownloads: () => ipcRenderer.invoke('pause-all-downloads'),
  resumeAllDownloads: () => ipcRenderer.invoke('resume-all-downloads'),
  restartQueue: () => ipcRenderer.invoke('restart-queue'),

  // Escuta de Eventos
  onQueueUpdated: (callback) => {
    // Remove listeners antigos antes de adicionar um novo para evitar vazamentos
    ipcRenderer.removeAllListeners('queue-updated');
    ipcRenderer.on('queue-updated', (event, queue) => callback(queue));
  },

  // Auto Updater
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  restartAndInstall: () => ipcRenderer.invoke('restart-and-install'),
  onUpdaterStatus: (callback) => {
    ipcRenderer.removeAllListeners('updater-status');
    ipcRenderer.on('updater-status', (event, data) => callback(data));
  }
});
