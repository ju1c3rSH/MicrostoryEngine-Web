/* main.js - 入口 + 主循环 + 按键分发（main.c 移植）
 *
 * 组合键：Konami（↑↑↓↓←→←→B A→彩蛋）、B×4（标题页重置问候计数）。
 */

window.Eng = new StoryEngine();

const S = {
    advanceGame: false,
    choiceMade: false,
    chosenChoice: 0,
    storyMetaValid: false,
    slotSeries: 0,
    slotEpisode: 0,
    slotTitle: '',
    slotHash: 0,
    escCooldown: 0,
    t0: 0,
};

/* ======================== 组合键 ======================== */

const KONAMI_SEQ = [LV_KEY_UP, LV_KEY_UP, LV_KEY_DOWN, LV_KEY_DOWN,
                    LV_KEY_LEFT, LV_KEY_RIGHT, LV_KEY_LEFT, LV_KEY_RIGHT,
                    LV_KEY_ESC, LV_KEY_ENTER];
const GREET_RESET_SEQ = [LV_KEY_ESC, LV_KEY_ESC, LV_KEY_ESC, LV_KEY_ESC];

const Combos = [
    { keys: KONAMI_SEQ, pos: 0, onMatch: null },
    { keys: GREET_RESET_SEQ, pos: 0, onMatch: null },
];

function comboFeed(key) {
    let matched = false;
    for (const c of Combos) {
        if (key === c.keys[c.pos]) c.pos++;
        else c.pos = (key === c.keys[0]) ? 1 : 0;
        if (c.pos === c.keys.length) {
            c.pos = 0;
            if (c.onMatch) c.onMatch();
            matched = true;
        }
    }
    return matched;
}

function onKonami() {
    Audio2.beep(1318, 100);
    startEggStory();
}

function onGreetReset() {
    Persist.setGreetCount(PERSIST_GREET_INITIAL);
    Audio2.beep(880, 100);
    TitleScreen.showToast('问候已重置');
}

Combos[0].onMatch = onKonami;
Combos[1].onMatch = onGreetReset;

/* ======================== 故事启动 ======================== */

function startSlotStory(story, resume) {
    S.storyMetaValid = true;
    S.slotSeries = story.series;
    S.slotEpisode = story.episode;
    S.slotTitle = story.title;
    S.slotHash = story.hash;

    Audio2.stop();
    Eng.propsInit(story.props, story.props.length);
    Eng.triggersInit([]);
    Eng.init(story.code, story.codeSize, story.strings);
    GameScreen.setPropInfo(story.props, story.props.length);
    GameScreen.setSpeakerCount(story.speakerCount);
    GameScreen.setStoryResources(story.bgmTracks);
    GameScreen.setCgResources(story.cg);
    GameScreen.setStoryMeta(story.series, story.episode, story.title, story.hash);

    if (resume && S.storyMetaValid) {
        const es = Persist.saveRead(S.slotSeries, S.slotEpisode, S.slotTitle, S.slotHash);
        if (!es || !Eng.deserialize(es)) Eng.proceed();
    } else {
        Eng.proceed();
    }

    ScreenManager.switch(SCR_GAME);
    GameScreen.show();
    GameScreen.update(Eng);
    GameScreen.resetPropTrack();
}

function startEggStory() {
    S.storyMetaValid = false;
    StoryLoader.load('easter_egg.story').then(egg => {
        Audio2.stop();
        Eng.propsInit(egg.props, egg.props.length);
        Eng.triggersInit([]);
        Eng.init(egg.code, egg.codeSize, egg.strings);
        GameScreen.setPropInfo(egg.props, egg.props.length);
        GameScreen.setSpeakerCount(egg.speakerCount);
        GameScreen.setStoryResources([]);
        GameScreen.setCgResources([]);
        Eng.proceed();
        ScreenManager.switch(SCR_GAME);
        GameScreen.show();
        GameScreen.update(Eng);
        GameScreen.resetPropTrack();
    });
}

/* ======================== 按键分发（game_key_cb 移植） ======================== */

function handleDialogKey(key) {
    Dialog.handleKey(key);
    if (Dialog.getResult() >= 0) Dialog.hide();
}

function gameKeyCb(key) {
    /* key_event_dispatch → 按键蜂鸣 */
    Audio2.beepDefault();

    const cur = ScreenManager.current;

    /* 游戏/设置画面没有自带 dialog 处理：弹窗在此统一按键，保证可关闭 */
    if (cur !== SCR_TITLE && cur !== SCR_SETTINGS && Dialog.isActive()) {
        handleDialogKey(key);
        return;
    }
    /* 标题画面对话框（开机问候）优先 */
    if (cur === SCR_TITLE && Dialog.isActive()) {
        handleDialogKey(key);
        return;
    }

    /* ── 标题画面 ── */
    if (cur === SCR_TITLE) {
        if (comboFeed(key)) return;

        if (TitleScreen.handleKey(key)) {
            const sel = TitleScreen.getSel();
            const cnt = StoryStore.count();

            if (sel < cnt) {
                const slot = StoryStore.get(sel);
                const resume = Persist.hasSave(slot.story.series, slot.story.episode,
                                               slot.story.title, slot.story.hash);
                startSlotStory(slot.story, resume);
                return;
            } else if (sel === cnt) {
                ScreenManager.switch(SCR_SETTINGS);
                SettingsScreen.show();
            } else {
                ScreenManager.switch(SCR_ABOUT);
                AboutScreen.show();
            }
        }
        return;
    }

    /* ── 设置画面 ── */
    if (cur === SCR_SETTINGS) {
        SettingsScreen.handleKey(key);
        if (!SettingsScreen.isActive()) {
            ScreenManager.switch(SCR_TITLE);
            TitleScreen.show();
        }
        return;
    }

    /* ── 关于画面 ── */
    if (cur === SCR_ABOUT) {
        if (AboutScreen.handleKey(key)) {
            ScreenManager.switch(SCR_TITLE);
            TitleScreen.show();
        }
        return;
    }

    /* ── 暂停菜单 ── */
    if (GameScreen.isPaused()) {
        GameScreen.handleKey(key);
        if (key === LV_KEY_ENTER) {
            const sel = GameScreen.getPauseSel();
            if (sel === 0) GameScreen.resume();
            else if (sel === 1) GameScreen.save(Eng);
            else if (sel === 2) GameScreen.load(Eng);
            else if (sel === 3) GameScreen.deleteSave();
        }
        return;
    }

    /* ── 游戏中 ── */
    if (MiniGame.isActive()) {
        if (key === LV_KEY_ESC) MiniGame.finish(MiniGame.curScore());
        else MiniGame.handleKey(key);
        return;
    }

    if (Eng.action === ACT_WAIT_MINIGAME) return;

    if (key === LV_KEY_ESC) {
        const now = T.get();
        if (now - S.escCooldown < 300) return;
        S.escCooldown = now;
        GameScreen.enterPause();
        return;
    }

    if (GameScreen.handleKey(key)) {
        if (Eng.action === ACT_WAIT_CLICK && key === LV_KEY_ENTER) {
            S.advanceGame = true;
        } else if (Eng.action === ACT_WAIT_CHOICE && key === LV_KEY_ENTER) {
            S.chosenChoice = GameScreen.getSelectedChoice();
            S.choiceMade = true;
        } else if (Eng.action === ACT_WAIT_CG) {
            S.advanceGame = true;
        }
    }

    /* 剧本结束或错误时，任意键返回标题 */
    if (Eng.action === ACT_END || Eng.action === ACT_ERROR) {
        if (Eng.action === ACT_END && S.storyMetaValid) {
            Persist.saveErase(S.slotSeries, S.slotEpisode);
            Persist.setCleared(S.slotSeries, S.slotEpisode, true);
        }
        S.storyMetaValid = false;
        Audio2.stop();
        GameScreen.hide();
        ScreenManager.switch(SCR_TITLE);
        TitleScreen.show();
    }
}

/* ======================== 小游戏调度（main.c 主循环） ======================== */

function handleMinigame() {
    if (MiniGame.isActive()) {
        MiniGame.tick();
        return;
    }

    if (Eng.action === ACT_WAIT_MINIGAME) {
        if (!MiniGame.isActive() && !MiniGame.isFinished()) {
            GameScreen.hideAllUi();
            if (!MiniGame.start(Eng.curGameId)) {
                /* 游戏 ID 无效，以 0 分跳过 */
                Eng.propSet(Eng.gameResultProp, 0);
                Eng.action = ACT_RUNNING;
                Eng.proceed();
                GameScreen.update(Eng);
                GameScreen.showAllUi();
            }
        }
        if (MiniGame.isActive()) MiniGame.tick();
        if (MiniGame.isFinished()) {
            const score = MiniGame.getScore();
            GameScreen.showAllUi();
            Eng.propSet(Eng.gameResultProp, score);
            MiniGame.stop();
            Eng.action = ACT_RUNNING;
            Eng.proceed();
            GameScreen.update(Eng);
            GameScreen.resetPropTrack();
        }
    }
}

function handleFlags() {
    if (S.advanceGame) {
        S.advanceGame = false;
        if (Eng.action === ACT_WAIT_CLICK || Eng.action === ACT_WAIT_CG) {
            Eng.action = ACT_RUNNING;
            Eng.proceed();
            GameScreen.update(Eng);
        }
    }

    if (S.choiceMade) {
        S.choiceMade = false;
        if (Eng.action === ACT_WAIT_CHOICE) {
            Eng.makeChoice(S.chosenChoice);
            Eng.proceed();
            GameScreen.update(Eng);
        }
    }
}

/* ======================== 主循环 ======================== */

function drawFrame() {
    const mg = MiniGame.activeGame();
    if (mg && mg.draw) {
        mg.draw();
        return;
    }
    const cur = ScreenManager.screens[ScreenManager.current];
    if (cur && cur.draw) cur.draw();
    Dialog.draw();
}

function frame(now) {
    T.set(now - S.t0);

    Audio2.tick();

    for (const key of Input.drainAll()) gameKeyCb(key);

    handleMinigame();
    handleFlags();

    GameScreen.tick();
    TitleScreen.tick();

    drawFrame();
    requestAnimationFrame(frame);
}

/* ======================== 屏幕适配（物理像素对齐的像素化缩放） ========================
 *
 * 掌机逻辑分辨率 160×128。两步保证像素方正锐利：
 * 1. 按可用视口计算最大整数倍 CSS 缩放（scale），不做任意比例拉伸；
 * 2. canvas 物理分辨率 = 160×128 × pixelScale（整数，取 scale×devicePixelRatio 就近取整），
 *    配合 Draw.setPixelScale 的软件上采样，使每个游戏像素都对齐物理像素网格，
 *    即使 DPR 为 1.25/1.5 这类非整数值也不会模糊。
 */

function fitScreen() {
    const canvas = document.getElementById('screen');
    if (!canvas) return;

    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    /* 触屏设备给右下角虚拟按键留空间 */
    const vpadSpace = coarse ? 150 : 0;
    /* 顶部留白 12 + 底部提示文字约 30 */
    const availW = Math.max(0, window.innerWidth - 24);
    const availH = Math.max(0, window.innerHeight - 42 - vpadSpace);

    let scale = Math.floor(Math.min(availW / SCREEN_W, availH / SCREEN_H));
    if (scale < 1) scale = 1;

    /* 物理像素倍率：scale 换算到设备像素后取整 */
    const dpr = window.devicePixelRatio || 1;
    const px = Math.max(1, Math.round(scale * dpr));

    /* canvas 内部分辨率按物理像素倍率设置（软件上采样） */
    canvas.width = SCREEN_W * px;
    canvas.height = SCREEN_H * px;
    Draw.setPixelScale(px);

    /* CSS 尺寸仍为整数倍逻辑缩放 */
    canvas.style.width = (SCREEN_W * scale) + 'px';
    canvas.style.height = (SCREEN_H * scale) + 'px';
}

/* ======================== 启动 ======================== */

async function boot() {
    S.t0 = performance.now();

    /* 字体加载（MiSans） */
    try {
        await document.fonts.load('14px MiSans');
        await document.fonts.ready;
    } catch (e) { /* 系统字体兜底 */ }

    const canvas = document.getElementById('screen');
    Draw.attach(canvas);
    Input.init(canvas);

    /* 屏幕整数倍适配 */
    fitScreen();
    window.addEventListener('resize', fitScreen);
    window.addEventListener('orientationchange', fitScreen);

    /* 静音恢复 */
    Audio2.muted = Persist.getMute();

    ScreenManager.init();
    MiniGame.registerAll();
    await StoryStore.init();

    ScreenManager.switch(SCR_TITLE);
    TitleScreen.show();

    /* 开机问候（前 PERSIST_GREET_INITIAL 次） */
    const g = Persist.getGreetCount();
    if (g > 0) {
        Persist.setGreetCount(g - 1);
        Dialog.show('你好',
            '欢迎来到 MicroStory ～|' +
            '这里有 10 个小故事、9 个小游戏|' +
            '愿你玩得开心！|' +
            '按 A 继续',
            DIALOG_VERTICAL);
    }

    requestAnimationFrame(frame);
}

boot();
