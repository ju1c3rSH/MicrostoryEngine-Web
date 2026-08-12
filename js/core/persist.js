/* persist.js - 基于 Cookie 的持久化（persist.c 移植）
 *
 * - 存档 / 通关标记：cookie 键 sav_s{series}e{ep} / clr_s{series}e{ep}
 *   （含 magic/rec_ver/series/episode/title/code_hash 校验，脚本重编后自动失效）
 * - 开机问候计数：cookie 键 greet（初值 5，缺失视为初值）
 * - 静音：cookie 键 mute
 */

const PERSIST_REC_MAGIC = 'MSVS';
const PERSIST_REC_VER = 1;
const PERSIST_TITLE_LEN = 32;
const PERSIST_GREET_INITIAL = 5;
const PERSIST_SAVE_RECORD_MAX = 640;

const Persist = {
    _get(name) {
        const m = document.cookie.match('(?:^|;\\s*)' + name + '=([^;]*)');
        return m ? decodeURIComponent(m[1]) : null;
    },
    _set(name, value) {
        /* 30 天过期；path=/ 保证各页面共享 */
        const d = new Date();
        d.setTime(d.getTime() + 30 * 24 * 3600 * 1000);
        document.cookie = name + '=' + encodeURIComponent(value) +
            '; expires=' + d.toUTCString() + '; path=/';
    },
    _erase(name) {
        document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    },

    _key(prefix, series, episode) {
        return prefix + '_s' + series + 'e' + episode;
    },

    /* 标题匹配（对齐 C 侧定长比较语义） */
    _titleMatches(stored, title) {
        const t = (title || '').padEnd(PERSIST_TITLE_LEN, '\0').slice(0, PERSIST_TITLE_LEN);
        return stored === t;
    },

    /* 记录校验；通过返回 engine 存档对象，失败返回 null */
    _recValidate(obj, series, episode, title, codeHash) {
        if (!obj || obj.magic !== PERSIST_REC_MAGIC) return null;
        if (obj.recVer !== PERSIST_REC_VER) return null;
        if (obj.series !== series || obj.episode !== episode) return null;
        if (!this._titleMatches(obj.title, title)) return null;
        if (obj.codeHash !== codeHash) return null;
        return obj.engineSave;
    },

    /* 存档存在且校验通过 */
    hasSave(series, episode, title, codeHash) {
        const raw = this._get(this._key('sav', series, episode));
        if (!raw) return false;
        try {
            return this._recValidate(JSON.parse(raw), series, episode, title, codeHash) !== null;
        } catch (e) {
            return false;
        }
    },

    /* 写存档：engineSave 为 engine.serialize() 结果（JSON 可序列化对象） */
    saveWrite(series, episode, title, codeHash, engineSave) {
        const rec = {
            magic: PERSIST_REC_MAGIC,
            recVer: PERSIST_REC_VER,
            series, episode,
            title: (title || '').padEnd(PERSIST_TITLE_LEN, '\0').slice(0, PERSIST_TITLE_LEN),
            codeHash,
            engineSave,
        };
        this._set(this._key('sav', series, episode), JSON.stringify(rec));
    },

    /* 读存档：成功返回 engineSave 对象；无/失效返回 null（并清除损坏记录） */
    saveRead(series, episode, title, codeHash) {
        const raw = this._get(this._key('sav', series, episode));
        if (!raw) return null;
        try {
            const es = this._recValidate(JSON.parse(raw), series, episode, title, codeHash);
            if (es) return es;
        } catch (e) { /* fallthrough */ }
        this.saveErase(series, episode);
        return null;
    },

    saveErase(series, episode) {
        this._erase(this._key('sav', series, episode));
    },

    /* 通关标记 */
    isCleared(series, episode) {
        return this._get(this._key('clr', series, episode)) === '1';
    },
    setCleared(series, episode, cleared) {
        if (cleared) this._set(this._key('clr', series, episode), '1');
        else this._erase(this._key('clr', series, episode));
    },

    /* 开机问候计数 */
    getGreetCount() {
        const v = this._get('greet');
        if (v === null) return PERSIST_GREET_INITIAL;
        const n = parseInt(v, 10);
        return isNaN(n) ? PERSIST_GREET_INITIAL : n;
    },
    setGreetCount(n) {
        this._set('greet', String(n));
    },

    /* 静音 */
    getMute() {
        return this._get('mute') === '1';
    },
    setMute(m) {
        this._set('mute', m ? '1' : '0');
    },
};
