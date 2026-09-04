/* settings_screen.js - 设置画面（settings_screen.c 移植）
 *
 * 三个标签页：
 *   管理    - 静音 / BGM·音效音量 / 全屏 / 存档备份导入导出
 *   已安装  - 故事槽位列表（A 删除，B 返回）
 *   SD     - 导入 .story 文件（Web 版用文件选择器模拟 SD 卡）
 */

const TAB_COUNT = 3;
const TAB_MANAGE = 0;
const TAB_INSTALLED = 1;
const TAB_SD = 2;
const TAB_NAMES = ['管理', '已安装', 'SD'];
/* 管理页行 */
const MANAGE_ROW_MUTE = 0;
const MANAGE_ROW_BGM = 1;
const MANAGE_ROW_SFX = 2;
const MANAGE_ROW_FULLSCREEN = 3;
const MANAGE_ROW_EXPORT = 4;
const MANAGE_ROW_IMPORT = 5;
const MANAGE_ROW_BACK = 6;
const MANAGE_ROW_COUNT = 7;
const VISIBLE_ROWS = 6;
const MAX_ITEMS = 14;

const SettingsScreen = {
    active: false,
    tab: TAB_MANAGE,
    sel: 0,
    itemCount: 0,
    scrollOfs: 0,
    lines: new Array(MAX_ITEMS).fill(''),

    show() {
        this.active = true;
        this.showTab(TAB_MANAGE);
    },
    hide() {
        this.active = false;
    },
    isActive() {
        return this.active;
    },
    refresh() {
        if (this.active) this.showTab(this.tab);
    },

    showTab(tab) {
        this.tab = tab;
        this.sel = 0;
        this.scrollOfs = 0;
        if (tab === TAB_MANAGE) this._showManage();
        else if (tab === TAB_INSTALLED) this._showInstalled();
        else this._showSd();
    },

    _showManage() {
        this.sel = 0;
        this.itemCount = MANAGE_ROW_COUNT;
    },

    _showInstalled() {
        this.itemCount = 0;
        const slots = StoryStore.list();
        for (let i = 0; i < StoryStore.slotMax(); i++) {
            const slot = slots[i];
            if (slot) {
                this.lines[this.itemCount] = (this.itemCount === this.sel ? '>' : ' ') +
                    ' [' + i + '] ' + slot.story.title + ' ' + slot.story.subtitle;
            } else {
                this.lines[this.itemCount] = (this.itemCount === this.sel ? '>' : ' ') +
                    ' [' + i + '] (空)';
            }
            this.itemCount++;
        }
        if (this.itemCount < MAX_ITEMS) {
            this.lines[this.itemCount] = '  [返回]';
            this.itemCount++;
        }
        this._clampScroll();
    },

    _showSd() {
        this.itemCount = 0;
        this.sel = 0;
        this.lines[0] = '  A 选择 .story 文件导入';
        this.itemCount = 1;
        if (this.itemCount < MAX_ITEMS) {
            this.lines[this.itemCount] = '  [返回]';
            this.itemCount++;
        }
        this._clampScroll();
    },

    _clampScroll() {
        if (this.sel >= this.itemCount) this.sel = this.itemCount - 1;
        if (this.sel < 0) this.sel = 0;
        const v = VISIBLE_ROWS;
        if (this.itemCount < v) this.scrollOfs = 0;
        else {
            if (this.sel < this.scrollOfs) this.scrollOfs = this.sel;
            if (this.sel >= this.scrollOfs + v) this.scrollOfs = this.sel - v + 1;
            if (this.scrollOfs + v > this.itemCount) this.scrollOfs = this.itemCount - v;
            if (this.scrollOfs < 0) this.scrollOfs = 0;
        }
    },

    handleKey(lvKey) {
        if (!this.active) return false;

        if (Dialog.isActive()) {
            Dialog.handleKey(lvKey);
            const res = Dialog.getResult();
            if (res >= 0) {
                Dialog.hide();
                if (res === 0 && this.tab === TAB_INSTALLED) {
                    StoryStore.deleteSlot(this.sel);
                    this.sel = 0;
                }
                this.showTab(this.tab);
            }
            return true;
        }

        if (lvKey === LV_KEY_LEFT) {
            if (this._onVolumeRow()) { this._adjustVolume(-1); return true; }
            this.showTab(this.tab === TAB_MANAGE ? TAB_COUNT - 1 : this.tab - 1);
            return true;
        }
        if (lvKey === LV_KEY_RIGHT) {
            if (this._onVolumeRow()) { this._adjustVolume(1); return true; }
            this.showTab((this.tab + 1) % TAB_COUNT);
            return true;
        }
        if (lvKey === LV_KEY_ESC) {
            this.hide();
            return false;
        }

        if (this.tab === TAB_MANAGE) {
            if (lvKey === LV_KEY_UP) {
                if (this.sel > 0) this.sel--;
                return true;
            }
            if (lvKey === LV_KEY_DOWN) {
                if (this.sel + 1 < MANAGE_ROW_COUNT) this.sel++;
                return true;
            }
            if (lvKey === LV_KEY_ENTER) this._activateManage();
            return true;
        }

        if (this.tab === TAB_INSTALLED) {
            const total = StoryStore.slotMax() + 1;
            if (lvKey === LV_KEY_UP) {
                if (this.sel > 0) { this.sel--; this._showInstalled(); }
                return true;
            }
            if (lvKey === LV_KEY_DOWN) {
                if (this.sel + 1 < total) { this.sel++; this._showInstalled(); }
                return true;
            }
            if (lvKey === LV_KEY_ENTER) {
                const slots = StoryStore.list();
                if (this.sel < StoryStore.slotMax()) {
                    const slot = slots[this.sel];
                    if (slot) {
                        Audio2.dialogPrompt();
                        Dialog.show('删除此故事？', '是|否', DIALOG_HORIZONTAL);
                    }
                } else {
                    this.showTab(TAB_MANAGE);
                }
                return true;
            }
            return true;
        }

        if (this.tab === TAB_SD) {
            if (lvKey === LV_KEY_UP) {
                if (this.sel > 0) { this.sel--; this._showSd(); }
                return true;
            }
            if (lvKey === LV_KEY_DOWN) {
                if (this.sel + 1 < this.itemCount) { this.sel++; this._showSd(); }
                return true;
            }
            if (lvKey === LV_KEY_ENTER) {
                if (this.sel === 0) {
                    /* 触发文件选择器（用户手势内允许） */
                    StoryStore.pickImport().then(ok => {
                        if (ok) this.showTab(TAB_INSTALLED);
                    });
                } else {
                    this.showTab(TAB_MANAGE);
                }
                return true;
            }
            return true;
        }

        return false;
    },

    _onVolumeRow() {
        return this.tab === TAB_MANAGE &&
            (this.sel === MANAGE_ROW_BGM || this.sel === MANAGE_ROW_SFX);
    },

    _adjustVolume(dir) {
        const isBgm = this.sel === MANAGE_ROW_BGM;
        const cur = isBgm ? Audio2.bgmVol : Audio2.sfxVol;
        const v = Math.max(0, Math.min(AUDIO_VOL_MAX, cur + dir));
        if (v === cur) return;
        if (isBgm) {
            Audio2.setVolumes(v, Audio2.sfxVol);
            Persist.setBgmVol(v);
        } else {
            Audio2.setVolumes(Audio2.bgmVol, v);
            Persist.setSfxVol(v);
        }
    },

    _activateManage() {
        switch (this.sel) {
            case MANAGE_ROW_MUTE: {
                const m = !Audio2.muted;
                Audio2.setMuted(m);
                Persist.setMute(m);
                break;
            }
            case MANAGE_ROW_BGM:
            case MANAGE_ROW_SFX:
                this._adjustVolume(1);
                break;
            case MANAGE_ROW_FULLSCREEN:
                this._toggleFullscreen();
                break;
            case MANAGE_ROW_EXPORT:
                this._exportSaves();
                break;
            case MANAGE_ROW_IMPORT:
                this._importSaves();
                break;
            case MANAGE_ROW_BACK:
                this.hide();
                break;
        }
    },

    _toggleFullscreen() {
        try {
            if (document.fullscreenElement) {
                document.exitFullscreen();
            } else if (document.documentElement.requestFullscreen) {
                const p = document.documentElement.requestFullscreen();
                if (p && typeof p.catch === 'function') p.catch(() => { /* 被拒绝则忽略 */ });
            }
        } catch (e) { /* iframe 等环境不支持全屏 */ }
    },

    /* 导出全部存档/通关记录为 JSON 备份文件（防止清 Cookie 丢进度） */
    _exportSaves() {
        const json = Persist.exportBackup();
        let n = 0;
        try { n = JSON.parse(json).records.length; } catch (e) { /* ignore */ }
        try {
            const blob = new Blob([json], { type: 'application/json' });
            const a = document.createElement('a');
            const d = new Date();
            const pad2 = x => String(x).padStart(2, '0');
            a.href = URL.createObjectURL(blob);
            a.download = 'microstory-saves-' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '.json';
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 5000);
            Dialog.show('导出存档', '已导出 ' + n + ' 条记录|请查看浏览器下载', DIALOG_VERTICAL);
        } catch (e) {
            Dialog.show('导出存档', '导出失败：' + (e && e.message ? e.message : e), DIALOG_VERTICAL);
        }
    },

    /* 从备份文件恢复存档（与已安装故事逐一比对后才写入） */
    _importSaves() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.onchange = () => {
            const file = input.files && input.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                const r = Persist.importBackup(String(reader.result), (s, e) => {
                    const slot = StoryStore.findBySeriesEpisode(s, e);
                    return slot ? { title: slot.story.title, hash: slot.story.hash } : null;
                });
                StoryStore.refreshSaveFlags();
                if (!r.ok) {
                    Dialog.show('导入存档', '失败：' + r.reason, DIALOG_VERTICAL);
                    return;
                }
                const parts = ['已恢复 ' + r.applied + ' 条记录'];
                if (r.stale) parts.push(r.stale + ' 条与故事不匹配');
                if (r.missing) parts.push(r.missing + ' 条对应故事未安装');
                if (r.skipped) parts.push(r.skipped + ' 条无效已跳过');
                Dialog.show('导入存档', parts.join('|'), DIALOG_VERTICAL);
            };
            reader.onerror = () => Dialog.show('导入存档', '读取文件失败', DIALOG_VERTICAL);
            reader.readAsText(file);
        };
        input.click();
    },

    draw() {
        Draw.clear(CLR_BG);

        /* 标签 + 下划线 */
        const tabW = Math.floor((SCREEN_W - PANEL_PAD * 2) / TAB_COUNT);
        for (let i = 0; i < TAB_COUNT; i++) {
            const x = PANEL_PAD + i * tabW;
            Draw.textCenter(TAB_NAMES[i], x, 4, tabW, CLR_TEXT);
            Draw.fillRect(x, 19, tabW, 1, i === this.tab ? CLR_SPEAKER : CLR_BORDER);
        }
        Draw.fillRect(PANEL_PAD, 22, SCREEN_W - PANEL_PAD * 2, 1, CLR_BORDER);

        if (this.tab === TAB_MANAGE) {
            const rowY = i => 24 + i * 13;
            const selOpt = i => (i === this.sel ? '> ' : '  ');
            const selClr = i => (i === this.sel ? CLR_CHOICE_S : CLR_TEXT);
            const drawRow = (i, str) => Draw.text(str, PANEL_PAD, rowY(i), selClr(i), { size: 12 });
            drawRow(0, selOpt(0) + '静音：' + (Audio2.muted ? '是' : '否'));
            for (let i = 1; i <= 2; i++) {
                const isBgm = i === MANAGE_ROW_BGM;
                const vol = isBgm ? Audio2.bgmVol : Audio2.sfxVol;
                drawRow(i, selOpt(i) + (isBgm ? '音乐音量' : '音效音量'));
                for (let c = 0; c < AUDIO_VOL_MAX; c++) {
                    Draw.fillRect(PANEL_PAD + 78 + c * 6, rowY(i) + 3, 4, 6,
                                  c < vol ? CLR_SPEAKER : CLR_BORDER);
                }
            }
            const fs = document.fullscreenElement ? '按 A 退出' : '按 A 进入';
            drawRow(3, selOpt(3) + '全屏：' + fs);
            drawRow(4, selOpt(4) + '导出存档');
            drawRow(5, selOpt(5) + '导入存档');
            drawRow(6, selOpt(6) + '[返回标题]');
            Draw.textCenter('↑↓选择 ←→调节 A确定', 0, SCREEN_H - 13, SCREEN_W, CLR_SPEAKER, 12);
            return;
        }

        /* 条目列表（带滚动） */
        const start = this.scrollOfs;
        const end = Math.min(start + VISIBLE_ROWS, this.itemCount);
        for (let i = start; i < end; i++) {
            Draw.text(this.lines[i], PANEL_PAD, 24 + (i - start) * 14, CLR_TEXT);
        }

        const hint = this.tab === TAB_INSTALLED
            ? '←→ 切换标签  ↑↓ 选择  A 删除  B 返回'
            : '←→ 切换标签  ↑↓ 选择  A 导入  B 返回';
        Draw.textCenter(hint, 0, SCREEN_H - 20, SCREEN_W, CLR_SPEAKER);
    },
};
