import { startOca } from './oca.js';
import { startRuleta } from './ruleta.js';
import { startMaquinita } from './maquinita.js';
import { GameState } from '../main.js';

export function initSelectorEvent() {
    document.getElementById('btn-play-oca').addEventListener('click', () => {
        startOca();
    });
    
    document.getElementById('btn-play-ruleta').addEventListener('click', () => {
        startRuleta();
    });
    
    document.getElementById('btn-play-maquinita').addEventListener('click', () => {
        // La maquinita requires at least 3 players
        if (GameState.players.length < 3) {
            alert('Se necesitan al menos 3 jugadores para este modo de juego');
            return;
        }
        startMaquinita();
    });
}