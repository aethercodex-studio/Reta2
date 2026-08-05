import { GameState, getRandomOtherPlayer } from '../main.js';
import { pickChallenge, CATEGORY_COLORS, iconColorFor } from '../data/mezcla.js';
import { celebrateGoldenCard, celebrateVictory, celebratePodium, clearLayer } from '../utils/effects.js';
import { renderIndexRows, rankByPosition } from '../utils/playerIndex.js';

// --- INICIO CONFIGURACIÓN DE AUDIO (DADO + PREMIO) ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let diceBuffer = null;
let prizeBuffer = null;
let jumpBuffer = null;

// Cargar el sonido del salto
fetch('media/audio/jump.mp3')
    .then(res => res.arrayBuffer())
    .then(data => audioCtx.decodeAudioData(data))
    .then(buffer => jumpBuffer = buffer)
    .catch(err => console.error("Error cargando el audio jump:", err));

// Cargar el sonido del dado en memoria al inicializar
fetch('media/audio/dice.mp3')
    .then(res => res.arrayBuffer())
    .then(data => audioCtx.decodeAudioData(data))
    .then(buffer => diceBuffer = buffer)
    .catch(err => console.error("Error cargando el audio del dado:", err));

// Cargar el sonido del premio dorado
fetch('media/audio/prize.mp3')
    .then(res => res.arrayBuffer())
    .then(data => audioCtx.decodeAudioData(data))
    .then(buffer => prizeBuffer = buffer)
    .catch(err => console.error("Error cargando el audio prize:", err));

function playSound(buffer, volume = 0.8) {
    if (!buffer) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    const gainNode = audioCtx.createGain();
    gainNode.gain.value = volume;
    source.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    source.start();
}

function playDiceSound() {
    playSound(diceBuffer, 0.8);
}
// --- FIN CONFIGURACIÓN DE AUDIO (DADO + PREMIO) ---

// 80 celdas de rejilla: SALIDA (2) + casillas 1..76 (76) + META (2) = 8 filas exactas de 10
const LAST_TILE = 77;

// Cadenas de teletransporte
const ADVANCE_COUNT = 6, ADVANCE_MIN_GAP = 4, ADVANCE_MAX_GAP = 6;
const RETRO_COUNT = 3, RETRO_MIN_GAP = 6, RETRO_MAX_GAP = 8;

let advanceChain = [];
let retroChain = [];

// Nombres en orden de llegada a la meta. Quien termina sale del turno,
// pero la partida sigue para pelear el 2º y 3er puesto.
let finishOrder = [];

const stillPlaying = () => GameState.players.filter(p => !finishOrder.includes(p.name));
/** La partida acaba cuando ya solo queda un jugador por llegar (será el último). */
const isGameOver = () => finishOrder.length >= 1 && stillPlaying().length <= 1;

export function startOca() {
    window.goToScreen('oca-screen');
    generateBoard();
    renderPlayerIndex();
    GameState.playerPositions = {};
    // Todos empiezan en la casilla 0 (punto de salida)
    GameState.players.forEach(p => GameState.playerPositions[p.name] = 0);
    finishOrder = [];
    GameState.currentPlayerIndex = 0;
    
    // Bind eventos
    document.getElementById('show-dice-btn').onclick = showDice;
    document.getElementById('btn-close-modal').onclick = closeCardModal;
    bindDiceEvents();

    updateTurnUI();
    drawTokens();
    
    // --- Comandos de depuración (God Mode) ---
    window.godMode = function(playerName, pos) {
        if (GameState.playerPositions[playerName] !== undefined) {
            GameState.playerPositions[playerName] = Math.max(0, Math.min(LAST_TILE, pos));
            drawTokens();
            console.log(`[God Mode] Jugador ${playerName} movido a la casilla ${GameState.playerPositions[playerName]}`);
        } else {
            console.warn(`[God Mode] Jugador ${playerName} no encontrado.`);
        }
    };
    window.moveCurrent = function(pos) {
        const cp = GameState.players[GameState.currentPlayerIndex];
        if (cp) window.godMode(cp.name, pos);
    };

    console.log("%c👑 GOD MODE ACTIVADO", "color: gold; font-size: 16px; font-weight: bold; text-shadow: 1px 1px 2px black;");
    console.log("%cComandos disponibles:", "color: #4CAF50; font-size: 14px; font-weight: bold;");
    console.log("👉 %cmoveCurrent(casilla)%c - Mueve al jugador del turno actual a la casilla indicada. (ej: moveCurrent(75))", "color: #2196F3; font-weight: bold;", "color: inherit;");
    console.log("👉 %cgodMode('Nombre', casilla)%c - Mueve al jugador indicado a la casilla especificada.", "color: #2196F3; font-weight: bold;", "color: inherit;");
}

/**
 * Índice: primero quienes ya han llegado (con su puesto definitivo) y debajo
 * los que siguen en juego, ordenados por casilla.
 */
function renderPlayerIndex() {
    const list = document.getElementById('player-index-list');
    if (!list) return;

    const current = GameState.players[GameState.currentPlayerIndex];
    const rows = [];

    // Ya en meta: puesto fijo por orden de llegada
    finishOrder.forEach((name, i) => {
        const p = GameState.players.find(x => x.name === name);
        if (!p) return;
        rows.push({
            name: p.name,
            color: p.color,
            rank: i + 1,
            badge: `<i class="fa-solid ${i === 0 ? 'fa-trophy' : 'fa-medal'}"></i>`,
            done: true,
            highlight: i === 0
        });
    });

    // Aún jugando: siguen numerando desde donde acaba el podio
    const ranked = rankByPosition(stillPlaying(), p => GameState.playerPositions[p.name] ?? 0);
    ranked.forEach(({ player, rank, pos }) => {
        rows.push({
            name: player.name,
            color: player.color,
            rank: finishOrder.length + rank,
            badge: pos,
            active: current && player.name === current.name
        });
    });

    renderIndexRows(list, rows);
}

function bigTileHtml(icon, num, label) {
    return `<span class="big-tile-icon"><i class="fa-solid ${icon}"></i></span>` +
           `<span class="big-tile-text"><span class="big-tile-num">${num}</span>` +
           `<span class="big-tile-label">${label}</span></span>`;
}

/**
 * Cadena de casillas equiespaciadas al azar: `count` casillas separadas entre
 * minGap y maxGap, con la última sin pasar de highBound.
 */
function buildChain(count, minGap, maxGap, lowBound, highBound) {
    const gaps = [];
    for (let i = 0; i < count - 1; i++) {
        gaps.push(minGap + Math.floor(Math.random() * (maxGap - minGap + 1)));
    }
    const span = gaps.reduce((a, b) => a + b, 0);
    const maxStart = highBound - span;
    if (maxStart < lowBound) return null;

    let pos = lowBound + Math.floor(Math.random() * (maxStart - lowBound + 1));
    const chain = [pos];
    gaps.forEach(g => { pos += g; chain.push(pos); });
    return chain;
}

/** Coloca las dos cadenas sin solaparse entre sí ni con las casillas reservadas. */
function planWarpChains(goldenTile) {
    const reserved = new Set([0, LAST_TILE, LAST_TILE - 1, goldenTile]);

    for (let attempt = 0; attempt < 500; attempt++) {
        const advance = buildChain(ADVANCE_COUNT, ADVANCE_MIN_GAP, ADVANCE_MAX_GAP, 3, 62);
        const retro = buildChain(RETRO_COUNT, RETRO_MIN_GAP, RETRO_MAX_GAP, 6, 68);
        if (!advance || !retro) continue;

        const all = [...advance, ...retro];
        if (new Set(all).size !== all.length) continue;          // sin solapes
        if (all.some(n => reserved.has(n))) continue;            // sin pisar reservadas
        return { advance, retro };
    }

    // Reparto de seguridad (no debería hacer falta): separación mínima fija
    const advance = Array.from({length: ADVANCE_COUNT}, (_, i) => 4 + i * ADVANCE_MIN_GAP);
    const retro = Array.from({length: RETRO_COUNT}, (_, i) => 41 + i * RETRO_MIN_GAP);
    return { advance, retro };
}

function generateBoard() {
    const board = document.getElementById('oca-board');
    board.innerHTML = '';
    GameState.boardTiles = [];

    // Casilla RETO DE ORO: siempre cerca del final del tablero
    const goldenTile = 70 + Math.floor(Math.random() * 5); // 70..74

    // Cadenas de teletransporte adelante/atrás
    const chains = planWarpChains(goldenTile);
    advanceChain = chains.advance;
    retroChain = chains.retro;

    // Resto de casillas especiales (las de beber ya salen de la mezcla de retos)
    let specialSlots = { safe: 6 };
    let specialMap = {};
    let availableIndexes = [];
    for (let i = 1; i <= LAST_TILE - 2; i++) {
        if (i === goldenTile || advanceChain.includes(i) || retroChain.includes(i)) continue;
        availableIndexes.push(i);
    }

    const assignSpecial = (type, count, minGap = 5) => {
        let placed = [];
        for(let i=0; i<count; i++) {
            let validIndexes = availableIndexes.filter(idx => placed.every(p => Math.abs(idx - p) >= minGap));
            if (validIndexes.length === 0) break;
            let rIdx = Math.floor(Math.random() * validIndexes.length);
            let chosen = validIndexes.splice(rIdx, 1)[0];
            specialMap[chosen] = type;
            placed.push(chosen);
            availableIndexes = availableIndexes.filter(idx => idx !== chosen);
        }
    };
    Object.keys(specialSlots).forEach(key => assignSpecial(key, specialSlots[key]));

    for (let i = 0; i <= LAST_TILE; i++) {
        let tileData = { num: i, type: 'normal' };

        if (i === 0) tileData.type = 'start';
        else if (i === LAST_TILE) tileData.type = 'end';
        else if (i === LAST_TILE - 1) tileData.type = 'penultimate';
        else if (i === goldenTile) tileData.type = 'golden';
        else if (advanceChain.includes(i)) tileData.type = 'advance';
        else if (retroChain.includes(i)) tileData.type = 'retro';
        else if (specialMap[i]) tileData.type = specialMap[i];

        // Si es normal, pre-asignar un reto (según la mezcla elegida) para extraer su color e icono
        if (tileData.type === 'normal') {
            const pick = pickChallenge();
            tileData.challenge = pick.challenge;
            tileData.category = pick.category;
        }

        GameState.boardTiles.push(tileData);

        // Render visual
        const tileEl = document.createElement('div');
        tileEl.className = 'tile';
        tileEl.id = `tile-${i}`;
        
        let iconHtml = '';
        // Asignar colores e iconos
        if(tileData.type === 'advance') {
            tileEl.classList.add('tile-warp');
            tileEl.style.backgroundColor = '#5BE37E';
            iconHtml = '<i class="fa-solid fa-forward-fast" style="color:#08471d;"></i>' +
                       `<span class="warp-step">${advanceChain.indexOf(i) + 1}/${ADVANCE_COUNT}</span>`;
        } else if(tileData.type === 'retro') {
            tileEl.classList.add('tile-warp');
            tileEl.style.backgroundColor = '#FF7A5C';
            iconHtml = '<i class="fa-solid fa-backward-fast" style="color:#5c0d00;"></i>' +
                       `<span class="warp-step">${retroChain.indexOf(i) + 1}/${RETRO_COUNT}</span>`;
        } else if(tileData.type === 'safe') {
            tileEl.style.backgroundColor = '#FFFFFF'; iconHtml = '<i class="fa-solid fa-shield-halved" style="color:blue;"></i>'; 
        } else if(tileData.type === 'penultimate') { 
            tileEl.style.backgroundColor = '#8B0000'; iconHtml = '<i class="fa-solid fa-skull" style="color:white;"></i>'; 
        } else if(tileData.type === 'end') {
            tileEl.classList.add('tile-end');
            tileEl.innerHTML = bigTileHtml('fa-trophy', i, 'META');
            board.appendChild(tileEl);
            continue;
        } else if(tileData.type === 'golden') {
            tileEl.classList.add('tile-golden');
            iconHtml = '<i class="fa-solid fa-crown" style="color:#fff8d0; -webkit-text-stroke: 2px #6b4a00;"></i>';
        } else if (tileData.type === 'start') {
            tileEl.classList.add('tile-start');
            tileEl.innerHTML = bigTileHtml('fa-flag-checkered', i, 'SALIDA');
            board.appendChild(tileEl);
            continue;
        } else {
            // Es una carta de reto o de beber: color según su categoría
            tileEl.style.backgroundColor = CATEGORY_COLORS[tileData.category];
            iconHtml = `<i class="fa-solid ${tileData.challenge.icon}" style="color:${iconColorFor(tileData.category)}; opacity: 0.8;"></i>`;
        }

        tileEl.innerHTML = `<span class="tile-num">${i}</span>${iconHtml}`;
        board.appendChild(tileEl);
    }
}

function drawTokens(animPlayerName = null, animType = null) {
    document.querySelectorAll('.player-token').forEach(t => t.remove());
    GameState.players.forEach((p, idx) => {
        const pos = GameState.playerPositions[p.name];
        const tileEl = document.getElementById(`tile-${pos}`);
        if (tileEl) {
            const token = document.createElement('div');
            token.className = 'player-token';
            if (p.name === animPlayerName && animType) {
                token.classList.add(animType === 'big' ? 'token-pop-big' : 'token-pop');
            }
            token.style.backgroundColor = p.color;
            token.style.transform = `translate(${ (idx%3)*10 - 10 }px, ${ Math.floor(idx/3)*10 - 10 }px)`;
            tileEl.appendChild(token);
        }
    });
    // La clasificación se recalcula con cada salto de ficha
    renderPlayerIndex();
    followActiveTile();
}

/**
 * En pantallas pequeñas el tablero no cabe entero de alto. Si hay scroll, se
 * centra la casilla del jugador de turno para no perder de vista su ficha.
 */
function followActiveTile() {
    const board = document.getElementById('oca-board');
    const cp = GameState.players[GameState.currentPlayerIndex];
    if (!board || !cp) return;
    if (board.scrollHeight <= board.clientHeight + 4) return;   // cabe entero: no tocar nada

    const tileEl = document.getElementById(`tile-${GameState.playerPositions[cp.name]}`);
    if (!tileEl) return;

    const top = tileEl.offsetTop - (board.clientHeight - tileEl.offsetHeight) / 2;
    board.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
}

function updateTurnUI() {
    const cp = GameState.players[GameState.currentPlayerIndex];
    const indicator = document.getElementById('turn-indicator');
    indicator.innerHTML = `Turno de: <span style="color:${cp.color}; font-size: 1.5em; -webkit-text-stroke: 1.5px black; text-shadow: 2px 2px 0 #000">${cp.name}</span>`;
    
    indicator.classList.remove('next-turn-anim');
    void indicator.offsetWidth; // trigger reflow
    indicator.classList.add('next-turn-anim');
    
    document.getElementById('show-dice-btn').style.display = 'block';
}

// --- DADO CARTOON 2D: se toca y cae sobre la mesa ---
// La caída ES el encogimiento: el dado empieza grande (cerca) y se va haciendo
// pequeño hasta "tocar" la mesa. En ese instante bota y sigue girando desde el
// mismo sitio y con el mismo tamaño, así que se ve como una sola animación.
const FALL_MS = 800;           // encogerse = caer
const SPIN_MS = 1500;          // botar y girar hasta pararse
// Reposo 210px -> mesa 142px (contenedor a tamaño máximo): el encogimiento se nota
const TABLE_SCALE = 0.676;     // tamaño al llegar a la mesa
const FALL_TURN = 190;         // grados que ya lleva girados al tocar la mesa

let isRolling = false;
let diceEventsBound = false;
let faceShuffleTimer = null;
let dropTimers = [];

// Posición de los puntos de cada cara, en un lienzo de 100x100
const DICE_PIPS = {
    1: [[50, 50]],
    2: [[31, 31], [69, 69]],
    3: [[31, 31], [50, 50], [69, 69]],
    4: [[31, 31], [69, 31], [31, 69], [69, 69]],
    5: [[31, 31], [69, 31], [50, 50], [31, 69], [69, 69]],
    6: [[31, 28], [69, 28], [31, 50], [69, 50], [31, 72], [69, 72]]
};

/** Cuerpo del dado en SVG: trazo grueso, relleno plano y un brillo. Vectorial = nítido a cualquier tamaño. */
function buildDiceSvg() {
    const dice = document.getElementById('dice-cube');
    if (dice.querySelector('svg')) return;
    dice.innerHTML = `
        <svg viewBox="0 0 100 100" aria-hidden="true">
            <defs>
                <linearGradient id="diceBody" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#FFF3B0"/>
                    <stop offset="45%" stop-color="#FFD700"/>
                    <stop offset="100%" stop-color="#F0A500"/>
                </linearGradient>
            </defs>
            <rect x="7" y="9" width="86" height="86" rx="21" fill="#000"/>
            <rect x="7" y="7" width="86" height="86" rx="21" fill="url(#diceBody)" stroke="#000" stroke-width="6"/>
            <path d="M18 30 Q22 14 38 13 Q28 20 26 32 Z" fill="#FFFFFF" opacity="0.75"/>
            <g id="dice-pips"></g>
        </svg>`;
}

function renderDiceFace(value) {
    const group = document.getElementById('dice-pips');
    if (!group) return;
    group.innerHTML = (DICE_PIPS[value] || DICE_PIPS[1])
        .map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="8.6" fill="#1a1a1a"/>`)
        .join('');
}

function bindDiceEvents() {
    if(diceEventsBound) return;
    const dc = document.getElementById('dice-canvas-container');

    // Pointer Events unifica ratón, dedo y lápiz en un solo evento: así no se
    // duplica la pulsación en pantallas táctiles (touchstart + mousedown emulado).
    if (window.PointerEvent) {
        dc.addEventListener('pointerdown', onDiceTap);
    } else {
        dc.addEventListener('click', onDiceTap);
    }

    diceEventsBound = true;
}

function onDiceTap(e) {
    if (isRolling) return;
    if (document.getElementById('dice-canvas-container').style.display === 'none') return;
    if (e && e.cancelable) e.preventDefault();
    isRolling = true;
    
    playDiceSound(); // REPRODUCE EL SONIDO JUSTO AL TOCAR
    
    dropDice();
}

function clearDropTimers() {
    dropTimers.forEach(t => clearTimeout(t));
    dropTimers = [];
    clearTimeout(faceShuffleTimer);
}

function showDice() {
    document.getElementById('show-dice-btn').style.display = 'none';
    const dc = document.getElementById('dice-canvas-container');
    dc.style.display = 'flex';

    isRolling = false;
    clearDropTimers();

    buildDiceSvg();
    renderDiceFace(1 + Math.floor(Math.random() * 6));

    document.getElementById('dice-instructions').innerText = 'Toca el dado para tirar';

    // En reposo el dado está GRANDE (cerca) y con la sombra amplia y suave
    const dice = document.getElementById('dice-cube');
    dice.style.transition = 'none';
    dice.style.transform = 'rotate(-7deg)';

    const fall = document.getElementById('dice-fall');
    fall.style.transition = 'none';
    fall.style.transform = 'scale(1)';

    const drift = document.getElementById('dice-drift');
    drift.style.transition = 'none';
    drift.style.transform = 'translateX(0)';

    const shadow = document.getElementById('dice-shadow');
    shadow.classList.remove('bouncing');
    shadow.style.transition = 'none';
    shadow.style.transform = 'translateX(-50%) scale(1.45)';
    shadow.style.opacity = '0.12';

    const hop = document.getElementById('dice-hop');
    hop.classList.remove('bouncing');
    void hop.offsetWidth;
    hop.classList.add('idle');           // flota para invitar a tocarlo

    document.getElementById('dice-impact').classList.remove('pop');
}

/**
 * Fase 1 — LA CAÍDA: el dado se encoge (se aleja hacia la mesa) girando ya un
 * poco y acelerando, como cualquier cosa que cae. No se teletransporta: se
 * queda donde está y solo cambia de tamaño.
 */
function dropDice() {
    const roll = Math.floor(Math.random() * 6) + 1;
    const dir = Math.random() > 0.5 ? 1 : -1;

    const dice = document.getElementById('dice-cube');
    const fall = document.getElementById('dice-fall');
    const shadow = document.getElementById('dice-shadow');
    const hop = document.getElementById('dice-hop');

    hop.classList.remove('idle');
    document.getElementById('dice-instructions').innerText = '¡Allá va!';

    const EASE_IN = 'cubic-bezier(0.45, 0, 0.95, 0.6)';

    // Se encoge apoyado en la mesa: ESTA es la caída. Acelera (ease-in).
    fall.style.transition = `transform ${FALL_MS}ms ${EASE_IN}`;
    fall.style.transform = `scale(${TABLE_SCALE})`;

    // Y ya va girando un poco mientras cae
    dice.style.transition = `transform ${FALL_MS}ms ${EASE_IN}`;
    dice.style.transform = `rotate(${dir * FALL_TURN}deg)`;

    // La sombra se cierra y oscurece a medida que el dado se acerca a la mesa
    shadow.style.transition = `transform ${FALL_MS}ms cubic-bezier(0.45, 0, 0.95, 0.6), opacity ${FALL_MS}ms ease-in`;
    shadow.style.transform = 'translateX(-50%) scale(1)';
    shadow.style.opacity = '0.36';

    // Las caras empiezan a cambiar ya durante la caída y no paran hasta el final
    startFaceShuffle(FALL_MS + SPIN_MS);

    dropTimers.push(setTimeout(() => bounceAndSpin(roll, dir), FALL_MS));
}

/**
 * Fase 2 — EL BOTE: arranca exactamente donde y como acabó la caída (misma
 * posición, mismo tamaño, mismo ángulo) y sigue girando hasta frenar.
 */
function bounceAndSpin(roll, dir) {
    const stage = document.getElementById('dice-stage');
    const dice = document.getElementById('dice-cube');
    const drift = document.getElementById('dice-drift');
    const hop = document.getElementById('dice-hop');
    const shadow = document.getElementById('dice-shadow');
    const impact = document.getElementById('dice-impact');

    stage.style.setProperty('--spin-dur', `${SPIN_MS}ms`);

    const spins = 2 + Math.floor(Math.random() * 3);
    const tilt = (Math.random() * 22) - 11;              // no acaba perfectamente recto

    // El giro CONTINÚA desde FALL_TURN (no se reinicia) y la escala se queda
    // fija en la de mesa: por eso las dos fases se leen como una sola animación.
    const totalTurn = dir * (FALL_TURN + spins * 360) + tilt;
    dice.style.transition = `transform ${SPIN_MS}ms cubic-bezier(0.16, 0.78, 0.18, 1)`;
    dice.style.transform = `rotate(${totalTurn.toFixed(1)}deg)`;

    // Al botar se desvía un poco de lado, como si rodara
    const driftX = dir * (3 + Math.random() * 5);
    drift.style.transition = `transform ${SPIN_MS}ms cubic-bezier(0.15, 0.8, 0.2, 1)`;
    drift.style.transform = `translateX(${driftX.toFixed(1)}%)`;

    // Botes verticales + sombra sincronizada, ambos partiendo de translateY(0)
    shadow.style.transition = 'none';
    hop.classList.remove('bouncing');
    shadow.classList.remove('bouncing');
    void hop.offsetWidth;
    hop.classList.add('bouncing');
    shadow.classList.add('bouncing');

    // Anillo de impacto: justo al tocar la mesa
    impact.classList.remove('pop');
    void impact.offsetWidth;
    impact.classList.add('pop');

    dropTimers.push(setTimeout(() => {
        clearTimeout(faceShuffleTimer);
        renderDiceFace(roll);
        document.getElementById('dice-instructions').innerText = `¡${roll}!`;
    }, SPIN_MS));

    dropTimers.push(setTimeout(() => {
        document.getElementById('dice-canvas-container').style.display = 'none';
        moveCurrentPlayer(roll);
    }, SPIN_MS + 700));
}

/** Cambia de cara cada vez más despacio durante todo el lanzamiento. */
function startFaceShuffle(totalMs) {
    clearTimeout(faceShuffleTimer);
    let delay = 55;
    let elapsed = 0;
    const step = () => {
        renderDiceFace(1 + Math.floor(Math.random() * 6));
        elapsed += delay;
        delay *= 1.19;
        if (elapsed + delay < totalMs - 150) faceShuffleTimer = setTimeout(step, delay);
    };
    step();
}

// --- RESOLUCIÓN DE CASILLAS ---
function animatePlayerTo(targetPos, callback, stepMs = 400) {
    const cp = GameState.players[GameState.currentPlayerIndex];
    let currentStep = GameState.playerPositions[cp.name];

    if (currentStep === targetPos) {
        if(callback) callback();
        return;
    }

    const step = currentStep < targetPos ? 1 : -1;

    const jumpInterval = setInterval(() => {
        if (currentStep !== targetPos) {
            currentStep += step;
            GameState.playerPositions[cp.name] = currentStep;
            drawTokens(cp.name, currentStep !== targetPos ? 'normal' : 'big');
            playSound(jumpBuffer, 0.4);
        } else {
            clearInterval(jumpInterval);
            if (callback) setTimeout(callback, stepMs);
        }
    }, stepMs);
}

function moveCurrentPlayer(roll) {
    const cp = GameState.players[GameState.currentPlayerIndex];
    const currentPos = GameState.playerPositions[cp.name];
    const target = currentPos + roll;

    if (target > LAST_TILE) {
        const extra = target - LAST_TILE;
        const finalPos = LAST_TILE - extra;
        
        animatePlayerTo(LAST_TILE, () => {
            showSilverOvershootCard();
            setTimeout(() => {
                closeSilverOvershootCard();
                animatePlayerTo(finalPos, () => resolveTile(finalPos));
            }, 2000);
        });
    } else {
        animatePlayerTo(target, () => resolveTile(target));
    }
}

function showSilverOvershootCard() {
    const content = document.getElementById('card-content');
    content.className = 'challenge-card cartoon-box silver';
    content.style.backgroundColor = '';
    document.getElementById('card-title').innerText = '¡CASI!';
    document.getElementById('card-icon').className = 'main-icon fa-solid fa-arrow-rotate-left';
    document.getElementById('card-desc').innerText = 'Retrocede los puntos extra.';
    
    document.getElementById('btn-close-modal').style.display = 'none';
    document.getElementById('card-modal').style.display = 'flex';
}

function closeSilverOvershootCard() {
    document.getElementById('card-modal').style.display = 'none';
    document.getElementById('btn-close-modal').style.display = 'block';
}

function resolveTile(pos) {
    const cp = GameState.players[GameState.currentPlayerIndex];
    const tile = GameState.boardTiles[pos];

    let cardData = null;
    let showModal = true;
    let finalPos = pos;
    let warpStep = false;   // los teletransportes recorren las casillas más rápido

    switch(tile.type) {
        case 'start': showModal = false; break;
        case 'end': handleFinish(cp); return;
        case 'safe': cardData = { text: 'CASILLA SEGURA', icon: 'fa-shield-halved', desc: '¡Te has librado!', cat: 'sencillos' }; break;
        case 'advance': {
            const next = advanceChain.find(n => n > pos);
            if (next !== undefined) {
                finalPos = next;
                cardData = { text: '¡SALTO ADELANTE!', icon: 'fa-forward-fast',
                    desc: `Viento a tu favor: te teletransportas hasta la siguiente casilla verde, la ${next}.`,
                    cat: 'sencillos' };
            } else {
                finalPos = Math.min(LAST_TILE, pos + 3);
                cardData = { text: '¡AVANZAS 3!', icon: 'fa-forward-fast',
                    desc: 'Era la última casilla verde del tablero, así que avanzas 3 casillas.',
                    cat: 'sencillos' };
            }
            warpStep = true;
            break;
        }
        case 'retro': {
            const previous = [...retroChain].reverse().find(n => n < pos);
            if (previous !== undefined) {
                finalPos = previous;
                cardData = { text: '¡SALTO ATRÁS!', icon: 'fa-backward-fast',
                    desc: `Vaya tropiezo... retrocedes hasta la casilla roja anterior, la ${previous}.`,
                    cat: 'extremo' };
            } else {
                finalPos = Math.max(0, pos - 3);
                cardData = { text: '¡RETROCEDES 3!', icon: 'fa-backward-fast',
                    desc: 'Era la primera casilla roja del tablero, así que retrocedes 3 casillas.',
                    cat: 'extremo' };
            }
            warpStep = true;
            break;
        }
        case 'penultimate': cardData = { text: '¡CALAVERA!', icon: 'fa-skull', desc: 'Retrocedes 8 casillas.', cat: 'extremo' }; finalPos = Math.max(0, pos - 8); break;
        case 'golden': cardData = {
            text: 'RETO DE ORO', icon: 'fa-crown',
            desc: `¡${cp.name} ha llegado a la casilla dorada! Invéntate un reto y el resto de jugadores tendrán que cumplirlo.`,
            cat: 'golden'
        }; break;
        default:
            // Utilizamos el reto pre-asignado a la casilla
            let finalDesc = tile.challenge.description.replace('{playerName}', getRandomOtherPlayer(cp.name));
            cardData = { text: tile.challenge.text, icon: tile.challenge.icon, desc: finalDesc, cat: tile.category };
            break;
    }

    if (showModal && cardData) {
        cardData.finalPos = finalPos;
        cardData.stepMs = warpStep ? 190 : 400;
        showCard(cardData);
    }
    else {
        animatePlayerTo(finalPos, nextTurn);
    }
}

let pendingFinalPos = null;
let pendingStepMs = 400;

/** Un jugador llega a la meta: se le da su puesto y la partida continúa. */
function handleFinish(player) {
    if (!finishOrder.includes(player.name)) finishOrder.push(player.name);
    const place = finishOrder.length;
    renderPlayerIndex();
    showFinishCard(player, place);
}

/**
 * Carta de llegada a meta. El 1º se lleva el premio de poner una regla;
 * el resto pelea por el podio y la partida sigue.
 */
function showFinishCard(player, place) {
    pendingFinalPos = null;
    const isWinner = place === 1;

    const content = document.getElementById('card-content');
    content.className = `challenge-card cartoon-box ${isWinner ? 'golden' : 'sencillos'}`;
    content.style.backgroundColor = '';
    document.getElementById('card-title').innerText = isWinner ? '¡HAS GANADO!' : `¡${place}º PUESTO!`;
    document.getElementById('card-icon').className = `main-icon fa-solid ${isWinner ? 'fa-trophy' : 'fa-medal'}`;
    document.getElementById('card-desc').innerText = isWinner
        ? `¡${player.name} ha ganado! Como recompensa, puedes elegir una regla para el resto de jugadores hasta que termine la partida.`
        : `¡${player.name} ha llegado a la meta en ${place}º puesto! El resto de jugadores sigue peleando por el podio.`;

    const btnClose = document.getElementById('btn-close-modal');
    btnClose.onclick = () => {
        document.getElementById('card-modal').style.display = 'none';
        clearLayer(document.getElementById('modal-particles'));
        btnClose.onclick = closeCardModal;

        if (isGameOver()) showFinalStandings();
        else nextTurn();
    };

    document.getElementById('card-modal').style.display = 'flex';
    if (isWinner) {
        playSound(prizeBuffer, 1.0);
        celebrateVictory();
    } else {
        celebratePodium();
    }
}

/** Clasificación final: el jugador que queda cierra la tabla en último puesto. */
function showFinalStandings() {
    stillPlaying().forEach(p => finishOrder.push(p.name));
    renderPlayerIndex();

    const content = document.getElementById('card-content');
    content.className = 'challenge-card cartoon-box golden standings';
    content.style.backgroundColor = '';
    document.getElementById('card-title').innerText = '¡FIN DE LA PARTIDA!';
    document.getElementById('card-icon').className = 'main-icon fa-solid fa-ranking-star';
    document.getElementById('card-desc').innerText =
        finishOrder.map((name, i) => `${i + 1}º  ${name}`).join('\n');

    const btnClose = document.getElementById('btn-close-modal');
    btnClose.onclick = () => {
        document.getElementById('card-modal').style.display = 'none';
        clearLayer(document.getElementById('modal-particles'));
        btnClose.onclick = closeCardModal;
        window.goToScreen('menu-screen');
    };

    document.getElementById('card-modal').style.display = 'flex';
    celebrateVictory();
}

function showCard(data) {
    pendingFinalPos = data.finalPos;
    pendingStepMs = data.stepMs || 400;
    const content = document.getElementById('card-content');
    content.className = `challenge-card cartoon-box ${data.cat}`;
    content.style.backgroundColor = '';
    document.getElementById('card-title').innerText = data.text;
    document.getElementById('card-icon').className = `main-icon fa-solid ${data.icon}`;
    document.getElementById('card-desc').innerText = data.desc;
    document.getElementById('card-modal').style.display = 'flex';

    if (data.cat === 'golden') {
        playSound(prizeBuffer, 1.0);
        celebrateGoldenCard();
    }
}

function closeCardModal() {
    document.getElementById('card-modal').style.display = 'none';
    clearLayer(document.getElementById('modal-particles'));
    if (pendingFinalPos !== null) {
        let target = pendingFinalPos;
        let stepMs = pendingStepMs;
        pendingFinalPos = null;
        pendingStepMs = 400;
        // El salto solo mueve la ficha: la casilla de destino no se vuelve a resolver
        animatePlayerTo(target, nextTurn, stepMs);
    } else {
        nextTurn();
    }
}

function nextTurn() {
    if (isGameOver()) { showFinalStandings(); return; }

    // Se salta a quien ya ha llegado a la meta
    const total = GameState.players.length;
    for (let i = 0; i < total; i++) {
        GameState.currentPlayerIndex = (GameState.currentPlayerIndex + 1) % total;
        if (!finishOrder.includes(GameState.players[GameState.currentPlayerIndex].name)) break;
    }
    updateTurnUI();
}