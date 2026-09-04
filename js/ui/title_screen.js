/* title_screen.js - 标题画面（title_screen.c 移植） */

const ACTION_COUNT = 3;
const ACTION_TEXTS = ['开始游戏', '设置', '关于'];
const ACTION_Y = [88, 100, 112];

const TitleScreen = {
    active: false,
    sel: 0,
    storyIdx: 0,
    toastText: '',
    toastUntilMs: 0,

    show() {
        this.active = true;
        /* 返回标题时刷新存档标记（游戏中可能已保存/删除存档） */
        StoryStore.refreshSaveFlags();
    },
    hide() {
        this.active = false;
    },
    isActive() {
        return this.active;
    },

    showToast(text) {
        this.toastText = text || '';
        this.toastUntilMs = T.get() + 1500;
    },

    tick() {
        if (this.toastUntilMs && T.get() - this.toastUntilMs >= 0) {
            this.toastUntilMs = 0;
            this.toastText = '';
        }
    },

    getSel() {
        switch (this.sel) {
            case 0: return this.storyIdx;
            case 1: return StoryStore.count();
            case 2: default: return StoryStore.count() + 1;
        }
    },

    handleKey(lvKey) {
        switch (lvKey) {
            case LV_KEY_LEFT:
                if (StoryStore.count() > 1) {
                    this.storyIdx = (this.storyIdx + StoryStore.count() - 1) % StoryStore.count();
                }
                return false;
            case LV_KEY_RIGHT:
                if (StoryStore.count() > 1) {
                    this.storyIdx = (this.storyIdx + 1) % StoryStore.count();
                }
                return false;
            case LV_KEY_UP:
                this.sel = (this.sel + ACTION_COUNT - 1) % ACTION_COUNT;
                return false;
            case LV_KEY_DOWN:
                this.sel = (this.sel + 1) % ACTION_COUNT;
                return false;
            case LV_KEY_ENTER:
                if (this.sel === 0 && StoryStore.count() === 0) return false;
                return true;
            default:
                return false;
        }
    },

    draw() {
        Draw.clear(CLR_BG);

        const n = StoryStore.count();
        const hasStory = n > 0 && this.storyIdx < n;

        /* 缩略图（左侧） */
        if (hasStory) {
            const st = StoryStore.get(this.storyIdx);
            if (st.thumb) {
                Draw.image(st.thumb, 6, 4);
                Draw.strokeRect(6, 4, 48, 48, CLR_BORDER, 1);
            }
        }

        /* 标题（缩略图右侧） */
        let title = '';
        if (hasStory) {
            const st = StoryStore.get(this.storyIdx);
            title = st.story.title;
            if (st.cleared && title) title += ' ✓';
        } else {
            title = '—— 无剧集 ——';
        }
        Draw.text(title, 58, 5, CLR_SPEAKER);

        /* 副标题 */
        if (hasStory && StoryStore.get(this.storyIdx).story.subtitle) {
            const sub = StoryStore.get(this.storyIdx).story.subtitle;
            let y = 21;
            for (const line of Draw.wrapText(sub, 96)) {
                if (y > 51) break;
                Draw.text(line, 58, y, CLR_TEXT);
                y += 14;
            }
        }

        /* 故事切换指示器 */
        if (n > 1) {
            Draw.textCenter('<' + ' ' + (this.storyIdx + 1) + '/' + n + ' ' + '>', 0, 56, SCREEN_W, CLR_SPEAKER);
        }

        /* 提示 */
        Draw.textCenter(this.toastText || '↑↓ 切换焦点', 0, 72, SCREEN_W, CLR_SPEAKER);

        /* 操作按钮 */
        for (let i = 0; i < ACTION_COUNT; i++) {
            let txt;
            if (i === 0 && hasStory && StoryStore.get(this.storyIdx).hasSave) {
                txt = '继续游戏';
            } else {
                txt = ACTION_TEXTS[i];
            }
            const buf = (i === this.sel ? '> ' : '  ') + txt;
            const color = i === this.sel ? CLR_CHOICE_S : CLR_TEXT;
            Draw.textCenter(buf, 0, ACTION_Y[i], SCREEN_W, color);
        }
    },
};
