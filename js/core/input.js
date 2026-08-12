/* input.js - 键盘/鼠标/触屏 → LVGL 键码，虚拟按键
 *
 * 键位映射（对应硬件按钮）：
 *   ↑ ↓ ← →        → 方向键 / WASD
 *   A（ENTER）      → Enter / Space / Z / 单击/点按画面
 *   B（ESC）        → Esc / Backspace / X
 */

const Input = {
    _queue: [],

    init(canvas) {
        document.addEventListener('keydown', e => {
            const k = this._mapKey(e);
            if (k !== null) {
                e.preventDefault();
                this._push(k);
            }
        });

        /* 单击 = A */
        canvas.addEventListener('pointerdown', e => {
            Audio2.ensure();
            this._push(LV_KEY_ENTER);
        });

            /* 阻止触屏双击缩放 */
        canvas.addEventListener('touchstart', e => e.preventDefault(), { passive: false });

        /* 虚拟按键（触屏设备）：按住方向键自动连发，A/B 单击 */
        this._initVirtualPad();
    },

    _initVirtualPad() {
        const map = { 'vpad-up': LV_KEY_UP, 'vpad-down': LV_KEY_DOWN,
                      'vpad-left': LV_KEY_LEFT, 'vpad-right': LV_KEY_RIGHT,
                      'vpad-a': LV_KEY_ENTER, 'vpad-b': LV_KEY_ESC };
        for (const [id, key] of Object.entries(map)) {
            const el = document.getElementById(id);
            if (!el) continue;
            const isDir = id.indexOf('-a') < 0 && id.indexOf('-b') < 0;
            el.addEventListener('pointerdown', e => {
                e.preventDefault();
                Audio2.ensure();
                this._push(key);
                if (isDir) {
                    el._rep = setInterval(() => this._push(key), 120);
                }
            });
            el.addEventListener('pointerup', () => { if (el._rep) { clearInterval(el._rep); el._rep = null; } });
            el.addEventListener('pointerleave', () => { if (el._rep) { clearInterval(el._rep); el._rep = null; } });
            el.addEventListener('pointercancel', () => { if (el._rep) { clearInterval(el._rep); el._rep = null; } });
            /* 触屏点击虚拟键时不再冒泡到 canvas 触发 A */
            el.addEventListener('touchstart', e => e.stopPropagation(), { passive: false });
        }
    },

    _mapKey(e) {
        switch (e.key) {
            case 'ArrowUp': case 'w': case 'W': return LV_KEY_UP;
            case 'ArrowDown': case 's': case 'S': return LV_KEY_DOWN;
            case 'ArrowLeft': case 'a': case 'A': return LV_KEY_LEFT;
            case 'ArrowRight': case 'd': case 'D': return LV_KEY_RIGHT;
            case 'Enter': case ' ': case 'z': case 'Z': return LV_KEY_ENTER;
            case 'Escape': case 'Backspace': case 'x': case 'X': return LV_KEY_ESC;
            default: return null;
        }
    },

    _push(k) {
        this._queue.push(k);
    },

    /* 主循环每帧取走按键队列 */
    drain() {
        if (this._queue.length === 0) return null;
        return this._queue.shift();
    },
    drainAll() {
        const q = this._queue;
        this._queue = [];
        return q;
    },
};
