import { GameState } from '../main.js';
import { pickCategory, CATEGORY_COLORS, iconColorFor } from '../data/mezcla.js';
import { allChallenges } from '../data/retos.js';
import { burstParticles, confettiRain, goldenExplosion, clearLayer, GOLD_PALETTE } from '../utils/effects.js';
import { renderIndexRows } from '../utils/playerIndex.js';

// --- INICIO CONFIGURACIÓN DE AUDIO (PLINKO) ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let bounceBuffer = null;
let prizeBuffer = null;

// Cargar el sonido del rebote (mismo "toc" que los saltos de la oca)
fetch('/media/audio/jump.mp3')
    .then(res => res.arrayBuffer())
    .then(data => audioCtx.decodeAudioData(data))
    .then(buffer => bounceBuffer = buffer)
    .catch(err => console.error("Error cargando el audio jump:", err));

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

let lastBounceAt = 0;

/** Rebote con límite de ráfaga: con 8 bolas a la vez se solaparían decenas de golpes. */
function playBounce(strength = 1) {
    if (!bounceBuffer) return;
    const now = audioCtx.currentTime;
    if (now - lastBounceAt < 0.035) return;
    lastBounceAt = now;
    playSound(bounceBuffer, Math.min(0.34, 0.1 + strength * 0.24));
}
// --- FIN CONFIGURACIÓN DE AUDIO (PLINKO) ---

// --- GEOMETRÍA DEL CIRCUITO ---
// El ancho del mundo es fijo y se escala con CSS: así la física es idéntica en
// cualquier pantalla. El alto se calcula en cada ronda para que el circuito
// COMPLETO quepa de una vez (bolas arriba, cestas abajo), que es lo que permite
// apuntar a una cesta al elegir bola.
const WORLD_W = 960;
const BIN_COUNT = 8;
const BIN_W = WORLD_W / BIN_COUNT;                 // 120
const SLOT_COUNT = 8;                              // siempre 8 bolas, haya los jugadores que haya
const DROP_Y = 36;
const PEG_TOP = 104;                               // primera fila de obstáculos
const ROW_GAP = 56;
const PEG_ROWS_MIN = 6;
const PEG_ROWS_MAX = 12;
const BIN_GAP = 58;                                // hueco entre la última fila y las cestas
const MOUTH_H = 44;                                // boca de la cesta: ahí se para la bola
const BASKET_H = 230;
const PEG_R = 8;
const POST_R = 10;
const BALL_R = 15;

// Dos obstáculos más cerca que esto dejarían un hueco por el que la bola no pasa
// (2·PEG_R + 2·BALL_R = 46), y podría quedarse encajada encima de los dos.
const MIN_PEG_D = 58;
const MIN_PEG_DY = 34;
const WALL_CLEAR = 46;                             // canal mínimo junto a las paredes

const SLOT_X = Array.from({ length: SLOT_COUNT }, (_, i) => WORLD_W * (i + 0.5) / SLOT_COUNT);

let pegRows = 9;
let binTop = 662;
let worldH = 892;

// --- FÍSICA ---
const GRAVITY = 1500;
const PEG_REST = 0.55;        // rebote contra los obstáculos
const WALL_REST = 0.5;
const BALL_REST = 0.4;
const MAX_SPEED = 1250;
const SUB_DT = 1 / 240;       // paso fijo: rebotes estables aunque bajen los fps
const CAM_TWEEN = 0.6;
const GOLDEN_CHANCE = 0.15;   // probabilidad de que una de las 3 cestas de reto sea dorada
const COUNTDOWN_FROM = 3;

// Patrones de obstáculos: cada ronda se genera uno distinto, pero siempre ordenado
const PATTERNS = ['triangulos', 'triangulos', 'rombos', 'panal', 'arcos', 'anillos'];

let round = 0;                // ronda: rota quién elige primero
let phase = 'idle';           // 'select' | 'countdown' | 'drop' | 'result'
let order = [];               // orden de elección de esta ronda
let pickIndex = 0;
let bins = [];
let pegs = [];
let balls = [];
let activeCount = 0;          // bolas que caen (las que ha elegido alguien)
let landedCount = 0;
let goldenSoundPlayed = false;
let patternName = '';

let camY = 0, camMode = 'follow', camFrom = 0, camTo = 0, camT = 0;
let scale = 1, offsetX = 0, offsetY = 0, viewH = 600;
let dpr = 1;
let rafId = null, lastT = 0, idleStopAt = 0;
let countdownTimer = null;
let eventsBound = false;

export function startPlinko() {
    window.goToScreen('plinko-screen');
    round = 0;
    bindPlinkoEvents();
    newRound();
}

function bindPlinkoEvents() {
    if (eventsBound) return;
    document.getElementById('btn-plinko-relaunch').addEventListener('click', () => {
        if (phase !== 'result') return;
        round++;
        newRound();
    });
    window.addEventListener('resize', () => {
        // Mientras se elige sí se puede recolocar el circuito (las bolas no se han
        // movido de sitio, así que se conservan las elecciones). A media caída, no:
        // solo se reencaja la vista.
        if (phase === 'select') {
            layoutWorld();
            pegs = buildPegs();
        }
        applyView();
        draw();
    });
    eventsBound = true;
}

/** Si se sale del minijuego a media ronda, los temporizadores pendientes se rinden. */
function isActive() {
    const screen = document.getElementById('plinko-screen');
    return !!screen && screen.classList.contains('active');
}

// ================= RONDA =================

function newRound() {
    stopLoop();
    clearTimeout(countdownTimer);
    clearLayer(document.getElementById('plinko-particles'));

    phase = 'select';
    pickIndex = 0;
    landedCount = 0;
    activeCount = 0;
    goldenSoundPlayed = false;
    camY = 0;
    camMode = 'follow';
    idleStopAt = 0;

    const n = GameState.players.length;
    const shift = round % n;
    order = GameState.players.slice(shift).concat(GameState.players.slice(0, shift));

    layoutWorld();
    bins = buildBins();
    pegs = buildPegs();
    balls = SLOT_X.map((x, i) => ({
        slot: i, x, y: DROP_Y,
        vx: 0, vy: 0,
        owner: null,
        idle: false,
        landed: false,
        bin: -1,
        tx: 0, ty: 0,
        stall: 0
    }));

    renderBaskets();
    renderChips();

    const countdown = document.getElementById('plinko-countdown');
    countdown.classList.remove('show', 'go');
    document.getElementById('btn-plinko-relaunch').classList.remove('show');

    applyView();
    draw();
    updatePlinkoUI();
    renderPlinkoIndex();
}

/**
 * Reparte el alto disponible: las cestas van pegadas abajo y los obstáculos
 * ocupan todo lo que sobra, con las filas que quepan. Si la pantalla es muy baja
 * se recorta la escala antes que las filas, para no quedarse sin circuito.
 */
function layoutWorld() {
    const vp = document.getElementById('plinko-viewport');
    const w = (vp && vp.clientWidth) || WORLD_W;
    const h = (vp && vp.clientHeight) || 620;

    const base = Math.min(w / WORLD_W, 1.3);
    const visibleH = h / base;

    const forPegs = visibleH - PEG_TOP - BIN_GAP - BASKET_H;
    pegRows = Math.max(PEG_ROWS_MIN, Math.min(PEG_ROWS_MAX, Math.floor(forPegs / ROW_GAP) + 1));

    // Lo que sobre se lo queda el hueco previo a las cestas, así quedan al ras de abajo
    const gap = Math.max(BIN_GAP, visibleH - BASKET_H - PEG_TOP - (pegRows - 1) * ROW_GAP);
    binTop = PEG_TOP + (pegRows - 1) * ROW_GAP + gap;
    worldH = binTop + BASKET_H;

    const world = document.getElementById('plinko-world');
    if (world) {
        world.style.width = `${WORLD_W}px`;
        world.style.height = `${worldH}px`;
    }
    setupCanvas();
}

function setupCanvas() {
    const canvas = document.getElementById('plinko-canvas');
    if (!canvas) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.style.width = `${WORLD_W}px`;
    canvas.style.height = `${worldH}px`;
    canvas.width = Math.round(WORLD_W * dpr);
    canvas.height = Math.round(worldH * dpr);
}

/**
 * Las 8 cestas de la ronda: 1 zona segura, 4 fijas de beber y 3 retos al azar
 * (uno de ellos puede salir como RETO DE ORO).
 */
function buildBins() {
    const list = [];

    list.push({
        cat: 'sencillos', text: 'ZONA SEGURA', icon: 'fa-shield-halved',
        desc: '¡Te has librado! Ni bebes ni cumples ningún reto.'
    });

    for (let i = 0; i < 4; i++) {
        list.push({
            cat: 'beber', text: 'A BEBER', icon: 'fa-beer-mug-empty',
            desc: 'Te toca beber un trago. ¡Que aproveche!'
        });
    }

    const goldenSlot = Math.random() < GOLDEN_CHANCE ? Math.floor(Math.random() * 3) : -1;
    const used = new Set();

    for (let i = 0; i < 3; i++) {
        if (i === goldenSlot) {
            list.push({
                cat: 'golden', golden: true, text: 'RETO DE ORO', icon: 'fa-crown',
                desc: '¡Invéntate un reto y el resto de jugadores tendrán que cumplirlo!'
            });
            continue;
        }
        const pick = pickRetoChallenge(used);
        list.push({
            cat: pick.category,
            text: pick.challenge.text,
            icon: pick.challenge.icon,
            desc: pick.challenge.description.replace('{playerName}', 'el otro jugador')
        });
    }

    shuffle(list);
    return list;
}

/**
 * Reto al azar respetando la mezcla, pero sin cartas de beber: esas ya tienen
 * sus 4 cestas fijas. Se evita repetir reto en la misma ronda.
 */
function pickRetoChallenge(used) {
    for (let attempt = 0; attempt < 40; attempt++) {
        const category = pickCategory(['sencillos', 'hot', 'extremo']);
        const pool = allChallenges[category] || [];
        if (!pool.length) continue;
        const challenge = pool[Math.floor(Math.random() * pool.length)];
        if (used.has(challenge.id)) continue;
        used.add(challenge.id);
        return { challenge, category };
    }
    return { challenge: allChallenges.sencillos[0], category: 'sencillos' };
}

// ================= OBSTÁCULOS =================

/**
 * Circuito de la ronda. La primera fila va SIEMPRE justo debajo de las 8 bolas,
 * de modo que ninguna puede colarse en una cesta sin rebotar antes; el resto de
 * filas siguen el patrón elegido (triángulos grandes o pequeños, rombos, panal,
 * arcos, anillos...).
 */
function buildPegs() {
    const raw = [];

    // Fila 0: una punta bajo cada bola. Primer rebote garantizado.
    SLOT_X.forEach(x => raw.push({ x, y: PEG_TOP }));

    patternName = PATTERNS[Math.floor(Math.random() * PATTERNS.length)];
    if (patternName === 'anillos') addRings(raw);       // los anillos mandan sobre la retícula
    buildPatternRows(patternName, raw);

    const list = [];
    raw.forEach(p => {
        if (p.x < -1 || p.x > WORLD_W + 1) return;
        // Un obstáculo pegado (pero no clavado) a la pared dejaría un canal donde encajarse
        if (p.x > 6 && p.x < WALL_CLEAR) return;
        if (p.x > WORLD_W - WALL_CLEAR && p.x < WORLD_W - 6) return;
        if (p.y < PEG_TOP - 60 || p.y > binTop - 34) return;
        // Hueco mínimo entre obstáculos para que la bola siempre pueda pasar
        const tight = list.some(q =>
            Math.abs(q.y - p.y) < MIN_PEG_DY && Math.hypot(q.x - p.x, q.y - p.y) < MIN_PEG_D);
        if (tight) return;
        list.push({ x: p.x, y: p.y, r: PEG_R, kind: 'peg', flash: 0 });
    });

    // Postes que remachan la boca de las cestas: la bola nunca entra por la costura
    for (let i = 1; i < BIN_COUNT; i++) {
        list.push({ x: BIN_W * i, y: binTop, r: POST_R, kind: 'post', flash: 0 });
    }

    return list;
}

function buildPatternRows(pattern, out) {
    const rowY = r => PEG_TOP + r * ROW_GAP;

    if (pattern === 'triangulos') {
        // Triángulos más grandes o más pequeños según la separación
        const spacing = [96, 120, 160][Math.floor(Math.random() * 3)];
        for (let r = 1; r < pegRows; r++) fillRow(out, rowY(r), spacing, (r % 2) ? spacing / 2 : 0);

    } else if (pattern === 'panal') {
        const spacing = 80;
        for (let r = 1; r < pegRows; r++) fillRow(out, rowY(r), spacing, (r % 2) ? spacing / 2 : 0);

    } else if (pattern === 'rombos') {
        for (let r = 1; r < pegRows; r++) {
            if (r % 2) fillRow(out, rowY(r), 80, 40);
            else fillRow(out, rowY(r), 160, 0);
        }

    } else if (pattern === 'arcos') {
        const amp = 20 + Math.random() * 16;
        const lobes = 1 + Math.floor(Math.random() * 2);
        for (let r = 1; r < pegRows; r++) {
            const dir = (r % 2) ? -1 : 1;
            fillRow(out, rowY(r), 120, (r % 2) ? 60 : 0,
                    x => dir * amp * Math.sin(Math.PI * lobes * x / WORLD_W));
        }

    } else {  // anillos: retícula ancha de fondo para que no queden zonas vacías
        for (let r = 1; r < pegRows; r++) fillRow(out, rowY(r), 160, (r % 2) ? 80 : 0);
    }
}

function fillRow(out, y, spacing, offset, warp = null) {
    for (let x = offset; x <= WORLD_W + 0.5; x += spacing) {
        out.push({ x, y: y + (warp ? warp(x) : 0) });
    }
}

/** Uno o dos anillos concéntricos en el centro del tablero. */
function addRings(out) {
    const top = PEG_TOP + ROW_GAP;
    const bottom = PEG_TOP + (pegRows - 1) * ROW_GAP;
    const cy = (top + bottom) / 2;
    const maxRad = Math.min((bottom - top) / 2, 240);
    if (maxRad < 80) return;

    const rings = maxRad > 180 ? 2 : 1;
    for (let i = 0; i < rings; i++) {
        const rad = maxRad - i * 96;
        if (rad < 76) break;
        const count = Math.max(6, Math.round(2 * Math.PI * rad / 80));
        for (let k = 0; k < count; k++) {
            const a = (k / count) * Math.PI * 2 + (i * Math.PI / count);
            out.push({ x: WORLD_W / 2 + Math.cos(a) * rad, y: cy + Math.sin(a) * rad });
        }
    }
}

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// ================= CESTAS Y BOLAS (DOM) =================

function renderBaskets() {
    const holder = document.getElementById('plinko-baskets');
    holder.innerHTML = '';
    holder.style.height = `${BASKET_H}px`;

    bins.forEach((bin, i) => {
        const el = document.createElement('div');
        el.className = `plinko-basket${bin.golden ? ' golden' : ''}`;
        el.dataset.bin = String(i);
        el.style.width = `${BIN_W}px`;
        el.style.setProperty('--mouth-h', `${MOUTH_H}px`);
        if (!bin.golden) {
            el.style.background = CATEGORY_COLORS[bin.cat];
            el.style.color = bin.cat === 'extremo' ? '#FFFFFF' : '#000000';
        }

        const iconStyle = bin.golden ? '' : ` style="color:${iconColorFor(bin.cat)}"`;
        el.innerHTML =
            `<div class="basket-mouth"></div>` +
            `<div class="basket-body">` +
                `<i class="fa-solid ${bin.icon}"${iconStyle}></i>` +
                `<span class="basket-title">${bin.text}</span>` +
                `<span class="basket-desc">${bin.desc}</span>` +
                `<div class="basket-hits"></div>` +
            `</div>`;

        holder.appendChild(el);
    });
}

function renderChips() {
    const holder = document.getElementById('plinko-balls');
    holder.innerHTML = '';
    holder.style.display = '';

    balls.forEach(b => {
        const chip = document.createElement('div');
        chip.className = 'plinko-chip';
        chip.dataset.slot = String(b.slot);
        chip.style.left = `${b.x - BALL_R}px`;
        chip.style.top = `${b.y - BALL_R}px`;
        chip.style.width = `${BALL_R * 2}px`;
        chip.style.height = `${BALL_R * 2}px`;
        chip.style.animationDelay = `${b.slot * 0.11}s`;
        chip.innerHTML = `<span class="chip-mark">?</span><span class="chip-name"></span>`;
        chip.addEventListener('click', () => pickBall(b.slot));
        holder.appendChild(chip);
    });
}

// ================= ELECCIÓN DE BOLA =================

function pickBall(slot) {
    if (phase !== 'select') return;
    const ball = balls.find(b => b.slot === slot);
    if (!ball || ball.owner) return;

    assignBall(ball, order[pickIndex]);
    pickIndex++;
    updatePlinkoUI();
    renderPlinkoIndex();

    // Cuando todos tienen bola, empieza la cuenta atrás
    if (pickIndex >= order.length) countdownTimer = setTimeout(runCountdown, 600);
}

function assignBall(ball, player) {
    if (!player) return;
    ball.owner = player;

    const chip = document.querySelector(`.plinko-chip[data-slot="${ball.slot}"]`);
    if (!chip) return;

    chip.classList.add('taken');
    chip.style.background =
        `radial-gradient(circle at 34% 28%, #ffffff, ${player.color} 48%, ${shade(player.color, 0.5)} 100%)`;
    chip.querySelector('.chip-mark').textContent = player.name.charAt(0);
    chip.querySelector('.chip-name').textContent = player.name;

    chip.classList.remove('pop');
    void chip.offsetWidth;
    chip.classList.add('pop');

    playBounce(0.5);
}

/** Cuenta atrás de 3 segundos con los números animados. */
function runCountdown() {
    if (!isActive()) return;
    phase = 'countdown';
    updatePlinkoUI();

    const layer = document.getElementById('plinko-countdown');
    const span = layer.querySelector('span');
    layer.classList.add('show');

    let n = COUNTDOWN_FROM;
    const tick = () => {
        if (!isActive()) { layer.classList.remove('show', 'go'); return; }
        span.textContent = n > 0 ? String(n) : '¡YA!';
        layer.classList.toggle('go', n === 0);
        span.classList.remove('pop');
        void span.offsetWidth;
        span.classList.add('pop');
        playBounce(n > 0 ? 0.6 : 1);

        if (n === 0) {
            countdownTimer = setTimeout(() => {
                layer.classList.remove('show', 'go');
                startDrop();
            }, 430);
            return;
        }
        n--;
        countdownTimer = setTimeout(tick, 1000);
    };
    tick();
}

function startDrop() {
    if (!isActive()) return;
    phase = 'drop';
    document.getElementById('plinko-balls').style.display = 'none';

    balls.forEach(b => {
        // Las bolas que nadie ha elegido se quedan arriba, quietas
        b.idle = !b.owner;
        if (b.idle) return;
        // Un pelín de azar en la salida: si no, la bola caería clavada sobre la punta
        b.x += (Math.random() - 0.5) * 14;
        b.vx = (Math.random() - 0.5) * 90;
        b.vy = 40;
    });

    activeCount = balls.filter(b => !b.idle).length;
    updatePlinkoUI();
    startLoop();
}

// ================= FÍSICA =================

function step(dt) {
    balls.forEach(b => {
        if (b.idle) return;

        if (b.landed) {
            // Asentamiento suave en su hueco dentro de la cesta
            const k = Math.min(1, dt * 14);
            b.x += (b.tx - b.x) * k;
            b.y += (b.ty - b.y) * k;
            return;
        }

        b.vy += GRAVITY * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;

        // Paredes laterales
        if (b.x < BALL_R) {
            b.x = BALL_R;
            b.vx = Math.abs(b.vx) * WALL_REST;
        } else if (b.x > WORLD_W - BALL_R) {
            b.x = WORLD_W - BALL_R;
            b.vx = -Math.abs(b.vx) * WALL_REST;
        }

        // Obstáculos
        for (const pg of pegs) {
            const dx = b.x - pg.x;
            const dy = b.y - pg.y;
            const min = BALL_R + pg.r;
            const d2 = dx * dx + dy * dy;
            if (d2 >= min * min) continue;

            const d = Math.sqrt(d2) || 0.001;
            const nx = dx / d;
            const ny = dy / d;
            b.x = pg.x + nx * min;
            b.y = pg.y + ny * min;

            const vn = b.vx * nx + b.vy * ny;
            if (vn < 0) {
                b.vx -= (1 + PEG_REST) * vn * nx;
                b.vy -= (1 + PEG_REST) * vn * ny;
                // Empujón tangencial: evita que se quede clavada en la punta
                const kick = (Math.random() - 0.5) * 110;
                b.vx += -ny * kick;
                b.vy += nx * kick;
                pg.flash = 1;
                playBounce(Math.min(1, -vn / 700));
            }
        }

        const sp = Math.hypot(b.vx, b.vy);
        if (sp > MAX_SPEED) {
            b.vx = b.vx / sp * MAX_SPEED;
            b.vy = b.vy / sp * MAX_SPEED;
        }

        // Antibloqueo: una bola casi parada recibe un empujón y sigue su camino
        if (sp < 45) {
            b.stall += dt;
            if (b.stall > 0.3) {
                b.vx += (Math.random() - 0.5) * 280;
                b.vy += 70;
                b.stall = 0;
            }
        } else {
            b.stall = 0;
        }
    });

    // Choques entre bolas
    for (let i = 0; i < balls.length; i++) {
        for (let j = i + 1; j < balls.length; j++) {
            const a = balls[i];
            const b = balls[j];
            if (a.idle || b.idle || a.landed || b.landed) continue;

            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const min = BALL_R * 2;
            const d2 = dx * dx + dy * dy;
            if (d2 >= min * min) continue;

            const d = Math.sqrt(d2) || 0.001;
            const nx = dx / d;
            const ny = dy / d;
            const overlap = (min - d) / 2;
            a.x -= nx * overlap; a.y -= ny * overlap;
            b.x += nx * overlap; b.y += ny * overlap;

            const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
            if (rel < 0) {
                const imp = -(1 + BALL_REST) * rel / 2;
                a.vx -= imp * nx; a.vy -= imp * ny;
                b.vx += imp * nx; b.vy += imp * ny;
            }
        }
    }

    balls.forEach(b => {
        if (!b.idle && !b.landed && b.y > binTop + 6) landBall(b);
    });
}

function landBall(b) {
    b.landed = true;
    b.vx = 0;
    b.vy = 0;
    b.bin = Math.min(BIN_COUNT - 1, Math.max(0, Math.floor(b.x / BIN_W)));

    // Si comparten cesta, se colocan en fila para que se vean todas
    const k = balls.filter(o => o.landed && o.bin === b.bin).length - 1;
    b.tx = BIN_W * (b.bin + 0.5) + ((k % 3) - 1) * (BALL_R * 1.45);
    b.ty = binTop + MOUTH_H * 0.5 + Math.floor(k / 3) * (BALL_R * 1.5);

    landedCount++;
    onBallLanded(b);
}

function onBallLanded(b) {
    const bin = bins[b.bin];
    const el = document.querySelector(`.plinko-basket[data-bin="${b.bin}"]`);

    if (el) {
        el.classList.remove('hit');
        void el.offsetWidth;
        el.classList.add('hit');

        const hits = el.querySelector('.basket-hits');
        if (hits && b.owner) {
            const tag = document.createElement('span');
            tag.className = 'basket-hit';
            tag.innerHTML = `<span class="hit-dot" style="background:${b.owner.color}"></span>${b.owner.name}`;
            hits.appendChild(tag);
        }
    }

    // En la cesta dorada solo suena prize.mp3
    if (bin && bin.golden) {
        if (!goldenSoundPlayed) {
            goldenSoundPlayed = true;
            playSound(prizeBuffer, 1.0);
        }
    } else {
        playBounce(1);
    }

    renderPlinkoIndex();
    if (landedCount >= activeCount) setTimeout(finishRound, 280);
}

function finishRound() {
    if (phase === 'result') return;
    phase = 'result';

    // Con el circuito entero a la vista la cámara ya no tiene que moverse,
    // pero en pantallas muy bajas termina de bajar hasta las cestas
    camMode = 'tween';
    camFrom = camY;
    camTo = Math.max(0, worldH - viewH);
    camT = 0;
    idleStopAt = performance.now() + 3600;

    updatePlinkoUI();
    renderPlinkoIndex();

    setTimeout(() => {
        const layer = document.getElementById('plinko-particles');
        let goldHit = false;

        bins.forEach((bin, i) => {
            if (!balls.some(b => b.bin === i)) return;
            const el = document.querySelector(`.plinko-basket[data-bin="${i}"]`);
            if (el) {
                el.classList.remove('hit');
                void el.offsetWidth;
                el.classList.add('hit');
            }
            const pt = basketPoint(i);
            if (bin.golden) {
                goldHit = true;
                goldenExplosion(layer, { x: pt.x, y: pt.y, waves: 3, scale: 1.4 });
            } else {
                burstParticles(layer, { x: pt.x, y: pt.y, count: 22, spread: 170, duration: 850 });
            }
        });

        if (goldHit) confettiRain(layer, { count: 80, colors: GOLD_PALETTE, duration: 3000 });
        document.getElementById('btn-plinko-relaunch').classList.add('show');
    }, 500);
}

/** Punto de una cesta en coordenadas de la capa de partículas. */
function basketPoint(bin) {
    const el = document.querySelector(`.plinko-basket[data-bin="${bin}"]`);
    const layer = document.getElementById('plinko-particles');
    if (!el || !layer) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    const lr = layer.getBoundingClientRect();
    return { x: r.left - lr.left + r.width / 2, y: r.top - lr.top + Math.min(r.height / 2, 46) };
}

// ================= BUCLE Y CÁMARA =================

function startLoop() {
    stopLoop();
    lastT = performance.now();
    rafId = requestAnimationFrame(loop);
}

function stopLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
}

function loop(t) {
    if (!isActive()) { stopLoop(); return; }

    let dt = (t - lastT) / 1000;
    lastT = t;
    if (dt > 0.05) dt = 0.05;        // tras un parón del navegador, no se salta medio circuito

    let remaining = dt;
    while (remaining > 0) {
        const s = Math.min(SUB_DT, remaining);
        step(s);
        remaining -= s;
    }

    pegs.forEach(p => { if (p.flash) p.flash = Math.max(0, p.flash - dt * 3.4); });

    updateCamera(dt);
    draw();

    if (phase === 'result' && idleStopAt && t > idleStopAt) { stopLoop(); return; }
    rafId = requestAnimationFrame(loop);
}

/** Solo entra en juego si el circuito no cabe entero: sigue a la bola que va primera. */
function updateCamera(dt) {
    const maxCam = Math.max(0, worldH - viewH);
    if (maxCam <= 0) { camY = 0; applyTransform(); return; }

    if (camMode === 'tween') {
        camT = Math.min(1, camT + dt / CAM_TWEEN);
        const e = 1 - Math.pow(1 - camT, 3);
        camY = camFrom + (camTo - camFrom) * e;
    } else {
        const flying = balls.filter(b => !b.idle && !b.landed);
        const pool = flying.length ? flying : balls.filter(b => !b.idle);
        const lead = pool.reduce((m, b) => Math.max(m, b.y), 0);
        camY = Math.max(camY, Math.min(lead - viewH * 0.46, maxCam));
    }

    camY = Math.min(Math.max(camY, 0), maxCam);
    applyTransform();
}

/** Encaja el mundo en el hueco disponible: nunca se recorta el circuito. */
function applyView() {
    const vp = document.getElementById('plinko-viewport');
    if (!vp) return;

    const w = vp.clientWidth || WORLD_W;
    const h = vp.clientHeight || 620;

    scale = Math.min(w / WORLD_W, 1.3);
    if (worldH * scale > h) scale = h / worldH;      // si no cabe a lo alto, se reduce
    offsetX = Math.max(0, (w - WORLD_W * scale) / 2);
    offsetY = Math.max(0, (h - worldH * scale) / 2);
    viewH = h / scale;

    const maxCam = Math.max(0, worldH - viewH);
    camY = Math.min(Math.max(camY, 0), maxCam);
    applyTransform();
}

function applyTransform() {
    const world = document.getElementById('plinko-world');
    if (!world) return;
    world.style.transform =
        `translate(${offsetX.toFixed(2)}px, ${(offsetY - camY * scale).toFixed(2)}px) scale(${scale.toFixed(4)})`;
}

// ================= DIBUJO =================

function draw() {
    const canvas = document.getElementById('plinko-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, WORLD_W, worldH);

    pegs.forEach(pg => (pg.kind === 'post' ? drawPost(ctx, pg) : drawPeg(ctx, pg)));

    // Durante la elección las bolas son fichas del DOM (se pueden tocar)
    if (phase !== 'select' && phase !== 'countdown') balls.forEach(b => drawBall(ctx, b));
}

function drawPeg(ctx, pg) {
    const glow = pg.flash || 0;

    if (glow > 0.05) {
        ctx.beginPath();
        ctx.arc(pg.x, pg.y, pg.r + 9 * glow, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 230, 109, ${0.35 * glow})`;
        ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(pg.x, pg.y, pg.r + glow * 1.6, 0, Math.PI * 2);
    ctx.fillStyle = glow > 0.05 ? '#fff8d0' : '#FFD700';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#000';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(pg.x - pg.r * 0.3, pg.y - pg.r * 0.32, pg.r * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fill();
}

/** Poste que separa las cestas: la bola rebota en su punta antes de colarse. */
function drawPost(ctx, pg) {
    const bottom = binTop + MOUTH_H * 0.9;

    ctx.lineCap = 'round';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = POST_R * 2 + 6;
    ctx.beginPath();
    ctx.moveTo(pg.x, pg.y);
    ctx.lineTo(pg.x, bottom);
    ctx.stroke();

    ctx.strokeStyle = '#6d4bb0';
    ctx.lineWidth = POST_R * 2 - 2;
    ctx.beginPath();
    ctx.moveTo(pg.x, pg.y);
    ctx.lineTo(pg.x, bottom);
    ctx.stroke();

    const glow = pg.flash || 0;
    ctx.beginPath();
    ctx.arc(pg.x, pg.y, POST_R - 1, 0, Math.PI * 2);
    ctx.fillStyle = glow > 0.05 ? '#fff8d0' : '#FFD700';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#000';
    ctx.stroke();
}

function drawBall(ctx, b) {
    const color = b.owner ? b.owner.color : '#b9b9c4';

    ctx.globalAlpha = b.idle ? 0.45 : 1;

    ctx.beginPath();
    ctx.ellipse(b.x + 2, b.y + 3, BALL_R, BALL_R * 0.95, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fill();

    const g = ctx.createRadialGradient(
        b.x - BALL_R * 0.35, b.y - BALL_R * 0.4, BALL_R * 0.12,
        b.x, b.y, BALL_R
    );
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.42, color);
    g.addColorStop(1, shade(color, 0.5));

    ctx.beginPath();
    ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = '#000';
    ctx.stroke();

    if (b.owner) {
        ctx.font = '15px "Fredoka One", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = '#000';
        ctx.strokeText(b.owner.name.charAt(0), b.x, b.y + 1);
        ctx.fillStyle = '#fff';
        ctx.fillText(b.owner.name.charAt(0), b.x, b.y + 1);
    }

    ctx.globalAlpha = 1;
}

function shade(hex, f = 0.6) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
    if (!m) return '#666677';
    const [r, g, b] = [1, 2, 3].map(i => Math.round(parseInt(m[i], 16) * f));
    return `rgb(${r},${g},${b})`;
}

// ================= INTERFAZ =================

function updatePlinkoUI() {
    const indicator = document.getElementById('plinko-turn-indicator');
    const hint = document.getElementById('plinko-hint');
    if (!indicator) return;

    if (phase === 'select') {
        const cp = order[pickIndex];
        indicator.innerHTML = cp ? `Elige bola: ${nameTag(cp)}` : '¡Bolas elegidas!';
        if (hint) {
            hint.textContent = cp
                ? `Toca una de las 8 bolas · elige ${pickIndex + 1}º de ${order.length}`
                : '¡Preparados!';
        }
    } else if (phase === 'countdown') {
        indicator.innerHTML = '¡PREPARADOS!';
        if (hint) hint.textContent = 'Las bolas caen en 3...';
    } else if (phase === 'drop') {
        indicator.innerHTML = '¡ALLÁ VAN!';
        if (hint) hint.textContent = 'A ver dónde caen...';
    } else {
        indicator.innerHTML = '¡A CUMPLIR LOS RETOS!';
        if (hint) hint.textContent = 'Cuando queráis, volved a lanzar.';
    }

    indicator.classList.remove('next-turn-anim');
    void indicator.offsetWidth;
    indicator.classList.add('next-turn-anim');
}

function nameTag(player) {
    return `<span style="color:${player.color}; font-size: 1.5em; -webkit-text-stroke: 1.5px black; text-shadow: 2px 2px 0 #000">${player.name}</span>`;
}

/** Índice: orden de elección de la ronda y en qué cesta ha caído cada bola. */
function renderPlinkoIndex() {
    const list = document.getElementById('plinko-index-list');
    if (!list) return;

    const current = phase === 'select' ? order[pickIndex] : null;

    renderIndexRows(list, order.map((p, i) => {
        const ball = balls.find(b => b.owner && b.owner.name === p.name);
        const bin = ball && ball.landed ? bins[ball.bin] : null;
        return {
            name: p.name,
            color: p.color,
            rank: i + 1,
            badge: bin
                ? `<i class="fa-solid ${bin.icon}"></i>`
                : (ball ? `#${ball.slot + 1}` : '—'),
            active: !!current && current.name === p.name,
            highlight: !!(bin && bin.golden)
        };
    }));
}
