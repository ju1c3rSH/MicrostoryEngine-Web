/* util.js - 工具函数（对应 C 侧常量/辅助） */

const SCREEN_W = 160;
const SCREEN_H = 128;
const PANEL_PAD = 8;

const CLR_BG       = 0x9BBD30;
const CLR_PANEL    = 0xA8CA38;
const CLR_OVERLAY  = 0x000000;
const CLR_SPEAKER  = 0x152205;
const CLR_TEXT     = 0x1A2E08;
const CLR_CHOICE_N = 0xA8CA38;
const CLR_CHOICE_S = 0x152205;
const CLR_CHOICE_T = 0x9BBD30;
const CLR_ARROW    = 0x152205;
const CLR_NOTIFY   = 0x6B9A10;
const CLR_BOX      = 0xA8CA38;
const CLR_BORDER   = 0x7DA520;
const CLR_WARN     = 0xC8A838;
const CLR_DANGER   = 0xB33A3A;

const COLOR_BG       = CLR_BG;
const COLOR_PANEL    = CLR_PANEL;
const COLOR_OVERLAY  = CLR_OVERLAY;
const COLOR_SPEAKER  = CLR_SPEAKER;
const COLOR_TEXT     = CLR_TEXT;
const COLOR_CHOICE_N = CLR_CHOICE_N;
const COLOR_CHOICE_S = CLR_CHOICE_S;
const COLOR_CHOICE_T = CLR_CHOICE_T;
const COLOR_ARROW    = CLR_ARROW;
const COLOR_NOTIFY   = CLR_NOTIFY;
const COLOR_BOX      = CLR_BOX;
const COLOR_BORDER   = CLR_BORDER;
const COLOR_WARN     = CLR_WARN;
const COLOR_DANGER   = CLR_DANGER;

/* RGB565/ARGB 颜色转 '#rrggbb' 字符串 */
function hexColor(v) {
    let s = (v & 0xFFFFFF).toString(16);
    while (s.length < 6) s = '0' + s;
    return '#' + s;
}

/* rgb565(15/16/11bit 标准布局) 转 css 颜色 */
function rgb565ToCss(v) {
    const r = ((v >> 11) & 0x1F) << 3;
    const g = ((v >> 5) & 0x3F) << 2;
    const b = (v & 0x1F) << 3;
    return 'rgb(' + r + ',' + g + ',' + b + ')';
}

/* 引擎需要：返回随机字节（对应 hal_random） */
function halRandom() {
    return (Math.random() * 256) | 0;
}

/* C rand() 风格种子随机（部分小游戏 srand(lv_tick) 用） */
function createCrand(seed) {
    let state = (seed >>> 0) || 1;
    return {
        next() {
            /* MSVC 风格 LCG（与 ESP32 newlib rand 行为相近，足够还原随机性） */
            state = (state * 214013 + 2531011) >>> 0;
            return (state >> 16) & 0x7FFF;
        },
        range(min, max) {
            return min + (this.next() % (max - min + 1));
        }
    };
}

/* 单调时钟，等价 lv_tick_get()（ms） */
const T = {
    _t: 0,
    tick: 0,
    set(t) { this.tick = t; },
    get() { return this.tick; },
    elaps(prev) { return this.tick - prev; }
};

/* FNV-1a 32（对应 main.c fnv1a32，用于存档 code_hash 校验） */
function fnv1a32(bytes) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < bytes.length; i++) {
        h ^= bytes[i];
        h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
}

/* UTF-8 字符序列推进：s[pos] 处字符的下一字节位置 */
function utf8Next(s, pos) {
    if (pos >= s.length) return pos;
    pos++;
    while (pos < s.length && (s.charCodeAt(pos) & 0xC0) === 0x80) pos++;
    return pos;
}

/* LV_KEY 键值（与 lvgl 一致） */
const LV_KEY_UP    = 0x11;
const LV_KEY_DOWN  = 0x12;
const LV_KEY_RIGHT = 0x13;
const LV_KEY_LEFT  = 0x14;
const LV_KEY_ESC   = 0x1B;
const LV_KEY_ENTER = 0x0D;

const MAX_CHOICES = 6;
const MAX_PROPS = 8;
const TEXT_BUF_SIZE = 512;
const CALL_STACK_SIZE = 8;
