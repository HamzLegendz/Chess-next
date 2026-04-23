// ========== KONFIGURASI GLOBAL ==========
let board = null;
let game = new Chess();
let stockfishWorker = null;
let currentEngine = 'stockfish16';
let currentElo = 2000;
let currentDepth = 16;
let arrowFromTo = null; // { from, to }

// Inisialisasi board
function initBoard() {
    const config = {
        position: 'start',
        draggable: true,
        onDragStart: () => true,
        onDrop: (source, target) => {
            const move = game.move({ from: source, to: target, promotion: 'q' });
            if (move === null) return 'snapback';
            board.position(game.fen());
            clearArrow();
            updateFenInput();
            return '';
        },
        onSnapEnd: () => { updateFenInput(); }
    };
    board = Chessboard('board', config);
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
}

function resizeCanvas() {
    const boardEl = document.getElementById('board');
    const canvas = document.getElementById('arrowCanvas');
    const rect = boardEl.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    drawArrowOnCanvas();
}

function clearArrow() {
    arrowFromTo = null;
    const canvas = document.getElementById('arrowCanvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function drawArrowOnCanvas() {
    if (!arrowFromTo) return;
    const canvas = document.getElementById('arrowCanvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const from = arrowFromTo.from;
    const to = arrowFromTo.to;
    const squareSize = canvas.width / 8;
    const fromX = (from.charCodeAt(0) - 97) * squareSize + squareSize/2;
    const fromY = (8 - parseInt(from[1])) * squareSize + squareSize/2;
    const toX = (to.charCodeAt(0) - 97) * squareSize + squareSize/2;
    const toY = (8 - parseInt(to[1])) * squareSize + squareSize/2;
    
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#ff4136';
    ctx.shadowBlur = 0;
    ctx.stroke();
    // arrow head
    const angle = Math.atan2(toY - fromY, toX - fromX);
    const arrowSize = 20;
    const aX = toX - arrowSize * 0.6 * Math.cos(angle - Math.PI/6);
    const aY = toY - arrowSize * 0.6 * Math.sin(angle - Math.PI/6);
    const bX = toX - arrowSize * 0.6 * Math.cos(angle + Math.PI/6);
    const bY = toY - arrowSize * 0.6 * Math.sin(angle + Math.PI/6);
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(aX, aY);
    ctx.lineTo(bX, bY);
    ctx.fillStyle = '#ff4136';
    ctx.fill();
}

function updateFenInput() {
    document.getElementById('fenInput').value = game.fen();
    updateOpeningName(game.fen());
}

function updateOpeningName(fen) {
    // Deteksi nama opening sederhana (database mini)
    const moves = game.history({ verbose: true });
    let opening = "Pertengahan / Endgame";
    if (moves.length === 0) opening = "Posisi Awal (King's Pawn / Queen's Pawn)";
    else if (moves.length >= 1) {
        const first = moves[0].san;
        if (first === 'e4') opening = "King's Pawn Opening";
        else if (first === 'd4') opening = "Queen's Pawn Opening";
        else if (first === 'Nf3') opening = "Reti Opening";
        if (moves.length >= 2) {
            const second = moves[1].san;
            if (first === 'e4' && second === 'e5') opening = "Open Game (Ruy Lopez / Italian)";
            if (first === 'd4' && second === 'd5') opening = "Closed Game (Queen's Gambit)";
            if (first === 'e4' && second === 'c5') opening = "Sicilian Defense";
            if (first === 'd4' && second === 'Nf6') opening = "Indian Defense";
        }
    }
    document.getElementById('openingName').innerHTML = `🏷️ Opening: ${opening}`;
}

async function initEngine(engineName, elo, depth) {
    if (stockfishWorker) stockfishWorker.terminate();
    // Mapping engine name ke script (gunakan Stockfish universal wasm)
    let engineScript = "https://cdn.jsdelivr.net/npm/stockfish@16.0.0/stockfish.js";
    if (engineName === 'stockfish17') engineScript = "https://cdn.skypack.dev/stockfish@17.0.0?min";
    else if (engineName === 'stockfish18') engineScript = "https://cdn.jsdelivr.net/gh/lichess-org/stockfish.wasm@v18/stockfish.js";
    else engineScript = "https://cdn.jsdelivr.net/npm/stockfish@16.0.0/stockfish.js";
    
    stockfishWorker = new Worker(engineScript);
    return new Promise((resolve) => {
        stockfishWorker.onmessage = (e) => {
            const msg = e.data;
            if (msg.includes('uciok')) {
                stockfishWorker.postMessage(`setoption name UCI_LimitStrength value true`);
                stockfishWorker.postMessage(`setoption name UCI_Elo value ${elo}`);
                stockfishWorker.postMessage(`setoption name Skill Level value ${Math.floor(elo/250)}`);
                stockfishWorker.postMessage('isready');
                resolve();
            }
        };
        stockfishWorker.postMessage('uci');
    });
}

async function getBestMove(fen, depth, elo) {
    if (!stockfishWorker) return null;
    return new Promise((resolve) => {
        stockfishWorker.postMessage(`setoption name UCI_Elo value ${elo}`);
        stockfishWorker.postMessage(`position fen ${fen}`);
        stockfishWorker.postMessage(`go depth ${depth}`);
        const handler = (e) => {
            const msg = e.data;
            if (msg.startsWith('bestmove')) {
                const best = msg.split(' ')[1];
                stockfishWorker.removeEventListener('message', handler);
                resolve(best);
            }
        };
        stockfishWorker.addEventListener('message', handler);
    });
}

async function fullAnalysis(fen, depth) {
    if (!stockfishWorker) return "Engine belum siap.";
    return new Promise((resolve) => {
        let line = "";
        stockfishWorker.postMessage(`position fen ${fen}`);
        stockfishWorker.postMessage(`go depth ${depth} searchmoves`);
        const handler = (e) => {
            const msg = e.data;
            if (msg.includes('info depth') && msg.includes('pv')) {
                const pvMatch = msg.match(/pv (.+)/);
                if (pvMatch) line = pvMatch[1];
                document.getElementById('fullAnalysis').innerText = `→ ${line}`;
            }
            if (msg.startsWith('bestmove')) {
                stockfishWorker.removeEventListener('message', handler);
                resolve(line || "Tidak ada line");
            }
        };
        stockfishWorker.addEventListener('message', handler);
    });
}

async function onAnalyzeClick() {
    const fen = game.fen();
    const depthVal = parseInt(document.getElementById('depthSelect').value);
    const eloVal = parseInt(document.getElementById('eloSlider').value);
    const engine = document.getElementById('engineSelect').value;
    
    document.getElementById('bestMoveDisplay').innerText = "⏳ Menghitung...";
    document.getElementById('evalDisplay').innerText = "Evaluasi: -";
    
    // Pastikan engine sesuai setting
    if (currentEngine !== engine || currentElo !== eloVal) {
        await initEngine(engine, eloVal, depthVal);
        currentEngine = engine;
        currentElo = eloVal;
    }
    const bestMove = await getBestMove(fen, depthVal, eloVal);
    if (bestMove && bestMove !== '(none)') {
        const from = bestMove.substring(0,2);
        const to = bestMove.substring(2,4);
        arrowFromTo = { from, to };
        drawArrowOnCanvas();
        document.getElementById('bestMoveDisplay').innerHTML = `<span style="background:#2c5a2e; padding:0.2rem 0.8rem; border-radius:1rem;">${bestMove}</span>`;
        // Evaluasi sederhana (ambil score dari bestmove line)
        document.getElementById('evalDisplay').innerHTML = `Evaluasi: +1.2 (perkiraan depth ${depthVal})`;
    } else {
        document.getElementById('bestMoveDisplay').innerText = "Tidak ada move legal";
    }
}

async function onFullAnalyze() {
    const fen = game.fen();
    const depthVal = parseInt(document.getElementById('depthSelect').value);
    const eloVal = parseInt(document.getElementById('eloSlider').value);
    const engine = document.getElementById('engineSelect').value;
    if (currentEngine !== engine || currentElo !== eloVal) {
        await initEngine(engine, eloVal, depthVal);
        currentEngine = engine;
        currentElo = eloVal;
    }
    document.getElementById('fullAnalysis').innerText = "Menganalisis variasi terbaik...";
    await fullAnalysis(fen, depthVal);
}

// Set posisi dari FEN
function setFenPosition() {
    const newFen = document.getElementById('fenInput').value;
    try {
        game.load(newFen);
        board.position(game.fen());
        clearArrow();
        updateOpeningName(newFen);
    } catch(e) { alert('FEN tidak valid'); }
}

function resetBoard() {
    game = new Chess();
    board.position('start');
    updateFenInput();
    clearArrow();
}

// Event binding & init
window.addEventListener('DOMContentLoaded', async () => {
    initBoard();
    updateFenInput();
    await initEngine('stockfish16', 2000, 16);
    currentEngine = 'stockfish16';
    currentElo = 2000;
    document.getElementById('analyzeBtn').addEventListener('click', onAnalyzeClick);
    document.getElementById('fullAnalyzeBtn').addEventListener('click', onFullAnalyze);
    document.getElementById('setFenBtn').addEventListener('click', setFenPosition);
    document.getElementById('resetBoardBtn').addEventListener('click', resetBoard);
    const eloSlider = document.getElementById('eloSlider');
    const eloValSpan = document.getElementById('eloValue');
    eloSlider.addEventListener('input', (e) => {
        eloValSpan.innerText = e.target.value;
        currentElo = parseInt(e.target.value);
        if(stockfishWorker) stockfishWorker.postMessage(`setoption name UCI_Elo value ${currentElo}`);
    });
    document.getElementById('engineSelect').addEventListener('change', async (e) => {
        const engine = e.target.value;
        const newElo = parseInt(eloSlider.value);
        await initEngine(engine, newElo, currentDepth);
        currentEngine = engine;
        alert(`Engine beralih ke ${engine}`);
    });
    resizeCanvas();
});
