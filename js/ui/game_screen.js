/* game_screen.js - 剧情游戏画面（game_screen.c 移植） */

const SPEAKER_H = 12;
const TEXT_Y = 14;
const TEXT_H = 68;
const TEXT_W = SCREEN_W - PANEL_PAD * 2;
const CHOICE_Y0 = 16;
const CHOICE_H = 14;
const ARROW_X = SCREEN_W - PANEL_PAD - 12 - 80;
const ARROW_Y = 84;
const NOTIFY_Y = 118;
const TYPEWRITER_INTERVAL_MS = 60;
const NOTIFY_DURATION_MS = 1500;
const LINE_SPACE = 3;
const LINE_H = 14 + LINE_SPACE;

const GS_IDLE = 0;
const GS_TEXT_ANIM = 1;
const GS_TEXT_DONE = 2;
const GS_CHOICE = 3;
const GS_PAUSE = 4;
const GS_CG_SHOWING = 5;

const PAUSE_MENU = ['继续游戏', '保存存档', '读取存档', '删除存档'];

const GameScreen = {
    state: GS_IDLE,
    fullText: '',
    revealChars: 0,
    lastTickMs: 0,
    selChoice: 0,
    choiceCnt: 0,
    speakerCount: 0,

    prevProps: [],
    propCount: 0,
    propDefs: [],

    metaValid: false,
    metaSeries: 0,
    metaEpisode: 0,
    metaTitle: '',
    metaHash: 0,
    hasSave: false,

    notifyText: '',
    notifyEndMs: 0,

    pauseSel: 0,
    prevState: GS_IDLE,

    textScroll: 0,
    curBgmIdx: 0xFF,

    bgmTracks: [],
    cgList: [],
    cgCanvas: null,

    active: false,

    /* ---------- 资源设置（main.c start_slot_story 调用） ---------- */
    setPropInfo(defs, count) {
        this.propCount = Math.min(count, MAX_PROPS);
        this.propDefs = [];
        this.prevProps = [];
        for (let i = 0; i < this.propCount; i++) {
            this.propDefs.push({ ...defs[i] });
            this.prevProps.push(defs[i].default_val);
        }
    },
    setSpeakerCount(count) { this.speakerCount = count; },
    setStoryResources(bgmTracks) { this.bgmTracks = bgmTracks || []; },
    setCgResources(cgList) { this.cgList = cgList || []; },

    setStoryMeta(series, episode, title, codeHash) {
        this.metaValid = !!title;
        this.metaSeries = series;
        this.metaEpisode = episode;
        this.metaTitle = title || '';
        this.metaHash = codeHash;
        this.hasSave = this.metaValid &&
            Persist.hasSave(series, episode, this.metaTitle, codeHash);
    },

    resetPropTrack() {
        for (let i = 0; i < this.propCount; i++) {
            this.prevProps[i] = Eng.propGet(i);
        }
    },

    /* ---------- 状态 ---------- */
    show() {
        this.active = true;
        this.curBgmIdx = 0xFF;
        this.cgCanvas = null;
    },
    hide() {
        this.active = false;
    },
    isActive() { return this.active; },
    isPaused() { return this.state === GS_PAUSE; },
    isCgActive() { return this.state === GS_CG_SHOWING; },
    getSelectedChoice() { return this.selChoice; },
    getPauseSel() { return this.pauseSel; },

    _spkName(eng) {
        const spk = eng.curSpk;
        if (spk < this.speakerCount && eng.strings[spk]) return eng.strings[spk];
        return '???';
    },

    _updatePauseProps() {
        const lines = [];
        for (let i = 0; i < this.propCount && i < 4; i++) {
            lines.push(this.propDefs[i].name + ': ' + Eng.propGet(i) + '/' + this.propDefs[i].max);
        }
        return lines;
    },

    update(eng) {
        /* ── 音乐切换 ── */
        if (eng.curBgm !== this.curBgmIdx) {
            this.curBgmIdx = eng.curBgm;
            if (eng.curBgm === 0xFF) {
                Audio2.stop();
            } else if (eng.curBgm < this.bgmTracks.length && this.bgmTracks[eng.curBgm]) {
                Audio2.play(this.bgmTracks[eng.curBgm]);
            }
        }

        /* ── 属性变化提示 ── */
        for (let i = 0; i < this.propCount; i++) {
            const cur = Eng.propGet(i);
            const prev = this.prevProps[i];
            if (cur !== prev) {
                const delta = cur - prev;
                this.notifyText = this.propDefs[i].name + ' ' + (delta >= 0 ? '+' : '') + delta;
                this.notifyEndMs = T.get() + NOTIFY_DURATION_MS;
                break;
            }
        }
        for (let i = 0; i < this.propCount; i++) this.prevProps[i] = Eng.propGet(i);

        if (eng.action === ACT_WAIT_CG) {
            this.state = GS_CG_SHOWING;
            this._showCg(eng.curCgId, eng.curText);
            return;
        }

        if (eng.action === ACT_WAIT_CLICK) {
            this.state = GS_TEXT_ANIM;
            this.fullText = eng.curText || '';
            this.revealChars = 0;
            this.lastTickMs = T.get();
            this.textScroll = 0;
        } else         if (eng.action === ACT_WAIT_CHOICE) {
            this.state = GS_CHOICE;
            this.choiceCnt = eng.choiceCount();
            this.selChoice = 0;
            this.choiceChangeMs = T.get();
        } else if (eng.action === ACT_END) {
            this._hideCg();
            this.state = GS_IDLE;
            this.notifyText = '';
        } else if (eng.action === ACT_ERROR) {
            this._hideCg();
            this.state = GS_IDLE;
            this.notifyText = 'ERROR: Script error';
        }
    },

    /* ---------- 打字机 ---------- */
    tick() {
        const now = T.get();

        if (this.state === GS_TEXT_ANIM) {
            if (now - this.lastTickMs < TYPEWRITER_INTERVAL_MS) return;
            this.lastTickMs = now;
            const next = utf8Next(this.fullText, this.revealChars);
            if (next > this.revealChars) this.revealChars = next;
            if (!this.fullText[this.revealChars] || this.revealChars >= this.fullText.length) {
                this.state = GS_TEXT_DONE;
            }
        }

        if (this.notifyEndMs && now - this.notifyEndMs >= 0) {
            this.notifyEndMs = 0;
            this.notifyText = '';
        }
    },

    /* ---------- 按键 ---------- */
    handleKey(lvKey) {
        if (this.state === GS_CG_SHOWING) {
            if (lvKey === LV_KEY_ENTER) {
                this._hideCg();
                this.state = GS_IDLE;
                return true;
            }
            return false;
        }

        if (this.state === GS_TEXT_ANIM) {
            if (lvKey === LV_KEY_ENTER) {
                this.revealChars = this.fullText.length;
                this.state = GS_TEXT_DONE;
                return false;
            }
            return false;
        }

        if (this.state === GS_TEXT_DONE) {
            if (lvKey === LV_KEY_ENTER) {
                this.state = GS_IDLE;
                return true;
            }
            if (lvKey === LV_KEY_UP || lvKey === LV_KEY_LEFT) {
                const limit = this._textHeight() - TEXT_H;
                if (limit > 0) {
                    this.textScroll -= 16;
                    if (this.textScroll < 0) this.textScroll = 0;
                }
                return false;
            }
            if (lvKey === LV_KEY_DOWN || lvKey === LV_KEY_RIGHT) {
                const limit = this._textHeight() - TEXT_H;
                if (limit > 0) {
                    this.textScroll += 16;
                    if (this.textScroll > limit) this.textScroll = limit;
                }
                return false;
            }
            return false;
        }

        if (this.state === GS_CHOICE) {
            if (lvKey === LV_KEY_UP) {
                if (this.selChoice > 0) {
                    this.selChoice--;
                    this.choiceChangeMs = T.get();
                }
                return true;
            }
            if (lvKey === LV_KEY_DOWN) {
                if (this.selChoice < this.choiceCnt - 1) {
                    this.selChoice++;
                    this.choiceChangeMs = T.get();
                }
                return true;
            }
            if (lvKey === LV_KEY_ENTER) return true;
            return false;
        }

        if (this.state === GS_PAUSE) {
            if (lvKey === LV_KEY_ESC) {
                this.exitPause();
                return true;
            }
            if (lvKey === LV_KEY_UP || lvKey === LV_KEY_LEFT) {
                if (this.pauseSel > 0) this.pauseSel--;
                return true;
            }
            if (lvKey === LV_KEY_DOWN || lvKey === LV_KEY_RIGHT) {
                if (this.pauseSel < 3) this.pauseSel++;
                return true;
            }
            return false;
        }

        return false;
    },

    /* ---------- 暂停 ---------- */
    enterPause() {
        if (this.state === GS_TEXT_ANIM) {
            this.revealChars = this.fullText.length;
            this.state = GS_TEXT_DONE;
        }
        if (this.state !== GS_TEXT_DONE && this.state !== GS_CHOICE) return;
        this.prevState = this.state;
        this.state = GS_PAUSE;
        this.pauseSel = 0;
    },

    exitPause() {
        if (this.state === GS_PAUSE) this.state = this.prevState;
    },

    resume() { this.exitPause(); },

    /* ---------- 存档 ---------- */
    save(eng) {
        if (!this.metaValid) return;
        const es = eng.serialize();
        Persist.saveWrite(this.metaSeries, this.metaEpisode, this.metaTitle, this.metaHash, es);
        this.hasSave = true;
        this.notifyText = '已保存';
        this.notifyEndMs = T.get() + NOTIFY_DURATION_MS;
        this.exitPause();
    },

    load(eng) {
        if (!this.metaValid) { this.exitPause(); return; }
        /* 故事重编后的旧存档：明确提示失效，而不是笼统显示「无存档」 */
        const peek = Persist.savePeek(this.metaSeries, this.metaEpisode, this.metaTitle, this.metaHash);
        if (peek.status === 'stale') {
            Persist.saveErase(this.metaSeries, this.metaEpisode);
            this.hasSave = false;
            this.notifyText = '存档已失效，已清除';
            this.notifyEndMs = T.get() + NOTIFY_DURATION_MS;
            this.exitPause();
            return;
        }
        const es = Persist.saveRead(this.metaSeries, this.metaEpisode, this.metaTitle, this.metaHash);
        if (es && eng.deserialize(es)) {
            this.hasSave = true;
            this.exitPause();
            this.update(eng);
            this.resetPropTrack();
            return;
        }
        this.notifyText = '无存档';
        this.notifyEndMs = T.get() + NOTIFY_DURATION_MS;
        this.exitPause();
    },

    deleteSave() {
        if (this.metaValid) Persist.saveErase(this.metaSeries, this.metaEpisode);
        this.hasSave = false;
        this.notifyText = '已删除存档';
        this.notifyEndMs = T.get() + NOTIFY_DURATION_MS;
        this.exitPause();
    },

    /* ---------- UI 显隐（小游戏切换用） ---------- */
    hideAllUi() {
        this._uiVisible = false;
    },
    showAllUi() {
        this._uiVisible = true;
    },

    /* ---------- CG ---------- */
    _showCg(cgId, caption) {
        this.cgCanvas = null;
        if (cgId >= this.cgList.length || !this.cgList[cgId]) return;
        this.cgCanvas = decodeCg(this.cgList[cgId].rle);
        this.cgCaption = caption || '';
    },
    _hideCg() {
        this.cgCanvas = null;
        this.cgCaption = '';
    },

    /* ---------- 绘制 ---------- */
    _textHeight() {
        const lines = Draw.wrapText(this.fullText.slice(0, this.revealChars), TEXT_W);
        return lines.length * LINE_H;
    },

    draw() {
        Draw.clear(CLR_BG);

        if (this.state === GS_CG_SHOWING && this.cgCanvas) {
            Draw.image(this.cgCanvas, 0, 0);
            Draw.fillRect(0, 0, SCREEN_W, 2, 0x152205);
            Draw.fillRect(0, SCREEN_H - 2, SCREEN_W, 2, 0x152205);
            Draw.fillRect(0, 0, 2, SCREEN_H, 0x152205);
            Draw.fillRect(SCREEN_W - 2, 0, 2, SCREEN_H, 0x152205);
            Draw.textClip(this.cgCaption, PANEL_PAD, SCREEN_H - 14, SCREEN_W - PANEL_PAD * 2, CLR_TEXT);
            return;
        }

        if (this._uiVisible === false) return;

        /* 说话人栏 */
        if (this.state === GS_IDLE) return;

        const eng = Eng;

        if (this.state === GS_PAUSE) {
            this._drawPause();
            return;
        }

        /* 说话人栏 */
        Draw.fillRect(0, 0, SCREEN_W, SPEAKER_H, CLR_SPEAKER);
        let spkText = '';
        if (this.state === GS_TEXT_ANIM || this.state === GS_TEXT_DONE || this.state === GS_CHOICE) {
            spkText = this._spkName(eng);
        }
        Draw.textCenter(spkText, 0, 1, SCREEN_W, CLR_CHOICE_T);

        if (this.state === GS_CHOICE) {
            /* 选项：溢出文字选中时恒速循环滚动（LVGL SCROLL_CIRCULAR 行为：两端停顿+匀速），未选中裁剪 */
            const vw = TEXT_W - 8;
            const clipX = PANEL_PAD + 4;
            for (let i = 0; i < this.choiceCnt; i++) {
                const y = CHOICE_Y0 + i * CHOICE_H;
                const text = eng.choiceText(i);
                const tw = Draw.measure(text);
                const over = tw > vw;
                if (i === this.selChoice) {
                    Draw.fillRect(PANEL_PAD, y, TEXT_W, CHOICE_H, 0x000000);
                    let off = 0;
                    if (over) off = Draw.marqueeOffset(tw - vw, T.get() - (this.choiceChangeMs || 0));
                    Draw.textScrolled(text, clipX, y + 1, vw, off, 0xFFFFFF);
                } else {
                    Draw.textScrolled(text, clipX, y + 1, vw, 0, 0x000000);
                }
            }
            return;
        }

        if (this.state === GS_TEXT_ANIM || this.state === GS_TEXT_DONE) {
            const shown = this.fullText.slice(0, this.revealChars);
            const lines = Draw.wrapText(shown, TEXT_W);
            const scroll = this.textScroll;
            let y = TEXT_Y - scroll;
            for (const line of lines) {
                if (y + 14 > TEXT_Y) Draw.text(line, PANEL_PAD, y, CLR_TEXT);
                y += LINE_H;
            }

            /* 提示箭头 */
            if (this.state === GS_TEXT_DONE) {
                const vis = (Math.floor(T.get() / 500) % 2) === 0;
                if (vis) Draw.text('按 A 键继续', ARROW_X, ARROW_Y, CLR_SPEAKER);
            }
        }

        /* 属性变化提示 */
        if (this.notifyText) {
            Draw.text(this.notifyText, PANEL_PAD, NOTIFY_Y, CLR_NOTIFY);
        }
    },

    _drawPause() {
        Draw.fillRect(0, 0, SCREEN_W, SCREEN_H, CLR_PANEL);
        Draw.textCenter('—— 暂停 ——', 0, 4, SCREEN_W, CLR_SPEAKER);

        const propLines = this._updatePauseProps();
        for (let i = 0; i < propLines.length; i++) {
            Draw.textClip(propLines[i], PANEL_PAD, 22 + i * 14, SCREEN_W - PANEL_PAD * 2, CLR_TEXT);
        }

        for (let i = 0; i < 4; i++) {
            const buf = (i === this.pauseSel ? '> ' : '  ') + PAUSE_MENU[i];
            Draw.text(buf, PANEL_PAD + 12, 80 + i * 12, CLR_TEXT);
        }
    },
};
