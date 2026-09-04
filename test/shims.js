/* shims.js - 无头(Node)环境的最小浏览器垫片,供 integration.js 使用
 *
 * 覆盖仓库 js/ 实际用到的浏览器 API(经全局引用扫描确认):
 *   document(cookie/createElement/getElementById/body/documentElement/fonts/
 *            fullscreenElement/exitFullscreen/addEventListener)
 *   window(= globalThis 别名 + innerWidth/innerHeight/devicePixelRatio/addEventListener)
 *   canvas 2d context(Proxy:未知方法一律 no-op,measureText/createImageData 等给合理返回值)
 *   localStorage(内存 Map,可注入配额超限)
 *   navigator(vibrate/getGamepads)、AudioContext(no-op)、requestAnimationFrame(只计数不调度)
 *   atob/btoa(Node 自带,直接透传)、TextDecoder、Blob/URL.createObjectURL、alert、FileReader 存根
 *
 * 不提供 fetch:StoryLoader 会走 EMBEDDED_STORIES 兜底,正好覆盖 file:// 内嵌数据路径。
 * 'use strict' 无需:本文件与集成脚本同以 CommonJS 运行。
 */

/* ---------------- 事件目标混入:最小 add/remove/dispatch ---------------- */

function eventify(obj, eventName) {
    const listeners = new Map(); /* type -> Set<fn> */
    obj.__listeners = listeners;
    obj.addEventListener = function (type, fn /*, opts 忽略 */) {
        if (typeof fn !== 'function') return;
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type).add(fn);
    };
    obj.removeEventListener = function (type, fn) {
        const s = listeners.get(type);
        if (s) s.delete(fn);
    };
    /* 派发:同步依次调用监听器;事件对象补充 type/target 与 preventDefault 等空实现 */
    obj.dispatchEvent = function (ev) {
        const e = Object.assign({
            type: '',
            target: obj,
            currentTarget: obj,
            defaultPrevented: false,
            preventDefault() { this.defaultPrevented = true; },
            stopPropagation() {},
            stopImmediatePropagation() {},
        }, ev || {});
        e.type = ev && ev.type ? ev.type : '';
        const s = listeners.get(e.type);
        if (s) for (const fn of [...s]) fn(e);
        /* 也支持 onxxx 属性句柄(如 input.onchange) */
        const prop = 'on' + e.type;
        if (typeof obj[prop] === 'function') obj[prop](e);
        return !e.defaultPrevented;
    };
    obj.__fire = function (type, props) {
        return obj.dispatchEvent(Object.assign({ type }, props || {}));
    };
    return obj;
}

/* ---------------- 内存 Cookie 罐 ----------------
 * 语义对齐浏览器:
 *   - 赋值 "name=value; expires=...; path=/" → 设置(name/value 取第一个 ; 前的键值对)
 *   - expires 为过去时间(或 max-age<=0)→ 删除该键
 *   - 读取返回 "k1=v1; k2=v2"(值保持写入时的原样,不做编解码)
 * Persist 用 encodeURIComponent 编码值后写入、读出后 decodeURIComponent,
 * 因此罐子必须原样存取,不能自行解码。
 */
function createCookieJar() {
    const jar = new Map(); /* name -> 原样 value */
    return {
        get cookie() {
            const parts = [];
            for (const [k, v] of jar) parts.push(k + '=' + v);
            return parts.join('; ');
        },
        set cookie(str) {
            if (typeof str !== 'string') return;
            const semi = str.indexOf(';');
            const pair = semi < 0 ? str : str.slice(0, semi);
            const eq = pair.indexOf('=');
            if (eq < 0) return;
            const name = pair.slice(0, eq).trim();
            if (!name) return;
            const value = pair.slice(eq + 1);
            const attrs = semi < 0 ? '' : str.slice(semi + 1);

            /* 过去时间 → 删除(Persist._erase 的路径) */
            const mEx = /(?:^|;)\s*expires\s*=\s*([^;]+)/i.exec(attrs);
            if (mEx) {
                const t = Date.parse(mEx[1].trim());
                if (!Number.isNaN(t) && t <= Date.now()) { jar.delete(name); return; }
            }
            const mAge = /(?:^|;)\s*max-age\s*=\s*(-?\d+)/i.exec(attrs);
            if (mAge && parseInt(mAge[1], 10) <= 0) { jar.delete(name); return; }
            jar.set(name, value);
        },
        clear() { jar.clear(); },
        has(name) { return jar.has(name); },
        getRaw(name) { return jar.has(name) ? jar.get(name) : null; },
        size() { return jar.size; },
    };
}

/* ---------------- localStorage 垫片 ----------------
 * 内存 Map 实现;__quotaFail = true 时 setItem 抛 QuotaExceededError,
 * 用于测试 Persist 的 cookie 兜底与 StoryStore.deleteSlot 的持久化降级。
 */
class MemStorage {
    constructor() {
        this._m = new Map();
        this.__quotaFail = false;
    }
    getItem(k) {
        k = String(k);
        return this._m.has(k) ? this._m.get(k) : null;
    }
    setItem(k, v) {
        if (this.__quotaFail) {
            const e = new Error('模拟存储配额已满');
            e.name = 'QuotaExceededError';
            e.code = 22;
            throw e;
        }
        this._m.set(String(k), String(v));
    }
    removeItem(k) { this._m.delete(String(k)); }
    clear() { this._m.clear(); }
    key(i) {
        const keys = [...this._m.keys()];
        return i >= 0 && i < keys.length ? keys[i] : null;
    }
    get length() { return this._m.size; }
}

/* ---------------- DOM 元素垫片 ---------------- */

let __blobSeq = 0;

function makeElement(tag, byId) {
    tag = String(tag).toLowerCase();
    const el = {};
    el.tagName = tag.toUpperCase();
    el.children = [];
    el.parentNode = null;
    el.style = {};
    el.dataset = {};
    el.attributes = {};
    el.files = null;          /* <input type=file> 用 */
    el.value = '';
    el.disabled = false;
    el.textContent_ = '';
    el.width = 0;
    el.height = 0;

    /* className 与 classList 双向同步 */
    const cls = new Set();
    Object.defineProperty(el, 'className', {
        get() { return [...cls].join(' '); },
        set(v) {
            cls.clear();
            String(v || '').split(/\s+/).filter(Boolean).forEach(c => cls.add(c));
        },
    });
    el.classList = {
        add(...cs) { cs.forEach(c => cls.add(c)); },
        remove(...cs) { cs.forEach(c => cls.delete(c)); },
        toggle(c, force) {
            const want = force === undefined ? !cls.has(c) : !!force;
            if (want) cls.add(c); else cls.delete(c);
            return want;
        },
        contains(c) { return cls.has(c); },
    };

    /* id 赋值时自动登记,getElementById 可查(与浏览器一致的行为子集) */
    let _id = '';
    Object.defineProperty(el, 'id', {
        get() { return _id; },
        set(v) {
            _id = String(v || '');
            if (byId && _id) byId.set(_id, el);
        },
    });

    Object.defineProperty(el, 'textContent', {
        get() { return el.textContent_; },
        set(v) { el.textContent_ = String(v); },
    });
    Object.defineProperty(el, 'innerHTML', {
        get() { return el.textContent_; },
        set(v) { el.textContent_ = String(v); },
    });

    /* 树操作 */
    el.appendChild = function (child) {
        if (child && child.parentNode) el._removeChild(child.parentNode, child);
        child.parentNode = el;
        el.children.push(child);
        return child;
    };
    el._removeChild = function (parent, child) {
        const i = parent.children.indexOf(child);
        if (i >= 0) parent.children.splice(i, 1);
        if (child.parentNode === parent) child.parentNode = null;
    };
    el.removeChild = function (child) { el._removeChild(el, child); return child; };
    el.remove = function () { if (el.parentNode) el._removeChild(el.parentNode, el); };
    el.insertBefore = function (node, ref) {
        const i = ref ? el.children.indexOf(ref) : -1;
        node.parentNode = el;
        if (i < 0) el.children.push(node); else el.children.splice(i, 0, node);
        return node;
    };

    /* 事件/交互 */
    eventify(el);
    el.click = function () { el.__fire('click', { target: el }); };
    el.focus = function () {};
    el.blur = function () {};
    el.setPointerCapture = function () {};
    el.releasePointerCapture = function () {};
    el.scrollIntoView = function () {};

    /* 查询:测试垫片不真正布局,返回 null/0 即可 */
    el.closest = function () { return null; };
    el.querySelector = function () { return null; };
    el.querySelectorAll = function () { return []; };
    el.getBoundingClientRect = function () {
        return { left: 0, top: 0, right: 144, bottom: 144, width: 144, height: 144, x: 0, y: 0 };
    };

    /* 属性 */
    el.setAttribute = function (k, v) { el.attributes[k] = String(v); };
    el.getAttribute = function (k) { return k in el.attributes ? el.attributes[k] : null; };
    el.removeAttribute = function (k) { delete el.attributes[k]; };
    el.hasAttribute = function (k) { return k in el.attributes; };

    /* canvas:挂 2d 上下文(Proxy 垫片) */
    if (tag === 'canvas') {
        el.getContext = function (type) {
            if (String(type) === '2d') {
                if (!el.__ctx2d) el.__ctx2d = makeCtx2d(el);
                return el.__ctx2d;
            }
            return null;
        };
        el.toDataURL = function () { return 'data:image/png;base64,'; };
    }
    return el;
}

/* ---------------- Canvas 2D 上下文垫片 ----------------
 * 用 Proxy:已知方法给"合理返回值",其余一切方法调用都降级为 no-op(返回 undefined)。
 * 属性写入(fillStyle/font/...)直接存储。
 */
function makeCtx2d(canvas) {
    const base = {
        canvas,
        fillStyle: '#000000',
        strokeStyle: '#000000',
        lineWidth: 1,
        lineCap: 'butt',
        lineJoin: 'miter',
        globalAlpha: 1,
        globalCompositeOperation: 'source-over',
        font: '14px sans-serif',
        textAlign: 'left',
        textBaseline: 'top',
        imageSmoothingEnabled: false,
        shadowBlur: 0,
        shadowColor: '',
        /* 文本测量:以"字符数 × 12px"近似宽度(仅用于换行/溢出判定,无视觉断言) */
        measureText(t) {
            const s = t == null ? '' : String(t);
            return { width: s.length * 12, actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 3 };
        },
        createImageData(w, h) {
            return { data: new Uint8ClampedArray(Math.max(0, w | 0) * Math.max(0, h | 0) * 4), width: w | 0, height: h | 0 };
        },
        getImageData(x, y, w, h) {
            return { data: new Uint8ClampedArray(Math.max(0, w | 0) * Math.max(0, h | 0) * 4), width: w | 0, height: h | 0 };
        },
        createLinearGradient() { return { addColorStop() {} }; },
        createRadialGradient() { return { addColorStop() {} }; },
        createConicGradient() { return { addColorStop() {} }; },
        createPattern() { return {}; },
        /* 常用绘制方法显式列出便于阅读,行为同 no-op */
        fillRect() {}, strokeRect() {}, clearRect() {},
        drawImage() {}, putImageData() {},
        beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
        arc() {}, arcTo() {}, ellipse() {}, rect() {},
        fill() {}, stroke() {}, clip() {},
        save() {}, restore() {},
        setTransform() {}, transform() {}, translate() {}, scale() {}, rotate() {},
        resetTransform() {},
        quadraticCurveTo() {}, bezierCurveTo() {},
        setLineDash() {}, getLineDash() { return []; },
        isPointInPath() { return false; },
    };
    const noopCache = new Map();
    return new Proxy(base, {
        get(t, p) {
            if (p in t) return t[p];
            /* 未知成员:缓存一个 no-op 函数返回(报告缺什么就补什么) */
            if (!noopCache.has(p)) noopCache.set(p, function () {});
            return noopCache.get(p);
        },
        set(t, p, v) { t[p] = v; return true; },
        has(t, p) { return true; },
    });
}

/* ---------------- document 垫片 ---------------- */

function createDocument(cookieJar) {
    const byId = new Map();
    const doc = {};
    eventify(doc);

    doc.documentElement = makeElement('html', byId);
    doc.body = makeElement('body', byId);
    eventify(doc.documentElement);
    eventify(doc.body);
    /* 设置页全屏开关用到(documentElement.requestFullscreen / fullscreenElement) */
    doc.documentElement.requestFullscreen = function () {
        doc.fullscreenElement = doc.documentElement;
        return Promise.resolve();
    };

    doc.readyState = 'complete';
    doc.title = 'MicroStory';
    doc.hidden = false;
    doc.visibilityState = 'visible';
    doc.fullscreenElement = null;
    doc.exitFullscreen = function () { doc.fullscreenElement = null; return Promise.resolve(); };

    /* 字体加载:boot() 会 await,直接给已完成的 Promise */
    doc.fonts = {
        load: function () { return Promise.resolve([]); },
        ready: Promise.resolve([]),
        check: function () { return true; },
    };

    doc.getElementById = function (id) { return byId.get(id) || null; };
    doc.createElement = function (tag) { return makeElement(tag, byId); };
    doc.createTextNode = function (t) { return { nodeType: 3, textContent: String(t) }; };
    doc.querySelector = function () { return null; };
    doc.querySelectorAll = function () { return []; };

    /* 预置页面元素:index.html 中的 canvas + 两个按钮 */
    const canvas = makeElement('canvas', byId);
    canvas.id = 'screen';
    canvas.width = 160;
    canvas.height = 128;
    doc.__screenCanvas = canvas;

    const padToggle = makeElement('button', byId);
    padToggle.id = 'pad-toggle';
    padToggle.className = 'pad-toggle';
    doc.__padToggle = padToggle;

    const muteBtn = makeElement('button', byId);
    muteBtn.id = 'mute-btn';
    muteBtn.className = 'mute-btn';
    doc.__muteBtn = muteBtn;

    /* document.cookie:真正可用的内存 cookie 罐 */
    Object.defineProperty(doc, 'cookie', {
        get() { return cookieJar.cookie; },
        set(v) { cookieJar.cookie = v; },
        configurable: true,
    });

    doc.__byId = byId;
    return doc;
}

/* ---------------- AudioContext 垫片 ----------------
 * 按 js/core/audio.js 实际用到的成员实现:
 *   state/resume/createGain/createOscillator/destination/currentTime,
 *   AudioParam(gain/frequency):value + setValueAtTime/linearRampToValueAtTime,
 *   节点 connect。所有"参数变化"记录在 param.__ops 供测试断言(如音量/静音正交性)。
 */
function createAudioParam(initial) {
    const param = {
        value: initial === undefined ? 0 : initial,
        __ops: [],
    };
    param.setValueAtTime = function (v /*, time */) {
        param.__ops.push({ fn: 'setValueAtTime', value: v });
        param.value = v;
        return param;
    };
    param.linearRampToValueAtTime = function (v /*, time */) {
        param.__ops.push({ fn: 'linearRampToValueAtTime', value: v });
        return param;
    };
    param.exponentialRampToValueAtTime = function (v) {
        param.__ops.push({ fn: 'exponentialRampToValueAtTime', value: v });
        return param;
    };
    param.cancelScheduledValues = function () { return param; };
    return param;
}

class AudioContextShim {
    constructor() {
        this.state = 'running';
        this.sampleRate = 44100;
        this.currentTime = 0;
        this.destination = { __node: 'destination' };
        this.__oscCount = 0;
    }
    resume() { this.state = 'running'; return Promise.resolve(); }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
    close() { return Promise.resolve(); }
    createGain() {
        return { gain: createAudioParam(1), connect() {}, disconnect() {} };
    }
    createOscillator() {
        this.__oscCount++;
        return {
            type: 'sine',
            frequency: createAudioParam(440),
            detune: createAudioParam(0),
            connect() {},
            disconnect() {},
            start() {},
            stop() {},
            onended: null,
        };
    }
    createBufferSource() {
        return { connect() {}, start() {}, stop() {}, buffer: null, onended: null };
    }
}

/* ---------------- 沙盒预置脚本(在 vm context 内最先执行) ----------------
 * - window/self 别名到 globalThis(脚本里 window.Eng 等直接可用)
 * - 确定性 Math.random(可重播种):OP_RAND 等随机分支在 CI 中可复现
 */
const PRELUDE = `
var window = globalThis;
var self = globalThis;
var __rngState = 123456789 >>> 0;
function __seedRandom(seed) { __rngState = (seed >>> 0) || 1; }
Math.random = function () {
    /* 32 位 LCG (Numerical Recipes),仅求确定性,不追求统计质量 */
    __rngState = (Math.imul(__rngState, 1664525) + 1013904223) >>> 0;
    return __rngState / 4294967296;
};
`;

/* ---------------- 组装沙盒 ----------------
 * 返回 { sandbox, cookieJar, localStorage, alerts, rafCount }
 * sandbox 即 vm.createContext 的对象,同时充当 window。
 */
function buildSandbox() {
    const cookieJar = createCookieJar();
    const localStorage = new MemStorage();
    const alerts = [];
    const sandbox = {};

    sandbox.document = createDocument(cookieJar);
    sandbox.localStorage = localStorage;
    sandbox.navigator = {
        userAgent: 'MicroStory-Headless/1.0',
        language: 'zh-CN',
        vibrate: function () { return true; },
        getGamepads: function () { return []; },
        maxTouchPoints: 0,
    };
    sandbox.AudioContext = AudioContextShim;
    sandbox.performance = {
        now: function () { return Number(process.hrtime.bigint() / 1000000n) / 1; },
        timeOrigin: Date.now(),
    };
    /* requestAnimationFrame 只计数、不调度回调 → main.js 的 rAF 主循环不会启动,
     * frame() 永远不会执行(boot() 末尾的那次调用被吞掉)。 */
    let rafCount = 0;
    sandbox.requestAnimationFrame = function () { rafCount++; return rafCount; };
    sandbox.cancelAnimationFrame = function () {};
    sandbox.__getRafCount = function () { return rafCount; };

    sandbox.alert = function (msg) { alerts.push(String(msg)); };
    sandbox.confirm = function () { return false; };
    sandbox.prompt = function () { return null; };

    sandbox.TextDecoder = TextDecoder;
    sandbox.TextEncoder = TextEncoder;
    sandbox.atob = (typeof atob === 'function') ? atob : (s) => Buffer.from(s, 'base64').toString('binary');
    sandbox.btoa = (typeof btoa === 'function') ? btoa : (s) => Buffer.from(s, 'binary').toString('base64');

    /* Blob / URL.createObjectURL:设置页「导出存档」用到 */
    sandbox.Blob = class Blob {
        constructor(parts, opts) {
            this.parts = parts || [];
            this.type = (opts && opts.type) || '';
            let n = 0;
            for (const p of this.parts) n += p.length || 0;
            this.size = n;
        }
        text() { return Promise.resolve(this.parts.join('')); }
    };
    sandbox.URL = Object.assign({}, globalThis.URL, {
        createObjectURL() { return 'blob:mock-' + (++__blobSeq); },
        revokeObjectURL() {},
    });

    /* FileReader:仅被跳过的文件选择器路径使用,给最小存根防患未然 */
    sandbox.FileReader = class FileReader {
        constructor() {
            this.result = null;
            this.onload = null;
            this.onerror = null;
        }
        readAsArrayBuffer() {}
        readAsText() {}
    };

    /* 定时器:透传 Node 实现(settings 导出存档的 setTimeout 等) */
    sandbox.setTimeout = setTimeout;
    sandbox.clearTimeout = clearTimeout;
    sandbox.setInterval = setInterval;
    sandbox.clearInterval = clearInterval;

    sandbox.console = console;
    sandbox.Math = Math;

    /* window 本体也是事件目标:resize/orientationchange/fullscreenchange 等监听 */
    eventify(sandbox);

    sandbox.__seedRandom = null; /* 由预置脚本覆盖(函数声明提升到 globalThis) */

    return { sandbox, cookieJar, localStorage, alerts };
}

module.exports = {
    PRELUDE,
    buildSandbox,
    createCookieJar,
    MemStorage,
    makeElement,
    makeCtx2d,
    eventify,
    AudioContextShim,
};
