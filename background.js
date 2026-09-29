// Background Service Worker para o Edge
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Tripo Downloader Pro] Instalado.');
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }
});

chrome.action.onClicked.addListener((tab) => {
  if (chrome.sidePanel && chrome.sidePanel.open) {
    chrome.sidePanel.open({ windowId: tab.windowId });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'DOWNLOAD_3D_MODEL') {
    chrome.downloads.download({
      url: request.url,
      filename: request.filename || 'tripo_model.glb',
      conflictAction: 'uniquify',
      saveAs: false
    }, (id) => {
      if (chrome.runtime.lastError) {
        console.error('Erro download:', chrome.runtime.lastError);
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        console.log('Download iniciado:', id);
        sendResponse({ success: true, downloadId: id });
      }
    });
    return true;
  }
});
