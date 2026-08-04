// Mezcla de retos: porcentaje de cada categoría que aparecerá en los minijuegos.
import { allChallenges } from './retos.js';

export const CATEGORIES = ['beber', 'sencillos', 'hot', 'extremo'];

export const DEFAULT_MIX = { beber: 40, sencillos: 30, hot: 20, extremo: 10 };

export const PRESETS = {
    calentando: { label: 'Para ir calentando', mix: { beber: 50, sencillos: 40, hot: 10, extremo: 0 } },
    defecto:    { label: 'Por defecto',        mix: { ...DEFAULT_MIX } },
    atrevido:   { label: 'Atrevido',           mix: { beber: 30, sencillos: 10, hot: 50, extremo: 10 } },
    valientes:  { label: 'Los más valientes',  mix: { beber: 10, sencillos: 0,  hot: 30, extremo: 60 } }
};

/** Color de cada categoría (paleta del juego). */
export const CATEGORY_COLORS = {
    beber: '#FFE66D',
    sencillos: '#87CEFA',
    hot: '#FF4500',
    extremo: '#222222'
};

export function iconColorFor(category) {
    return category === 'extremo' ? 'white' : 'black';
}

export const ChallengeMix = { ...DEFAULT_MIX };

// --- Persistencia de sesión ---
try {
    const stored = sessionStorage.getItem('reta2_mix');
    if (stored) applyMix(JSON.parse(stored), false);
} catch (e) { /* sin sessionStorage: se usa la mezcla por defecto */ }

function save() {
    try { sessionStorage.setItem('reta2_mix', JSON.stringify(ChallengeMix)); } catch (e) {}
}

/** Sustituye la mezcla completa, saneando valores y forzando que sume 100. */
export function applyMix(mix, persist = true) {
    CATEGORIES.forEach(cat => {
        const v = Number(mix?.[cat]);
        ChallengeMix[cat] = Number.isFinite(v) ? Math.min(100, Math.max(0, Math.round(v))) : 0;
    });
    if (total() === 0) Object.assign(ChallengeMix, DEFAULT_MIX);
    else settle();
    if (persist) save();
    return { ...ChallengeMix };
}

/**
 * Fija una categoría al valor dado y reparte el resto entre las demás,
 * proporcionalmente a lo que ya tenían. Así el total sigue siendo 100.
 */
export function setCategory(cat, value) {
    if (!CATEGORIES.includes(cat)) return { ...ChallengeMix };

    const target = Math.min(100, Math.max(0, Math.round(Number(value) || 0)));
    const others = CATEGORIES.filter(c => c !== cat);
    const remainder = 100 - target;
    const othersSum = others.reduce((s, c) => s + ChallengeMix[c], 0);

    ChallengeMix[cat] = target;

    if (othersSum === 0) {
        // No había nada que repartir: a partes iguales
        const each = Math.floor(remainder / others.length);
        others.forEach(c => { ChallengeMix[c] = each; });
        ChallengeMix[others[others.length - 1]] += remainder - each * others.length;
    } else {
        // El último absorbe el redondeo para que la suma sea exacta
        let assigned = 0;
        others.forEach((c, i) => {
            if (i === others.length - 1) {
                ChallengeMix[c] = remainder - assigned;
            } else {
                ChallengeMix[c] = Math.round(remainder * (ChallengeMix[c] / othersSum));
                assigned += ChallengeMix[c];
            }
        });
    }

    settle(cat);
    save();
    return { ...ChallengeMix };
}

export function applyPreset(name) {
    const preset = PRESETS[name];
    if (!preset) return { ...ChallengeMix };
    return applyMix(preset.mix);
}

function total() {
    return CATEGORIES.reduce((s, c) => s + ChallengeMix[c], 0);
}

/**
 * Sanea los valores y absorbe los redondeos hasta que el total sea exactamente 100,
 * empezando por las categorías con más peso. `protectedCat` (la que el usuario acaba
 * de mover) se deja intacta salvo que no quede otra salida.
 */
function settle(protectedCat = null) {
    CATEGORIES.forEach(c => {
        ChallengeMix[c] = Math.max(0, Math.min(100, Math.round(ChallengeMix[c] || 0)));
    });

    let diff = 100 - total();
    if (diff === 0) return;

    const pool = CATEGORIES.filter(c => c !== protectedCat)
                           .sort((a, b) => ChallengeMix[b] - ChallengeMix[a]);
    for (const c of pool) {
        if (diff === 0) break;
        const next = Math.max(0, Math.min(100, ChallengeMix[c] + diff));
        diff -= next - ChallengeMix[c];
        ChallengeMix[c] = next;
    }

    // Último recurso: tocar la categoría protegida
    if (total() !== 100 && protectedCat) {
        ChallengeMix[protectedCat] = Math.max(0, Math.min(100, ChallengeMix[protectedCat] + (100 - total())));
    }
    if (total() !== 100) Object.assign(ChallengeMix, DEFAULT_MIX);
}

/** Categoría al azar respetando los porcentajes elegidos. */
export function pickCategory(allowed = CATEGORIES) {
    const pool = allowed.filter(c => CATEGORIES.includes(c));
    const sum = pool.reduce((s, c) => s + ChallengeMix[c], 0);

    // Si las categorías permitidas están todas a 0%, reparto uniforme entre ellas
    if (sum <= 0) return pool[Math.floor(Math.random() * pool.length)];

    let r = Math.random() * sum;
    for (const cat of pool) {
        r -= ChallengeMix[cat];
        if (r < 0) return cat;
    }
    return pool[pool.length - 1];
}

/**
 * Reto al azar respetando la mezcla. `filterFn` permite excluir retos
 * (p. ej. los de beber en la ruleta); si una categoría se queda sin
 * candidatos, se prueban las demás antes de rendirse.
 */
export function pickChallenge(filterFn = null) {
    const eligible = {};
    CATEGORIES.forEach(cat => {
        eligible[cat] = filterFn ? allChallenges[cat].filter(filterFn) : allChallenges[cat];
    });

    const withStock = CATEGORIES.filter(cat => eligible[cat].length > 0);
    if (!withStock.length) return null;

    const category = pickCategory(withStock);
    const list = eligible[category];
    return { challenge: list[Math.floor(Math.random() * list.length)], category };
}

export function categoryOf(challenge) {
    return CATEGORIES.find(cat => allChallenges[cat].includes(challenge)) || 'sencillos';
}
