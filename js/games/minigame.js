/* minigame.js - 小游戏管理器（minigame_manager.c 移植）
 *
 * minigame_t 接口：{name, start(), tick(), handleKey(key)→bool, stop(), getScore()→int16}
 * 游戏实现见 js/games/game_*.js，注册顺序即字节码 OP_MINIGAME 的 game_id。
 */

const MAX_GAMES = 14;

const MiniGame = {
    games: [],
    activeId: 0,
    active: false,
    finished: false,
    result: 0,

    register(game) {
        if (this.games.length >= MAX_GAMES || !game) return false;
        this.games.push(game);
        return true;
    },

    start(id) {
        if (id >= this.games.length || !this.games[id]) return false;
        if (this.active) return false;
        this.activeId = id;
        this.active = true;
        this.finished = false;
        this.result = 0;
        this.games[id].start();
        return true;
    },

    isActive() { return this.active; },
    isFinished() { return this.finished; },
    activeGame() { return this.active ? this.games[this.activeId] : null; },

    tick() {
        if (!this.active) return;
        const g = this.games[this.activeId];
        if (g && g.tick) g.tick();
    },

    handleKey(key) {
        if (!this.active) return false;
        const g = this.games[this.activeId];
        if (g && g.handleKey) return g.handleKey(key);
        return false;
    },

    finish(score) {
        if (!this.active) return;
        this.result = score;
        this.active = false;
        this.finished = true;
    },

    stop() {
        const g = this.games[this.activeId];
        if (g && g.stop) g.stop();
        this.active = false;
        this.finished = false;
        this.result = 0;
    },

    getScore() {
        this.finished = false;
        return this.result;
    },

    curScore() {
        if (!this.active) return 0;
        const g = this.games[this.activeId];
        if (g && g.getScore) return g.getScore();
        return 0;
    },

    /* 注册全部 9 个小游戏（顺序 = 引擎 game_id） */
    registerAll() {
        this.register(GameFox);
        this.register(GameGomoku);
        this.register(GameOthello);
        this.register(GameRhythm);
        this.register(GameSnake);
        this.register(GameQte);
        this.register(GameFishing);
        this.register(GameMemory);
        this.register(GameWam);
    },
};
