import { GameState, getRandomOtherPlayer } from '../main.js';
import { allChallenges } from '../data/retos.js';

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
        icon: 'fa-star',
        desc: '¡Invéntate un reto para los demás!',
        cat: 'golden',
        bgColor: '#FFD700',
        iconColor: 'black'
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
    
    let gradientParts = [];
    const degPerSlice = 360 / 40;
    
    wheelItems.forEach((item, index) => {
        let startDeg = index * degPerSlice;
        let endDeg = startDeg + degPerSlice;
        gradientParts.push(`${item.bgColor} ${startDeg}deg ${endDeg}deg`);
        
        const iconDiv = document.createElement('div');
        iconDiv.style.position = 'absolute';
        iconDiv.style.top = '0';
        iconDiv.style.left = '50%';
        iconDiv.style.width = '20px';
        iconDiv.style.height = '50%';
        iconDiv.style.transformOrigin = 'bottom center';
        iconDiv.style.transform = `translateX(-50%) rotate(${startDeg + (degPerSlice/2)}deg)`;
        iconDiv.style.display = 'flex';
        iconDiv.style.justifyContent = 'center';
        iconDiv.style.paddingTop = '10px';
        
        iconDiv.innerHTML = `<i class="fa-solid ${item.icon}" style="color:${item.iconColor}; font-size: 1rem;"></i>`;
        wheelEl.appendChild(iconDiv);
    });
    
    wheelEl.style.background = `conic-gradient(${gradientParts.join(', ')})`;
    currentRotation = 0;
    wheelEl.style.transition = 'none';
    wheelEl.style.transform = `rotate(0deg)`;
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
    let index = Math.floor(pointerAngle / (360 / 40));
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
    if(data.cat === 'golden') content.style.backgroundColor = '#FFD700'; 
    
    document.getElementById('card-title').innerText = data.text;
    document.getElementById('card-icon').className = `main-icon fa-solid ${data.icon}`;
    document.getElementById('card-desc').innerText = data.desc;
    
    const btnClose = document.getElementById('btn-close-modal');
    const oldOnClick = btnClose.onclick;
    
    btnClose.onclick = () => {
        document.getElementById('card-modal').style.display = 'none';
        content.style.backgroundColor = ''; // reset golden style
        GameState.currentPlayerIndex = (GameState.currentPlayerIndex + 1) % GameState.players.length;
        updateTurnUIRuleta();
        btnClose.onclick = oldOnClick;
    };
    
    document.getElementById('card-modal').style.display = 'flex';
}
