/* screen.js - 画面管理器（screen_manager.c 移植） */

const SCR_TITLE = 0;
const SCR_SETTINGS = 1;
const SCR_ABOUT = 2;
const SCR_GAME = 3;
const SCR_COUNT = 4;

const ScreenManager = {
    screens: new Array(SCR_COUNT).fill(null),
    current: SCR_TITLE,

    init() {
        this.screens[SCR_TITLE] = TitleScreen;
        this.screens[SCR_SETTINGS] = SettingsScreen;
        this.screens[SCR_ABOUT] = AboutScreen;
        this.screens[SCR_GAME] = GameScreen;
        this.current = SCR_TITLE;
    },

    switch(id) {
        if (id < 0 || id >= SCR_COUNT || !this.screens[id]) return;
        this.current = id;
    },

    getObj(id) {
        return this.screens[id];
    },
};
