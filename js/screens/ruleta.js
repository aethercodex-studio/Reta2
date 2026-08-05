import { GameState, getRandomOtherPlayer } from '../main.js';
import { pickChallenge, CATEGORY_COLORS, iconColorFor } from '../data/mezcla.js';
import { celebrateGoldenCard, clearLayer } from '../utils/effects.js';
import { renderIndexRows } from '../utils/playerIndex.js';

const SEG_COUNT = 40;
const SVG_NS = 'http://www.w3.org/2000/svg';
const DRINKS_PER_EXTRA_SPIN = 5;

let wheelItems = [];
let currentRotation = 0;
let isSpinning = false;
let startAngle = 0;
let lastMouseAngles = [];

let drinkCounts = {};
let extraSpinPending = false;

// --- INICIO CONFIGURACIÓN DE AUDIO ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let tickBuffer = null;
let lastTickTime = 0; // Guardará la marca de tiempo del último sonido reproducido

// 1. Crear un nodo de ganancia (volumen) para evitar la saturación al superponer
const gainNode = audioCtx.createGain();
// Ajusta este valor (0.0 a 1.0) si necesitas subir o bajar el volumen del tick
gainNode.gain.value = 0.5; 
gainNode.connect(audioCtx.destination);

// Cargar el sonido en memoria al inicializar
fetch('media/audio/spinningwheel.mp3')
    .then(res => res.arrayBuffer())
    .then(data => audioCtx.decodeAudioData(data))
    .then(buffer => tickBuffer = buffer)
    .catch(err => console.error("Error cargando el audio:", err));

// Cargar el sonido del premio dorado
let prizeBuffer = null;
fetch('media/audio/prize.mp3')
    .then(res => res.arrayBuffer())
    .then(data => audioCtx.decodeAudioData(data))
    .then(buffer => prizeBuffer = buffer)
    .catch(err => console.error("Error cargando el audio prize:", err));

function playTick() {
    if (!tickBuffer) return;
    
    // 2. Límite de ráfaga (Rate Limiting)
    // audioCtx.currentTime nos da el reloj interno del motor de audio (en segundos)
    const now = audioCtx.currentTime;
    
    // Si han pasado menos de 0.04 segundos (40ms) desde el último clic, lo ignoramos.
    // Esto limita la metralleta de sonido a un máximo de 25 clics por segundo.
    if (now - lastTickTime < 0.04) return; 
    
    lastTickTime = now;

    const source = audioCtx.createBufferSource();
    source.buffer = tickBuffer;
    
    // Conectamos el sonido a la ganancia en lugar de directo a la salida general
    source.connect(gainNode);
    source.start();
}

function trackWheelTicks() {
    const wheel = document.getElementById('ruleta-wheel');
    const degPerSlice = 360 / SEG_COUNT;
    let lastAngle = null;
    let accumulatedAngle = 0;

    function checkRotation() {
        if (!isSpinning) return;

        const st = window.getComputedStyle(wheel, null);
        const tr = st.getPropertyValue("transform");

        if (tr !== "none") {
            const values = tr.split('(')[1].split(')')[0].split(',');
            const a = parseFloat(values[0]);
            const b = parseFloat(values[1]);
            
            let angle = Math.atan2(b, a) * (180 / Math.PI);
            if (angle < 0) angle += 360;

            if (lastAngle !== null) {
                let delta = angle - lastAngle;
                
                if (delta < -180) delta += 360;
                if (delta > 180) delta -= 360;

                accumulatedAngle += Math.abs(delta);

                if (accumulatedAngle >= degPerSlice) {
                    playTick();
                    // Mantenemos el sobrante matemático para no desincronizarnos
                    accumulatedAngle %= degPerSlice;
                }
            }
            lastAngle = angle;
        }
        
        requestAnimationFrame(checkRotation);
    }
    
    requestAnimationFrame(checkRotation);
}
// --- FIN CONFIGURACIÓN DE AUDIO ---

// --- SONIDO DE PREMIO ---
function playPrizeSound() {
    if (!prizeBuffer) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const source = audioCtx.createBufferSource();
    source.buffer = prizeBuffer;
    const gn = audioCtx.createGain();
    gn.gain.value = 1.0;
    source.connect(gn);
    gn.connect(audioCtx.destination);
    source.start();
}

export function startRuleta() {
    window.goToScreen('ruleta-screen');
    GameState.currentPlayerIndex = 0;

    drinkCounts = {};
    GameState.players.forEach(p => { drinkCounts[p.name] = 0; });
    extraSpinPending = false;

    generateWheel();
    updateTurnUIRuleta();
    renderRuletaIndex();
    bindWheelEvents();
}

function updateTurnUIRuleta() {
    const cp = GameState.players[GameState.currentPlayerIndex];
    const extra = extraSpinPending
        ? ' <span class="extra-spin-tag"><i class="fa-solid fa-rotate-right"></i> GIRO EXTRA</span>'
        : '';
    document.getElementById('ruleta-turn-indicator').innerHTML =
        `Turno de: <span style="color:${cp.color}; font-size: 1.5em; -webkit-text-stroke: 1.5px black; text-shadow: 2px 2px 0 #000">${cp.name}</span>${extra}`;
}

/** Índice con el contador de tragos de cada jugador. */
function renderRuletaIndex() {
    const list = document.getElementById('ruleta-index-list');
    if (!list) return;

    const cp = GameState.players[GameState.currentPlayerIndex];
    renderIndexRows(list, GameState.players.map(p => {
        const count = drinkCounts[p.name] || 0;
        // Marcamos en oro a quien está a un trago del giro extra
        const nextIsPrize = count > 0 && (count + 1) % DRINKS_PER_EXTRA_SPIN === 0;
        return {
            name: p.name,
            color: p.color,
            badge: count,
            active: cp && p.name === cp.name,
            highlight: nextIsPrize
        };
    }));
}

function nextTurnRuleta() {
    extraSpinPending = false;
    GameState.currentPlayerIndex = (GameState.currentPlayerIndex + 1) % GameState.players.length;
    updateTurnUIRuleta();
    renderRuletaIndex();
}

function generateWheel() {
    wheelItems = [];

    let segments = [];

    segments.push({
        text: 'RETO DE ORO',
        icon: 'fa-crown',
        desc: '¡Invéntate un reto y el resto de jugadores tendrán que cumplirlo!',
        cat: 'golden',
        bgColor: 'url(#goldGrad)',
        iconColor: '#fff8d0'
    });

    for (let i = 0; i < 4; i++) {
        segments.push({
            text: 'ZONA SEGURA',
            icon: 'fa-shield-halved',
            desc: '¡Te has librado! Tu turno termina sin penalización.',
            cat: 'sencillos',
            bgColor: '#FFFFFF',
            iconColor: 'blue'
        });
    }

    // Los 35 segmentos restantes (beber y retos) respetan la mezcla de porcentajes
    for (let i = 0; i < SEG_COUNT - 5; i++) {
        const pick = pickChallenge();
        const rc = pick.challenge;
        const cat = pick.category;

        segments.push({
            text: rc.text, icon: rc.icon, desc: rc.description, cat: cat,
            bgColor: CATEGORY_COLORS[cat], iconColor: iconColorFor(cat)
        });
    }

    segments.sort(() => Math.random() - 0.5);
    wheelItems = segments;

    const wheelEl = document.getElementById('ruleta-wheel');
    wheelEl.innerHTML = '';

    const degPerSlice = 360 / SEG_COUNT;

    // Ruleta en SVG: así cada reto tiene su propio contorno y se distingue del vecino
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 200 200');
    svg.setAttribute('class', 'wheel-svg');

    svg.appendChild(buildGoldGradient());

    wheelItems.forEach((item, index) => {
        const startDeg = index * degPerSlice;
        const endDeg = startDeg + degPerSlice;

        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', slicePath(startDeg, endDeg));
        path.setAttribute('fill', item.bgColor);
        path.setAttribute('stroke', item.cat === 'golden' ? '#4a3200' : '#000000');
        path.setAttribute('stroke-width', item.cat === 'golden' ? '1.4' : '0.9');
        path.setAttribute('stroke-linejoin', 'round');
        if (item.cat === 'golden') path.setAttribute('class', 'slice-golden');
        svg.appendChild(path);
    });

    wheelEl.appendChild(svg);

    // Iconos por encima de cada porción
    wheelItems.forEach((item, index) => {
        const startDeg = index * degPerSlice;
        const iconDiv = document.createElement('div');
        iconDiv.className = 'wheel-icon';
        iconDiv.style.position = 'absolute';
        iconDiv.style.top = '0';
        iconDiv.style.left = '50%';
        iconDiv.style.width = '26px';
        iconDiv.style.height = '50%';
        iconDiv.style.transformOrigin = 'bottom center';
        iconDiv.style.transform = `translateX(-50%) rotate(${startDeg + (degPerSlice / 2)}deg)`;
        iconDiv.style.display = 'flex';
        iconDiv.style.justifyContent = 'center';
        iconDiv.style.paddingTop = '14px';

        const extra = item.cat === 'golden'
            ? ' -webkit-text-stroke: 1.5px #4a3200; filter: drop-shadow(0 0 6px #ffae00);'
            : '';
        iconDiv.innerHTML = `<i class="fa-solid ${item.icon}" style="color:${item.iconColor}; font-size: clamp(0.9rem, 1.9vw, 1.4rem);${extra}"></i>`;
        wheelEl.appendChild(iconDiv);
    });

    const hub = document.createElement('div');
    hub.className = 'wheel-hub';
    hub.innerHTML = '<i class="fa-solid fa-crown"></i>';
    wheelEl.appendChild(hub);

    wheelEl.style.background = 'transparent';
    currentRotation = 0;
    wheelEl.style.transition = 'none';
    wheelEl.style.transform = `rotate(0deg)`;
}

/** Degradado dorado premium para la porción del RETO DE ORO. */
function buildGoldGradient() {
    const defs = document.createElementNS(SVG_NS, 'defs');
    const grad = document.createElementNS(SVG_NS, 'linearGradient');
    grad.setAttribute('id', 'goldGrad');
    grad.setAttribute('x1', '0%'); grad.setAttribute('y1', '0%');
    grad.setAttribute('x2', '100%'); grad.setAttribute('y2', '100%');

    [['0%', '#fffbe0'], ['30%', '#ffe066'], ['55%', '#ffd700'], ['80%', '#b8860b'], ['100%', '#ffd700']]
        .forEach(([offset, color]) => {
            const stop = document.createElementNS(SVG_NS, 'stop');
            stop.setAttribute('offset', offset);
            stop.setAttribute('stop-color', color);
            grad.appendChild(stop);
        });

    defs.appendChild(grad);
    return defs;
}

/** Porción de tarta: 0deg = arriba, sentido horario (igual que el conic-gradient original). */
function slicePath(startDeg, endDeg) {
    const r = 99;
    const p1 = polar(r, startDeg);
    const p2 = polar(r, endDeg);
    const largeArc = (endDeg - startDeg) > 180 ? 1 : 0;
    return `M 100 100 L ${p1.x} ${p1.y} A ${r} ${r} 0 ${largeArc} 1 ${p2.x} ${p2.y} Z`;
}

function polar(r, deg) {
    const rad = (deg - 90) * Math.PI / 180;
    return { x: (100 + r * Math.cos(rad)).toFixed(3), y: (100 + r * Math.sin(rad)).toFixed(3) };
}

function bindWheelEvents() {
    const wheel = document.getElementById('ruleta-wheel');
    if (wheel.dataset.eventsBound) return;
    
    wheel.addEventListener('mousedown', startDrag);
    wheel.addEventListener('touchstart', startDrag, {passive: false});
    
    document.addEventListener('mousemove', drag);
    document.addEventListener('touchmove', drag, {passive: false});
    
    document.addEventListener('mouseup', endDrag);
    document.addEventListener('touchend', endDrag);
    wheel.dataset.eventsBound = 'true';
}

function getAngle(e) {
    const wheel = document.getElementById('ruleta-wheel');
    const rect = wheel.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    let clientX = e.clientX;
    let clientY = e.clientY;
    if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    }
    
    return Math.atan2(clientY - centerY, clientX - centerX) * (180 / Math.PI);
}

let isDragging = false;

function startDrag(e) {
    if (isSpinning) return;
    isDragging = true;
    startAngle = getAngle(e);
    lastMouseAngles = [];
    const wheel = document.getElementById('ruleta-wheel');
    wheel.style.transition = 'none';
}

function drag(e) {
    if (!isDragging) return;
    e.preventDefault(); 
    
    let angle = getAngle(e);
    let delta = angle - startAngle;
    
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    
    currentRotation += delta;
    startAngle = angle;
    
    const wheel = document.getElementById('ruleta-wheel');
    wheel.style.transform = `rotate(${currentRotation}deg)`;
    
    lastMouseAngles.push({ delta: delta, time: Date.now() });
    if (lastMouseAngles.length > 5) lastMouseAngles.shift();
}

function endDrag(e) {
    if (!isDragging) return;
    isDragging = false;
    isSpinning = true;
    
    let now = Date.now();
    let validAngles = lastMouseAngles.filter(a => now - a.time < 100);
    
    let speed = 0;
    if (validAngles.length > 0) {
        speed = (validAngles.reduce((sum, a) => sum + a.delta, 0) / validAngles.length) * 3;
    }
    
    if (Math.abs(speed) < 5) {
        speed = (Math.random() > 0.5 ? 1 : -1) * (15 + Math.random() * 15);
    }
    
    let extraSpins = speed * 40; 
    let targetRotation = currentRotation + extraSpins;
    
    let duration = Math.min(Math.max(Math.abs(speed) / 2, 2), 6);
    
    const wheel = document.getElementById('ruleta-wheel');
    wheel.style.transition = `transform ${duration}s cubic-bezier(0.1, 0.9, 0.2, 1)`;
    wheel.style.transform = `rotate(${targetRotation}deg)`;
    
    // --- NUEVO: Iniciar el rastreador de audio al soltar ---
    if (audioCtx.state === 'suspended') audioCtx.resume();
    trackWheelTicks();
    // ---------------------------------------------------------
    
    setTimeout(() => {
        currentRotation = targetRotation;
        isSpinning = false;
        resolveWheel();
    }, duration * 1000 + 100);
}

function resolveWheel() {
    let normalizedRot = currentRotation % 360;
    if (normalizedRot < 0) normalizedRot += 360;
    
    let pointerAngle = (360 - normalizedRot) % 360;
    let index = Math.floor(pointerAngle / (360 / SEG_COUNT));
    let item = wheelItems[index];
    
    const cp = GameState.players[GameState.currentPlayerIndex];
    let finalDesc = item.desc.replace('{playerName}', getRandomOtherPlayer(cp.name));

    if (item.cat === 'golden') {
        finalDesc = item.desc;
    }

    // Las cartas de beber suben el contador del jugador de turno
    let earnedExtraSpin = false;
    if (item.cat === 'beber') {
        drinkCounts[cp.name] = (drinkCounts[cp.name] || 0) + 1;
        earnedExtraSpin = drinkCounts[cp.name] % DRINKS_PER_EXTRA_SPIN === 0;
        renderRuletaIndex();
    }

    showCard(
        { text: item.text, icon: item.icon, desc: finalDesc, cat: item.cat },
        () => {
            if (earnedExtraSpin) showExtraSpinCard(cp, drinkCounts[cp.name]);
            else nextTurnRuleta();
        }
    );
}

/** Premio cada 5 tragos: el mismo jugador vuelve a girar. */
function showExtraSpinCard(player, count) {
    showCard({
        text: '¡GIRO EXTRA!',
        icon: 'fa-rotate-right',
        desc: `¡YA LLEVAS ${count} TRAGOS, TIENES UN GIRO EXTRA! Vuelve a girar la ruleta, ${player.name}.`,
        cat: 'golden'
    }, () => {
        // No se avanza de turno: repite el mismo jugador
        extraSpinPending = true;
        updateTurnUIRuleta();
        renderRuletaIndex();
    });
}

function showCard(data, onClose) {
    const content = document.getElementById('card-content');
    content.className = `challenge-card cartoon-box ${data.cat}`;
    content.style.backgroundColor = '';

    document.getElementById('card-title').innerText = data.text;
    document.getElementById('card-icon').className = `main-icon fa-solid ${data.icon}`;
    document.getElementById('card-desc').innerText = data.desc;

    const btnClose = document.getElementById('btn-close-modal');
    const oldOnClick = btnClose.onclick;

    btnClose.onclick = () => {
        document.getElementById('card-modal').style.display = 'none';
        clearLayer(document.getElementById('modal-particles'));
        btnClose.onclick = oldOnClick;
        if (onClose) onClose();
    };

    document.getElementById('card-modal').style.display = 'flex';

    if (data.cat === 'golden') {
        playPrizeSound();
        celebrateGoldenCard();
    }
}