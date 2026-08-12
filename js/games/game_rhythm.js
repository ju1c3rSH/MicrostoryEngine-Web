const TOTAL_NOTES = 30;
const JUDGE_Y = 100;
const NOTE_SZ = 8;
const SPEED_DIV = 10;
const PERFECT_MS = 50;
const GOOD_MS = 100;
const END_DELAY_MS = 1000;
const LANE_CX = [27, 80, 133];

const PATTERNS = [
    [
        [0, 0], [1, 400], [2, 800], [0, 1200], [1, 1600],
        [2, 2000], [0, 2400], [1, 2800], [2, 3200], [0, 3600],
        [1, 4000], [2, 4400], [0, 4800], [1, 5200], [2, 5600],
        [0, 6000], [1, 6400], [2, 6800], [0, 7200], [1, 7600],
        [2, 8000], [0, 8400], [1, 8800], [2, 9200], [0, 9600],
        [1, 10000], [2, 10400], [0, 10800], [1, 11200], [2, 11600],
    ],
    [
        [0, 0], [0, 250], [1, 500], [1, 750], [2, 1000],
        [2, 1250], [0, 1500], [0, 1750], [1, 2000], [1, 2250],
        [2, 2500], [2, 2750], [0, 3000], [1, 3250], [2, 3500],
        [0, 3750], [1, 4000], [2, 4250], [0, 4500], [0, 4750],
        [1, 5000], [1, 5250], [2, 5500], [2, 5750], [0, 6000],
        [1, 6250], [2, 6500], [0, 6750], [1, 7000], [2, 7250],
    ],
    [
        [0, 0], [2, 500], [1, 800], [0, 1200], [2, 1600],
        [1, 2000], [0, 2300], [1, 2600], [2, 3000], [0, 3300],
        [1, 3600], [2, 4000], [0, 4200], [0, 4500], [2, 4800],
        [1, 5200], [2, 5500], [0, 5800], [1, 6200], [2, 6500],
        [1, 6800], [0, 7200], [0, 7500], [2, 7800], [1, 8200],
        [2, 8500], [0, 8800], [1, 9200], [0, 9500], [2, 10000],
    ],
];
const LANE_CHARS = ['←', '●', '→'];

const GameRhythm = {
    name: '节奏打击',

    start() {
        this.rng = createCrand(Math.floor(T.get()) & 0x7FFFFFFF);
        this.pat = (this.pat === undefined ? 2 : this.pat);
        this.pat = (this.pat + 1) % 3;
        this.totalScore = 0;
        this.combo = 0;
        this.scoredCnt = 0;
        this.scoredBits = 0;
        this.finished = false;
        this.endMs = 0;
        this.startMs = T.get();
    },

    _notePx(nt, elapsed) {
        return JUDGE_Y - NOTE_SZ / 2 + Math.floor((elapsed - nt) / SPEED_DIV);
    },

    tick() {
        if (this.finished) return;
        const now = T.get();
        const elapsed = now - this.startMs;

        for (let i = 0; i < TOTAL_NOTES; i++) {
            if (this.scoredBits & (1 << i)) continue;
            const nt = PATTERNS[this.pat][i][1];
            const diff = elapsed - nt;
            if (diff > GOOD_MS) {
                this.scoredBits |= (1 << i);
                this.scoredCnt++;
                this.combo = 0;
            }
        }

        if (this.scoredCnt >= TOTAL_NOTES) {
            if (this.endMs === 0) this.endMs = now;
            if (now - this.endMs >= END_DELAY_MS) {
                this.finished = true;
                MiniGame.finish(this.getScore());
            }
        }
    },

    handleKey(key) {
        if (this.finished) return true;
        let lane = -1;
        if (key === LV_KEY_LEFT) lane = 0;
        else if (key === LV_KEY_ENTER) lane = 1;
        else if (key === LV_KEY_RIGHT) lane = 2;
        if (lane < 0) return false;

        if (this.scoredCnt >= TOTAL_NOTES) return true;

        const elapsed = T.get() - this.startMs;
        let bestI = -1;
        let bestDiff = 999999;

        for (let i = 0; i < TOTAL_NOTES; i++) {
            if (this.scoredBits & (1 << i)) continue;
            const nl = PATTERNS[this.pat][i][0];
            if (nl !== lane) continue;
            const nt = PATTERNS[this.pat][i][1];
            let d = elapsed - nt;
            if (d < 0) d = -d;
            if (d < bestDiff) {
                bestDiff = d;
                bestI = i;
            }
        }

        if (bestI >= 0 && bestDiff <= GOOD_MS) {
            this.scoredBits |= (1 << bestI);
            this.scoredCnt++;
            if (bestDiff <= PERFECT_MS) {
                this.totalScore += 100;
            } else {
                this.totalScore += 70;
            }
            this.combo++;
            Audio2.beep(880 + this.combo * 30, 40);
        }

        return true;
    },

    stop() { },

    getScore() {
        return Math.floor(this.totalScore / TOTAL_NOTES);
    },

    draw() {
        Draw.clear(CLR_BG);

        for (let i = 0; i < 3; i++) {
            Draw.vline(LANE_CX[i], 0, SCREEN_H, CLR_BORDER);
        }
        Draw.fillRect(0, JUDGE_Y, SCREEN_W, 2, CLR_SPEAKER);

        for (let i = 0; i < 3; i++) {
            Draw.textCenter(LANE_CHARS[i], LANE_CX[i], 2, CLR_TEXT);
        }

        Draw.text(String(this.totalScore), 4, 2, CLR_TEXT);

        if (this.combo >= 2) {
            Draw.text('COMBO x' + this.combo, 40, 106, CLR_SPEAKER);
        }

        const elapsed = T.get() - this.startMs;
        for (let i = 0; i < TOTAL_NOTES; i++) {
            if (this.scoredBits & (1 << i)) continue;
            const lane = PATTERNS[this.pat][i][0];
            const nt = PATTERNS[this.pat][i][1];
            const y = this._notePx(nt, elapsed);
            if (y > -NOTE_SZ && y < SCREEN_H) {
                Draw.fillRect(LANE_CX[lane] - NOTE_SZ / 2, y, NOTE_SZ, NOTE_SZ, CLR_SPEAKER);
            }
        }
    },
};
