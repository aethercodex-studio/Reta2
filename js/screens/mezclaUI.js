// Panel de la pantalla de selección: sliders de porcentaje y botones de preset.
import { CATEGORIES, PRESETS, ChallengeMix, setCategory, applyPreset } from '../data/mezcla.js';

export function initMezclaUI() {
    CATEGORIES.forEach(cat => {
        const slider = document.getElementById(`mix-${cat}`);
        if (!slider) return;
        // 'input' para que se actualice mientras se arrastra
        slider.addEventListener('input', () => {
            setCategory(cat, slider.value);
            renderMix(cat);
        });
    });

    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            applyPreset(btn.dataset.preset);
            renderMix();
        });
    });

    renderMix();
}

/**
 * Refleja la mezcla actual en la interfaz.
 * `skipSlider` evita reescribir el slider que el usuario está arrastrando.
 */
function renderMix(skipSlider = null) {
    CATEGORIES.forEach(cat => {
        const value = ChallengeMix[cat];
        const slider = document.getElementById(`mix-${cat}`);
        const label = document.getElementById(`mix-val-${cat}`);
        const row = document.querySelector(`.mix-row[data-cat="${cat}"]`);
        const seg = document.querySelector(`.mix-bar-seg.seg-${cat}`);

        if (slider && cat !== skipSlider) slider.value = String(value);
        if (slider) slider.style.setProperty('--fill', `${value}%`);
        if (label) label.innerText = `${value}%`;
        if (row) row.classList.toggle('mix-row-off', value === 0);
        if (seg) seg.style.width = `${value}%`;
    });

    highlightMatchingPreset();
}

/** Marca el preset activo si la mezcla actual coincide exactamente con él. */
function highlightMatchingPreset() {
    document.querySelectorAll('.preset-btn').forEach(btn => {
        const preset = PRESETS[btn.dataset.preset];
        const matches = preset && CATEGORIES.every(cat => preset.mix[cat] === ChallengeMix[cat]);
        btn.classList.toggle('active', !!matches);
    });
}
