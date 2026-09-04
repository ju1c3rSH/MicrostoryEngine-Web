/* story_store.js - 故事槽位管理（part_manager.c 的 Web 化）
 *
 * - 内置故事来自 stories.js 内嵌数据（或 stories/ 目录 fetch）
 * - 「已安装」槽位上限 14；删除记录持久化到 localStorage（对应分区擦除）
 * - 「SD 导入」用文件选择器读取 .story 文件安装为槽位（持久化到 localStorage）
 * - easter_egg 为 Konami 彩蛋关卡，不进入故事列表（仅密技触发）
 */

const PM_SLOT_MAX = 14;
const PM_STORE_DELETED = 'ms_deleted';
const PM_STORE_IMPORTED = 'ms_imported';
const PM_EGG_FILE = 'easter_egg.story';
const PM_IMPORT_MAX_BYTES = 2 * 1024 * 1024;   /* 单个 .story 导入大小上限 */

const StoryStore = {
    slots: [],          /* [{story, thumb, imported}] 按 (series, episode) 升序 */
    _deleted: new Set(),

    async init() {
        this._deleted = new Set(JSON.parse(localStorage.getItem(PM_STORE_DELETED) || '[]'));
        const stories = await StoryLoader.loadAll();

        /* 内置故事（彩蛋关卡不显示） */
        for (const st of stories) {
            if (st.fileName === PM_EGG_FILE) continue;
            if (this._deleted.has(st.fileName)) continue;
            this.slots.push(this._makeSlot(st, false));
        }

        /* 导入的故事 */
        const imported = JSON.parse(localStorage.getItem(PM_STORE_IMPORTED) || '[]');
        for (const entry of imported) {
            if (entry.fileName === PM_EGG_FILE) continue;
            try {
                const bin = atob(entry.b64);
                const bytes = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                const st = parseStory(entry.fileName, bytes);
                if (st) this.slots.push(this._makeSlot(st, true));
            } catch (e) { console.warn('导入故事解析失败', e); }
        }

        this._sort();
    },

    _makeSlot(story, imported) {
        return {
            story,
            thumb: story.thumbnail ? decodeThumb(story.thumbnail) : null,
            imported,
        };
    },

    _sort() {
        this.slots.sort((a, b) =>
            a.story.series - b.story.series || a.story.episode - b.story.episode);
    },

    /* 按系列/集数查找槽位（存档导入校验用） */
    findBySeriesEpisode(series, episode) {
        for (const slot of this.slots) {
            if (slot.story.series === series && slot.story.episode === episode) return slot;
        }
        return null;
    },

    /* 刷新各槽位「有存档」标记（标题页据此显示「继续游戏」） */
    refreshSaveFlags() {
        for (const slot of this.slots) {
            slot.hasSave = Persist.hasSave(slot.story.series, slot.story.episode,
                                           slot.story.title, slot.story.hash);
        }
    },

    list() { return this.slots; },
    count() { return this.slots.length; },
    slotMax() { return PM_SLOT_MAX; },
    get(idx) { return this.slots[idx]; },

    /* 删除槽位（持久化，对应 pm_delete） */
    deleteSlot(idx) {
        const slot = this.slots[idx];
        if (!slot) return;
        try {
            if (slot.imported) {
                const list = JSON.parse(localStorage.getItem(PM_STORE_IMPORTED) || '[]');
                const rest = list.filter(e => e.fileName !== slot.story.fileName);
                localStorage.setItem(PM_STORE_IMPORTED, JSON.stringify(rest));
            } else {
                this._deleted.add(slot.story.fileName);
                localStorage.setItem(PM_STORE_DELETED, JSON.stringify([...this._deleted]));
            }
        } catch (e) {
            /* 配额不足等：仍删除内存槽位，持久化降级 */
            console.warn('槽位删除持久化失败', e);
        }
        this.slots.splice(idx, 1);
    },

    /* SD 导入：文件选择器读取 .story 并安装 */
    pickImport() {
        return new Promise(resolve => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.story,application/octet-stream';
            input.onchange = () => {
                const file = input.files && input.files[0];
                if (!file) { resolve(false); return; }
                const reader = new FileReader();
                reader.onload = () => {
                    try {
                        const bytes = new Uint8Array(reader.result);
                        if (bytes.length > PM_IMPORT_MAX_BYTES) {
                            alert('文件过大（上限 2MB），已取消导入');
                            resolve(false);
                            return;
                        }
                        const st = parseStory(file.name, bytes);
                        if (!st) { alert('无效的 .story 文件（需要 ST 签名、版本 1-5）'); resolve(false); return; }
                        if (st.fileName === PM_EGG_FILE) { alert('彩蛋关卡不可安装'); resolve(false); return; }
                        if (this.slots.length >= PM_SLOT_MAX) { alert('槽位已满 (14)'); resolve(false); return; }
                        const dup = this.findBySeriesEpisode(st.series, st.episode);
                        if (dup) { alert('已安装相系列集数的故事：' + dup.story.title); resolve(false); return; }
                        if (this._deleted.has(st.fileName)) {
                            this._deleted.delete(st.fileName);
                            try {
                                localStorage.setItem(PM_STORE_DELETED, JSON.stringify([...this._deleted]));
                            } catch (e) { /* ignore */ }
                        }
                        const list = JSON.parse(localStorage.getItem(PM_STORE_IMPORTED) || '[]');
                        if (list.some(e => e.fileName === st.fileName)) {
                            alert('该故事已在导入列表中');
                            resolve(false);
                            return;
                        }
                        list.push({ fileName: st.fileName, b64: this._bytesToB64(bytes) });
                        /* 先落盘再入内存：配额不足时不会出现「本局可见、刷新即失」的槽位 */
                        try {
                            localStorage.setItem(PM_STORE_IMPORTED, JSON.stringify(list));
                        } catch (e) {
                            alert((e && (e.name === 'QuotaExceededError' || e.code === 22))
                                ? '浏览器存储空间不足，无法导入。请先删除一些已导入的故事后重试。'
                                : '导入失败: ' + (e && e.message ? e.message : e));
                            resolve(false);
                            return;
                        }
                        this.slots.push(this._makeSlot(st, true));
                        this._sort();
                        Audio2.beep(880, 60);
                        resolve(true);
                    } catch (e) {
                        alert('导入失败: ' + (e && e.message ? e.message : e));
                        resolve(false);
                    }
                };
                reader.readAsArrayBuffer(file);
            };
            input.click();
        });
    },

    _bytesToB64(bytes) {
        let bin = '';
        const CH = 0x8000;
        for (let i = 0; i < bytes.length; i += CH) {
            bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
        }
        return btoa(bin);
    },
};
