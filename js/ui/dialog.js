/* dialog.js - 对话框（dialog.c 移植） */

const DIALOG_VERTICAL = 0;
const DIALOG_HORIZONTAL = 1;
const DIALOG_MAX_OPTIONS = 4;
const DIALOG_BOX_W = 132;

const Dialog = {
    active: false,
    layout: DIALOG_VERTICAL,
    sel: 0,
    optionCount: 0,
    result: -1,
    optText: [],

    title: '',
    boxX: 0, boxY: 0, boxH: 0,

    show(title, options, layout) {
        this.active = true;
        this.sel = 0;
        this.layout = layout;
        this.result = -1;
        this.title = title || '';

        this.optionCount = 0;
        this.optText = [];
        for (const part of options.split('|')) {
            if (part && this.optionCount < DIALOG_MAX_OPTIONS) {
                this.optText.push(part.slice(0, 31));
                this.optionCount++;
            }
        }

        let boxH;
        if (layout === DIALOG_HORIZONTAL) boxH = 54;
        else boxH = 26 + this.optionCount * 16;
        if (boxH > SCREEN_H - 16) boxH = SCREEN_H - 16;
        this.boxX = Math.floor((SCREEN_W - DIALOG_BOX_W) / 2);
        this.boxY = Math.floor((SCREEN_H - boxH) / 2);
        this.boxH = boxH;
    },

    hide() {
        this.active = false;
        this.result = -1;
    },

    isActive() { return this.active; },
    getResult() { return this.result; },

    handleKey(lvKey) {
        if (!this.active) return false;
        if (lvKey === LV_KEY_UP || lvKey === LV_KEY_LEFT) {
            if (this.sel > 0) this.sel--;
            return true;
        }
        if (lvKey === LV_KEY_DOWN || lvKey === LV_KEY_RIGHT) {
            if (this.sel + 1 < this.optionCount) this.sel++;
            return true;
        }
        if (lvKey === LV_KEY_ENTER) {
            this.result = this.sel;
            return true;
        }
        if (lvKey === LV_KEY_ESC) {
            this.result = this.optionCount - 1;
            return true;
        }
        return true;
    },

    draw() {
        if (!this.active) return;

        /* 遮罩（style_overlay: 黑 130/255 透明度） */
        Draw.fillRectA(0, 0, SCREEN_W, SCREEN_H, CLR_OVERLAY, 130);

        /* 对话框（style_dialog_box: 面板底 + 边框） */
        Draw.fillRect(this.boxX, this.boxY, DIALOG_BOX_W, this.boxH, CLR_BOX);
        Draw.strokeRect(this.boxX, this.boxY, DIALOG_BOX_W, this.boxH, CLR_BORDER, 1);

        /* 标题 */
        Draw.textCenter(this.title, this.boxX, this.boxY + 6, DIALOG_BOX_W, CLR_SPEAKER);

        /* 选项（label 本身无裁剪：长文本会漫出框外，此处按槽位裁剪） */
        for (let i = 0; i < this.optionCount; i++) {
            let x, y, w, h, align;
            if (this.layout === DIALOG_HORIZONTAL) {
                const gap = 8;
                const totalW = DIALOG_BOX_W - PANEL_PAD * 2;
                const btnW = Math.floor((totalW - gap) / 2);
                x = this.boxX + PANEL_PAD + i * (btnW + gap);
                y = this.boxY + this.boxH - 22;
                w = btnW; h = 16;
                align = 'center';
            } else {
                x = this.boxX + PANEL_PAD;
                y = this.boxY + 28 + i * 16;
                w = DIALOG_BOX_W - PANEL_PAD * 2; h = 14;
                align = 'left';
            }
            const text = (i === this.sel ? '>' : ' ') + this.optText[i];
            const color = i === this.sel ? CLR_CHOICE_S : CLR_TEXT;
            if (align === 'center') {
                Draw.textCenterClip(text, x, y, w, color);
            } else {
                Draw.textClip(text, x, y, w, color);
            }
        }
    },
};
