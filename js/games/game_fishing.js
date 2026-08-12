const FT_ROUNDS = 3;
const MAX_MISSES = 3;
const TENSION_MAX = 100;
const ENTER_FORCE = 15;
const DEPLETE_INTERVAL_MS = 70;
const BOB_W = 6;
const BOB_H = 6;
const BOB_X = (SCREEN_W - BOB_W) / 2;
const LINE_X = BOB_X + BOB_W / 2;
const BOB_BASE_Y = 26;
const WATER_Y = 16;
const DIP_DURATION_MS = 800;
const DIP_DROP_MS = 300;
const MISS_FEEDBACK_MS = 700;
const FLY_MS = 300;
const ESCAPE_MS = 400;
const RESULT_MS = 2000;
const BANG_BLINK_MS = 150;
const LINE_W = 1;
const TENSION_BAR_X = 30;
const TENSION_BAR_W = 124;
const TENSION_BAR_Y = 106;
const TENSION_BAR_H = 8;
const STATUS_Y = 90;
const RESULT_Y = 114;

const FISH = [
    { name: '鲫鱼', value: 18, bodyW: 12, bodyH: 6, strength: 1 },
    { name: '鲤鱼', value: 25, bodyW: 15, bodyH: 7, strength: 2 },
    { name: '草鱼', value: 35, bodyW: 19, bodyH: 9, strength: 3 },
    { name: '鲈鱼', value: 30, bodyW: 17, bodyH: 8, strength: 2 },
    { name: '鲶鱼', value: 22, bodyW: 14, bodyH: 7, strength: 2 },
    { name: '鳊鱼', value: 28, bodyW: 18, bodyH: 8, strength: 3 },
];
const BONUS_TENS = [25, 20, 15];

const STATE_CASTING = 0, STATE_WAITING = 1, STATE_DIP = 2,
      STATE_REELING = 3, STATE_MISS = 4, STATE_RESULT = 5;

const GameFishing = {
    name: '钓鱼',

    start() {
        this.rng = createCrand(Math.floor(T.get()) & 0x7FFFFFFF);
        this.round = 0;
        this.totalScore = 0;
        this.missCount = 0;
        this.caught = false;
        this.roundScore = 0;
        this.fishIdx = this.rng.range(0, 5);
        this.showTensionFlag = false;
        this.fishVisible = false;
        this.bangVisible = false;
        this.statusText = '';
        this.resultText = '';
        this.ripples = [];
        this.bobX = BOB_X;
        this.bobY = BOB_BASE_Y;
        this.fishX = 0;
        this.fishY = 0;
        this.enterCast();
    },

    _updateTensionBar() {
        let w = Math.floor(this.tension * (TENSION_BAR_W - 2) / TENSION_MAX);
        if (w < 0) w = 0;
        if (w > TENSION_BAR_W - 2) w = TENSION_BAR_W - 2;
        this.tensionW = w;
        if (this.tension < 34) this.tensionColor = CLR_DANGER;
        else if (this.tension < 67) this.tensionColor = CLR_WARN;
        else this.tensionColor = CLR_NOTIFY;
    },

    _updateReelStatus() {
        if (this.tension >= 67) this.statusText = '稳住！连打ENTER';
        else if (this.tension >= 34) this.statusText = '快！连打ENTER';
        else this.statusText = '危险！鱼要跑了！';
    },

    _showTension(show) {
        this.showTensionFlag = show;
    },

    _showFish() {
        this.fishVisible = true;
    },

    _hideFish() {
        this.fishVisible = false;
    },

    _placeFish(fx, fy) {
        this.fishX = fx;
        this.fishY = fy;
    },

    _updateLine() {
        this.lineLen = Math.max(1, this.bobY - WATER_Y);
    },

    _animateWater(now) {
        this.ripples = [];
        for (let i = 0; i < 3; i++) {
            const ph = Math.floor(now / 30 + i * 31) % 16;
            const off = ph - 8;
            this.ripples.push(8 + off);
        }
    },

    enterCast() {
        this.state = STATE_CASTING;
        this.bobX = BOB_X;
        this.bobY = BOB_BASE_Y;
        this._updateLine();
        this.statusText = '抛竿 ENTER';
        this._showTension(false);
        this._hideFish();
        this.bangVisible = false;
    },

    enterWaiting() {
        this.state = STATE_WAITING;
        this.waitDuration = this.rng.range(2000, 5000);
        this.stateMs = T.get();
        this.statusText = '等鱼上钩...';
    },

    enterDip() {
        this.state = STATE_DIP;
        this.stateMs = T.get();
        this.bobX = BOB_X;
        this.bobY = BOB_BASE_Y;
        this.statusText = '上钩了！按ENTER';
        Audio2.beep(1200, 60);
    },

    enterReeling() {
        this.state = STATE_REELING;
        this.tension = 10;
        this.tensionW = 0;
        this.depleteMs = T.get();
        this.flyMs = 0;
        this.escapeMs = 0;
        this.caught = false;
        this.statusText = '收线！连打ENTER!';
        this._showTension(true);
        this._showFish();
        this._updateTensionBar();
    },

    enterMissFeedback() {
        this.state = STATE_MISS;
        this.stateMs = T.get();
        this.statusText = '错过了！剩' + (MAX_MISSES - this.missCount) + '次';
        Audio2.beep(300, 80);
    },

    enterResult() {
        this.state = STATE_RESULT;
        this.resultHandled = false;
        this._showTension(false);
        this.bangVisible = false;
        this.resultMs = T.get();

        if (this.caught) {
            let bonus = BONUS_TENS[this.missCount < 3 ? this.missCount : 2];
            if (this.missCount >= 3) bonus = 5;
            this.roundScore = Math.floor(FISH[this.fishIdx].value * bonus / 10);
            this.totalScore += this.roundScore;
            this.resultText = '钓到:' + FISH[this.fishIdx].name + ' +' + this.roundScore + '分';
            this.statusText = '按 ENTER 继续';
            Audio2.beep(880, 90);
        } else {
            this.roundScore = 0;
            this.resultText = '鱼跑了!';
            this.statusText = '按 ENTER 继续';
            this._hideFish();
            Audio2.beep(200, 80);
        }
    },

    advanceRound() {
        this.round++;
        if (this.round >= FT_ROUNDS) {
            MiniGame.finish(this.getScore());
        } else {
            this.missCount = 0;
            this.caught = false;
            this.roundScore = 0;
            this.fishIdx = this.rng.range(0, 5);
            this.enterCast();
            this.resultText = '';
        }
    },

    tick() {
        const now = T.get();
        this._animateWater(now);

        if (this.state === STATE_CASTING) {
            const phase = Math.floor(now / 60) % 20;
            const offset = phase < 10 ? phase - 5 : 15 - phase;
            this.bobX = BOB_X;
            this.bobY = BOB_BASE_Y + offset;
            this._updateLine();
        }

        if (this.state === STATE_WAITING) {
            const ph = Math.floor(now / 120) % 8;
            const off = ph < 4 ? ph : 8 - ph;
            this.bobX = BOB_X + off - 2;
            this.bobY = BOB_BASE_Y + (Math.floor(now / 400) % 3);
            this._updateLine();
            if (now - this.stateMs >= this.waitDuration) {
                this.enterDip();
            }
        }

        if (this.state === STATE_DIP) {
            const elapsed = now - this.stateMs;
            let dipY = BOB_BASE_Y;
            if (elapsed < DIP_DROP_MS) {
                dipY = BOB_BASE_Y + Math.floor(elapsed * 5 / DIP_DROP_MS);
            } else {
                dipY = BOB_BASE_Y + 5;
            }
            this.bobX = BOB_X;
            this.bobY = dipY;
            this._updateLine();
            this.bangVisible = (Math.floor(now / BANG_BLINK_MS) & 1) !== 0;
            this.bangY = dipY - 8;

            if (elapsed >= DIP_DURATION_MS) {
                this.bangVisible = false;
                this.missCount++;
                if (this.missCount >= MAX_MISSES) {
                    this.caught = false;
                    this.enterResult();
                } else {
                    this.enterMissFeedback();
                }
            }
        }

        if (this.state === STATE_MISS) {
            if (now - this.stateMs >= MISS_FEEDBACK_MS) {
                this.enterCast();
            }
        }

        if (this.state === STATE_REELING) {
            if (this.flyMs) {
                const el = now - this.flyMs;
                const prog = el >= FLY_MS ? 100 : Math.floor(el * 100 / FLY_MS);
                const by = BOB_BASE_Y + 5 - Math.floor(12 * prog / 100);
                this.bobX = BOB_X;
                this.bobY = by;
                this._updateLine();
                const fx = LINE_X - FISH[this.fishIdx].bodyW + 2;
                const fy = BOB_BASE_Y + 8 - Math.floor(14 * prog / 100);
                this._placeFish(fx, fy);
                if (prog >= 100) this.enterResult();
                return;
            }
            if (this.escapeMs) {
                const el = now - this.escapeMs;
                const prog = el >= ESCAPE_MS ? 100 : Math.floor(el * 100 / ESCAPE_MS);
                const fx = LINE_X + 20 + Math.floor(60 * prog / 100);
                const fy = BOB_BASE_Y + 10 + Math.floor(8 * prog / 100);
                this._placeFish(fx, fy);
                this.bobX = BOB_X;
                this.bobY = BOB_BASE_Y + 5 - Math.floor(4 * prog / 100);
                this._updateLine();
                if (prog >= 100) {
                    this._hideFish();
                    this.enterResult();
                }
                return;
            }

            const dt = now - this.depleteMs;
            if (dt >= DEPLETE_INTERVAL_MS) {
                this.depleteMs += DEPLETE_INTERVAL_MS;
                this.tension -= FISH[this.fishIdx].strength;
                if (this.tension < 0) this.tension = 0;
                this._updateTensionBar();
                this._updateReelStatus();
                if (this.tension <= 0) {
                    this.caught = false;
                    this.escapeMs = now;
                    this.statusText = '鱼跑了！';
                    Audio2.beep(400, 80);
                }
            }
            if (this.escapeMs) return;

            const phase = Math.floor(now / 40) % 16;
            const bx = BOB_X + (phase < 8 ? phase : 16 - phase) - 4;
            const by = BOB_BASE_Y + 5 + (Math.floor(now / 80) % 5);
            this.bobX = bx;
            this.bobY = by;
            this._updateLine();

            const amp = FISH[this.fishIdx].strength * 2;
            const fph = Math.floor(now / 50) % (amp * 2 + 1);
            const fx = LINE_X - FISH[this.fishIdx].bodyW + 2 - amp + fph;
            const fy = by + 4 + (Math.floor(now / 100) % 3);
            this._placeFish(fx, fy);
        }

        if (this.state === STATE_RESULT) {
            if (this.resultHandled) return;
            if (now - this.resultMs >= RESULT_MS) {
                this.resultHandled = true;
                this.advanceRound();
            }
        }
    },

    handleKey(key) {
        if (key !== LV_KEY_ENTER) return false;

        if (this.state === STATE_CASTING) {
            this.enterWaiting();
            return true;
        }

        if (this.state === STATE_DIP) {
            this.bangVisible = false;
            this.enterReeling();
            return true;
        }

        if (this.state === STATE_REELING) {
            if (this.flyMs || this.escapeMs) return true;
            this.tension += ENTER_FORCE;
            if (this.tension > TENSION_MAX) this.tension = TENSION_MAX;
            this._updateTensionBar();
            this._updateReelStatus();
            if (this.tension >= TENSION_MAX) {
                this.caught = true;
                this.statusText = '上钩成功！';
                this.flyMs = T.get();
            }
            return true;
        }

        if (this.state === STATE_RESULT) {
            if (this.resultHandled) return true;
            this.resultHandled = true;
            this.advanceRound();
            return true;
        }

        return false;
    },

    stop() { },

    getScore() {
        return Math.floor(this.totalScore / FT_ROUNDS);
    },

    draw() {
        Draw.clear(CLR_BG);

        Draw.text('得分:' + this.totalScore, 2, 2, CLR_SPEAKER);
        Draw.textCenter('钓鱼 ' + (this.round + 1) + ' / ' + FT_ROUNDS, 0, 2, 160, CLR_SPEAKER);
        Draw.text('错:' + this.missCount + '/' + MAX_MISSES, 116, 2, CLR_SPEAKER);

        for (let i = 0; i < 3; i++) {
            Draw.hline(this.ripples[i], WATER_Y + 14 + i * 18, SCREEN_W - 8, CLR_PANEL);
        }

        Draw.vline(LINE_X, WATER_Y, this.lineLen, CLR_SPEAKER);

        Draw.fillCircle(this.bobX + BOB_W / 2, this.bobY + BOB_H / 2, BOB_W / 2, CLR_SPEAKER);
        Draw.strokeCircle(this.bobX + BOB_W / 2, this.bobY + BOB_H / 2, BOB_W / 2, CLR_PANEL, 1);

        if (this.bangVisible) {
            Draw.textCenter('!', this.bobX + 2, this.bangY, CLR_DANGER);
        }

        if (this.fishVisible) {
            const f = FISH[this.fishIdx];
            Draw.fillRect(this.fishX, this.fishY, f.bodyW, f.bodyH, CLR_SPEAKER);
            Draw.fillRect(this.fishX - 3, this.fishY, 3, f.bodyH, CLR_SPEAKER);
            Draw.fillCircle(this.fishX + f.bodyW - 3 + 1, this.fishY + 1 + 1, 1, CLR_PANEL);
        }

        Draw.textCenter(this.statusText, 0, STATUS_Y, SCREEN_W, CLR_SPEAKER);

        if (this.showTensionFlag) {
            Draw.text('张力', 2, STATUS_Y + 14, CLR_SPEAKER);
            Draw.fillRect(TENSION_BAR_X, TENSION_BAR_Y, TENSION_BAR_W, TENSION_BAR_H, CLR_SPEAKER);
            Draw.fillRect(TENSION_BAR_X + 1, TENSION_BAR_Y + 1, this.tensionW, TENSION_BAR_H - 2, this.tensionColor);
        }

        if (this.resultText !== '') {
            Draw.textCenter(this.resultText, 0, RESULT_Y, SCREEN_W, CLR_TEXT);
        }
    },
};
