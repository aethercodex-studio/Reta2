import { GameState, getRandomOtherPlayer } from '../main.js';
import { allChallenges } from '../data/retos.js';
import { celebrateGoldenCard, clearLayer } from '../utils/effects.js';

const SEG_COUNT = 40;
const SVG_NS = 'http://www.w3.org/2000/svg';

let wheelItems = [];
let currentRotation = 0;
let isSpinning = false;
let startAngle = 0;
let lastMouseAngles = [];

export function startRuleta() {
    window.goToScreen('ruleta-screen');
    GameState.currentPlayerIndex = 0;
    
    generateWheel();
    updateTurnUIRuleta();
    bindWheelEvents();
}

function updateTurnUIRuleta() {
    const cp = GameState.players[GameState.currentPlayerIndex];
    document.getElementById('ruleta-turn-indicator').innerHTML = `Turno de: <span style="color:${cp.color}; font-size: 1.5em; -webkit-text-stroke: 1.5px black; text-shadow: 2px 2px 0 #000">${cp.name}</span>`;
}

function generateWheel() {
    wheelItems = [];
    let drinkChallenges = [...allChallenges['hot'], ...allChallenges['extremo']].filter(c => c.icon === 'fa-beer-mug-empty' || c.description.toLowerCase().includes('bebe'));
    let allOthers = [...allChallenges['sencillos'], ...allChallenges['hot'], ...allChallenges['extremo']].filter(c => !drinkChallenges.includes(c));
    
    let segments = [];
    
    segments.push({
        text: 'RETO DE ORO',
        icon: 'fa-crown',
        desc: '¡Invéntate un reto y el resto de jugadores tendrán que cumplirlo!',
        cat: 'golden',
        bgColor: 'url(#goldGrad)',
        iconColor: '#fff8d0'
    });
    
    for (let i = 0; i < 10; i++) {
        let dc = drinkChallenges[Math.floor(Math.random() * drinkChallenges.length)] || allChallenges['hot'][0];
        segments.push({
            text: '¡A BEBER!', icon: 'fa-beer-mug-empty', desc: dc.description, cat: 'hot', bgColor: '#FF4500', iconColor: 'black'
        });
    }
    
    for (let i = 0; i < 29; i++) {
        let rc = allOthers[Math.floor(Math.random() * allOthers.length)] || allChallenges['sencillos'][0];
        let cat = 'sencillos';
        if (allChallenges['hot'].includes(rc)) cat = 'hot';
        if (allChallenges['extremo'].includes(rc)) cat = 'extremo';
        
        let bgColor = cat === 'sencillos' ? '#87CEFA' : (cat === 'hot' ? '#FF4500' : '#222222');
        let iconColor = cat === 'extremo' ? 'white' : 'black';
        
        segments.push({
            text: rc.text, icon: rc.icon, desc: rc.description, cat: cat, bgColor: bgColor, iconColor: iconColor
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
    
    showCard({
        text: item.text, icon: item.icon, desc: finalDesc, cat: item.cat
    });
}

function showCard(data) {
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
        GameState.currentPlayerIndex = (GameState.currentPlayerIndex + 1) % GameState.players.length;
        updateTurnUIRuleta();
        btnClose.onclick = oldOnClick;
    };

    document.getElementById('card-modal').style.display = 'flex';

    if (data.cat === 'golden') celebrateGoldenCard();
}
