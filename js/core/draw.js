/* draw.js - 160×128 逻辑分辨率 Canvas 绘制 API
 *
 * 替代 LVGL 对象系统：屏幕按需绘制（每帧或脏标记），
 * 提供 fillRect/strokeRect/circle/text/image 等原语。
 * 颜色统一用 0xRRGGBB。
 */

const Draw = {
    ctx: null,          /* 160×128 主画布 2D context */
    img: null,          /* 离屏缓存：CG 等全屏图 */
    fontName: 'MiSans, "PingFang SC", "Microsoft YaHei", sans-serif',
    fontBase: '14px ',

    attach(canvas) {
        this.ctx = canvas.getContext('2d');
        this.img = null;
        this.ctx.imageSmoothingEnabled = false;
    },

    clear(color) {
        const c = this.ctx;
        c.fillStyle = hexColor(color);
        c.fillRect(0, 0, SCREEN_W, SCREEN_H);
    },

    /* 填充矩形 */
    fillRect(x, y, w, h, color) {
        const c = this.ctx;
        c.fillStyle = hexColor(color);
        c.fillRect(Math.floor(x), Math.floor(y), Math.ceil(w), Math.ceil(h));
    },

    /* 带透明度填充（alpha 0-255） */
    fillRectA(x, y, w, h, color, alpha) {
        const c = this.ctx;
        c.globalAlpha = alpha / 255;
        c.fillStyle = hexColor(color);
        c.fillRect(Math.floor(x), Math.floor(y), Math.ceil(w), Math.ceil(h));
        c.globalAlpha = 1;
    },

    /* 边框矩形 */
    strokeRect(x, y, w, h, color, lineW = 1) {
        const c = this.ctx;
        c.strokeStyle = hexColor(color);
        c.lineWidth = lineW;
        c.strokeRect(Math.floor(x) + 0.5, Math.floor(y) + 0.5, Math.floor(w), Math.floor(h));
    },

    /* 填充圆 */
    fillCircle(cx, cy, r, color) {
        const c = this.ctx;
        c.fillStyle = hexColor(color);
        c.beginPath();
        c.arc(cx, cy, r, 0, Math.PI * 2);
        c.fill();
    },

    /* 空心圆 */
    strokeCircle(cx, cy, r, color, lineW = 1) {
        const c = this.ctx;
        c.strokeStyle = hexColor(color);
        c.lineWidth = lineW;
        c.beginPath();
        c.arc(cx, cy, r, 0, Math.PI * 2);
        c.stroke();
    },

    /* 水平线 / 垂直线 */
    hline(x, y, w, color, lineW = 1) { this.fillRect(x, y, w, lineW, color); },
    vline(x, y, h, color, lineW = 1) { this.fillRect(x, y, lineW, h, color); },

    /* 文本测量 */
    measure(text) {
        this.ctx.font = this.fontBase + this.fontName;
        return this.ctx.measureText(text).width;
    },

    /* 文本绘制。opts: {align: 'left'|'center'|'right', size: px} */
    text(str, x, y, color, opts = {}) {
        const c = this.ctx;
        const size = opts.size || 14;
        c.font = size + 'px ' + this.fontName;
        c.fillStyle = hexColor(color);
        c.textBaseline = 'top';
        c.textAlign = opts.align || 'left';
        c.fillText(str, x, y);
    },

    /* 居中文本 */
    textCenter(str, x, y, w, color, size) {
        this.text(str, x + w / 2, y, color, { align: 'center', size });
    },

    /* 绘制离屏图像 */
    image(img, x, y) {
        this.ctx.drawImage(img, Math.floor(x), Math.floor(y));
    },

    /* 绘制缩放图像 */
    imageScaled(img, x, y, w, h) {
        this.ctx.drawImage(img, x, y, w, h);
    },

    /* 文本自动换行（近似 LVGL WRAP）：按宽度断行 */
    wrapText(text, maxW, size = 14) {
        const lines = [];
        let line = '';
        for (const ch of text) {
            const t = line + ch;
            this.ctx.font = size + 'px ' + this.fontName;
            if (this.ctx.measureText(t).width > maxW && line) {
                lines.push(line);
                line = ch;
            } else {
                line = t;
            }
        }
        if (line) lines.push(line);
        return lines;
    },
};
