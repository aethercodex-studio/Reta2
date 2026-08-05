import { GameState } from '../main.js';
import { pickChallenge, categoryOf } from '../data/mezcla.js';
import { burstParticles, confettiRain, goldenExplosion, clearLayer, celebrateGoldenCard, GOLD_PALETTE } from '../utils/effects.js';
import { renderIndexRows } from '../utils/playerIndex.js';

// --- INICIO CONFIGURACIÓN DE AUDIO (SLOT MACHINE) ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let slotBuffer = null;
let prizeBuffer = null;

// Cargar el sonido principal de la tirada
fetch('media/audio/slot.mp3')
    .then(res => res.arrayBuffer())
    .then(data => audioCtx.decodeAudioData(data))
    .then(buffer => slotBuffer = buffer)
    .catch(err => console.error("Error cargando el audio slot:", err));

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
// --- FIN CONFIGURACIÓN DE AUDIO (SLOT MACHINE) ---

const ITEM_H = 160;            // debe coincidir con .slot-item / .reel-viewport en el CSS
const STRIP_LEN = 26;          // items por rodillo; el último es el resultado
const GOLDEN_CHANCE = 0.05;    // probabilidad de que salgan ? ? ?
const APPEARANCES_FOR_GOLDEN = 10;
const REEL_IDS = ['reel-1', 'reel-2', 'reel-3'];
const STOP_TIMES = [2800, 3700, 4700];

let appearCounts = {};
let goldenQueue = [];          // jugadores con RETO DE ORO garantizado pendiente

export function startMaquinita() {
    window.goToScreen('maquinita-screen');
    appearCounts = {};
    GameState.players.forEach(p => { appearCounts[p.name] = 0; });
    goldenQueue = [];

    buildBulbs();
    resetSlotVisuals();
    renderMaquinitaIndex();
    bindMaquinitaEvents();
}

/** Índice con las apariciones de cada jugador en la máquina. */
function renderMaquinitaIndex() {
    const list = document.getElementById('maquinita-index-list');
    if (!list) return;

    renderIndexRows(list, GameState.players.map(p => ({
        name: p.name,
        color: p.color,
        badge: appearCounts[p.name] || 0,
        // En oro quien tiene el RETO DE ORO garantizado esperando
        highlight: goldenQueue.includes(p.name)
    })));
}

function bindMaquinitaEvents() {
    const btnSpin = document.getElementById('btn-spin-slot');
    if (btnSpin.dataset.bound) return;
    btnSpin.addEventListener('click', spinSlots);
    btnSpin.dataset.bound = 'true';
}

function buildBulbs() {
    ['bulbs-top', 'bulbs-bottom'].forEach((id, row) => {
        const holder = document.getElementById(id);
        if (!holder || holder.childElementCount) return;
        for (let i = 0; i < 16; i++) {
            const b = document.createElement('div');
            b.className = 'bulb';
            b.style.animationDelay = `${((i + row) % 4) * 0.27}s`;
            holder.appendChild(b);
        }
    });
}

function resetSlotVisuals() {
    REEL_IDS.forEach((id, i) => {
        const vp = document.getElementById(`viewport-${i + 1}`);
        if (vp) vp.classList.remove('locked', 'locked-gold');
        const reel = document.getElementById(id);
        if (reel) reel.classList.remove('spinning');
    });
    const banner = document.getElementById('slot-win-banner');
    banner.classList.remove('show', 'gold');
    banner.style.opacity = '0';
    document.getElementById('slot-machine').classList.remove('jackpot', 'shake');
    clearLayer(document.getElementById('slot-particles'));
}

function goldItem() {
    return { golden: true };
}

function spinSlots() {
    const btnSpin = document.getElementById('btn-spin-slot');
    btnSpin.disabled = true;
    resetSlotVisuals();

    // Reproducir sonido principal de la tirada
    playSound(slotBuffer, 0.7);

    const lever = document.getElementById('slot-lever');
    lever.classList.add('pulled');
    setTimeout(() => lever.classList.remove('pulled'), 450);

    // Dos vías para el RETO DE ORO:
    //  1) garantizado, cuando un jugador alcanza un múltiplo de 10 apariciones
    //  2) aleatorio, con GOLDEN_CHANCE en cualquier tirada y para cualquier jugador
    const forcedName = goldenQueue.length ? goldenQueue.shift() : null;
    const forcedPlayer = forcedName ? GameState.players.find(p => p.name === forcedName) : null;
    const forcedMilestone = forcedPlayer ? (appearCounts[forcedPlayer.name] || 0) : 0;
    const isGolden = forcedPlayer ? true : Math.random() < GOLDEN_CHANCE;
    const isSafe = !isGolden && (Math.random() < 0.1);

    // Resultado del tiro
    let p1 = GameState.players[Math.floor(Math.random() * GameState.players.length)];
    let otherPlayers = GameState.players.filter(p => p.name !== p1.name);
    let p2 = otherPlayers[Math.floor(Math.random() * otherPlayers.length)];
    let ch = pickChallenge().challenge;

    if (isGolden) {
        buildReel('reel-1', generatePlayerStrip(goldItem()));
        buildReel('reel-2', generatePlayerStrip(goldItem()));
        buildReel('reel-3', generateChallengeStrip(goldItem()));
    } else if (isSafe) {
        buildReel('reel-1', generatePlayerStrip({ text: p1.name, icon: 'fa-user', color: p1.color }));
        buildReel('reel-2', generatePlayerStrip({ text: p2.name, icon: 'fa-user', color: p2.color }));
        buildReel('reel-3', generateChallengeStrip({ text: 'ZONA SEGURA', icon: 'fa-shield-halved', color: 'blue' }));
    } else {
        buildReel('reel-1', generatePlayerStrip({ text: p1.name, icon: 'fa-user', color: p1.color }));
        buildReel('reel-2', generatePlayerStrip({ text: p2.name, icon: 'fa-user', color: p2.color }));
        buildReel('reel-3', generateChallengeStrip({ text: ch.text, icon: ch.icon, color: '#111' }));
    }

    // Arrancar los tres rodillos
    setTimeout(() => {
        REEL_IDS.forEach((id, i) => animateReel(id, STOP_TIMES[i] / 1000));
    }, 60);

    // Parada escalonada, con partículas en cada rodillo que se detiene
    REEL_IDS.forEach((id, i) => {
        setTimeout(() => onReelStop(i + 1, isGolden), STOP_TIMES[i] + 80);
    });

    // Celebración final y carta
    const endTime = STOP_TIMES[STOP_TIMES.length - 1] + 200;
    setTimeout(() => {
        celebrateWin(isGolden, isSafe);
        
        // Reproducir sonido especial si es Reto de Oro
        if (isGolden) {
            playSound(prizeBuffer, 1.0);
        }
    }, endTime);

    setTimeout(() => {
        btnSpin.disabled = false;
        showSlotModal(p1, p2, ch, isGolden, forcedPlayer, forcedMilestone, isSafe);
    }, endTime + (isGolden ? 2200 : 1300));
}

function generatePlayerStrip(winner) {
    const items = [];
    for (let i = 0; i < STRIP_LEN - 1; i++) {
        // Algún ? suelto de relleno para que se vea el símbolo especial girando
        if (Math.random() < 0.18) { items.push(goldItem()); continue; }
        const randP = GameState.players[Math.floor(Math.random() * GameState.players.length)];
        items.push({ text: randP.name, icon: 'fa-user', color: randP.color });
    }
    items.push(winner);
    return items;
}

function generateChallengeStrip(winner) {
    const items = [];
    for (let i = 0; i < STRIP_LEN - 1; i++) {
        if (Math.random() < 0.18) { items.push(goldItem()); continue; }
        const c = pickChallenge().challenge;
        items.push({ text: c.text, icon: c.icon, color: '#111' });
    }
    items.push(winner);
    return items;
}

function buildReel(reelId, stripItems) {
    const reel = document.getElementById(reelId);
    reel.innerHTML = '';
    reel.style.transition = 'none';
    reel.style.transform = 'translateY(0)';
    // forzar reflow para que el reset se aplique antes de la nueva transición
    void reel.offsetHeight;

    stripItems.forEach(item => {
        const div = document.createElement('div');
        div.className = 'slot-item';
        if (item.golden) {
            div.classList.add('golden-item');
            div.innerHTML = `<span class="q-mark">?</span><span class="q-label">RETO DE ORO</span>`;
        } else {
            div.innerHTML = `<i class="fa-solid ${item.icon}" style="color:${item.color}"></i>` +
                            `<span class="item-text">${item.text}</span>`;
        }
        reel.appendChild(div);
    });
}

function animateReel(reelId, durationSec) {
    const reel = document.getElementById(reelId);
    const targetY = -((STRIP_LEN - 1) * ITEM_H);
    reel.classList.add('spinning');
    reel.style.transition = `transform ${durationSec}s cubic-bezier(0.16, 0.86, 0.13, 1)`;
    reel.style.transform = `translateY(${targetY}px)`;
}

function onReelStop(reelNumber, isGolden) {
    const reel = document.getElementById(`reel-${reelNumber}`);
    const viewport = document.getElementById(`viewport-${reelNumber}`);
    reel.classList.remove('spinning');
    viewport.classList.add(isGolden ? 'locked-gold' : 'locked');

    const machine = document.getElementById('slot-machine');
    machine.classList.remove('shake');
    void machine.offsetWidth;
    machine.classList.add('shake');

    const layer = document.getElementById('slot-particles');
    const { x, y } = centerOf(viewport, layer);
    burstParticles(layer, {
        x, y,
        count: isGolden ? 34 : 18,
        spread: isGolden ? 210 : 150,
        colors: isGolden ? GOLD_PALETTE : undefined,
        scale: isGolden ? 1.25 : 1,
        duration: 800
    });
}

function celebrateWin(isGolden, isSafe = false) {
    const layer = document.getElementById('slot-particles');
    const machine = document.getElementById('slot-machine');
    const banner = document.getElementById('slot-win-banner');
    const { x, y } = centerOf(machine, layer);

    banner.style.opacity = '1';
    banner.querySelector('span').innerText = isGolden ? '¡¡¡RETO DE ORO!!!' : (isSafe ? '¡ZONA SEGURA!' : '¡PREMIO!');
    banner.classList.remove('show', 'gold');
    void banner.offsetWidth;
    banner.classList.add('show');

    if (isGolden) {
        // Doble ración de partículas y animación para el reto de oro
        banner.classList.add('gold');
        machine.classList.add('jackpot');
        goldenExplosion(layer, { x, y, waves: 4, scale: 1.6 });
        setTimeout(() => goldenExplosion(layer, { x, y, waves: 3, scale: 1.3 }), 500);
    } else {
        burstParticles(layer, { x, y, count: 55, spread: 340, duration: 1100, scale: 1.2 });
        confettiRain(layer, { count: 55 });
    }
}

/** Centro de un elemento en coordenadas del contenedor de partículas. */
function centerOf(el, layer) {
    const r = el.getBoundingClientRect();
    const lr = layer.getBoundingClientRect();
    return { x: r.left - lr.left + r.width / 2, y: r.top - lr.top + r.height / 2 };
}

function showSlotModal(p1, p2, ch, isGolden, forcedPlayer = null, forcedMilestone = 0, isSafe = false) {
    const content = document.getElementById('card-content');
    const btnClose = document.getElementById('btn-close-modal');
    const oldOnClick = btnClose.onclick;

    if (isGolden) {
        const chosen = forcedPlayer || GameState.players[Math.floor(Math.random() * GameState.players.length)];
        content.className = 'challenge-card cartoon-box golden';
        content.style.backgroundColor = '';
        document.getElementById('card-title').innerText = 'RETO DE ORO';
        document.getElementById('card-icon').className = 'main-icon fa-solid fa-crown';
        document.getElementById('card-desc').innerText = forcedPlayer
            ? `¡${chosen.name} ha llegado a ${forcedMilestone} apariciones y se lleva el RETO DE ORO garantizado! Invéntate un reto y el resto de jugadores tendrán que cumplirlo.`
            : `¡${chosen.name} ha sacado los tres interrogantes! Invéntate un reto y el resto de jugadores tendrán que cumplirlo.`;
    } else if (isSafe) {
        content.className = `challenge-card cartoon-box sencillos`;
        content.style.backgroundColor = '';
        document.getElementById('card-title').innerText = `${p1.name} y ${p2.name}`;
        document.getElementById('card-icon').className = `main-icon fa-solid fa-shield-halved`;
        document.getElementById('card-desc').innerText = `¡ZONA SEGURA! Os habéis librado, vuestro marcador no se ve afectado (+0).`;
    } else {
        // Solo las tiradas normales muestran jugadores: suben su contador.
        // Cada múltiplo de 10 (10, 20, 30...) otorga un RETO DE ORO garantizado.
        [p1, p2].forEach(p => {
            appearCounts[p.name] = (appearCounts[p.name] || 0) + 1;
            if (appearCounts[p.name] % APPEARANCES_FOR_GOLDEN === 0) {
                goldenQueue.push(p.name);
            }
        });

        const cat = categoryOf(ch);

        content.className = `challenge-card cartoon-box ${cat}`;
        content.style.backgroundColor = '';
        document.getElementById('card-title').innerText = `${p1.name} y ${p2.name}`;
        document.getElementById('card-icon').className = `main-icon fa-solid ${ch.icon}`;
        document.getElementById('card-desc').innerText = ch.description.replace('{playerName}', 'el otro jugador');
    }

    renderMaquinitaIndex();

    btnClose.onclick = () => {
        document.getElementById('card-modal').style.display = 'none';
        clearLayer(document.getElementById('modal-particles'));
        resetSlotVisuals();
        btnClose.onclick = oldOnClick;
    };

    document.getElementById('card-modal').style.display = 'flex';
    if (isGolden) celebrateGoldenCard();
}