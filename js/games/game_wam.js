const WAM_COLS = 3, WAM_ROWS = 3, WAM_N = WAM_COLS * WAM_ROWS;
const WAM_HW = 50, WAM_HH = 32, WAM_GAP = 2, WAM_GX = 3, WAM_GY = 16;
const WAM_GAME_MS = 30000;

const GameWam = {
    name: '打地鼠',

    holeState: [], holeBg: [], cursor: 0, score: 0, hits: 0,
    over: false, startMs: 0, active: -1, hideMs: 0, spawnMs: 0,
    blink: 0, cvis: true, fbHole: -1, fbMs: 0, waitMs: 0,
    combo: 0, comboMs: 0, topbarText: '',

    start() {
        this.rng = createCrand(Math.floor(T.get()) & 0x7FFFFFFF);
        this.cursor = 0;
        this.score = 0;
        this.hits = 0;
        this.combo = 0;
        this.over = false;
        this.active = -1;
        this.cvis = true;
        this.fbHole = -1;
        this.blink = T.get();
        this.startMs = T.get();
        this.spawnMs = T.get() + 1000 + (this.rng.next() % 1001);
        this.holeState = [];
        this.holeBg = [];
        for (let i = 0; i < WAM_N; i++) {
            this.holeState.push(0);
            this.holeBg.push(CLR_PANEL);
        }
        this._updateTopbar();
    },

    _updateTopbar() {
        let remain = WAM_GAME_MS - (T.get() - this.startMs);
        if (remain < 0) remain = 0;
        const sec = Math.floor((remain + 999) / 1000);
        if (this.combo >= 2 && T.get() - this.comboMs < 1000) {
            this.topbarText = '得分:' + this.score + '  ' + this.combo + '连击!  ' + sec;
        } else {
            this.topbarText = '得分: ' + this.score + '  时间: ' + sec;
        }
    },

    _spawnMole() {
        let hole = this.rng.next() % WAM_N;
        for (let i = 0; i < WAM_N; i++) {
            const h = (hole + i) % WAM_N;
            if (this.holeState[h] === 0) { hole = h; break; }
        }
        this.active = hole;
        this.holeState[hole] = 1;
        this.hideMs = T.get() + 600 + (this.rng.next() % 901);
        this.spawnMs = T.get() + 800 + (this.rng.next() % 1201);
    },

    tick() {
        const now = T.get();
        if (!this.over) {
            if (now - this.startMs >= WAM_GAME_MS) {
                this.over = true;
                this.cvis = false;
                if (this.active >= 0) {
                    this.holeState[this.active] = 0;
                    this.active = -1;
                }
                this._updateTopbar();
                this.waitMs = now;
                return;
            }
            if (this.active >= 0 && now - this.hideMs >= 0) {
                this.holeState[this.active] = 0;
                this.active = -1;
            }
            if (this.active < 0 && now - this.spawnMs >= 0) {
                this._spawnMole();
            }
            if (this.fbHole >= 0 && now - this.fbMs >= 200) {
                this.holeBg[this.fbHole] = CLR_PANEL;
                this.fbHole = -1;
            }
            if (now - this.blink >= 400) {
                this.blink = now;
                this.cvis = !this.cvis;
            }
            this._updateTopbar();
        } else {
            if (now - this.waitMs >= 1500) {
                MiniGame.finish(this.getScore());
            }
        }
    },

    handleKey(key) {
        if (this.over) return true;
        if (key === LV_KEY_UP) {
            if (Math.floor(this.cursor / WAM_COLS) > 0) this.cursor -= WAM_COLS;
            return true;
        }
        if (key === LV_KEY_DOWN) {
            if (Math.floor(this.cursor / WAM_COLS) < WAM_ROWS - 1) this.cursor += WAM_COLS;
            return true;
        }
        if (key === LV_KEY_LEFT) {
            if (this.cursor % WAM_COLS > 0) this.cursor -= 1;
            return true;
        }
        if (key === LV_KEY_RIGHT) {
            if (this.cursor % WAM_COLS < WAM_COLS - 1) this.cursor += 1;
            return true;
        }
        if (key === LV_KEY_ENTER) {
            if (this.holeState[this.cursor] === 1) {
                this.holeState[this.cursor] = 0;
                this.active = -1;
                this.combo++;
                this.score += 10 + this.combo * 2;
                this.hits++;
                this.comboMs = T.get();
                this.holeBg[this.cursor] = CLR_CHOICE_T;
                this.fbHole = this.cursor;
                this.fbMs = T.get();
            } else {
                this.combo = 0;
                this.score = this.score >= 5 ? this.score - 5 : 0;
                this.holeBg[this.cursor] = CLR_SPEAKER;
                this.fbHole = this.cursor;
                this.fbMs = T.get();
            }
            this._updateTopbar();
            return true;
        }
        return false;
    },

    stop() { },

    getScore() {
        if (this.score >= 100) return 100;
        return this.score;
    },

    draw() {
        Draw.clear(CLR_BG);
        Draw.textCenter(this.topbarText, 0, 0, SCREEN_W, CLR_TEXT);

        for (let i = 0; i < WAM_N; i++) {
            const col = i % WAM_COLS;
            const row = Math.floor(i / WAM_COLS);
            const x = WAM_GX + col * (WAM_HW + WAM_GAP);
            const y = WAM_GY + row * (WAM_HH + WAM_GAP);
            Draw.fillRect(x, y, WAM_HW, WAM_HH, this.holeBg[i]);
            Draw.strokeRect(x, y, WAM_HW, WAM_HH, CLR_BORDER);
            Draw.fillCircle(x + WAM_HW / 2, y + WAM_HH / 2, 8, CLR_SPEAKER);
            if (this.holeState[i] === 1) {
                Draw.fillRect(x + (WAM_HW - 30) / 2, y + (WAM_HH - 20) / 2, 30, 20, CLR_CHOICE_S);
            }
        }

        if (this.cvis && !this.over) {
            const cx = WAM_GX + (this.cursor % WAM_COLS) * (WAM_HW + WAM_GAP);
            const cy = WAM_GY + Math.floor(this.cursor / WAM_COLS) * (WAM_HH + WAM_GAP);
            Draw.strokeRect(cx, cy, WAM_HW, WAM_HH, CLR_CHOICE_S, 2);
        }

        Draw.textCenter('ENTER 击打', 0, WAM_GY + WAM_ROWS * (WAM_HH + WAM_GAP), SCREEN_W, CLR_TEXT);
    },
};
