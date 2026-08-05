import { GameState, getRandomOtherPlayer } from '../main.js';
import { pickChallenge } from '../data/mezcla.js';
import { burstParticles, clearLayer, celebrateGoldenCard, GOLD_PALETTE } from '../utils/effects.js';
import { renderIndexRows } from '../utils/playerIndex.js';

// --- INICIO CONFIGURACIÓN DE AUDIO (CAJA SORPRESA) ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let openBuffer = null;
let boomBuffer = null;
let prizeBuffer = null;

// Cargar el sonido de abrir la caja (el mismo "toc" de los saltos de la oca)
fetch('/media/audio/jump.mp3')
    .then(res => res.arrayBuffer())
    .then(data => audioCtx.decodeAudioData(data))
    .then(buffer => openBuffer = buffer)
    .catch(err => console.error("Error cargando el audio jump:", err));

// Cargar el sonido de la explosión (traqueteo de madera del dado)
fetch('/media/audio/dice.mp3')
    .then(res => res.arrayBuffer())
    .then(data => audioCtx.decodeAudioData(data))
    .then(buffer => boomBuffer = buffer)
    .catch(err => console.error("Error cargando el audio dice:", err));

// Cargar el sonido del premio dorado
fetch('/media/audio/prize.mp3')
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
// --- FIN CONFIGURACIÓN DE AUDIO (CAJA SORPRESA) ---

// El campo tiene un ancho fijo en unidades de mundo y se escala con CSS: así las
// cajas nunca se solapan ni se salen, sea cual sea la pantalla.
const BOX_COUNT = 30;
const BOMB_COUNT = 2;
const BOMB_VICTIMS = 2;          // cajas que se lleva por delante cada bomba
const FIELD_W = 1000;
const FIELD_H_MIN = 520;
const FIELD_H_MAX = 900;
const BOX_MAX_W = 100;
const BOX_MIN_W = 62;
const BOX_RATIO = 0.886;         // alto respecto al ancho (el del dibujo de la caja)
const BOX_SCALES = [0.84, 0.92, 1, 1.08, 1.18];   // unas cajas algo más grandes que otras
const TARGET_FILL = 0.3;         // parte del campo que ocupan las cajas: deja aire para repartirlas
const MARGIN = 16;
const VARIANTS = 5;

// Restos de cada variante, para que la explosión sea del color de su caja.
// Ninguno coincide con los colores de las dificultades: el color de la caja no
// dice nada del reto que esconde.
const DEBRIS = {
    1: ['#5B5BD6', '#8484E8', '#3B3BA8', '#FFF6E0'],
    2: ['#E45FA8', '#F58BC4', '#B23C7E', '#FFF6E0'],
    3: ['#2FB8A8', '#5FD8C8', '#1E8578', '#FFF6E0'],
    4: ['#9B5DE5', '#B98BF0', '#7038B8', '#FFF6E0'],
    5: ['#5A7D9A', '#86A6BE', '#3C5B75', '#FFF6E0']
};

let boxes = [];
let busy = false;                // bloquea clics mientras se resuelve una caja
let openedCounts = {};
let goldenFinders = [];
let fieldH = 700, scale = 1, offsetX = 0, offsetY = 0;
let baseW = 92;
let eventsBound = false;

export function startCajaSorpresa() {
    window.goToScreen('caja-screen');
    GameState.currentPlayerIndex = 0;

    openedCounts = {};
    GameState.players.forEach(p => { openedCounts[p.name] = 0; });
    goldenFinders = [];

    bindCajaEvents();
    generateBoxes();
}

function bindCajaEvents() {
    if (eventsBound) return;
    document.getElementById('btn-caja-regen').addEventListener('click', generateBoxes);
    // Al cambiar el tamaño solo se reencaja la escala: las posiciones son del mundo,
    // así que las cajas siguen sin solaparse y no hace falta repartirlas otra vez
    window.addEventListener('resize', () => applyFieldView());
    eventsBound = true;
}

function isActive() {
    const screen = document.getElementById('caja-screen');
    return !!screen && screen.classList.contains('active');
}

const remaining = () => boxes.filter(b => !b.gone).length;

// ================= GENERACIÓN =================

function generateBoxes() {
    busy = false;
    clearLayer(document.getElementById('caja-particles'));
    document.getElementById('caja-empty').classList.remove('show');

    measureField();

    // Las más grandes primero: así encuentran sitio antes de que se llene el campo
    const sizes = Array.from({ length: BOX_COUNT }, () => {
        const w = Math.round(baseW * BOX_SCALES[Math.floor(Math.random() * BOX_SCALES.length)]);
        return { w, h: Math.round(w * BOX_RATIO) };
    }).sort((a, b) => b.w - a.w);

    const spots = scatterBoxes(sizes) || gridBoxes(sizes);
    const contents = buildContents(BOX_COUNT);

    const world = document.getElementById('caja-world');
    world.innerHTML = '';

    boxes = spots.map((spot, i) => {
        const box = {
            id: i,
            x: spot.x, y: spot.y, w: spot.w, h: spot.h,
            variant: 1 + Math.floor(Math.random() * VARIANTS),
            tilt: (Math.random() * 9 - 4.5).toFixed(1),
            content: contents[i],
            gone: false,
            el: null
        };
        box.el = buildBoxEl(box);
        world.appendChild(box.el);
        return box;
    });

    applyFieldView();
    updateCajaUI();
    renderCajaIndex();
}

/**
 * Contenido de las cajas: un RETO DE ORO, dos bombas y el resto retos al azar
 * respetando la mezcla de porcentajes elegida en el menú.
 */
function buildContents(count) {
    const list = [{ kind: 'golden' }];
    for (let i = 0; i < BOMB_COUNT; i++) list.push({ kind: 'bomba' });

    for (let i = 0; i < count - 1 - BOMB_COUNT; i++) {
        const pick = pickChallenge();
        list.push(pick
            ? { kind: 'reto', challenge: pick.challenge, cat: pick.category }
            : { kind: 'reto', cat: 'beber', challenge: {
                  text: 'A BEBER', icon: 'fa-beer-mug-empty', description: 'Te toca beber un trago.' } });
    }

    return shuffle(list);
}

/**
 * Reparte las cajas al azar por todo el campo. Se rechaza cualquier posición que
 * solape con otra caja; si el hueco se acaba, se prueba con menos separación.
 */
function scatterBoxes(sizes) {
    const spots = [];

    for (const { w, h } of sizes) {
        const maxX = FIELD_W - MARGIN - w;
        const maxY = fieldH - MARGIN - h;
        if (maxX <= MARGIN || maxY <= MARGIN) return null;

        let placed = false;
        for (const gap of [16, 10, 5, 1]) {
            for (let attempt = 0; attempt < 1200; attempt++) {
                const x = MARGIN + Math.random() * (maxX - MARGIN);
                const y = MARGIN + Math.random() * (maxY - MARGIN);
                const free = spots.every(s =>
                    x + w + gap <= s.x || s.x + s.w + gap <= x ||
                    y + h + gap <= s.y || s.y + s.h + gap <= y);
                if (free) { spots.push({ x, y, w, h }); placed = true; break; }
            }
            if (placed) break;
        }
        if (!placed) return null;
    }

    return spots;
}

/**
 * Plan B para cuando el campo va muy justo: rejilla con las filas desplazadas
 * media casilla y cada caja descolocada dentro de la suya, para que no se lea
 * como una cuadrícula.
 */
function gridBoxes(sizes) {
    const usableW = FIELD_W - MARGIN * 2;
    const usableH = fieldH - MARGIN * 2;
    const widest = Math.max(...sizes.map(s => s.w));
    const tallest = Math.max(...sizes.map(s => s.h));
    const cols = Math.max(1, Math.min(sizes.length, Math.floor(usableW / (widest + 6))));
    const rows = Math.ceil(sizes.length / cols);
    const cellW = usableW / cols;
    const cellH = Math.max(tallest, usableH / rows);

    const cells = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) cells.push({ r, c });
    }
    shuffle(cells);

    return sizes.map(({ w, h }, i) => {
        const { r, c } = cells[i];
        const stagger = (r % 2) ? Math.min(cellW / 2, Math.max(0, cellW - w)) / 2 : 0;
        return {
            x: MARGIN + c * cellW + stagger + Math.random() * Math.max(0, cellW - w - stagger),
            y: MARGIN + r * cellH + Math.random() * Math.max(0, cellH - h),
            w, h
        };
    });
}

/**
 * Caja cartoon en SVG (vectorial: nítida a cualquier tamaño). Tres caras planas
 * —frente, tapa superior y lateral— le dan el volumen sin usar degradados.
 */
function boxSvg() {
    return `<svg class="box-svg" viewBox="6 16 88 78" aria-hidden="true">
        <ellipse class="box-shine" cx="50" cy="30" rx="30" ry="17"/>
        <polygon class="face-side"  points="70,46 86,32 86,76 70,90"/>
        <polygon class="face-top"   points="14,46 30,32 86,32 70,46"/>
        <polygon class="face-front" points="14,46 70,46 70,90 14,90"/>
        <polygon class="ribbon-front" points="36,46 48,46 48,90 36,90"/>
        <g class="box-lid">
            <polygon class="lid-side"  points="74,34 90,20 90,32 74,46"/>
            <polygon class="lid-top"   points="10,34 26,20 90,20 74,34"/>
            <polygon class="lid-front" points="10,34 74,34 74,46 10,46"/>
            <polygon class="ribbon-lid-top"   points="36,34 52,20 64,20 48,34"/>
            <polygon class="ribbon-lid-front" points="36,34 48,34 48,46 36,46"/>
        </g>
    </svg>`;
}

function buildBoxEl(b) {
    const el = document.createElement('div');
    el.className = `box box-c${b.variant}`;
    el.style.left = `${b.x.toFixed(1)}px`;
    el.style.top = `${b.y.toFixed(1)}px`;
    el.style.width = `${b.w}px`;
    el.style.height = `${b.h}px`;
    el.style.setProperty('--tilt', `${b.tilt}deg`);

    el.innerHTML = `<div class="box-tilt"><div class="box-hop">${boxSvg()}</div></div>`;
    el.addEventListener('click', () => openBox(b));
    return el;
}

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// ================= ABRIR UNA CAJA =================

function openBox(b) {
    if (busy || b.gone || !isActive()) return;
    if (!GameState.players.length) return;
    busy = true;

    const cp = GameState.players[GameState.currentPlayerIndex];
    const hop = b.el.querySelector('.box-hop');

    // La caja se comprime y da un brinco
    hop.classList.add('hop');
    playSound(openBuffer, 0.5);

    // Y al caer salta la tapa por los aires
    setTimeout(() => {
        if (b.gone) return;
        b.el.classList.add('open');
        if (b.content.kind === 'golden') b.el.classList.add('glow-gold');
        if (b.content.kind === 'bomba') b.el.classList.add('glow-bomb');
        sparkle(b, b.content.kind === 'golden' ? 26 : 14);
    }, 300);

    // Si se sale del minijuego a media animación, la carta no debe saltar encima del menú
    setTimeout(() => {
        if (!isActive()) { busy = false; return; }
        revealBox(b, cp);
    }, 800);
}

function revealBox(b, cp) {
    openedCounts[cp.name] = (openedCounts[cp.name] || 0) + 1;

    if (b.content.kind === 'golden') {
        goldenFinders.push(cp.name);
        renderCajaIndex();
        showCard({
            text: 'RETO DE ORO', icon: 'fa-crown', cat: 'golden',
            desc: `¡${cp.name} ha encontrado el RETO DE ORO! Invéntate un reto y el resto de jugadores tendrán que cumplirlo.`
        }, () => finishBox(b, false));
        return;
    }

    if (b.content.kind === 'bomba') {
        renderCajaIndex();
        const victims = Math.min(BOMB_VICTIMS, remaining() - 1);
        const arrastra = victims === 1 ? 'la caja más cercana' : `las ${victims} cajas más cercanas`;
        showCard({
            text: '¡CAJA BOMBA!', icon: 'fa-bomb', cat: 'bomba',
            desc: victims > 0
                ? `¡Era una bomba! Al explotar se lleva por delante ${arrastra}. Esta vez te libras del reto.`
                : '¡Era una bomba! No queda ninguna caja cerca a la que llevarse por delante. Esta vez te libras del reto.'
        }, () => finishBox(b, true));
        return;
    }

    const desc = b.content.challenge.description.replace('{playerName}', getRandomOtherPlayer(cp.name));
    renderCajaIndex();
    showCard({
        text: b.content.challenge.text,
        icon: b.content.challenge.icon,
        cat: b.content.cat,
        desc
    }, () => finishBox(b, false));
}

/** Al cerrar la carta la caja explota; si era una bomba, se lleva a sus vecinas. */
function finishBox(b, isBomb) {
    const victims = isBomb ? nearestBoxes(b, BOMB_VICTIMS) : [];

    explodeBox(b, isBomb ? 1.8 : 1);
    if (isBomb) shockwave(b);

    victims.forEach((v, i) => setTimeout(() => explodeBox(v, 1.35), 200 + i * 170));

    const wait = isBomb ? 900 : 430;
    setTimeout(() => {
        busy = false;
        nextTurn();
    }, wait);
}

/** Las `n` cajas que quedan más cerca del centro de la que explota. */
function nearestBoxes(b, n) {
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    return boxes
        .filter(o => o !== b && !o.gone)
        .map(o => ({ box: o, d: Math.hypot(o.x + o.w / 2 - cx, o.y + o.h / 2 - cy) }))
        .sort((a, z) => a.d - z.d)
        .slice(0, n)
        .map(o => o.box);
}

function explodeBox(b, power = 1) {
    if (b.gone) return;
    b.gone = true;

    const layer = document.getElementById('caja-particles');
    const pt = boxPoint(b);
    burstParticles(layer, {
        x: pt.x, y: pt.y,
        count: Math.round(26 * power),
        spread: 150 * power,
        duration: 820,
        scale: power,
        colors: DEBRIS[b.variant]
    });

    playSound(boomBuffer, Math.min(0.9, 0.42 * power));

    b.el.classList.add('boom');
    setTimeout(() => b.el.remove(), 480);
    updateCajaUI();
}

/** Onda expansiva de la bomba. */
function shockwave(b) {
    const layer = document.getElementById('caja-particles');
    if (!layer) return;
    const pt = boxPoint(b);
    const ring = document.createElement('div');
    ring.className = 'box-shock';
    ring.style.left = `${pt.x}px`;
    ring.style.top = `${pt.y}px`;
    layer.appendChild(ring);
    setTimeout(() => ring.remove(), 700);
}

function sparkle(b, count) {
    const layer = document.getElementById('caja-particles');
    const pt = boxPoint(b);
    burstParticles(layer, {
        x: pt.x, y: pt.y - b.h * scale * 0.3,
        count, spread: 110, duration: 700, colors: GOLD_PALETTE, star: true
    });
}

/** Centro de una caja en coordenadas de la capa de partículas. */
function boxPoint(b) {
    const layer = document.getElementById('caja-particles');
    if (!b.el || !layer) return { x: 0, y: 0 };
    const r = b.el.getBoundingClientRect();
    const lr = layer.getBoundingClientRect();
    return { x: r.left - lr.left + r.width / 2, y: r.top - lr.top + r.height / 2 };
}

function nextTurn() {
    if (GameState.players.length) {
        GameState.currentPlayerIndex = (GameState.currentPlayerIndex + 1) % GameState.players.length;
    }

    if (remaining() === 0) {
        document.getElementById('caja-empty').classList.add('show');
    }

    updateCajaUI();
    renderCajaIndex();
}

// ================= VISTA =================

/**
 * Alto del campo según el hueco disponible y tamaño base de caja que deja sitio
 * a las 30 sin apretujarse (solo al generar una tanda nueva).
 */
function measureField() {
    const field = document.getElementById('caja-field');
    const w = (field && field.clientWidth) || FIELD_W;
    const h = (field && field.clientHeight) || 620;
    const base = Math.min(w / FIELD_W, 1.15);
    fieldH = Math.max(FIELD_H_MIN, Math.min(FIELD_H_MAX, h / base));

    const usable = (FIELD_W - MARGIN * 2) * (fieldH - MARGIN * 2);
    const meanSq = BOX_SCALES.reduce((s, v) => s + v * v, 0) / BOX_SCALES.length;
    const area = usable * TARGET_FILL / (BOX_COUNT * meanSq);
    baseW = Math.max(BOX_MIN_W, Math.min(BOX_MAX_W, Math.round(Math.sqrt(area / BOX_RATIO))));
}

/** Escala el campo para que quepa entero, y lo centra. */
function applyFieldView() {
    const field = document.getElementById('caja-field');
    const world = document.getElementById('caja-world');
    if (!field || !world) return;

    const w = field.clientWidth || FIELD_W;
    const h = field.clientHeight || 620;

    scale = Math.min(w / FIELD_W, 1.15);
    if (fieldH * scale > h) scale = h / fieldH;
    offsetX = Math.max(0, (w - FIELD_W * scale) / 2);
    offsetY = Math.max(0, (h - fieldH * scale) / 2);

    world.style.width = `${FIELD_W}px`;
    world.style.height = `${fieldH}px`;
    world.style.transform =
        `translate(${offsetX.toFixed(2)}px, ${offsetY.toFixed(2)}px) scale(${scale.toFixed(4)})`;
}

// ================= CARTA =================

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
        playSound(prizeBuffer, 1.0);
        celebrateGoldenCard();
    } else if (data.cat === 'bomba') {
        const layer = document.getElementById('modal-particles');
        clearLayer(layer);
        burstParticles(layer, {
            x: (layer.clientWidth || window.innerWidth) / 2,
            y: (layer.clientHeight || window.innerHeight) / 2,
            count: 60, spread: 340, duration: 1000, scale: 1.2,
            colors: ['#ff3b3b', '#8f0000', '#ffb703', '#2b0b0b', '#ffffff']
        });
    }
}

// ================= INTERFAZ =================

function updateCajaUI() {
    const indicator = document.getElementById('caja-turn-indicator');
    const hint = document.getElementById('caja-hint');
    if (!indicator) return;

    const left = remaining();

    if (left === 0) {
        indicator.innerHTML = '¡NO QUEDAN CAJAS!';
        if (hint) hint.textContent = 'Generad una tanda nueva para seguir jugando.';
    } else {
        const cp = GameState.players[GameState.currentPlayerIndex];
        indicator.innerHTML = cp ? `Turno de: ${nameTag(cp)}` : 'Turno de: ...';
        if (hint) hint.textContent = `Elige una caja · quedan ${left} de ${BOX_COUNT}`;
    }

    indicator.classList.remove('next-turn-anim');
    void indicator.offsetWidth;
    indicator.classList.add('next-turn-anim');
}

function nameTag(player) {
    return `<span style="color:${player.color}; font-size: 1.5em; -webkit-text-stroke: 1.5px black; text-shadow: 2px 2px 0 #000">${player.name}</span>`;
}

/** Índice con las cajas que ha abierto cada jugador. */
function renderCajaIndex() {
    const list = document.getElementById('caja-index-list');
    if (!list) return;

    const cp = GameState.players[GameState.currentPlayerIndex];

    renderIndexRows(list, GameState.players.map(p => ({
        name: p.name,
        color: p.color,
        badge: openedCounts[p.name] || 0,
        active: !!cp && cp.name === p.name && remaining() > 0,
        // En oro quien ha encontrado el RETO DE ORO
        highlight: goldenFinders.includes(p.name)
    })));
}
