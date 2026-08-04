import { GameState, getRandomOtherPlayer } from '../main.js';
import { allChallenges } from '../data/retos.js';
import { celebrateGoldenCard, clearLayer } from '../utils/effects.js';

// 80 celdas de rejilla: SALIDA (2) + casillas 1..76 (76) + META (2) = 8 filas exactas de 10
const LAST_TILE = 77;

// Cadenas de teletransporte
const ADVANCE_COUNT = 6, ADVANCE_MIN_GAP = 4, ADVANCE_MAX_GAP = 6;
const RETRO_COUNT = 3, RETRO_MIN_GAP = 6, RETRO_MAX_GAP = 8;

let advanceChain = [];
let retroChain = [];

export function startOca() {
    window.goToScreen('oca-screen');
    generateBoard();
    renderPlayerIndex();
    GameState.playerPositions = {};
    // Todos empiezan en la casilla 0 (punto de salida)
    GameState.players.forEach(p => GameState.playerPositions[p.name] = 0);
    GameState.currentPlayerIndex = 0;
    
    // Bind eventos
    document.getElementById('show-dice-btn').onclick = showDice;
    document.getElementById('btn-close-modal').onclick = closeCardModal;
    bindDiceEvents();

    updateTurnUI();
    drawTokens();
}

function renderPlayerIndex() {
    const list = document.getElementById('player-index-list');
    if (!list) return;
    list.innerHTML = '';
    GameState.players.forEach(p => {
        const row = document.createElement('div');
        row.className = 'index-row';
        row.innerHTML = `<div class="index-color" style="background-color: ${p.color}"></div><span>${p.name}</span>`;
        list.appendChild(row);
    });
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

    // Resto de casillas especiales
    let specialSlots = { safe: 2, drink: 20 };
    let specialMap = {};
    let availableIndexes = [];
    for (let i = 1; i <= LAST_TILE - 2; i++) {
        if (i === goldenTile || advanceChain.includes(i) || retroChain.includes(i)) continue;
        availableIndexes.push(i);
    }

    const assignSpecial = (type, count) => {
        for(let i=0; i<count; i++) {
            let rIdx = Math.floor(Math.random() * availableIndexes.length);
            specialMap[availableIndexes.splice(rIdx, 1)[0]] = type;
        }
    };
    Object.keys(specialSlots).forEach(key => assignSpecial(key, specialSlots[key]));

    const categories = ['sencillos', 'hot', 'extremo'];

    for (let i = 0; i <= LAST_TILE; i++) {
        let tileData = { num: i, type: 'normal' };

        if (i === 0) tileData.type = 'start';
        else if (i === LAST_TILE) tileData.type = 'end';
        else if (i === LAST_TILE - 1) tileData.type = 'penultimate';
        else if (i === goldenTile) tileData.type = 'golden';
        else if (advanceChain.includes(i)) tileData.type = 'advance';
        else if (retroChain.includes(i)) tileData.type = 'retro';
        else if (specialMap[i]) tileData.type = specialMap[i];

        // Si es normal, pre-asignar un reto para extraer su color e icono
        if (tileData.type === 'normal') {
            const randomCat = categories[Math.floor(Math.random() * categories.length)];
            const challengesList = allChallenges[randomCat];
            const randomChallenge = challengesList[Math.floor(Math.random() * challengesList.length)];
            tileData.challenge = randomChallenge;
            tileData.category = randomCat;
        }

        GameState.boardTiles.push(tileData);

        // Render visual
        const tileEl = document.createElement('div');
        tileEl.className = 'tile';
        tileEl.id = `tile-${i}`;
        
        let iconHtml = '';
        // Asignar colores e iconos
        if(tileData.type === 'drink') { 
            tileEl.style.backgroundColor = '#FFD700'; iconHtml = '<i class="fa-solid fa-beer-mug-empty" style="color:black;"></i>'; 
        } else if(tileData.type === 'advance') {
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
            // Es un reto normal
            tileEl.style.backgroundColor = `var(--${tileData.category})`;
            let iconColor = tileData.category === 'extremo' ? 'white' : 'black';
            iconHtml = `<i class="fa-solid ${tileData.challenge.icon}" style="color:${iconColor}; opacity: 0.8;"></i>`;
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

// --- DADO 3D Y FUERZA ---
let strengthInterval = null;
let currentStrength = 0;
let isCharging = false;
let isRolling = false;
let diceEventsBound = false;

function bindDiceEvents() {
    if(diceEventsBound) return;
    const dc = document.getElementById('dice-canvas-container');
    dc.addEventListener('mousedown', startCharging);
    dc.addEventListener('touchstart', startCharging, {passive: true});
    
    document.addEventListener('mouseup', releaseDice);
    document.addEventListener('touchend', releaseDice);
    diceEventsBound = true;
}

function showDice() {
    document.getElementById('show-dice-btn').style.display = 'none';
    const dc = document.getElementById('dice-canvas-container');
    dc.style.display = 'flex';
    
    currentStrength = 0;
    isCharging = false;
    isRolling = false;
    document.getElementById('strength-bar').style.width = '0%';
    
    const cube = document.getElementById('dice-cube');
    cube.style.transition = 'none';
    cube.style.transform = 'translateZ(-60px) rotateX(-15deg) rotateY(-15deg)';
}

function startCharging(e) {
    if (isRolling || document.getElementById('dice-canvas-container').style.display === 'none') return;
    isCharging = true;
    currentStrength = 0;
    
    strengthInterval = setInterval(() => {
        currentStrength += 3; // Fill up over ~600ms to max
        if (currentStrength > 100) currentStrength = 100;
        document.getElementById('strength-bar').style.width = currentStrength + '%';
    }, 20);
}

function releaseDice() {
    if (!isCharging || isRolling) return;
    isCharging = false;
    clearInterval(strengthInterval);
    
    if (currentStrength < 10) currentStrength = 10;
    
    isRolling = true;
    roll3DDice(currentStrength);
}

function roll3DDice(strength) {
    const roll = Math.floor(Math.random() * 6) + 1;
    
    const faceRotations = {
        1: { x: 0, y: 0 },
        2: { x: -90, y: 0 },
        3: { x: 0, y: -90 },
        4: { x: 0, y: 90 },
        5: { x: 90, y: 0 },
        6: { x: 180, y: 0 }
    };
    
    const target = faceRotations[roll];
    let powerLevel = Math.ceil((strength / 100) * 5);
    let extraSpins = powerLevel * 2;
    
    // Add random slight variation so it doesn't always end up perfectly straight
    let randomOffset = (Math.random() * 20) - 10;
    let finalX = target.x + (360 * extraSpins) + randomOffset;
    let finalY = target.y + (360 * extraSpins) + randomOffset;
    
    const cube = document.getElementById('dice-cube');
    let duration = 0.5 + (strength / 100) * 1.5;
    
    cube.style.transition = `transform ${duration}s cubic-bezier(0.25, 1, 0.5, 1)`;
    cube.style.transform = `translateZ(-60px) rotateX(${finalX}deg) rotateY(${finalY}deg)`;
    
    setTimeout(() => {
        document.getElementById('dice-canvas-container').style.display = 'none';
        moveCurrentPlayer(roll);
    }, duration * 1000 + 500);
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
        } else {
            clearInterval(jumpInterval);
            if (callback) setTimeout(callback, stepMs);
        }
    }, stepMs);
}

function moveCurrentPlayer(roll) {
    const cp = GameState.players[GameState.currentPlayerIndex];
    let newPos = Math.min(LAST_TILE, GameState.playerPositions[cp.name] + roll);
    animatePlayerTo(newPos, () => resolveTile(newPos));
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
        case 'end': alert(`¡${cp.name} HA GANADO!`); window.goToScreen('menu-screen'); return;
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
        case 'drink': cardData = { text: '¡A BEBER!', icon: 'fa-beer-mug-empty', desc: 'Bebe, te lo mereces.', cat: 'hot' }; break;
        case 'penultimate': cardData = { text: '¡CASI!', icon: 'fa-skull', desc: 'Retrocedes 5 casillas.', cat: 'extremo' }; finalPos = Math.max(0, pos - 5); break;
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

    if (data.cat === 'golden') celebrateGoldenCard();
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
    GameState.currentPlayerIndex = (GameState.currentPlayerIndex + 1) % GameState.players.length;
    updateTurnUI();
}