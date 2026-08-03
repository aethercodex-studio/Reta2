import { startOca } from './oca.js';

export function initSelectorEvent() {
    document.getElementById('btn-play-oca').addEventListener('click', () => {
        startOca();
    });
    // Aquí podrías añadir los de Cofres o Ruleta en el futuro
}