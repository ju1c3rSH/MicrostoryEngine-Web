/* about_screen.js - 关于画面（about_screen.c 移植） */

const AboutScreen = {
    active: false,
    lines: [
        'MicroStory Ngin Prev',
        '测试版本，后续将支持全平台',
        'MicroStory-Web v1.0.0',
        '西红柿炒鸡蛋赠',
        '~2026.8 于湛江THO02',
    ],

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
