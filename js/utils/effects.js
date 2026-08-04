// Utilidades de partículas y celebraciones compartidas entre minijuegos.

const PARTY_COLORS = ['#FFD700', '#FF4500', '#4ECDC4', '#FF6B6B', '#FFE66D', '#8A2BE2', '#00E676', '#FFFFFF'];
const GOLD_COLORS = ['#FFD700', '#FFF3B0', '#FFB300', '#B8860B', '#FFEC8B', '#FFFFFF'];

export const GOLD_PALETTE = GOLD_COLORS;

/**
 * Explosión de partículas desde un punto (x, y) relativo al contenedor.
 * El contenedor debe tener position: relative/absolute.
 */
export function burstParticles(container, {
    x = 0, y = 0, count = 30, spread = 220, colors = PARTY_COLORS,
    scale = 1, duration = 900, star = false
} = {}) {
    if (!container) return;
    for (let i = 0; i < count; i++) {
        const p = document.createElement('div');
        p.className = 'particle';

        const angle = Math.random() * Math.PI * 2;
        const dist = spread * (0.3 + Math.random() * 0.7);
        const size = (6 + Math.random() * 11) * scale;
        const life = duration * (0.65 + Math.random() * 0.7);

        p.style.left = `${x}px`;
        p.style.top = `${y}px`;
        p.style.width = `${size}px`;
        p.style.height = `${size}px`;
        p.style.setProperty('--tx', `${Math.cos(angle) * dist}px`);
        p.style.setProperty('--ty', `${Math.sin(angle) * dist}px`);
        p.style.setProperty('--rot', `${Math.random() * 900 - 450}deg`);
        p.style.background = colors[Math.floor(Math.random() * colors.length)];

        const shape = Math.random();
        if (star) p.style.borderRadius = '50%';
        else if (shape > 0.66) p.style.borderRadius = '50%';
        else if (shape > 0.33) p.style.borderRadius = '2px';
        else { p.style.borderRadius = '2px'; p.style.height = `${size * 0.45}px`; }

        p.style.animation = `particleFly ${life}ms cubic-bezier(0.15, 0.75, 0.3, 1) forwards`;
        container.appendChild(p);
        setTimeout(() => p.remove(), life + 60);
    }
}

/** Lluvia de confeti que cae desde arriba del contenedor. */
export function confettiRain(container, { count = 60, colors = PARTY_COLORS, duration = 2600 } = {}) {
    if (!container) return;
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    for (let i = 0; i < count; i++) {
        const c = document.createElement('div');
        c.className = 'confetti';
        const size = 7 + Math.random() * 9;
        const life = duration * (0.6 + Math.random() * 0.7);

        c.style.left = `${Math.random() * width}px`;
        c.style.width = `${size}px`;
        c.style.height = `${size * (1 + Math.random())}px`;
        c.style.background = colors[Math.floor(Math.random() * colors.length)];
        c.style.borderRadius = Math.random() > 0.7 ? '50%' : '2px';
        c.style.setProperty('--fall', `${height + 80}px`);
        c.style.setProperty('--drift', `${Math.random() * 160 - 80}px`);
        c.style.setProperty('--rot', `${Math.random() * 1080 - 540}deg`);
        c.style.animation = `confettiFall ${life}ms linear ${Math.random() * 600}ms forwards`;

        container.appendChild(c);
        setTimeout(() => c.remove(), life + 700);
    }
}

/** Explosión doble + confeti dorado: reservado para el RETO DE ORO. */
export function goldenExplosion(container, { x, y, waves = 3, scale = 1.4 } = {}) {
    if (!container) return;
    const cx = x !== undefined ? x : (container.clientWidth || window.innerWidth) / 2;
    const cy = y !== undefined ? y : (container.clientHeight || window.innerHeight) / 2;

    for (let w = 0; w < waves; w++) {
        setTimeout(() => {
            burstParticles(container, {
                x: cx, y: cy, count: 55, spread: 340 + w * 90,
                colors: GOLD_COLORS, scale: scale, duration: 1250, star: true
            });
        }, w * 220);
    }
    confettiRain(container, { count: 110, colors: GOLD_COLORS, duration: 3200 });
}

export function clearLayer(container) {
    if (container) container.innerHTML = '';
}

/** Celebra la aparición de una carta de RETO DE ORO en el modal compartido. */
export function celebrateGoldenCard() {
    const layer = document.getElementById('modal-particles');
    if (!layer) return;
    clearLayer(layer);
    goldenExplosion(layer, { waves: 3, scale: 1.5 });
}

/** Llegada a meta de un jugador que no es el ganador: confeti de fiesta. */
export function celebratePodium() {
    const layer = document.getElementById('modal-particles');
    if (!layer) return;
    clearLayer(layer);
    const cx = (layer.clientWidth || window.innerWidth) / 2;
    const cy = (layer.clientHeight || window.innerHeight) / 2;
    burstParticles(layer, { x: cx, y: cy, count: 45, spread: 320, duration: 1000, scale: 1.1 });
    confettiRain(layer, { count: 70, duration: 3000 });
}

/** Victoria final: oro a lo grande + lluvia de confeti de fiesta. */
export function celebrateVictory() {
    const layer = document.getElementById('modal-particles');
    if (!layer) return;
    clearLayer(layer);
    goldenExplosion(layer, { waves: 4, scale: 1.8 });
    confettiRain(layer, { count: 130, duration: 4200 });
    setTimeout(() => confettiRain(layer, { count: 90, duration: 3800 }), 900);
}
