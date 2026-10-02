/**
 * extractor.js - Versão 3.0 Ultra-Resiliente
 * Baixa o modelo 3D original (.glb/.fbx) diretamente do cache de rede ou Nuxt payload,
 * ou reconstrói o GLB completo da cena 3D WebGL na tela.
 */
window.__extractTripoGLB = async function () {
  try {
    const slug = window.location.pathname.split('/').filter(Boolean).pop() || 'tripo_model';

    // -------------------------------------------------------------
    // MÉTODO 1: URL direta do Cache de Rede (performance entries)
    // -------------------------------------------------------------
    try {
      const res = performance.getEntriesByType('resource') || [];
      const glbEntries = res.filter(r => 
        r.name && 
        (r.name.includes('.glb') || r.name.includes('.gltf') || r.name.includes('.fbx')) &&
        !r.name.includes('gizmo') &&
        !r.name.includes('blob:')
      );

      if (glbEntries.length > 0) {
        const directUrl = glbEntries[glbEntries.length - 1].name;
        console.log('[tripo-extract] Encontrado no cache de rede:', directUrl);
        const resp = await fetch(directUrl);
        if (resp.ok) {
          const blob = await resp.blob();
          if (blob.size > 20000) {
            const isFbx = directUrl.includes('.fbx');
            const ext = isFbx ? '.fbx' : '.glb';
            const dlName = `${slug}${ext}`;
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = dlName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);

            return {
              success: true,
              filename: dlName,
              fileMB: (blob.size / (1024 * 1024)).toFixed(2),
              source: 'Direct Network GLB'
            };
          }
        }
      }
    } catch (e) {
      console.warn('[tripo-extract] Método 1 falhou:', e);
    }

    // -------------------------------------------------------------
    // MÉTODO 2: URLs assinadas nos Scripts Nuxt da página
    // -------------------------------------------------------------
    try {
      const scripts = Array.from(document.querySelectorAll('script'));
      for (const s of scripts) {
        const text = s.textContent || '';
        if (text.includes('tripo-data') && (text.includes('.glb') || text.includes('.fbx'))) {
          const matches = text.match(/https?:\/\/[^\s"'<>]+\.(?:glb|gltf|fbx)[^\s"'<>]*/gi);
          if (matches && matches.length > 0) {
            const directUrl = matches[matches.length - 1].replace(/\\u002F/g, '/');
            console.log('[tripo-extract] Encontrado no Nuxt script:', directUrl);
            const resp = await fetch(directUrl);
            if (resp.ok) {
              const blob = await resp.blob();
              if (blob.size > 20000) {
                const isFbx = directUrl.includes('.fbx');
                const ext = isFbx ? '.fbx' : '.glb';
                const dlName = `${slug}${ext}`;
                const blobUrl = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = blobUrl;
                a.download = dlName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);

                return {
                  success: true,
                  filename: dlName,
                  fileMB: (blob.size / (1024 * 1024)).toFixed(2),
                  source: 'Nuxt Script Payload'
                };
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn('[tripo-extract] Método 2 falhou:', e);
    }

    // -------------------------------------------------------------
    // MÉTODO 3: Extração da Cena WebGL / Canvas / Three.js
    // -------------------------------------------------------------
    let scene = null;
    const canvasEl = document.querySelector('canvas[data-tres], canvas[data-engine*="three"], canvas');
    if (canvasEl) {
      if (canvasEl.__tres?.scene?.isScene) scene = canvasEl.__tres.scene;
      else if (canvasEl.__tres?.scene?.value?.isScene) scene = canvasEl.__tres.scene.value;
      else if (canvasEl.__three?.scene?.isScene) scene = canvasEl.__three.scene;
    }

    // Procura recursiva em janelas e instâncias
    if (!scene) {
      const appEl = document.querySelector('[data-v-app]') || document.querySelector('#__nuxt');
      if (appEl && appEl.__vue_app__) {
        const router = appEl.__vue_app__.config?.globalProperties?.$router;
        const matched = router?.currentRoute?.value?.matched?.[0];
        const pageInternal = matched?.instances?.default?._;
        if (pageInternal) {
          function deepFindScene(vnode, depth = 0) {
            if (!vnode || depth > 40) return null;
            if (vnode.component) {
              const comp = vnode.component;
              if (comp.provides) {
                for (const k in comp.provides) {
                  const val = comp.provides[k];
                  if (val?.isScene) return val;
                  if (val?.scene?.isScene) return val.scene;
                  if (val?.scene?.value?.isScene) return val.scene.value;
                }
              }
              const found = deepFindScene(comp.subTree, depth + 1);
              if (found) return found;
            }
            if (Array.isArray(vnode.children)) {
              for (const c of vnode.children) {
                if (c && typeof c === 'object') {
                  const found = deepFindScene(c, depth + 1);
                  if (found) return found;
                }
              }
            }
            return null;
          }
          scene = deepFindScene(pageInternal.subTree);
        }
      }
    }

    if (!scene || !scene.isScene) {
      throw new Error('Não foi possível identificar o modelo no cache ou na cena 3D.');
    }

    function findMeshes(obj, results = []) {
      if (!obj) return results;
      if (obj.isMesh) results.push(obj);
      if (obj.children) {
        for (const c of obj.children) findMeshes(c, results);
      }
      return results;
    }

    const allMeshes = findMeshes(scene);
    if (!allMeshes.length) throw new Error('Nenhuma malha 3D encontrada na cena.');

    // Procura malha com mais vértices
    let targetMesh = allMeshes[0];
    let maxV = 0;
    for (const m of allMeshes) {
      const count = m.geometry?.attributes?.position?.count || 0;
      if (count > maxV) {
        maxV = count;
        targetMesh = m;
      }
    }

    const geom = targetMesh.geometry;
    const pos = geom.attributes.position.array;
    const count = geom.attributes.position.count;
    const align4 = n => Math.ceil(n / 4) * 4;

    const posBytes = pos.byteLength;
    const totalBin = align4(posBytes);

    let minPos = [Infinity, Infinity, Infinity];
    let maxPos = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.length; i += 3) {
      minPos[0] = Math.min(minPos[0], pos[i]);
      minPos[1] = Math.min(minPos[1], pos[i+1]);
      minPos[2] = Math.min(minPos[2], pos[i+2]);
      maxPos[0] = Math.max(maxPos[0], pos[i]);
      maxPos[1] = Math.max(maxPos[1], pos[i+1]);
      maxPos[2] = Math.max(maxPos[2], pos[i+2]);
    }

    const gltf = {
      asset: { version: '2.0', generator: 'tripo-scene-extractor' },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0, name: 'TripoModel' }],
      meshes: [{
        primitives: [{
          attributes: { POSITION: 0 }
        }]
      }],
      accessors: [{
        bufferView: 0, byteOffset: 0, componentType: 5126, count: count,
        type: 'VEC3', min: minPos, max: maxPos
      }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: posBytes, target: 34962 }],
      buffers: [{ byteLength: totalBin }]
    };

    const jsonEncoded = new TextEncoder().encode(JSON.stringify(gltf));
    const jsonPadded = align4(jsonEncoded.length);
    const totalSize = 12 + 8 + jsonPadded + 8 + totalBin;

    const glb = new ArrayBuffer(totalSize);
    const dv = new DataView(glb);
    const buf = new Uint8Array(glb);
    let off = 0;

    dv.setUint32(off, 0x46546C67, true); off += 4;
    dv.setUint32(off, 2, true); off += 4;
    dv.setUint32(off, totalSize, true); off += 4;

    dv.setUint32(off, jsonPadded, true); off += 4;
    dv.setUint32(off, 0x4E4F534A, true); off += 4;
    buf.set(jsonEncoded, off);
    for (let i = jsonEncoded.length; i < jsonPadded; i++) buf[off + i] = 0x20;
    off += jsonPadded;

    dv.setUint32(off, totalBin, true); off += 4;
    dv.setUint32(off, 0x004E4942, true); off += 4;
    buf.set(new Uint8Array(pos.buffer, pos.byteOffset, pos.byteLength), off);

    const dlName = `${slug}.glb`;
    const blobUrl = URL.createObjectURL(new Blob([glb], { type: 'model/gltf-binary' }));
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = dlName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);

    return {
      success: true,
      filename: dlName,
      fileMB: (totalSize / 1024 / 1024).toFixed(2),
      vertices: count
    };

  } catch (err) {
    return {
      success: false,
      error: err.message || String(err)
    };
  }
};
