/* settings_screen.js - 设置画面（settings_screen.c 移植）
 *
 * 三个标签页：
 *   管理    - 静音开关（A 切换）
 *   已安装  - 故事槽位列表（A 删除，B 返回）
 *   SD     - 导入 .story 文件（Web 版用文件选择器模拟 SD 卡）
 */

const TAB_COUNT = 3;
const TAB_MANAGE = 0;
const TAB_INSTALLED = 1;
const TAB_SD = 2;
const TAB_NAMES = ['管理', '已安装', 'SD'];
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
        this.itemCount = 1;
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
            this.showTab(this.tab === TAB_MANAGE ? TAB_COUNT - 1 : this.tab - 1);
            return true;
        }
        if (lvKey === LV_KEY_RIGHT) {
            this.showTab((this.tab + 1) % TAB_COUNT);
            return true;
        }
        if (lvKey === LV_KEY_ESC) {
            this.hide();
            return false;
        }

        if (this.tab === TAB_MANAGE) {
            if (lvKey === LV_KEY_ENTER) {
                const m = !Audio2.muted;
                Audio2.setMuted(m);
                Persist.setMute(m);
            }
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
            Draw.text('静音：' + (Audio2.muted ? '是' : '否'), PANEL_PAD, 24, CLR_TEXT);
            Draw.textCenter('←→ 切换标签  A 静音  B 返回', 0, SCREEN_H - 20, SCREEN_W, CLR_SPEAKER);
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
