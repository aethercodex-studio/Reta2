import { GameState, getRandomOtherPlayer } from '../main.js';
import { allChallenges } from '../data/retos.js';

export function startOca() {
    window.goToScreen('oca-screen');
    generateBoard();
    renderPlayerIndex();
    GameState.playerPositions = {};
    GameState.players.forEach(p => GameState.playerPositions[p.name] = 1);
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

function generateBoard() {
    const board = document.getElementById('oca-board');
    board.innerHTML = '';
    GameState.boardTiles = [];

    // Mapas de casillas especiales
    let specialSlots = { advance: 3, retro: 3, safe: 2, drink: 20 };
    let specialMap = {};
    let availableIndexes = Array.from({length: 67}, (_, i) => i + 2); 
    
    const assignSpecial = (type, count) => {
        for(let i=0; i<count; i++) {
            let rIdx = Math.floor(Math.random() * availableIndexes.length);
            specialMap[availableIndexes.splice(rIdx, 1)[0]] = type;
        }
    };
    Object.keys(specialSlots).forEach(key => assignSpecial(key, specialSlots[key]));

    const categories = ['sencillos', 'hot', 'extremo'];

    for (let i = 1; i <= 70; i++) {
        let tileData = { num: i, type: 'normal' };
        
        if (i === 1) tileData.type = 'start';
        else if (i === 70) tileData.type = 'end';
        else if (i === 69) tileData.type = 'penultimate';
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
            tileEl.style.backgroundColor = '#98FB98'; iconHtml = '<i class="fa-solid fa-angles-right" style="color:green;"></i>'; 
        } else if(tileData.type === 'retro') { 
            tileEl.style.backgroundColor = '#FFA07A'; iconHtml = '<i class="fa-solid fa-angles-left" style="color:red;"></i>'; 
        } else if(tileData.type === 'safe') { 
            tileEl.style.backgroundColor = '#FFFFFF'; iconHtml = '<i class="fa-solid fa-shield-halved" style="color:blue;"></i>'; 
        } else if(tileData.type === 'penultimate') { 
            tileEl.style.backgroundColor = '#8B0000'; iconHtml = '<i class="fa-solid fa-skull" style="color:white;"></i>'; 
        } else if(tileData.type === 'end') { 
            tileEl.style.backgroundColor = '#FFD700'; iconHtml = '<i class="fa-solid fa-trophy" style="color:black;"></i>'; 
        } else if (tileData.type === 'start') {
            tileEl.style.backgroundColor = '#FFFFFF'; iconHtml = '<i class="fa-solid fa-flag-checkered"></i>';
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
function animatePlayerTo(targetPos, callback) {
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
            if (callback) setTimeout(callback, 400);
        }
    }, 400);
}

function moveCurrentPlayer(roll) {
    const cp = GameState.players[GameState.currentPlayerIndex];
    let newPos = Math.min(70, GameState.playerPositions[cp.name] + roll);
    animatePlayerTo(newPos, () => resolveTile(newPos));
}

function resolveTile(pos) {
    const cp = GameState.players[GameState.currentPlayerIndex];
    const tile = GameState.boardTiles[pos - 1];
    
    let cardData = null;
    let showModal = true;
    let finalPos = pos;

    switch(tile.type) {
        case 'start': showModal = false; break;
        case 'end': alert(`¡${cp.name} HA GANADO!`); window.goToScreen('menu-screen'); return;
        case 'safe': cardData = { text: 'CASILLA SEGURA', icon: 'fa-shield-halved', desc: '¡Te has librado!', cat: 'sencillos' }; break;
        case 'advance': cardData = { text: '¡AVANZAS 3!', icon: 'fa-angles-right', desc: 'Viento a tu favor.', cat: 'sencillos' }; finalPos = Math.min(70, pos + 3); break;
        case 'retro': cardData = { text: '¡RETROCEDES 3!', icon: 'fa-angles-left', desc: 'Vaya tropiezo...', cat: 'extremo' }; finalPos = Math.max(1, pos - 3); break;
        case 'drink': cardData = { text: '¡A BEBER!', icon: 'fa-beer-mug-empty', desc: 'Bebe, te lo mereces.', cat: 'hot' }; break;
        case 'penultimate': cardData = { text: '¡CASI!', icon: 'fa-skull', desc: 'Retrocedes 5 casillas.', cat: 'extremo' }; finalPos = Math.max(1, pos - 5); break;
        default:
            // Utilizamos el reto pre-asignado a la casilla
            let finalDesc = tile.challenge.description.replace('{playerName}', getRandomOtherPlayer(cp.name));
            cardData = { text: tile.challenge.text, icon: tile.challenge.icon, desc: finalDesc, cat: tile.category };
            break;
    }

    if (showModal && cardData) {
        cardData.finalPos = finalPos;
        showCard(cardData);
    }
    else {
        animatePlayerTo(finalPos, nextTurn);
    }
}

let pendingFinalPos = null;

function showCard(data) {
    pendingFinalPos = data.finalPos;
    const content = document.getElementById('card-content');
    content.className = `challenge-card cartoon-box ${data.cat}`;
    document.getElementById('card-title').innerText = data.text;
    document.getElementById('card-icon').className = `main-icon fa-solid ${data.icon}`;
    document.getElementById('card-desc').innerText = data.desc;
    document.getElementById('card-modal').style.display = 'flex';
}

function closeCardModal() {
    document.getElementById('card-modal').style.display = 'none';
    if (pendingFinalPos !== null) {
        let target = pendingFinalPos;
        pendingFinalPos = null;
        animatePlayerTo(target, nextTurn);
    } else {
        nextTurn();
    }
}

function nextTurn() {
    GameState.currentPlayerIndex = (GameState.currentPlayerIndex + 1) % GameState.players.length;
    updateTurnUI();
}