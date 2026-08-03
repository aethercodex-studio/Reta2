import { GameState, getRandomOtherPlayer } from '../main.js';
import { allChallenges } from '../data/retos.js';

export function startOca() {
    window.goToScreen('oca-screen');
    generateBoard();
    GameState.playerPositions = {};
    GameState.players.forEach(p => GameState.playerPositions[p.name] = 1);
    GameState.currentPlayerIndex = 0;
    
    // Bind eventos
    document.getElementById('show-dice-btn').onclick = showDice;
    document.getElementById('btn-close-modal').onclick = closeCardModal;

    updateTurnUI();
    drawTokens();
}

function generateBoard() {
    const board = document.getElementById('oca-board');
    board.innerHTML = '';
    GameState.boardTiles = [];

    // Mapas de casillas especiales
    let specialSlots = { advance: 3, retro: 3, safe: 2, drink: 20 };
    let specialMap = {};
    let availableIndexes = Array.from({length: 67}, (_, i) => i + 2); 
    
    const assignSpecial = (type, count) => {
        for(let i=0; i<count; i++) {
            let rIdx = Math.floor(Math.random() * availableIndexes.length);
            specialMap[availableIndexes.splice(rIdx, 1)[0]] = type;
        }
    };
    Object.keys(specialSlots).forEach(key => assignSpecial(key, specialSlots[key]));

    const categories = ['sencillos', 'hot', 'extremo'];

    for (let i = 1; i <= 70; i++) {
        let tileData = { num: i, type: 'normal' };
        
        if (i === 1) tileData.type = 'start';
        else if (i === 70) tileData.type = 'end';
        else if (i === 69) tileData.type = 'penultimate';
        else if (specialMap[i]) tileData.type = specialMap[i];
        
        // Si es normal, pre-asignar un reto para extraer su color e icono
        if (tileData.type === 'normal') {
            const randomCat = categories[Math.floor(Math.random() * categories.length)];
            const challengesList = allChallenges[randomCat];
            const randomChallenge = challengesList[Math.floor(Math.random() * challengesList.length)];
            tileData.challenge = randomChallenge;
            tileData.category = randomCat;
        }

        GameState.boardTiles.push(tileData);

        // Render visual
        const tileEl = document.createElement('div');
        tileEl.className = 'tile';
        tileEl.id = `tile-${i}`;
        
        let iconHtml = '';
        // Asignar colores e iconos
        if(tileData.type === 'drink') { 
            tileEl.style.backgroundColor = '#FFD700'; iconHtml = '<i class="fa-solid fa-beer-mug-empty" style="color:black;"></i>'; 
        } else if(tileData.type === 'advance') { 
            tileEl.style.backgroundColor = '#98FB98'; iconHtml = '<i class="fa-solid fa-angles-right" style="color:green;"></i>'; 
        } else if(tileData.type === 'retro') { 
            tileEl.style.backgroundColor = '#FFA07A'; iconHtml = '<i class="fa-solid fa-angles-left" style="color:red;"></i>'; 
        } else if(tileData.type === 'safe') { 
            tileEl.style.backgroundColor = '#FFFFFF'; iconHtml = '<i class="fa-solid fa-shield-halved" style="color:blue;"></i>'; 
        } else if(tileData.type === 'penultimate') { 
            tileEl.style.backgroundColor = '#8B0000'; iconHtml = '<i class="fa-solid fa-skull" style="color:white;"></i>'; 
        } else if(tileData.type === 'end') { 
            tileEl.style.backgroundColor = '#FFD700'; iconHtml = '<i class="fa-solid fa-trophy" style="color:black;"></i>'; 
        } else if (tileData.type === 'start') {
            tileEl.style.backgroundColor = '#FFFFFF'; iconHtml = '<i class="fa-solid fa-flag-checkered"></i>';
        } else {
            // Es un reto normal
            tileEl.style.backgroundColor = `var(--${tileData.category})`;
            let iconColor = tileData.category === 'extremo' ? 'white' : 'black';
            iconHtml = `<i class="fa-solid ${tileData.challenge.icon}" style="color:${iconColor}; opacity: 0.8;"></i>`;
        }

        tileEl.innerHTML = `<span class="tile-num">${i}</span>${iconHtml}`;
        board.appendChild(tileEl);
    }
}

function drawTokens() {
    document.querySelectorAll('.player-token').forEach(t => t.remove());
    GameState.players.forEach((p, idx) => {
        const pos = GameState.playerPositions[p.name];
        const tileEl = document.getElementById(`tile-${pos}`);
        if (tileEl) {
            const token = document.createElement('div');
            token.className = 'player-token';
            token.style.backgroundColor = p.color;
            token.style.transform = `translate(${ (idx%3)*10 - 10 }px, ${ Math.floor(idx/3)*10 - 10 }px)`;
            tileEl.appendChild(token);
        }
    });
}

function updateTurnUI() {
    const cp = GameState.players[GameState.currentPlayerIndex];
    document.getElementById('turn-indicator').innerHTML = `Turno de: <span style="color:${cp.color}; text-shadow: 1px 1px 0 #000">${cp.name}</span>`;
    document.getElementById('show-dice-btn').style.display = 'block';
}

// --- FÍSICAS MATER.JS (Dado Gigante) ---
let engine, render, runner, diceBody;

function showDice() {
    document.getElementById('show-dice-btn').style.display = 'none';
    const dc = document.getElementById('dice-canvas-container');
    dc.style.display = 'block';
    
    if(!engine) {
        const { Engine, Render, Runner, Bodies, Composite, Mouse, MouseConstraint, Events } = Matter;
        engine = Engine.create();
        engine.world.gravity.y = 0.5;
        
        const w = 400; const h = 400;
        render = Render.create({
            element: dc, engine: engine,
            options: { width: w, height: h, wireframes: false, background: 'transparent' }
        });

        const wallOpt = { isStatic: true, render: { visible: false } };
        Composite.add(engine.world, [
            Bodies.rectangle(w/2, -10, w, 20, wallOpt),
            Bodies.rectangle(w/2, h+10, w, 20, wallOpt),
            Bodies.rectangle(-10, h/2, 20, h, wallOpt),
            Bodies.rectangle(w+10, h/2, 20, h, wallOpt)
        ]);

        // Dado Gigante
        diceBody = Bodies.rectangle(w/2, h/2, 80, 80, {
            restitution: 0.9, friction: 0.1,
            render: { fillStyle: '#FFD700', strokeStyle: 'black', lineWidth: 6 }
        });
        Composite.add(engine.world, diceBody);

        const mouse = Mouse.create(render.canvas);
        const mConstraint = MouseConstraint.create(engine, {
            mouse: mouse, constraint: { stiffness: 0.1, render: { visible: false } }
        });
        Composite.add(engine.world, mConstraint);
        render.mouse = mouse;

        Render.run(render);
        runner = Runner.create();
        Runner.run(runner, engine);

        let isDragging = false;
        Events.on(mConstraint, 'startdrag', () => { isDragging = true; });
        Events.on(mConstraint, 'enddrag', () => { 
            if(isDragging) { isDragging = false; checkDiceSleep(); }
        });
    }
    
    Matter.Body.setPosition(diceBody, {x: 200, y: 200});
    Matter.Body.setVelocity(diceBody, {x: 0, y: 0});
    Matter.Body.setAngularVelocity(diceBody, 0);
}

function checkDiceSleep() {
    let sleepCheckInterval = setInterval(() => {
        if (diceBody.speed < 0.1 && diceBody.angularVelocity < 0.1) {
            clearInterval(sleepCheckInterval);
            setTimeout(() => {
                document.getElementById('dice-canvas-container').style.display = 'none';
                const roll = Math.floor(Math.random() * 6) + 1;
                moveCurrentPlayer(roll);
            }, 400);
        }
    }, 200);
}

// --- RESOLUCIÓN DE CASILLAS ---
function moveCurrentPlayer(roll) {
    const cp = GameState.players[GameState.currentPlayerIndex];
    let newPos = Math.min(70, GameState.playerPositions[cp.name] + roll);
    GameState.playerPositions[cp.name] = newPos;
    drawTokens();
    setTimeout(() => { resolveTile(newPos); }, 400);
}

function resolveTile(pos) {
    const cp = GameState.players[GameState.currentPlayerIndex];
    const tile = GameState.boardTiles[pos - 1];
    
    let cardData = null;
    let showModal = true;

    switch(tile.type) {
        case 'start': showModal = false; break;
        case 'end': alert(`¡${cp.name} HA GANADO!`); window.goToScreen('menu-screen'); return;
        case 'safe': cardData = { text: 'CASILLA SEGURA', icon: 'fa-shield-halved', desc: '¡Te has librado!', cat: 'sencillos' }; break;
        case 'advance': cardData = { text: '¡AVANZAS 3!', icon: 'fa-angles-right', desc: 'Viento a tu favor.', cat: 'sencillos' }; GameState.playerPositions[cp.name] = Math.min(70, pos + 3); break;
        case 'retro': cardData = { text: '¡RETROCEDES 3!', icon: 'fa-angles-left', desc: 'Vaya tropiezo...', cat: 'extremo' }; GameState.playerPositions[cp.name] = Math.max(1, pos - 3); break;
        case 'drink': cardData = { text: '¡A BEBER!', icon: 'fa-beer-mug-empty', desc: 'Bebe, te lo mereces.', cat: 'hot' }; break;
        case 'penultimate': cardData = { text: '¡CASI!', icon: 'fa-skull', desc: 'Retrocedes 5 casillas.', cat: 'extremo' }; GameState.playerPositions[cp.name] = Math.max(1, pos - 5); break;
        default:
            // Utilizamos el reto pre-asignado a la casilla
            let finalDesc = tile.challenge.description.replace('{playerName}', getRandomOtherPlayer(cp.name));
            cardData = { text: tile.challenge.text, icon: tile.challenge.icon, desc: finalDesc, cat: tile.category };
            break;
    }

    if (showModal && cardData) showCard(cardData);
    else nextTurn();
}

function showCard(data) {
    const content = document.getElementById('card-content');
    content.className = `challenge-card cartoon-box ${data.cat}`;
    document.getElementById('card-title').innerText = data.text;
    document.getElementById('card-icon').className = `main-icon fa-solid ${data.icon}`;
    document.getElementById('card-desc').innerText = data.desc;
    document.getElementById('card-modal').style.display = 'flex';
}

function closeCardModal() {
    document.getElementById('card-modal').style.display = 'none';
    drawTokens();
    nextTurn();
}

function nextTurn() {
    GameState.currentPlayerIndex = (GameState.currentPlayerIndex + 1) % GameState.players.length;
    updateTurnUI();
}