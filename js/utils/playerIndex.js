// Índice de jugadores compartido por los tres minijuegos.

/**
 * Pinta las filas del índice.
 * Cada fila: { name, color, rank?, badge?, badgeClass?, active?, highlight? }
 */
export function renderIndexRows(container, rows) {
    if (!container) return;
    container.innerHTML = '';

    rows.forEach(r => {
        const row = document.createElement('div');
        row.className = 'index-row';
        if (r.active) row.classList.add('index-row-active');
        if (r.highlight) row.classList.add('index-row-gold');
        if (r.done) row.classList.add('index-row-done');

        let html = '';
        if (r.rank !== undefined) html += `<span class="index-rank">${r.rank}º</span>`;
        html += `<div class="index-color" style="background-color: ${r.color}"></div>`;
        html += `<span class="index-name">${r.name}</span>`;
        if (r.badge !== undefined) {
            html += `<span class="index-badge${r.badgeClass ? ' ' + r.badgeClass : ''}">${r.badge}</span>`;
        }
        row.innerHTML = html;
        container.appendChild(row);
    });
}

/**
 * Clasificación por posición (mayor primero). Los empates comparten puesto:
 * dos jugadores en la misma casilla son ambos 1º y el siguiente es 3º.
 */
export function rankByPosition(players, positionOf) {
    const sorted = [...players].sort((a, b) => positionOf(b) - positionOf(a));

    let rank = 0;
    let lastPos = null;
    return sorted.map((p, i) => {
        const pos = positionOf(p);
        if (pos !== lastPos) { rank = i + 1; lastPos = pos; }
        return { player: p, rank, pos };
    });
}
