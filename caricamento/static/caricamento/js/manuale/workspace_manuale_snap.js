/**
 * Workspace Carico 3D — Manuale: Snap & Collision Detection
 *
 * Funzioni di basso livello per il calcolo delle collisioni AABB,
 * snap alla griglia e dimensioni oggetto in coordinate Three.js.
 *
 * Depends on: STATE (da visualizzatore_3d_core.js)
 */

// =============================================================================
// COLLISION DETECTION (AABB)
// =============================================================================
// Tutti gli oggetti sono box axis-aligned, anche dopo rotazione
// (le rotazioni permutano le dimensioni ma restano allineati agli assi).
// Coordinate in sistema Three.js: X=lunghezza, Y=altezza(up), Z=larghezza.

/**
 * Verifica se due box axis-aligned si intersecano.
 * @param {Object} aDim - {x, y, z} dimensioni box A in cm (Three.js)
 * @param {Object} aPos - THREE.Vector3 posizione centro box A
 * @param {Object} bDim - {x, y, z} dimensioni box B in cm (Three.js)
 * @param {Object} bPos - THREE.Vector3 posizione centro box B
 * @returns {boolean} true se i due box si sovrappongono
 */
function _aabbOverlap(aDim, aPos, bDim, bPos) {
    // Verifica overlap su X: gli intervalli [min, max] si toccano?
    if (aPos.x - aDim.x / 2 >= bPos.x + bDim.x / 2) return false;
    if (aPos.x + aDim.x / 2 <= bPos.x - bDim.x / 2) return false;
    // Verifica overlap su Y (altezza)
    if (aPos.y - aDim.y / 2 >= bPos.y + bDim.y / 2) return false;
    if (aPos.y + aDim.y / 2 <= bPos.y - bDim.y / 2) return false;
    // Verifica overlap su Z (larghezza)
    if (aPos.z - aDim.z / 2 >= bPos.z + bDim.z / 2) return false;
    if (aPos.z + aDim.z / 2 <= bPos.z - bDim.z / 2) return false;
    // Tutti e 3 gli assi si sovrappongono → collisione
    return true;
}

/**
 * Controlla se l'oggetto trascinato, nella posizione data, collide
 * con qualsiasi altro oggetto nella scena (escludendo se stesso).
 * @param {THREE.Group} draggedGroup - l'oggetto che stiamo trascinando
 * @param {THREE.Vector3} testPos - posizione da testare (centro, coordinate Three.js)
 * @param {Object} testDim - dimensioni dell'oggetto in cm Three.js {x, y, z}
 * @returns {THREE.Group|null} l'oggetto con cui collide, oppure null
 */
function _checkCollisionWithOthers(draggedGroup, testPos, testDim) {
    for (var i = 0; i < STATE.oggettiMesh.length; i++) {
        var other = STATE.oggettiMesh[i];
        if (other === draggedGroup) continue;  // salta se stesso
        if (!other.visible) continue;           // salta oggetti nascosti (slider sequenza)

        var otherDim = _getTjsDimensions(other);
        if (_aabbOverlap(testDim, testPos, otherDim, other.position)) {
            return other;  // collisione trovata
        }
    }
    return null;  // nessuna collisione
}

/**
 * Imposta il colore di highlight dell'oggetto durante il drag.
 * Verde = posizione valida, Rosso = collisione.
 */
function _setDragHighlight(group, colliding) {
    var colorHex = colliding ? 0xff4444 : 0x44ff44;
    var intensity = colliding ? 0.5 : 0.35;
    group.children.forEach(function (child) {
        if (child.type === 'Mesh' && child.material && child.material.emissive) {
            child.material.emissive = new THREE.Color(colorHex);
            child.material.emissiveIntensity = intensity;
        }
    });
}

// =============================================================================

function _getTjsDimensions(group) {
    var ud = group.userData;
    if (ud && ud._tjsDimCm) return ud._tjsDimCm;
    var mesh = group.children[0];
    if (mesh && mesh.geometry && mesh.geometry.parameters) {
        var p = mesh.geometry.parameters;
        return { x: p.width || 0, y: p.height || 0, z: p.depth || 0 };
    }
    return { x: 0, y: 0, z: 0 };
}

// =============================================================================
// SNAP ALLA GRIGLIA
// =============================================================================

function _snapPosition(tjsPos, dimCm) {
    // dimCm = { x: API_lunghezza, y: API_altezza, z: API_larghezza }
    // Three.js: X=lunghezza, Y=altezza(up), Z=larghezza
    var step = STATE.snapStepCm;
    var apiX = tjsPos.x - dimCm.x / 2;       // API lunghezza corner
    var apiY = tjsPos.z - dimCm.z / 2;       // API larghezza corner
    var apiZ = tjsPos.y - dimCm.y / 2;       // API altezza corner
    apiX = Math.round(apiX / step) * step;
    apiY = Math.round(apiY / step) * step;
    apiZ = Math.round(apiZ / step) * step;
    return {
        x: apiX + dimCm.x / 2,   // Three.js X
        y: apiZ + dimCm.y / 2,   // Three.js Y (up)
        z: apiY + dimCm.z / 2    // Three.js Z
    };
}
