/* about_screen.js - 关于画面（about_screen.c 移植） */

const AboutScreen = {
    active: false,
    // 基础文案由外部配置注入补充（见 js/core/app_config.js）
    _base: [
        'MicroStory Ngin Prev',
        '测试版本，后续将支持全平台',
        'MicroStory-Web v1.0.0',
        '~2026.8 于湛江THO02',
    ],
    _meta: null,

    inject(s) { if (typeof s === 'string' && s) this._meta = s; },
    setMeta(s) { this.inject(s); },

    get lines() {
        var c = this._meta || (typeof window !== 'undefined' && (window.__APP_CFG || window.__CREDIT)) || null;
        if (c) {
            var a = this._base.slice();
            a.splice(3, 0, c);
            return a;
        }
        return this._base;
    },

    show() { this.active = true; },
    hide() { this.active = false; },
    isActive() { return this.active; },

    handleKey() { return true; },

    draw() {
        Draw.clear(CLR_BG);
        Draw.textCenter('—— 关于本项目 ——', 0, 4, SCREEN_W, CLR_SPEAKER);
        let y = 22;
        for (const line of this.lines) {
            Draw.text(line, PANEL_PAD, y, CLR_TEXT);
            y += 14;
        }
        Draw.textCenter('按任意键返回', 0, SCREEN_H - 20, SCREEN_W, CLR_SPEAKER);
    },
};
// 暴露到全局供注入使用（const 不会自动挂到 window）
if (typeof window !== 'undefined') window.AboutScreen = AboutScreen;
