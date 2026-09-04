/* persist.js - 基于 Cookie 的持久化（persist.c 移植）
 *
 * - 存档 / 通关标记：cookie 键 sav_s{series}e{ep} / clr_s{series}e{ep}
 *   （含 magic/rec_ver/series/episode/title/code_hash 校验，脚本重编后自动失效）
 * - 开机问候计数：cookie 键 greet（初值 5，缺失视为初值）
 * - 静音/音量：cookie 键 mute / bgmvol / sfxvol
 * - 存档备份：exportBackup/importBackup（防止清 Cookie 丢进度）
 */

const PERSIST_REC_MAGIC = 'MSVS';
const PERSIST_REC_VER = 1;
const PERSIST_TITLE_LEN = 32;
const PERSIST_GREET_INITIAL = 5;
const PERSIST_SAVE_RECORD_MAX = 640;
const PERSIST_BAK_MAGIC = 'MSBAK';
const PERSIST_BAK_VER = 1;

const Persist = {
    /* Cookie 主通道 + localStorage 兜底（file:// 协议下 cookie 常不可用） */
    _get(name) {
        const m = document.cookie.match('(?:^|;\\s*)' + name + '=([^;]*)');
        if (m) return decodeURIComponent(m[1]);
        try { return localStorage.getItem('ms_c_' + name); } catch (e) { return null; }
    },
    _set(name, value) {
        /* 30 天过期；path=/ 保证各页面共享 */
        const d = new Date();
        d.setTime(d.getTime() + 30 * 24 * 3600 * 1000);
        document.cookie = name + '=' + encodeURIComponent(value) +
            '; expires=' + d.toUTCString() + '; path=/';
        try { localStorage.setItem('ms_c_' + name, value); } catch (e) { /* 隐私模式 */ }
    },
    _erase(name) {
        document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
        try { localStorage.removeItem('ms_c_' + name); } catch (e) { /* ignore */ }
    },

    _key(prefix, series, episode) {
        return prefix + '_s' + series + 'e' + episode;
    },

    /* 标题匹配（对齐 C 侧定长比较语义） */
    _titleMatches(stored, title) {
        const t = (title || '').padEnd(PERSIST_TITLE_LEN, '\0').slice(0, PERSIST_TITLE_LEN);
        return stored === t;
    },

    /* 存档记录体检：
     *   none    无存档
     *   ok      校验通过，engineSave 可用
     *   stale   记录结构完整，但 title/codeHash 与当前故事不符（脚本重编/替换故事）
     *   corrupt 记录损坏（JSON 解析失败/字段缺失）
     */
    savePeek(series, episode, title, codeHash) {
        const raw = this._get(this._key('sav', series, episode));
        if (!raw) return { status: 'none', engineSave: null };
        let obj = null;
        try { obj = JSON.parse(raw); } catch (e) { return { status: 'corrupt', engineSave: null }; }
        if (!obj || obj.magic !== PERSIST_REC_MAGIC || obj.recVer !== PERSIST_REC_VER ||
            obj.series !== series || obj.episode !== episode ||
            typeof obj.title !== 'string' || typeof obj.codeHash !== 'number' ||
            !obj.engineSave || typeof obj.engineSave !== 'object') {
            return { status: 'corrupt', engineSave: null };
        }
        if (!this._titleMatches(obj.title, title) || obj.codeHash !== codeHash) {
            return { status: 'stale', engineSave: null };
        }
        return { status: 'ok', engineSave: obj.engineSave };
    },

    /* 存档存在且校验通过 */
    hasSave(series, episode, title, codeHash) {
        return this.savePeek(series, episode, title, codeHash).status === 'ok';
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

    /* 读存档：成功返回 engineSave 对象；无/失效返回 null（并清除失效记录） */
    saveRead(series, episode, title, codeHash) {
        const peek = this.savePeek(series, episode, title, codeHash);
        if (peek.status === 'ok') return peek.engineSave;
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

    /* ---------- 音量（0~AUDIO_VOL_MAX，与 mute 正交） ---------- */
    getBgmVol() { return this._getVol('bgmvol'); },
    setBgmVol(v) { this._setVol('bgmvol', v); },
    getSfxVol() { return this._getVol('sfxvol'); },
    setSfxVol(v) { this._setVol('sfxvol', v); },
    _getVol(name) {
        const v = parseInt(this._get(name), 10);
        return (isNaN(v) || v < 0 || v > AUDIO_VOL_MAX) ? AUDIO_VOL_MAX : v;
    },
    _setVol(name, v) {
        v = Math.max(0, Math.min(AUDIO_VOL_MAX, Math.floor(v) || 0));
        this._set(name, String(v));
    },

    /* ---------- 存档备份（导出/导入） ---------- */

    /* 收集全部存档/通关记录 → 备份 JSON 字符串 */
    exportBackup() {
        const names = new Set();
        const re = /^(sav|clr)_s\d+e\d+$/;
        try {
            for (const part of (document.cookie || '').split(';')) {
                const n = part.split('=')[0].trim();
                if (re.test(n)) names.add(n);
            }
        } catch (e) { /* ignore */ }
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.indexOf('ms_c_') === 0 && re.test(k.slice(5))) names.add(k.slice(5));
            }
        } catch (e) { /* ignore */ }
        const records = [];
        for (const n of names) {
            const raw = this._get(n);
            if (!raw) continue;
            const m = n.match(/^(sav|clr)_s(\d+)e(\d+)$/);
            records.push({ type: m[1], series: parseInt(m[2], 10), episode: parseInt(m[3], 10), data: raw });
        }
        records.sort((a, b) => a.type.localeCompare(b.type) || a.series - b.series || a.episode - b.episode);
        return JSON.stringify({ magic: PERSIST_BAK_MAGIC, ver: PERSIST_BAK_VER, records });
    },

    /* 导入备份：先结构校验，再与已安装故事逐一比对（title + codeHash）。
     * storyLookup(series, episode) → {title, hash} | null，由调用方注入避免反向依赖 StoryStore。
     * 返回 {ok, reason?, total, applied, stale, missing, skipped} */
    importBackup(text, storyLookup) {
        let bak = null;
        try { bak = JSON.parse(text); } catch (e) { return { ok: false, reason: '文件不是有效的 JSON' }; }
        if (!bak || bak.magic !== PERSIST_BAK_MAGIC || bak.ver !== PERSIST_BAK_VER ||
            !Array.isArray(bak.records)) {
            return { ok: false, reason: '不是本游戏的存档备份文件' };
        }
        const r = { ok: true, total: bak.records.length, applied: 0, stale: 0, missing: 0, skipped: 0 };
        for (const rec of bak.records) {
            if (!rec || (rec.type !== 'sav' && rec.type !== 'clr') ||
                !Number.isInteger(rec.series) || !Number.isInteger(rec.episode) ||
                rec.series < 0 || rec.episode < 0) { r.skipped++; continue; }
            if (rec.type === 'clr') {
                this.setCleared(rec.series, rec.episode, true);
                r.applied++;
                continue;
            }
            let obj = null;
            try { obj = JSON.parse(rec.data); } catch (e) { /* fallthrough */ }
            if (!obj || obj.magic !== PERSIST_REC_MAGIC || obj.recVer !== PERSIST_REC_VER ||
                obj.series !== rec.series || obj.episode !== rec.episode ||
                typeof obj.title !== 'string' || typeof obj.codeHash !== 'number' ||
                !obj.engineSave || typeof obj.engineSave !== 'object') { r.skipped++; continue; }
            const st = storyLookup ? storyLookup(rec.series, rec.episode) : null;
            if (!st) { r.missing++; continue; }
            if (!this._titleMatches(obj.title, st.title) || obj.codeHash !== st.hash) { r.stale++; continue; }
            this._set(this._key('sav', rec.series, rec.episode), rec.data);
            r.applied++;
        }
        return r;
    },
};
