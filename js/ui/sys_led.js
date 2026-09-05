/* sys_led.js - 机身左上角状态灯（#sys-led 驱动）
 *
 * 三态纯色常亮（沿用外壳直角实色无动画规范，仅切 background）：
 *   idle  待机绿  #7DA520 —— 标题 / 设置 / 关于
 *   play  游戏中红 #B33A3A —— SCR_GAME（含暂停/小游戏/CG/弹窗期间）
 *   error 错误琥珀 #C8A838（取 CLR_WARN，不开新色）—— Eng.action === ACT_ERROR
 * 优先级 error > play > idle，由 resolve() 纯函数判定。
 *
 * 扩展：register(name, color) 注册新状态 + 改 resolve() 映射即可，
 * 例如存档失效、音频未解锁等未来状态，无需动调用方。
 */

const SysLed = {
    _states: {
        idle: '#7DA520',
        play: '#B33A3A',
        error: '#C8A838',
    },
    _cur: 'idle',
    _el: null,

    /* 绑定机身灯节点；无元素时静默早退（沿用 mute-btn 模式，无头测试不崩） */
    init() {
        try {
            this._el = document.getElementById('sys-led');
        } catch (e) {
            this._el = null;
        }
        this.tick();
    },

    /* 注册/覆盖一个状态的颜色（扩展口） */
    register(name, color) {
        if (!name || !color) return;
        this._states[String(name)] = String(color);
    },

    /* 切换到指定状态（未知名忽略） */
    set(name) {
        if (!this._states.hasOwnProperty(name)) return;
        this._cur = name;
        const el = this._el;
        if (!el) return;
        el.className = 'sys-led-' + name;
        try { el.setAttribute('data-state', name); } catch (e) { /* ignore */ }
        /* 内联色保证 register 的自定义色即时生效，class 供 CSS 兜底 */
        try { el.style.background = this._states[name]; } catch (e) { /* ignore */ }
    },

    cur() { return this._cur; },

    /* 纯函数：按当前全局状态判定灯色（优先级 error > play > idle） */
    resolve() {
        try {
            if (typeof Eng !== 'undefined' && Eng && Eng.action === ACT_ERROR) return 'error';
            if (typeof ScreenManager !== 'undefined' && ScreenManager.current === SCR_GAME) return 'play';
        } catch (e) { /* 全局未就绪时按待机处理 */ }
        return 'idle';
    },

    /* 每帧调用一次（main.js frame() 尾部），状态变化时才写 DOM */
    tick() {
        const next = this.resolve();
        if (next !== this._cur) this.set(next);
    },
};
