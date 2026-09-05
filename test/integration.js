/* integration.js - MicroStory-Web 无头冒烟测试(纯 Node >=18,零依赖)
 *
 * 运行:node test/integration.js(失败时退出码 1)
 *
 * 做法:从 index.html 按顺序取出全部本地 <script src>,拼成一个大脚本,
 * 在 node:vm 的同一 context 中执行(顶层 const/函数互相可见,与浏览器一致)。
 * window/document/canvas/localStorage/cookie/Audio 等由 test/shims.js 垫片;
 * requestAnimationFrame 只计数不调度,因此 main.js 的 boot() 会跑完但 rAF 主循环不会启动。
 *
 * 覆盖:
 *   1. 启动冒烟(boot / ScreenManager / 问候对话框 / MiniGame 注册)
 *   2. 故事数据与解析(13 个 .story 头字段)
 *   3. 可见故事 + 彩蛋:easter_egg 引擎全流程(点击/选项/小游戏,3 种选择策略)
 *   4. 9 个小游戏独立生命周期(按键/步进/draw/结束/得分)
 *   5. Persist:存档往返/损坏/失效/通关/问候/静音/音量/备份导出导入
 *   6. StoryStore:槽位/彩蛋排除/存档标记/删除持久化/导入槽位/上限
 *   7. main.js 接线:暂停/存档/通关标记/设置页(音量·全屏·导出)/Konami/B×4 组合键
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const shims = require('./shims.js');

const ROOT = path.join(__dirname, '..');

/* ---------------- 测试结果统计与输出 ---------------- */

let passCount = 0;
let failCount = 0;
let skipCount = 0;
let asyncFailures = 0;

process.on('unhandledRejection', e => {
    asyncFailures++;
    console.log('  FAIL 未处理的 Promise 拒绝:' + (e && e.stack ? e.stack : e));
});
process.on('uncaughtException', e => {
    asyncFailures++;
    console.log('  FAIL 未捕获异常:' + (e && e.stack ? e.stack : e));
});

function header(title) {
    console.log('\n===== ' + title + ' =====');
}
function info(line) {
    console.log('  · ' + line);
}
function check(name, cond, extra) {
    if (cond) {
        passCount++;
        console.log('  PASS ' + name);
    } else {
        failCount++;
        console.log('  FAIL ' + name + (extra !== undefined && extra !== null && extra !== '' ? ' —— ' + extra : ''));
    }
}
function skip(name, reason) {
    skipCount++;
    console.log('  SKIP ' + name + '(' + reason + ')');
}

/* ---------------- vm context 搭建 ---------------- */

/* 从 index.html 抽取按顺序排列的本地脚本(外部 URL 跳过) */
function collectScriptPaths() {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const re = /<script[^>]*\bsrc=["']([^"']+)["']/g;
    const out = [];
    let m;
    while ((m = re.exec(html)) !== null) {
        const src = m[1];
        if (/^https?:/i.test(src)) {
            info('跳过外部脚本:' + src);
            continue;
        }
        out.push(src);
    }
    return out;
}

const { sandbox, cookieJar, localStorage, alerts } = shims.buildSandbox();
const ctx = vm.createContext(sandbox);

/* 预置脚本:window/self 别名 + 确定性 Math.random */
vm.runInContext(shims.PRELUDE, ctx, { filename: '__prelude.js' });

/* 拼接大脚本并执行(顺序 = index.html,保证加载契约) */
const scriptPaths = collectScriptPaths();
const bundle = scriptPaths
    .map(p => '/* ===== ' + p + ' ===== */\n' + fs.readFileSync(path.join(ROOT, p), 'utf8'))
    .join('\n;\n');
vm.runInContext(bundle, ctx, { filename: '__app_bundle.js' });

/* ---------------- 取全局/常量的辅助 ---------------- */

function g(expr) {
    return vm.runInContext('(' + expr + ')', ctx, { filename: 'expr' });
}
function gexec(code) {
    return vm.runInContext(code, ctx, { filename: 'exec' });
}
const flush = () => new Promise(r => setImmediate(r));
async function waitFor(fn, timeoutMs, what) {
    const t0 = Date.now();
    for (;;) {
        let ok = false;
        try { ok = fn(); } catch (e) { /* 条件求值失败视为未就绪 */ }
        if (ok) return true;
        if (Date.now() - t0 > (timeoutMs || 5000)) return false;
        await flush();
    }
}

/* 上下文常量 */
const K = g('({SCREEN_W: SCREEN_W, SCREEN_H: SCREEN_H, LV_KEY_UP: LV_KEY_UP, LV_KEY_DOWN: LV_KEY_DOWN, ' +
    'LV_KEY_LEFT: LV_KEY_LEFT, LV_KEY_RIGHT: LV_KEY_RIGHT, LV_KEY_ESC: LV_KEY_ESC, LV_KEY_ENTER: LV_KEY_ENTER, ' +
    'ACT_RUNNING: ACT_RUNNING, ACT_WAIT_CLICK: ACT_WAIT_CLICK, ACT_WAIT_CHOICE: ACT_WAIT_CHOICE, ' +
    'ACT_WAIT_MINIGAME: ACT_WAIT_MINIGAME, ACT_WAIT_CG: ACT_WAIT_CG, ACT_END: ACT_END, ACT_ERROR: ACT_ERROR, ' +
    'AUDIO_VOL_MAX: AUDIO_VOL_MAX, PM_SLOT_MAX: PM_SLOT_MAX, GREET_INIT: PERSIST_GREET_INITIAL, ' +
    'SCR_TITLE: SCR_TITLE, SCR_SETTINGS: SCR_SETTINGS, SCR_ABOUT: SCR_ABOUT, SCR_GAME: SCR_GAME, ' +
    'MAX_CHOICES: MAX_CHOICES})');

/* 上下文单例对象 */
const Eng = g('Eng');
const Tc = g('T');
const Persist = g('Persist');
const StoryStore = g('StoryStore');
const StoryLoader = g('StoryLoader');
const MiniGame = g('MiniGame');
const GameScreen = g('GameScreen');
const ScreenManager = g('ScreenManager');
const Dialog = g('Dialog');
const TitleScreen = g('TitleScreen');
const Audio2 = g('Audio2');
const SettingsScreen = g('SettingsScreen');
const gameKeyCb = g('gameKeyCb');
const comboFeed = g('comboFeed');
const KONAMI_SEQ = g('KONAMI_SEQ');
const GREET_RESET_SEQ = g('GREET_RESET_SEQ');
/* context 内适配器:从宿主调用 UI 对象方法时保住 this
 * (g('X.method') 抽出的裸函数调用时 this 会丢,不能用) */
const ssHandleKey = g('(function (k) { return SettingsScreen.handleKey(k); })');

/* 内嵌故事总数(数据驱动,不硬编码;当前为 12 = 11 可见 + 1 彩蛋) */
const EMBEDDED_TOTAL = Object.keys(g('EMBEDDED_STORIES')).length;

function tickMs(ms) { Tc.set(Tc.get() + ms); }
function resetStorage() {
    cookieJar.clear();
    localStorage.clear();
}
function jsonEq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function strSeed(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
}

/* ---------------- 套件 0:启动冒烟 ---------------- */

async function suiteBoot() {
    header('启动冒烟(main.js boot,无 rAF 主循环)');

    /* boot() 是异步的:等问候对话框出现即代表启动流程完成 */
    const ok = await waitFor(
        () => g('typeof Dialog !== "undefined" && Dialog.active === true') === true,
        8000, 'boot 完成');
    check('boot() 异步启动流程完成(问候对话框出现)', ok);
    if (!ok) return;

    check('rAF 主循环未被启动(requestAnimationFrame 只被调用 1 次)',
        sandbox.__getRafCount() === 1, '调用 ' + sandbox.__getRafCount() + ' 次');
    check('当前画面为标题页', ScreenManager.current === K.SCR_TITLE,
        'current=' + ScreenManager.current);
    check('标题页已激活', TitleScreen.active === true);
    check('开机问候计数已从 ' + K.GREET_INIT + ' 扣减为 ' + (K.GREET_INIT - 1),
        Persist.getGreetCount() === K.GREET_INIT - 1,
        '实际 ' + Persist.getGreetCount());
    check('问候对话框标题为「你好」', Dialog.title === '你好', '实际 ' + Dialog.title);
    check('9 个小游戏已在 boot 中注册', MiniGame.games.length === 9,
        '实际 ' + MiniGame.games.length);
    check('故事槽位已加载(可见故事全部入列)',
        StoryStore.count() === EMBEDDED_TOTAL - 1,
        '实际 ' + StoryStore.count() + ',期望 ' + (EMBEDDED_TOTAL - 1));

    /* 关掉问候对话框,后续套件从干净状态开始 */
    Dialog.hide();
}

/* ---------------- 套件 1:故事数据与解析 ---------------- */

async function suiteStories() {
    header('故事数据加载与 .story 解析');

    const embedded = g('EMBEDDED_STORIES');
    const names = Object.keys(embedded).sort();
    info('内嵌故事:' + names.length + ' 个 —— ' + names.join(', '));

    /* Node 里相对路径 fetch 必然失败(或无 fetch),StoryLoader 走 EMBEDDED_STORIES 兜底 */
    const stories = await StoryLoader.loadAll();

    check('loadAll() 返回全部内嵌故事(' + EMBEDDED_TOTAL + ' 个)',
        Array.isArray(stories) && stories.length === EMBEDDED_TOTAL,
        '实际 ' + (stories && stories.length));
    check('loadAll() 覆盖与 EMBEDDED_STORIES 相同的文件集合',
        jsonEq(stories.map(s => s.fileName).sort(), names));
    check('loadAll() 按 series/episode 升序', stories.every((s, i) => i === 0 ||
        (stories[i - 1].series < s.series) ||
        (stories[i - 1].series === s.series && stories[i - 1].episode <= s.episode)));

    const egg = stories.find(s => s.fileName === 'easter_egg.story');
    check('彩蛋 easter_egg.story 已解析', !!egg);
    const visible = stories.filter(s => s.fileName !== 'easter_egg.story');
    check('可见故事 ' + visible.length + ' 个(排除彩蛋)', visible.length === EMBEDDED_TOTAL - 1);

    /* 逐个校验头部字段合理性(彩蛋故事允许空标题/无缩略图) */
    let bad = [];
    for (const st of stories) {
        const isEgg = st.fileName === 'easter_egg.story';
        const problems = [];
        if (!(st.title && st.title.length > 0) && !isEgg) problems.push('title 为空');
        if (typeof st.subtitle !== 'string') problems.push('subtitle 非字符串');
        if (!ArrayBuffer.isView(st.code) || st.code.length !== st.codeSize || !(st.codeSize > 0)) {
            problems.push('代码段异常(len=' + st.code.length + ' size=' + st.codeSize + ')');
        }
        if (!Array.isArray(st.strings) || st.strings.length === 0) problems.push('字符串表为空');
        if (typeof st.hash !== 'number' || !(st.hash >= 0)) problems.push('codeHash 异常');
        if (!Array.isArray(st.props)) problems.push('props 非数组');
        for (const p of (st.props || [])) {
            if (!(p.min <= p.max)) problems.push('属性 ' + p.name + ' min>max');
        }
        if (!Array.isArray(st.bgmTracks)) problems.push('bgmTracks 非数组');
        if (!Array.isArray(st.cg)) problems.push('cg 非数组');
        for (const c of (st.cg || [])) {
            if (!c || !c.name || !ArrayBuffer.isView(c.rle)) problems.push('CG 资源异常');
        }
        if (!(st.series >= 0 && st.episode >= 0)) problems.push('series/episode 异常');
        if (st.thumbnail !== null && !ArrayBuffer.isView(st.thumbnail)) problems.push('thumbnail 异常');
        if (problems.length) bad.push(st.fileName + ': ' + problems.join('; '));
        info(st.fileName + ' s' + st.series + 'e' + st.episode +
            ' title=' + st.title +
            ' code=' + st.codeSize + 'B str=' + st.strings.length +
            ' prop=' + st.props.length + ' bgm=' + st.bgmTracks.length +
            ' cg=' + st.cg.length + (st.thumbnail ? ' 有缩略图' : ''));
    }
    check('全部 ' + stories.length + ' 个故事头部字段合理', bad.length === 0, bad.join(' | '));

    /* 缓存行为:同名文件第二次 load 返回同一对象 */
    const again = await StoryLoader.load('easter_egg.story');
    check('StoryLoader.load 有缓存(同一对象)', again === egg);
}

/* ---------------- 套件 2:故事引擎全流程 ---------------- */

/* 模拟 main.js handleMinigame 的「小游戏完成」分支接线 */
function simMinigameCompletion() {
    if (!MiniGame.isActive() && !MiniGame.isFinished()) {
        GameScreen.hideAllUi();
        const started = MiniGame.start(Eng.curGameId);
        if (!started) {
            /* 对齐 main.js:游戏 ID 无效时以 0 分跳过 */
            Eng.propSet(Eng.gameResultProp, 0);
            Eng.action = K.ACT_RUNNING;
            const a = Eng.proceed();
            GameScreen.update(Eng);
            GameScreen.showAllUi();
            return a;
        }
        /* 步进若干帧并注入按键(验证 start/tick/handleKey 可跑),不强求自然结束 */
        for (let i = 0; i < 24 && MiniGame.isActive() && !MiniGame.isFinished(); i++) {
            tickMs(16);
            MiniGame.handleKey(K.LV_KEY_ENTER);
            MiniGame.tick();
        }
        if (MiniGame.isActive() && !MiniGame.isFinished()) MiniGame.finish(66);
    }
    if (MiniGame.isActive()) MiniGame.tick();
    if (MiniGame.isFinished()) {
        const score = MiniGame.getScore();
        GameScreen.showAllUi();
        Eng.propSet(Eng.gameResultProp, score);
        MiniGame.stop();
        Eng.action = K.ACT_RUNNING;
        const a = Eng.proceed();
        GameScreen.update(Eng);
        GameScreen.resetPropTrack();
        return a;
    }
    return Eng.action;
}

/* 单次全流程:对齐 startSlotStory 初始化 + 主循环 handleFlags/handleMinigame 语义 */
function runStoryOnce(story, policy, passIdx) {
    gexec('__seedRandom(' + ((strSeed(story.fileName) ^ Math.imul(passIdx + 1, 0x9E3779B1)) >>> 0) + ')');
    Audio2.stop();
    Dialog.hide();
    MiniGame.stop();

    Eng.propsInit(story.props, story.props.length);
    Eng.triggersInit([]);
    Eng.init(story.code, story.codeSize, story.strings);
    GameScreen.setPropInfo(story.props, story.props.length);
    GameScreen.setSpeakerCount(story.speakerCount);
    GameScreen.setStoryResources(story.bgmTracks);
    GameScreen.setCgResources(story.cg);
    GameScreen.setStoryMeta(story.series, story.episode, story.title, story.hash);
    GameScreen.show();

    let action = Eng.proceed();
    GameScreen.update(Eng);
    GameScreen.resetPropTrack();

    const MAX_STEPS = 200000;
    let steps = 0;
    let sawText = 0, sawChoice = 0, sawCg = 0, sawMinigame = 0;
    let firstChoiceCnt = -1, emptyChoiceText = 0, emptyText = false;

    while (action !== K.ACT_END && action !== K.ACT_ERROR && steps < MAX_STEPS) {
        steps++;
        tickMs(33);

        if (action === K.ACT_WAIT_CLICK || action === K.ACT_WAIT_CG) {
            if (action === K.ACT_WAIT_CLICK) {
                sawText++;
                if (sawText === 1) {
                    const t = Eng.getText();
                    if (!(typeof t.text === 'string' && t.text.length > 0)) emptyText = true;
                }
                /* 模拟按键流:第一次 ENTER 跳过打字机,第二次推进 */
                GameScreen.handleKey(K.LV_KEY_ENTER);
                GameScreen.handleKey(K.LV_KEY_ENTER);
            } else {
                sawCg++;
                GameScreen.handleKey(K.LV_KEY_ENTER); /* 关闭 CG */
            }
            Eng.action = K.ACT_RUNNING; /* 对齐 handleFlags */
            action = Eng.proceed();
            GameScreen.update(Eng);
        } else if (action === K.ACT_WAIT_CHOICE) {
            sawChoice++;
            const n = Eng.choiceCount();
            if (n <= 0) { action = K.ACT_ERROR; break; }
            if (firstChoiceCnt < 0) {
                firstChoiceCnt = n;
                for (let i = 0; i < n; i++) {
                    if (!(typeof Eng.choiceText(i) === 'string' && Eng.choiceText(i).length > 0)) {
                        emptyChoiceText++;
                    }
                }
            }
            /* 选择策略:first=总是第 0 项;last=总是最后一项;roundrobin=按步数轮转 */
            let idx = 0;
            if (policy === 'last') idx = n - 1;
            else if (policy === 'roundrobin') idx = (sawChoice + passIdx) % n;
            Eng.makeChoice(idx);
            action = Eng.proceed();
            GameScreen.update(Eng);
        } else if (action === K.ACT_WAIT_MINIGAME) {
            sawMinigame++;
            action = simMinigameCompletion();
        } else {
            /* ACT_RUNNING:理论上 proceed 不会返回,防御性再推进 */
            action = Eng.proceed();
            GameScreen.update(Eng);
        }
        GameScreen.tick();
    }

    return { action, steps, sawText, sawChoice, sawCg, sawMinigame, firstChoiceCnt, emptyChoiceText, emptyText };
}

async function suiteEngineRuns() {
    header('故事引擎全流程(可见故事 + easter_egg)');

    const stories = await StoryLoader.loadAll();
    const totalMinigames = { count: 0 };

    for (const st of stories) {
        const isEgg = st.fileName === 'easter_egg.story';
        const label = st.title + '(' + st.fileName + ')';
        const policies = ['first', 'last', 'roundrobin'];
        const results = [];
        for (let pi = 0; pi < policies.length; pi++) {
            const r = runStoryOnce(st, policies[pi], pi);
            results.push(r);
            totalMinigames.count += r.sawMinigame;
            check(label + ' [' + policies[pi] + '] 到达 ACT_END 且无 ACT_ERROR',
                r.action === K.ACT_END,
                'action=' + r.action + ' steps=' + r.steps);
            check(label + ' [' + policies[pi] + '] 未触发步数上限',
                r.steps < 200000, 'steps=' + r.steps);
        }
        /* 详细断言只在 first 策略下做一次,避免输出爆炸 */
        const r0 = results[0];
        check(label + ' 至少出现一次对话文本', r0.sawText > 0, 'sawText=' + r0.sawText);
        check(label + ' 首段文本非空', !r0.emptyText);
        if (r0.firstChoiceCnt >= 0) {
            check(label + ' 选项数量在 1~MAX_CHOICES 且文本非空',
                r0.firstChoiceCnt >= 1 && r0.firstChoiceCnt <= K.MAX_CHOICES && r0.emptyChoiceText === 0,
                'cnt=' + r0.firstChoiceCnt + ' 空文本=' + r0.emptyChoiceText);
        }
        info((isEgg ? '[彩蛋] ' : '') + label + ' —— 点击=' + r0.sawText +
            ' 选项=' + r0.sawChoice + ' CG=' + r0.sawCg + ' 小游戏=' + r0.sawMinigame +
            ' 步数=' + results.map(r => r.steps).join('/'));
    }

    info('全部故事中小游戏出现次数(每次一条等待):' + totalMinigames.count);
    check('小游戏调度后 MiniGame 未残留激活状态', MiniGame.isActive() === false);
}

/* ---------------- 套件 3:9 个小游戏独立生命周期 ---------------- */

function suiteMinigames() {
    header('9 个小游戏独立生命周期(注册表逐一实例化)');

    check('注册数量为 9(顺序即 OP_MINIGAME 的 game_id)', MiniGame.games.length === 9,
        '实际 ' + MiniGame.games.length);
    const expectOrder = ['围兔子', '五子棋', '黑白棋', '节奏打击', '贪吃蛇', 'QTE连打', '钓鱼', '翻牌记忆', '打地鼠'];
    check('注册顺序与预期一致', jsonEq(MiniGame.games.map(x => x.name), expectOrder),
        '实际 ' + MiniGame.games.map(x => x.name).join(','));

    for (let i = 0; i < MiniGame.games.length; i++) {
        const gm = MiniGame.games[i];
        let err = null;
        let naturalFinished = null; /* ② 之后是否已自然结束(仅对可快进的游戏断言) */

        const started = MiniGame.start(i) === true;
        check('[' + gm.name + '] MiniGame.start(' + i + ') 成功', started);

        try {
            /* ① 注入方向/A/B 键 + 短步进 */
            for (const key of [K.LV_KEY_UP, K.LV_KEY_DOWN, K.LV_KEY_LEFT, K.LV_KEY_RIGHT, K.LV_KEY_ENTER]) {
                MiniGame.handleKey(key);
                tickMs(50);
                MiniGame.tick();
            }

            /* ② 游戏特定推进:AI 落子 / 自然完成 */
            if (gm.name === '贪吃蛇') {
                MiniGame.handleKey(K.LV_KEY_ENTER); /* 取消 ① 中 ENTER 造成的暂停 */
            } else if (gm.name === '五子棋') {
                /* 中央落子 → AI 思考 → tick 计算 */
                MiniGame.handleKey(K.LV_KEY_ENTER);
                MiniGame.tick();
                check('[' + gm.name + '] AI 落子完成(玩家+AI 共 2 手或对局结束)',
                    gm.moveCount >= 2 || gm.gameOver, 'moveCount=' + gm.moveCount);
            } else if (gm.name === '黑白棋') {
                /* 移动光标到首个合法落点并落子,AI 思考后应回到玩家回合 */
                const mv = gm._getMoves(gm.black, gm.white);
                let sq = -1;
                for (let b = 0; b < 64; b++) {
                    if (((mv >> BigInt(b)) & 1n) !== 0n) { sq = b; break; }
                }
                if (sq >= 0) {
                    gm.cursorPos = sq;
                    MiniGame.handleKey(K.LV_KEY_ENTER);
                    for (let f = 0; f < 60 && gm.turn === 1 && !gm.gameOver; f++) {
                        tickMs(100);
                        MiniGame.tick();
                    }
                }
                check('[' + gm.name + '] AI 回合结束(回到玩家或对局结束)',
                    gm.turn === 0 || gm.gameOver, 'turn=' + gm.turn);
            } else if (gm.name === '围兔子') {
                /* 兔子上移一步并确认 → 4 只狐狸依次 AI 行动 */
                MiniGame.handleKey(K.LV_KEY_UP);
                MiniGame.handleKey(K.LV_KEY_ENTER);
                for (let f = 0; f < 60 && gm.aiState !== 0 && !gm.gameOver; f++) {
                    tickMs(100);
                    MiniGame.tick();
                }
                check('[' + gm.name + '] AI 行动完毕(回到兔子回合或对局结束)',
                    gm.aiState === 0 || gm.gameOver, 'aiState=' + gm.aiState);
            } else if (gm.name === 'QTE连打') {
                /* 5 轮 ENTER + 等 1 秒结果 → 自然结束 */
                for (let r = 0; r < 8 && !MiniGame.isFinished(); r++) {
                    MiniGame.handleKey(K.LV_KEY_ENTER);
                    tickMs(1100);
                    MiniGame.tick();
                }
            } else if (gm.name === '节奏打击') {
                /* 快进到最后一个音符之后 → 全部漏掉 → 结束延时 → finish */
                tickMs(14000);
                MiniGame.tick();
                tickMs(1100);
                MiniGame.tick();
            }
            if (gm.name === 'QTE连打' || gm.name === '节奏打击') {
                naturalFinished = MiniGame.isFinished();
            }

            /* ③ 通用步进 + 绘制(垫片 ctx) */
            for (let f = 0; f < 120; f++) {
                tickMs(33);
                MiniGame.tick();
            }
            gm.draw();
        } catch (e) {
            err = e;
        }

        /* ②' 自然完成断言(QTE/节奏可确定性快进到自然结束) */
        if (naturalFinished !== null) {
            check('[' + gm.name + '] 可自然结束(未借助强制 finish)', naturalFinished === true);
        }

        /* ④ 收尾:对齐 main.js 中 ESC → finish(curScore()) */
        if (MiniGame.isActive() && !MiniGame.isFinished()) {
            MiniGame.finish(MiniGame.curScore());
        }
        const finished = MiniGame.isFinished();
        const score = finished ? MiniGame.getScore() : null;

        check('[' + gm.name + '] 按键/步进/draw 全程无异常', !err, err && (err.stack || err.message));
        check('[' + gm.name + '] 生命周期可走通并得到 0~100 得分',
            finished && score !== null && score >= 0 && score <= 100,
            'finished=' + finished + ' score=' + score);
        MiniGame.stop();
    }

    check('全部小游戏结束后无残留激活', MiniGame.isActive() === false && MiniGame.isFinished() === false);
}

/* ---------------- 套件 4:Persist 基础 ---------------- */

function suitePersist() {
    header('Persist:存档/通关/问候/静音(cookie + localStorage 兜底)');

    resetStorage();

    /* 写读往返 */
    const es = { pc: 42, action: 1, callSp: 1, note: '测试存档' };
    Persist.saveWrite(1, 1, '测试故事', 0x1234, es);
    check('saveWrite 后 hasSave 为真',
        Persist.hasSave(1, 1, '测试故事', 0x1234) === true);
    check('saveRead 往返得到相同 engineSave',
        jsonEq(Persist.saveRead(1, 1, '测试故事', 0x1234), es));
    check('cookie 罐内确有 sav_s1e1 记录', cookieJar.has('sav_s1e1'));
    check('localStorage 同步写入 ms_c_sav_s1e1', localStorage.getItem('ms_c_sav_s1e1') !== null);

    /* 无存档/擦除 */
    check('未写入的槽位 hasSave 为假', Persist.hasSave(9, 9, '测试故事', 0x1234) === false);
    Persist.saveErase(1, 1);
    check('saveErase 后 savePeek 为 none',
        Persist.savePeek(1, 1, '测试故事', 0x1234).status === 'none');
    check('saveErase 后 saveRead 为 null',
        Persist.saveRead(1, 1, '测试故事', 0x1234) === null);
    check('擦除同时清理两个通道', !cookieJar.has('sav_s1e1') && localStorage.getItem('ms_c_sav_s1e1') === null);

    /* 损坏 JSON → corrupt,saveRead 清除 */
    Persist._set('sav_s1e2', '{这不是JSON');
    check('损坏 JSON → savePeek status=corrupt',
        Persist.savePeek(1, 2, '测试故事', 0x1234).status === 'corrupt');
    check('损坏记录 saveRead 返回 null', Persist.saveRead(1, 2, '测试故事', 0x1234) === null);
    check('损坏记录已被 saveRead 清除', Persist._get('sav_s1e2') === null);

    /* 字段缺失 → corrupt */
    Persist._set('sav_s1e5', JSON.stringify({ magic: 'MSVS' }));
    check('字段缺失 → savePeek status=corrupt',
        Persist.savePeek(1, 5, '测试故事', 0x1234).status === 'corrupt');
    Persist.saveRead(1, 5, '测试故事', 0x1234);

    /* codeHash 不符 → stale,saveRead 清除 */
    Persist.saveWrite(1, 3, '测试故事', 0xAAAA, es);
    check('codeHash 不符 → savePeek status=stale',
        Persist.savePeek(1, 3, '测试故事', 0xBBBB).status === 'stale');
    check('stale 记录 saveRead 返回 null', Persist.saveRead(1, 3, '测试故事', 0xBBBB) === null);
    check('stale 记录已被清除', Persist._get('sav_s1e3') === null);

    /* title 不符 → stale */
    Persist.saveWrite(1, 4, '旧标题', 0xAAAA, es);
    check('title 不符 → savePeek status=stale',
        Persist.savePeek(1, 4, '新标题', 0xAAAA).status === 'stale');
    Persist.saveRead(1, 4, '新标题', 0xAAAA);

    /* 通关标记 */
    Persist.setCleared(2, 1, true);
    check('setCleared(true) 后 isCleared 为真', Persist.isCleared(2, 1) === true);
    Persist.setCleared(2, 1, false);
    check('setCleared(false) 后 isCleared 为假', Persist.isCleared(2, 1) === false);

    /* 问候计数 */
    resetStorage();
    check('问候计数缺省为 ' + K.GREET_INIT, Persist.getGreetCount() === K.GREET_INIT);
    Persist.setGreetCount(7);
    check('setGreetCount(7) 往返', Persist.getGreetCount() === 7);

    /* 静音 */
    Persist.setMute(true);
    check('setMute(true) 往返', Persist.getMute() === true);
    Persist.setMute(false);
    check('setMute(false) 往返', Persist.getMute() === false);

    /* localStorage 兜底:清掉 cookie 后仍可读到(模拟 file:// 下 cookie 失效) */
    Persist.saveWrite(3, 1, '兜底测试', 0x7777, { pc: 7 });
    cookieJar.clear();
    check('清空 cookie 后经 localStorage 兜底仍可读出存档',
        jsonEq(Persist.saveRead(3, 1, '兜底测试', 0x7777), { pc: 7 }));

    /* 配额路径:localStorage 写入抛 QuotaExceededError,cookie 主通道不受影响 */
    resetStorage();
    localStorage.__quotaFail = true;
    const origWarn = sandbox.console.warn;
    sandbox.console.warn = () => {}; /* 屏蔽预期中的降级告警 */
    let threw = false;
    try { Persist.setGreetCount(3); } catch (e) { threw = true; }
    localStorage.__quotaFail = false;
    sandbox.console.warn = origWarn;
    check('localStorage 配额超限时 Persist.setGreetCount 不抛出', threw === false);
    check('cookie 主通道写入成功(getGreetCount=3)', Persist.getGreetCount() === 3);
}

/* ---------------- 套件 5:备份导出/导入 ---------------- */

function suiteBackup() {
    header('Persist.exportBackup / importBackup(MSBAK v1)');

    resetStorage();
    Persist.saveWrite(1, 1, '故事甲', 111, { pc: 1 });
    Persist.saveWrite(1, 2, '故事乙', 222, { pc: 2 });
    Persist.setCleared(2, 1, true);

    const json = Persist.exportBackup();
    let bak = null;
    try { bak = JSON.parse(json); } catch (e) { /* 由下面的 check 报告 */ }
    check('导出为 MSBAK v1 JSON', !!bak && bak.magic === 'MSBAK' && bak.ver === 1);
    check('导出包含 3 条记录(2 sav + 1 clr)',
        !!bak && Array.isArray(bak.records) && bak.records.length === 3,
        '实际 ' + (bak && bak.records && bak.records.length));
    check('记录类型为 2 个 sav、1 个 clr',
        !!bak && bak.records.filter(r => r.type === 'sav').length === 2 &&
        bak.records.filter(r => r.type === 'clr').length === 1);

    const lookup = (s, e) => {
        if (s === 1 && e === 1) return { title: '故事甲', hash: 111 };
        if (s === 1 && e === 2) return { title: '故事乙', hash: 222 };
        return null;
    };

    /* 全部恢复 */
    resetStorage();
    const r1 = Persist.importBackup(json, lookup);
    check('导入:ok=true', r1.ok === true, JSON.stringify(r1));
    check('导入:applied=3 stale=0 missing=0 skipped=0',
        r1.applied === 3 && r1.stale === 0 && r1.missing === 0 && r1.skipped === 0,
        JSON.stringify(r1));
    check('导入后存档恢复(sav_s1e1)', jsonEq(Persist.saveRead(1, 1, '故事甲', 111), { pc: 1 }));
    check('导入后通关标记恢复(clr_s2e1)', Persist.isCleared(2, 1) === true);

    /* storyLookup 返回 null → missing(sav 丢失,clr 仍然应用) */
    resetStorage();
    const r2 = Persist.importBackup(json, () => null);
    check('storyLookup=null:missing=2 且 clr 仍应用(applied=1)',
        r2.missing === 2 && r2.applied === 1 && r2.stale === 0, JSON.stringify(r2));

    /* 篡改 codeHash → stale */
    resetStorage();
    const tam = JSON.parse(json);
    for (const rec of tam.records) {
        if (rec.type === 'sav') {
            const o = JSON.parse(rec.data);
            o.codeHash = 999999;
            rec.data = JSON.stringify(o);
        }
    }
    const r3 = Persist.importBackup(JSON.stringify(tam), lookup);
    check('篡改 codeHash:stale=2,applied=1(clr 不校验 hash)',
        r3.stale === 2 && r3.applied === 1 && r3.missing === 0, JSON.stringify(r3));
    check('stale 记录未写入(storyLookup 匹配但 hash 不符)',
        Persist.hasSave(1, 1, '故事甲', 111) === false);

    /* 非 JSON / 坏 magic */
    const r4 = Persist.importBackup('这不是JSON', lookup);
    check('非 JSON:ok=false 且有 reason', r4.ok === false && typeof r4.reason === 'string' && r4.reason.length > 0);
    const r5 = Persist.importBackup(JSON.stringify({ magic: 'XXXX', ver: 1, records: [] }), lookup);
    check('坏 magic:ok=false 且有 reason', r5.ok === false && typeof r5.reason === 'string' && r5.reason.length > 0);

    /* 无效记录 → skipped */
    resetStorage();
    const r6 = Persist.importBackup(JSON.stringify({
        magic: 'MSBAK', ver: 1,
        records: [
            { type: 'xxx', series: 1, episode: 1, data: '{}' },
            { type: 'sav', series: -1, episode: 0, data: '{}' },
            { type: 'sav', series: 1, episode: 9, data: '不是JSON' },
        ],
    }), lookup);
    check('无效记录:skipped=3 applied=0 ok=true',
        r6.ok === true && r6.skipped === 3 && r6.applied === 0, JSON.stringify(r6));
}

/* ---------------- 套件 6:音量 ---------------- */

function suiteVolumes() {
    header('音量(Persist 0~8 档位 + Audio2.setVolumes 与静音正交)');

    resetStorage();
    check('AUDIO_VOL_MAX 常量为 8', K.AUDIO_VOL_MAX === 8);

    Persist.setBgmVol(3);
    check('setBgmVol(3) 往返', Persist.getBgmVol() === 3);
    Persist.setBgmVol(99);
    check('setBgmVol(99) 钳位到 8', Persist.getBgmVol() === 8);
    Persist.setBgmVol(-4);
    check('setBgmVol(-4) 钳位到 0', Persist.getBgmVol() === 0);
    Persist.setBgmVol(2.6);
    check('setBgmVol(2.6) 向下取整为 2', Persist.getBgmVol() === 2);

    Persist.setSfxVol(5);
    check('setSfxVol(5) 往返', Persist.getSfxVol() === 5);
    Persist.setSfxVol(123);
    check('setSfxVol(123) 钳位到 8', Persist.getSfxVol() === 8);
    Persist.setSfxVol(-1);
    check('setSfxVol(-1) 钳位到 0', Persist.getSfxVol() === 0);

    /* Audio2:创建垫片上下文后,setVolumes 应体现在 gain 节点上 */
    Audio2.ensure();
    check('Audio2.ensure() 创建了 AudioContext', !!g('Audio2._ctx'));
    Audio2.setMuted(false);
    Audio2.setVolumes(5, 6);
    check('setVolumes 记录 bgmVol=5 / sfxVol=6',
        Audio2.bgmVol === 5 && Audio2.sfxVol === 6,
        'bgm=' + Audio2.bgmVol + ' sfx=' + Audio2.sfxVol);
    const bgmGainOps = g('Audio2._bgmGain.gain.__ops');
    const sfxGainOps = g('Audio2._sfxGain.gain.__ops');
    const last = ops => ops.length ? ops[ops.length - 1].value : null;
    check('BGM 增益已按 5/8 下发', last(bgmGainOps) === 5 / 8, '实际 ' + last(bgmGainOps));
    check('音效增益已按 6/8 下发', last(sfxGainOps) === 6 / 8, '实际 ' + last(sfxGainOps));

    /* 静音正交性:切静音只动主增益,不动音量档位 */
    Audio2.setMuted(true);
    const masterOps = g('Audio2._master.gain.__ops');
    check('setMuted(true) 后主增益为 0', last(masterOps) === 0, '实际 ' + last(masterOps));
    check('setMuted 与音量正交(bgmVol/sfxVol 不变)',
        Audio2.bgmVol === 5 && Audio2.sfxVol === 6 && Audio2.muted === true);
    Audio2.setMuted(false);
    check('setMuted(false) 后主增益恢复 1', last(g('Audio2._master.gain.__ops')) === 1);
}

/* ---------------- 套件 7:StoryStore ---------------- */

async function suiteStoryStore() {
    header('StoryStore:槽位/彩蛋排除/存档标记/删除/导入/上限');

    resetStorage();
    StoryStore.slots.length = 0;
    await StoryStore.init();

    check('init 后槽位数为可见故事数(彩蛋不在列表)',
        StoryStore.count() === EMBEDDED_TOTAL - 1,
        '实际 ' + StoryStore.count() + ',期望 ' + (EMBEDDED_TOTAL - 1));
    check('easter_egg 不出现在槽位列表',
        StoryStore.list().every(s => s.story.fileName !== 'easter_egg.story'));
    check('槽位按 series/episode 升序', StoryStore.list().every((s, i) => i === 0 ||
        StoryStore.list()[i - 1].story.series < s.story.series ||
        (StoryStore.list()[i - 1].story.series === s.story.series &&
         StoryStore.list()[i - 1].story.episode <= s.story.episode)));
    check('全部槽位有非空标题', StoryStore.list().every(s => s.story.title && s.story.title.length > 0));
    check('全部槽位 imported=false(内置)',
        StoryStore.list().every(s => s.imported === false));
    check('缩略图已解码或为 null',
        StoryStore.list().every(s => s.thumb === null || (s.thumb && typeof s.thumb === 'object')));

    /* refreshSaveFlags */
    StoryStore.refreshSaveFlags();
    check('空存储下所有槽位 hasSave=false',
        StoryStore.list().every(s => s.hasSave === false));
    const slot0 = StoryStore.get(0);
    Persist.saveWrite(slot0.story.series, slot0.story.episode, slot0.story.title, slot0.story.hash, { pc: 1 });
    StoryStore.refreshSaveFlags();
    check('写入存档后 refreshSaveFlags 标记对应槽位 hasSave=true', slot0.hasSave === true);
    check('其余槽位 hasSave 仍为 false',
        StoryStore.list().filter((s, i) => i !== 0).every(s => s.hasSave === false));

    /* findBySeriesEpisode */
    check('findBySeriesEpisode 命中槽位 0',
        StoryStore.findBySeriesEpisode(slot0.story.series, slot0.story.episode) === slot0);
    check('findBySeriesEpisode 未命中返回 null',
        StoryStore.findBySeriesEpisode(999, 999) === null);

    /* 删除内置槽位:持久化到 ms_deleted,重新 init 后仍被排除 */
    const victimIdx = StoryStore.count() - 1;
    const victim = StoryStore.get(victimIdx);
    const victimName = victim.story.fileName;
    StoryStore.deleteSlot(victimIdx);
    check('deleteSlot 后槽位减一', StoryStore.count() === EMBEDDED_TOTAL - 2,
        '实际 ' + StoryStore.count());
    const deletedList = JSON.parse(localStorage.getItem('ms_deleted') || '[]');
    check('删除记录写入 ms_deleted', deletedList.indexOf(victimName) >= 0,
        '实际 ' + JSON.stringify(deletedList));
    StoryStore.slots.length = 0;
    await StoryStore.init();
    check('重新 init 后仍为可见故事数 - 1(删除已持久化)',
        StoryStore.count() === EMBEDDED_TOTAL - 2, '实际 ' + StoryStore.count());
    check('被删故事不再出现',
        StoryStore.list().every(s => s.story.fileName !== victimName));

    /* 导入槽位:直接注入 ms_imported(pickImport 依赖文件选择器,跳过 UI 路径) */
    const eggStory = await StoryLoader.load('easter_egg.story');
    const b64 = Buffer.from(eggStory.raw).toString('base64');
    localStorage.setItem('ms_imported', JSON.stringify([{ fileName: 'imported_test.story', b64 }]));
    StoryStore.slots.length = 0;
    await StoryStore.init();
    check('注入 ms_imported 后槽位 = 剩余内置 + 1',
        StoryStore.count() === EMBEDDED_TOTAL - 1,
        '实际 ' + StoryStore.count() + ',期望 ' + (EMBEDDED_TOTAL - 1));
    const imp = StoryStore.list().find(s => s.imported === true);
    check('导入槽位 imported=true 且文件名正确',
        !!imp && imp.story.fileName === 'imported_test.story');
    check('导入故事解析出的 series/episode 与源一致',
        !!imp && imp.story.series === eggStory.series && imp.story.episode === eggStory.episode);

    /* 删除导入槽位:写回 ms_imported,不影响 ms_deleted */
    const deletedBefore = localStorage.getItem('ms_deleted');
    StoryStore.deleteSlot(StoryStore.list().indexOf(imp));
    check('删除导入槽位后槽位回到剩余内置数', StoryStore.count() === EMBEDDED_TOTAL - 2,
        '实际 ' + StoryStore.count());
    const importedList = JSON.parse(localStorage.getItem('ms_imported') || '[]');
    check('ms_imported 已写回(列表为空)', importedList.length === 0,
        '实际 ' + JSON.stringify(importedList));
    check('ms_deleted 未被导入删除污染', localStorage.getItem('ms_deleted') === deletedBefore);

    /* 槽位上限 + 注入假 slot */
    check('slotMax() = PM_SLOT_MAX = 14', StoryStore.slotMax() === K.PM_SLOT_MAX && K.PM_SLOT_MAX === 14);
    const fakes = [];
    while (StoryStore.count() < StoryStore.slotMax()) {
        const ep = StoryStore.count();
        const fake = {
            story: { fileName: 'fake' + ep, title: '假槽位', subtitle: '', series: 90, episode: ep, hash: 1, props: [], strings: [''], codeSize: 1, code: new Uint8Array([0xFF]), bgmTracks: [], cg: [], speakerCount: 0, thumbnail: null },
            thumb: null, imported: true,
        };
        StoryStore.slots.push(fake);
        fakes.push(fake);
    }
    check('注入假 slot 可填满到上限 14', StoryStore.count() === 14);
    check('填满后 findBySeriesEpisode 可找到假槽位',
        StoryStore.findBySeriesEpisode(90, fakes[0].story.episode) === fakes[0]);
    /* 清理假槽位 */
    StoryStore.slots.splice(StoryStore.list().indexOf(fakes[0]), fakes.length);

    skip('StoryStore.pickImport(SD 导入 UI)', '依赖浏览器文件选择器与 FileReader,无头环境不可走通');
}

/* ---------------- 套件 8:main.js 接线 ---------------- */

async function suiteMainWiring() {
    header('main.js 接线:暂停/存档/通关标记/设置页/组合键');

    /* 干净存储 + 重新加载槽位 */
    resetStorage();
    StoryStore.slots.length = 0;
    await StoryStore.init();
    gexec('Dialog.hide();');
    check('前置:可见故事槽位数正确', StoryStore.count() === EMBEDDED_TOTAL - 1,
        '实际 ' + StoryStore.count());

    /* —— 暂停 / 存档 / 通关标记(走真实 startSlotStory + gameKeyCb) —— */
    g('startSlotStory')(StoryStore.get(0).story, false);
    check('startSlotStory 后进入游戏画面', ScreenManager.current === K.SCR_GAME,
        'current=' + ScreenManager.current);
    const meta = StoryStore.get(0).story;

    /* 推进到第一个等待点(有些故事开头是 SHOW_BG 等非等待指令) */
    let guard = 0;
    while (Eng.action !== K.ACT_WAIT_CLICK && Eng.action !== K.ACT_WAIT_CHOICE &&
           Eng.action !== K.ACT_END && guard++ < 10000) {
        Eng.action = K.ACT_RUNNING;
        Eng.proceed();
        GameScreen.update(Eng);
    }
    check('startSlotStory 后引擎到达第一个等待点',
        Eng.action === K.ACT_WAIT_CLICK || Eng.action === K.ACT_WAIT_CHOICE,
        'action=' + Eng.action);

    GameScreen.handleKey(K.LV_KEY_ENTER); /* 打字机 → 全文 */
    GameScreen.enterPause();
    check('enterPause 后处于暂停菜单', GameScreen.isPaused() === true);
    GameScreen.save(Eng);
    check('暂停菜单保存存档成功(Persist.hasSave)',
        Persist.hasSave(meta.series, meta.episode, meta.title, meta.hash) === true);
    GameScreen.load(Eng);
    check('暂停菜单读取存档不抛异常且引擎可用', Eng.action !== K.ACT_ERROR);
    GameScreen.deleteSave();
    check('暂停菜单删除存档后 hasSave=false',
        Persist.hasSave(meta.series, meta.episode, meta.title, meta.hash) === false);

    /* END → 通关标记 + 回标题(main.js gameKeyCb 的收尾分支) */
    Eng.action = K.ACT_END;
    gameKeyCb(K.LV_KEY_ENTER);
    check('故事 END 后回到标题画面', ScreenManager.current === K.SCR_TITLE,
        'current=' + ScreenManager.current);
    check('END 后写入通关标记(clr)', Persist.isCleared(meta.series, meta.episode) === true);
    check('END 后清除了进行中的存档(sav)', Persist.hasSave(meta.series, meta.episode, meta.title, meta.hash) === false);
    check('END 后标题页已刷新 hasSave 标记', StoryStore.get(0).hasSave === false);

    /* —— 设置画面冒烟(音量/全屏/导出存档/导入存档/返回) —— */
    gexec('Dialog.hide(); ScreenManager.switch(SCR_SETTINGS); SettingsScreen.show();');
    check('设置画面已激活', SettingsScreen.isActive() === true);

    Audio2.setVolumes(0, 0);
    Persist.setBgmVol(0);
    Persist.setSfxVol(0);
    ssHandleKey(K.LV_KEY_DOWN); /* → BGM 音量行 */
    ssHandleKey(K.LV_KEY_RIGHT); /* +1 */
    check('设置页调节 BGM 音量:Audio2 与 Persist 同步为 1',
        Audio2.bgmVol === 1 && Persist.getBgmVol() === 1,
        'audio=' + Audio2.bgmVol + ' persist=' + Persist.getBgmVol());
    ssHandleKey(K.LV_KEY_DOWN); /* → 音效音量行 */
    ssHandleKey(K.LV_KEY_RIGHT);
    check('设置页调节音效音量同步为 1',
        Audio2.sfxVol === 1 && Persist.getSfxVol() === 1);

    ssHandleKey(K.LV_KEY_DOWN); /* → 全屏行 */
    ssHandleKey(K.LV_KEY_ENTER); /* 进入全屏(垫片) */
    check('全屏开关:document.fullscreenElement 已设置', !!sandbox.document.fullscreenElement);

    ssHandleKey(K.LV_KEY_DOWN); /* → 导出存档行 */
    ssHandleKey(K.LV_KEY_ENTER); /* _exportSaves → Blob/URL + Dialog */
    check('导出存档弹出成功对话框',
        Dialog.isActive() === true && Dialog.optText[0] && String(Dialog.optText[0]).indexOf('已导出') === 0,
        'optText=' + JSON.stringify(Dialog.optText));
    Dialog.hide();

    ssHandleKey(K.LV_KEY_DOWN); /* → 导入存档行 */
    ssHandleKey(K.LV_KEY_ENTER); /* 创建 file input,点击无文件不触发 */
    check('导入存档入口可触发(无头下不打开选择器也不抛异常)', SettingsScreen.isActive() === true);

    ssHandleKey(K.LV_KEY_DOWN); /* → [返回标题] */
    ssHandleKey(K.LV_KEY_ENTER); /* hide */
    check('设置页「返回标题」后画面关闭', SettingsScreen.isActive() === false);
    gameKeyCb(K.LV_KEY_ESC); /* gameKeyCb 的 SETTINGS 分支:inactive → 回标题 */
    check('Esc 后回到标题画面', ScreenManager.current === K.SCR_TITLE);

    /* —— Konami 组合键(替换 startEggStory 打点验证) —— */
    gexec(
        'globalThis.__eggCalls = 0;\n' +
        'const __origStartEgg = startEggStory;\n' +
        'startEggStory = function () { globalThis.__eggCalls++; __origStartEgg(); };\n'
    );

    const eggCalls0 = g('globalThis.__eggCalls');

    /* 正例:完整 KONAMI_SEQ(↑↑↓↓←→←→B A)。
     * 先把组合键进度归零:跟踪器只做单前缀匹配,前序测试残留的按键进度会吞掉首个 UP。 */
    gexec('Combos[0].pos = 0; Combos[1].pos = 0;');
    let matched = false;
    for (const key of KONAMI_SEQ) matched = comboFeed(key);
    check('完整 Konami 序列触发一次 onKonami', g('globalThis.__eggCalls') === eggCalls0 + 1,
        '调用次数=' + g('globalThis.__eggCalls'));
    check('comboFeed 在匹配键返回 true', matched === true);
    const eggLoaded = await waitFor(
        () => g('ScreenManager.current === SCR_GAME') === true, 3000, '彩蛋故事加载');
    check('Konami 后彩蛋故事异步加载并进入游戏画面', eggLoaded);
    check('彩蛋故事引擎已启动且无 ACT_ERROR', Eng.action !== K.ACT_ERROR, 'action=' + Eng.action);
    check('彩蛋故事不标记存档元数据(S.storyMetaValid=false)', g('S').storyMetaValid === false);

    /* 再次完整序列可重复触发 */
    for (const key of KONAMI_SEQ) comboFeed(key);
    check('Konami 可重复触发(共 2 次)', g('globalThis.__eggCalls') === eggCalls0 + 2,
        '调用次数=' + g('globalThis.__eggCalls'));

    /* 负例:不完整序列不触发(放在正例后,避免残留进度干扰正例) */
    const eggBefore = g('globalThis.__eggCalls');
    for (const key of [K.LV_KEY_UP, K.LV_KEY_UP, K.LV_KEY_UP]) comboFeed(key);
    check('不完整序列不触发彩蛋', g('globalThis.__eggCalls') === eggBefore);

    /* —— B×4 重置问候计数 —— */
    Persist.setGreetCount(9);
    let greetMatched = false;
    for (const key of GREET_RESET_SEQ) greetMatched = comboFeed(key);
    check('Esc×4 触发问候重置(计数回到 ' + K.GREET_INIT + ')',
        Persist.getGreetCount() === K.GREET_INIT, '实际 ' + Persist.getGreetCount());
    check('GREET_RESET_SEQ 匹配返回 true', greetMatched === true);
    check('标题页显示「问候已重置」提示', TitleScreen.toastText === '问候已重置',
        '实际 ' + JSON.stringify(TitleScreen.toastText));

    /* —— 机身状态灯 SysLed（三态 + 扩展口） —— */
    check('SysLed 已随 bundle 加载', gexec('typeof SysLed') === 'object');
    check('frame() 主循环已接 SysLed.tick()', g('frame').toString().indexOf('SysLed') >= 0);
    check('boot() 已接 SysLed.init() 与 unhandledrejection 兜底',
        g('boot').toString().indexOf('SysLed') >= 0 &&
        g('boot').toString().indexOf('unhandledrejection') >= 0);

    /* 无灯节点时 init/tick 不抛（垫片未预置 sys-led，覆盖早退分支） */
    const ledNoEl = gexec('(function () { try { SysLed._el = null; SysLed.init(); SysLed.tick(); return "ok"; } catch (e) { return "ERR:" + e; } })()');
    check('无灯节点时 SysLed.init/tick 不抛异常', ledNoEl === 'ok', String(ledNoEl));

    /* 测试内现搭 #sys-led（垫片 id 自动登记，无需改 shims） */
    const ledMounted = gexec('(function () { var el = document.createElement("span"); el.id = "sys-led"; el.className = "sys-led-idle"; document.body.appendChild(el); return document.getElementById("sys-led") === el; })()');
    check('测试内可现搭 #sys-led 节点', ledMounted === true);

    gexec('Dialog.hide(); ScreenManager.switch(SCR_TITLE); Eng.action = ACT_RUNNING; SysLed.init();');
    check('标题画面灯为待机绿 idle', gexec('SysLed.cur()') === 'idle', '实际 ' + gexec('SysLed.cur()'));
    check('灯节点 class 切到 sys-led-idle',
        gexec('document.getElementById("sys-led").className') === 'sys-led-idle');
    gexec('ScreenManager.switch(SCR_GAME); SysLed.tick();');
    check('游戏画面灯为红 play', gexec('SysLed.cur()') === 'play', '实际 ' + gexec('SysLed.cur()'));
    check('灯节点 class 切到 sys-led-play',
        gexec('document.getElementById("sys-led").className') === 'sys-led-play');
    gexec('Eng.action = ACT_ERROR; SysLed.tick();');
    check('ACT_ERROR 灯为琥珀 error（优先于 play）', gexec('SysLed.cur()') === 'error',
        '实际 ' + gexec('SysLed.cur()'));
    gexec('Eng.action = ACT_RUNNING; ScreenManager.switch(SCR_TITLE); SysLed.tick();');
    check('回标题后灯回到 idle', gexec('SysLed.cur()') === 'idle');

    /* 扩展口：注册自定义状态即时生效，未知状态忽略 */
    gexec('SysLed.register("custom", "#123456"); SysLed.set("custom");');
    check('register+set 自定义状态生效',
        gexec('SysLed.cur()') === 'custom' &&
        gexec('document.getElementById("sys-led").getAttribute("data-state")') === 'custom' &&
        gexec('document.getElementById("sys-led").style.background') === '#123456');
    gexec('SysLed.set("nope-x");');
    check('set 未知状态被忽略', gexec('SysLed.cur()') === 'custom');
    gexec('SysLed.set("idle"); Eng.action = ACT_RUNNING; ScreenManager.switch(SCR_TITLE); Dialog.hide();');
}

/* ---------------- 主流程 ---------------- */

async function main() {
    console.log('MicroStory-Web 无头冒烟测试');
    console.log('Node ' + process.version + ' · 平台 ' + process.platform +
        ' · 脚本数 ' + scriptPaths.length + ' · bundle ' + (bundle.length / 1024).toFixed(0) + 'KB');

    await suiteBoot();
    suiteStories();
    suiteEngineRuns();
    suiteMinigames();
    suitePersist();
    suiteBackup();
    await suiteVolumes();
    await suiteStoryStore();
    await suiteMainWiring();

    /* 收尾:再给微任务/定时器一次机会,让潜在异步失败暴露 */
    await flush();
    await flush();
    failCount += asyncFailures;

    console.log('\n========================================');
    console.log('汇总:通过 ' + passCount + ' · 失败 ' + failCount + ' · 跳过 ' + skipCount);
    if (failCount === 0) {
        console.log('结果:全部通过');
    } else {
        console.log('结果:存在失败项');
    }
    process.exit(failCount === 0 ? 0 : 1);
}

main().catch(e => {
    console.error('测试主流程异常退出:' + (e && e.stack ? e.stack : e));
    process.exit(1);
});
