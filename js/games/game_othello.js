const L_MASK = 0x0101010101010101n;
const R_MASK = 0x8080808080808080n;
const ROW7_MASK = 0xFF00000000000000n;
const CORNERS = 0x8100000000000081n;
const EDGES_NC = 0x7E8181818181817En;

const SHIFTS = [1, -1, 8, -8, 7, -7, 9, -9];
const SRC_MASK = [
    ~R_MASK,
    ~L_MASK,
    ~ROW7_MASK,
    ~0n,
    ~L_MASK & ~ROW7_MASK,
    ~R_MASK,
    ~R_MASK & ~ROW7_MASK,
    ~L_MASK
];

const OT_CELL_SIZE = 15;
const OT_BOARD_W = 8;
const OT_BOARD_PX = OT_BOARD_W * OT_CELL_SIZE;
const OT_OFS_X = Math.floor((SCREEN_W - OT_BOARD_PX) / 2);
const OT_OFS_Y = 16;
const OT_TT_SIZE = 0x800;
const OT_NEG_INF = -20000;
const OT_POS_INF = 20000;
const OT_AI_DEPTH = 6;
const OT_AI_DELAY_MS = 300;

function popcnt64(x) {
    let c = 0;
    while (x) {
        c++;
        x &= x - 1n;
    }
    return c;
}

function ctz64(x) {
    const lo = x & -x;
    return lo.toString(2).length - 1;
}

const GameOthello = {
    name: '黑白棋',

    black: 0n, white: 0n, turn: 0, passCount: 0, gameOver: false,
    cursorPos: 27, aiThinking: false, showResult: false, aiDelayMs: 0,
    blinkMs: 0, cursorVis: true, status: '',
    rngState: 0n, zob: [], zobTurn: 0n, tt: [],

    start() {
        this.rngState = 0x9E3779B97F4A7C15n;
        this._zobristInit();

        this.black = (1n << 27n) | (1n << 36n);
        this.white = (1n << 28n) | (1n << 35n);
        this.turn = 0;
        this.passCount = 0;
        this.gameOver = false;
        this.cursorPos = 27;
        this.showResult = false;
        this.aiThinking = false;
        this.aiDelayMs = 0;
        this.cursorVis = true;
        this.blinkMs = T.get();
        this.status = '你的回合';
    },

    stop() { },

    _rand64() {
        let x = this.rngState;
        x ^= x >> 12n;
        x ^= x << 25n;
        x ^= x >> 27n;
        this.rngState = x;
        return x * 0x2545F4914F6CDD1Dn;
    },

    _zobristInit() {
        this.zob = [];
        for (let i = 0; i < 64; i++) {
            this.zob.push([this._rand64(), this._rand64()]);
        }
        this.zobTurn = this._rand64();
        this.tt = [];
        for (let i = 0; i < OT_TT_SIZE; i++) {
            this.tt.push({ hash: 0n, score: 0, depth: 0, flag: 0, bestMove: 255 });
        }
    },

    _computeHash(black, white, turn) {
        let h = 0n;
        let b = black;
        while (b) {
            const i = ctz64(b);
            h ^= this.zob[i][0];
            b &= b - 1n;
        }
        b = white;
        while (b) {
            const i = ctz64(b);
            h ^= this.zob[i][1];
            b &= b - 1n;
        }
        if (turn) h ^= this.zobTurn;
        return h;
    },

    _shiftFwd(b, s, mask) {
        b &= mask;
        return (s > 0) ? (b << BigInt(s)) : (b >> BigInt(-s));
    },

    _getMoves(own, opp) {
        const empty = ~(own | opp);
        let moves = 0n;
        for (let d = 0; d < 8; d++) {
            const s = SHIFTS[d];
            const m = SRC_MASK[d];
            let chain = this._shiftFwd(own, s, m) & opp;
            for (let j = 0; j < 6; j++) {
                const more = this._shiftFwd(chain, s, m) & opp;
                chain |= more;
                if (!more) break;
            }
            moves |= this._shiftFwd(chain, s, m) & empty;
        }
        return moves;
    },

    _makeMove(own, opp, sq) {
        const moveBit = 1n << BigInt(sq);
        let flipped = 0n;
        for (let d = 0; d < 8; d++) {
            const s = SHIFTS[d];
            const m = SRC_MASK[d];
            let flips = 0n;
            let cur = this._shiftFwd(moveBit, s, m);
            if (!(cur & opp)) continue;
            while (cur & opp) {
                flips |= cur;
                cur = this._shiftFwd(cur, s, m);
            }
            if (cur & own) flipped |= flips;
        }
        return { newOwn: own | moveBit | flipped, newOpp: opp & ~flipped };
    },

    _evaluate(own, opp) {
        const ownMoves = this._getMoves(own, opp);
        const oppMoves = this._getMoves(opp, own);
        if (ownMoves === 0n && oppMoves === 0n) {
            return (popcnt64(own) - popcnt64(opp)) * 1000;
        }
        let s = 0;
        s += (popcnt64(own & CORNERS) - popcnt64(opp & CORNERS)) * 100;
        s += (popcnt64(own & EDGES_NC) - popcnt64(opp & EDGES_NC)) * 10;
        s += (popcnt64(ownMoves) - popcnt64(oppMoves)) * 10;
        return s;
    },

    _negamax(own, opp, depth, alpha, beta, passed, hash) {
        const moves = this._getMoves(own, opp);

        if (moves === 0n) {
            const oppMoves = this._getMoves(opp, own);
            if (oppMoves === 0n) {
                return (popcnt64(own) - popcnt64(opp)) * 1000;
            }
            if (passed) {
                return (popcnt64(own) - popcnt64(opp)) * 1000;
            }
            return -this._negamax(opp, own, depth, -beta, -alpha, 1, hash ^ this.zobTurn);
        }

        if (depth === 0) return this._evaluate(own, opp);

        const tte = this.tt[Number(hash & BigInt(OT_TT_SIZE - 1))];
        if (tte.hash === hash && tte.depth >= depth) {
            if (tte.flag === 0) return tte.score;
            if (tte.flag === 1 && tte.score > alpha) alpha = tte.score;
            if (tte.flag === 2 && tte.score < beta) beta = tte.score;
            if (alpha >= beta) return tte.score;
        }

        let best = OT_NEG_INF;
        let flag = 1;
        let bestSq = -1;

        const moveList = [];
        let m = moves;
        while (m) {
            moveList.push(ctz64(m));
            m &= m - 1n;
        }
        if (tte.hash === hash && tte.bestMove < 64) {
            for (let i = 0; i < moveList.length; i++) {
                if (moveList[i] === tte.bestMove) {
                    const tmp = moveList[0];
                    moveList[0] = moveList[i];
                    moveList[i] = tmp;
                    break;
                }
            }
        }

        for (let i = 0; i < moveList.length; i++) {
            const sq = moveList[i];
            const r = this._makeMove(own, opp, sq);
            const nh = this._computeHash(r.newOwn, r.newOpp, 1);
            const sc = -this._negamax(r.newOpp, r.newOwn, depth - 1, -beta, -alpha, 0, nh);
            if (sc > best) {
                best = sc;
                bestSq = sq;
            }
            if (sc > alpha) alpha = sc;
            if (alpha >= beta) { flag = 1; break; }
        }

        if (best <= alpha) flag = 2;
        if (best >= beta) flag = 1;
        if (best > alpha && best < beta) flag = 0;

        tte.hash = hash;
        tte.score = best;
        tte.depth = depth;
        tte.flag = flag;
        tte.bestMove = (bestSq >= 0) ? bestSq : 255;
        return best;
    },

    _aiFindMove() {
        const moves = this._getMoves(this.white, this.black);
        if (moves === 0n) return -1;

        let bestSq = -1;
        let bestScore = OT_NEG_INF;

        let m = moves;
        while (m) {
            const sq = ctz64(m);
            m &= m - 1n;
            const r = this._makeMove(this.white, this.black, sq);
            const nh = this._computeHash(r.newOwn, r.newOpp, 0);
            const sc = -this._negamax(r.newOpp, r.newOwn, OT_AI_DEPTH - 1, OT_NEG_INF, -bestScore, 0, nh);
            if (sc > bestScore) {
                bestScore = sc;
                bestSq = sq;
            }
        }
        return bestSq;
    },

    _showResult() {
        const bc = popcnt64(this.black);
        const wc = popcnt64(this.white);
        if (bc > wc) this.status = '你赢了! ' + bc + ':' + wc;
        else if (wc > bc) this.status = 'AI赢了! ' + bc + ':' + wc;
        else this.status = '平局! ' + bc + ':' + wc;
        this.showResult = true;
    },

    _updateStatus() {
        if (this.gameOver) return;
        if (this.turn === 0) this.status = '你的回合';
        else this.status = 'AI 思考中…';
    },

    _checkPass() {
        const moves = (this.turn === 0) ? this._getMoves(this.black, this.white)
                                       : this._getMoves(this.white, this.black);
        if (moves !== 0n) {
            this.passCount = 0;
            return;
        }
        this.passCount++;
        if (this.passCount >= 2) {
            this.gameOver = true;
            this._showResult();
            return;
        }
        this.turn = 1 - this.turn;
        this._checkPass();
    },

    _tryPlacePiece(sq) {
        const moves = this._getMoves(this.black, this.white);
        if (this.turn !== 0 || !((moves & (1n << BigInt(sq))) !== 0n)) return false;

        const r = this._makeMove(this.black, this.white, sq);
        this.black = r.newOwn;
        this.white = r.newOpp;

        this.turn = 1;
        this._checkPass();
        if (!this.gameOver) this._updateStatus();
        return true;
    },

    _doAiMove() {
        const sq = this._aiFindMove();
        if (sq < 0) {
            this.turn = 0;
            this._checkPass();
            if (!this.gameOver) this._updateStatus();
            return;
        }
        const r = this._makeMove(this.white, this.black, sq);
        this.white = r.newOwn;
        this.black = r.newOpp;

        this.turn = 0;
        this._checkPass();
        if (!this.gameOver) this._updateStatus();
    },

    tick() {
        const now = T.get();

        if (now - this.blinkMs >= 400) {
            this.blinkMs = now;
            this.cursorVis = !this.cursorVis;
        }

        if (this.gameOver) return;

        if (this.turn === 1 && !this.aiThinking) {
            this.aiThinking = true;
            this.aiDelayMs = now;
            this.status = 'AI 思考中…';
        }

        if (this.aiThinking && now - this.aiDelayMs >= OT_AI_DELAY_MS) {
            this.aiThinking = false;
            this._doAiMove();
            if (!this.gameOver) this._updateStatus();
        }
    },

    handleKey(key) {
        if (this.gameOver && this.showResult) {
            if (key === LV_KEY_ENTER) {
                this.showResult = false;
                MiniGame.finish(this.getScore());
            }
            return true;
        }
        if (this.gameOver) return false;
        if (this.turn !== 0) return false;
        if (this.aiThinking) return false;

        const col = this.cursorPos % 8;
        const row = Math.floor(this.cursorPos / 8);

        switch (key) {
            case LV_KEY_UP:
                if (row > 0) this.cursorPos -= 8;
                return true;
            case LV_KEY_DOWN:
                if (row < 7) this.cursorPos += 8;
                return true;
            case LV_KEY_LEFT:
                if (col > 0) this.cursorPos -= 1;
                return true;
            case LV_KEY_RIGHT:
                if (col < 7) this.cursorPos += 1;
                return true;
            case LV_KEY_ENTER:
                return this._tryPlacePiece(this.cursorPos);
            default:
                return false;
        }
    },

    getScore() {
        const bc = popcnt64(this.black);
        const wc = popcnt64(this.white);
        if (bc > wc) return 100;
        if (wc > bc) return 0;
        return 50;
    },

    draw() {
        Draw.clear(CLR_BG);
        Draw.fillRect(OT_OFS_X, OT_OFS_Y, OT_BOARD_PX, OT_BOARD_PX, CLR_SPEAKER);
        for (let i = 0; i < 64; i++) {
            const row = Math.floor(i / 8), col = i % 8;
            const x = OT_OFS_X + col * OT_CELL_SIZE;
            const y = OT_OFS_Y + row * OT_CELL_SIZE;
            Draw.fillRect(x, y, OT_CELL_SIZE, OT_CELL_SIZE, CLR_BG);
            Draw.strokeRect(x, y, OT_CELL_SIZE, OT_CELL_SIZE, CLR_SPEAKER, 1);
        }
        for (let i = 0; i < 64; i++) {
            const bit = 1n << BigInt(i);
            if (this.black & bit) {
                const row = Math.floor(i / 8), col = i % 8;
                Draw.fillCircle(OT_OFS_X + col * OT_CELL_SIZE + 7, OT_OFS_Y + row * OT_CELL_SIZE + 7, 5, CLR_SPEAKER);
            } else if (this.white & bit) {
                const row = Math.floor(i / 8), col = i % 8;
                Draw.fillCircle(OT_OFS_X + col * OT_CELL_SIZE + 7, OT_OFS_Y + row * OT_CELL_SIZE + 7, 5, CLR_PANEL);
                Draw.strokeCircle(OT_OFS_X + col * OT_CELL_SIZE + 7, OT_OFS_Y + row * OT_CELL_SIZE + 7, 5, CLR_SPEAKER, 2);
            }
        }
        if (this.turn === 0 && !this.gameOver) {
            const moves = this._getMoves(this.black, this.white);
            for (let i = 0; i < 64; i++) {
                if (moves & (1n << BigInt(i))) {
                    const row = Math.floor(i / 8), col = i % 8;
                    Draw.fillRect(OT_OFS_X + col * OT_CELL_SIZE + 6, OT_OFS_Y + row * OT_CELL_SIZE + 6, 3, 3, 0x6B9A10);
                }
            }
        }
        if (this.cursorVis) {
            const row = Math.floor(this.cursorPos / 8), col = this.cursorPos % 8;
            Draw.strokeRect(OT_OFS_X + col * OT_CELL_SIZE, OT_OFS_Y + row * OT_CELL_SIZE,
                OT_CELL_SIZE, OT_CELL_SIZE, CLR_SPEAKER, 2);
        }
        Draw.textCenter(this.status, 0, 0, SCREEN_W, CLR_TEXT);
    },
};
