document.addEventListener('DOMContentLoaded', async () => {
  const statusBadge = document.getElementById('statusBadge');
  const statusText = document.getElementById('statusText');
  const blenderBadge = document.getElementById('blenderBadge');
  const blenderStatusText = document.getElementById('blenderStatusText');
  const btnDownload = document.getElementById('btnDownload');
  const btnSendBlender = document.getElementById('btnSendBlender');
  const detailsCard = document.getElementById('detailsCard');
  const txtFilename = document.getElementById('txtFilename');
  const logBox = document.getElementById('logBox');

  let activeTab = null;
  let apiModelUrl = null;
  let detectedTitle = 'tripo_model';
  let blenderConnected = false;

  function setStatus(text, type = 'normal') {
    statusText.textContent = text;
    statusBadge.className = 'status-badge';
    if (type === 'ready') statusBadge.classList.add('ready');
    if (type === 'error') statusBadge.classList.add('error');
  }

  function setBlenderStatus(connected, version = '') {
    blenderConnected = connected;
    if (connected) {
      blenderBadge.className = 'blender-badge connected';
      blenderStatusText.textContent = `🟢 Blender Conectado (${version || 'Porta 8766'})`;
      btnSendBlender.disabled = !apiModelUrl;
    } else {
      blenderBadge.className = 'blender-badge';
      blenderStatusText.textContent = '⚪ Blender Offline (Inicie o script)';
      btnSendBlender.disabled = true;
    }
  }

  function showLog(msg) {
    if (logBox) {
      logBox.style.display = 'block';
      logBox.textContent = msg;
    }
  }

  // 1. Verificar conexão com o Blender HTTP Bridge
  async function checkBlenderBridge() {
    try {
      const resp = await fetch('http://127.0.0.1:8766/status');
      if (resp.ok) {
        const data = await resp.json();
        setBlenderStatus(true, `v${data.blender_version}`);
      } else {
        setBlenderStatus(false);
      }
    } catch (e) {
      setBlenderStatus(false);
    }
  }

  function extractUUID(url) {
    if (!url) return null;
    const m = url.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    return m ? m[0] : null;
  }

  // 2. Verificar aba ativa do Tripo
  async function checkActiveTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url) {
        setStatus('Aba não identificada', 'error');
        btnDownload.disabled = true;
        btnSendBlender.disabled = true;
        return null;
      }

      if (tab.url.includes('tripo3d.ai')) {
        setStatus('Pronto! Página do Tripo detectada', 'ready');
        activeTab = tab;

        const uuid = extractUUID(tab.url);
        if (uuid) {
          checkProjectViaTab(tab.id, uuid, tab.url);
        }
        return tab;
      } else {
        setStatus('Abra o studio.tripo3d.ai', 'normal');
        btnDownload.disabled = true;
        btnSendBlender.disabled = true;
        return null;
      }
    } catch (err) {
      setStatus('Erro ao verificar aba', 'error');
      return null;
    }
  }

  // 3. Consultar API do Tripo de dentro da aba (world: MAIN)
  async function checkProjectViaTab(tabId, uuid, pageUrl) {
    try {
      setStatus('Identificando modelo na página...', 'normal');
      const results = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        world: 'MAIN',
        func: async (projId) => {
          try {
            const res = await window.fetch(`https://api.tripo3d.ai/v2/studio/project/detail/v3/${projId}`);
            if (!res.ok) return { error: `HTTP ${res.status}` };
            return { success: true, json: await res.json() };
          } catch(e) {
            return { error: e.message };
          }
        },
        args: [uuid]
      });

      const res = results?.[0]?.result;
      if (res && res.success && res.json) {
        const data = res.json.data || {};
        try {
          const parts = pageUrl.split('/');
          const slug = parts[parts.length - 1];
          detectedTitle = slug.replace(`-${uuid}`, '');
        } catch(e) {}

        function findGlb(obj) {
          if (!obj || typeof obj !== 'object') return null;
          for (const k in obj) {
            const val = obj[k];
            if (typeof val === 'string' && val.startsWith('http') && val.includes('.glb') && val.includes('tripo-data')) {
              return val;
            }
            if (typeof val === 'object') {
              const f = findGlb(val);
              if (f) return f;
            }
          }
          return null;
        }

        const directUrl = findGlb(data);
        if (directUrl) {
          apiModelUrl = directUrl;
          setStatus('🟢 Modelo Pronto!', 'ready');
          btnDownload.disabled = false;
          if (blenderConnected) btnSendBlender.disabled = false;

          detailsCard.style.display = 'block';
          txtFilename.textContent = detectedTitle;
          showLog('Arquivo oficial PBR pronto para baixar ou enviar pro Blender.');
          return;
        }
      }

      btnDownload.disabled = false;
      setStatus('Pronto para extrair da tela!', 'ready');
    } catch(err) {
      btnDownload.disabled = false;
    }
  }

  // 4. AÇÃO: ENVIAR DIRETO PRO BLENDER COM 1 CLIQUE
  btnSendBlender.addEventListener('click', async () => {
    if (!apiModelUrl) return;
    btnSendBlender.disabled = true;
    const oldHtml = btnSendBlender.innerHTML;
    btnSendBlender.innerHTML = '<span>⏳</span> Enviando pro Blender...';

    try {
      const resp = await fetch('http://127.0.0.1:8766/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: apiModelUrl,
          name: detectedTitle
        })
      });

      if (resp.ok) {
        btnSendBlender.innerHTML = '<span>✔</span> Modelo Apareceu no Blender!';
        showLog(`Sucesso! ${detectedTitle} foi importado direto na cena do seu Blender em tempo real.`);
      } else {
        throw new Error('Falha no servidor Blender');
      }
    } catch (err) {
      btnSendBlender.innerHTML = '<span>❌</span> Erro de Conexão';
      showLog('Certifique-se de que o Blender está aberto com o bridge ativo.');
    } finally {
      setTimeout(() => {
        btnSendBlender.innerHTML = oldHtml;
        btnSendBlender.disabled = false;
      }, 4000);
    }
  });

  // 5. AÇÃO: BAIXAR ARQUIVO LOCALMENTE
  btnDownload.addEventListener('click', async () => {
    if (!apiModelUrl) return;
    btnDownload.disabled = true;
    const oldHtml = btnDownload.innerHTML;
    btnDownload.innerHTML = '<span>⏳</span> Baixando...';

    chrome.runtime.sendMessage({
      action: 'DOWNLOAD_3D_MODEL',
      url: apiModelUrl,
      filename: `${detectedTitle}.glb`
    }, (res) => {
      btnDownload.innerHTML = '<span>✔</span> Salvo em Downloads!';
      showLog(`Arquivo ${detectedTitle}.glb salvo na sua pasta Downloads.`);
      setTimeout(() => {
        btnDownload.innerHTML = oldHtml;
        btnDownload.disabled = false;
      }, 3500);
    });
  });

  // Iniciar checagens
  await checkBlenderBridge();
  await checkActiveTab();
  setInterval(checkBlenderBridge, 4000);

  chrome.tabs.onActivated.addListener(checkActiveTab);
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'complete') checkActiveTab();
  });
});


// Abrir link do GitHub em nova aba no Edge/Chrome
function openGithubTab(e) {
  if (e) e.preventDefault();
  const url = 'https://github.com/Bieuulls/TRIPO_EDGE_EXTENSION';
  if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
    chrome.tabs.create({ url: url });
  } else {
    window.open(url, '_blank');
  }
}

document.getElementById('btnGithubTop')?.addEventListener('click', openGithubTab);
document.getElementById('btnGithubBottom')?.addEventListener('click', openGithubTab);
