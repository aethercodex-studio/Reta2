import { GameState } from '../main.js';
import { allChallenges } from '../data/retos.js';
import { burstParticles, confettiRain, goldenExplosion, clearLayer, celebrateGoldenCard, GOLD_PALETTE } from '../utils/effects.js';

const ITEM_H = 160;            // debe coincidir con .slot-item / .reel-viewport en el CSS
const STRIP_LEN = 26;          // items por rodillo; el último es el resultado
const GOLDEN_CHANCE = 0.12;    // probabilidad de que salgan ? ? ?
const REEL_IDS = ['reel-1', 'reel-2', 'reel-3'];
const STOP_TIMES = [2800, 3700, 4700];

export function startMaquinita() {
    window.goToScreen('maquinita-screen');
    buildBulbs();
    resetSlotVisuals();
    bindMaquinitaEvents();
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

function allChallengesFlat() {
    return [...allChallenges['sencillos'], ...allChallenges['hot'], ...allChallenges['extremo']];
}

function goldItem() {
    return { golden: true };
}

function spinSlots() {
    const btnSpin = document.getElementById('btn-spin-slot');
    btnSpin.disabled = true;
    resetSlotVisuals();

    const lever = document.getElementById('slot-lever');
    lever.classList.add('pulled');
    setTimeout(() => lever.classList.remove('pulled'), 450);

    const isGolden = Math.random() < GOLDEN_CHANCE;

    // Resultado del tiro
    let p1 = GameState.players[Math.floor(Math.random() * GameState.players.length)];
    let otherPlayers = GameState.players.filter(p => p.name !== p1.name);
    let p2 = otherPlayers[Math.floor(Math.random() * otherPlayers.length)];
    let ch = allChallengesFlat()[Math.floor(Math.random() * allChallengesFlat().length)];

    if (isGolden) {
        buildReel('reel-1', generatePlayerStrip(goldItem()));
        buildReel('reel-2', generatePlayerStrip(goldItem()));
        buildReel('reel-3', generateChallengeStrip(goldItem()));
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
        celebrateWin(isGolden);
    }, endTime);

    setTimeout(() => {
        btnSpin.disabled = false;
        showSlotModal(p1, p2, ch, isGolden);
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
    const list = allChallengesFlat();
    const items = [];
    for (let i = 0; i < STRIP_LEN - 1; i++) {
        if (Math.random() < 0.18) { items.push(goldItem()); continue; }
        const c = list[Math.floor(Math.random() * list.length)];
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

function celebrateWin(isGolden) {
    const layer = document.getElementById('slot-particles');
    const machine = document.getElementById('slot-machine');
    const banner = document.getElementById('slot-win-banner');
    const { x, y } = centerOf(machine, layer);

    banner.style.opacity = '1';
    banner.querySelector('span').innerText = isGolden ? '¡¡¡RETO DE ORO!!!' : '¡PREMIO!';
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

function showSlotModal(p1, p2, ch, isGolden) {
    const content = document.getElementById('card-content');
    const btnClose = document.getElementById('btn-close-modal');
    const oldOnClick = btnClose.onclick;

    if (isGolden) {
        const chosen = GameState.players[Math.floor(Math.random() * GameState.players.length)];
        content.className = 'challenge-card cartoon-box golden';
        content.style.backgroundColor = '';
        document.getElementById('card-title').innerText = 'RETO DE ORO';
        document.getElementById('card-icon').className = 'main-icon fa-solid fa-crown';
        document.getElementById('card-desc').innerText =
            `¡${chosen.name} ha sacado los tres interrogantes! Invéntate un reto y el resto de jugadores tendrán que cumplirlo.`;
    } else {
        let cat = 'sencillos';
        if (allChallenges['hot'].includes(ch)) cat = 'hot';
        if (allChallenges['extremo'].includes(ch)) cat = 'extremo';

        content.className = `challenge-card cartoon-box ${cat}`;
        content.style.backgroundColor = '';
        document.getElementById('card-title').innerText = `${p1.name} y ${p2.name}`;
        document.getElementById('card-icon').className = `main-icon fa-solid ${ch.icon}`;
        document.getElementById('card-desc').innerText = ch.description.replace('{playerName}', 'el otro jugador');
    }

    btnClose.onclick = () => {
        document.getElementById('card-modal').style.display = 'none';
        clearLayer(document.getElementById('modal-particles'));
        resetSlotVisuals();
        btnClose.onclick = oldOnClick;
    };

    document.getElementById('card-modal').style.display = 'flex';
    if (isGolden) celebrateGoldenCard();
}
