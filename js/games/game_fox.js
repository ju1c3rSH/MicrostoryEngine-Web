const FX_BOARD_W = 7;
const FX_BOARD_H = 7;
const FX_BOARD_SIZE = FX_BOARD_W * FX_BOARD_H;
const FX_CELL_SIZE = 16;
const FX_CELL_GAP = 3;
const FX_FOX_COUNT = 4;
const FX_MAX_PLY = 10;
const FX_TT_SIZE = 2048;
const FX_INF = 30000;
const FX_WIN_SCORE = 50000;
const FX_TT_EXACT = 0;
const FX_TT_LOWER = 1;
const FX_TT_UPPER = 2;
const FX_TIME_LIMIT_US = 300000;
const FX_GRID_PX = FX_BOARD_W * FX_CELL_SIZE;
const FX_OX = Math.floor((SCREEN_W - FX_GRID_PX) / 2);
const FX_OY = 2;

const FX_AI_IDLE = 0;
const FX_AI_THINK = 1;
const FX_AI_ANIM = 2;
const FX_AI_CHECK = 3;

const GameFox = {
    name: '围兔子',

    board: null, turn: 0, rabbitPos: 0, cursorPos: 0,
    gameOver: false, score: 0, status: '',
    aiState: FX_AI_IDLE, aiFoxIdx: 0, aiFoxMove: -1, aiTimer: 0,
    tt: [], zobPiece: [], zobSide: [],
    history: [], killers: [],
    aiStartUs: 0, timeLimitUs: 0, nodes: 0,
    rng: null,

    start() {
        this.board = new Array(FX_BOARD_SIZE).fill(0);
        this.history = [];
        for (let i = 0; i < FX_BOARD_SIZE; i++) {
            this.history.push(new Array(FX_BOARD_SIZE).fill(0));
        }
        this.killers = [];
        for (let p = 0; p <= FX_MAX_PLY; p++) this.killers.push([0, 0]);
        this.gameOver = false;
        this.score = 0;
        this.turn = 0;
        this.aiState = FX_AI_IDLE;
        this.status = '兔子回合';

        this.board[24] = 1;
        this.board[16] = 2;
        this.board[20] = 3;
        this.board[30] = 4;
        this.board[34] = 5;
        this.rabbitPos = 24;
        this.cursorPos = 24;

        this._ttInit();
    },

    stop() {
        this.tt = [];
    },

    _isCorner(pos) {
        return pos === 0 || pos === FX_BOARD_W - 1 ||
            pos === FX_BOARD_SIZE - FX_BOARD_W || pos === FX_BOARD_SIZE - 1;
    },

    _generateMovesPiece(board, pieceVal) {
        const moves = [];
        const dirs = [-FX_BOARD_W, FX_BOARD_W, -1, 1];

        if (pieceVal === 1) {
            let rabbit = -1;
            for (let i = 0; i < FX_BOARD_SIZE; i++) {
                if (board[i] === 1) { rabbit = i; break; }
            }
            if (rabbit < 0) return moves;
            for (let d = 0; d < 4; d++) {
                if (dirs[d] === -1 && rabbit % FX_BOARD_W === 0) continue;
                if (dirs[d] === 1 && rabbit % FX_BOARD_W === FX_BOARD_W - 1) continue;
                const to = rabbit + dirs[d];
                if (to < 0 || to >= FX_BOARD_SIZE) continue;
                if (board[to] !== 0) continue;
                moves.push((rabbit << 8) | to);
            }
        } else if (pieceVal >= 2 && pieceVal <= 5) {
            for (let i = 0; i < FX_BOARD_SIZE; i++) {
                if (board[i] !== pieceVal) continue;
                for (let d = 0; d < 4; d++) {
                    if (dirs[d] === -1 && i % FX_BOARD_W === 0) continue;
                    if (dirs[d] === 1 && i % FX_BOARD_W === FX_BOARD_W - 1) continue;
                    const to = i + dirs[d];
                    if (to < 0 || to >= FX_BOARD_SIZE) continue;
                    if (board[to] !== 0) continue;
                    moves.push((i << 8) | to);
                }
            }
        }
        return moves;
    },

    _makeMove(board, move) {
        const from = (move >> 8) & 0xFF;
        const to = move & 0xFF;
        board[to] = board[from];
        board[from] = 0;
    },

    _unmakeMove(board, move) {
        const from = (move >> 8) & 0xFF;
        const to = move & 0xFF;
        board[from] = board[to];
        board[to] = 0;
    },

    _findRabbit(board) {
        for (let i = 0; i < FX_BOARD_SIZE; i++) {
            if (board[i] === 1) return i;
        }
        return -1;
    },

    _computeHash(board, sideIdx) {
        let h = this.zobSide[sideIdx];
        for (let i = 0; i < FX_BOARD_SIZE; i++) {
            const v = board[i];
            if (v !== 0) h ^= this.zobPiece[i][v];
        }
        return h;
    },

    _ttInit() {
        this.tt = [];
        for (let i = 0; i < FX_TT_SIZE; i++) {
            this.tt.push({ hash: 0n, score: 0, bestMove: -1, depth: 0, flag: 0 });
        }
        this.rng = createCrand(Math.floor(performance.now() * 1000) & 0x7FFFFFFF);
        this.zobPiece = [];
        for (let c = 0; c < FX_BOARD_SIZE; c++) {
            const row = [];
            for (let p = 0; p <= 5; p++) row.push(0n);
            for (let p = 1; p <= 5; p++) {
                row[p] = (BigInt(this.rng.next()) << 32n) | BigInt(this.rng.next());
            }
            this.zobPiece.push(row);
        }
        this.zobSide = [];
        for (let s = 0; s < 5; s++) {
            this.zobSide.push((BigInt(this.rng.next()) << 32n) | BigInt(this.rng.next()));
        }
    },

    _ttClear() {
        for (let i = 0; i < FX_TT_SIZE; i++) {
            this.tt[i].hash = 0n;
            this.tt[i].score = 0;
            this.tt[i].bestMove = -1;
            this.tt[i].depth = 0;
            this.tt[i].flag = 0;
        }
    },

    _ttStore(hash, depth, score, flag, bestMove) {
        const idx = Number(hash % BigInt(FX_TT_SIZE));
        if (depth >= this.tt[idx].depth) {
            this.tt[idx].hash = hash;
            this.tt[idx].score = ((score & 0xFFFF) << 16) >> 16;
            this.tt[idx].depth = depth;
            this.tt[idx].flag = flag;
            this.tt[idx].bestMove = bestMove;
        }
    },

    _ttProbe(hash, depth) {
        const idx = Number(hash % BigInt(FX_TT_SIZE));
        const t = this.tt[idx];
        if (t.hash === hash && t.depth >= depth) {
            return { score: t.score, bestMove: t.bestMove, flag: t.flag };
        }
        return null;
    },

    _evaluate(board) {
        const rabbit = this._findRabbit(board);
        if (rabbit < 0) return -FX_WIN_SCORE;
        if (this._isCorner(rabbit)) return FX_WIN_SCORE;
        const rabMoves = this._generateMovesPiece(board, 1).length;
        if (rabMoves === 0) return -FX_WIN_SCORE;

        const corners = [0, FX_BOARD_W - 1, FX_BOARD_SIZE - FX_BOARD_W, FX_BOARD_SIZE - 1];
        let minCd = 100;
        for (let i = 0; i < 4; i++) {
            const d = Math.abs(Math.floor(rabbit / FX_BOARD_W) - Math.floor(corners[i] / FX_BOARD_W))
                + Math.abs(rabbit % FX_BOARD_W - corners[i] % FX_BOARD_W);
            if (d < minCd) minCd = d;
        }
        let score = (12 - minCd * 2) * 100;
        score += rabMoves * 150;

        const foxPos = [];
        for (let i = 0; i < FX_BOARD_SIZE; i++) {
            if (board[i] >= 2 && foxPos.length < 4) foxPos.push(i);
        }
        let sumFoxDist = 0;
        for (let i = 0; i < foxPos.length; i++) {
            sumFoxDist += Math.abs(Math.floor(rabbit / FX_BOARD_W) - Math.floor(foxPos[i] / FX_BOARD_W))
                + Math.abs(rabbit % FX_BOARD_W - foxPos[i] % FX_BOARD_W);
        }
        score -= (48 - sumFoxDist) * 20;

        const dirs = [-FX_BOARD_W, FX_BOARD_W, -1, 1];
        let adjFoxes = 0;
        for (let d = 0; d < 4; d++) {
            if (dirs[d] === -1 && rabbit % FX_BOARD_W === 0) continue;
            if (dirs[d] === 1 && rabbit % FX_BOARD_W === FX_BOARD_W - 1) continue;
            const to = rabbit + dirs[d];
            if (to >= 0 && to < FX_BOARD_SIZE && board[to] >= 2) adjFoxes++;
        }
        score -= adjFoxes * 400;

        return score;
    },

    _orderScore(board, move, killers, ttBest) {
        if (ttBest >= 0 && move === ttBest) return 1000000;
        const to = move & 0xFF;
        const from = (move >> 8) & 0xFF;
        if (killers) {
            if (move === killers[0]) return 900000;
            if (move === killers[1]) return 800000;
        }
        const rabbit = this._findRabbit(board);
        if (rabbit >= 0) {
            const dr = Math.abs(Math.floor(to / FX_BOARD_W) - Math.floor(rabbit / FX_BOARD_W))
                + Math.abs(to % FX_BOARD_W - rabbit % FX_BOARD_W);
            let hist = this.history[from][to] * 100;
            if (hist > 500000) hist = 500000;
            return 700000 - (dr * 10) + hist;
        }
        const h = this.history[from][to] * 100;
        return (h > 500000) ? 500000 : h;
    },

    _sortMoves(board, moves, killers, ttBest) {
        const scores = [];
        for (let i = 0; i < moves.length; i++) {
            scores.push(this._orderScore(board, moves[i], killers, ttBest));
        }
        for (let i = 0; i < moves.length - 1; i++) {
            for (let j = i + 1; j < moves.length; j++) {
                if (scores[j] > scores[i]) {
                    let ts = scores[i]; scores[i] = scores[j]; scores[j] = ts;
                    let tm = moves[i]; moves[i] = moves[j]; moves[j] = tm;
                }
            }
        }
    },

    _timedOut() {
        if (this.timeLimitUs <= 0) return false;
        return (performance.now() * 1000 - this.aiStartUs) >= this.timeLimitUs;
    },

    _alphaBeta(board, depth, ply, alpha, beta, isRabbitTurn, foxIdx) {
        if (ply > FX_MAX_PLY) ply = FX_MAX_PLY;
        this.nodes++;

        const rabbit = this._findRabbit(board);
        if (rabbit < 0) return -FX_WIN_SCORE;
        if (this._isCorner(rabbit)) return FX_WIN_SCORE;

        if (depth <= 0) return this._evaluate(board);

        let moves;
        if (isRabbitTurn) {
            moves = this._generateMovesPiece(board, 1);
            if (moves.length === 0) return -FX_WIN_SCORE;
        } else {
            const pieceVal = 2 + foxIdx;
            moves = this._generateMovesPiece(board, pieceVal);
            if (moves.length === 0) {
                if (foxIdx < 3) {
                    return this._alphaBeta(board, depth, ply + 1, alpha, beta, false, foxIdx + 1);
                } else {
                    return this._alphaBeta(board, depth, ply + 1, alpha, beta, true, 0);
                }
            }
        }

        const hash = this._computeHash(board, isRabbitTurn ? 0 : (1 + foxIdx));
        let ttBest = -1;
        const tt = this._ttProbe(hash, depth);
        if (tt) {
            if (tt.flag === FX_TT_EXACT) return tt.score;
            if (tt.flag === FX_TT_LOWER && tt.score >= beta) return tt.score;
            if (tt.flag === FX_TT_UPPER && tt.score <= alpha) return tt.score;
            ttBest = tt.bestMove;
        }

        const killers = this.killers[ply];
        this._sortMoves(board, moves, killers, ttBest);

        let bestScore = isRabbitTurn ? -FX_INF : FX_INF;
        let bestMove = -1;
        const origAlpha = alpha;
        const origBeta = beta;

        for (let i = 0; i < moves.length; i++) {
            if (this._timedOut()) return bestScore;
            this._makeMove(board, moves[i]);
            let score;
            if (isRabbitTurn) {
                score = this._alphaBeta(board, depth - 1, ply + 1, alpha, beta, false, 0);
            } else {
                if (foxIdx < 3) {
                    score = this._alphaBeta(board, depth - 1, ply + 1, alpha, beta, false, foxIdx + 1);
                } else {
                    score = this._alphaBeta(board, depth - 1, ply + 1, alpha, beta, true, 0);
                }
            }
            this._unmakeMove(board, moves[i]);

            if (isRabbitTurn) {
                if (score > bestScore) { bestScore = score; bestMove = moves[i]; }
                if (score > alpha) alpha = score;
            } else {
                if (score < bestScore) { bestScore = score; bestMove = moves[i]; }
                if (score < beta) beta = score;
            }
            if (beta <= alpha) {
                this.killers[ply][1] = this.killers[ply][0];
                this.killers[ply][0] = moves[i];
                const from = (moves[i] >> 8) & 0xFF;
                const to = moves[i] & 0xFF;
                this.history[from][to] += depth * depth;
                break;
            }
        }

        let flag = FX_TT_EXACT;
        if (bestScore <= origAlpha) flag = FX_TT_UPPER;
        else if (bestScore >= origBeta) flag = FX_TT_LOWER;
        this._ttStore(hash, depth, bestScore, flag, bestMove);

        return bestScore;
    },

    _aiFindBestMove(board, pieceVal) {
        this.aiStartUs = performance.now() * 1000;
        this.timeLimitUs = FX_TIME_LIMIT_US;
        this.nodes = 0;

        const foxIdx = pieceVal - 2;
        let bestMove = -1;

        const moves = this._generateMovesPiece(board, pieceVal);
        if (moves.length === 0) return -1;

        for (let d = 1; d <= FX_MAX_PLY; d++) {
            if (this._timedOut()) break;

            let beta = FX_INF;
            let bestAtDepth = -1;

            for (let i = 0; i < moves.length; i++) {
                if (this._timedOut()) break;
                this._makeMove(board, moves[i]);
                let score;
                if (foxIdx < 3) {
                    score = this._alphaBeta(board, d - 1, 1, -FX_INF, beta, false, foxIdx + 1);
                } else {
                    score = this._alphaBeta(board, d - 1, 1, -FX_INF, beta, true, 0);
                }
                this._unmakeMove(board, moves[i]);

                if (score < beta) {
                    beta = score;
                    bestAtDepth = moves[i];
                }
            }
            if (!this._timedOut()) bestMove = bestAtDepth;
        }
        return bestMove;
    },

    tick() {
        if (this.aiState === FX_AI_IDLE || this.gameOver) return;

        if (this.aiState === FX_AI_THINK) {
            const foxVal = 2 + this.aiFoxIdx;
            this.turn = 1;
            this.status = '狐狸回合';

            this.aiFoxMove = this._aiFindBestMove(this.board, foxVal);
            this.aiState = FX_AI_ANIM;
            this.aiTimer = T.get();
            return;
        }

        if (this.aiState === FX_AI_ANIM) {
            if (this.aiFoxMove >= 0) {
                this._makeMove(this.board, this.aiFoxMove);
                this.aiFoxMove = -1;
            }
            if (T.get() - this.aiTimer < 120) return;
            this.aiState = FX_AI_CHECK;
            this.aiTimer = T.get();
            return;
        }

        if (this.aiState === FX_AI_CHECK) {
            if (this._generateMovesPiece(this.board, 1).length === 0) {
                this.gameOver = true;
                this.score = 0;
                this.status = '狐狸赢了!';
                this.aiState = FX_AI_IDLE;
                return;
            }

            this.aiFoxIdx++;
            if (this.aiFoxIdx >= FX_FOX_COUNT) {
                this.turn = 0;
                this.status = '兔子回合';
                this.aiState = FX_AI_IDLE;
            } else {
                this.aiState = FX_AI_THINK;
            }
        }
    },

    handleKey(key) {
        if (this.gameOver) {
            MiniGame.finish(this.score);
            return true;
        }
        if (key === LV_KEY_UP) {
            let np = this.cursorPos - FX_BOARD_W;
            if (np < 0) np += FX_BOARD_SIZE;
            this.cursorPos = np;
            return true;
        }
        if (key === LV_KEY_DOWN) {
            let np = this.cursorPos + FX_BOARD_W;
            if (np >= FX_BOARD_SIZE) np -= FX_BOARD_SIZE;
            this.cursorPos = np;
            return true;
        }
        if (key === LV_KEY_LEFT) {
            let np = this.cursorPos - 1;
            if (np < 0 || Math.floor(np / FX_BOARD_W) !== Math.floor(this.cursorPos / FX_BOARD_W)) {
                np = Math.floor(this.cursorPos / FX_BOARD_W) * FX_BOARD_W + (FX_BOARD_W - 1);
            }
            this.cursorPos = np;
            return true;
        }
        if (key === LV_KEY_RIGHT) {
            let np = this.cursorPos + 1;
            if (np >= FX_BOARD_SIZE || Math.floor(np / FX_BOARD_W) !== Math.floor(this.cursorPos / FX_BOARD_W)) {
                np = Math.floor(this.cursorPos / FX_BOARD_W) * FX_BOARD_W;
            }
            this.cursorPos = np;
            return true;
        }

        if (key === LV_KEY_ENTER) {
            if (this.aiState !== FX_AI_IDLE) return true;
            if (this.turn === 0 && !this.gameOver) {
                const dr = Math.floor(this.cursorPos / FX_BOARD_W) - Math.floor(this.rabbitPos / FX_BOARD_W);
                const dc = this.cursorPos % FX_BOARD_W - this.rabbitPos % FX_BOARD_W;
                let valid = (dr === -1 || dr === 1) && dc === 0;
                if (!valid) valid = (dc === -1 || dc === 1) && dr === 0;
                if (!valid) return true;
                if (this.board[this.cursorPos] !== 0) return true;

                this.board[this.rabbitPos] = 0;
                this.board[this.cursorPos] = 1;
                this.rabbitPos = this.cursorPos;

                if (this._isCorner(this.rabbitPos)) {
                    this.gameOver = true;
                    this.score = 100;
                    this.status = '兔子赢了!';
                    return true;
                }
                if (this._generateMovesPiece(this.board, 1).length === 0) {
                    this.gameOver = true;
                    this.score = 0;
                    this.status = '狐狸赢了!';
                    return true;
                }

                this._ttClear();
                for (let i = 0; i < FX_BOARD_SIZE; i++) this.history[i].fill(0);
                for (let p = 0; p <= FX_MAX_PLY; p++) { this.killers[p][0] = 0; this.killers[p][1] = 0; }

                this.aiState = FX_AI_THINK;
                this.aiFoxIdx = 0;
            }
            return true;
        }
        return false;
    },

    stop() { },

    getScore() {
        return this.score;
    },

    draw() {
        Draw.clear(CLR_BG);
        Draw.fillRect(FX_OX - 7, FX_OY - 7, FX_GRID_PX + 14, FX_GRID_PX + 14, CLR_SPEAKER);
        Draw.fillRect(FX_OX - 5, FX_OY - 5, FX_GRID_PX + 10, FX_GRID_PX + 10, CLR_BG);
        for (let i = 1; i < FX_BOARD_W; i++) {
            Draw.vline(FX_OX - 2 + i * FX_CELL_SIZE, FX_OY - 2, FX_GRID_PX, CLR_SPEAKER);
            Draw.hline(FX_OX - 2, FX_OY - 2 + i * FX_CELL_SIZE, FX_GRID_PX, CLR_SPEAKER);
        }
        for (let r = 0; r < FX_BOARD_H; r++) {
            for (let c = 0; c < FX_BOARD_W; c++) {
                const v = this.board[r * FX_BOARD_W + c];
                if (v === 0) continue;
                const cx = FX_OX + 6 + c * FX_CELL_SIZE;
                const cy = FX_OY + 6 + r * FX_CELL_SIZE;
                if (v === 1) {
                    Draw.fillCircle(cx, cy, 5, CLR_PANEL);
                    Draw.strokeCircle(cx, cy, 5, CLR_SPEAKER, 2);
                } else {
                    Draw.fillCircle(cx, cy, 5, CLR_SPEAKER);
                }
            }
        }
        if (Math.floor(T.get() / 400) % 2 === 0) {
            const r = Math.floor(this.cursorPos / FX_BOARD_W);
            const c = this.cursorPos % FX_BOARD_W;
            Draw.strokeRect(FX_OX - 2 + c * FX_CELL_SIZE, FX_OY - 2 + r * FX_CELL_SIZE,
                FX_CELL_SIZE, FX_CELL_SIZE, CLR_SPEAKER, 2);
        }
        Draw.textCenter(this.status, 0, SCREEN_H - 14, SCREEN_W, CLR_TEXT);
    },
};
