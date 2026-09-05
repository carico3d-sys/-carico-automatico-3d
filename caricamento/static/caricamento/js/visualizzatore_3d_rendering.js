/**
 * Visualizzatore 3D — Rendering: contenitore, oggetti, etichette
 *
 * buildContainer, buildOggetti, createTextSprite,
 * evidenziaOggetti3D, resetEvidenziaVincolo.
 *
 * Depends on: visualizzatore_3d_core.js (STATE, SCENE, helpers)
 */

// =============================================================================
// COSTRUZIONE CONTENITORE
// =============================================================================
// IMPORTANTE: Three.js ha Y verso l'alto, mentre i nostri modelli Django
// usano Z per l'altezza. Convertiamo:
//   API.x (lunghezza) → Three.js X (larghezza)
//   API.y (larghezza) → Three.js Z (profondità)
//   API.z (altezza)   → Three.js Y (altezza / up)

function tjsX(api) { return api.x; }
function tjsY(api) { return api.z; }
function tjsZ(api) { return api.y; }

function buildContainer(dimensioniCm, nome) {
    const lx = tjsX(dimensioniCm);  // lunghezza
    const ly = tjsY(dimensioniCm);  // altezza  (API.z → Three.js Y = up)
    const lz = tjsZ(dimensioniCm);  // larghezza (API.y → Three.js Z)
    const gruppo = new THREE.Group();

    // Pareti semitrasparenti — tema chiaro
    const wallMat = new THREE.MeshPhysicalMaterial({
        color: 0x447e9b,
        transparent: true,
        opacity: 0.12,
        roughness: 0.1,
        metalness: 0.0,
        side: THREE.DoubleSide,
        depthWrite: false,
    });

    const wallGeo = new THREE.BoxGeometry(lx, ly, lz);
    const walls = new THREE.Mesh(wallGeo, wallMat);
    walls.position.set(lx / 2, ly / 2, lz / 2);
    gruppo.add(walls);

    // Bordi (wireframe con glow)
    const edgeMat = new THREE.LineBasicMaterial({
        color: 0x447e9b,
        transparent: true,
        opacity: 0.6,
    });
    const edgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(lx, ly, lz));
    const edges = new THREE.LineSegments(edgeGeo, edgeMat);
    edges.position.set(lx / 2, ly / 2, lz / 2);
    gruppo.add(edges);

    // Spigoli rinforzati (più visibili)
    const cornerMat = new THREE.LineBasicMaterial({
        color: 0x447e9b,
        transparent: true,
        opacity: 0.25,
    });
    const cornerGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(lx + 4, ly + 4, lz + 4));
    const corners = new THREE.LineSegments(cornerGeo, cornerMat);
    corners.position.set(lx / 2, ly / 2, lz / 2);
    gruppo.add(corners);

    // Etichetta dimensioni (sprite) — mostra le dimensioni reali del container
    const label = createTextSprite(
        `${(dimensioniCm.x / 100).toFixed(1)}m × ${(dimensioniCm.y / 100).toFixed(1)}m × ${(dimensioniCm.z / 100).toFixed(1)}m`,
        { fontSize: 28, color: '#556', bgColor: 'rgba(240,242,245,0.9)' }
    );
    label.position.set(lx / 2, -30, lz / 2);
    gruppo.add(label);
    STATE._containerLabelSprite = label;

    // --- Decal camera-facing sul contenitore, in basso su ogni faccia ---
    if (nome) {
        const decalCanvas = document.createElement('canvas');
        const decalCtx = decalCanvas.getContext('2d');
        const decalFontSize = 40;

        decalCtx.font = `bold ${decalFontSize}px "Segoe UI", Arial, sans-serif`;
        const decalMetrics = decalCtx.measureText(nome);
        const decalTextW = decalMetrics.width;
        const decalPadX = 24;
        const decalH = decalFontSize * 1.5;
        const decalW = decalTextW + decalPadX * 2;

        decalCanvas.width = Math.ceil(decalW);
        decalCanvas.height = Math.ceil(decalH);

        decalCtx.fillStyle = 'rgba(30,60,90,0.78)';
        decalCtx.beginPath();
        decalCtx.roundRect(0, 0, decalCanvas.width, decalCanvas.height, 8);
        decalCtx.fill();

        decalCtx.fillStyle = '#447e9b';
        decalCtx.fillRect(0, 0, 6, decalCanvas.height);

        decalCtx.font = `bold ${decalFontSize}px "Segoe UI", Arial, sans-serif`;
        decalCtx.fillStyle = '#ffffff';
        decalCtx.textAlign = 'center';
        decalCtx.textBaseline = 'middle';
        decalCtx.shadowColor = 'rgba(0,0,0,0.4)';
        decalCtx.shadowBlur = 3;
        decalCtx.fillText(nome, decalCanvas.width / 2, decalCanvas.height / 2);
        decalCtx.shadowBlur = 0;

        const decalTexture = new THREE.CanvasTexture(decalCanvas);
        decalTexture.minFilter = THREE.LinearFilter;
        decalTexture.magFilter = THREE.LinearFilter;
        decalTexture.needsUpdate = true;

        const sharedMat = new THREE.MeshBasicMaterial({
            map: decalTexture,
            transparent: true,
            depthTest: true,
            depthWrite: false,
            side: THREE.DoubleSide,
        });

        const aspect = decalW / decalH;
        const OFF = 0.5;

        // 6 facce: pos, dim, rot, + assi per offset basso-destra
        const faceDefs = [
            { p: [0,0,lz/2+OFF], fW:lx,fH:ly, r:[0,0,0],            dA:1,dD:-1, rA:0,rD:+1 },  // +Z
            { p: [0,0,-lz/2-OFF], fW:lx,fH:ly, r:[0,Math.PI,0],     dA:1,dD:-1, rA:0,rD:+1 },  // -Z
            { p: [lx/2+OFF,0,0], fW:lz,fH:ly, r:[0,Math.PI/2,0],    dA:1,dD:-1, rA:2,rD:+1 },  // +X
            { p: [-lx/2-OFF,0,0], fW:lz,fH:ly, r:[0,-Math.PI/2,0],  dA:1,dD:-1, rA:2,rD:+1 },  // -X
            { p: [0,ly/2+OFF,0], fW:lx,fH:lz, r:[-Math.PI/2,0,0],   dA:2,dD:-1, rA:0,rD:+1 },  // +Y
            { p: [0,-ly/2-OFF,0], fW:lx,fH:lz, r:[Math.PI/2,0,0],   dA:2,dD:+1, rA:0,rD:+1 },  // -Y
        ];

        const decalGroup = new THREE.Group();
        const decalFaces = [];

        faceDefs.forEach(function (def) {
            var maxH = Math.min(def.fH * 0.40, 80);
            var maxW = Math.min(def.fW * 0.55, 180);
            var physH = maxH;
            var physW = physH * aspect;
            if (physW > maxW) { physW = maxW; physH = physW / aspect; }

            // Sposta la decal nell'angolo in basso a destra
            var pos = [def.p[0], def.p[1], def.p[2]];
            pos[def.dA] += (def.fH / 2 - physH / 2 - 4) * def.dD;  // down → angolo
            pos[def.rA] += (def.fW / 2 - physW / 2 - 4) * def.rD;  // right → angolo

            var geo = new THREE.PlaneGeometry(physW, physH);
            var plane = new THREE.Mesh(geo, sharedMat);
            plane.position.set(pos[0], pos[1], pos[2]);
            plane.rotation.set(def.r[0], def.r[1], def.r[2]);
            plane.visible = false;
            decalGroup.add(plane);
            decalFaces.push(plane);
        });

        decalFaces[0].visible = true;
        walls.add(decalGroup);
        STATE._containerDecalFaces = decalFaces;
        STATE._containerWalls = walls;
    } else {
        STATE._containerDecalFaces = null;
        STATE._containerWalls = null;
    }

    STATE.containerMesh = gruppo;
    return gruppo;
}

// =============================================================================
// COSTRUZIONE OGGETTI
// =============================================================================

function buildOggetti(oggetti) {
    const gruppo = new THREE.Group();

    oggetti.forEach((oggetto, index) => {
        const pos = oggetto.posizione_cm;
        const dim = oggetto.dimensioni_cm;
        const coloreHex = coloreOggetto(oggetto);
        const colore = new THREE.Color(coloreHex);

        // Converti coordinate: API (x=lunghezza, y=larghezza, z=altezza)
        // → Three.js (X=lunghezza, Y=altezza, Z=larghezza)
        const tjsPos = {
            x: pos.x + dim.x / 2,        // lunghezza → Three.js X
            y: pos.z + dim.z / 2,        // altezza → Three.js Y (up)
            z: pos.y + dim.y / 2,        // larghezza → Three.js Z
        };
        const tjsDim = {
            w: dim.x,   // lunghezza → Three.js width (X)
            h: dim.z,   // altezza → Three.js height (Y / up)
            d: dim.y,   // larghezza → Three.js depth (Z)
        };

        // Box principale con materiale fisico
        const mat = new THREE.MeshPhysicalMaterial({
            color: colore,
            roughness: 0.3,
            metalness: 0.1,
            clearcoat: 0.15,
            clearcoatRoughness: 0.4,
            envMapIntensity: 0.6,
        });

        const geo = new THREE.BoxGeometry(tjsDim.w, tjsDim.h, tjsDim.d);
        const mesh = new THREE.Mesh(geo, mat);
        // La posizione world viene assegnata all'itemGroup (il parent), non alla mesh.
        // Questo evita il doppio offset durante il drag manuale.
        mesh.position.set(0, 0, 0);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // Bordi per ogni pacco — ben visibili per distinguere oggetti stesso colore
        const edgeMat = new THREE.LineBasicMaterial({
            color: 0x333333,
            transparent: true,
            opacity: 0.55,
        });
        const edgeGeo = new THREE.EdgesGeometry(geo);
        const edges = new THREE.LineSegments(edgeGeo, edgeMat);
        edges.position.set(0, 0, 0);
        edges.userData.isEdge = true;

        // Secondo bordo più spesso per enfatizzare i contorni
        const edgeMat2 = new THREE.LineBasicMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0.18,
        });
        const edgeGeo2 = new THREE.EdgesGeometry(new THREE.BoxGeometry(tjsDim.w + 2, tjsDim.h + 2, tjsDim.d + 2));
        const edges2 = new THREE.LineSegments(edgeGeo2, edgeMat2);
        edges2.position.set(0, 0, 0);
        edges2.userData.isEdge = true;

        // Dati utente per raycasting (tooltip)
        // NOTA: _baseY e _posZ sono usati dal drag manuale (workspace_manuale.js)
        mesh.userData = {
            codice: oggetto.codice,
            descrizione: oggetto.descrizione || '-',
            dimensione: `${dim.x.toFixed(1)} × ${dim.y.toFixed(1)} × ${dim.z.toFixed(1)} ${unitaDimensione()}`,
            posizione: `${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)} ${unitaDimensione()}`,
            peso: oggetto.peso_kg,
            pesoSopra: oggetto.peso_sopra_kg,
            rotazione: oggetto.rotazione,
            colore: coloreHex,
            riga_id: oggetto.riga_id || null,
            riga_key: oggetto.riga_key || null,
            index: index,
            _baseY: 0,                                                // Y locale mesh (per animazione floating)
            _posZ: pos.z,                                              // API z (visual bottom) per calcoli drag verticale
            _tjsDimCm: { x: tjsDim.w, y: tjsDim.h, z: tjsDim.d },
            _orientamento: 'LxPxH',                                    // orientamento corrente (default)
        };

        // --- Decal dinamiche camera-facing su tutte le facce del volume ---
        // Viene creata una texture canvas una volta sola e condivisa tra
        // 6 piani (uno per faccia). Ad ogni frame, vengono mostrate le decal
        // su tutte le facce rivolte verso la telecamera (dot product > 0).
        const decalCanvas = document.createElement('canvas');
        const decalCtx = decalCanvas.getContext('2d');
        const decalText = oggetto.codice;
        const decalFontSize = 56;

        decalCtx.font = `bold ${decalFontSize}px "Segoe UI", Arial, sans-serif`;
        const decalMetrics = decalCtx.measureText(decalText);
        const decalTextW = decalMetrics.width;
        const decalPadX = 28;
        const decalH = decalFontSize * 1.6;
        const decalW = decalTextW + decalPadX * 2;

        decalCanvas.width = Math.ceil(decalW);
        decalCanvas.height = Math.ceil(decalH);

        // Sfondo arrotondato semi-trasparente
        decalCtx.fillStyle = 'rgba(0,0,0,0.78)';
        decalCtx.beginPath();
        decalCtx.roundRect(0, 0, decalCanvas.width, decalCanvas.height, 10);
        decalCtx.fill();

        // Banda colorata laterale per identificazione rapida
        decalCtx.fillStyle = coloreHex;
        decalCtx.fillRect(0, 0, 8, decalCanvas.height);

        // Testo
        decalCtx.font = `bold ${decalFontSize}px "Segoe UI", Arial, sans-serif`;
        decalCtx.fillStyle = '#ffffff';
        decalCtx.textAlign = 'center';
        decalCtx.textBaseline = 'middle';
        decalCtx.shadowColor = 'rgba(0,0,0,0.4)';
        decalCtx.shadowBlur = 4;
        decalCtx.fillText(decalText, decalCanvas.width / 2, decalCanvas.height / 2);
        decalCtx.shadowBlur = 0;

        const decalTexture = new THREE.CanvasTexture(decalCanvas);
        decalTexture.minFilter = THREE.LinearFilter;
        decalTexture.magFilter = THREE.LinearFilter;
        decalTexture.needsUpdate = true;

        // Materiale condiviso tra tutte le 6 facce
        const sharedDecalMat = new THREE.MeshBasicMaterial({
            map: decalTexture,
            transparent: true,
            depthTest: true,
            depthWrite: false,
            side: THREE.DoubleSide,
        });

        const aspect = decalW / decalH;
        const OFF = 0.5; // offset anti z-fighting (mm)

        // Definizione delle 6 facce: [nome, posizione locale, dim. faccia, rotazione]
        // Ogni entry produce un piano decal pre-posizionato e pre-ruotato.
        const faceDefs = [
            { pos: [0, 0,  tjsDim.d/2 + OFF], fW: tjsDim.w, fH: tjsDim.h, rot: [0, 0, 0] },                     // +Z
            { pos: [0, 0, -tjsDim.d/2 - OFF], fW: tjsDim.w, fH: tjsDim.h, rot: [0, Math.PI, 0] },               // -Z
            { pos: [ tjsDim.w/2 + OFF, 0, 0], fW: tjsDim.d, fH: tjsDim.h, rot: [0, Math.PI/2, 0] },             // +X
            { pos: [-tjsDim.w/2 - OFF, 0, 0], fW: tjsDim.d, fH: tjsDim.h, rot: [0, -Math.PI/2, 0] },            // -X
            { pos: [0,  tjsDim.h/2 + OFF, 0], fW: tjsDim.w, fH: tjsDim.d, rot: [-Math.PI/2, 0, 0] },            // +Y
            { pos: [0, -tjsDim.h/2 - OFF, 0], fW: tjsDim.w, fH: tjsDim.d, rot: [Math.PI/2, 0, 0] },             // -Y
        ];

        const decalGroup = new THREE.Group();
        const decalFaces = [];

        faceDefs.forEach(function (def) {
            var maxH = def.fH * 0.55;
            var maxW = def.fW * 0.75;
            var physH = maxH;
            var physW = physH * aspect;
            if (physW > maxW) { physW = maxW; physH = physW / aspect; }

            var geo = new THREE.PlaneGeometry(physW, physH);
            var plane = new THREE.Mesh(geo, sharedDecalMat);
            plane.position.set(def.pos[0], def.pos[1], def.pos[2]);
            plane.rotation.set(def.rot[0], def.rot[1], def.rot[2]);
            plane.visible = false;
            decalGroup.add(plane);
            decalFaces.push(plane);
        });

        // Salva riferimenti per l'aggiornamento camera-facing nell'animation loop
        mesh.userData._decalFaces = decalFaces;
        // La faccia +Z (indice 0) è visibile di default prima del primo frame,
        // rispettando il toggle etichette
        decalFaces[0].visible = STATE.mostraEtichetteOggetti;

        const itemGroup = new THREE.Group();
        mesh.add(decalGroup);
        itemGroup.add(mesh);
        itemGroup.add(edges);
        itemGroup.add(edges2);
        // Posizione world = centro dell'oggetto in coordinate Three.js
        itemGroup.position.set(tjsPos.x, tjsPos.y, tjsPos.z);
        itemGroup.userData = mesh.userData;

        gruppo.add(itemGroup);
        STATE.oggettiMesh.push(itemGroup);
    });

    return gruppo;
}

// =============================================================================
// TEXT SPRITE HELPER
// =============================================================================

function createTextSprite(text, options = {}) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const fontSize = options.fontSize || 32;
    const font = `bold ${fontSize}px 'Segoe UI', Arial, sans-serif`;

    ctx.font = font;
    const metrics = ctx.measureText(text);
    const textWidth = metrics.width;
    const padding = 16;
    canvas.width = textWidth + padding * 2;
    canvas.height = fontSize * 1.8;

    // Background
    ctx.fillStyle = options.bgColor || 'rgba(0,0,0,0.7)';
    ctx.beginPath();
    ctx.roundRect(0, 0, canvas.width, canvas.height, 8);
    ctx.fill();

    // Text
    ctx.font = font;
    ctx.fillStyle = options.color || '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    const mat = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        sizeAttenuation: true,
    });

    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(canvas.width * 0.15, canvas.height * 0.15, 1);

    return sprite;
}

// =============================================================================
// EVIDENZIA OGGETTI PER VINCOLI TRA OGGETTI
// =============================================================================

let _evidenziaVincoloMeshes = [];

function evidenziaOggetti3D(codiceA, codiceB) {
    resetEvidenziaVincolo();

    STATE.oggettiMesh.forEach(function (group) {
        var data = group.userData;
        if (!data || !data.codice) return;

        if (data.codice === codiceA || data.codice === codiceB) {
            var isA = data.codice === codiceA;
            var highlightColor = isA ? 0x3388ff : 0xff8833; // blue for A, orange for B

            group.children.forEach(function (child) {
                if (child.type === 'Mesh' && child.material && child.material.color) {
                    // Save original color if not already saved
                    if (!child.userData._vincoloOrigColor) {
                        child.userData._vincoloOrigColor = child.material.color.clone();
                    }
                    child.material.emissive = new THREE.Color(highlightColor);
                    child.material.emissiveIntensity = 0.5;
                    _evidenziaVincoloMeshes.push(child);
                }
                // Also highlight edges
                if (child.userData && child.userData.isEdge) {
                    // Save original edge color/opacity if not already saved
                    if (!child.userData._vincoloOrigEdgeColor) {
                        child.userData._vincoloOrigEdgeColor = child.material.color.getHex();
                        child.userData._vincoloOrigEdgeOpacity = child.material.opacity;
                    }
                    child.material.color = new THREE.Color(isA ? 0x0055cc : 0xcc5500);
                    child.material.opacity = 0.9;
                    _evidenziaVincoloMeshes.push(child);
                }
            });
        }
    });
}

function resetEvidenziaVincolo() {
    _evidenziaVincoloMeshes.forEach(function (child) {
        if (child.type === 'Mesh' && child.material) {
            if (child.userData._vincoloOrigColor) {
                child.material.color.copy(child.userData._vincoloOrigColor);
                delete child.userData._vincoloOrigColor;
            }
            child.material.emissive = new THREE.Color(0x000000);
            child.material.emissiveIntensity = 0;
        }
        if (child.userData && child.userData.isEdge && child.material) {
            if (child.userData._vincoloOrigEdgeColor !== undefined) {
                child.material.color = new THREE.Color(child.userData._vincoloOrigEdgeColor);
                child.material.opacity = child.userData._vincoloOrigEdgeOpacity;
                delete child.userData._vincoloOrigEdgeColor;
                delete child.userData._vincoloOrigEdgeOpacity;
            }
        }
    });
    _evidenziaVincoloMeshes = [];
}

// =============================================================================
