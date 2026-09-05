/* input.js - 键盘/鼠标/触屏/实体手柄 → LVGL 键码
 *
 * 键位映射（键盘方案不改）：
 *   ↑ ↓ ← → / WASD  → 方向
 *   A（ENTER）       → Enter / Space / Z / 桌面单击 / 触屏右半区 / A 按钮
 *   B（ESC）         → Esc / Backspace / X / B 按钮
 *
 * 机身一体手柄（重构自 html5-virtual-game-controller 固定分区 + bobboteck/JoyStick 阈值思想）：
 *   - 非浮动：#touch-zone 挂载在机身 #cab-controls 内，左右分区随整机排布，不再悬浮于页面底部
 *   - 左区 144×144 D-pad：以中心为原点，滑动 ≥16px 四向判定，支持跨键滑动切向
 *   - 右区 A/B：固定斜排，支持多指同时操作
 *   - 方向键 120ms 连发，手柄始终显示，可通过右上角显隐开关切换（持久化到 localStorage）
 *   - 实体手柄（Gamepad API）与键盘共存
 */

const Input = {
    _queue: [],
    _canvas: null,
    _zone: null,
    _dpad: null,
    _dpadKeys: null,
    _padVisible: true,
    STORAGE_KEY: 'ms_pad_visible',
    _touches: new Map(),   /* pointerId → {kind:'dpad'|'a'|'b', x, y, dir, lastMs, el} */
    _gpPrev: {},
    _gpDirKey: {},
    _gpDirMs: {},

    init(canvas) {
        this._canvas = canvas;

        document.addEventListener('keydown', e => {
            const k = this._mapKey(e);
            if (k !== null) {
                e.preventDefault();
                this._push(k);
            }
        });

        // 固定手柄：桌面/移动端都显示
        this._padVisible = this._loadPadVisible();
        this._initTouchZone();
        this._initPadToggle();
        this._applyPadVisible(false);

        // 桌面：单击画面 = A（保留）
        canvas.addEventListener('pointerdown', e => {
            // 手柄开关按钮不触发游戏输入
            if (e.target.closest('#pad-toggle') || e.target.closest('#mute-btn')) return;
            // 触摸手柄已接管 pointer，此处仅桌面鼠标点击画面时生效
            if (e.pointerType === 'mouse' && e.button === 0) {
                // 若点在手柄区，不重复派发
                if (e.target.closest && e.target.closest('#touch-zone')) return;
                Audio2.ensure();
                this._push(LV_KEY_ENTER);
            }
        });

        document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
        document.addEventListener('gesturestart', e => e.preventDefault(), { passive: false });
    },

    /* ---------- 固定手柄 ---------- */

    _loadPadVisible() {
        try {
            const v = localStorage.getItem(this.STORAGE_KEY);
            if (v === '0' || v === 'false') return false;
        } catch (e) { /* ignore */ }
        return true;
    },
    _savePadVisible(v) {
        try { localStorage.setItem(this.STORAGE_KEY, v ? '1' : '0'); } catch (e) { /* ignore */ }
    },
    isPadVisible() { return this._padVisible; },

    _initPadToggle() {
        const btn = document.getElementById('pad-toggle');
        if (!btn) return;
        const update = () => {
            btn.classList.toggle('off', !this._padVisible);
            btn.textContent = this._padVisible ? '隐' : '显';
            btn.setAttribute('aria-pressed', String(this._padVisible));
            btn.title = this._padVisible ? '隐藏手柄' : '显示手柄';
        };
        update();
        btn.addEventListener('click', e => {
            e.stopPropagation();
            Audio2.ensure();
            this._padVisible = !this._padVisible;
            this._savePadVisible(this._padVisible);
            this._applyPadVisible(true);
            update();
            // 触发屏幕重算
            if (typeof fitScreen === 'function') fitScreen();
        });
        this._padToggleUpdate = update;
    },

    _applyPadVisible(animate) {
        if (!this._zone) return;
        this._zone.classList.toggle('hidden-pad', !this._padVisible);
        /* 机身按键区整行折叠，屏幕随 fitScreen 重算放大 */
        const host = document.getElementById('cab-controls');
        if (host) host.classList.toggle('controls-hidden', !this._padVisible);
        if (this._padToggleUpdate) this._padToggleUpdate();
        // 访达样式：fitScreen 会根据是否显示预留底部空间
        document.documentElement.classList.toggle('pad-hidden', !this._padVisible);
    },

    _initTouchZone() {
        const zone = document.createElement('div');
        zone.id = 'touch-zone';

        // 左：D-pad 容器
        const padLeft = document.createElement('div');
        padLeft.className = 'pad-side pad-left';
        const dpad = document.createElement('div');
        dpad.id = 'dpad';
        this._dpadKeys = {};
        const dirs = [
            ['up', LV_KEY_UP],
            ['left', LV_KEY_LEFT],
            ['center', 0],
            ['right', LV_KEY_RIGHT],
            ['down', LV_KEY_DOWN],
        ];
        for (const [name] of dirs) {
            const d = document.createElement('div');
            d.className = 'dpad-key dpad-' + name;
            d.dataset.dir = name;
            if (name !== 'center') this._dpadKeys[name] = d;
            dpad.appendChild(d);
        }
        padLeft.appendChild(dpad);
        this._dpad = dpad;

        // 右：A/B 容器（借鉴 html5-virtual-game-controller 右区 buttons 斜排）
        const padRight = document.createElement('div');
        padRight.className = 'pad-side pad-right';
        const actions = document.createElement('div');
        actions.className = 'pad-actions';
        const btnB = document.createElement('div');
        btnB.id = 'btn-b';
        btnB.className = 'vbtn vbtn-b';
        btnB.textContent = 'B';
        btnB.dataset.key = 'b';
        const btnA = document.createElement('div');
        btnA.id = 'btn-a';
        btnA.className = 'vbtn vbtn-a';
        btnA.textContent = 'A';
        btnA.dataset.key = 'a';
        actions.appendChild(btnB);
        actions.appendChild(btnA);
        padRight.appendChild(actions);

        zone.appendChild(padLeft);
        zone.appendChild(padRight);
        /* 挂载到机身按键区（整机外壳的一部分）；无外壳结构时回退到 body（无头测试） */
        const host = document.getElementById('cab-controls');
        (host || document.body).appendChild(zone);
        this._zone = zone;

        // 统一用 pointer 事件，支持多指 + 滑动切向（阈值 16px 思路来自 bobboteck/JoyStick）
        zone.addEventListener('pointerdown', e => this._onDown(e));
        zone.addEventListener('pointermove', e => this._onMove(e));
        zone.addEventListener('pointerup', e => this._onUp(e));
        zone.addEventListener('pointercancel', e => this._onUp(e));
        // 捕获后避免浏览器手势
        zone.addEventListener('pointerleave', e => {
            // 不主动清理，靠 pointerup
        });
        // 防止右键菜单
        zone.addEventListener('contextmenu', e => e.preventDefault());
    },

    _dpadCenter() {
        if (!this._dpad) return null;
        const r = this._dpad.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    },

    _dirFromDelta(dx, dy) {
        if (Math.hypot(dx, dy) < 16) return 0;
        return Math.abs(dx) > Math.abs(dy)
            ? (dx > 0 ? LV_KEY_RIGHT : LV_KEY_LEFT)
            : (dy > 0 ? LV_KEY_DOWN : LV_KEY_UP);
    },

    _onDown(e) {
        // 只处理主触点，忽略右键
        if (e.button !== 0) return;
        e.preventDefault();
        Audio2.ensure();

        const btnA = e.target.closest('#btn-a');
        if (btnA) {
            this._touches.set(e.pointerId, { kind: 'a', el: btnA, lastMs: 0 });
            btnA.classList.add('active');
            // 触觉反馈（若支持）
            if (navigator.vibrate) try { navigator.vibrate(12); } catch (_) {}
            this._push(LV_KEY_ENTER);
            try { e.target.setPointerCapture(e.pointerId); } catch (_) {}
            return;
        }
        const btnB = e.target.closest('#btn-b');
        if (btnB) {
            this._touches.set(e.pointerId, { kind: 'b', el: btnB, lastMs: 0 });
            btnB.classList.add('active');
            if (navigator.vibrate) try { navigator.vibrate(12); } catch (_) {}
            this._push(LV_KEY_ESC);
            try { e.target.setPointerCapture(e.pointerId); } catch (_) {}
            return;
        }

        // D-pad 区域（含键间缝隙）：以 pad 中心为原点做滑动判定
        const onDpad = e.target.closest('#dpad');
        if (onDpad) {
            const c = this._dpadCenter();
            if (!c) return;
            const dx = e.clientX - c.x;
            const dy = e.clientY - c.y;
            const dir = this._dirFromDelta(dx, dy);
            // 对话框激活时，任意 D-pad 按下也视为 A（方便单手）
            if (typeof Dialog !== 'undefined' && Dialog.isActive() && dir === 0) {
                // 中心轻点也视为 A
                this._touches.set(e.pointerId, { kind: 'a', el: null, lastMs: 0 });
                this._push(LV_KEY_ENTER);
                return;
            }
            const t = { kind: 'dpad', x: c.x, y: c.y, dir: dir, lastMs: performance.now(), el: null };
            this._touches.set(e.pointerId, t);
            if (dir) {
                this._push(dir);
                this._setDpadActive(dir);
                if (navigator.vibrate) try { navigator.vibrate(10); } catch (_) {}
            } else {
                this._setDpadActive(0);
            }
            try { onDpad.setPointerCapture(e.pointerId); } catch (_) {}
            return;
        }
    },

    _onMove(e) {
        const t = this._touches.get(e.pointerId);
        if (!t || t.kind !== 'dpad') return;
        e.preventDefault();
        const dx = e.clientX - t.x;
        const dy = e.clientY - t.y;
        const dir = this._dirFromDelta(dx, dy);
        if (dir !== t.dir) {
            t.dir = dir;
            t.lastMs = performance.now();
            if (dir) {
                this._push(dir);
                if (navigator.vibrate) try { navigator.vibrate(8); } catch (_) {}
            }
            this._setDpadActive(dir);
        }
    },

    _onUp(e) {
        const t = this._touches.get(e.pointerId);
        if (!t) return;
        e.preventDefault();
        if (t.kind === 'a') {
            const b = document.getElementById('btn-a');
            if (b) b.classList.remove('active');
            // 若是 D-pad 中心借用的 a，无按钮元素
            if (t.el) t.el.classList.remove('active');
        } else if (t.kind === 'b') {
            const b = document.getElementById('btn-b');
            if (b) b.classList.remove('active');
            if (t.el) t.el.classList.remove('active');
        } else if (t.kind === 'dpad') {
            this._setDpadActive(0);
        }
        this._touches.delete(e.pointerId);
        try { if (e.target.releasePointerCapture) e.target.releasePointerCapture(e.pointerId); } catch (_) {}
    },

    _setDpadActive(dir) {
        if (!this._dpadKeys) return;
        for (const [name, el] of Object.entries(this._dpadKeys)) {
            const on = (dir === LV_KEY_UP && name === 'up') ||
                       (dir === LV_KEY_DOWN && name === 'down') ||
                       (dir === LV_KEY_LEFT && name === 'left') ||
                       (dir === LV_KEY_RIGHT && name === 'right');
            el.classList.toggle('active', on);
        }
    },

    /* ---------- 每帧（主循环调用）：连发 + 实体手柄轮询 ---------- */

    tick() {
        const now = performance.now();
        for (const t of this._touches.values()) {
            if (t.kind === 'dpad' && t.dir && now - (t.lastMs || 0) >= 120) {
                t.lastMs = now;
                this._push(t.dir);
            }
        }
        this._tickGamepad(now);
    },

    _tickGamepad(now) {
        if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
        let pads;
        try { pads = navigator.getGamepads(); } catch (e) { return; }
        for (let i = 0; i < pads.length; i++) {
            const pad = pads[i];
            if (!pad || !pad.connected) continue;

            const bmap = { 0: LV_KEY_ENTER, 1: LV_KEY_ESC,
                           12: LV_KEY_UP, 13: LV_KEY_DOWN,
                           14: LV_KEY_LEFT, 15: LV_KEY_RIGHT };
            for (const [bi, key] of Object.entries(bmap)) {
                const pressed = !!(pad.buttons[bi] && pad.buttons[bi].pressed);
                const prev = this._gpPrev[key];
                if (pressed && !prev) {
                    Audio2.ensure();
                    this._push(key);
                }
                this._gpPrev[key] = pressed;
            }

            const ax = (pad.axes && pad.axes.length > 0) ? pad.axes[0] : 0;
            const ay = (pad.axes && pad.axes.length > 1) ? pad.axes[1] : 0;
            let key = 0;
            if (Math.hypot(ax, ay) >= 0.5) {
                key = Math.abs(ax) > Math.abs(ay)
                    ? (ax > 0 ? LV_KEY_RIGHT : LV_KEY_LEFT)
                    : (ay > 0 ? LV_KEY_DOWN : LV_KEY_UP);
            }
            const prevKey = this._gpDirKey[i] || 0;
            if (key !== prevKey) {
                this._gpDirKey[i] = key;
                this._gpDirMs[i] = now;
                if (key) {
                    Audio2.ensure();
                    this._push(key);
                }
            } else if (key && now - (this._gpDirMs[i] || 0) >= 120) {
                this._gpDirMs[i] = now;
                this._push(key);
            }
        }
    },

    /* ---------- 键盘（不改） ---------- */

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
