/* audio.js - WebAudio 蜂鸣器/音乐播放器（music_player.c 移植）
 *
 * BGM 音轨为音符序列 {freq, duration_ms, velocity}，
 * 用 OscillatorNode(square) 合成，忠实还原蜂鸣器 PWM 音色。
 */

const Audio2 = {
    _ctx: null,
    _master: null,

    _notes: null,
    _noteCount: 0,
    _noteIdx: 0,
    _noteEndMs: 0,
    _playing: false,
    _loop: false,

    _beepEndMs: 0,
    _beepActive: false,

    muted: false,

    /* 浏览器自动播放策略：首次用户交互时调用 */
    ensure() {
        if (this._ctx) {
            if (this._ctx.state === 'suspended') this._ctx.resume();
            return this._ctx;
        }
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        this._ctx = new AC();
        this._master = this._ctx.createGain();
        this._master.gain.value = this.muted ? 0 : 1;
        this._master.connect(this._ctx.destination);
        return this._ctx;
    },

    setMuted(m) {
        this.muted = m;
        if (this._master) {
            this._master.gain.setValueAtTime(m ? 0 : 1, this._ctx.currentTime);
        }
        if (typeof this.onMuteChange === 'function') this.onMuteChange(m);
    },

    /* 静音状态变化回调（页面按钮联动） */
    onMuteChange: null,

    /* 播放单个音符：freq 0 = 休止 */
    _tone(freqHz, durationMs, velocity) {
        if (!this._ctx || !this._master) return;
        if (freqHz <= 0) return;
        const t0 = this._ctx.currentTime;
        const osc = this._ctx.createOscillator();
        const g = this._ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(freqHz, t0);
        /* 原版 duty = velocity*2/255，映射到 0~0.25 音量避免刺耳 */
        const vol = Math.min(1, (velocity * 2 / 255) * 0.5);
        g.gain.setValueAtTime(vol, t0);
        g.gain.setValueAtTime(vol, t0 + durationMs / 1000 * 0.9);
        g.gain.linearRampToValueAtTime(0, t0 + durationMs / 1000);
        osc.connect(g);
        g.connect(this._master);
        osc.start(t0);
        osc.stop(t0 + durationMs / 1000 + 0.02);
    },

    /* music_play：循环播放音轨 */
    play(notes) {
        if (!notes || notes.length === 0) return;
        this._notes = notes;
        this._noteCount = notes.length;
        this._noteIdx = 0;
        this._playing = true;
        this._loop = true;
        this._noteEndMs = 0;
    },

    /* music_play_once */
    playOnce(notes) {
        if (!notes || notes.length === 0) return;
        this._notes = notes;
        this._noteCount = notes.length;
        this._noteIdx = 0;
        this._playing = true;
        this._loop = false;
        this._noteEndMs = 0;
    },

    /* music_beep */
    beep(freqHz, durationMs) {
        if (!durationMs) return;
        if (this._playing) return;
        this._beepActive = true;
        this._beepEndMs = T.get() + durationMs;
        this._tone(freqHz, durationMs, 100);
    },

    /* music_beep_default */
    beepDefault() {
        this.beep(659, 20);
    },

    /* music_dialog_prompt */
    dialogPrompt() {
        this.playOnce([
            { freq: 880, duration_ms: 80, velocity: 80 },
            { freq: 659, duration_ms: 100, velocity: 80 },
        ]);
    },

    stop() {
        this._playing = false;
        this._loop = false;
        this._notes = null;
        this._noteCount = 0;
        this._noteIdx = 0;
    },

    isPlaying() {
        return this._playing;
    },

    /* music_tick */
    tick() {
        const now = T.get();

        if (this._beepActive) {
            if (now - this._beepEndMs >= 0) {
                this._beepActive = false;
            } else {
                return;
            }
        }

        if (!this._playing) return;
        if (now - this._noteEndMs < 0) return;

        if (this._noteIdx >= this._noteCount) {
            if (this._loop) {
                this._noteIdx = 0;
                this._noteEndMs = 0;
            } else {
                this._playing = false;
                return;
            }
        }

        const n = this._notes[this._noteIdx++];
        this._tone(n.freq, n.duration_ms, n.velocity);
        this._noteEndMs = now + n.duration_ms;
    },
};
