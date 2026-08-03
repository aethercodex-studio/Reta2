import { GameState } from '../main.js';
import { allChallenges } from '../data/retos.js';

export function startMaquinita() {
    window.goToScreen('maquinita-screen');
    bindMaquinitaEvents();
}

function bindMaquinitaEvents() {
    const btnSpin = document.getElementById('btn-spin-slot');
    if (btnSpin.dataset.bound) return;
    btnSpin.addEventListener('click', spinSlots);
    btnSpin.dataset.bound = 'true';
}

function spinSlots() {
    const btnSpin = document.getElementById('btn-spin-slot');
    btnSpin.disabled = true;
    
    // Pick winners
    let p1 = GameState.players[Math.floor(Math.random() * GameState.players.length)];
    let otherPlayers = GameState.players.filter(p => p.name !== p1.name);
    let p2 = otherPlayers[Math.floor(Math.random() * otherPlayers.length)];
    
    // All available challenges
    let challengesList = [...allChallenges['sencillos'], ...allChallenges['hot'], ...allChallenges['extremo']];
    let ch = challengesList[Math.floor(Math.random() * challengesList.length)];
    
    buildReel('reel-1', generatePlayerStrip(p1));
    buildReel('reel-2', generatePlayerStrip(p2));
    buildReel('reel-3', generateChallengeStrip(ch));
    
    // Trigger animations
    setTimeout(() => {
        animateReel('reel-1', 3);
        animateReel('reel-2', 4);
        animateReel('reel-3', 5);
    }, 100);
    
    // Show modal when done
    setTimeout(() => {
        btnSpin.disabled = false;
        showSlotModal(p1, p2, ch);
    }, 5500);
}

function generatePlayerStrip(winner) {
    let items = [];
    // 20 dummy items
    for(let i=0; i<20; i++) {
        let randP = GameState.players[Math.floor(Math.random() * GameState.players.length)];
        items.push({ text: randP.name, icon: 'fa-user', color: randP.color });
    }
    // Winner at the end
    items.push({ text: winner.name, icon: 'fa-user', color: winner.color });
    return items;
}

function generateChallengeStrip(winnerCh) {
    let challengesList = [...allChallenges['sencillos'], ...allChallenges['hot'], ...allChallenges['extremo']];
    let items = [];
    for(let i=0; i<20; i++) {
        let c = challengesList[Math.floor(Math.random() * challengesList.length)];
        items.push({ text: c.text, icon: c.icon, color: 'black' });
    }
    items.push({ text: winnerCh.text, icon: winnerCh.icon, color: 'black' });
    return items;
}

function buildReel(reelId, stripItems) {
    const reel = document.getElementById(reelId);
    reel.innerHTML = '';
    // reset transform immediately without transition
    reel.style.transition = 'none';
    reel.style.transform = 'translateY(0)';
    
    stripItems.forEach(item => {
        const div = document.createElement('div');
        div.className = 'slot-item';
        div.innerHTML = `<i class="fa-solid ${item.icon}" style="color:${item.color}"></i><span>${item.text}</span>`;
        reel.appendChild(div);
    });
}

function animateReel(reelId, duration) {
    const reel = document.getElementById(reelId);
    // 21 items total, height 100px each. Target is the last item (index 20).
    // We want the last item to be at the top of the window, so transform Y by -(20 * 100) = -2000px.
    const targetY = -(20 * 100); 
    reel.style.transition = `transform ${duration}s cubic-bezier(0.15, 0.85, 0.15, 1)`;
    reel.style.transform = `translateY(${targetY}px)`;
}

function showSlotModal(p1, p2, ch) {
    const content = document.getElementById('card-content');
    
    let cat = 'sencillos';
    if(allChallenges['hot'].includes(ch)) cat = 'hot';
    if(allChallenges['extremo'].includes(ch)) cat = 'extremo';
    
    content.className = `challenge-card cartoon-box ${cat}`;
    document.getElementById('card-title').innerText = `${p1.name} y ${p2.name}`;
    document.getElementById('card-icon').className = `main-icon fa-solid ${ch.icon}`;
    
    let finalDesc = ch.description.replace('{playerName}', 'el otro jugador');
    document.getElementById('card-desc').innerText = finalDesc;
    
    const btnClose = document.getElementById('btn-close-modal');
    const oldOnClick = btnClose.onclick;
    
    btnClose.onclick = () => {
        document.getElementById('card-modal').style.display = 'none';
        btnClose.onclick = oldOnClick;
    };
    
    document.getElementById('card-modal').style.display = 'flex';
}
