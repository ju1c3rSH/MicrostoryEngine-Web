/* game_qte.js - QTE 连打（game_qte.c 移植）
 *
 * 5 轮：滑块往返移动，ENTER 停在目标区，越准分越高。
 */

const BAR_W = 120, BAR_H = 4;
const MARKER_W = 4, MARKER_H = 12;
const BAR_X = Math.floor((SCREEN_W - BAR_W) / 2);
const BAR_Y = 48;
const MARKER_Y = BAR_Y - 4;
const TOTAL_ROUNDS = 5;

const GameQte = {
    name: 'QTE连打',

    round: 0, totalScore: 0,
    barX: 0, barDir: 1, barSpeed: 1,
    targetX: 0, targetW: 0,
    roundScore: 0, roundActive: false,
    resultShowing: false, resultMs: 0, moveMs: 0,

    start() {
        this.rng = createCrand(Math.floor(T.get()) & 0x7FFFFFFF);
        this.round = 0;
        this.totalScore = 0;
        this._setupRound();
    },

    _setupRound() {
        this.roundScore = 0;
        this.barX = this.rng.range(0, BAR_W - MARKER_W);
        this.barDir = (this.rng.next() % 2) ? 1 : -1;
        this.barSpeed = 1 + this.round;
        this.targetW = Math.max(8, 28 - this.round * 5);
        const maxX = Math.max(0, BAR_W - MARKER_W - this.targetW);
        this.targetX = this.rng.range(0, maxX);
        this.roundActive = true;
        this.resultShowing = false;
        this.moveMs = T.get();
    },

    _calcAccuracy() {
        const mc = this.barX + MARKER_W / 2;
        const tc = this.targetX + this.targetW / 2;
        const dist = Math.abs(mc - tc);
        const half = Math.floor(this.targetW / 2);
        if (half <= 0) return 0;
        if (dist >= half) return 0;
        return 100 - Math.floor(dist * 100 / half);
    },

    _onResultDone() {
        this.round++;
        if (this.round >= TOTAL_ROUNDS) {
            MiniGame.finish(Math.floor(this.totalScore / TOTAL_ROUNDS));
        } else {
            this._setupRound();
        }
    },

    tick() {
        if (this.resultShowing) {
            if (T.get() - this.resultMs >= 1000) {
                this.resultShowing = false;
                this._onResultDone();
            }
            return;
        }
        if (!this.roundActive) return;

        const now = T.get();
        const dt = now - this.moveMs;
        if (dt < 16) return;
        this.moveMs = now;

        this.barX += this.barDir * this.barSpeed;
        if (this.barX <= 0) { this.barX = 0; this.barDir = 1; }
        else if (this.barX >= BAR_W - MARKER_W) { this.barX = BAR_W - MARKER_W; this.barDir = -1; }
    },

    handleKey(key) {
        if (key !== LV_KEY_ENTER) return false;
        if (this.resultShowing) return true;
        if (!this.roundActive) return false;

        this.roundActive = false;
        this.roundScore = this._calcAccuracy();
        this.totalScore += this.roundScore;

        if (this.roundScore >= 80) Audio2.beep(1200, 60);
        else if (this.roundScore >= 50) Audio2.beep(800, 60);
        else if (this.roundScore > 0) Audio2.beep(500, 60);
        else Audio2.beep(200, 80);

        this.resultText = '本轮得分: ' + this.roundScore;
        this.result = this.roundScore >= 80 ? '完美!' :
                      this.roundScore >= 50 ? '不错!' :
                      this.roundScore > 0 ? '差一点!' : '没中!';
        this.resultShowing = true;
        this.resultMs = T.get();
        return true;
    },

    stop() { },

    getScore() {
        return Math.floor(this.totalScore / TOTAL_ROUNDS);
    },

    draw() {
        Draw.clear(CLR_BG);
        Draw.textCenter('第 ' + (this.round + 1) + ' / ' + TOTAL_ROUNDS + ' 轮', 0, 8, SCREEN_W, CLR_SPEAKER);
        Draw.textCenter(this.resultShowing ? '' : '按 ENTER 瞄准!', 0, 26, SCREEN_W, CLR_TEXT);

        /* 轨道 */
        Draw.fillRect(BAR_X, BAR_Y, BAR_W, BAR_H, CLR_SPEAKER);
        /* 目标区 */
        Draw.fillRect(BAR_X + this.targetX, BAR_Y, this.targetW, BAR_H, CLR_PANEL);
        /* 滑块 */
        if (!this.resultShowing) {
            Draw.fillRect(BAR_X + this.barX, MARKER_Y, MARKER_W, MARKER_H, CLR_TEXT);
        }

        if (this.resultShowing) {
            Draw.textCenter(this.resultText, 0, 70, SCREEN_W, CLR_SPEAKER);
            Draw.textCenter(this.result, 0, 90, SCREEN_W, CLR_SPEAKER);
        }
    },
};
