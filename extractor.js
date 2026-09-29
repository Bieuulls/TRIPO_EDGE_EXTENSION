/**
 * extractor.js - Versão 2.0 (Suporte a Múltiplos Pedaços / Corpo Inteiro)
 * Extrai TODAS as partes da malha (cabeça, roupas, sapatos, mochila, chapéu)
 * e junta tudo em um único arquivo .GLB completo!
 */
window.__extractTripoGLB = async function () {
  try {
    // 1. Localiza a aplicação Vue / Nuxt
    const appEl = document.querySelector('[data-v-app]') || document.querySelector('#__nuxt');
    if (!appEl || !appEl.__vue_app__) {
      throw new Error('Aplicação Tripo3D não encontrada nesta aba.');
    }
    const vueApp = appEl.__vue_app__;

    // 2. Localiza a rota e a instância interna
    const router = vueApp.config?.globalProperties?.$router;
    const route = router?.currentRoute?.value;
    const matched = route?.matched?.[0];
    if (!matched) throw new Error('Rota do modelo não encontrada.');

    const pageInternal = matched.instances?.default?._;
    if (!pageInternal) throw new Error('Instância interna da página não encontrada.');

    // 3. Busca por componente na árvore virtual
    function findComponentByName(vnode, targetName, depth = 0) {
      if (!vnode || depth > 40) return null;
      if (vnode.component) {
        const inst = vnode.component;
        const name = inst.type?.name || inst.type?.__name || '';
        if (name === targetName) return inst;
        const found = findComponentByName(inst.subTree, targetName, depth + 1);
        if (found) return found;
        return null;
      }
      if (Array.isArray(vnode.children)) {
        for (const child of vnode.children) {
          if (child && typeof child === 'object') {
            const found = findComponentByName(child, targetName, depth);
            if (found) return found;
          }
        }
      }
      return null;
    }

    // 4. Obtém o contexto TresJS / Three.js de forma ultra-resiliente
    let scene = null;

    // Tentativa 4.A: Direto no elemento Canvas (TresJS 5+)
    const canvasEl = document.querySelector('canvas[data-tres], canvas[data-engine*="three"], canvas');
    if (canvasEl) {
      if (canvasEl.__tres?.scene?.isScene) scene = canvasEl.__tres.scene;
      else if (canvasEl.__tres?.scene?.value?.isScene) scene = canvasEl.__tres.scene.value;
      else if (canvasEl.__three?.scene?.isScene) scene = canvasEl.__three.scene;
    }

    // Tentativa 4.B: Busca por nome do componente (Context, TresContext, TresCanvas)
    if (!scene) {
      const candidates = ['Context', 'TresContext', 'TresCanvas', 'TresScene'];
      for (const cName of candidates) {
        const comp = findComponentByName(pageInternal.subTree, cName);
        if (comp?.provides?.useTres) {
          const tresObj = comp.provides.useTres;
          const s = tresObj.scene?.value ?? tresObj.scene;
          if (s?.isScene) { scene = s; break; }
        }
      }
    }

    // Tentativa 4.C: Varredura profunda na árvore do Vue por qualquer THREE.Scene
    if (!scene) {
      function deepFindScene(vnode, depth = 0) {
        if (!vnode || depth > 50) return null;
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
          if (comp.setupState) {
            for (const k in comp.setupState) {
              const val = comp.setupState[k];
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

    if (!scene || !scene.isScene) {
      throw new Error('Cena 3D da tela não pôde ser localizada. Certifique-se de que o modelo 3D terminou de carregar no centro da tela.');
    }

    // 4.1. Tenta capturar o arquivo .GLB oficial original direto do cache do navegador
    try {
      const resources = performance.getEntriesByType('resource');
      const directGlb = resources.slice().reverse().find(r => 
        (r.name.includes('.glb') || r.name.includes('.gltf')) && 
        !r.name.includes('blob:') &&
        !r.name.includes('gizmo')
      );
      if (directGlb && directGlb.name) {
        console.log('[tripo-extract] Encontrada URL direta do GLB original:', directGlb.name);
        const resp = await fetch(directGlb.name);
        if (resp.ok) {
          const blob = await resp.blob();
          if (blob.size > 50000) { // Maior que 50KB é um modelo 3D real
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const modelName = route?.params?.id || 'tripo_character_original';
            const dlName = `tripo_STUDIO_OFFICIAL_${modelName}.glb`;
            a.download = dlName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 15000);
            return {
              success: true,
              filename: dlName,
              fileMB: (blob.size / (1024 * 1024)).toFixed(2),
              vertices: 100000,
              indices: 300000,
              partsCount: 1,
              isDirectStudioGLB: true
            };
          }
        }
      }
    } catch (directErr) {
      console.warn('[tripo-extract] Tentativa de download direto via URL falhou, usando Three.js Scene:', directErr);
    }

    // 5. Encontra todas as malhas da cena (inclusive ocultas na árvore)
    function findMeshes(obj, results = []) {
      if (!obj) return results;
      if (obj.isMesh) {
        results.push(obj);
      }
      if (obj.children) {
        for (const c of obj.children) findMeshes(c, results);
      }
      return results;
    }

    const allMeshes = findMeshes(scene);
    if (!allMeshes.length) throw new Error('Nenhuma malha 3D encontrada na cena.');

    // Procura prioritariamente o modelo unificado completo com UVs de fábrica
    const unifiedMesh = allMeshes.find(m => {
      const name = (m.name || '').toLowerCase();
      const count = m.geometry?.attributes?.position?.count ?? 0;
      return (name.startsWith('tripo_node_') || name === 'tripo_model' || name.includes('model') || name === 'mesh') 
             && !name.includes('part') && count > 5000;
    });

    let validMeshes = [];
    let isSingleUnified = false;

    if (unifiedMesh) {
      console.log('[tripo-extract] Modelo unificado original com UV perfeito encontrado:', unifiedMesh.name);
      validMeshes = [unifiedMesh];
      isSingleUnified = true;
    } else {
      // Se não houver malha unificada, pega as partes visíveis
      validMeshes = allMeshes.filter(m => {
        if (m.visible === false) return false;
        const count = m.geometry?.attributes?.position?.count ?? 0;
        const name = (m.name || '').toLowerCase();
        const parentName = (m.parent?.name || '').toLowerCase();

        if (name.includes('gizmo') || name.includes('control') || name.includes('ring') || 
            name.includes('axis') || name.includes('grid') || name.includes('helper')) {
          return false;
        }

        const isTripoPart = name.startsWith('tripo_') || parentName.startsWith('tripo_');
        if (isTripoPart) return count > 20;
        return count > 500 && !name.includes('circle') && !name.includes('torus');
      });
    }

    if (!validMeshes.length) throw new Error('Nenhuma malha válida do personagem encontrada.');

    console.log(`[tripo-extract] Exportando: ${isSingleUnified ? 'Modelo Original Unificado' : validMeshes.length + ' partes'}`);

    // 6. Procura a textura difusa em TODA a cena do Three.js
    let mainTextureImage = null;
    scene.traverse(obj => {
      if (!mainTextureImage && obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of mats) {
          const img = mat?.map?.image || mat?.map?.source?.data;
          if (img && (img.width > 64 || img.naturalWidth > 64)) {
            mainTextureImage = img;
            console.log('[tripo-extract] Textura encontrada em:', obj.name, `${img.width}x${img.height}`);
            break;
          }
        }
      }
    });

    // 7. Coleta e combina a geometria e cores de TODAS as partes
    let totalVertexCount = 0;
    let totalIndexCount = 0;

    for (const m of validMeshes) {
      const geo = m.geometry;
      const vCount = geo.attributes.position.count;
      totalVertexCount += vCount;
      if (geo.index) {
        totalIndexCount += geo.index.count;
      } else {
        totalIndexCount += vCount;
      }
    }

    const mergedPositions = new Float32Array(totalVertexCount * 3);
    const mergedUVs = new Float32Array(totalVertexCount * 2);
    const mergedColors = new Float32Array(totalVertexCount * 3); // Cores RGB por vértice
    const mergedIndices = new Uint32Array(totalIndexCount);

    let vOffset = 0;
    let iOffset = 0;
    let currentVertexBase = 0;

    for (const m of validMeshes) {
      m.updateMatrixWorld(true);
      const geo = m.geometry;
      const posArr = geo.attributes.position.array;
      const uvArr = geo.attributes.uv?.array;
      const colArr = geo.attributes.color?.array;
      const vCount = geo.attributes.position.count;

      // Cor padrão do material da peça
      let defaultR = 0.8, defaultG = 0.8, defaultB = 0.8;
      const mat = Array.isArray(m.material) ? m.material[0] : m.material;
      if (mat && mat.color) {
        defaultR = mat.color.r ?? 0.8;
        defaultG = mat.color.g ?? 0.8;
        defaultB = mat.color.b ?? 0.8;
      }

      // Aplica transformações aos vértices
      const matrix = m.matrixWorld;
      for (let i = 0; i < vCount; i++) {
        const x = posArr[i * 3];
        const y = posArr[i * 3 + 1];
        const z = posArr[i * 3 + 2];

        if (matrix) {
          const e = matrix.elements;
          const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
          mergedPositions[vOffset + i * 3] = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w;
          mergedPositions[vOffset + i * 3 + 1] = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w;
          mergedPositions[vOffset + i * 3 + 2] = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w;
        } else {
          mergedPositions[vOffset + i * 3] = x;
          mergedPositions[vOffset + i * 3 + 1] = y;
          mergedPositions[vOffset + i * 3 + 2] = z;
        }

        if (uvArr && (i * 2 + 1) < uvArr.length) {
          mergedUVs[(vOffset / 3) * 2 + i * 2] = uvArr[i * 2];
          mergedUVs[(vOffset / 3) * 2 + i * 2 + 1] = uvArr[i * 2 + 1];
        }

        // Preenche cores (do atributo de cor da malha ou da cor do material)
        if (colArr && (i * 3 + 2) < colArr.length) {
          mergedColors[vOffset + i * 3] = colArr[i * 3];
          mergedColors[vOffset + i * 3 + 1] = colArr[i * 3 + 1];
          mergedColors[vOffset + i * 3 + 2] = colArr[i * 3 + 2];
        } else {
          mergedColors[vOffset + i * 3] = defaultR;
          mergedColors[vOffset + i * 3 + 1] = defaultG;
          mergedColors[vOffset + i * 3 + 2] = defaultB;
        }
      }

      // Índices
      if (geo.index) {
        const idxArr = geo.index.array;
        for (let j = 0; j < idxArr.length; j++) {
          mergedIndices[iOffset + j] = idxArr[j] + currentVertexBase;
        }
        iOffset += idxArr.length;
      } else {
        for (let j = 0; j < vCount; j++) {
          mergedIndices[iOffset + j] = j + currentVertexBase;
        }
        iOffset += vCount;
      }

      vOffset += vCount * 3;
      currentVertexBase += vCount;
    }

    // 8. Extrai textura para PNG se encontrada
    let texturePNGBytes = null;
    if (mainTextureImage) {
      try {
        const offscreen = document.createElement('canvas');
        offscreen.width = mainTextureImage.width ?? mainTextureImage.naturalWidth ?? 2048;
        offscreen.height = mainTextureImage.height ?? mainTextureImage.naturalHeight ?? 2048;
        const ctx2d = offscreen.getContext('2d');
        ctx2d.drawImage(mainTextureImage, 0, 0);
        const pngBlob = await new Promise(res => offscreen.toBlob(res, 'image/png'));
        if (pngBlob) {
          texturePNGBytes = new Uint8Array(await pngBlob.arrayBuffer());
          console.log(`[tripo-extract] Textura PNG convertida com sucesso: ${(texturePNGBytes.byteLength / 1024).toFixed(0)} KB`);
        }
      } catch (texErr) {
        console.warn('[tripo-extract] Não foi possível extrair imagem bitmap da textura, usando cores de vértices:', texErr);
      }
    }

    // 9. Layout binário GLB (com posições, cores de vértice, UVs, índices e textura)
    const align4 = n => Math.ceil(n / 4) * 4;
    const posBytes = mergedPositions.byteLength;
    const colBytes = align4(mergedColors.byteLength);
    const uvBytes = align4(mergedUVs.byteLength);
    const idxBytes = align4(mergedIndices.byteLength);
    const texBytes = texturePNGBytes ? align4(texturePNGBytes.byteLength) : 0;

    const colOffset = align4(posBytes);
    const uvOffset = colOffset + colBytes;
    const idxOffset = uvOffset + uvBytes;
    const texOffset = idxOffset + idxBytes;
    const totalBin = align4(texOffset + texBytes);

    // 10. Constrói JSON do GLTF
    let minPos = [Infinity, Infinity, Infinity];
    let maxPos = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < mergedPositions.length; i += 3) {
      minPos[0] = Math.min(minPos[0], mergedPositions[i]);
      minPos[1] = Math.min(minPos[1], mergedPositions[i+1]);
      minPos[2] = Math.min(minPos[2], mergedPositions[i+2]);
      maxPos[0] = Math.max(maxPos[0], mergedPositions[i]);
      maxPos[1] = Math.max(maxPos[1], mergedPositions[i+1]);
      maxPos[2] = Math.max(maxPos[2], mergedPositions[i+2]);
    }

    const accessors = [];
    const bufferViews = [];

    // POSITION (accessor 0)
    bufferViews.push({ buffer: 0, byteOffset: 0, byteLength: posBytes, target: 34962 });
    accessors.push({
      bufferView: 0, byteOffset: 0, componentType: 5126, count: totalVertexCount,
      type: 'VEC3', min: minPos, max: maxPos
    });

    // COLOR_0 (accessor 1 - Cores dos vértices / peças)
    bufferViews.push({ buffer: 0, byteOffset: colOffset, byteLength: mergedColors.byteLength, target: 34962 });
    accessors.push({
      bufferView: 1, byteOffset: 0, componentType: 5126, count: totalVertexCount,
      type: 'VEC3'
    });

    // TEXCOORD_0 (accessor 2)
    bufferViews.push({ buffer: 0, byteOffset: uvOffset, byteLength: mergedUVs.byteLength, target: 34962 });
    accessors.push({
      bufferView: 2, byteOffset: 0, componentType: 5126, count: totalVertexCount,
      type: 'VEC2'
    });

    // INDEX (accessor 3)
    bufferViews.push({ buffer: 0, byteOffset: idxOffset, byteLength: mergedIndices.byteLength, target: 34963 });
    accessors.push({
      bufferView: 3, byteOffset: 0, componentType: 5125, count: totalIndexCount,
      type: 'SCALAR'
    });

    // TEXTURE buffer view
    let imageBufferView = null;
    if (texturePNGBytes) {
      imageBufferView = bufferViews.length;
      bufferViews.push({ buffer: 0, byteOffset: texOffset, byteLength: texturePNGBytes.byteLength });
    }

    const primitive = {
      attributes: { POSITION: 0, COLOR_0: 1, TEXCOORD_0: 2 },
      indices: 3,
      ...(imageBufferView !== null ? { material: 0 } : { material: 0 })
    };

    const gltf = {
      asset: { version: '2.0', generator: 'tripo3d-full-character-extractor' },
      scene: 0,
      scenes: [{ name: 'Scene', nodes: [0] }],
      nodes: [{ name: 'tripo_full_character', mesh: 0 }],
      meshes: [{ name: 'tripo_mesh', primitives: [primitive] }],
      accessors,
      bufferViews,
      buffers: [{ byteLength: totalBin }],
      materials: [{
        name: 'tripo_character_mat',
        pbrMetallicRoughness: {
          ...(imageBufferView !== null ? { baseColorTexture: { index: 0 } } : {}),
          metallicFactor: 0.0,
          roughnessFactor: 0.6
        },
        doubleSided: true
      }],
      ...(imageBufferView !== null ? {
        textures: [{ source: 0 }],
        images: [{ mimeType: 'image/png', bufferView: imageBufferView }]
      } : {})
    };

    // 11. Monta GLB Binário
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
    const binStart = off;

    buf.set(new Uint8Array(mergedPositions.buffer), binStart);
    buf.set(new Uint8Array(mergedColors.buffer), binStart + colOffset);
    buf.set(new Uint8Array(mergedUVs.buffer), binStart + uvOffset);
    buf.set(new Uint8Array(mergedIndices.buffer), binStart + idxOffset);
    if (texturePNGBytes) buf.set(texturePNGBytes, binStart + texOffset);

    // 11. Dispara o download
    const fileMB = (totalSize / 1024 / 1024).toFixed(2);
    const modelId = window.location.pathname.split('/').filter(Boolean).pop() || 'character_full';
    const filename = `tripo_FULL_${modelId}.glb`;
    const blobUrl = URL.createObjectURL(new Blob([glb], { type: 'model/gltf-binary' }));

    const anchor = document.createElement('a');
    anchor.href = blobUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);

    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);

    return {
      success: true,
      filename,
      fileMB,
      vertices: totalVertexCount,
      indices: totalIndexCount,
      partsCount: validMeshes.length
    };

  } catch (err) {
    return {
      success: false,
      error: err.message || String(err)
    };
  }
};
