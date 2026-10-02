document.addEventListener('DOMContentLoaded', async () => {
  const statusBadge = document.getElementById('statusBadge');
  const statusText = document.getElementById('statusText');
  const blenderBadge = document.getElementById('blenderBadge');
  const blenderStatusText = document.getElementById('blenderStatusText');
  const btnDownloadAll = document.getElementById('btnDownloadAll');
  const btnSendBlender = document.getElementById('btnSendBlender');
  const detailsCard = document.getElementById('detailsCard');
  const txtModelCount = document.getElementById('txtModelCount');
  const modelList = document.getElementById('modelList');
  const logBox = document.getElementById('logBox');

  let activeTab = null;
  let detectedTitle = 'tripo_model';
  let foundModels = []; // [{ url, filename, type, sizeLabel }]
  let blenderConnected = false;

  function setStatus(text, type = 'normal') {
    if (!statusText || !statusBadge) return;
    statusText.textContent = text;
    statusBadge.className = 'status-badge';
    if (type === 'ready') statusBadge.classList.add('ready');
    if (type === 'error') statusBadge.classList.add('error');
  }

  function setBlenderStatus(connected, version = '') {
    blenderConnected = connected;
    if (!blenderBadge || !blenderStatusText) return;
    if (connected) {
      blenderBadge.className = 'blender-badge connected';
      blenderStatusText.textContent = `🟢 Blender Conectado (${version || 'Porta 8766'})`;
      if (btnSendBlender) btnSendBlender.disabled = (foundModels.length === 0);
    } else {
      blenderBadge.className = 'blender-badge';
      blenderStatusText.textContent = '⚪ Blender Offline (Inicie o script)';
      if (btnSendBlender) btnSendBlender.disabled = true;
    }
  }

  function showLog(msg) {
    if (logBox) {
      logBox.style.display = 'block';
      logBox.textContent = msg;
    }
  }

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

  function extractSlug(url) {
    if (!url) return 'tripo_model';
    try {
      const u = new URL(url);
      const parts = u.pathname.split('/').filter(Boolean);
      return parts[parts.length - 1] || 'tripo_model';
    } catch (e) {
      return 'tripo_model';
    }
  }

  async function checkActiveTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url) {
        setStatus('Aba não identificada', 'error');
        if (btnDownloadAll) btnDownloadAll.disabled = true;
        if (btnSendBlender) btnSendBlender.disabled = true;
        return null;
      }

      if (tab.url.includes('tripo3d.ai')) {
        setStatus('Escaneando modelos na página...', 'normal');
        activeTab = tab;
        detectedTitle = extractSlug(tab.url);
        await scanTabForAllModels(tab.id);
        return tab;
      } else {
        setStatus('Abra o studio.tripo3d.ai', 'normal');
        if (btnDownloadAll) btnDownloadAll.disabled = true;
        if (btnSendBlender) btnSendBlender.disabled = true;
        return null;
      }
    } catch (err) {
      setStatus('Erro ao verificar aba', 'error');
      return null;
    }
  }

  // Escaneia a aba para encontrar TODOS os arquivos 3D (.glb, .fbx, .obj)
  async function scanTabForAllModels(tabId) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        world: 'MAIN',
        func: (baseSlug) => {
          const found = [];
          const seenUrls = new Set();

          function addUrl(rawUrl, sourceHint) {
            if (!rawUrl || typeof rawUrl !== 'string') return;
            const clean = rawUrl.replace(/\\u002F/g, '/').replace(/&amp;/g, '&');
            if (seenUrls.has(clean)) return;
            seenUrls.add(clean);

            const lower = clean.toLowerCase();
            let type = 'GLB';
            if (lower.includes('.fbx')) type = 'FBX';
            else if (lower.includes('.obj')) type = 'OBJ';
            else if (lower.includes('.stl')) type = 'STL';

            // Determina nome amigável
            let baseFile = clean.split('?')[0].split('/').pop() || `${baseSlug}.${type.toLowerCase()}`;
            if (baseFile.includes('output_point_cloud')) return; // ignora point clouds brutos se houver
            if (baseFile.includes('gizmo')) return;

            let tag = type;
            if (lower.includes('rig')) tag = 'FBX Rigged';
            else if (lower.includes('meshopt') || lower.includes('texture')) tag = 'GLB PBR Mesh';
            else if (lower.includes('retopology')) tag = 'GLB Quad Remesh';

            found.push({
              url: clean,
              filename: `${baseSlug}_${baseFile}`,
              baseName: baseFile,
              type: tag,
              rawType: type,
              source: sourceHint
            });
          }

          // 1. Procura no cache de rede (PerformanceResourceTiming)
          try {
            const res = performance.getEntriesByType('resource') || [];
            for (const r of res) {
              if (r.name && (r.name.includes('.glb') || r.name.includes('.fbx') || r.name.includes('.obj'))) {
                if (!r.name.includes('blob:')) {
                  addUrl(r.name, 'Cache de Rede');
                }
              }
            }
          } catch(e) {}

          // 2. Procura nos scripts HTML e Nuxt Data
          try {
            const scripts = Array.from(document.querySelectorAll('script'));
            for (const s of scripts) {
              const text = s.textContent || '';
              if (text.includes('.glb') || text.includes('.fbx') || text.includes('.obj')) {
                const matches = text.match(/https?:\/\/[^\s"'<>]+\.(?:glb|gltf|fbx|obj)[^\s"'<>]*/gi);
                if (matches) {
                  for (const m of matches) addUrl(m, 'Nuxt Payload');
                }
              }
            }
          } catch(e) {}

          // 3. Procura no Nuxt State se disponível
          try {
            const dataStr = JSON.stringify(window.__NUXT_DATA__ || window.__NUXT__ || {});
            const matches = dataStr.match(/https?:\/\/[^\s"'<>]+\.(?:glb|gltf|fbx|obj)[^\s"'<>]*/gi);
            if (matches) {
              for (const m of matches) addUrl(m, 'Nuxt State');
            }
          } catch(e) {}

          return found;
        },
        args: [detectedTitle]
      });

      const list = results?.[0]?.result || [];
      foundModels = list;

      if (foundModels.length > 0) {
        setStatus(`🟢 ${foundModels.length} Modelo(s) Encontrado(s)!`, 'ready');
        if (btnDownloadAll) btnDownloadAll.disabled = false;
        if (blenderConnected && btnSendBlender) btnSendBlender.disabled = false;
        renderModelList();
      } else {
        setStatus('Pronto para extrair da tela!', 'ready');
        if (btnDownloadAll) btnDownloadAll.disabled = false;
      }
    } catch (e) {
      if (btnDownloadAll) btnDownloadAll.disabled = false;
    }
  }

  function renderModelList() {
    if (!detailsCard || !modelList) return;
    detailsCard.style.display = 'block';
    if (txtModelCount) txtModelCount.textContent = `${foundModels.length} arquivo(s)`;
    modelList.innerHTML = '';

    foundModels.forEach((m, idx) => {
      const item = document.createElement('div');
      item.className = 'model-item';

      const tagClass = m.rawType === 'FBX' ? 'tag-fbx' : (m.rawType === 'OBJ' ? 'tag-obj' : 'tag-glb');

      item.innerHTML = `
        <div class="model-info">
          <span class="model-type-tag ${tagClass}">${m.type}</span>
          <span class="model-name" title="${m.baseName}">${m.baseName}</span>
        </div>
        <button class="btn-item-dl" data-idx="${idx}">📥 Baixar</button>
      `;

      item.querySelector('button').addEventListener('click', () => {
        downloadSingleModel(m);
      });

      modelList.appendChild(item);
    });
  }

  function downloadSingleModel(m) {
    chrome.runtime.sendMessage({
      action: 'DOWNLOAD_3D_MODEL',
      url: m.url,
      filename: m.filename
    }, (res) => {
      showLog(`Iniciado download de: ${m.filename}`);
    });
  }

  // BAIXAR TODOS OS MODELOS ENCONTRADOS
  if (btnDownloadAll) {
    btnDownloadAll.addEventListener('click', async () => {
      btnDownloadAll.disabled = true;
      const oldHtml = btnDownloadAll.innerHTML;
      btnDownloadAll.innerHTML = '<span>⏳</span> Baixando Tudo...';

      try {
        if (foundModels.length > 0) {
          for (let i = 0; i < foundModels.length; i++) {
            const m = foundModels[i];
            chrome.runtime.sendMessage({
              action: 'DOWNLOAD_3D_MODEL',
              url: m.url,
              filename: m.filename
            });
            // Pequeno delay entre downloads para a fila do Edge
            await new Promise(r => setTimeout(r, 400));
          }
          btnDownloadAll.innerHTML = '<span>✔</span> Todos Baixados!';
          showLog(`Sucesso! ${foundModels.length} modelo(s) salvos na pasta Downloads!`);
          return;
        }

        // Se nenhum arquivo direto na lista, executa extractor.js na tela
        btnDownloadAll.innerHTML = '<span>⏳</span> Extraindo da tela...';
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) throw new Error('Aba não encontrada');

        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          world: 'MAIN',
          files: ['extractor.js']
        });

        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          world: 'MAIN',
          func: async () => {
            if (typeof window.__extractTripoGLB === 'function') {
              return await window.__extractTripoGLB();
            }
            return { success: false, error: 'Função de extração não encontrada.' };
          }
        });

        const res = results?.[0]?.result;
        if (res && res.success) {
          btnDownloadAll.innerHTML = '<span>✔</span> Baixado com Sucesso!';
          showLog(`Sucesso! ${res.filename} salvo em Downloads!`);
        } else {
          throw new Error(res?.error || 'Falha ao extrair da tela');
        }

      } catch (err) {
        btnDownloadAll.innerHTML = '<span>❌</span> Erro';
        showLog('Erro: ' + err.message);
      } finally {
        setTimeout(() => {
          btnDownloadAll.innerHTML = oldHtml;
          btnDownloadAll.disabled = false;
        }, 4000);
      }
    });
  }

  // ENVIAR GLB PRINCIPAL PRO BLENDER
  if (btnSendBlender) {
    btnSendBlender.addEventListener('click', async () => {
      btnSendBlender.disabled = true;
      const oldHtml = btnSendBlender.innerHTML;
      btnSendBlender.innerHTML = '<span>⏳</span> Enviando pro Blender...';

      try {
        const glbModel = foundModels.find(m => m.rawType === 'GLB') || foundModels[0];
        if (glbModel) {
          const resp = await fetch('http://127.0.0.1:8766/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: glbModel.url, name: detectedTitle })
          });
          if (resp.ok) {
            btnSendBlender.innerHTML = '<span>✔</span> Modelo no Blender!';
            showLog(`Sucesso! ${glbModel.filename} importado no Blender.`);
            return;
          }
        }
        btnDownloadAll.click();
      } catch (err) {
        btnSendBlender.innerHTML = '<span>❌</span> Erro';
        showLog('Erro: ' + err.message);
      } finally {
        setTimeout(() => {
          btnSendBlender.innerHTML = oldHtml;
          btnSendBlender.disabled = false;
        }, 4000);
      }
    });
  }

  await checkActiveTab();
  await checkBlenderBridge();
  setInterval(checkBlenderBridge, 3000);
});
