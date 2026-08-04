import { initSelectorEvent } from './screens/selectorJuego.js';
import { initMezclaUI } from './screens/mezclaUI.js';

const colors = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#FFA500', '#8A2BE2'];

export const GameState = {
    players: [],
    currentPlayerIndex: 0,
    boardTiles: [],
    playerPositions: {}
};

// Cargar jugadores de sesión si existen
try {
    const stored = sessionStorage.getItem('reta2_players');
    if (stored) GameState.players = JSON.parse(stored);
} catch (e) { console.warn("Modo local sin sessionStorage"); }

function renderPlayers() {
    const list = document.getElementById('player-list');
    list.innerHTML = '';
    GameState.players.forEach((p, index) => {
        const tag = document.createElement('div');
        tag.className = 'player-tag cartoon-box';
        tag.style.border = `3px solid ${p.color}`;
        tag.innerHTML = `<span>${p.name}</span> <i class="fa-solid fa-xmark" data-index="${index}"></i>`;
        list.appendChild(tag);
    });
    
    // Event listeners para los botones de borrar
    list.querySelectorAll('.fa-xmark').forEach(btn => {
        btn.addEventListener('click', (e) => removePlayer(e.target.dataset.index));
    });

    try { sessionStorage.setItem('reta2_players', JSON.stringify(GameState.players)); } catch(e) {}
}

function addPlayer() {
    const input = document.getElementById('player-name');
    const name = input.value.trim().toUpperCase();
    if (name && GameState.players.length < 8 && !GameState.players.find(p => p.name === name)) {
        GameState.players.push({ name: name, color: colors[GameState.players.length] });
        input.value = '';
        renderPlayers();
    } else if (GameState.players.length >= 8) {
        alert("Máximo 8 jugadores permitidos.");
    }
}

function removePlayer(index) {
    GameState.players.splice(index, 1);
    renderPlayers();
}

export function getRandomOtherPlayer(excludeName) {
    if (GameState.players.length <= 1) return "el jugador de tu derecha";
    let others = GameState.players.filter(p => p.name !== excludeName);
    return others[Math.floor(Math.random() * others.length)].name;
}

// Expuesto al window para los botones "Volver" del HTML
window.goToScreen = function(screenId) {
    if(screenId === 'menu-screen' && GameState.players.length < 1) {
        alert("¡Añade al menos un jugador!"); return;
    }
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
};

// Inicialización de Eventos Generales
document.addEventListener('DOMContentLoaded', () => {
    const inputName = document.getElementById('player-name');
    const btnAdd = document.getElementById('btn-add-player');
    
    btnAdd.addEventListener('click', addPlayer);
    inputName.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            addPlayer();
        }
    });

    initSelectorEvent();
    initMezclaUI();
    if(GameState.players.length > 0) renderPlayers();
});