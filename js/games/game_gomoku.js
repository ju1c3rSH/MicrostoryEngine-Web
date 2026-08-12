const GK_BOARD_W = 9;
const GK_BOARD_SZ = 81;
const GK_CELL_SIZE = 14;
const GK_BOARD_PX = GK_BOARD_W * GK_CELL_SIZE;
const GK_BOARD_X = Math.floor((SCREEN_W - GK_BOARD_PX) / 2);
const GK_BOARD_Y = 16;
const GK_STONE_SIZE = 10;
const GK_SEARCH_DEPTH = 4;
const GK_SCORE_WIN = 1000000;
const GK_SCORE_LOSE = -1000000;

const GameGomoku = {
    name: '五子棋',

    board: null, moveCount: 0, cursorPos: 0,
    gameOver: false, aiThinking: false, score: 0,
    status: '', lastBlink: 0, cursorVis: true,

    start() {
        this.board = new Array(GK_BOARD_SZ).fill(0);
        this.moveCount = 0;
        this.cursorPos = Math.floor(GK_BOARD_W / 2) * GK_BOARD_W + Math.floor(GK_BOARD_W / 2);
        this.gameOver = false;
        this.aiThinking = false;
        this.score = 0;
        this.lastBlink = T.get();
        this.cursorVis = true;
        this.status = '你的回合';
    },

    stop() { },

    _centerDist(pos) {
        const r = Math.floor(pos / GK_BOARD_W);
        const c = pos % GK_BOARD_W;
        const cr = Math.floor(GK_BOARD_W / 2);
        const cc = Math.floor(GK_BOARD_W / 2);
        return (r - cr) * (r - cr) + (c - cc) * (c - cc);
    },

    _checkWinAt(board, pos) {
        const side = board[pos];
        if (side === 0) return false;
        const r = Math.floor(pos / GK_BOARD_W);
        const c = pos % GK_BOARD_W;
        const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
        for (let d = 0; d < 4; d++) {
            const dr = dirs[d][0], dc = dirs[d][1];
            let count = 1;
            for (let k = 1; k < 5; k++) {
                const nr = r + k * dr, nc = c + k * dc;
                if (nr < 0 || nr >= GK_BOARD_W || nc < 0 || nc >= GK_BOARD_W) break;
                if (board[nr * GK_BOARD_W + nc] !== side) break;
                count++;
            }
            for (let k = 1; k < 5; k++) {
                const nr = r - k * dr, nc = c - k * dc;
                if (nr < 0 || nr >= GK_BOARD_W || nc < 0 || nc >= GK_BOARD_W) break;
                if (board[nr * GK_BOARD_W + nc] !== side) break;
                count++;
            }
            if (count >= 5) return true;
        }
        return false;
    },

    _evaluateSide(board, side) {
        const scoreMap = [0, 10, 100, 1000, 10000, GK_SCORE_WIN];
        const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
        let total = 0;
        for (let r = 0; r < GK_BOARD_W; r++) {
            for (let c = 0; c < GK_BOARD_W; c++) {
                for (let d = 0; d < 4; d++) {
                    const dr = dirs[d][0], dc = dirs[d][1];
                    const er = r + 4 * dr, ec = c + 4 * dc;
                    if (er < 0 || er >= GK_BOARD_W || ec < 0 || ec >= GK_BOARD_W) continue;
                    let cnt = 0, opp = 0;
                    for (let k = 0; k < 5; k++) {
                        const idx = (r + k * dr) * GK_BOARD_W + (c + k * dc);
                        if (board[idx] === side) cnt++;
                        else if (board[idx] === -side) opp++;
                    }
                    if (opp === 0) total += scoreMap[cnt];
                }
            }
        }
        return total;
    },

    _evaluate(board) {
        return this._evaluateSide(board, -1) - this._evaluateSide(board, 1);
    },

    _generateMoves(board) {
        const candidate = new Array(GK_BOARD_SZ).fill(0);
        let hasStone = false;
        for (let i = 0; i < GK_BOARD_SZ; i++) {
            if (board[i] !== 0) {
                hasStone = true;
                const r = Math.floor(i / GK_BOARD_W), c = i % GK_BOARD_W;
                for (let dr = -2; dr <= 2; dr++) {
                    for (let dc = -2; dc <= 2; dc++) {
                        if (dr === 0 && dc === 0) continue;
                        const nr = r + dr, nc = c + dc;
                        if (nr >= 0 && nr < GK_BOARD_W && nc >= 0 && nc < GK_BOARD_W) {
                            const idx = nr * GK_BOARD_W + nc;
                            if (board[idx] === 0) candidate[idx] = 1;
                        }
                    }
                }
            }
        }
        const moves = [];
        if (!hasStone) {
            moves.push(Math.floor(GK_BOARD_W / 2) * GK_BOARD_W + Math.floor(GK_BOARD_W / 2));
        } else {
            for (let i = 0; i < GK_BOARD_SZ; i++) {
                if (candidate[i]) moves.push(i);
            }
        }
        return moves;
    },

    _sortMoves(moves) {
        for (let i = 1; i < moves.length; i++) {
            const key = moves[i];
            const kd = this._centerDist(key);
            let j = i - 1;
            while (j >= 0 && this._centerDist(moves[j]) > kd) {
                moves[j + 1] = moves[j];
                j--;
            }
            moves[j + 1] = key;
        }
    },

    _alphaBeta(board, depth, alpha, beta, side) {
        const score = this._evaluate(board);
        if (score >= GK_SCORE_WIN || score <= GK_SCORE_LOSE) return score;
        if (depth === 0) return score;
        const moves = this._generateMoves(board);
        if (moves.length === 0) return score;
        this._sortMoves(moves);
        if (side === -1) {
            let best = -9999999;
            for (let i = 0; i < moves.length; i++) {
                board[moves[i]] = side;
                const val = this._alphaBeta(board, depth - 1, alpha, beta, -side);
                board[moves[i]] = 0;
                if (val > best) best = val;
                if (val > alpha) alpha = val;
                if (alpha >= beta) break;
            }
            return best;
        } else {
            let best = 9999999;
            for (let i = 0; i < moves.length; i++) {
                board[moves[i]] = side;
                const val = this._alphaBeta(board, depth - 1, alpha, beta, -side);
                board[moves[i]] = 0;
                if (val < best) best = val;
                if (val < beta) beta = val;
                if (alpha >= beta) break;
            }
            return best;
        }
    },

    _findWinningMove(board, side) {
        for (let i = 0; i < GK_BOARD_SZ; i++) {
            if (board[i] !== 0) continue;
            board[i] = side;
            const win = this._checkWinAt(board, i);
            board[i] = 0;
            if (win) return i;
        }
        return -1;
    },

    _aiComputeMove() {
        const win = this._findWinningMove(this.board, -1);
        if (win >= 0) return win;
        const block = this._findWinningMove(this.board, 1);
        if (block >= 0) return block;
        const moves = this._generateMoves(this.board);
        if (moves.length === 0) return -1;
        this._sortMoves(moves);
        let bestMove = moves[0];
        let bestScore = -9999999;
        const boardCopy = this.board.slice();
        const limit = Math.min(moves.length, 15);
        for (let i = 0; i < limit; i++) {
            boardCopy[moves[i]] = -1;
            const val = this._alphaBeta(boardCopy, GK_SEARCH_DEPTH - 1, -9999999, 9999999, 1);
            boardCopy[moves[i]] = 0;
            if (val > bestScore) {
                bestScore = val;
                bestMove = moves[i];
            }
        }
        return bestMove;
    },

    tick() {
        if (this.gameOver) return;
        const now = T.get();
        if (now - this.lastBlink >= 400) {
            this.lastBlink = now;
            if (!this.aiThinking) this.cursorVis = !this.cursorVis;
        }
        if (this.aiThinking) {
            this.aiThinking = false;
            this.cursorVis = false;
            const best = this._aiComputeMove();
            if (best >= 0) {
                this.board[best] = -1;
                this.moveCount++;
                if (this._checkWinAt(this.board, best)) {
                    this.gameOver = true;
                    this.score = 0;
                    this.status = 'AI 赢了!';
                    MiniGame.finish(this.score);
                    return;
                }
                if (this.moveCount >= GK_BOARD_SZ) {
                    this.gameOver = true;
                    this.score = 50;
                    this.status = '平局';
                    MiniGame.finish(this.score);
                    return;
                }
                this.cursorPos = best;
                this.cursorVis = true;
                this.status = '你的回合';
            }
        }
    },

    handleKey(key) {
        if (this.gameOver || this.aiThinking) return true;
        switch (key) {
            case LV_KEY_UP: {
                const nr = Math.floor(this.cursorPos / GK_BOARD_W) - 1;
                if (nr >= 0) {
                    this.cursorPos = nr * GK_BOARD_W + this.cursorPos % GK_BOARD_W;
                    this.cursorVis = true;
                }
                return true;
            }
            case LV_KEY_DOWN: {
                const nr = Math.floor(this.cursorPos / GK_BOARD_W) + 1;
                if (nr < GK_BOARD_W) {
                    this.cursorPos = nr * GK_BOARD_W + this.cursorPos % GK_BOARD_W;
                    this.cursorVis = true;
                }
                return true;
            }
            case LV_KEY_LEFT: {
                const nc = this.cursorPos % GK_BOARD_W - 1;
                if (nc >= 0) {
                    this.cursorPos = Math.floor(this.cursorPos / GK_BOARD_W) * GK_BOARD_W + nc;
                    this.cursorVis = true;
                }
                return true;
            }
            case LV_KEY_RIGHT: {
                const nc = this.cursorPos % GK_BOARD_W + 1;
                if (nc < GK_BOARD_W) {
                    this.cursorPos = Math.floor(this.cursorPos / GK_BOARD_W) * GK_BOARD_W + nc;
                    this.cursorVis = true;
                }
                return true;
            }
            case LV_KEY_ENTER:
                if (this.board[this.cursorPos] !== 0) return true;
                this.board[this.cursorPos] = 1;
                this.moveCount++;
                if (this._checkWinAt(this.board, this.cursorPos)) {
                    this.gameOver = true;
                    this.score = 100;
                    this.status = '你赢了!';
                    this.cursorVis = false;
                    MiniGame.finish(this.score);
                    return true;
                }
                if (this.moveCount >= GK_BOARD_SZ) {
                    this.gameOver = true;
                    this.score = 50;
                    this.status = '平局';
                    this.cursorVis = false;
                    MiniGame.finish(this.score);
                    return true;
                }
                this.aiThinking = true;
                this.cursorVis = false;
                this.status = 'AI 思考中…';
                return true;
        }
        return false;
    },

    getScore() {
        return this.score;
    },

    draw() {
        Draw.clear(CLR_BG);
        Draw.strokeRect(GK_BOARD_X, GK_BOARD_Y, GK_BOARD_PX, GK_BOARD_PX, CLR_SPEAKER, 2);
        for (let i = 1; i < GK_BOARD_W; i++) {
            Draw.vline(GK_BOARD_X + i * GK_CELL_SIZE, GK_BOARD_Y, GK_BOARD_PX, CLR_SPEAKER);
            Draw.hline(GK_BOARD_X, GK_BOARD_Y + i * GK_CELL_SIZE, GK_BOARD_PX, CLR_SPEAKER);
        }
        for (let i = 0; i < GK_BOARD_SZ; i++) {
            const v = this.board[i];
            if (v === 0) continue;
            const r = Math.floor(i / GK_BOARD_W), c = i % GK_BOARD_W;
            const cx = GK_BOARD_X + c * GK_CELL_SIZE + 7;
            const cy = GK_BOARD_Y + r * GK_CELL_SIZE + 7;
            if (v === 1) {
                Draw.fillCircle(cx, cy, 5, CLR_PANEL);
                Draw.strokeCircle(cx, cy, 5, CLR_SPEAKER, 1);
            } else {
                Draw.fillCircle(cx, cy, 5, CLR_SPEAKER);
            }
        }
        if (!this.aiThinking && this.cursorVis) {
            const r = Math.floor(this.cursorPos / GK_BOARD_W), c = this.cursorPos % GK_BOARD_W;
            Draw.strokeRect(GK_BOARD_X + c * GK_CELL_SIZE, GK_BOARD_Y + r * GK_CELL_SIZE,
                GK_CELL_SIZE, GK_CELL_SIZE, CLR_CHOICE_S, 2);
        }
        Draw.textCenter(this.status, 0, 0, SCREEN_W, CLR_SPEAKER);
    },
};
