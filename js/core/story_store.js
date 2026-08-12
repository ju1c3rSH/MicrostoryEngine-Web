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

    list() { return this.slots; },
    count() { return this.slots.length; },
    slotMax() { return PM_SLOT_MAX; },
    get(idx) { return this.slots[idx]; },

    /* 删除槽位（持久化，对应 pm_delete） */
    deleteSlot(idx) {
        const slot = this.slots[idx];
        if (!slot) return;
        if (slot.imported) {
            const list = JSON.parse(localStorage.getItem(PM_STORE_IMPORTED) || '[]');
            const rest = list.filter(e => e.fileName !== slot.story.fileName);
            localStorage.setItem(PM_STORE_IMPORTED, JSON.stringify(rest));
        } else {
            this._deleted.add(slot.story.fileName);
            localStorage.setItem(PM_STORE_DELETED, JSON.stringify([...this._deleted]));
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
                        const st = parseStory(file.name, bytes);
                        if (!st) { alert('无效的 .story 文件'); resolve(false); return; }
                        if (st.fileName === PM_EGG_FILE) { alert('彩蛋关卡不可安装'); resolve(false); return; }
                        if (this.slots.length >= PM_SLOT_MAX) { alert('槽位已满 (14)'); resolve(false); return; }
                        if (this._deleted.has(st.fileName)) {
                            this._deleted.delete(st.fileName);
                            localStorage.setItem(PM_STORE_DELETED, JSON.stringify([...this._deleted]));
                        }
                        this.slots.push(this._makeSlot(st, true));
                        this._sort();
                        const list = JSON.parse(localStorage.getItem(PM_STORE_IMPORTED) || '[]');
                        list.push({ fileName: st.fileName, b64: this._bytesToB64(bytes) });
                        localStorage.setItem(PM_STORE_IMPORTED, JSON.stringify(list));
                        Audio2.beep(880, 60);
                        resolve(true);
                    } catch (e) {
                        alert('导入失败: ' + e.message);
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
