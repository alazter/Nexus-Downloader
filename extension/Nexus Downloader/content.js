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
  let expandedExtFolders = new Set();
  let initializedFolderTreeKey = '';
  let lastScannedUrl = window.location.href;
  let torboxCloudData = null;
  let torboxLoading = false;

  let hudContainer = null;
  let hudElement = null;
  let isDragging = false;
  let dragOffset = { x: 0, y: 0 };

  // Escudo Ativo Anti-Popups e Anti-Propagandas para MegaUp e hosters
  if (window.location.hostname.includes('megaup.net')) {
    try {
      const shieldScript = document.createElement('script');
      shieldScript.textContent = `
        (function() {
          if (window.__NEXUS_SHIELD_ACTIVE__) return;
          window.__NEXUS_SHIELD_ACTIVE__ = true;

          const _origOpen = window.open;
          window.open = function(url, target, features) {
            if (!url) return null;
            const u = String(url).toLowerCase();
            if (u.includes('megaup.net') || u.includes('megaupdownup.org') || u.includes('cloudflare.com') || u.includes('challenges.cloudflare.com')) {
              return _origOpen.apply(this, arguments);
            }
            console.log('[Nexus Shield] Popup de propaganda neutralizado:', url);
            return null;
          };

          document.addEventListener('click', function(e) {
            const a = e.target && e.target.closest ? e.target.closest('a') : null;
            if (a && a.href) {
              const h = a.href.toLowerCase();
              if (a.target === '_blank' && !h.includes('megaup.net') && !h.includes('megaupdownup.org') && !h.includes('cloudflare.com')) {
                console.log('[Nexus Shield] Link externo de propaganda cancelado:', a.href);
                e.preventDefault();
                e.stopPropagation();
              }
            }
          }, true);
        })();
      `;
      (document.head || document.documentElement).appendChild(shieldScript);
      shieldScript.remove();
    } catch (e) {}
  }

  // Folha de Estilos Oficial Injetada de Forma Sincrona (Zero Latencia / Imune a CSP / Imune a CSS Externo)
  const NEXUS_INLINE_CSS = "/* ============================================================\r\n   Nexus Downloader - Content Styles (HUD Flutuante & Modal In-Page)\r\n   ============================================================ */\r\n\r\n:root, :host {\r\n  --nexus-bg-primary: #060810;\r\n  --nexus-bg-glass: rgba(11, 15, 25, 0.94);\r\n  --nexus-cyan: #00f2fe;\r\n  --nexus-cyan-glow: rgba(0, 242, 254, 0.35);\r\n  --nexus-purple: #7f00ff;\r\n  --nexus-emerald: #00f5a0;\r\n  --nexus-emerald-glow: rgba(0, 245, 160, 0.35);\r\n  --nexus-font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;\r\n}\r\n\r\n:host {\r\n  all: initial !important;\r\n  display: contents !important;\r\n}\r\n\r\n/* CONTAINER PRINCIPAL DO HUD FLUTUANTE */\r\n#nexus-hud-container {\r\n  position: fixed;\r\n  bottom: 24px;\r\n  right: 24px;\r\n  z-index: 2147483640;\r\n  font-family: var(--nexus-font);\r\n  user-select: none;\r\n  -webkit-font-smoothing: antialiased;\r\n  display: flex;\r\n  align-items: center;\r\n  justify-content: center;\r\n}\r\n\r\n/* WIDGET HUD CIRCULAR */\r\n.nexus-floating-hud {\r\n  position: relative;\r\n  background: var(--nexus-bg-glass);\r\n  backdrop-filter: blur(20px) saturate(180%);\r\n  -webkit-backdrop-filter: blur(20px) saturate(180%);\r\n  border-radius: 50%;\r\n  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.7);\r\n  display: flex;\r\n  align-items: center;\r\n  justify-content: center;\r\n  cursor: pointer;\r\n  transition: width 0.35s cubic-bezier(0.16, 1, 0.3, 1),\r\n              height 0.35s cubic-bezier(0.16, 1, 0.3, 1),\r\n              box-shadow 0.35s ease;\r\n  overflow: visible;\r\n}\r\n\r\n/* 1. VERSÃO PEQUENA PADRÃO (~58px) */\r\n.nexus-floating-hud.compact {\r\n  width: 58px;\r\n  height: 58px;\r\n  box-shadow: 0 0 18px var(--nexus-cyan-glow), 0 6px 20px rgba(0, 0, 0, 0.7);\r\n}\r\n\r\n.nexus-floating-hud.compact.completed {\r\n  box-shadow: 0 0 20px var(--nexus-emerald-glow), 0 6px 20px rgba(0, 0, 0, 0.7);\r\n}\r\n\r\n/* LOGO OFICIAL COMO MARCA D'ÁGUA NO BACKGROUND */\r\n.nexus-hud-bg-logo {\r\n  position: absolute;\r\n  top: 50%;\r\n  left: 50%;\r\n  transform: translate(-50%, -50%);\r\n  width: 72%;\r\n  height: 72%;\r\n  opacity: 0.22;\r\n  pointer-events: none;\r\n  z-index: 1;\r\n  transition: opacity 0.3s ease;\r\n}\r\n\r\n/* No modo expandido, oculta completamente a logo do background para ZERO sobreposição com textos e botões */\r\n.nexus-floating-hud.expanded .nexus-hud-bg-logo {\r\n  display: none !important;\r\n}\r\n\r\n/* ANEL DE PROGRESSO SVG NO CONTORNO INTERNO */\r\n.nexus-hud-svg-ring {\r\n  position: absolute;\r\n  top: 0;\r\n  left: 0;\r\n  width: 100%;\r\n  height: 100%;\r\n  transform: rotate(-90deg);\r\n  pointer-events: none;\r\n  z-index: 2;\r\n}\r\n\r\n.nexus-hud-ring-track {\r\n  fill: none;\r\n  stroke: rgba(255, 255, 255, 0.08);\r\n}\r\n\r\n.nexus-hud-ring-bar {\r\n  fill: none;\r\n  stroke: var(--nexus-cyan);\r\n  stroke-linecap: round;\r\n  transition: stroke-dashoffset 0.4s ease, stroke 0.4s ease, opacity 0.3s ease;\r\n  filter: drop-shadow(0 0 6px var(--nexus-cyan));\r\n}\r\n\r\n.nexus-hud-ring-bar.inactive {\r\n  stroke: transparent !important;\r\n  opacity: 0 !important;\r\n  visibility: hidden;\r\n}\r\n\r\n.nexus-hud-ring-bar.completed {\r\n  stroke: var(--nexus-emerald);\r\n  filter: drop-shadow(0 0 7px var(--nexus-emerald));\r\n}\r\n\r\n/* DADOS NO CENTRO DO MODO COMPACTO */\r\n.nexus-hud-compact-data {\r\n  position: relative;\r\n  z-index: 3;\r\n  display: flex;\r\n  flex-direction: column;\r\n  align-items: center;\r\n  justify-content: center;\r\n  text-align: center;\r\n  cursor: pointer;\r\n  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), filter 0.2s ease;\r\n  padding: 4px;\r\n  border-radius: 50%;\r\n  width: 100%;\r\n  height: 100%;\r\n}\r\n\r\n.nexus-hud-compact-data:hover {\r\n  transform: scale(1.1);\r\n  filter: drop-shadow(0 0 6px rgba(0, 242, 254, 0.8));\r\n}\r\n\r\n.nexus-compact-stack {\r\n  display: flex;\r\n  flex-direction: column;\r\n  align-items: center;\r\n  justify-content: center;\r\n  gap: 1px;\r\n  pointer-events: none;\r\n  width: 100%;\r\n  line-height: 1.1;\r\n}\r\n\r\n.nexus-compact-speed-val {\r\n  font-size: 8.5px;\r\n  font-weight: 800;\r\n  color: #38bdf8;\r\n  letter-spacing: -0.2px;\r\n  text-shadow: 0 0 6px rgba(0, 0, 0, 0.95), 0 0 4px rgba(0, 242, 254, 0.4);\r\n  white-space: nowrap;\r\n  line-height: 1;\r\n}\r\n\r\n.nexus-compact-count-val {\r\n  font-size: 11px;\r\n  font-weight: 800;\r\n  color: #ffffff;\r\n  letter-spacing: -0.2px;\r\n  text-shadow: 0 0 6px rgba(0, 0, 0, 0.95);\r\n  white-space: nowrap;\r\n  line-height: 1.1;\r\n}\r\n\r\n.nexus-hud-check {\r\n  font-size: 1.25rem;\r\n  font-weight: 900;\r\n  color: var(--nexus-emerald);\r\n  line-height: 1;\r\n  text-shadow: 0 0 10px rgba(0, 245, 160, 0.8);\r\n}\r\n\r\n/* 2. VERSÃO EXPANDIDA (~184px - Espaçosa e Sem Sobreposição) */\r\n.nexus-floating-hud.expanded {\r\n  width: 184px;\r\n  height: 184px;\r\n  box-shadow: 0 0 32px var(--nexus-cyan-glow), 0 14px 44px rgba(0, 0, 0, 0.9);\r\n  cursor: pointer;\r\n}\r\n\r\n.nexus-floating-hud.expanded.completed {\r\n  box-shadow: 0 0 32px var(--nexus-emerald-glow), 0 14px 44px rgba(0, 0, 0, 0.9);\r\n}\r\n\r\n.nexus-hud-expanded-data {\r\n  display: none;\r\n  flex-direction: column;\r\n  align-items: center;\r\n  justify-content: center;\r\n  text-align: center;\r\n  z-index: 3;\r\n  gap: 3px;\r\n  width: 100%;\r\n  height: 100%;\r\n  padding: 14px 12px 16px 12px;\r\n  box-sizing: border-box;\r\n  cursor: pointer;\r\n}\r\n\r\n.nexus-floating-hud.expanded .nexus-hud-expanded-data {\r\n  display: flex;\r\n}\r\n\r\n.nexus-floating-hud.expanded .nexus-hud-compact-data {\r\n  display: none;\r\n}\r\n\r\n/* BLOCO UNIFICADO: STATUS + CONTADOR (UM SÓ ELEMENTO INTERATIVO NO HOVER) */\r\n.nexus-exp-header-group {\r\n  display: flex;\r\n  flex-direction: column;\r\n  align-items: center;\r\n  justify-content: center;\r\n  cursor: pointer;\r\n  padding: 5px 12px;\r\n  border-radius: 12px;\r\n  border: 1px solid transparent;\r\n  background: transparent;\r\n  transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);\r\n  margin-bottom: 2px;\r\n  width: 90%;\r\n  box-sizing: border-box;\r\n}\r\n\r\n.nexus-exp-header-group:hover {\r\n  background: transparent !important;\r\n  border-color: transparent !important;\r\n  box-shadow: none !important;\r\n  transform: translateY(-1px) scale(1.015);\r\n}\r\n\r\n.nexus-exp-header-group:hover .nexus-exp-status-row,\r\n.nexus-exp-header-group:hover .nexus-exp-counter,\r\n.nexus-exp-header-group:hover .nexus-exp-sub {\r\n  filter: none !important;\r\n  -webkit-text-stroke: 0 !important;\r\n}\r\n\r\n.nexus-exp-header-group:hover .nexus-exp-counter {\r\n  color: #38bdf8 !important;\r\n  text-shadow: 0 0 6px rgba(56, 189, 248, 0.5) !important;\r\n}\r\n\r\n.nexus-exp-header-group:hover .nexus-exp-status {\r\n  text-shadow: 0 0 5px rgba(56, 189, 248, 0.4) !important;\r\n}\r\n\r\n.nexus-exp-header-group:hover .nexus-exp-sub {\r\n  color: #bae6fd !important;\r\n  text-shadow: 0 0 4px rgba(56, 189, 248, 0.3) !important;\r\n}\r\n\r\n.nexus-exp-header-group:active {\r\n  transform: scale(0.98);\r\n}\r\n\r\n.nexus-exp-status-row {\r\n  display: flex;\r\n  align-items: center;\r\n  justify-content: center;\r\n  gap: 4px;\r\n}\r\n\r\n.nexus-exp-status {\r\n  font-size: 0.76rem;\r\n  font-weight: 800;\r\n  color: var(--nexus-emerald);\r\n  letter-spacing: 0.2px;\r\n  line-height: 1.1;\r\n  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.9);\r\n  transition: all 0.2s ease;\r\n  pointer-events: none;\r\n}\r\n\r\n.nexus-exp-status.downloading {\r\n  color: #38bdf8;\r\n}\r\n\r\n.nexus-exp-check {\r\n  font-size: 1.1rem;\r\n  color: var(--nexus-emerald);\r\n  font-weight: 900;\r\n  line-height: 1;\r\n  pointer-events: none;\r\n}\r\n\r\n.nexus-exp-counter {\r\n  font-size: 1.25rem;\r\n  font-weight: 800;\r\n  color: #ffffff;\r\n  line-height: 1.1;\r\n  margin: 1px 0;\r\n  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.9);\r\n  transition: all 0.2s ease;\r\n  pointer-events: none;\r\n}\r\n\r\n.nexus-exp-sub {\r\n  font-size: 0.54rem;\r\n  font-weight: 700;\r\n  letter-spacing: 0.6px;\r\n  color: #94a3b8;\r\n  text-transform: uppercase;\r\n  line-height: 1;\r\n  margin-bottom: 2px;\r\n  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);\r\n  pointer-events: none;\r\n}\r\n\r\n.nexus-exp-tags {\r\n  display: flex;\r\n  gap: 5px;\r\n  margin: 1px 0 0 0;\r\n  align-items: center;\r\n  justify-content: center;\r\n  max-width: 120px;\r\n  flex-wrap: nowrap;\r\n}\r\n\r\n.nexus-tag-service {\r\n  background: rgba(167, 139, 250, 0.18);\r\n  color: #c084fc;\r\n  border: 1px solid rgba(167, 139, 250, 0.4);\r\n  font-weight: 700;\r\n  padding: 1.5px 6px;\r\n  border-radius: 999px;\r\n  font-size: 8px;\r\n  line-height: 1.2;\r\n  white-space: nowrap;\r\n  max-width: 58px;\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n}\r\n\r\n.nexus-tag-type {\r\n  background: rgba(0, 242, 254, 0.15);\r\n  color: #38bdf8;\r\n  border: 1px solid rgba(0, 242, 254, 0.35);\r\n  font-weight: 700;\r\n  padding: 1.5px 6px;\r\n  border-radius: 999px;\r\n  font-size: 8px;\r\n  line-height: 1.2;\r\n  white-space: nowrap;\r\n  max-width: 58px;\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n}\r\n\r\n/* BOTÃO ABRIR PASTA / BAIXAR LOTE / VER DOWNLOADS */\r\n.nexus-btn-open-folder {\r\n  background: rgba(0, 242, 254, 0.1);\r\n  border: 1px solid rgba(0, 242, 254, 0.45);\r\n  color: #00f2fe;\r\n  font-size: 0.72rem;\r\n  font-weight: 700;\r\n  padding: 5px 14px;\r\n  border-radius: 12px;\r\n  cursor: pointer;\r\n  display: inline-flex;\r\n  align-items: center;\r\n  justify-content: center;\r\n  gap: 4px;\r\n  transition: all 0.2s;\r\n  text-decoration: none;\r\n  white-space: nowrap;\r\n  max-width: 154px;\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n  margin-top: 2px;\r\n}\r\n\r\n.nexus-btn-open-folder:hover {\r\n  background: linear-gradient(135deg, #00f2fe 0%, #38bdf8 100%);\r\n  color: #060810;\r\n  border-color: #00f2fe;\r\n  box-shadow: 0 0 12px rgba(0, 242, 254, 0.5);\r\n}\r\n\r\n/* BOTÕES DE CONTROLE NO HOVER (EXPANDIDO & COMPACTO) */\r\n.nexus-hud-hover-controls {\r\n  position: absolute;\r\n  top: -16px;\r\n  left: 0;\r\n  right: 0;\r\n  display: flex;\r\n  justify-content: center;\r\n  gap: 10px;\r\n  opacity: 0;\r\n  pointer-events: none;\r\n  transform: translateY(4px);\r\n  transition: opacity 0.2s ease, transform 0.2s ease;\r\n  z-index: 25;\r\n}\r\n\r\n.nexus-floating-hud.compact .nexus-hud-hover-controls {\r\n  top: -14px;\r\n  gap: 6px;\r\n}\r\n\r\n/* Ponte de hover contínua entre o topo do círculo e os botões */\r\n.nexus-hud-hover-controls::after {\r\n  content: '';\r\n  position: absolute;\r\n  top: -8px;\r\n  left: -25px;\r\n  right: -25px;\r\n  bottom: -22px;\r\n  z-index: -1;\r\n  pointer-events: auto;\r\n}\r\n\r\n.nexus-floating-hud.expanded:hover .nexus-hud-hover-controls,\r\n.nexus-floating-hud.compact:hover .nexus-hud-hover-controls,\r\n.nexus-hud-hover-controls:hover {\r\n  opacity: 1;\r\n  pointer-events: auto;\r\n  transform: translateY(0);\r\n}\r\n\r\n.nexus-btn-ctrl {\r\n  all: unset !important;\r\n  box-sizing: border-box !important;\r\n  width: 24px !important;\r\n  height: 24px !important;\r\n  min-width: 24px !important;\r\n  max-width: 24px !important;\r\n  min-height: 24px !important;\r\n  max-height: 24px !important;\r\n  border-radius: 50% !important;\r\n  background: rgba(15, 23, 42, 0.95) !important;\r\n  border: 1px solid rgba(255, 255, 255, 0.2) !important;\r\n  color: #f8fafc !important;\r\n  display: flex !important;\r\n  align-items: center !important;\r\n  justify-content: center !important;\r\n  font-size: 11px !important;\r\n  cursor: pointer !important;\r\n  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.5) !important;\r\n  transition: all 0.2s !important;\r\n  padding: 0 !important;\r\n  margin: 0 !important;\r\n  flex-shrink: 0 !important;\r\n  overflow: hidden !important;\r\n}\r\n\r\n.nexus-btn-ctrl:hover {\r\n  background: var(--nexus-cyan) !important;\r\n  color: #060810 !important;\r\n  border-color: var(--nexus-cyan) !important;\r\n  box-shadow: 0 0 8px var(--nexus-cyan) !important;\r\n}\r\n\r\n.nexus-btn-ctrl.close:hover {\r\n  background: #ef4444 !important;\r\n  color: #ffffff !important;\r\n  border-color: #ef4444 !important;\r\n  box-shadow: 0 0 8px #ef4444 !important;\r\n}\r\n\r\n/* ÍCONE DE ARRASTE (DRAG HANDLE) */\r\n.nexus-drag-handle {\r\n  cursor: grab;\r\n}\r\n.nexus-drag-handle:active {\r\n  cursor: grabbing;\r\n}\r\n\r\n/* ============================================================\r\n   ESCUDO DE ISOLAMENTO TOTAL CONTRA RESETS E ESTILOS EXTERNOS\r\n   (ISOLAMENTO UNIVERSAL CONTRA BOOTSTRAP, TAILWIND, THEMES, MEGAUP, TERABOX)\r\n   ============================================================ */\r\n#nexus-manager-overlay,\r\n#nexus-manager-overlay *,\r\n#nexus-modal-overlay,\r\n#nexus-modal-overlay *,\r\n#nexus-inpage-options-backdrop,\r\n#nexus-inpage-options-backdrop *,\r\n#nexus-confirm-overlay,\r\n#nexus-confirm-overlay *,\r\n#nexus-hud-container,\r\n#nexus-hud-container *,\r\n[dir] #nexus-manager-overlay,\r\n[dir] #nexus-manager-overlay *,\r\n[dir] #nexus-modal-overlay,\r\n[dir] #nexus-modal-overlay *,\r\n[dir] #nexus-inpage-options-backdrop,\r\n[dir] #nexus-inpage-options-backdrop *,\r\n[dir] #nexus-confirm-overlay,\r\n[dir] #nexus-confirm-overlay *,\r\n[dir] #nexus-hud-container,\r\n[dir] #nexus-hud-container * {\r\n  box-sizing: border-box !important;\r\n  text-align: left;\r\n  letter-spacing: normal;\r\n  visibility: visible;\r\n  font-family: var(--nexus-font) !important;\r\n  -webkit-font-smoothing: antialiased !important;\r\n  text-rendering: optimizeLegibility !important;\r\n  float: none !important;\r\n  clear: none !important;\r\n  text-shadow: none !important;\r\n  text-decoration: none !important;\r\n  text-indent: 0 !important;\r\n}\r\n\r\n/* Neutralizar qualquer pseudo-elemento injetado por frameworks externos em labels, spans, botoes e divs */\r\n#nexus-manager-overlay label::before,\r\n#nexus-manager-overlay label::after,\r\n#nexus-manager-overlay span::before,\r\n#nexus-manager-overlay span::after,\r\n#nexus-manager-overlay button::before,\r\n#nexus-manager-overlay button::after,\r\n#nexus-modal-overlay label::before,\r\n#nexus-modal-overlay label::after,\r\n#nexus-modal-overlay span::before,\r\n#nexus-modal-overlay span::after,\r\n#nexus-modal-overlay button::before,\r\n#nexus-modal-overlay button::after,\r\n#nexus-inpage-options-backdrop label::before,\r\n#nexus-inpage-options-backdrop label::after,\r\n#nexus-inpage-options-backdrop span::before,\r\n#nexus-inpage-options-backdrop span::after,\r\n#nexus-inpage-options-backdrop button::before,\r\n#nexus-inpage-options-backdrop button::after,\r\n#nexus-confirm-overlay label::before,\r\n#nexus-confirm-overlay label::after,\r\n#nexus-confirm-overlay span::before,\r\n#nexus-confirm-overlay span::after,\r\n#nexus-confirm-overlay button::before,\r\n#nexus-confirm-overlay button::after,\r\n#nexus-hud-container label::before,\r\n#nexus-hud-container label::after,\r\n#nexus-hud-container span::before,\r\n#nexus-hud-container span::after,\r\n#nexus-hud-container button::before,\r\n#nexus-hud-container button::after {\r\n  content: none !important;\r\n  display: none !important;\r\n}\r\n\r\n/* Blindagem padrao de todos os botoes contra width: 100%, margin-top e resets de submit */\r\n#nexus-manager-overlay button,\r\n#nexus-modal-overlay button,\r\n#nexus-inpage-options-backdrop button,\r\n#nexus-confirm-overlay button,\r\n#nexus-hud-container button,\r\n[dir] #nexus-manager-overlay button,\r\n[dir] #nexus-modal-overlay button,\r\n[dir] #nexus-inpage-options-backdrop button,\r\n[dir] #nexus-confirm-overlay button,\r\n[dir] #nexus-hud-container button {\r\n  all: unset;\r\n  box-sizing: border-box !important;\r\n  font-family: var(--nexus-font) !important;\r\n  cursor: pointer !important;\r\n  text-transform: none !important;\r\n  overflow: visible !important;\r\n  margin: 0 !important;\r\n  padding: 0;\r\n  width: auto !important;\r\n  min-width: 0 !important;\r\n  max-width: none !important;\r\n  height: auto !important;\r\n  display: inline-flex !important;\r\n  flex-direction: row !important;\r\n  align-items: center !important;\r\n  justify-content: center !important;\r\n  flex-shrink: 0 !important;\r\n  flex-grow: 0 !important;\r\n  vertical-align: middle !important;\r\n  line-height: normal !important;\r\n  white-space: nowrap !important;\r\n  border: none;\r\n  background: transparent;\r\n  color: inherit;\r\n}\r\n\r\n/* ============================================================\r\n   MINI JANELA MODAL DE ARQUIVOS DETECTADOS NA PÁGINA\r\n   ============================================================ */\r\n#nexus-modal-overlay,\r\n[dir] #nexus-modal-overlay {\r\n  position: fixed !important;\r\n  top: 0 !important;\r\n  left: 0 !important;\r\n  width: 100vw !important;\r\n  height: 100vh !important;\r\n  background: rgba(3, 5, 10, 0.6) !important;\r\n  backdrop-filter: blur(8px) !important;\r\n  -webkit-backdrop-filter: blur(8px) !important;\r\n  z-index: 2147483645 !important;\r\n  display: flex !important;\r\n  align-items: center !important;\r\n  justify-content: center !important;\r\n  margin: 0 !important;\r\n  padding: 0 !important;\r\n  border: 0 !important;\r\n}\r\n\r\n#nexus-modal-overlay .nexus-modal-card,\r\n[dir] #nexus-modal-overlay .nexus-modal-card,\r\n.nexus-modal-card {\r\n  width: 90% !important;\r\n  max-width: 440px !important;\r\n  background: rgba(10, 15, 30, 0.95) !important;\r\n  border: 1px solid rgba(0, 242, 254, 0.3) !important;\r\n  box-shadow: 0 0 35px rgba(0, 242, 254, 0.25), 0 20px 50px rgba(0, 0, 0, 0.8) !important;\r\n  border-radius: 18px !important;\r\n  padding: 22px !important;\r\n  font-family: var(--nexus-font) !important;\r\n  color: #f8fafc !important;\r\n  animation: nexus-modal-in 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;\r\n  margin: auto !important;\r\n  display: flex !important;\r\n  flex-direction: column !important;\r\n  overflow: hidden !important;\r\n}\r\n\r\n@keyframes nexus-modal-in {\r\n  from { opacity: 0; transform: scale(0.92) translateY(10px); }\r\n  to { opacity: 1; transform: scale(1) translateY(0); }\r\n}\r\n\r\n#nexus-modal-overlay .nexus-modal-header,\r\n[dir] #nexus-modal-overlay .nexus-modal-header,\r\n.nexus-modal-header {\r\n  display: flex !important;\r\n  align-items: center !important;\r\n  justify-content: space-between !important;\r\n  padding-bottom: 14px !important;\r\n  border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;\r\n  margin-bottom: 14px !important;\r\n  background: transparent !important;\r\n}\r\n\r\n#nexus-modal-overlay .nexus-modal-brand,\r\n#nexus-manager-overlay .nexus-modal-brand,\r\n[dir] #nexus-modal-overlay .nexus-modal-brand,\r\n[dir] #nexus-manager-overlay .nexus-modal-brand,\r\n.nexus-modal-brand {\r\n  display: flex !important;\r\n  align-items: center !important;\r\n  gap: 12px !important;\r\n  margin: 0 !important;\r\n  padding: 0 !important;\r\n}\r\n\r\n#nexus-modal-overlay .nexus-modal-brand svg,\r\n#nexus-manager-overlay .nexus-modal-brand svg,\r\n[dir] #nexus-modal-overlay .nexus-modal-brand svg,\r\n[dir] #nexus-manager-overlay .nexus-modal-brand svg,\r\n.nexus-modal-brand svg {\r\n  width: 38px !important;\r\n  height: 38px !important;\r\n  filter: drop-shadow(0 0 8px rgba(0, 242, 254, 0.65)) !important;\r\n  flex-shrink: 0 !important;\r\n  display: block !important;\r\n}\r\n\r\n#nexus-modal-overlay .nexus-modal-title-nexus,\r\n#nexus-manager-overlay .nexus-modal-title-nexus,\r\n[dir] #nexus-modal-overlay .nexus-modal-title-nexus,\r\n[dir] #nexus-manager-overlay .nexus-modal-title-nexus,\r\n.nexus-modal-title-nexus {\r\n  font-size: 1.25rem !important;\r\n  font-weight: 800 !important;\r\n  letter-spacing: 0.5px !important;\r\n  background: linear-gradient(135deg, #00f2fe 0%, #4facfe 50%, #7f00ff 100%) !important;\r\n  -webkit-background-clip: text !important;\r\n  -webkit-text-fill-color: transparent !important;\r\n  color: #00f2fe !important;\r\n  line-height: 1.1 !important;\r\n  display: block !important;\r\n  margin: 0 !important;\r\n  padding: 0 !important;\r\n}\r\n\r\n#nexus-modal-overlay .nexus-modal-title-downloader,\r\n#nexus-manager-overlay .nexus-modal-title-downloader,\r\n[dir] #nexus-modal-overlay .nexus-modal-title-downloader,\r\n[dir] #nexus-manager-overlay .nexus-modal-title-downloader,\r\n.nexus-modal-title-downloader {\r\n  font-size: 0.68rem !important;\r\n  font-weight: 700 !important;\r\n  letter-spacing: 1.5px !important;\r\n  text-transform: uppercase !important;\r\n  color: #94a3b8 !important;\r\n  display: block !important;\r\n  line-height: 1.2 !important;\r\n  margin-top: 2px !important;\r\n  padding: 0 !important;\r\n}\r\n\r\n#nexus-modal-overlay .nexus-modal-subbar,\r\n[dir] #nexus-modal-overlay .nexus-modal-subbar,\r\n.nexus-modal-subbar {\r\n  display: flex !important;\r\n  align-items: center !important;\r\n  justify-content: space-between !important;\r\n  margin-bottom: 12px !important;\r\n  font-size: 0.82rem !important;\r\n  padding: 0 !important;\r\n}\r\n\r\n#nexus-modal-overlay .nexus-modal-files-list,\r\n[dir] #nexus-modal-overlay .nexus-modal-files-list,\r\n.nexus-modal-files-list {\r\n  max-height: 240px !important;\r\n  overflow-y: auto !important;\r\n  margin-bottom: 16px !important;\r\n  padding-right: 4px !important;\r\n  display: flex !important;\r\n  flex-direction: column !important;\r\n  gap: 6px !important;\r\n  padding-left: 0 !important;\r\n  border: 0 !important;\r\n  background: transparent !important;\r\n}\r\n\r\n#nexus-modal-overlay .nexus-modal-files-list::-webkit-scrollbar,\r\n.nexus-modal-files-list::-webkit-scrollbar {\r\n  width: 5px !important;\r\n}\r\n#nexus-modal-overlay .nexus-modal-files-list::-webkit-scrollbar-track,\r\n.nexus-modal-files-list::-webkit-scrollbar-track {\r\n  background: rgba(15, 23, 42, 0.4) !important;\r\n  border-radius: 4px !important;\r\n}\r\n#nexus-modal-overlay .nexus-modal-files-list::-webkit-scrollbar-thumb,\r\n.nexus-modal-files-list::-webkit-scrollbar-thumb {\r\n  background: linear-gradient(180deg, #00f2fe, #7f00ff) !important;\r\n  border-radius: 4px !important;\r\n}\r\n\r\n#nexus-modal-overlay .nexus-modal-file-row,\r\n[dir] #nexus-modal-overlay .nexus-modal-file-row,\r\n.nexus-modal-file-row {\r\n  display: flex !important;\r\n  align-items: center !important;\r\n  justify-content: space-between !important;\r\n  padding: 8px 10px !important;\r\n  background: rgba(15, 23, 42, 0.5) !important;\r\n  border: 1px solid rgba(255, 255, 255, 0.05) !important;\r\n  border-radius: 8px !important;\r\n  margin-bottom: 6px !important;\r\n  font-size: 0.8rem !important;\r\n}\r\n\r\n#nexus-modal-overlay .nexus-modal-file-info,\r\n[dir] #nexus-modal-overlay .nexus-modal-file-info,\r\n.nexus-modal-file-info {\r\n  display: flex !important;\r\n  align-items: center !important;\r\n  gap: 8px !important;\r\n  overflow: hidden !important;\r\n  text-overflow: ellipsis !important;\r\n  white-space: nowrap !important;\r\n}\r\n\r\n#nexus-modal-overlay .nexus-btn-download-action,\r\n[dir] #nexus-modal-overlay .nexus-btn-download-action,\r\n.nexus-btn-download-action {\r\n  width: 100% !important;\r\n  background: linear-gradient(135deg, #00f2fe 0%, #4facfe 50%, #7f00ff 100%) !important;\r\n  color: #060810 !important;\r\n  font-weight: 800 !important;\r\n  font-size: 0.92rem !important;\r\n  padding: 12px 18px !important;\r\n  border: none !important;\r\n  border-radius: 12px !important;\r\n  cursor: pointer !important;\r\n  display: flex !important;\r\n  align-items: center !important;\r\n  justify-content: center !important;\r\n  gap: 10px !important;\r\n  box-shadow: 0 4px 20px rgba(0, 242, 254, 0.4) !important;\r\n  transition: all 0.25s !important;\r\n}\r\n\r\n#nexus-modal-overlay .nexus-btn-download-action:hover,\r\n[dir] #nexus-modal-overlay .nexus-btn-download-action:hover,\r\n.nexus-btn-download-action:hover {\r\n  box-shadow: 0 6px 28px rgba(0, 242, 254, 0.7) !important;\r\n  transform: translateY(-1px) !important;\r\n}\r\n\r\n/* ============================================================\r\n   JANELA DE GERENCIAMENTO DE DOWNLOADS IN-PAGE (ESTILO PORTABLE)\r\n   ============================================================ */\r\n#nexus-manager-overlay,\r\n[dir] #nexus-manager-overlay {\r\n  position: fixed !important;\r\n  top: 0 !important;\r\n  left: 0 !important;\r\n  width: 100vw !important;\r\n  height: 100vh !important;\r\n  background: rgba(3, 5, 10, 0.75) !important;\r\n  backdrop-filter: blur(12px) saturate(160%) !important;\r\n  -webkit-backdrop-filter: blur(12px) saturate(160%) !important;\r\n  z-index: 2147483646 !important;\r\n  display: flex !important;\r\n  align-items: center !important;\r\n  justify-content: center !important;\r\n  font-family: var(--nexus-font) !important;\r\n  color: #f8fafc !important;\r\n  margin: 0 !important;\r\n  padding: 0 !important;\r\n  border: 0 !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-manager-card,\r\n[dir] #nexus-manager-overlay .nexus-manager-card,\r\n.nexus-manager-card {\r\n  width: 92% !important;\r\n  max-width: 680px !important;\r\n  max-height: 86vh !important;\r\n  background: rgba(8, 12, 24, 0.96) !important;\r\n  border: 1px solid rgba(0, 242, 254, 0.35) !important;\r\n  box-shadow: 0 0 45px rgba(0, 242, 254, 0.2), 0 24px 60px rgba(0, 0, 0, 0.85) !important;\r\n  border-radius: 20px !important;\r\n  display: flex !important;\r\n  flex-direction: column !important;\r\n  overflow: hidden !important;\r\n  animation: nexus-modal-in 0.28s cubic-bezier(0.16, 1, 0.3, 1) !important;\r\n  margin: auto !important;\r\n  padding: 0 !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-manager-header,\r\n[dir] #nexus-manager-overlay .nexus-manager-header,\r\n.nexus-manager-header {\r\n  padding: 16px 20px !important;\r\n  display: flex !important;\r\n  align-items: center !important;\r\n  justify-content: space-between !important;\r\n  border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;\r\n  background: rgba(15, 23, 42, 0.45) !important;\r\n  margin: 0 !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-btn-ctrl.close,\r\n#nexus-modal-overlay .nexus-btn-ctrl.close,\r\n[dir] #nexus-manager-overlay .nexus-btn-ctrl.close,\r\n[dir] #nexus-modal-overlay .nexus-btn-ctrl.close,\r\n.nexus-btn-ctrl.close {\r\n  width: 28px !important;\r\n  height: 28px !important;\r\n  border-radius: 50% !important;\r\n  background: rgba(255, 255, 255, 0.08) !important;\r\n  border: 1px solid rgba(255, 255, 255, 0.12) !important;\r\n  color: #94a3b8 !important;\r\n  display: inline-flex !important;\r\n  align-items: center !important;\r\n  justify-content: center !important;\r\n  cursor: pointer !important;\r\n  font-size: 13px !important;\r\n  transition: all 0.2s ease !important;\r\n  padding: 0 !important;\r\n  margin: 0 !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-btn-ctrl.close:hover,\r\n#nexus-modal-overlay .nexus-btn-ctrl.close:hover,\r\n[dir] #nexus-manager-overlay .nexus-btn-ctrl.close:hover,\r\n[dir] #nexus-modal-overlay .nexus-btn-ctrl.close:hover,\r\n.nexus-btn-ctrl.close:hover {\r\n  background: rgba(239, 68, 68, 0.8) !important;\r\n  border-color: #ef4444 !important;\r\n  color: #ffffff !important;\r\n  box-shadow: 0 0 10px rgba(239, 68, 68, 0.5) !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-manager-stats-panel,\r\n[dir] #nexus-manager-overlay .nexus-manager-stats-panel,\r\n.nexus-manager-stats-panel {\r\n  padding: 16px 20px !important;\r\n  background: linear-gradient(180deg, rgba(15, 23, 42, 0.5) 0%, rgba(6, 8, 16, 0.6) 100%) !important;\r\n  border-bottom: 1px solid rgba(255, 255, 255, 0.06) !important;\r\n  display: block !important;\r\n  margin: 0 !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-manager-stats-grid,\r\n[dir] #nexus-manager-overlay .nexus-manager-stats-grid,\r\n.nexus-manager-stats-grid {\r\n  display: grid !important;\r\n  grid-template-columns: repeat(3, 1fr) !important;\r\n  gap: 12px !important;\r\n  margin-bottom: 12px !important;\r\n  margin-top: 0 !important;\r\n  margin-left: 0 !important;\r\n  margin-right: 0 !important;\r\n  padding: 0 !important;\r\n  border: 0 !important;\r\n  background: transparent !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-stat-box,\r\n[dir] #nexus-manager-overlay .nexus-stat-box,\r\n.nexus-stat-box {\r\n  background: rgba(15, 23, 42, 0.6) !important;\r\n  border: 1px solid rgba(255, 255, 255, 0.08) !important;\r\n  border-radius: 10px !important;\r\n  padding: 8px 12px !important;\r\n  display: flex !important;\r\n  flex-direction: column !important;\r\n  gap: 2px !important;\r\n  margin: 0 !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-stat-box-label,\r\n[dir] #nexus-manager-overlay .nexus-stat-box-label,\r\n.nexus-stat-box-label {\r\n  font-size: 0.64rem !important;\r\n  font-weight: 700 !important;\r\n  text-transform: uppercase !important;\r\n  color: #94a3b8 !important;\r\n  letter-spacing: 0.5px !important;\r\n  display: block !important;\r\n  margin: 0 !important;\r\n  padding: 0 !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-stat-box-val,\r\n[dir] #nexus-manager-overlay .nexus-stat-box-val,\r\n.nexus-stat-box-val {\r\n  font-size: 1.05rem !important;\r\n  font-weight: 800 !important;\r\n  color: #ffffff !important;\r\n  display: block !important;\r\n  margin: 0 !important;\r\n  padding: 0 !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-stat-box-val.highlight,\r\n[dir] #nexus-manager-overlay .nexus-stat-box-val.highlight,\r\n.nexus-stat-box-val.highlight {\r\n  color: #00f2fe !important;\r\n  text-shadow: 0 0 10px rgba(0, 242, 254, 0.5) !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-stat-box-val.success,\r\n[dir] #nexus-manager-overlay .nexus-stat-box-val.success,\r\n.nexus-stat-box-val.success {\r\n  color: #00f5a0 !important;\r\n  text-shadow: 0 0 10px rgba(0, 245, 160, 0.5) !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-manager-main-progress-bar-wrap,\r\n[dir] #nexus-manager-overlay .nexus-manager-main-progress-bar-wrap,\r\n.nexus-manager-main-progress-bar-wrap {\r\n  width: 100% !important;\r\n  height: 8px !important;\r\n  background: rgba(255, 255, 255, 0.08) !important;\r\n  border-radius: 999px !important;\r\n  overflow: hidden !important;\r\n  position: relative !important;\r\n  display: block !important;\r\n  margin: 0 !important;\r\n  padding: 0 !important;\r\n  border: 0 !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-manager-main-progress-bar-fill,\r\n[dir] #nexus-manager-overlay .nexus-manager-main-progress-bar-fill,\r\n.nexus-manager-main-progress-bar-fill {\r\n  height: 100% !important;\r\n  background: linear-gradient(90deg, #00f2fe 0%, #38bdf8 50%, #7f00ff 100%) !important;\r\n  border-radius: 999px !important;\r\n  transition: width 0.35s ease !important;\r\n  box-shadow: 0 0 10px rgba(0, 242, 254, 0.7) !important;\r\n  display: block !important;\r\n  margin: 0 !important;\r\n  padding: 0 !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-manager-main-progress-bar-fill.completed,\r\n[dir] #nexus-manager-overlay .nexus-manager-main-progress-bar-fill.completed,\r\n.nexus-manager-main-progress-bar-fill.completed {\r\n  background: linear-gradient(90deg, #00f5a0 0%, #10b981 100%) !important;\r\n  box-shadow: 0 0 10px rgba(0, 245, 160, 0.7) !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-manager-toolbar,\r\n[dir] #nexus-manager-overlay .nexus-manager-toolbar,\r\n.nexus-manager-toolbar {\r\n  padding: 10px 20px !important;\r\n  display: flex !important;\r\n  flex-direction: row !important;\r\n  align-items: center !important;\r\n  justify-content: space-between !important;\r\n  gap: 12px !important;\r\n  border-bottom: 1px solid rgba(255, 255, 255, 0.06) !important;\r\n  background: rgba(11, 15, 25, 0.7) !important;\r\n  flex-wrap: nowrap !important;\r\n  width: 100% !important;\r\n  min-width: 0 !important;\r\n  margin: 0 !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-manager-filter-tabs,\r\n[dir] #nexus-manager-overlay .nexus-manager-filter-tabs,\r\n.nexus-manager-filter-tabs {\r\n  display: flex !important;\r\n  flex-direction: row !important;\r\n  gap: 6px !important;\r\n  align-items: center !important;\r\n  margin: 0 !important;\r\n  padding: 0 !important;\r\n  border: 0 !important;\r\n  background: transparent !important;\r\n  flex-wrap: nowrap !important;\r\n  overflow-x: auto !important;\r\n  flex: 1 1 auto !important;\r\n  min-width: 0 !important;\r\n  -webkit-overflow-scrolling: touch !important;\r\n  scrollbar-width: none !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-manager-filter-tabs::-webkit-scrollbar,\r\n.nexus-manager-filter-tabs::-webkit-scrollbar {\r\n  display: none !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-filter-tab-btn,\r\n[dir] #nexus-manager-overlay .nexus-filter-tab-btn,\r\n.nexus-filter-tab-btn {\r\n  background: rgba(15, 23, 42, 0.5) !important;\r\n  border: 1px solid rgba(255, 255, 255, 0.1) !important;\r\n  color: #94a3b8 !important;\r\n  font-size: 0.72rem !important;\r\n  font-weight: 700 !important;\r\n  padding: 5px 10px !important;\r\n  border-radius: 6px !important;\r\n  cursor: pointer !important;\r\n  transition: all 0.2s ease !important;\r\n  display: inline-flex !important;\r\n  flex-direction: row !important;\r\n  align-items: center !important;\r\n  justify-content: center !important;\r\n  gap: 4px !important;\r\n  margin: 0 !important;\r\n  white-space: nowrap !important;\r\n  flex-shrink: 0 !important;\r\n  flex-grow: 0 !important;\r\n  width: auto !important;\r\n  min-width: 0 !important;\r\n  max-width: none !important;\r\n  height: auto !important;\r\n  box-sizing: border-box !important;\r\n  line-height: 1.2 !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-filter-tab-btn:hover,\r\n[dir] #nexus-manager-overlay .nexus-filter-tab-btn:hover,\r\n.nexus-filter-tab-btn:hover {\r\n  background: rgba(255, 255, 255, 0.08) !important;\r\n  color: #ffffff !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-filter-tab-btn.active,\r\n[dir] #nexus-manager-overlay .nexus-filter-tab-btn.active,\r\n.nexus-filter-tab-btn.active {\r\n  background: rgba(0, 242, 254, 0.15) !important;\r\n  border-color: rgba(0, 242, 254, 0.5) !important;\r\n  color: #00f2fe !important;\r\n  box-shadow: 0 0 10px rgba(0, 242, 254, 0.3) !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-filter-tab-btn.torbox.active,\r\n[dir] #nexus-manager-overlay .nexus-filter-tab-btn.torbox.active,\r\n.nexus-filter-tab-btn.torbox.active {\r\n  background: rgba(167, 139, 250, 0.2) !important;\r\n  border-color: #a78bfa !important;\r\n  color: #c084fc !important;\r\n  box-shadow: 0 0 10px rgba(167, 139, 250, 0.4) !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-manager-actions-row,\r\n[dir] #nexus-manager-overlay .nexus-manager-actions-row,\r\n.nexus-manager-actions-row {\r\n  display: flex !important;\r\n  flex-direction: row !important;\r\n  flex-wrap: nowrap !important;\r\n  gap: 8px !important;\r\n  align-items: center !important;\r\n  flex-shrink: 0 !important;\r\n  flex-grow: 0 !important;\r\n  margin: 0 !important;\r\n  padding: 0 !important;\r\n  border: 0 !important;\r\n  background: transparent !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-btn-manager-action,\r\n[dir] #nexus-manager-overlay .nexus-btn-manager-action,\r\n.nexus-btn-manager-action {\r\n  background: rgba(15, 23, 42, 0.8) !important;\r\n  border: 1px solid rgba(255, 255, 255, 0.15) !important;\r\n  color: #f8fafc !important;\r\n  font-size: 0.72rem !important;\r\n  font-weight: 700 !important;\r\n  padding: 5px 12px !important;\r\n  border-radius: 8px !important;\r\n  cursor: pointer !important;\r\n  display: inline-flex !important;\r\n  flex-direction: row !important;\r\n  align-items: center !important;\r\n  justify-content: center !important;\r\n  gap: 6px !important;\r\n  transition: all 0.2s ease !important;\r\n  margin: 0 !important;\r\n  white-space: nowrap !important;\r\n  flex-shrink: 0 !important;\r\n  flex-grow: 0 !important;\r\n  width: auto !important;\r\n  min-width: 0 !important;\r\n  max-width: none !important;\r\n  height: auto !important;\r\n  box-sizing: border-box !important;\r\n  line-height: normal !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-btn-manager-action:hover,\r\n[dir] #nexus-manager-overlay .nexus-btn-manager-action:hover,\r\n.nexus-btn-manager-action:hover {\r\n  background: rgba(0, 242, 254, 0.15) !important;\r\n  border-color: var(--nexus-cyan) !important;\r\n  color: var(--nexus-cyan) !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-subbar-left,\r\n[dir] #nexus-manager-overlay .nexus-subbar-left,\r\n.nexus-subbar-left {\r\n  display: flex !important;\r\n  align-items: center !important;\r\n  gap: 12px !important;\r\n  margin: 0 !important;\r\n  padding: 0 !important;\r\n  border: 0 !important;\r\n  background: transparent !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-btn-manager-action.primary,\r\n[dir] #nexus-manager-overlay .nexus-btn-manager-action.primary,\r\n.nexus-btn-manager-action.primary {\r\n  background: rgba(0, 242, 254, 0.12) !important;\r\n  border: 1px solid var(--nexus-cyan) !important;\r\n  color: #00f2fe !important;\r\n  font-weight: 800 !important;\r\n  box-shadow: 0 0 10px rgba(0, 242, 254, 0.2) !important;\r\n  transition: all 0.2s ease !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-btn-manager-action.primary:hover,\r\n[dir] #nexus-manager-overlay .nexus-btn-manager-action.primary:hover,\r\n.nexus-btn-manager-action.primary:hover {\r\n  background: rgba(0, 242, 254, 0.2) !important;\r\n  color: #00f2fe !important;\r\n  border-color: #00f2fe !important;\r\n  box-shadow: 0 0 12px rgba(0, 242, 254, 0.4) !important;\r\n  text-shadow: 0 0 6px rgba(0, 242, 254, 0.5) !important;\r\n  filter: none !important;\r\n  -webkit-text-stroke: 0 !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-tag-origin,\r\n[dir] #nexus-manager-overlay .nexus-tag-origin,\r\n.nexus-tag-origin {\r\n  background: rgba(56, 189, 248, 0.15) !important;\r\n  color: #38bdf8 !important;\r\n  border: 1px solid rgba(56, 189, 248, 0.35) !important;\r\n  font-weight: 700 !important;\r\n  padding: 1px 6px !important;\r\n  border-radius: 4px !important;\r\n  font-size: 8.5px !important;\r\n  line-height: 1.2 !important;\r\n  margin: 0 !important;\r\n  display: inline-block !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-btn-manager-action.restart:hover,\r\n[dir] #nexus-manager-overlay .nexus-btn-manager-action.restart:hover,\r\n.nexus-btn-manager-action.restart:hover {\r\n  background: rgba(245, 158, 11, 0.15) !important;\r\n  border-color: #f59e0b !important;\r\n  color: #f59e0b !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-btn-manager-action.clear:hover,\r\n[dir] #nexus-manager-overlay .nexus-btn-manager-action.clear:hover,\r\n.nexus-btn-manager-action.clear:hover {\r\n  background: rgba(168, 85, 247, 0.2) !important;\r\n  border-color: #c084fc !important;\r\n  color: #c084fc !important;\r\n  box-shadow: 0 0 10px rgba(192, 132, 252, 0.35) !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-btn-manager-action.cancel:hover,\r\n[dir] #nexus-manager-overlay .nexus-btn-manager-action.cancel:hover,\r\n.nexus-btn-manager-action.cancel:hover {\r\n  background: rgba(239, 68, 68, 0.2) !important;\r\n  border-color: #ef4444 !important;\r\n  color: #fca5a5 !important;\r\n  box-shadow: 0 0 10px rgba(239, 68, 68, 0.35) !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-item-btn-remove,\r\n[dir] #nexus-manager-overlay .nexus-item-btn-remove,\r\n.nexus-item-btn-remove {\r\n  background: transparent !important;\r\n  border: 1px solid transparent !important;\r\n  color: #64748b !important;\r\n  font-size: 11px !important;\r\n  cursor: pointer !important;\r\n  padding: 2px 6px !important;\r\n  border-radius: 4px !important;\r\n  transition: all 0.2s !important;\r\n  line-height: 1 !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-manager-subbar,\r\n[dir] #nexus-manager-overlay .nexus-manager-subbar,\r\n.nexus-manager-subbar {\r\n  display: flex !important;\r\n  flex-direction: row !important;\r\n  flex-wrap: nowrap !important;\r\n  align-items: center !important;\r\n  justify-content: space-between !important;\r\n  padding: 8px 20px !important;\r\n  background: rgba(15, 23, 42, 0.5) !important;\r\n  border-bottom: 1px solid rgba(255, 255, 255, 0.06) !important;\r\n  font-size: 0.76rem !important;\r\n  color: #94a3b8 !important;\r\n  gap: 10px !important;\r\n  width: 100% !important;\r\n  min-width: 0 !important;\r\n  margin: 0 !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-subbar-select-all,\r\n[dir] #nexus-manager-overlay .nexus-subbar-select-all,\r\n.nexus-subbar-select-all {\r\n  display: inline-flex !important;\r\n  flex-direction: row !important;\r\n  flex-wrap: nowrap !important;\r\n  align-items: center !important;\r\n  gap: 8px !important;\r\n  cursor: pointer !important;\r\n  user-select: none !important;\r\n  font-weight: 600 !important;\r\n  font-size: 0.76rem !important;\r\n  color: #cbd5e1 !important;\r\n  margin: 0 !important;\r\n  padding: 0 !important;\r\n  line-height: normal !important;\r\n  border: none !important;\r\n  background: transparent !important;\r\n  flex-shrink: 0 !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-subbar-select-all span,\r\n[dir] #nexus-manager-overlay .nexus-subbar-select-all span,\r\n.nexus-subbar-select-all span {\r\n  display: inline-block !important;\r\n  position: static !important;\r\n  margin: 0 !important;\r\n  padding: 0 !important;\r\n  font-size: inherit !important;\r\n  line-height: normal !important;\r\n  color: inherit !important;\r\n  vertical-align: middle !important;\r\n  letter-spacing: normal !important;\r\n  white-space: nowrap !important;\r\n}\r\n\r\n.nexus-root-container input[type=\"checkbox\"],\r\n#nexus-manager-overlay input[type=\"checkbox\"],\r\n#nexus-hud-container input[type=\"checkbox\"],\r\n#nexus-modal-overlay input[type=\"checkbox\"],\r\n#nexus-inpage-options-backdrop input[type=\"checkbox\"],\r\n.nexus-subbar-select-all input[type=\"checkbox\"],\r\n.nexus-item-chk,\r\n#nexus-select-all,\r\n#nexus-subbar-chk-all {\r\n  all: revert !important;\r\n  appearance: auto !important;\r\n  -webkit-appearance: checkbox !important;\r\n  -moz-appearance: checkbox !important;\r\n  width: 16px !important;\r\n  height: 16px !important;\r\n  min-width: 16px !important;\r\n  max-width: 16px !important;\r\n  min-height: 16px !important;\r\n  max-height: 16px !important;\r\n  box-sizing: border-box !important;\r\n  padding: 0 !important;\r\n  margin: 0 !important;\r\n  cursor: pointer !important;\r\n  display: inline-block !important;\r\n  vertical-align: middle !important;\r\n  accent-color: var(--nexus-cyan) !important;\r\n  flex-shrink: 0 !important;\r\n  background: transparent !important;\r\n  background-color: transparent !important;\r\n  border: none !important;\r\n  outline: none !important;\r\n  box-shadow: none !important;\r\n  position: static !important;\r\n  opacity: 1 !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-subbar-actions,\r\n[dir] #nexus-manager-overlay .nexus-subbar-actions,\r\n.nexus-subbar-actions {\r\n  display: flex !important;\r\n  flex-direction: row !important;\r\n  flex-wrap: nowrap !important;\r\n  align-items: center !important;\r\n  gap: 8px !important;\r\n  margin: 0 !important;\r\n  padding: 0 !important;\r\n  border: 0 !important;\r\n  background: transparent !important;\r\n  flex-shrink: 0 !important;\r\n  flex-grow: 0 !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-tag-engine,\r\n[dir] #nexus-manager-overlay .nexus-tag-engine,\r\n.nexus-tag-engine {\r\n  background: rgba(59, 130, 246, 0.15) !important;\r\n  color: #60a5fa !important;\r\n  border: 1px solid rgba(59, 130, 246, 0.35) !important;\r\n  font-weight: 700 !important;\r\n  padding: 1px 6px !important;\r\n  border-radius: 4px !important;\r\n  font-size: 8.5px !important;\r\n  line-height: 1.2 !important;\r\n  margin: 0 !important;\r\n  display: inline-block !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-item-chk,\r\n[dir] #nexus-manager-overlay .nexus-item-chk,\r\n.nexus-item-chk {\r\n  accent-color: #00f2fe !important;\r\n  width: 15px !important;\r\n  height: 15px !important;\r\n  cursor: pointer !important;\r\n  margin: 0 !important;\r\n  padding: 0 !important;\r\n  display: inline-block !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-item-actions-btn-group,\r\n[dir] #nexus-manager-overlay .nexus-item-actions-btn-group,\r\n.nexus-item-actions-btn-group {\r\n  display: flex !important;\r\n  align-items: center !important;\r\n  gap: 4px !important;\r\n  margin-left: 6px !important;\r\n  padding: 0 !important;\r\n  border: 0 !important;\r\n  background: transparent !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-btn-item-action,\r\n[dir] #nexus-manager-overlay .nexus-btn-item-action,\r\n.nexus-btn-item-action {\r\n  background: rgba(255, 255, 255, 0.05) !important;\r\n  border: 1px solid rgba(255, 255, 255, 0.1) !important;\r\n  color: #94a3b8 !important;\r\n  width: 24px !important;\r\n  height: 24px !important;\r\n  min-width: 24px !important;\r\n  max-width: 24px !important;\r\n  min-height: 24px !important;\r\n  max-height: 24px !important;\r\n  flex-shrink: 0 !important;\r\n  flex-grow: 0 !important;\r\n  border-radius: 6px !important;\r\n  display: inline-flex !important;\r\n  align-items: center !important;\r\n  justify-content: center !important;\r\n  cursor: pointer !important;\r\n  transition: all 0.2s ease !important;\r\n  padding: 0 !important;\r\n  margin: 0 !important;\r\n  box-sizing: border-box !important;\r\n  line-height: normal !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-btn-item-action:hover,\r\n[dir] #nexus-manager-overlay .nexus-btn-item-action:hover,\r\n.nexus-btn-item-action:hover {\r\n  background: rgba(0, 242, 254, 0.15) !important;\r\n  border-color: rgba(0, 242, 254, 0.4) !important;\r\n  color: #00f2fe !important;\r\n  box-shadow: 0 0 8px rgba(0, 242, 254, 0.3) !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-btn-item-action.open-browser:hover,\r\n[dir] #nexus-manager-overlay .nexus-btn-item-action.open-browser:hover,\r\n.nexus-btn-item-action.open-browser:hover {\r\n  background: rgba(167, 139, 250, 0.15) !important;\r\n  border-color: rgba(167, 139, 250, 0.4) !important;\r\n  color: #c084fc !important;\r\n  box-shadow: 0 0 8px rgba(167, 139, 250, 0.3) !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-btn-manager-action:disabled,\r\n[dir] #nexus-manager-overlay .nexus-btn-manager-action:disabled,\r\n.nexus-btn-manager-action:disabled {\r\n  opacity: 0.45 !important;\r\n  cursor: not-allowed !important;\r\n  pointer-events: none !important;\r\n  border-color: rgba(255, 255, 255, 0.08) !important;\r\n  color: #64748b !important;\r\n  background: rgba(15, 23, 42, 0.5) !important;\r\n  box-shadow: none !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-manager-list,\r\n[dir] #nexus-manager-overlay .nexus-manager-list,\r\n.nexus-manager-list {\r\n  flex: 1 !important;\r\n  overflow-y: auto !important;\r\n  padding: 12px 20px !important;\r\n  max-height: 380px !important;\r\n  display: flex !important;\r\n  flex-direction: column !important;\r\n  gap: 8px !important;\r\n  margin: 0 !important;\r\n  border: 0 !important;\r\n  background: transparent !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-manager-list::-webkit-scrollbar,\r\n.nexus-manager-list::-webkit-scrollbar {\r\n  width: 6px !important;\r\n}\r\n#nexus-manager-overlay .nexus-manager-list::-webkit-scrollbar-track,\r\n.nexus-manager-list::-webkit-scrollbar-track {\r\n  background: rgba(15, 23, 42, 0.3) !important;\r\n  border-radius: 4px !important;\r\n}\r\n#nexus-manager-overlay .nexus-manager-list::-webkit-scrollbar-thumb,\r\n.nexus-manager-list::-webkit-scrollbar-thumb {\r\n  background: linear-gradient(180deg, #00f2fe, #7f00ff) !important;\r\n  border-radius: 4px !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-manager-item,\r\n[dir] #nexus-manager-overlay .nexus-manager-item,\r\n.nexus-manager-item {\r\n  background: rgba(15, 23, 42, 0.55) !important;\r\n  border: 1px solid rgba(255, 255, 255, 0.06) !important;\r\n  border-radius: 10px !important;\r\n  padding: 10px 14px !important;\r\n  display: flex !important;\r\n  flex-direction: column !important;\r\n  gap: 6px !important;\r\n  transition: border-color 0.2s, background 0.2s !important;\r\n  margin: 0 !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-manager-item:hover,\r\n[dir] #nexus-manager-overlay .nexus-manager-item:hover,\r\n.nexus-manager-item:hover {\r\n  background: rgba(15, 23, 42, 0.75) !important;\r\n  border-color: rgba(0, 242, 254, 0.25) !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-item-row-top,\r\n[dir] #nexus-manager-overlay .nexus-item-row-top,\r\n.nexus-item-row-top {\r\n  display: flex !important;\r\n  align-items: center !important;\r\n  gap: 10px !important;\r\n  width: 100% !important;\r\n  margin: 0 !important;\r\n  padding: 0 !important;\r\n  border: 0 !important;\r\n  background: transparent !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-item-title-group,\r\n[dir] #nexus-manager-overlay .nexus-item-title-group,\r\n.nexus-item-title-group {\r\n  display: flex !important;\r\n  align-items: center !important;\r\n  gap: 8px !important;\r\n  overflow: hidden !important;\r\n  width: 100% !important;\r\n  flex: 1 !important;\r\n  margin: 0 !important;\r\n  padding: 0 !important;\r\n  border: 0 !important;\r\n  background: transparent !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-item-name,\r\n[dir] #nexus-manager-overlay .nexus-item-name,\r\n.nexus-item-name {\r\n  font-size: 0.85rem !important;\r\n  font-weight: 700 !important;\r\n  color: #f8fafc !important;\r\n  overflow: hidden !important;\r\n  text-overflow: ellipsis !important;\r\n  white-space: nowrap !important;\r\n  flex: 1 !important;\r\n  margin: 0 !important;\r\n  padding: 0 !important;\r\n  line-height: normal !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-item-meta,\r\n[dir] #nexus-manager-overlay .nexus-item-meta,\r\n.nexus-item-meta {\r\n  display: none !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-item-progress-bar-wrap,\r\n[dir] #nexus-manager-overlay .nexus-item-progress-bar-wrap,\r\n.nexus-item-progress-bar-wrap {\r\n  width: 100% !important;\r\n  height: 4px !important;\r\n  background: rgba(255, 255, 255, 0.08) !important;\r\n  border-radius: 4px !important;\r\n  overflow: hidden !important;\r\n  display: block !important;\r\n  margin: 0 !important;\r\n  padding: 0 !important;\r\n  border: 0 !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-item-progress-bar-fill,\r\n[dir] #nexus-manager-overlay .nexus-item-progress-bar-fill,\r\n.nexus-item-progress-bar-fill {\r\n  height: 100% !important;\r\n  background: linear-gradient(90deg, #00f2fe, #38bdf8) !important;\r\n  border-radius: 4px !important;\r\n  transition: width 0.3s ease !important;\r\n  display: block !important;\r\n  margin: 0 !important;\r\n  padding: 0 !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-item-progress-bar-fill.completed,\r\n[dir] #nexus-manager-overlay .nexus-item-progress-bar-fill.completed,\r\n.nexus-item-progress-bar-fill.completed {\r\n  background: #00f5a0 !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-item-row-bottom,\r\n[dir] #nexus-manager-overlay .nexus-item-row-bottom,\r\n.nexus-item-row-bottom {\r\n  display: flex !important;\r\n  align-items: center !important;\r\n  justify-content: space-between !important;\r\n  font-size: 0.72rem !important;\r\n  font-weight: 600 !important;\r\n  color: #94a3b8 !important;\r\n  gap: 8px !important;\r\n  flex-wrap: wrap !important;\r\n  margin: 0 !important;\r\n  padding: 0 !important;\r\n  border: 0 !important;\r\n  background: transparent !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-item-bottom-left,\r\n[dir] #nexus-manager-overlay .nexus-item-bottom-left,\r\n.nexus-item-bottom-left {\r\n  display: flex !important;\r\n  align-items: center !important;\r\n  gap: 6px !important;\r\n  flex-wrap: wrap !important;\r\n  flex: 1 !important;\r\n  overflow: hidden !important;\r\n  margin: 0 !important;\r\n  padding: 0 !important;\r\n  border: 0 !important;\r\n  background: transparent !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-item-size,\r\n[dir] #nexus-manager-overlay .nexus-item-size,\r\n.nexus-item-size {\r\n  color: #cbd5e1 !important;\r\n  font-size: 0.74rem !important;\r\n  font-weight: 700 !important;\r\n  margin-right: 2px !important;\r\n  display: inline-block !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-item-status-tag,\r\n[dir] #nexus-manager-overlay .nexus-item-status-tag,\r\n.nexus-item-status-tag {\r\n  display: inline-flex !important;\r\n  align-items: center !important;\r\n  gap: 4px !important;\r\n  font-weight: 700 !important;\r\n  margin-right: 2px !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-item-status-tag.downloading,\r\n[dir] #nexus-manager-overlay .nexus-item-status-tag.downloading,\r\n.nexus-item-status-tag.downloading {\r\n  color: #38bdf8 !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-item-status-tag.completed,\r\n[dir] #nexus-manager-overlay .nexus-item-status-tag.completed,\r\n.nexus-item-status-tag.completed {\r\n  color: #00f5a0 !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-item-status-tag.pending,\r\n[dir] #nexus-manager-overlay .nexus-item-status-tag.pending,\r\n.nexus-item-status-tag.pending {\r\n  color: #f59e0b !important;\r\n}\r\n\r\n#nexus-manager-overlay .nexus-item-status-tag.failed,\r\n[dir] #nexus-manager-overlay .nexus-item-status-tag.failed,\r\n.nexus-item-status-tag.failed {\r\n  color: #ef4444 !important;\r\n}\r\n\r\n/* ============================================================\r\n   POPUP DE CONFIRMAÇÃO DE REINÍCIO (ESTILO DARK GLASS OBSIDIAN)\r\n   ============================================================ */\r\n#nexus-confirm-overlay,\r\n[dir] #nexus-confirm-overlay {\r\n  position: fixed !important;\r\n  top: 0 !important;\r\n  left: 0 !important;\r\n  width: 100vw !important;\r\n  height: 100vh !important;\r\n  background: rgba(2, 3, 8, 0.82) !important;\r\n  backdrop-filter: blur(10px) !important;\r\n  -webkit-backdrop-filter: blur(10px) !important;\r\n  z-index: 2147483647 !important;\r\n  display: flex !important;\r\n  align-items: center !important;\r\n  justify-content: center !important;\r\n  font-family: var(--nexus-font) !important;\r\n  color: #f8fafc !important;\r\n  margin: 0 !important;\r\n  padding: 0 !important;\r\n  border: 0 !important;\r\n}\r\n\r\n#nexus-confirm-overlay .nexus-confirm-card,\r\n[dir] #nexus-confirm-overlay .nexus-confirm-card,\r\n.nexus-confirm-card {\r\n  width: 90% !important;\r\n  max-width: 420px !important;\r\n  background: rgba(10, 15, 30, 0.98) !important;\r\n  border: 1px solid rgba(245, 158, 11, 0.45) !important;\r\n  box-shadow: 0 0 35px rgba(245, 158, 11, 0.25), 0 20px 50px rgba(0, 0, 0, 0.9) !important;\r\n  border-radius: 18px !important;\r\n  padding: 24px !important;\r\n  text-align: center !important;\r\n  animation: nexus-modal-in 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;\r\n  margin: auto !important;\r\n  display: flex !important;\r\n  flex-direction: column !important;\r\n  align-items: center !important;\r\n}\r\n\r\n#nexus-confirm-overlay .nexus-confirm-icon,\r\n[dir] #nexus-confirm-overlay .nexus-confirm-icon,\r\n.nexus-confirm-icon {\r\n  font-size: 2.2rem !important;\r\n  margin-bottom: 12px !important;\r\n  display: inline-block !important;\r\n  animation: nexus-pulse-warning 2s infinite ease-in-out !important;\r\n}\r\n\r\n@keyframes nexus-pulse-warning {\r\n  0%, 100% { transform: scale(1); filter: drop-shadow(0 0 4px rgba(245, 158, 11, 0.4)); }\r\n  50% { transform: scale(1.1); filter: drop-shadow(0 0 14px rgba(245, 158, 11, 0.8)); }\r\n}\r\n\r\n#nexus-confirm-overlay .nexus-confirm-title,\r\n[dir] #nexus-confirm-overlay .nexus-confirm-title,\r\n.nexus-confirm-title {\r\n  font-size: 1.2rem !important;\r\n  font-weight: 800 !important;\r\n  color: #f8fafc !important;\r\n  margin-bottom: 8px !important;\r\n}\r\n\r\n#nexus-confirm-overlay .nexus-confirm-desc,\r\n[dir] #nexus-confirm-overlay .nexus-confirm-desc,\r\n.nexus-confirm-desc {\r\n  font-size: 0.85rem !important;\r\n  color: #cbd5e1 !important;\r\n  line-height: 1.45 !important;\r\n  margin-bottom: 20px !important;\r\n}\r\n\r\n#nexus-confirm-overlay .nexus-confirm-actions,\r\n[dir] #nexus-confirm-overlay .nexus-confirm-actions,\r\n.nexus-confirm-actions {\r\n  display: flex !important;\r\n  gap: 10px !important;\r\n  justify-content: center !important;\r\n  width: 100% !important;\r\n}\r\n\r\n#nexus-confirm-overlay .nexus-btn-confirm-cancel,\r\n[dir] #nexus-confirm-overlay .nexus-btn-confirm-cancel,\r\n.nexus-btn-confirm-cancel {\r\n  flex: 1 !important;\r\n  padding: 10px 16px !important;\r\n  border-radius: 10px !important;\r\n  border: 1px solid rgba(255, 255, 255, 0.18) !important;\r\n  background: rgba(255, 255, 255, 0.06) !important;\r\n  color: #f8fafc !important;\r\n  font-weight: 700 !important;\r\n  font-size: 0.82rem !important;\r\n  cursor: pointer !important;\r\n  transition: all 0.2s ease !important;\r\n}\r\n\r\n#nexus-confirm-overlay .nexus-btn-confirm-cancel:hover,\r\n[dir] #nexus-confirm-overlay .nexus-btn-confirm-cancel:hover,\r\n.nexus-btn-confirm-cancel:hover {\r\n  background: rgba(255, 255, 255, 0.12) !important;\r\n  border-color: rgba(255, 255, 255, 0.3) !important;\r\n}\r\n\r\n#nexus-confirm-overlay .nexus-btn-confirm-restart,\r\n[dir] #nexus-confirm-overlay .nexus-btn-confirm-restart,\r\n.nexus-btn-confirm-restart {\r\n  flex: 1 !important;\r\n  padding: 10px 16px !important;\r\n  border-radius: 10px !important;\r\n  border: none !important;\r\n  background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%) !important;\r\n  color: #ffffff !important;\r\n  font-weight: 800 !important;\r\n  font-size: 0.82rem !important;\r\n  cursor: pointer !important;\r\n  box-shadow: 0 4px 14px rgba(245, 158, 11, 0.4) !important;\r\n  transition: all 0.2s ease !important;\r\n}\r\n\r\n#nexus-confirm-overlay .nexus-btn-confirm-restart:hover,\r\n[dir] #nexus-confirm-overlay .nexus-btn-confirm-restart:hover,\r\n.nexus-btn-confirm-restart:hover {\r\n  box-shadow: 0 6px 20px rgba(239, 68, 68, 0.6) !important;\r\n  transform: translateY(-1px) !important;\r\n}\r\n\r\n/* ============================================================\r\n   JANELA IN-PAGE DE CONFIGURAÇÕES COMPLETAS DA EXTENSÃO\r\n   Obsidian Glass, Overlay com Blur e Toggle Roxo Oficial\r\n   ============================================================ */\r\n#nexus-inpage-options-backdrop {\r\n  position: fixed !important;\r\n  inset: 0 !important;\r\n  background: rgba(3, 7, 18, 0.78) !important;\r\n  backdrop-filter: blur(10px) !important;\r\n  -webkit-backdrop-filter: blur(10px) !important;\r\n  z-index: 2147483648 !important;\r\n  opacity: 0;\r\n  pointer-events: none;\r\n  transition: opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;\r\n}\r\n\r\n#nexus-inpage-options-backdrop.active {\r\n  opacity: 1 !important;\r\n  pointer-events: auto !important;\r\n}\r\n\r\n#nexus-inpage-options-window {\r\n  position: fixed !important;\r\n  top: 50% !important;\r\n  left: 50% !important;\r\n  transform: translate(-50%, -50%) scale(0.96) !important;\r\n  width: 720px !important;\r\n  max-width: 94vw !important;\r\n  max-height: 90vh !important;\r\n  background: rgba(11, 15, 25, 0.98) !important;\r\n  border: 1px solid rgba(255, 255, 255, 0.14) !important;\r\n  border-radius: 18px !important;\r\n  box-shadow: 0 25px 65px rgba(0, 0, 0, 0.85), 0 0 35px rgba(0, 242, 254, 0.15) !important;\r\n  display: flex !important;\r\n  flex-direction: column !important;\r\n  overflow: hidden !important;\r\n  z-index: 2147483649 !important;\r\n  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif !important;\r\n  color: #f8fafc !important;\r\n  opacity: 0;\r\n  pointer-events: none;\r\n  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;\r\n}\r\n\r\n#nexus-inpage-options-backdrop.active #nexus-inpage-options-window {\r\n  opacity: 1 !important;\r\n  pointer-events: auto !important;\r\n  transform: translate(-50%, -50%) scale(1) !important;\r\n}\r\n\r\n.nexus-inpage-header {\r\n  display: flex !important;\r\n  align-items: center !important;\r\n  justify-content: space-between !important;\r\n  padding: 16px 22px !important;\r\n  border-bottom: 1px solid rgba(255, 255, 255, 0.1) !important;\r\n  background: rgba(15, 23, 42, 0.6) !important;\r\n}\r\n\r\n.nexus-inpage-header-left {\r\n  display: flex !important;\r\n  align-items: center !important;\r\n  gap: 12px !important;\r\n}\r\n\r\n.nexus-inpage-title {\r\n  font-size: 1.05rem !important;\r\n  font-weight: 800 !important;\r\n  letter-spacing: 0.5px !important;\r\n  color: #ffffff !important;\r\n  display: flex !important;\r\n  align-items: center !important;\r\n  gap: 8px !important;\r\n}\r\n\r\n.nexus-inpage-btn-close {\r\n  width: 32px !important;\r\n  height: 32px !important;\r\n  border-radius: 50% !important;\r\n  border: 1px solid rgba(255, 255, 255, 0.15) !important;\r\n  background: rgba(255, 255, 255, 0.06) !important;\r\n  color: #cbd5e1 !important;\r\n  font-size: 15px !important;\r\n  display: flex !important;\r\n  align-items: center !important;\r\n  justify-content: center !important;\r\n  cursor: pointer !important;\r\n  transition: all 0.2s ease !important;\r\n}\r\n\r\n.nexus-inpage-btn-close:hover {\r\n  background: rgba(239, 68, 68, 0.8) !important;\r\n  color: #ffffff !important;\r\n  border-color: #ef4444 !important;\r\n  box-shadow: 0 0 10px rgba(239, 68, 68, 0.5) !important;\r\n  transform: scale(1.05) !important;\r\n}\r\n\r\n.nexus-inpage-body {\r\n  padding: 20px 24px !important;\r\n  overflow-y: auto !important;\r\n  display: flex !important;\r\n  flex-direction: column !important;\r\n  gap: 16px !important;\r\n  max-height: calc(90vh - 130px) !important;\r\n}\r\n\r\n.nexus-inpage-card {\r\n  background: rgba(15, 23, 42, 0.45) !important;\r\n  border: 1px solid rgba(255, 255, 255, 0.08) !important;\r\n  border-radius: 14px !important;\r\n  padding: 16px 18px !important;\r\n  display: flex !important;\r\n  flex-direction: column !important;\r\n  gap: 12px !important;\r\n}\r\n\r\n.nexus-inpage-card-header {\r\n  display: flex !important;\r\n  align-items: center !important;\r\n  justify-content: space-between !important;\r\n  gap: 16px !important;\r\n}\r\n\r\n.nexus-inpage-card-title {\r\n  font-size: 0.95rem !important;\r\n  font-weight: 700 !important;\r\n  color: #ffffff !important;\r\n  margin-bottom: 3px !important;\r\n}\r\n\r\n.nexus-inpage-card-desc {\r\n  font-size: 0.8rem !important;\r\n  color: #94a3b8 !important;\r\n  line-height: 1.4 !important;\r\n}\r\n\r\n/* TOGGLE ROXO NEXUS */\r\n.nexus-purple-toggle {\r\n  position: relative !important;\r\n  display: inline-block !important;\r\n  width: 48px !important;\r\n  height: 26px !important;\r\n  flex-shrink: 0 !important;\r\n}\r\n\r\n.nexus-purple-toggle input {\r\n  opacity: 0 !important;\r\n  width: 0 !important;\r\n  height: 0 !important;\r\n}\r\n\r\n.nexus-purple-slider {\r\n  position: absolute !important;\r\n  cursor: pointer !important;\r\n  top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important;\r\n  background-color: rgba(255, 255, 255, 0.12) !important;\r\n  border: 1px solid rgba(255, 255, 255, 0.2) !important;\r\n  transition: 0.3s cubic-bezier(0.16, 1, 0.3, 1) !important;\r\n  border-radius: 26px !important;\r\n}\r\n\r\n.nexus-purple-slider:before {\r\n  position: absolute !important;\r\n  content: \"\" !important;\r\n  height: 18px !important;\r\n  width: 18px !important;\r\n  left: 3px !important;\r\n  bottom: 3px !important;\r\n  background-color: #ffffff !important;\r\n  transition: 0.3s cubic-bezier(0.16, 1, 0.3, 1) !important;\r\n  border-radius: 50% !important;\r\n  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.5) !important;\r\n}\r\n\r\n.nexus-purple-toggle input:checked + .nexus-purple-slider {\r\n  background: linear-gradient(135deg, #a855f7 0%, #c084fc 100%) !important;\r\n  border-color: #c084fc !important;\r\n  box-shadow: 0 0 12px rgba(168, 85, 247, 0.6) !important;\r\n}\r\n\r\n.nexus-purple-toggle input:checked + .nexus-purple-slider:before {\r\n  transform: translateX(22px) !important;\r\n}\r\n\r\n/* TOGGLE VERDE (RECURSOS EXCLUSIVOS DA EXTENSÃO) */\r\n.nexus-green-toggle {\r\n  position: relative !important;\r\n  display: inline-block !important;\r\n  width: 48px !important;\r\n  height: 26px !important;\r\n  flex-shrink: 0 !important;\r\n}\r\n\r\n.nexus-green-toggle input {\r\n  opacity: 0 !important;\r\n  width: 0 !important;\r\n  height: 0 !important;\r\n}\r\n\r\n.nexus-green-slider {\r\n  position: absolute !important;\r\n  cursor: pointer !important;\r\n  top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important;\r\n  background-color: rgba(255, 255, 255, 0.12) !important;\r\n  border: 1px solid rgba(255, 255, 255, 0.2) !important;\r\n  transition: 0.3s cubic-bezier(0.16, 1, 0.3, 1) !important;\r\n  border-radius: 26px !important;\r\n}\r\n\r\n.nexus-green-slider:before {\r\n  position: absolute !important;\r\n  content: \"\" !important;\r\n  height: 18px !important;\r\n  width: 18px !important;\r\n  left: 3px !important;\r\n  bottom: 3px !important;\r\n  background-color: #ffffff !important;\r\n  transition: 0.3s cubic-bezier(0.16, 1, 0.3, 1) !important;\r\n  border-radius: 50% !important;\r\n  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.5) !important;\r\n}\r\n\r\n.nexus-green-toggle input:checked + .nexus-green-slider {\r\n  background: linear-gradient(135deg, #10b981 0%, #059669 100%) !important;\r\n  border-color: #10b981 !important;\r\n  box-shadow: 0 0 12px rgba(16, 185, 129, 0.6) !important;\r\n}\r\n\r\n.nexus-green-toggle input:checked + .nexus-green-slider:before {\r\n  transform: translateX(22px) !important;\r\n}\r\n\r\n/* CHAVE TORBOX E GATE VISUAL */\r\n.nexus-inpage-torbox-row {\r\n  display: flex !important;\r\n  align-items: center !important;\r\n  gap: 8px !important;\r\n  flex-wrap: wrap !important;\r\n}\r\n\r\n.nexus-inpage-torbox-input {\r\n  flex: 1 1 240px !important;\r\n  background: rgba(0, 0, 0, 0.35) !important;\r\n  border: 1px solid rgba(255, 255, 255, 0.14) !important;\r\n  color: #ffffff !important;\r\n  padding: 8px 12px !important;\r\n  border-radius: 8px !important;\r\n  font-size: 0.85rem !important;\r\n  outline: none !important;\r\n  transition: border-color 0.2s !important;\r\n}\r\n\r\n.nexus-inpage-torbox-input:focus {\r\n  border-color: var(--nexus-cyan) !important;\r\n  box-shadow: 0 0 10px rgba(0, 242, 254, 0.3) !important;\r\n}\r\n\r\n.nexus-inpage-torbox-input:disabled {\r\n  background: rgba(15, 23, 42, 0.6) !important;\r\n  color: #94a3b8 !important;\r\n  border-color: rgba(255, 255, 255, 0.08) !important;\r\n  cursor: not-allowed !important;\r\n  letter-spacing: 2px !important;\r\n}\r\n\r\n.nexus-inpage-btn-action {\r\n  padding: 8px 14px !important;\r\n  border-radius: 8px !important;\r\n  border: 1px solid rgba(255, 255, 255, 0.15) !important;\r\n  background: rgba(255, 255, 255, 0.06) !important;\r\n  color: #e2e8f0 !important;\r\n  font-size: 0.82rem !important;\r\n  font-weight: 700 !important;\r\n  cursor: pointer !important;\r\n  transition: all 0.2s !important;\r\n  white-space: nowrap !important;\r\n}\r\n\r\n.nexus-inpage-btn-action:hover:not(:disabled) {\r\n  background: rgba(0, 242, 254, 0.15) !important;\r\n  border-color: var(--nexus-cyan) !important;\r\n  color: #00f2fe !important;\r\n}\r\n\r\n.nexus-inpage-btn-action:disabled {\r\n  opacity: 0.45 !important;\r\n  cursor: not-allowed !important;\r\n  border-color: rgba(255, 255, 255, 0.05) !important;\r\n}\r\n\r\n.nexus-inpage-chips-row {\r\n  display: flex !important;\r\n  gap: 8px !important;\r\n  flex-wrap: wrap !important;\r\n}\r\n\r\n.nexus-inpage-chip {\r\n  padding: 7px 14px !important;\r\n  border-radius: 20px !important;\r\n  border: 1px solid rgba(255, 255, 255, 0.12) !important;\r\n  background: rgba(15, 23, 42, 0.6) !important;\r\n  color: #94a3b8 !important;\r\n  font-size: 0.78rem !important;\r\n  font-weight: 700 !important;\r\n  cursor: pointer !important;\r\n  transition: all 0.2s !important;\r\n}\r\n\r\n.nexus-inpage-chip:hover {\r\n  background: rgba(0, 242, 254, 0.08) !important;\r\n  color: #e2e8f0 !important;\r\n  border-color: rgba(0, 242, 254, 0.3) !important;\r\n}\r\n\r\n.nexus-inpage-chip.active {\r\n  background: rgba(16, 185, 129, 0.18) !important;\r\n  border-color: #10b981 !important;\r\n  color: #34d399 !important;\r\n  box-shadow: 0 0 12px rgba(16, 185, 129, 0.4) !important;\r\n}\r\n\r\n.nexus-inpage-footer {\r\n  display: flex !important;\r\n  align-items: center !important;\r\n  justify-content: flex-end !important;\r\n  gap: 12px !important;\r\n  padding: 16px 22px !important;\r\n  border-top: 1px solid rgba(255, 255, 255, 0.1) !important;\r\n  background: rgba(15, 23, 42, 0.7) !important;\r\n}\r\n\r\n.nexus-inpage-btn-save {\r\n  padding: 9px 22px !important;\r\n  border-radius: 10px !important;\r\n  border: 1px solid rgba(168, 85, 247, 0.6) !important;\r\n  background: linear-gradient(135deg, #a855f7 0%, #c084fc 100%) !important;\r\n  color: #ffffff !important;\r\n  font-weight: 800 !important;\r\n  font-size: 0.85rem !important;\r\n  cursor: pointer !important;\r\n  box-shadow: 0 0 16px rgba(168, 85, 247, 0.4) !important;\r\n  transition: all 0.2s ease !important;\r\n}\r\n\r\n.nexus-inpage-btn-save:hover {\r\n  box-shadow: 0 0 24px rgba(192, 132, 252, 0.7) !important;\r\n  transform: translateY(-1px) !important;\r\n}\r\n\r\n/* SELETOR DUAL NO MODAL IN-PAGE */\r\n.nexus-inpage-engine-modes {\r\n  display: flex !important;\r\n  flex-direction: column !important;\r\n  gap: 10px !important;\r\n  margin-top: 8px !important;\r\n}\r\n\r\n.nexus-inpage-engine-option {\r\n  display: flex !important;\r\n  align-items: flex-start !important;\r\n  gap: 12px !important;\r\n  padding: 10px 14px !important;\r\n  border-radius: 10px !important;\r\n  border: 1px solid rgba(255, 255, 255, 0.12) !important;\r\n  background: rgba(15, 23, 42, 0.5) !important;\r\n  cursor: pointer !important;\r\n  transition: all 0.22s ease !important;\r\n  user-select: none !important;\r\n}\r\n\r\n.nexus-inpage-engine-option:hover {\r\n  background: rgba(30, 41, 59, 0.65) !important;\r\n  border-color: rgba(255, 255, 255, 0.2) !important;\r\n  transform: translateY(-1px) !important;\r\n}\r\n\r\n.nexus-inpage-engine-radio {\r\n  width: 18px !important;\r\n  height: 18px !important;\r\n  border-radius: 50% !important;\r\n  border: 2px solid #64748b !important;\r\n  display: flex !important;\r\n  align-items: center !important;\r\n  justify-content: center !important;\r\n  flex-shrink: 0 !important;\r\n  margin-top: 2px !important;\r\n  transition: all 0.2s ease !important;\r\n}\r\n\r\n.nexus-inpage-radio-dot {\r\n  width: 8px !important;\r\n  height: 8px !important;\r\n  border-radius: 50% !important;\r\n  background: transparent !important;\r\n  transition: all 0.2s ease !important;\r\n}\r\n\r\n.nexus-inpage-engine-opt-title {\r\n  font-size: 0.84rem !important;\r\n  font-weight: 700 !important;\r\n  color: #f1f5f9 !important;\r\n  transition: color 0.2s ease !important;\r\n}\r\n\r\n.nexus-inpage-engine-opt-desc {\r\n  font-size: 0.74rem !important;\r\n  color: #94a3b8 !important;\r\n  line-height: 1.3 !important;\r\n  margin-top: 2px !important;\r\n}\r\n\r\n/* Modo Portable Ativo (Roxo Oficial) */\r\n.nexus-inpage-engine-option.mode-portable.active {\r\n  background: rgba(168, 85, 247, 0.12) !important;\r\n  border-color: rgba(168, 85, 247, 0.6) !important;\r\n  box-shadow: 0 0 16px rgba(168, 85, 247, 0.25) !important;\r\n}\r\n\r\n.nexus-inpage-engine-option.mode-portable.active .nexus-inpage-engine-radio {\r\n  border-color: #c084fc !important;\r\n  box-shadow: 0 0 8px rgba(192, 132, 252, 0.6) !important;\r\n}\r\n\r\n.nexus-inpage-engine-option.mode-portable.active .nexus-inpage-radio-dot {\r\n  background: #c084fc !important;\r\n}\r\n\r\n.nexus-inpage-engine-option.mode-portable.active .nexus-inpage-engine-opt-title {\r\n  color: #e9d5ff !important;\r\n}\r\n\r\n/* Modo Extensão Ativo (Verde Esmeralda) */\r\n.nexus-inpage-engine-option.mode-extension.active {\r\n  background: rgba(16, 185, 129, 0.12) !important;\r\n  border-color: rgba(16, 185, 129, 0.6) !important;\r\n  box-shadow: 0 0 16px rgba(16, 185, 129, 0.25) !important;\r\n}\r\n\r\n.nexus-inpage-engine-option.mode-extension.active .nexus-inpage-engine-radio {\r\n  border-color: #34d399 !important;\r\n  box-shadow: 0 0 8px rgba(52, 211, 153, 0.6) !important;\r\n}\r\n\r\n.nexus-inpage-engine-option.mode-extension.active .nexus-inpage-radio-dot {\r\n  background: #34d399 !important;\r\n}\r\n\r\n.nexus-inpage-engine-option.mode-extension.active .nexus-inpage-engine-opt-title {\r\n  color: #a7f3d0 !important;\r\n}\r\n\r\n/* Efeito highlight quando direcionado para configurar pasta */\r\n@keyframes nexusPulseGlow {\r\n  0% { box-shadow: 0 0 0 0 rgba(0, 242, 254, 0.7); }\r\n  50% { box-shadow: 0 0 22px 6px rgba(0, 242, 254, 0.6); }\r\n  100% { box-shadow: 0 0 0 0 rgba(0, 242, 254, 0); }\r\n}\r\n\r\n.nexus-highlight-pulse {\r\n  animation: nexusPulseGlow 1.4s ease-out !important;\r\n  border-color: #00f2fe !important;\r\n}\r\n\r\n/* ============================================================\r\n   ARVORE DE PASTAS SELECIONAVEIS (GOOGLE DRIVE / MULTI-PASTAS)\r\n   ============================================================ */\r\n.nexus-folder-node {\r\n  display: flex !important;\r\n  flex-direction: column !important;\r\n  gap: 6px !important;\r\n  width: 100% !important;\r\n}\r\n\r\n.nexus-folder-header {\r\n  display: flex !important;\r\n  align-items: center !important;\r\n  justify-content: space-between !important;\r\n  gap: 10px !important;\r\n  padding: 9px 12px !important;\r\n  background: rgba(15, 23, 42, 0.78) !important;\r\n  border: 1px solid rgba(56, 189, 248, 0.22) !important;\r\n  border-radius: 10px !important;\r\n  cursor: pointer !important;\r\n  transition: background 0.18s ease, border-color 0.18s ease !important;\r\n}\r\n\r\n.nexus-folder-header:hover {\r\n  background: rgba(30, 41, 59, 0.88) !important;\r\n  border-color: rgba(0, 242, 254, 0.5) !important;\r\n}\r\n\r\n.nexus-folder-header-left {\r\n  display: flex !important;\r\n  align-items: center !important;\r\n  gap: 8px !important;\r\n  flex: 1 1 auto !important;\r\n  min-width: 0 !important;\r\n}\r\n\r\n.nexus-folder-chevron {\r\n  display: inline-flex !important;\r\n  align-items: center !important;\r\n  justify-content: center !important;\r\n  color: #38bdf8 !important;\r\n  flex-shrink: 0 !important;\r\n  transition: transform 0.2s ease !important;\r\n}\r\n\r\n.nexus-folder-node.collapsed > .nexus-folder-header .nexus-folder-chevron {\r\n  transform: rotate(-90deg) !important;\r\n}\r\n\r\n.nexus-folder-name {\r\n  font-size: 0.84rem !important;\r\n  font-weight: 700 !important;\r\n  color: #f8fafc !important;\r\n  overflow: hidden !important;\r\n  text-overflow: ellipsis !important;\r\n  white-space: nowrap !important;\r\n  min-width: 0 !important;\r\n}\r\n\r\n.nexus-folder-badge {\r\n  background: rgba(0, 242, 254, 0.12) !important;\r\n  color: #38bdf8 !important;\r\n  border: 1px solid rgba(56, 189, 248, 0.3) !important;\r\n  font-size: 0.7rem !important;\r\n  font-weight: 700 !important;\r\n  padding: 2px 8px !important;\r\n  border-radius: 999px !important;\r\n  white-space: nowrap !important;\r\n  flex-shrink: 0 !important;\r\n}\r\n\r\n.nexus-folder-children {\r\n  display: flex !important;\r\n  flex-direction: column !important;\r\n  gap: 6px !important;\r\n  padding-left: 16px !important;\r\n  margin-left: 10px !important;\r\n  border-left: 1.5px solid rgba(56, 189, 248, 0.25) !important;\r\n}\r\n\r\n.nexus-folder-node.collapsed > .nexus-folder-children {\r\n  display: none !important;\r\n}\r\n";

  // Shadow DOM Encapsulation Engine (Isolamento total e definitivo de estilos e eventos)
  let _nexusShadowRoot = null;

  function getNexusShadowRoot() {
    if (_nexusShadowRoot && _nexusShadowRoot.isConnected) {
      return _nexusShadowRoot;
    }
    let host = document.getElementById('nexus-shadow-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'nexus-shadow-host';
      host.setAttribute('dir', 'ltr');
      host.style.cssText = 'all: initial !important; display: contents !important;';

      // Impede propagacao de cliques na extensao para a pagina hospedeira no BUBBLING (sem bloquear cliques internos)
      ['click', 'mouseup', 'contextmenu'].forEach(evtType => {
        host.addEventListener(evtType, (e) => {
          e.stopPropagation();
        }, false);
      });

      _nexusShadowRoot = host.attachShadow({ mode: 'open' });

      // Injeta estilos oficiais de forma 100% sincronica no Shadow Root
      const style = document.createElement('style');
      style.id = 'nexus-shadow-style';
      style.textContent = NEXUS_INLINE_CSS;
      _nexusShadowRoot.appendChild(style);

      // Fallback: carregar link stylesheet caso suportado
      try {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = chrome.runtime.getURL('content.css');
        _nexusShadowRoot.appendChild(link);
      } catch (e) {}

      const mountPoint = document.documentElement || document.body;
      if (mountPoint) {
        mountPoint.appendChild(host);
      }
    } else {
      _nexusShadowRoot = host.shadowRoot;
    }
    return _nexusShadowRoot;
  }

  function getNexusRootElement(id) {
    const root = getNexusShadowRoot();
    if (root) {
      const el = root.getElementById(id);
      if (el) return el;
    }
    return document.getElementById(id);
  }

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

    // 1. Se há downloads ativos ou em espera no gerenciador
    if (downloadingItems.length > 0) {
      let sessionCompleted = currentBatchState.completedCount || 0;
      if (currentBatchState.active) {
        const finishedInBatch = (currentDownloadItems || []).filter(i =>
          i.status === 'completed' && (
            currentBatchState.itemIds.has(String(i.id)) ||
            (i.name && currentBatchState.itemNames.has(String(i.name).toLowerCase().trim())) ||
            (i.url && currentBatchState.itemUrls.has(String(i.url)))
          )
        ).length;
        sessionCompleted = Math.max(sessionCompleted, finishedInBatch);
        currentBatchState.completedCount = sessionCompleted;
      }

      const totalActive = Math.max(currentBatchState.total || 0, downloadingItems.length + sessionCompleted);
      let sumProgress = sessionCompleted * 100;
      downloadingItems.forEach(item => {
        sumProgress += (item.progress || 0);
      });
      const pct = totalActive > 0 ? Math.min(99, Math.round(sumProgress / totalActive)) : 0;

      return {
        completed: sessionCompleted,
        total: totalActive,
        pct: pct,
        isFinished: false,
        activeCount: downloadingItems.length
      };
    }

    // 2. Se o lote recém-iniciado foi concluído com sucesso
    if (currentBatchState.active && currentBatchState.total > 0 && currentBatchState.completedCount >= currentBatchState.total) {
      return {
        completed: currentBatchState.total,
        total: currentBatchState.total,
        pct: 100,
        isFinished: true,
        activeCount: 0
      };
    }

    // 3. Em repouso (aguardando início de download)
    // NUNCA usa o histórico antigo de downloads concluídos do PC para exibir 100% incorretamente
    const pendingTotal = detectedFiles ? detectedFiles.length : 0;
    return {
      completed: 0,
      total: pendingTotal,
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
    // 2. Filester (deve preceder Bunkr para evitar falso-positivo em .cdn.cr)
    if (service === 'Filester' || url.includes('filester.sh') || url.includes('filester.me') || url.includes('fsc2.cdn.cr')) {
      return { text: 'Filester', bg: 'rgba(56, 189, 248, 0.18)', color: '#38bdf8', border: 'rgba(56, 189, 248, 0.4)' };
    }
    // 3. MegaUp
    if (service === 'MegaUp' || url.includes('megaup.net')) {
      return { text: 'MegaUp', bg: 'rgba(168, 85, 247, 0.18)', color: '#c084fc', border: 'rgba(168, 85, 247, 0.4)' };
    }
    // 4. Bunkr (ignora URLs de Filester que terminam em cdn.cr)
    if (service === 'Bunkr' || url.includes('bunkr') || url.includes('balbums') || (url.includes('.cdn.cr') && !url.includes('fsc2.cdn.cr'))) {
      return { text: 'Bunkr', bg: 'rgba(99, 102, 241, 0.18)', color: '#818cf8', border: 'rgba(99, 102, 241, 0.4)' };
    }
    // 5. TeraBox
    if (service === 'TeraBox' || url.includes('terabox') || url.includes('1024tera') || url.includes('freeterabox') || url.includes('gibibox') || url.includes('4funbox')) {
      return { text: 'TeraBox', bg: 'rgba(255, 170, 0, 0.18)', color: '#ffb703', border: 'rgba(255, 170, 0, 0.4)' };
    }
    // 6. MediaFire
    if (service === 'MediaFire' || url.includes('mediafire.com')) {
      return { text: 'MediaFire', bg: 'rgba(6, 182, 212, 0.18)', color: '#38bdf8', border: 'rgba(6, 182, 212, 0.4)' };
    }
    // 7. Microsoft OneDrive
    if (service === 'Microsoft OneDrive' || url.includes('onedrive') || url.includes('1drv.ms') || url.includes('sharepoint')) {
      return { text: 'Microsoft OneDrive', bg: 'rgba(255, 255, 255, 0.18)', color: '#ffffff', border: 'rgba(255, 255, 255, 0.4)' };
    }
    // 8. Send
    if (service === 'Send' || url.includes('send.now') || url.includes('send.cm') || url.includes('sendit.cloud')) {
      return { text: 'Send', bg: 'rgba(236, 72, 153, 0.18)', color: '#f472b6', border: 'rgba(236, 72, 153, 0.4)' };
    }
    // 9. PixelDrain
    if (service === 'PixelDrain' || url.includes('pixeldrain.com')) {
      return { text: 'PixelDrain', bg: 'rgba(249, 115, 22, 0.18)', color: '#fb923c', border: 'rgba(249, 115, 22, 0.4)' };
    }
    // 10. Drime Cloud
    if (service === 'Drime Cloud' || url.includes('drime.cloud')) {
      return { text: 'Drime Cloud', bg: 'rgba(16, 185, 129, 0.18)', color: '#34d399', border: 'rgba(16, 185, 129, 0.4)' };
    }
    // 11. Turbo.cr
    if (service === 'Turbo.cr' || url.includes('turbo.cr') || url.includes('turbocdn.st')) {
      return { text: 'Turbo.cr', bg: 'rgba(244, 63, 94, 0.18)', color: '#fb7185', border: 'rgba(244, 63, 94, 0.4)' };
    }
    // 12. Vik1ngFile
    if (service === 'Vik1ngFile' || url.includes('vik1ngfile') || url.includes('vikingfile')) {
      return { text: 'Vik1ngFile', bg: 'rgba(168, 85, 247, 0.18)', color: '#c084fc', border: 'rgba(168, 85, 247, 0.4)' };
    }
    // 13. GoFile
    if (service === 'GoFile' || url.includes('gofile.io') || url.includes('gofile')) {
      return { text: 'GoFile', bg: 'rgba(59, 130, 246, 0.18)', color: '#60a5fa', border: 'rgba(59, 130, 246, 0.4)' };
    }
    // 14. Torbox
    if (service === 'Torbox' || url.includes('tb-cdn') || url.includes('torbox')) {
      return { text: 'Torbox', bg: 'rgba(139, 92, 246, 0.18)', color: '#a78bfa', border: 'rgba(139, 92, 246, 0.4)' };
    }
    // 14.5. PlayStation CDN
    if (service === 'PlayStation' || url.includes('dl.playstation.net') || url.includes('playstation.net')) {
      return { text: 'PlayStation', bg: 'rgba(0, 112, 209, 0.22)', color: '#60a5fa', border: 'rgba(0, 112, 209, 0.5)' };
    }
    // 15. MEGA
    if (service === 'MEGA' || url.includes('mega.nz') || url.includes('mega.co.nz') || url.includes('mega.io')) {
      return { text: 'MEGA', bg: 'rgba(239, 68, 68, 0.18)', color: '#f87171', border: 'rgba(239, 68, 68, 0.4)' };
    }
    // 16. 1Fichier
    if (service === '1Fichier' || url.includes('1fichier.com')) {
      return { text: '1Fichier', bg: 'rgba(99, 102, 241, 0.18)', color: '#818cf8', border: 'rgba(99, 102, 241, 0.4)' };
    }
    // 17. RapidGator
    if (service === 'RapidGator' || service === 'Rapidgator' || url.includes('rapidgator.net') || url.includes('rg.to')) {
      return { text: 'RapidGator', bg: 'rgba(234, 88, 12, 0.18)', color: '#fb923c', border: 'rgba(234, 88, 12, 0.4)' };
    }
    // 17.5. FileDitch
    if (service === 'FileDitch' || service === 'fileditch' || url.includes('fileditch') || url.includes('blehpooffileditchvids')) {
      return { text: 'FileDitch', bg: 'rgba(14, 165, 233, 0.18)', color: '#38bdf8', border: 'rgba(14, 165, 233, 0.4)' };
    }
    // 17.6. DataNodes
    if (service === 'DataNodes' || service === 'datanodes' || url.includes('datanodes.to') || url.includes('datanodes.')) {
      return { text: 'DataNodes', bg: 'rgba(59, 130, 246, 0.18)', color: '#60a5fa', border: 'rgba(59, 130, 246, 0.4)' };
    }
    // 17.7. FileKeeper
    if (service === 'FileKeeper' || service === 'filekeeper' || url.includes('filekeeper.net') || url.includes('filekeeper.')) {
      return { text: 'FileKeeper', bg: 'rgba(16, 185, 129, 0.18)', color: '#34d399', border: 'rgba(16, 185, 129, 0.4)' };
    }
    // 18. Sites Genéricos
    if (service === 'Sites Genéricos' || service === 'generic' || service === 'Sites Genericos') {
      return { text: 'Sites Genéricos', bg: 'rgba(148, 163, 184, 0.18)', color: '#cbd5e1', border: 'rgba(148, 163, 184, 0.4)' };
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
    if (!hostName) hostName = 'Sites Genéricos';
    return { text: hostName, bg: 'rgba(148, 163, 184, 0.18)', color: '#cbd5e1', border: 'rgba(148, 163, 184, 0.4)' };
  }

  function getActionBtnText() {
    const isBrowser = currentSettings.downloadOnlyViaExtension === true || currentSettings.downloadEngine === 'browser';
    return isBrowser ? 'Iniciar Download' : 'Baixar pelo Nexus Downloader';
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

    // Monitorar navegacao SPA (ex: Google Drive abrindo subpastas sem reload)
    const handleSpaNav = () => {
      if (window.location.href !== lastScannedUrl) {
        lastScannedUrl = window.location.href;
        detectedFiles = [];
        selectedItemIds.clear();
        expandedExtFolders.clear();
        initializedFolderTreeKey = '';
        updateHudInitialStats();
        scanPage();
      }
    };
    window.addEventListener('popstate', handleSpaNav);
    window.addEventListener('hashchange', handleSpaNav);
    if (window.location.hostname.toLowerCase().includes('drive.google.com')) {
      setInterval(handleSpaNav, 1200);
    }
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
    const btnModal = (getNexusShadowRoot() ? getNexusShadowRoot().querySelector('#nexus-btn-confirm-download') : null) || document.querySelector('#nexus-btn-confirm-download');
    if (btnModal) {
      btnModal.innerText = getActionBtnText();
    }
  }

  // Listener para mensagens do popup ou background
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'TRIGGER_MEGAUP_DOWNLOAD') {
      const ok = triggerMegaUpFinalDownload();
      sendResponse({ success: ok });
      return;
    }
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
    const existing = getNexusRootElement('nexus-bridge-offline-toast');
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
        <button type="button" id="nexus-toast-close" style="background:transparent; border:none; color:#94a3b8; font-size:1.1rem; cursor:pointer; padding:2px 6px; line-height:1; display:flex; align-items:center;"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
      <div style="font-size:0.83rem; color:#cbd5e1; line-height:1.4;">
        ${message || 'O download é processado exclusivamente pelo motor do <strong>Nexus Portable PC</strong>. Abra o aplicativo desktop no Windows para iniciar os downloads.'}
      </div>
    `;
    getNexusShadowRoot().appendChild(toast);
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
      host.includes('vik1ngfile') ||
      host.includes('vikingfile') ||
      host.includes('mediafire.com') ||
      host.includes('send.cm') ||
      host.includes('send.now') ||
      host.includes('terabox') ||
      host.includes('1024tera') ||
      host.includes('freeterabox') ||
      host.includes('gibibox') ||
      host.includes('4funbox') ||
      host.includes('turbo.cr') ||
      host.includes('drime.cloud') ||
      host.includes('1fichier.com') ||
      host.includes('mega.nz') ||
      host.includes('mega.co.nz') ||
      host.includes('mega.io') ||
      host.includes('megaup.net') ||
      host.includes('filester') ||
      host.includes('fileditch') ||
      host.includes('blehpooffileditchvids') ||
      host.includes('datanodes.to') ||
      host.includes('datanodes') ||
      host.includes('filekeeper.net') ||
      host.includes('filekeeper') ||
      host.includes('rapidgator.net') ||
      host.includes('rg.to') ||
      host.includes('onedrive') ||
      host.includes('1drv.ms') ||
      host.includes('sharepoint');

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
    else if (host.includes('terabox') || host.includes('1024tera') || host.includes('freeterabox') || host.includes('gibibox') || host.includes('4funbox')) downloadProgressState.service = 'TeraBox';
    else if (host.includes('vik1ngfile') || host.includes('vikingfile')) downloadProgressState.service = 'Vik1ngFile';
    else if (host.includes('1fichier.com')) downloadProgressState.service = '1Fichier';
    else if (host.includes('mega.nz') || host.includes('mega.co.nz') || host.includes('mega.io')) downloadProgressState.service = 'MEGA';
    else if (host.includes('filester')) downloadProgressState.service = 'Filester';
    else if (host.includes('fileditch') || host.includes('blehpooffileditchvids')) downloadProgressState.service = 'FileDitch';
    else if (host.includes('datanodes')) downloadProgressState.service = 'DataNodes';
    else if (host.includes('filekeeper')) downloadProgressState.service = 'FileKeeper';
    else if (host.includes('megaup.net')) downloadProgressState.service = 'MegaUp';
    else if (host.includes('rapidgator') || host.includes('rg.to')) downloadProgressState.service = 'RapidGator';
    else if (host.includes('send.cm') || host.includes('send.now')) downloadProgressState.service = 'Send';
    else if (host.includes('turbo.cr')) downloadProgressState.service = 'Turbo.cr';
    else if (host.includes('drime.cloud')) downloadProgressState.service = 'Drime Cloud';
    else if (hasTorrents) downloadProgressState.service = 'Torbox';
    else downloadProgressState.service = 'Sites Genéricos';

    let found = [];
    const seenUrls = new Set();

    function extractMediaFireDirectUrlFromBtn(btn) {
      if (!btn) return null;
      const scrambled = btn.getAttribute('data-scrambled-url');
      if (scrambled) {
        try {
          const decoded = atob(scrambled.trim()).trim();
          if (decoded && decoded.startsWith('http') && !decoded.includes('/file/') && !decoded.includes('/folder/')) {
            return decoded;
          }
        } catch (e) {}
      }
      const href = btn.getAttribute('href') || btn.href || '';
      if (href && href.startsWith('http') && !href.includes('#') && !href.includes('/file/') && !href.includes('/folder/')) {
        return href;
      }
      return null;
    }

    function extractMediaFireKeyFromUrl(urlStr) {
      if (!urlStr) return null;
      const m = urlStr.match(/\/(?:file|file_premium|download|view|listen|watch)\/([a-zA-Z0-9]+)/i);
      if (m && m[1]) return m[1];
      try {
        const uObj = new URL(urlStr);
        if (uObj.search && uObj.search.length > 1) {
          const k = uObj.search.slice(1).split('&')[0].split('=')[0].trim();
          if (/^[a-zA-Z0-9]{10,25}$/.test(k)) return k;
        }
      } catch (e) {}
      return null;
    }

    // 1. Scanner Autônomo Client-Side para MediaFire
    if (host.includes('mediafire.com')) {
      // Caso A: Pasta do MediaFire (/folder/key)
      const folderMatch = url.match(/\/folder\/([a-zA-Z0-9,_-]+)/i);
      if (folderMatch && folderMatch[1]) {
        const folderKeys = folderMatch[1].split(',').filter(Boolean);
        for (const folderKey of folderKeys) {
          try {
            let folderTitle = 'MediaFire_Downloads';
            try {
              const infoRes = await fetch(`https://www.mediafire.com/api/1.4/folder/get_info.php?folder_key=${encodeURIComponent(folderKey)}&response_format=json`);
              if (infoRes.ok) {
                const infoJson = await infoRes.json();
                if (infoJson?.response?.folder_info?.name) {
                  folderTitle = sanitizeExtSegment(infoJson.response.folder_info.name);
                }
              }
            } catch (e) {}

            let chunk = 1;
            let moreChunks = true;
            while (moreChunks) {
              const res = await fetch(`https://www.mediafire.com/api/1.4/folder/get_content.php?folder_key=${encodeURIComponent(folderKey)}&content_type=files&chunk=${chunk}&response_format=json`);
              if (!res.ok) break;
              const data = await res.json();
              const mfFiles = data?.response?.folder_content?.files || [];
              mfFiles.forEach(f => {
                const fileUrl = f.links?.normal_download || `https://www.mediafire.com/file/${f.quickkey}/${encodeURIComponent(f.filename || 'file')}/file`;
                seenUrls.add(fileUrl);
                const sz = parseInt(f.size, 10) || 0;
                const fName = f.filename || 'arquivo';
                found.push({
                  id: `mediafire_${f.quickkey}`,
                  fileId: `mf_${f.quickkey}`,
                  numericId: f.quickkey,
                  url: fileUrl,
                  sourceUrl: fileUrl,
                  mediafireUrl: fileUrl,
                  directUrl: '',
                  downloadUrl: '',
                  filename: fName,
                  name: fName,
                  size: sz,
                  sizeFormatted: formatBytes(sz),
                  folderName: folderTitle,
                  folderPath: folderTitle,
                  relativePath: `${folderTitle}/${fName}`,
                  preserveRelativePath: true,
                  service: 'MediaFire',
                  type: getFileType(fName)
                });
              });
              moreChunks = data?.response?.folder_content?.more_chunks === 'yes';
              chunk++;
            }
          } catch (err) {
            console.warn('[Content] Erro na varredura de pasta MediaFire:', err);
          }
        }
      } else {
        // Caso B: Arquivo único MediaFire (/file/key, /?key, /download/key) ou botão na página
        const mfKey = extractMediaFireKeyFromUrl(url);
        const dlBtn = document.querySelector('#downloadButton') || document.querySelector('a[data-scrambled-url]') || document.querySelector('a.popsok') || document.querySelector('a[aria-label="Download file"]');
        const directHref = extractMediaFireDirectUrlFromBtn(dlBtn);
        const nameEl = document.querySelector('.dl-btn-label') || document.querySelector('.filename') || document.querySelector('.file_name');
        const fileName = nameEl ? (nameEl.getAttribute('title') || nameEl.innerText.trim()) : document.title.replace(/\s*[-|]\s*MediaFire.*/i, '').trim() || 'arquivo';

        if (dlBtn || mfKey) {
          seenUrls.add(directHref || url);
          found.push({
            id: mfKey ? `mediafire_${mfKey}` : 'mf-current',
            fileId: mfKey ? `mf_${mfKey}` : null,
            numericId: mfKey,
            url: url,
            sourceUrl: url,
            mediafireUrl: url,
            directUrl: directHref || '',
            downloadUrl: directHref || '',
            filename: fileName,
            name: fileName,
            service: 'MediaFire',
            type: getFileType(fileName)
          });
        }
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

    // 2.5 Scanner Client-Side para 1Fichier (Diretórios e Arquivos Únicos)
    if (host.includes('1fichier.com')) {
      if (url.includes('/dir/')) {
        const rows = document.querySelectorAll('tr');
        rows.forEach(r => {
          const link = r.querySelector('a[href*="1fichier.com/?"]');
          if (link && link.href && !seenUrls.has(link.href)) {
            seenUrls.add(link.href);
            const name = link.innerText.trim() || '1fichier_file';
            const sizeTd = r.querySelectorAll('td')[1];
            const sizeTxt = sizeTd ? sizeTd.innerText.trim() : '';
            found.push({
              url: link.href,
              downloadUrl: link.href,
              directUrl: link.href,
              filename: name,
              sizeFormatted: sizeTxt,
              service: '1Fichier',
              type: getFileType(name)
            });
          }
        });
      } else {
        let name = '';
        const tierNameEl = document.querySelector('.tier-name');
        if (tierNameEl && tierNameEl.innerText.trim()) {
          name = tierNameEl.innerText.trim();
        }
        if (!name) {
          const allTds = Array.from(document.querySelectorAll('td.normal, td'));
          for (let i = 0; i < allTds.length; i++) {
            const txt = allTds[i].innerText.trim();
            if ((txt.includes('Nom du fichier') || txt.includes('Filename')) && allTds[i + 1]) {
              name = allTds[i + 1].innerText.trim();
              break;
            }
          }
        }
        if (!name) {
          name = (document.title || '').replace(/1fichier\.com:?\s*/i, '').trim();
          if (name.toLowerCase().includes('cloud storage') || name.length < 2) {
            const urlMatch = url.match(/1fichier\.com\/(?:\?|)([a-zA-Z0-9_-]+)/i);
            const fid = urlMatch ? urlMatch[1] : '';
            name = fid ? `1fichier_${fid}.bin` : '1fichier_file';
          }
        }

        let sizeFormatted = '';
        const tierFeatEl = document.querySelector('.tier-feat');
        if (tierFeatEl && tierFeatEl.innerText.trim()) {
          sizeFormatted = tierFeatEl.innerText.trim();
        }
        if (!sizeFormatted) {
          const allTds = Array.from(document.querySelectorAll('td.normal, td'));
          for (let i = 0; i < allTds.length; i++) {
            const txt = allTds[i].innerText.trim();
            if ((txt.includes('Taille') || txt.includes('Size')) && allTds[i + 1]) {
              sizeFormatted = allTds[i + 1].innerText.trim();
              break;
            }
          }
        }

        if (!seenUrls.has(url)) {
          seenUrls.add(url);
          found.push({
            url: url,
            downloadUrl: url,
            directUrl: url,
            filename: name,
            sizeFormatted: sizeFormatted,
            service: '1Fichier',
            type: getFileType(name)
          });
        }
      }
    }

    // 2.6 Scanner Client-Side para MegaUp
    if (host.includes('megaup.net')) {
      let fileName = '';
      let fileSize = 0;
      let fileSizeFormatted = '';
      const thStrong = document.querySelector('th.responsiveInfoTable strong, .responsiveInfoTable strong, table strong');
      if (thStrong) {
        const text = thStrong.innerText.trim();
        const sizeMatch = text.match(/\(([\d\.]+)\s*(MB|GB|KB)\)/i);
        if (sizeMatch) {
          const num = parseFloat(sizeMatch[1]);
          const unit = sizeMatch[2].toUpperCase();
          const mult = unit === 'GB' ? 1073741824 : unit === 'MB' ? 1048576 : 1024;
          fileSize = Math.round(num * mult);
          fileSizeFormatted = `${sizeMatch[1]} ${unit}`;
          fileName = text.replace(/\s*\([\d\.]+\s*(?:MB|GB|KB)\)/i, '').trim();
        } else {
          fileName = text;
        }
      }
      if (!fileName) {
        fileName = document.title.replace(/[-_] MegaUp.*/i, '').trim() || 'arquivo.rar';
      }
      let directUrl = '';
      const megaUpBtn = document.querySelector('a[href*="download.megaup.net/?url="]') || document.querySelector('a.btn[href*="download.megaup"]');
      if (megaUpBtn && megaUpBtn.href) {
        directUrl = megaUpBtn.href;
      } else {
        const allHtml = (document.documentElement ? document.documentElement.innerHTML : '') + ' ' + (document.body ? document.body.innerHTML : '');
        const m = allHtml.match(/https?:\/\/download\.megaup\.net\/\?url=[^\s"'<>]+/i);
        if (m && m[0]) {
          directUrl = m[0].replace(/&amp;/g, '&');
        } else {
          for (const s of Array.from(document.scripts || [])) {
            const scText = s.textContent || s.innerText || '';
            const sm = scText.match(/https?:\/\/download\.megaup\.net\/\?url=[^\s"'<>]+/i);
            if (sm && sm[0]) {
              directUrl = sm[0].replace(/&amp;/g, '&');
              break;
            }
          }
        }
      }
      const targetUrl = directUrl || window.location.href;
      if (!seenUrls.has(targetUrl)) {
        seenUrls.add(targetUrl);
        found.push({
          url: targetUrl,
          downloadUrl: targetUrl,
          directUrl: targetUrl,
          filename: fileName,
          size: fileSize,
          sizeFormatted: fileSizeFormatted || (fileSize ? formatBytes(fileSize) : ''),
          service: 'MegaUp',
          type: getFileType(fileName),
          cookieHeader: document.cookie || ''
        });
      }

      // Bypass instantâneo do timer de 5s no próprio DOM do MegaUp
      if (directUrl) {
        try {
          const timerDiv = document.querySelector('.download-timer');
          if (timerDiv) {
            timerDiv.style.display = 'block';
            if (!timerDiv.querySelector('a')) {
              timerDiv.innerHTML = `<a class="btn btn--primary" id="nexus-megaup-btn" href="${directUrl}" style="display:inline-block !important; padding:12px 28px !important; background:linear-gradient(135deg, #00f2fe 0%, #4facfe 100%) !important; color:#060810 !important; font-weight:800 !important; border-radius:10px !important; text-decoration:none !important; box-shadow:0 4px 15px rgba(0,242,254,0.4) !important;">Baixar Agora (Nexus - Sem Espera)</a>`;
            }
          }
          const freeElem = document.querySelector('.btn-free-element');
          if (freeElem) freeElem.style.display = 'none';
        } catch (eBypass) {}
      }

      if (!megaUpBtn || !directUrl) {
        const checkMegaUpBtnInterval = setInterval(() => {
          const btn = document.querySelector('a[href*="download.megaup.net/?url="]') || document.querySelector('a.btn[href*="download.megaup"]');
          let foundUrl = (btn && btn.href) ? btn.href : null;
          if (!foundUrl) {
            const scM = (document.body ? document.body.innerHTML : '').match(/https?:\/\/download\.megaup\.net\/\?url=[^\s"'<>]+/i);
            if (scM && scM[0]) foundUrl = scM[0].replace(/&amp;/g, '&');
          }
          if (foundUrl) {
            clearInterval(checkMegaUpBtnInterval);
            detectedFiles.forEach(f => {
              if (f.service === 'MegaUp') {
                f.url = foundUrl;
                f.downloadUrl = foundUrl;
                f.directUrl = foundUrl;
              }
            });
            try {
              const timerDiv = document.querySelector('.download-timer');
              if (timerDiv) {
                timerDiv.style.display = 'block';
                if (!timerDiv.querySelector('a')) {
                  timerDiv.innerHTML = `<a class="btn btn--primary" id="nexus-megaup-btn" href="${foundUrl}" style="display:inline-block !important; padding:12px 28px !important; background:linear-gradient(135deg, #00f2fe 0%, #4facfe 100%) !important; color:#060810 !important; font-weight:800 !important; border-radius:10px !important; text-decoration:none !important; box-shadow:0 4px 15px rgba(0,242,254,0.4) !important;">Baixar Agora (Nexus - Sem Espera)</a>`;
                }
              }
              const freeElem = document.querySelector('.btn-free-element');
              if (freeElem) freeElem.style.display = 'none';
            } catch (eBypass) {}
          }
        }, 500);
        setTimeout(() => clearInterval(checkMegaUpBtnInterval), 10000);
      }
    }

    // 2.63 Scanner Client-Side para PixelDrain List / Album (/l/id)
    if (host.includes('pixeldrain.com') && url.includes('/l/')) {
      const listMatch = url.match(/\/l\/([a-zA-Z0-9_-]+)/i);
      if (listMatch && listMatch[1]) {
        const listId = listMatch[1];
        try {
          const res = await fetch(`https://pixeldrain.com/api/list/${listId}`);
          if (res.ok) {
            const data = await res.json();
            const pdFiles = data?.files || [];
            pdFiles.forEach(f => {
              const fileUrl = `https://pixeldrain.com/u/${f.id}`;
              if (!seenUrls.has(fileUrl)) {
                seenUrls.add(fileUrl);
                const sz = parseInt(f.size, 10) || 0;
                let fname = f.name || `pixeldrain_${f.id}`;
                if (!/\.[a-zA-Z0-9]{2,5}$/.test(fname) && f.mime_type) {
                  const mExt = getExtensionFromMime(f.mime_type);
                  if (mExt) fname = `${fname}${mExt}`;
                }
                found.push({
                  id: f.id,
                  url: fileUrl,
                  directUrl: `https://pixeldrain.com/api/file/${f.id}`,
                  downloadUrl: fileUrl,
                  filename: fname,
                  size: sz,
                  sizeFormatted: formatBytes(sz),
                  service: 'PixelDrain',
                  type: getFileType(fname)
                });
              }
            });
          }
        } catch (e) {}
      }
    }

    // 2.65 Scanner Client-Side para Filester (Pastas /f/ e Arquivos /d/)
    if (host.includes('filester')) {
      if (url.includes('/f/')) {
        const items = document.querySelectorAll('.file-item, [onclick*="/d/"]');
        items.forEach(el => {
          let slug = '';
          const onclickAttr = el.getAttribute('onclick') || '';
          const slugMatch = onclickAttr.match(/\/d\/([a-zA-Z0-9_-]+)/i);
          if (slugMatch) slug = slugMatch[1];
          if (!slug && el.href) {
            const hrefMatch = el.href.match(/\/d\/([a-zA-Z0-9_-]+)/i);
            if (hrefMatch) slug = hrefMatch[1];
          }
          if (slug) {
            const fileUrl = `${window.location.origin}/d/${slug}`;
            if (!seenUrls.has(fileUrl)) {
              seenUrls.add(fileUrl);
              const nameEl = el.querySelector('.file-name, p');
              const name = nameEl ? nameEl.innerText.trim() : `filester_${slug}`;
              const sizeEl = el.querySelector('.file-size, span');
              const sizeText = sizeEl ? sizeEl.innerText.trim() : '';
              found.push({
                id: slug,
                url: fileUrl,
                directUrl: fileUrl,
                downloadUrl: fileUrl,
                filename: name,
                size: 0,
                sizeFormatted: sizeText || 'Calculando...',
                service: 'Filester',
                type: getFileType(name)
              });
            }
          }
        });
      } else {
        let fileName = '';
        let fileSize = 0;
        let fileSizeFormatted = '';
        const nameEl = document.querySelector('h1, h2, .file-name, [class*="filename"]');
        if (nameEl && nameEl.innerText.trim()) {
          fileName = nameEl.innerText.trim();
        }
        const sizeEl = document.querySelector('.file-size, [class*="filesize"]');
        if (sizeEl) {
          fileSizeFormatted = sizeEl.innerText.trim();
        }
        if (!fileName) {
          fileName = document.title.replace(/[-_] Filester.*/i, '').trim() || 'arquivo';
        }
        const dlBtn = document.querySelector('a[href*="fsc2.cdn.cr"], a[href*="fsc3.cdn.cr"], a[href*="/d/"], a[href*="download"]');
        const targetUrl = (dlBtn && dlBtn.href) ? dlBtn.href : window.location.href;
        if (!seenUrls.has(targetUrl)) {
          seenUrls.add(targetUrl);
          found.push({
            url: targetUrl,
            downloadUrl: targetUrl,
            directUrl: targetUrl,
            filename: fileName,
            size: fileSize,
            sizeFormatted: fileSizeFormatted,
            service: 'Filester',
            type: getFileType(fileName)
          });
        }
      }
    }

    // 2.66 Scanner Client-Side para DataNodes
    if (host.includes('datanodes')) {
      const fileActionsEl = document.querySelector('file-actions');
      let realNameFromFa = '';
      if (fileActionsEl) {
        const faLink = fileActionsEl.getAttribute('link') || '';
        if (faLink) {
          const parts = faLink.split('/');
          if (parts.length > 0) {
            realNameFromFa = decodeURIComponent(parts[parts.length - 1] || '').trim();
          }
        }
      }

      const scanCard = document.getElementById('scanCard');
      const dlCountdown = document.querySelector('download-countdown');
      const headerTitleEl = document.querySelector('.authBG + .container .text-white.text-xl, .authBG + .container .font-bold');

      let candidateName = realNameFromFa ||
        (scanCard ? scanCard.getAttribute('data-scan-file') : '') ||
        (dlCountdown ? dlCountdown.getAttribute('name') : '') ||
        (headerTitleEl ? headerTitleEl.innerText.trim() : '');

      if (!candidateName || /^(download|datanodes|free cloud)/i.test(candidateName)) {
        const fnameInput = document.querySelector('input[name="fname"]');
        if (fnameInput && fnameInput.value && !/^(download|datanodes)/i.test(fnameInput.value)) {
          candidateName = fnameInput.value;
        }
      }

      if (!candidateName || /^(download|datanodes|free cloud)/i.test(candidateName)) {
        const t = document.title.replace(/[-_] DataNodes.*/i, '').replace(/[-_] Free Cloud.*/i, '').trim();
        if (t && !/^(download|datanodes)/i.test(t)) {
          candidateName = t;
        }
      }

      const cleanFilename = (candidateName || 'DataNodes_File')
        .replace(/&#40;/g, '(')
        .replace(/&#41;/g, ')')
        .replace(/&amp;/g, '&')
        .trim();

      const sizeStr = scanCard ? scanCard.getAttribute('data-scan-size') : '';
      if (!seenUrls.has(url)) {
        seenUrls.add(url);
        found.push({
          id: 'datanodes_' + (url.split('/')[3] || Date.now()),
          url: url,
          sourceUrl: url,
          directUrl: url,
          downloadUrl: url,
          filename: cleanFilename,
          size: 0,
          sizeFormatted: sizeStr || 'Calculando...',
          service: 'DataNodes',
          type: getFileType(cleanFilename)
        });
      }
    }

    // 2.67 Scanner Client-Side para FileKeeper
    if (host.includes('filekeeper')) {
      const cdEl = document.getElementById('download-countdown');
      const filenameEl = document.getElementById('dl-filename');
      let filename = filenameEl ? filenameEl.innerText.trim() : (document.title.replace(/^Download\s+/i, '').trim() || 'FileKeeper_File');
      if (/^(download|filekeeper)/i.test(filename)) {
        const headingEl = document.querySelector('h1, h2, h3, .text-xl');
        if (headingEl && headingEl.innerText.trim()) {
          filename = headingEl.innerText.trim();
        }
      }
      if (!seenUrls.has(url)) {
        seenUrls.add(url);
        found.push({
          id: 'filekeeper_' + (cdEl ? cdEl.getAttribute('data-code') : (url.split('/')[3] || Date.now())),
          url: url,
          sourceUrl: url,
          directUrl: url,
          downloadUrl: url,
          filename: filename,
          size: 0,
          sizeFormatted: 'Calculando...',
          service: 'FileKeeper',
          type: getFileType(filename)
        });
      }
    }

    // 2.7 Scanner Client-Side para Vik1ngFile / VikingFile
    if (host.includes('vik1ngfile') || host.includes('vikingfile')) {
      let vkName = '';
      const nameEl = document.querySelector('#filename, h2#filename, .filename, [id*="filename"]');
      if (nameEl && nameEl.innerText.trim()) {
        vkName = nameEl.innerText.trim();
      }
      if (!vkName) {
        vkName = document.title.replace(/[-_] ViKiNG FiLE.*/i, '').replace(/[-_] Vik1ngFile.*/i, '').trim() || 'arquivo';
      }

      let vkSize = 0;
      let vkSizeFormatted = '';
      const sizeEl = document.querySelector('#size, p#size, .size, [id*="size"]');
      if (sizeEl && sizeEl.innerText.trim()) {
        vkSizeFormatted = sizeEl.innerText.trim();
        const m = vkSizeFormatted.match(/([\d.,]+)\s*([KMGT]?B)/i);
        if (m) {
          const num = parseFloat(m[1].replace(',', '.'));
          const unit = m[2].toUpperCase();
          const mult = unit === 'GB' ? 1073741824 : unit === 'MB' ? 1048576 : unit === 'KB' ? 1024 : 1;
          vkSize = Math.round(num * mult);
        }
      }

      let vkDirectUrl = '';
      const dlLinkEl = document.getElementById('download-link') || document.getElementById('download-parallel') || document.querySelector('a.btn-download');
      if (dlLinkEl && dlLinkEl.href && dlLinkEl.href.startsWith('http') && !dlLinkEl.href.includes('javascript:') && !dlLinkEl.href.includes('/fast-download/') && !dlLinkEl.href.endsWith(window.location.pathname)) {
        vkDirectUrl = dlLinkEl.href;
      }

      const targetUrl = vkDirectUrl || window.location.href;
      if (!seenUrls.has(targetUrl)) {
        seenUrls.add(targetUrl);
        found.push({
          url: targetUrl,
          downloadUrl: targetUrl,
          directUrl: targetUrl,
          filename: vkName,
          size: vkSize,
          sizeFormatted: vkSizeFormatted || (vkSize ? formatBytes(vkSize) : ''),
          service: 'Vik1ngFile',
          type: getFileType(vkName)
        });
      }

      // Disparar POST imediato para obter a URL direta sem esperar a pagina
      if (!vkDirectUrl && (window.location.pathname.startsWith('/f/') || window.location.pathname.startsWith('/file/'))) {
        try {
          const postTarget = window.location.href.replace('vik1ngfile.site', 'vikingfile.com');
          fetch(postTarget, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'X-Requested-With': 'XMLHttpRequest',
              'Referer': postTarget
            },
            body: ''
          })
          .then(r => r.json())
          .then(data => {
            if (data && data.link && !data.link.includes('fast-download')) {
              const resUrl = data.link;
              const resName = data.name || vkName;
              const resSize = data.size || vkSize;
              detectedFiles.forEach(f => {
                if (f.service === 'Vik1ngFile') {
                  f.url = resUrl;
                  f.downloadUrl = resUrl;
                  f.directUrl = resUrl;
                  if (resName) {
                    f.filename = resName;
                    f.name = resName;
                    f.type = getFileType(resName);
                  }
                  if (resSize) {
                    f.size = resSize;
                    f.sizeFormatted = formatBytes(resSize);
                  }
                }
              });
              updateHudInitialStats();
              if (downloadManagerOverlay) updateDownloadManagerUI();
            }
          }).catch(() => {});
        } catch (ePost) {}
      }

      // Polling ativo em #download-link caso o script da pagina preencha
      let vkCheckCount = 0;
      const vkTimer = setInterval(() => {
        vkCheckCount++;
        const btn = document.getElementById('download-link') || document.getElementById('download-parallel');
        if (btn && btn.href && btn.href.startsWith('http') && !btn.href.includes('javascript:') && !btn.href.includes('/fast-download/') && !btn.href.endsWith(window.location.pathname)) {
          clearInterval(vkTimer);
          detectedFiles.forEach(f => {
            if (f.service === 'Vik1ngFile') {
              f.url = btn.href;
              f.downloadUrl = btn.href;
              f.directUrl = btn.href;
            }
          });
          updateHudInitialStats();
          if (downloadManagerOverlay) updateDownloadManagerUI();
        }
        if (vkCheckCount >= 30) clearInterval(vkTimer);
      }, 500);
    }

    // 2.8 Scanner Client-Side para FileDitch (fileditchfiles.st)
    if (host.includes('fileditch') || host.includes('blehpooffileditchvids')) {
      let fdName = '';
      const titleClean = document.title.replace(/[-_] FileDitch.*/i, '').trim();
      if (titleClean && !titleClean.toLowerCase().includes('just a moment') && !titleClean.toLowerCase().includes('um momento')) {
        fdName = titleClean;
      }
      if (!fdName) {
        try {
          const u = new URL(window.location.href);
          fdName = decodeURIComponent(u.pathname.split('/').pop()) || 'video.mp4';
        } catch (e) {
          fdName = 'video.mp4';
        }
      }

      let fdDirectUrl = '';
      const videoEl = document.querySelector('video, source');
      const dlLinkEl = Array.from(document.querySelectorAll('a')).find(a => 
        (a.innerText && a.innerText.toLowerCase().includes('download')) || 
        (a.href && a.href.includes('blehpooffileditchvids.org'))
      );
      if (dlLinkEl && dlLinkEl.href && dlLinkEl.href.startsWith('http')) {
        fdDirectUrl = dlLinkEl.href;
      } else if (videoEl && videoEl.src && videoEl.src.startsWith('http')) {
        fdDirectUrl = videoEl.src;
      }

      const targetUrl = fdDirectUrl || window.location.href;
      if (!seenUrls.has(targetUrl)) {
        seenUrls.add(targetUrl);
        found.push({
          url: targetUrl,
          downloadUrl: targetUrl,
          directUrl: targetUrl,
          filename: fdName,
          size: 0,
          sizeFormatted: '',
          service: 'FileDitch',
          type: getFileType(fdName)
        });
      }

      let fdCheckCount = 0;
      const fdTimer = setInterval(() => {
        fdCheckCount++;
        const vEl = document.querySelector('video, source');
        const dlEl = Array.from(document.querySelectorAll('a')).find(a => 
          (a.innerText && a.innerText.toLowerCase().includes('download')) || 
          (a.href && a.href.includes('blehpooffileditchvids.org'))
        );
        const candidateUrl = (dlEl && dlEl.href && dlEl.href.startsWith('http')) ? dlEl.href : ((vEl && vEl.src && vEl.src.startsWith('http')) ? vEl.src : null);
        if (candidateUrl) {
          clearInterval(fdTimer);
          const tClean = document.title.replace(/[-_] FileDitch.*/i, '').trim();
          detectedFiles.forEach(f => {
            if (f.service === 'FileDitch') {
              f.url = candidateUrl;
              f.downloadUrl = candidateUrl;
              f.directUrl = candidateUrl;
              if (tClean && !tClean.toLowerCase().includes('just a moment') && !tClean.toLowerCase().includes('um momento')) {
                f.filename = tClean;
                f.name = tClean;
                f.type = getFileType(tClean);
              }
            }
          });
          updateHudInitialStats();
          if (downloadManagerOverlay) updateDownloadManagerUI();
        }
        if (fdCheckCount >= 30) clearInterval(fdTimer);
      }, 500);
    }

    // 3. Links diretos na página
    const links = document.querySelectorAll('a[href]');
    links.forEach(a => {
      const href = a.href;
      if (!href || seenUrls.has(href)) return;

      const lower = href.toLowerCase();
      const isMedia = lower.match(/\.(mp4|mkv|avi|mov|zip|rar|7z|tar|gz|pdf|jpg|jpeg|png|webp|iso|exe|torrent|pkg)(?:[?#]|$)/i);
      const isPsnLink = lower.includes('dl.playstation.net');
      const isMagnet = lower.startsWith('magnet:?');

      if (isMedia || isPsnLink || isMagnet || (currentSettings.monitoringMode === 'universal' && href.includes('/download'))) {
        seenUrls.add(href);
        let rawPathName = '';
        try {
          rawPathName = decodeURIComponent(href.split('/').pop().split('?')[0] || '');
        } catch (e) {
          rawPathName = (href.split('/').pop().split('?')[0] || '');
        }

        const isPsn = isPsnLink || lower.includes('.playstation.net') || /^[a-z]{2}\d{4}-[a-z]{4}\d{5}_\d{2}-.+\.pkg$/i.test(rawPathName);
        if (isPsn) {
          const pkgName = rawPathName || a.getAttribute('download') || a.innerText.trim() || 'package.pkg';
          let psFolder = 'PlayStation';
          const fullPkgMatch = pkgName.match(/^[A-Z]{2}\d{4}-([A-Z]{4}\d{5}_\d{2})-([A-Z0-9]+)(?:-([A-Z]\d{4}-V\d{4}))?(?:_\d+)?\.pkg$/i);
          if (fullPkgMatch) {
            const verTag = fullPkgMatch[3] ? ` (${fullPkgMatch[3].toUpperCase()})` : '';
            psFolder = `${fullPkgMatch[1].toUpperCase()} - ${fullPkgMatch[2].toUpperCase()}${verTag}`;
          } else {
            const titleMatch = (pkgName + ' ' + href).match(/\b([A-Z]{4}\d{5}_\d{2})\b/i);
            if (titleMatch) psFolder = `PlayStation - ${titleMatch[1].toUpperCase()}`;
          }
          found.push({
            url: href,
            directUrl: href,
            downloadUrl: href,
            filename: pkgName,
            name: pkgName,
            folderName: psFolder,
            relativePath: `${psFolder}/${pkgName}`,
            preserveRelativePath: true,
            isHttpDirect: true,
            service: 'PlayStation',
            type: getFileType(pkgName)
          });
        } else {
          const baseName = a.getAttribute('download') || rawPathName || a.innerText.trim() || 'arquivo';
          const name = baseName.length > 120 ? baseName.substring(0, 120) : baseName;
          found.push({
            url: href,
            filename: name,
            service: downloadProgressState.service,
            type: getFileType(href)
          });
        }
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

    const isTeraBoxFolder = (host.includes('terabox') || host.includes('1024tera') || host.includes('freeterabox') || host.includes('gibibox')) && (url.includes('surl=') || url.includes('/s/'));
    const isGoogleDrivePage = host.includes('drive.google.com');
    const isGoogleDriveFolder = isGoogleDrivePage && (url.includes('/folders/') || url.includes('embeddedfolderview'));

    if (found.length > 0 || isSupportedHoster) {
      if (found.length > 0) {
        detectedFiles = found;
      } else if (!isTeraBoxFolder && !isGoogleDriveFolder) {
        detectedFiles = [
          { url: window.location.href, filename: document.title || 'arquivo', service: downloadProgressState.service, type: isGoogleDrivePage ? '.Arquivo' : '.Vídeo' }
        ];
      }

      if (detectedFiles.length > 0 || isGoogleDriveFolder) {
        downloadProgressState.total = detectedFiles.length;
        downloadProgressState.type = (detectedFiles[0] && detectedFiles[0].type) || (isGoogleDrivePage ? '.Arquivo' : '.Vídeo');
        initHudWidget();
        updateHudInitialStats();
      }

      // Re-verificação após 1.2s e 2.5s para páginas dinâmicas em React (TeraBox, MediaFire)
      if ((isTeraBoxFolder || (host.includes('mediafire.com') && !url.includes('/folder/'))) && (!detectedFiles || detectedFiles.length <= 1)) {
        setTimeout(() => {
          const alreadyHasDirectCdn = detectedFiles && detectedFiles[0] && /^https?:\/\/download\d*\.mediafire\.com\//i.test(detectedFiles[0].directUrl || '');
          if (alreadyHasDirectCdn) return;
          const dlBtnLate = document.querySelector('#downloadButton') || document.querySelector('a[data-scrambled-url]') || document.querySelector('a.popsok');
          const lateDirectUrl = extractMediaFireDirectUrlFromBtn(dlBtnLate);
          if (lateDirectUrl) {
            const nameEl = document.querySelector('.dl-btn-label') || document.querySelector('.filename');
            const fileName = nameEl ? (nameEl.getAttribute('title') || nameEl.innerText.trim()) : document.title.replace(/\s*[-|]\s*MediaFire.*/i, '').trim() || 'arquivo';
            const mfKey = extractMediaFireKeyFromUrl(window.location.href);
            detectedFiles = [{
              id: mfKey ? `mediafire_${mfKey}` : 'mf-current',
              fileId: mfKey ? `mf_${mfKey}` : null,
              numericId: mfKey,
              url: window.location.href,
              sourceUrl: window.location.href,
              mediafireUrl: window.location.href,
              directUrl: lateDirectUrl,
              downloadUrl: lateDirectUrl,
              filename: fileName,
              name: fileName,
              service: 'MediaFire',
              type: getFileType(fileName)
            }];
            downloadProgressState.total = 1;
            downloadProgressState.type = detectedFiles[0].type;
            initHudWidget();
            updateHudInitialStats();
          }
        }, 1200);

        if (isTeraBoxFolder) {
          setTimeout(() => {
            if (detectedFiles.length <= 1) {
              scanPage();
            }
          }, 2500);
        }
      }

      const applyScannedFiles = (rawFiles) => {
        detectedFiles = rawFiles.map(f => {
          let svc = f.service || downloadProgressState.service;
          if (svc === 'generic') svc = 'Sites Genéricos';
          const fName = f.name || f.filename || 'arquivo';
          return {
            id: f.id,
            url: f.url || window.location.href,
            sourceUrl: f.sourceUrl || window.location.href,
            directUrl: f.directUrl || f.downloadUrl || f.url,
            downloadUrl: f.downloadUrl || f.directUrl || f.url,
            referer: f.referer || window.location.href,
            filename: fName,
            name: fName,
            size: f.size || 0,
            sizeFormatted: f.sizeFormatted || (f.size ? formatBytes(f.size) : ''),
            service: svc,
            type: getFileType(fName || f.url || ''),
            relativePath: f.relativePath || null,
            folderPath: f.folderPath || null,
            folderName: f.folderName || null,
            preserveRelativePath: !!f.preserveRelativePath,
            fileId: f.fileId || null,
            numericId: f.numericId || null,
            mediafireUrl: f.mediafireUrl || null,
            gdriveFileId: f.gdriveFileId || null,
            resourceKey: f.resourceKey || null,
            megaFolderId: f.megaFolderId,
            megaNodeId: f.megaNodeId,
            megaFileKeyHex: f.megaFileKeyHex,
            headers: f.headers
          };
        });
        downloadProgressState.total = detectedFiles.length;
        if (detectedFiles[0]) {
          downloadProgressState.type = detectedFiles[0].type;
          downloadProgressState.service = detectedFiles[0].service;
        }
        initHudWidget();
        updateHudInitialStats();
        if (downloadManagerOverlay) {
          updateDownloadManagerUI();
        }
      };

      // Consulta ao bridge do desktop com alta velocidade (+ Fallback standalone para Google Drive)
      if (isSupportedHoster || isTeraBoxFolder || url.includes('mega.nz') || url.includes('filester') || url.includes('1fichier.com')) {
        const scanUrlSnapshot = window.location.href;
        chrome.runtime.sendMessage({ action: 'SCAN_PAGE_URL', url: scanUrlSnapshot }, async (scanRes) => {
          if (window.location.href !== scanUrlSnapshot) return;
          if (scanRes && scanRes.success && scanRes.files && scanRes.files.length > 0) {
            applyScannedFiles(scanRes.files);
          } else if (isGoogleDrivePage) {
            const clientFiles = await scanGoogleDriveClientSide(scanUrlSnapshot);
            if (window.location.href !== scanUrlSnapshot) return;
            if (clientFiles && clientFiles.length > 0) {
              applyScannedFiles(clientFiles);
            }
          }
        });

        // Se modo for browser standalone (ou bridge indisponivel), dispara scan client-side imediato no Google Drive
        if (isGoogleDrivePage && (currentSettings.downloadOnlyViaExtension === true || currentSettings.downloadEngine === 'browser')) {
          scanGoogleDriveClientSide(scanUrlSnapshot).then(clientFiles => {
            if (window.location.href !== scanUrlSnapshot) return;
            if (clientFiles && clientFiles.length > 0 && detectedFiles.length === 0) {
              applyScannedFiles(clientFiles);
            }
          }).catch(() => {});
        }
      }
    }
  }

  function decodeHtmlExt(str) {
    if (!str) return '';
    const el = document.createElement('textarea');
    el.innerHTML = String(str);
    return el.value;
  }

  function sanitizeExtSegment(seg) {
    return String(seg || 'Pasta').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim() || 'Pasta';
  }

  async function scanGoogleDriveClientSide(pageUrl) {
    try {
      const folderMatch = pageUrl.match(/\/folders\/([a-zA-Z0-9_-]{10,})/i) ||
                          (pageUrl.includes('embeddedfolderview') ? pageUrl.match(/[?&]id=([a-zA-Z0-9_-]{10,})/i) : null);
      const rkMatch = pageUrl.match(/[?&]resourcekey=([a-zA-Z0-9_-]+)/i);
      const rootResourceKey = rkMatch && rkMatch[1] ? rkMatch[1] : null;

      if (folderMatch && folderMatch[1]) {
        const rootId = folderMatch[1];
        const queue = [{ id: rootId, pathParts: [], resourceKey: rootResourceKey }];
        const visited = new Set([rootId]);
        const collected = [];
        const docParser = new DOMParser();

        while (queue.length > 0) {
          const batch = queue.splice(0, 8);
          await Promise.all(batch.map(async (node) => {
            try {
              let embUrl = `https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(node.id)}`;
              const rk = node.resourceKey || rootResourceKey;
              if (rk) embUrl += `&resourcekey=${encodeURIComponent(rk)}`;
              const resp = await fetch(embUrl, { credentials: 'include' });
              if (!resp.ok) return;
              const html = await resp.text();
              const parsedDoc = docParser.parseFromString(html, 'text/html');
              const folderTitle = sanitizeExtSegment(parsedDoc.title || 'Pasta_Google_Drive');
              const curParts = node.pathParts.length === 0 ? [folderTitle] : node.pathParts;

              const entries = parsedDoc.querySelectorAll('.flip-entry');
              entries.forEach(entry => {
                const rawId = (entry.id || '').replace(/^entry-/, '').trim();
                const linkEl = entry.querySelector('a[href]');
                const titleEl = entry.querySelector('.flip-entry-title');
                const href = linkEl ? linkEl.getAttribute('href') || '' : '';
                const name = sanitizeExtSegment(titleEl ? titleEl.textContent : '');
                const isDir = href.includes('/folders/') || !!entry.querySelector('[aria-label="Folder"], .drive-sprite-folder-grid-shared-icon, .drive-sprite-folder-list-shared-icon');

                if (!rawId || !name) return;
                const entryRkM = href.match(/[?&]resourcekey=([a-zA-Z0-9_-]+)/i);
                const entryRk = (entryRkM && entryRkM[1]) || rk || null;

                if (isDir) {
                  if (!visited.has(rawId)) {
                    visited.add(rawId);
                    queue.push({ id: rawId, pathParts: [...curParts, name], resourceKey: entryRk });
                  }
                } else {
                  let directUrl = `https://drive.usercontent.google.com/download?id=${encodeURIComponent(rawId)}&export=download&confirm=t`;
                  let finalName = name;
                  if (href.includes('docs.google.com/document/')) {
                    directUrl = `https://docs.google.com/document/d/${rawId}/export?format=docx`;
                    if (!finalName.toLowerCase().endsWith('.docx')) finalName += '.docx';
                  } else if (href.includes('docs.google.com/spreadsheets/')) {
                    directUrl = `https://docs.google.com/spreadsheets/d/${rawId}/export?format=xlsx`;
                    if (!finalName.toLowerCase().endsWith('.xlsx')) finalName += '.xlsx';
                  } else if (href.includes('docs.google.com/presentation/')) {
                    directUrl = `https://docs.google.com/presentation/d/${rawId}/export?format=pptx`;
                    if (!finalName.toLowerCase().endsWith('.pptx')) finalName += '.pptx';
                  } else if (entryRk) {
                    directUrl += `&resourcekey=${encodeURIComponent(entryRk)}`;
                  }

                  const folderPath = curParts.join('/');
                  collected.push({
                    id: `gdrive_${rawId}`,
                    fileId: rawId,
                    gdriveFileId: rawId,
                    resourceKey: entryRk,
                    name: finalName,
                    filename: finalName,
                    size: 0,
                    sizeFormatted: '',
                    relativePath: `${folderPath}/${finalName}`,
                    folderPath,
                    folderName: curParts[0] || folderTitle,
                    preserveRelativePath: true,
                    service: 'Google Drive',
                    isHttpDirect: true,
                    url: `https://drive.google.com/file/d/${rawId}/view`,
                    sourceUrl: pageUrl,
                    directUrl,
                    downloadUrl: directUrl,
                    referer: 'https://drive.google.com/'
                  });
                }
              });
            } catch (e) {}
          }));
        }

        // Fallback leve para itens visiveis no DOM caso embeddedfolderview esteja bloqueado em workspace privado
        if (collected.length === 0) {
          const domTitle = sanitizeExtSegment((document.title || '').replace(/\s*-\s*Google Drive\s*$/i, '') || 'Pasta_Google_Drive');
          const domNodes = document.querySelectorAll('[data-id][data-target="doc"]');
          domNodes.forEach(el => {
            const id = el.getAttribute('data-id');
            const labelEl = el.querySelector('[aria-label], [data-tooltip]');
            const rawName = labelEl ? (labelEl.getAttribute('data-tooltip') || labelEl.getAttribute('aria-label') || '').trim() : '';
            if (id && id.length >= 10 && rawName) {
              const safeName = sanitizeExtSegment(rawName.split('\n')[0]);
              const dUrl = `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download&confirm=t`;
              collected.push({
                id: `gdrive_${id}`,
                fileId: id,
                gdriveFileId: id,
                resourceKey: rootResourceKey,
                name: safeName,
                filename: safeName,
                size: 0,
                sizeFormatted: '',
                relativePath: `${domTitle}/${safeName}`,
                folderPath: domTitle,
                folderName: domTitle,
                preserveRelativePath: true,
                service: 'Google Drive',
                isHttpDirect: true,
                url: `https://drive.google.com/file/d/${id}/view`,
                sourceUrl: pageUrl,
                directUrl: dUrl,
                downloadUrl: dUrl,
                referer: 'https://drive.google.com/'
              });
            }
          });
        }

        return collected;
      }

      // Caso arquivo individual (/file/d/ID)
      const fileMatch = pageUrl.match(/\/file\/d\/([a-zA-Z0-9_-]{10,})/i) || pageUrl.match(/[?&]id=([a-zA-Z0-9_-]{10,})/i);
      if (fileMatch && fileMatch[1]) {
        const fId = fileMatch[1];
        const fName = sanitizeExtSegment((document.title || '').replace(/\s*-\s*Google Drive\s*$/i, '') || `arquivo_${fId}`);
        let dUrl = `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fId)}&export=download&confirm=t`;
        if (rootResourceKey) dUrl += `&resourcekey=${encodeURIComponent(rootResourceKey)}`;
        return [{
          id: `gdrive_${fId}`,
          fileId: fId,
          gdriveFileId: fId,
          resourceKey: rootResourceKey,
          name: fName,
          filename: fName,
          size: 0,
          sizeFormatted: '',
          relativePath: fName,
          folderName: null,
          service: 'Google Drive',
          isHttpDirect: true,
          url: `https://drive.google.com/file/d/${fId}/view`,
          sourceUrl: pageUrl,
          directUrl: dUrl,
          downloadUrl: dUrl,
          referer: 'https://drive.google.com/'
        }];
      }
    } catch (e) {
      console.warn('[Content Google Drive Client Scanner] Erro:', e);
    }
    return [];
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
    if (getNexusRootElement('nexus-hud-container')) return;

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
        <button type="button" class="nexus-btn-ctrl" id="nexus-btn-minimize" title="Aumentar para modo grande">+</button>
        <button type="button" class="nexus-btn-ctrl close" id="nexus-btn-close" title="Fechar da página"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
    `;

    hudContainer.appendChild(hudElement);
    getNexusShadowRoot().appendChild(hudContainer);

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
      ? Math.max(currentBatchState.total, batch.total) 
      : (batch.total > 0 ? batch.total : (msgTotal > 0 ? msgTotal : 1));

    let effectiveCompleted = Math.max(batch.completed, msgCompleted);
    if (effectiveCompleted > effectiveTotal && effectiveTotal > 0) {
      effectiveTotal = effectiveCompleted;
    }

    const effectivePct = effectiveTotal > 0 ? Math.min(1, Math.max(0, effectiveCompleted / effectiveTotal)) : 0;
    const isSuccessfulFinish = (effectiveTotal > 0 && effectiveCompleted >= effectiveTotal && effectiveCompleted > 0) || (batch.isFinished && effectiveCompleted > 0);
    const hasFailedBatch = (isCompleted && effectiveCompleted === 0) || 
                           (currentDownloadItems && currentDownloadItems.length > 0 && currentDownloadItems.every(i => i.status === 'failed' || i.status === 'interrupted'));

    const effectiveIsFinished = isSuccessfulFinish;

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

    if (isSuccessfulFinish) {
      downloadProgressState.active = false;
      if (stackComp) stackComp.style.display = 'none';
      if (checkComp) checkComp.style.display = 'block';

      if (statusExp) {
        statusExp.innerText = 'Concluido!';
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
    } else if (hasFailedBatch) {
      downloadProgressState.active = false;
      if (stackComp) stackComp.style.display = 'flex';
      if (checkComp) checkComp.style.display = 'none';

      if (statusExp) {
        statusExp.innerText = 'Falha no download';
        statusExp.classList.remove('downloading');
        statusExp.style.color = '#ef4444';
      }
      if (checkExp) checkExp.style.display = 'none';
      if (counterExp) counterExp.innerText = `${effectiveCompleted}/${effectiveTotal}`;
      if (subExp) subExp.innerText = 'DOWNLOAD NAO CONCLUIDO';

      if (ringBar) {
        ringBar.classList.remove('inactive');
        ringBar.classList.remove('completed');
        ringBar.style.stroke = '#ef4444';
        ringBar.style.opacity = '1';
        ringBar.style.strokeDashoffset = '0';
      }
      hudElement.classList.remove('completed');
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

  // Autoclick e disparo seguro no botao Download Now na pagina final do MegaUp
  function triggerMegaUpFinalDownload() {
    const allButtons = Array.from(document.querySelectorAll('a, button, input[type="submit"]'));
    const btn = allButtons.find(el => {
      const txt = (el.innerText || el.textContent || el.value || '').trim().toUpperCase();
      return txt.includes('DOWNLOAD NOW') || (el.classList.contains('btn') && txt.includes('DOWNLOAD'));
    }) || document.getElementById('btndownload') || document.querySelector('.btn-download');

    if (btn) {
      const txt = (btn.innerText || btn.textContent || btn.value || '').trim();
      const isCounting = /\(\d+\s*s?\)/i.test(txt) || /\b\d+\s*sec/i.test(txt);
      const isVisible = (btn.offsetWidth > 0 && btn.offsetHeight > 0) || (btn.getClientRects && btn.getClientRects().length > 0);
      const isDisabled = btn.classList.contains('disabled') || btn.disabled || btn.getAttribute('disabled') !== null || isCounting || !isVisible;

      if (!isDisabled) {
        console.log('[Nexus MegaUp Helper] Botao Download Now pronto! Disparando clique automatico...');
        try {
          ['pointerdown', 'mousedown', 'mouseup', 'click'].forEach(evtType => {
            btn.dispatchEvent(new MouseEvent(evtType, { bubbles: true, cancelable: true, view: window }));
          });
          btn.click();
          if (btn.tagName === 'A' && btn.href && btn.href.startsWith('http') && !btn.href.includes('javascript:')) {
            window.location.href = btn.href;
          } else if (btn.form) {
            btn.form.submit();
          }
          return true;
        } catch (err) {
          console.warn('[Nexus MegaUp Helper] Erro ao disparar clique:', err);
        }
      }
    }
    return false;
  }

  if (window.location.hostname.includes('download.megaup.net')) {
    let clickDispatched = false;
    const checkBtnTimer = setInterval(() => {
      if (clickDispatched) return;
      if (triggerMegaUpFinalDownload()) {
        clickDispatched = true;
        clearInterval(checkBtnTimer);
      }
    }, 500);
    setTimeout(() => clearInterval(checkBtnTimer), 60000);
  }

  function triggerMegaUpPageDownload() {
    if (!window.location.hostname.includes('megaup.net')) return;
    const btn = document.querySelector('a[href*="download.megaup.net/?url="]') || document.querySelector('a.btn[href*="download.megaup"]');
    if (btn) {
      try { btn.click(); } catch (e) {}
    } else {
      let attempts = 0;
      const pollTimer = setInterval(() => {
        attempts++;
        const b = document.querySelector('a[href*="download.megaup.net/?url="]') || document.querySelector('a.btn[href*="download.megaup"]');
        if (b) {
          clearInterval(pollTimer);
          try { b.click(); } catch (e) {}
        } else if (attempts >= 10) {
          clearInterval(pollTimer);
        }
      }, 500);
    }
  }

  function escapeHtmlExt(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function buildExtFolderTree(items) {
    const root = { name: 'root', path: '', children: new Map(), files: [], allFileIds: [] };
    items.forEach((item, idx) => {
      const itemId = String(item.id || `det_${idx}`);
      let dirParts = [];
      if (item.folderPath && typeof item.folderPath === 'string') {
        dirParts = item.folderPath.replace(/\\/g, '/').split('/').filter(Boolean);
      } else if (item.relativePath && (item.relativePath.includes('/') || item.relativePath.includes('\\'))) {
        const segs = item.relativePath.replace(/\\/g, '/').split('/').filter(Boolean);
        if (segs.length > 1) dirParts = segs.slice(0, -1);
      } else if (item.folderName) {
        dirParts = [item.folderName];
      } else {
        dirParts = ['Arquivos'];
      }

      let cursor = root;
      cursor.allFileIds.push(itemId);
      let accPath = '';
      for (const seg of dirParts) {
        accPath = accPath ? `${accPath}/${seg}` : seg;
        if (!cursor.children.has(seg)) {
          cursor.children.set(seg, { name: seg, path: accPath, children: new Map(), files: [], allFileIds: [] });
        }
        cursor = cursor.children.get(seg);
        cursor.allFileIds.push(itemId);
      }
      cursor.files.push({ item, idx, itemId });
    });
    return root;
  }

  function hasExtFolderHierarchy(items) {
    return Array.isArray(items) && items.some(i =>
      i.preserveRelativePath ||
      (i.folderPath && String(i.folderPath).trim().length > 0) ||
      (i.relativePath && (i.relativePath.includes('/') || i.relativePath.includes('\\')))
    );
  }

  // Modal de Seleção de Arquivos (In-Page)
  function showSelectionModal() {
    if (getNexusRootElement('nexus-modal-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'nexus-modal-overlay';
    overlay.setAttribute('dir', 'ltr');
    overlay.classList.add('nexus-root-container');

    // Blindagem de eventos para nao vazar cliques para a pagina
    ['click', 'pointerdown', 'mousedown', 'mouseup'].forEach(evtType => {
      overlay.addEventListener(evtType, (e) => {
        e.stopPropagation();
      });
    });

    const isTreeMode = hasExtFolderHierarchy(detectedFiles);
    const modalSelectedIds = new Set(detectedFiles.map((f, i) => String(f.id || `det_${i}`)));
    const folderIdsMap = new Map();

    const renderModalNodeHtml = (node, depth = 0) => {
      folderIdsMap.set(node.path, node.allFileIds);
      const isCollapsed = depth >= 1;
      const subCount = node.children.size > 0 ? `${node.children.size} pasta(s) • ` : '';
      const childrenHtml = Array.from(node.children.values())
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
        .map(ch => renderModalNodeHtml(ch, depth + 1))
        .join('');
      const filesHtml = node.files.map(({ item, idx, itemId }) => `
        <div class="nexus-modal-file-row">
          <div class="nexus-modal-file-info">
            <input type="checkbox" class="nexus-file-chk" data-index="${idx}" data-item-id="${escapeHtmlExt(itemId)}" checked>
            <span title="${escapeHtmlExt(item.filename || item.name)}">${escapeHtmlExt(item.filename || item.name)}</span>
          </div>
          <span class="nexus-tag-type">${escapeHtmlExt(item.type || '.Arquivo')}</span>
        </div>
      `).join('');

      return `
        <div class="nexus-folder-node ${isCollapsed ? 'collapsed' : ''}" data-folder-path="${escapeHtmlExt(node.path)}">
          <div class="nexus-folder-header">
            <div class="nexus-folder-header-left">
              <span class="nexus-folder-chevron"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg></span>
              <input type="checkbox" class="nexus-folder-chk" data-folder-path="${escapeHtmlExt(node.path)}" checked>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
              <span class="nexus-folder-name" title="${escapeHtmlExt(node.name)}">${escapeHtmlExt(node.name)}</span>
            </div>
            <span class="nexus-folder-badge">${subCount}${node.allFileIds.length} arq.</span>
          </div>
          <div class="nexus-folder-children">
            ${childrenHtml}
            ${filesHtml}
          </div>
        </div>
      `;
    };

    let filesHtml = '';
    if (isTreeMode) {
      const tree = buildExtFolderTree(detectedFiles);
      const topNodes = Array.from(tree.children.values());
      filesHtml = topNodes.map(n => renderModalNodeHtml(n, 0)).join('');
    } else {
      filesHtml = detectedFiles.map((file, idx) => `
        <div class="nexus-modal-file-row">
          <div class="nexus-modal-file-info">
            <input type="checkbox" class="nexus-file-chk" data-index="${idx}" data-item-id="${escapeHtmlExt(String(file.id || `det_${idx}`))}" checked>
            <span title="${escapeHtmlExt(file.filename)}">${escapeHtmlExt(file.filename)}</span>
          </div>
          <span class="nexus-tag-type">${escapeHtmlExt(file.type)}</span>
        </div>
      `).join('');
    }

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
          <button type="button" class="nexus-btn-ctrl close" id="nexus-modal-close" style="width:28px; height:28px; display:flex; align-items:center; justify-content:center;"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>

        <div class="nexus-modal-subbar">
          <div style="display:flex; align-items:center; gap:6px;">
            <span class="nexus-tag-service" style="background: ${sTag.bg}; color: ${sTag.color}; border: 1px solid ${sTag.border}; font-weight: 700; padding: 2px 7px; border-radius: 4px; font-size: 9px; line-height: 1.2;">${sTag.text}</span>
            <span style="font-weight:700;" id="nexus-modal-count-label">${detectedFiles.length} Arquivos detectados</span>
          </div>
          <label style="cursor:pointer; display:flex; align-items:center; gap:4px;">
            <input type="checkbox" id="nexus-select-all" checked>
            <span>Select all</span>
          </label>
        </div>

        <div class="nexus-modal-files-list">
          ${filesHtml}
        </div>

        <button type="button" class="nexus-btn-download-action" id="nexus-btn-confirm-download">
          ${getActionBtnText()}
        </button>
      </div>
    `;

    getNexusShadowRoot().appendChild(overlay);

    // Eventos do Modal
    overlay.querySelector('#nexus-modal-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    const chkSelectAll = overlay.querySelector('#nexus-select-all');
    const chks = overlay.querySelectorAll('.nexus-file-chk');
    const folderChks = overlay.querySelectorAll('.nexus-folder-chk');
    const countLabel = overlay.querySelector('#nexus-modal-count-label');

    const syncModalCheckStates = () => {
      chks.forEach(c => {
        const id = c.getAttribute('data-item-id');
        c.checked = modalSelectedIds.has(id);
      });
      folderChks.forEach(fc => {
        const fPath = fc.getAttribute('data-folder-path');
        const ids = folderIdsMap.get(fPath) || [];
        let checkedInFolder = 0;
        ids.forEach(id => { if (modalSelectedIds.has(id)) checkedInFolder++; });
        if (checkedInFolder === 0) {
          fc.checked = false;
          fc.indeterminate = false;
        } else if (checkedInFolder === ids.length) {
          fc.checked = true;
          fc.indeterminate = false;
        } else {
          fc.checked = false;
          fc.indeterminate = true;
        }
      });
      if (modalSelectedIds.size === 0) {
        chkSelectAll.checked = false;
        chkSelectAll.indeterminate = false;
      } else if (modalSelectedIds.size === chks.length) {
        chkSelectAll.checked = true;
        chkSelectAll.indeterminate = false;
      } else {
        chkSelectAll.checked = false;
        chkSelectAll.indeterminate = true;
      }
      if (countLabel) {
        countLabel.textContent = `${modalSelectedIds.size}/${detectedFiles.length} selecionado(s)`;
      }
    };

    chkSelectAll.addEventListener('change', () => {
      if (chkSelectAll.checked) {
        chks.forEach(c => modalSelectedIds.add(c.getAttribute('data-item-id')));
      } else {
        modalSelectedIds.clear();
      }
      syncModalCheckStates();
    });

    chks.forEach(c => {
      c.addEventListener('change', (e) => {
        e.stopPropagation();
        const id = c.getAttribute('data-item-id');
        if (c.checked) modalSelectedIds.add(id);
        else modalSelectedIds.delete(id);
        syncModalCheckStates();
      });
    });

    folderChks.forEach(fc => {
      fc.addEventListener('click', (e) => e.stopPropagation());
      fc.addEventListener('change', (e) => {
        e.stopPropagation();
        const fPath = fc.getAttribute('data-folder-path');
        const ids = folderIdsMap.get(fPath) || [];
        ids.forEach(id => {
          if (fc.checked) modalSelectedIds.add(id);
          else modalSelectedIds.delete(id);
        });
        syncModalCheckStates();
      });
    });

    overlay.querySelectorAll('.nexus-folder-header').forEach(hdr => {
      hdr.addEventListener('click', (e) => {
        if (e.target && e.target.classList && e.target.classList.contains('nexus-folder-chk')) return;
        e.stopPropagation();
        const nodeEl = hdr.closest('.nexus-folder-node');
        if (nodeEl) nodeEl.classList.toggle('collapsed');
      });
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
        relativePath: t.relativePath || null,
        folderPath: t.folderPath || null,
        folderName: t.folderName || null,
        preserveRelativePath: !!t.preserveRelativePath,
        numericId: t.numericId || null,
        mediafireUrl: t.mediafireUrl || null,
        gdriveFileId: t.gdriveFileId || null,
        resourceKey: t.resourceKey || null,
        bunkrSlug: (t.url && (t.url.includes('bunkr') || t.url.includes('balbums')) ? (t.bunkrSlug || (t.url.match(/\/(?:f|v|i|d)\/([a-zA-Z0-9_-]+)/i) || [])[1]) : null),
        fileId: t.fileId || (t.url && (t.url.includes('bunkr') || t.url.includes('balbums')) ? (t.bunkrSlug || (t.url.match(/\/(?:f|v|i|d)\/([a-zA-Z0-9_-]+)/i) || [])[1]) : null),
        megaFolderId: t.megaFolderId || null,
        megaNodeId: t.megaNodeId || null,
        megaFileKeyHex: t.megaFileKeyHex || null,
        headers: t.headers || null
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
    const existing = getNexusRootElement('nexus-confirm-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'nexus-confirm-overlay';
    overlay.setAttribute('dir', 'ltr');
    overlay.classList.add('nexus-root-container');

    // Blindagem de eventos para nao vazar cliques para a pagina
    ['click', 'pointerdown', 'mousedown', 'mouseup'].forEach(evtType => {
      overlay.addEventListener(evtType, (e) => {
        e.stopPropagation();
      });
    });

    overlay.innerHTML = `
      <div class="nexus-confirm-card">
        <div class="nexus-confirm-icon"><svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>
        <div class="nexus-confirm-title">Reiniciar Download?</div>
        <div class="nexus-confirm-desc">
          O download do lote já está em andamento. Deseja interromper e reiniciar os downloads do início?
        </div>
        <div class="nexus-confirm-actions">
          <button type="button" class="nexus-btn-confirm-cancel" id="nexus-confirm-btn-cancel">Continuar Baixando</button>
          <button type="button" class="nexus-btn-confirm-restart" id="nexus-confirm-btn-restart">Sim, Reiniciar</button>
        </div>
      </div>
    `;

    getNexusShadowRoot().appendChild(overlay);

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
    let overlay = getNexusRootElement('nexus-manager-overlay');
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
          <button type="button" class="nexus-btn-ctrl close" id="nexus-mgr-close" style="width:28px; height:28px; display:flex; align-items:center; justify-content:center;"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
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
            <button type="button" class="nexus-filter-tab-btn ${activeManagerFilter === 'all' ? 'active' : ''}" data-filter="all">Lista para Downloads (<span id="nexus-mgr-count-all">0</span>)</button>
            <button type="button" class="nexus-filter-tab-btn ${activeManagerFilter === 'downloading' ? 'active' : ''}" data-filter="downloading">Baixando (<span id="nexus-mgr-count-dl">0</span>)</button>
            <button type="button" class="nexus-filter-tab-btn ${activeManagerFilter === 'completed' ? 'active' : ''}" data-filter="completed">Concluídos (<span id="nexus-mgr-count-comp">0</span>)</button>
            <button type="button" class="nexus-filter-tab-btn torbox ${activeManagerFilter === 'torbox' ? 'active' : ''}" data-filter="torbox">Torbox Cloud (<span id="nexus-mgr-count-torbox">0</span>)</button>
          </div>
          <div class="nexus-manager-actions-row">
            <button type="button" class="nexus-btn-manager-action" id="nexus-mgr-btn-config-folder" title="Configurar pasta onde os arquivos serão salvos">
              Pasta de Download
            </button>
            <button type="button" class="nexus-btn-manager-action" id="nexus-mgr-btn-folder" title="Abrir pasta de downloads">
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

    getNexusShadowRoot().appendChild(overlay);

    // Blindagem de eventos para nao vazar cliques para a pagina
    ['click', 'pointerdown', 'mousedown', 'mouseup'].forEach(evtType => {
      overlay.addEventListener(evtType, (e) => {
        e.stopPropagation();
      });
    });

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
      directUrl: f.directUrl !== undefined ? f.directUrl : (f.downloadUrl || f.url),
      downloadUrl: f.downloadUrl !== undefined ? f.downloadUrl : (f.directUrl || f.url),
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
      relativePath: f.relativePath || null,
      folderPath: f.folderPath || null,
      folderName: f.folderName || null,
      preserveRelativePath: !!f.preserveRelativePath,
      numericId: f.numericId || null,
      mediafireUrl: f.mediafireUrl || null,
      gdriveFileId: f.gdriveFileId || null,
      resourceKey: f.resourceKey || null,
      bunkrSlug: (f.url && (f.url.includes('bunkr') || f.url.includes('balbums')) ? (f.bunkrSlug || (f.url.match(/\/(?:f|v|i|d)\/([a-zA-Z0-9_-]+)/i) || [])[1]) : null),
      fileId: f.fileId || (f.url && (f.url.includes('bunkr') || f.url.includes('balbums')) ? (f.bunkrSlug || (f.url.match(/\/(?:f|v|i|d)\/([a-zA-Z0-9_-]+)/i) || [])[1]) : null),
      megaFolderId: f.megaFolderId || null,
      megaNodeId: f.megaNodeId || null,
      megaFileKeyHex: f.megaFileKeyHex || null,
      headers: f.headers || null
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
            <button type="button" class="nexus-btn-manager-action primary" id="nexus-mgr-btn-start-dl" ${visibleItems.length === 0 ? 'disabled' : ''}>
              ${startDlLabel}
            </button>
          </div>
          <div class="nexus-subbar-actions">
            <button type="button" class="nexus-btn-manager-action" id="nexus-mgr-btn-copy-album" title="Copiar link do álbum ou página atual">
              Copiar Link do Álbum / Site
            </button>
            <button type="button" class="nexus-btn-manager-action clear" id="nexus-mgr-btn-clear-all" title="Limpar lista da extensão">
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
              relativePath: t.relativePath || null,
              folderPath: t.folderPath || null,
              folderName: t.folderName || null,
              preserveRelativePath: !!t.preserveRelativePath,
              numericId: t.numericId || null,
              mediafireUrl: t.mediafireUrl || null,
              gdriveFileId: t.gdriveFileId || null,
              resourceKey: t.resourceKey || null,
              bunkrSlug: (t.url && (t.url.includes('bunkr') || t.url.includes('balbums')) ? (t.bunkrSlug || (t.url.match(/\/(?:f|v|i|d)\/([a-zA-Z0-9_-]+)/i) || [])[1]) : null),
              fileId: t.fileId || (t.url && (t.url.includes('bunkr') || t.url.includes('balbums')) ? (t.bunkrSlug || (t.url.match(/\/(?:f|v|i|d)\/([a-zA-Z0-9_-]+)/i) || [])[1]) : null),
              megaFolderId: t.megaFolderId || null,
              megaNodeId: t.megaNodeId || null,
              megaFileKeyHex: t.megaFileKeyHex || null,
              headers: t.headers || null
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
            <button type="button" class="nexus-btn-manager-action pause" id="nexus-mgr-btn-pause" ${visibleItems.length === 0 ? 'disabled' : ''}>
              ${pauseLabel}
            </button>
            ${pausedVisibleCount > 0 ? `
              <button type="button" class="nexus-btn-manager-action resume" id="nexus-mgr-btn-resume">
                ${resumeLabel}
              </button>
            ` : ''}
            <button type="button" class="nexus-btn-manager-action restart" id="nexus-mgr-btn-restart-active" ${visibleItems.length === 0 ? 'disabled' : ''}>
              ${restartLabel}
            </button>
            <button type="button" class="nexus-btn-manager-action clear" id="nexus-mgr-btn-clear-downloading" ${visibleItems.length === 0 ? 'disabled' : ''}>
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
            <button type="button" class="nexus-btn-manager-action restart" id="nexus-mgr-btn-redownload" ${selectedVisibleCount === 0 ? 'disabled' : ''} title="Baixar novamente os itens selecionados">
              ${redownloadText}
            </button>
            <button type="button" class="nexus-btn-manager-action cancel" id="nexus-mgr-btn-delete-selected" ${selectedVisibleCount === 0 ? 'disabled' : ''} title="Deletar itens selecionados da lista">
              ${deleteText}
            </button>
            <button type="button" class="nexus-btn-manager-action clear" id="nexus-mgr-btn-clear-completed" ${visibleItems.length === 0 ? 'disabled' : ''} title="Limpar todos os concluídos da lista">
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
            <button type="button" class="nexus-btn-manager-action" id="nexus-mgr-btn-refresh-torbox" title="Atualizar dados da nuvem">
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

    const renderItemCardHtml = (item) => {
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
        <div class="nexus-manager-item" data-item-id="${escapeHtmlExt(item.id)}">
          <div class="nexus-item-row-top">
            <div class="nexus-item-title-group">
              <input type="checkbox" class="nexus-item-chk" data-item-id="${escapeHtmlExt(item.id)}" ${isChecked ? 'checked' : ''}>
              <span style="font-size: 1rem; flex-shrink: 0; display: inline-flex; align-items: center;">${getFileIcon(item.type)}</span>
              <span class="nexus-item-name" title="${escapeHtmlExt(item.name)}">${escapeHtmlExt(item.name)}</span>
            </div>
          </div>
          <div class="nexus-item-progress-bar-wrap">
            <div class="nexus-item-progress-bar-fill ${item.status === 'completed' ? 'completed' : ''}" style="width: ${itemPct}%;"></div>
          </div>
          <div class="nexus-item-row-bottom">
            <div class="nexus-item-bottom-left">
              <span class="nexus-item-status-tag ${statusClass}">${statusLabel}</span>
              ${item.sizeFormatted ? `<span class="nexus-item-size">${escapeHtmlExt(item.sizeFormatted)}</span>` : ''}
              <span class="nexus-tag-service" style="background: ${sTag.bg}; color: ${sTag.color}; border: 1px solid ${sTag.border}; font-weight: 700; padding: 1px 6px; border-radius: 4px; font-size: 8.5px; white-space: nowrap;">${sTagText}</span>
              ${sTagText !== 'Web' ? `<span class="nexus-tag-origin" style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.35); font-weight: 700; padding: 1px 6px; border-radius: 4px; font-size: 8.5px; white-space: nowrap;">Web</span>` : ''}
              <span class="nexus-tag-type" style="padding: 1px 6px; font-size: 8.5px; white-space: nowrap;">${typeTagText}</span>
              ${item.speed ? `<span style="color:#38bdf8; font-weight:700; font-size:0.72rem;">${typeof item.speed === 'number' ? formatBytes(item.speed) + '/s' : escapeHtmlExt(item.speed)}</span>` : ''}
            </div>
            <div class="nexus-item-actions-btn-group">
              <button type="button" class="nexus-btn-item-action copy-link" data-url="${escapeHtmlExt(originalUrl)}" title="Copiar Link Original"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
              <button type="button" class="nexus-btn-item-action open-browser" data-url="${escapeHtmlExt(originalUrl)}" title="Abrir Página"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></button>
              <button type="button" class="nexus-btn-item-action remove-item" data-remove-id="${escapeHtmlExt(item.id)}" title="Remover da lista"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
            </div>
          </div>
        </div>
      `;
    };

    const showMgrFolderTree = activeManagerFilter === 'all' && hasExtFolderHierarchy(visibleItems);
    const mgrFolderIdsMap = new Map();

    if (showMgrFolderTree) {
      const tree = buildExtFolderTree(visibleItems);
      const topNodes = Array.from(tree.children.values());
      const treeKey = topNodes.map(n => n.path).join('|');
      if (initializedFolderTreeKey !== treeKey) {
        initializedFolderTreeKey = treeKey;
        topNodes.forEach(n => expandedExtFolders.add(n.path));
      }

      const renderMgrNode = (node) => {
        mgrFolderIdsMap.set(node.path, node.allFileIds);
        const isExpanded = expandedExtFolders.has(node.path);
        const subCount = node.children.size > 0 ? `${node.children.size} pasta(s) • ` : '';
        const childrenHtml = Array.from(node.children.values())
          .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
          .map(ch => renderMgrNode(ch))
          .join('');
        const filesHtml = node.files.map(({ item }) => renderItemCardHtml(item)).join('');

        return `
          <div class="nexus-folder-node ${isExpanded ? '' : 'collapsed'}" data-folder-path="${escapeHtmlExt(node.path)}">
            <div class="nexus-folder-header">
              <div class="nexus-folder-header-left">
                <span class="nexus-folder-chevron"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg></span>
                <input type="checkbox" class="nexus-folder-chk" data-folder-path="${escapeHtmlExt(node.path)}">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                <span class="nexus-folder-name" title="${escapeHtmlExt(node.name)}">${escapeHtmlExt(node.name)}</span>
              </div>
              <span class="nexus-folder-badge">${subCount}${node.allFileIds.length} arq.</span>
            </div>
            <div class="nexus-folder-children">
              ${childrenHtml}
              ${filesHtml}
            </div>
          </div>
        `;
      };

      listEl.innerHTML = topNodes.map(n => renderMgrNode(n)).join('');

      // Sincroniza estado checked / indeterminate das pastas
      listEl.querySelectorAll('.nexus-folder-chk').forEach(fc => {
        const fPath = fc.getAttribute('data-folder-path');
        const ids = mgrFolderIdsMap.get(fPath) || [];
        let checkedInFolder = 0;
        ids.forEach(id => { if (selectedItemIds.has(String(id))) checkedInFolder++; });
        if (ids.length > 0 && checkedInFolder === ids.length) {
          fc.checked = true;
          fc.indeterminate = false;
        } else if (checkedInFolder > 0) {
          fc.checked = false;
          fc.indeterminate = true;
        } else {
          fc.checked = false;
          fc.indeterminate = false;
        }

        fc.addEventListener('click', (e) => e.stopPropagation());
        fc.addEventListener('change', (e) => {
          e.stopPropagation();
          ids.forEach(id => {
            if (fc.checked) selectedItemIds.add(String(id));
            else selectedItemIds.delete(String(id));
          });
          updateDownloadManagerUI();
        });
      });

      listEl.querySelectorAll('.nexus-folder-header').forEach(hdr => {
        hdr.addEventListener('click', (e) => {
          if (e.target && e.target.classList && e.target.classList.contains('nexus-folder-chk')) return;
          e.stopPropagation();
          const nodeEl = hdr.closest('.nexus-folder-node');
          if (nodeEl) {
            const fPath = nodeEl.getAttribute('data-folder-path');
            if (expandedExtFolders.has(fPath)) expandedExtFolders.delete(fPath);
            else expandedExtFolders.add(fPath);
            updateDownloadManagerUI();
          }
        });
      });
    } else {
      listEl.innerHTML = visibleItems.map(renderItemCardHtml).join('');
    }

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
            <button type="button" class="nexus-btn-manager-action restart" id="nexus-mgr-btn-open-options" style="padding:8px 18px; margin:0 auto; display:inline-flex; align-items:center; gap:6px;">
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
                  <button type="button" class="nexus-btn-item-action torbox-dl" data-torrent-id="${t.id}" data-name="${t.name}" title="Baixar arquivo da nuvem">
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
    const existing = getNexusRootElement('nexus-inpage-options-backdrop');
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
              <button type="button" class="nexus-inpage-btn-close" id="nexus-inpage-btn-close" title="Fechar configurações">
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
                  <button type="button" class="nexus-inpage-btn-action" id="nexus-inpage-btn-paste-torbox" ${isUsingPortable ? 'disabled' : ''} style="display:inline-flex; align-items:center; gap:4px;">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    Colar
                  </button>
                  <button type="button" class="nexus-inpage-btn-action" id="nexus-inpage-btn-test-torbox" ${isUsingPortable ? 'disabled' : ''} style="display:inline-flex; align-items:center; gap:4px;">
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
                  <button type="button" class="nexus-inpage-btn-action" id="nexus-inpage-btn-open-folder" title="Abrir pasta de downloads" style="display:inline-flex; align-items:center; gap:4px;">
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
                  <button type="button" class="nexus-inpage-chip ${currentMode === 'disabled' ? 'active' : ''}" data-mode="disabled">Desligado</button>
                  <button type="button" class="nexus-inpage-chip ${currentMode === 'supported' ? 'active' : ''}" data-mode="supported">Sites Suportados</button>
                  <button type="button" class="nexus-inpage-chip ${currentMode === 'supported_torbox' ? 'active' : ''}" data-mode="supported_torbox">Sites Suportados + Torbox</button>
                  <button type="button" class="nexus-inpage-chip ${currentMode === 'universal' ? 'active' : ''}" data-mode="universal">Universal</button>
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
              <button type="button" class="nexus-inpage-btn-action" id="nexus-inpage-btn-cancel">Fechar</button>
              <button type="button" class="nexus-inpage-btn-save" id="nexus-inpage-btn-save" style="display:inline-flex; align-items:center; gap:6px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                Salvar Configurações
              </button>
            </div>
          </div>
        `;

        getNexusShadowRoot().appendChild(inpageOptionsBackdrop);

        // Blindagem de eventos para nao vazar cliques para a pagina
        ['click', 'pointerdown', 'mousedown', 'mouseup'].forEach(evtType => {
          inpageOptionsBackdrop.addEventListener(evtType, (e) => {
            e.stopPropagation();
          });
        });

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
    if (lower.includes('zip') || lower.includes('rar') || lower.includes('7z')) {
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

  function getExtensionFromMime(mimeType) {
    if (!mimeType || typeof mimeType !== 'string') return '';
    const cleanMime = mimeType.toLowerCase().split(';')[0].trim();
    const mimeMap = {
      'video/mp4': '.mp4',
      'video/x-matroska': '.mkv',
      'video/quicktime': '.mov',
      'video/x-msvideo': '.avi',
      'video/webm': '.webm',
      'video/x-flv': '.flv',
      'video/3gpp': '.3gp',
      'video/mpeg': '.mpeg',
      'audio/mpeg': '.mp3',
      'audio/mp4': '.m4a',
      'audio/x-m4a': '.m4a',
      'audio/flac': '.flac',
      'audio/wav': '.wav',
      'audio/ogg': '.ogg',
      'audio/aac': '.aac',
      'application/x-rar-compressed': '.rar',
      'application/vnd.rar': '.rar',
      'application/x-rar': '.rar',
      'application/rar': '.rar',
      'application/zip': '.zip',
      'application/x-zip-compressed': '.zip',
      'application/x-7z-compressed': '.7z',
      'application/x-tar': '.tar',
      'application/gzip': '.gz',
      'application/x-gzip': '.gz',
      'application/x-bzip2': '.bz2',
      'application/x-iso9660-image': '.iso',
      'application/x-diskcopy': '.dmg',
      'application/x-apple-diskimage': '.dmg',
      'application/pdf': '.pdf',
      'application/epub+zip': '.epub',
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/bmp': '.bmp',
      'application/vnd.android.package-archive': '.apk',
      'application/vnd.apple.installer+xml': '.pkg',
      'application/x-msdownload': '.exe'
    };
    return mimeMap[cleanMime] || '';
  }

  function getFileType(url) {
    const lower = url.toLowerCase();
    if (lower.match(/\.(mp4|mkv|avi|mov|wmv|webm|flv|m4v)/)) return '.Vídeo';
    if (lower.match(/\.rar/)) return '.Rar';
    if (lower.match(/\.zip/)) return '.Zip';
    if (lower.match(/\.7z/)) return '.7z';
    if (lower.match(/\.pkg(?:[?#]|$)/)) return '.Pkg';
    if (lower.match(/\.(tar|gz|bz2|xz|iso)/)) return '.Arquivo';
    if (lower.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)/)) return '.Foto';
    if (lower.match(/\.(torrent|magnet)/)) return '.Torrents';
    if (lower.match(/\.(mp3|wav|flac|aac|ogg|m4a)/)) return '.Áudio';
    return '.Arquivo';
  }
})();
