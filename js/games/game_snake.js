/* game_snake.js - 贪吃蛇（game_snake.c 移植）
 *
 * 布局：16×12 网格，格 10px，顶部 8px 信息栏，底部 8px。
 * 方向键转向，ENTER 暂停，吃到食物加速，120 秒限时。
 */

const GW = 16, GH = 12, CELL = 10;
const MAX_SNAKE = 100;
const INIT_INTERVAL_MS = 300;
const SPEEDUP_PER_FOOD = 5;
const MIN_INTERVAL_MS = 100;
const TIME_LIMIT_MS = 120000;
const SCORE_BAR_H = 8;

const DIR_R = 0, DIR_D = 1, DIR_L = 2, DIR_U = 3;
const SDX = [1, 0, -1, 0];
const SDY = [0, 1, 0, -1];

const GameSnake = {
    name: '贪吃蛇',

    body: [], len: 0, dir: DIR_R, nextDir: DIR_R,
    fx: 0, fy: 0, score: 0,
    lastMoveMs: 0, startMs: 0, moveInterval: INIT_INTERVAL_MS,
    paused: false, gameOver: false, dead: false, overMs: 0,

    start() {
        this.rng = createCrand(Math.floor(T.get()) & 0x7FFFFFFF);
        this.len = 3;
        this.body = [{ x: 6, y: 6 }, { x: 7, y: 6 }, { x: 8, y: 6 }];
        this.dir = DIR_R; this.nextDir = DIR_R;
        this.score = 0;
        this.moveInterval = INIT_INTERVAL_MS;
        this.lastMoveMs = T.get();
        this.startMs = T.get();
        this.paused = false; this.gameOver = false; this.dead = false; this.overMs = 0;
        this._spawnFood();
    },

    _spawnFood() {
        let occupied, tries = 0;
        do {
            occupied = false;
            this.fx = this.rng.next() % GW;
            this.fy = this.rng.next() % GH;
            for (let i = 0; i < this.len; i++) {
                if (this.body[i].x === this.fx && this.body[i].y === this.fy) { occupied = true; break; }
            }
            tries++;
        } while (occupied && tries < 200);
    },

    _advance() {
        const nx = this.body[this.len - 1].x + SDX[this.nextDir];
        const ny = this.body[this.len - 1].y + SDY[this.nextDir];
        this.dir = this.nextDir;

        if (nx < 0 || nx >= GW || ny < 0 || ny >= GH) {
            this.gameOver = true; this.dead = true; this.overMs = T.get();
            return;
        }
        for (let i = 0; i < this.len - 1; i++) {
            if (this.body[i].x === nx && this.body[i].y === ny) {
                this.gameOver = true; this.dead = true; this.overMs = T.get();
                return;
            }
        }

        for (let i = 0; i < this.len - 1; i++) this.body[i] = { ...this.body[i + 1] };
        this.body[this.len - 1] = { x: nx, y: ny };

        if (nx === this.fx && ny === this.fy) {
            if (this.len < MAX_SNAKE) this.body.push({ x: nx, y: ny });
            this.len = this.body.length;
            this.score++;
            if (this.moveInterval > MIN_INTERVAL_MS) {
                this.moveInterval = Math.max(MIN_INTERVAL_MS, this.moveInterval - SPEEDUP_PER_FOOD);
            }
            this._spawnFood();
        }
        if (this.len > MAX_SNAKE) this.len = MAX_SNAKE;
    },

    tick() {
        if (this.gameOver) {
            if (this.dead && this.overMs > 0) {
                if (T.get() - this.overMs >= 800) {
                    this.dead = false;
                    MiniGame.finish(this.getScore());
                }
            }
            return;
        }
        if (this.paused) return;

        const now = T.get();
        if (now - this.lastMoveMs >= this.moveInterval) {
            this.lastMoveMs = now;
            this._advance();
            if (this.gameOver) { this.overMs = T.get(); return; }
        }
        if (now - this.startMs >= TIME_LIMIT_MS) {
            this.gameOver = true; this.dead = false;
            MiniGame.finish(this.getScore());
            return;
        }
    },

    handleKey(key) {
        if (this.gameOver) return true;
        if (key === LV_KEY_ENTER) {
            this.paused = !this.paused;
            if (!this.paused) this.lastMoveMs = T.get();
            return true;
        }
        if (this.paused) return true;
        let nd = this.dir;
        if (key === LV_KEY_UP) nd = DIR_U;
        else if (key === LV_KEY_DOWN) nd = DIR_D;
        else if (key === LV_KEY_LEFT) nd = DIR_L;
        else if (key === LV_KEY_RIGHT) nd = DIR_R;
        else return false;
        if ((nd + 2) % 4 === this.dir) return true;
        this.nextDir = nd;
        return true;
    },

    stop() { },

    getScore() {
        return Math.min(100, this.score * 10);
    },

    draw() {
        Draw.clear(CLR_BG);
        Draw.text('得分:' + this.score + '  时间:' + Math.max(0, Math.floor((TIME_LIMIT_MS - (T.get() - this.startMs)) / 1000)), 4, 0, CLR_TEXT);

        /* 网格线 */
        for (let i = 0; i < GW; i++) Draw.vline(i * CELL, SCORE_BAR_H, GH * CELL, CLR_BORDER);
        for (let i = 0; i <= GH; i++) Draw.hline(0, SCORE_BAR_H + i * CELL, GW * CELL, CLR_BORDER);

        /* 食物 */
        Draw.fillRect(this.fx * CELL, SCORE_BAR_H + this.fy * CELL, CELL, CELL, CLR_SPEAKER);

        /* 蛇身 */
        for (let i = 0; i < this.len; i++) {
            const c = (i === this.len - 1) ? CLR_SPEAKER : CLR_CHOICE_S;
            Draw.fillRect(this.body[i].x * CELL, SCORE_BAR_H + this.body[i].y * CELL, CELL, CELL, c);
        }
    },
};
