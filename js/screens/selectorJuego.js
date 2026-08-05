import { startOca } from './oca.js';
import { startRuleta } from './ruleta.js';
import { startMaquinita } from './maquinita.js';
import { startPlinko } from './plinko.js';
import { startCajaSorpresa } from './cajaSorpresa.js';
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

    document.getElementById('btn-play-caja').addEventListener('click', () => {
        startCajaSorpresa();
    });

    document.getElementById('btn-play-plinko').addEventListener('click', () => {
        // Plinko: una bola por jugador, hace falta más de uno para que haya elección
        if (GameState.players.length < 2) {
            alert('Se necesitan al menos 2 jugadores para este modo de juego');
            return;
        }
        startPlinko();
    });
}
