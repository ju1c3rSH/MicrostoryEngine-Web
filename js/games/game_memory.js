const MEM_COLS = 4, MEM_ROWS = 3, MEM_N = MEM_COLS * MEM_ROWS;
const MEM_CW = 36, MEM_CH = 32, MEM_GX = 8, MEM_GY = 14;
const MEM_SYM = ['A', 'B', 'C', 'D', 'E', 'F'];

const GameMemory = {
    name: '翻牌记忆',

    val: [], state: [], cursor: 0, first: -1, moves: 0, pairs: 0,
    wait: false, waitMs: 0, waitA: 0, waitB: 0,
    over: false, showResult: false, blink: 0, cvis: true, startMs: 0,
    infoText: '',

    start() {
        this.rng = createCrand(Math.floor(T.get()) & 0x7FFFFFFF);
        this.cursor = 0;
        this.first = -1;
        this.moves = 0;
        this.pairs = 0;
        this.wait = false;
        this.over = false;
        this.showResult = false;
        this.cvis = true;
        this.blink = T.get();
        this.startMs = T.get();
        this.state = [];
        for (let i = 0; i < MEM_N; i++) this.state.push(0);
        this.val = [];
        for (let i = 0; i < MEM_N; i++) this.val.push(Math.floor(i / 2));
        for (let i = MEM_N - 1; i > 0; i--) {
            const j = this.rng.next() % (i + 1);
            const t = this.val[i];
            this.val[i] = this.val[j];
            this.val[j] = t;
        }
        this._updateInfo();
    },

    _updateInfo() {
        const sec = Math.floor((T.get() - this.startMs) / 1000);
        if (this.over) {
            this.infoText = '完成！' + this.moves + '步 ' + sec + 's';
        } else {
            this.infoText = '步数:' + this.moves + '  ' + sec + 's';
        }
    },

    tick() {
        const now = T.get();
        if (!this.over && this.wait && now - this.waitMs >= 800) {
            this.wait = false;
            this.state[this.waitA] = 0;
            this.state[this.waitB] = 0;
        }
        if (now - this.blink >= 400) {
            this.blink = now;
            this.cvis = !this.cvis;
        }
    },

    handleKey(key) {
        if (this.wait) return true;
        if (key === LV_KEY_UP) {
            if (Math.floor(this.cursor / MEM_COLS) > 0) this.cursor -= MEM_COLS;
            return true;
        }
        if (key === LV_KEY_DOWN) {
            if (Math.floor(this.cursor / MEM_COLS) < MEM_ROWS - 1) this.cursor += MEM_COLS;
            return true;
        }
        if (key === LV_KEY_LEFT) {
            if (this.cursor % MEM_COLS > 0) this.cursor -= 1;
            return true;
        }
        if (key === LV_KEY_RIGHT) {
            if (this.cursor % MEM_COLS < MEM_COLS - 1) this.cursor += 1;
            return true;
        }
        if (key === LV_KEY_ENTER) {
            if (this.over && this.showResult) {
                this.showResult = false;
                MiniGame.finish(this.getScore());
                return true;
            }
            if (this.over) return true;
            if (this.state[this.cursor] !== 0) return true;
            this.state[this.cursor] = 1;
            this.moves++;
            if (this.first < 0) {
                this.first = this.cursor;
            } else {
                if (this.val[this.first] === this.val[this.cursor]) {
                    this.state[this.first] = 2;
                    this.state[this.cursor] = 2;
                    this.first = -1;
                    this.pairs++;
                    if (this.pairs >= 6) {
                        this.over = true;
                        this.cvis = false;
                        this.showResult = true;
                        this._updateInfo();
                        return true;
                    }
                } else {
                    this.waitA = this.first;
                    this.waitB = this.cursor;
                    this.first = -1;
                    this.wait = true;
                    this.waitMs = T.get();
                }
            }
            this._updateInfo();
            return true;
        }
        return false;
    },

    stop() { },

    getScore() {
        let sc = 100 - (this.moves - 12) * 3;
        if (sc < 0) sc = 0;
        if (sc > 100) sc = 100;
        return sc;
    },

    draw() {
        Draw.clear(CLR_BG);
        Draw.textCenter('翻牌记忆', 0, 1, SCREEN_W, CLR_TEXT);

        for (let i = 0; i < MEM_N; i++) {
            const col = i % MEM_COLS;
            const row = Math.floor(i / MEM_COLS);
            const x = MEM_GX + col * MEM_CW;
            const y = MEM_GY + row * MEM_CH;
            if (this.state[i] === 2) continue;
            Draw.fillRect(x, y, MEM_CW, MEM_CH, this.state[i] === 1 ? CLR_BG : CLR_PANEL);
            Draw.strokeRect(x, y, MEM_CW, MEM_CH, CLR_BORDER);
            if (this.state[i] === 1) {
                Draw.textCenter(MEM_SYM[this.val[i]], x, y, MEM_CW, CLR_TEXT);
            }
        }

        if (this.cvis && !this.over) {
            const cx = MEM_GX + (this.cursor % MEM_COLS) * MEM_CW;
            const cy = MEM_GY + Math.floor(this.cursor / MEM_COLS) * MEM_CH;
            Draw.strokeRect(cx, cy, MEM_CW, MEM_CH, CLR_CHOICE_S, 2);
        }

        Draw.textCenter(this.infoText, 0, MEM_GY + MEM_ROWS * MEM_CH + 4, SCREEN_W, CLR_TEXT);
    },
};
