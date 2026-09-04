# MicroStory-Web

ESP32 掌机游戏 **MicroStory（xiaomiao）** 的 H5 移植版：纯原生 JavaScript + Canvas，
无框架、无构建、零依赖。视觉小说引擎、9 个小游戏、存档（Cookie）、Konami 彩蛋、
开机问候、静音设置全部移植自 `F:\MicroStory`（ESP-IDF v5.5.1 + LVGL 9.5 + 自定义字节码引擎）。

## 运行

**直接双击 `index.html` 即可**（故事数据已内嵌 base64 到 `js/stories.js`）。
也可以起个静态服务器（推荐，会优先加载 `stories/` 目录下的 `.story` 文件）：

```powershell
python -m http.server 8000
# 浏览器打开 http://localhost:8000
```

> 首次运行需点击一下画面（浏览器自动播放策略），之后按键才会有声音。

## 操作

| 按键 | 功能 |
|------|------|
| ↑ ↓ ← → / WASD | 移动 / 选项 / 列表 |
| Enter / Space / Z / 单击画面 | A（推进对话、确认、连打） |
| Esc / Backspace / X | B（暂停菜单、小游戏退出） |

触屏设备会自动显示虚拟方向键 + A/B 按钮。

- 标题画面 Konami（↑↑↓↓←→←→ B A）→ 彩蛋故事
- 标题页连按 **B×4** → 重置开机问候计数

## 与掌机版的对应关系

| 掌机（C / ESP-IDF） | Web（JS） |
|------|------|
| `components/story_engine/engine.c` | `js/core/engine.js`（字节码解释器 + 属性 + 存档序列化） |
| `main.c` `setup_slot_story` 的 `.story` 解析 | `js/core/story.js` |
| `main.c` 主循环 / 组合键 / 问候 / 小游戏调度 | `js/main.js` |
| `main/app/part_manager.c`（14 槽位分区） | `js/core/story_store.js`（localStorage 槽位 + 文件导入） |
| `main/app/persist.c`（NVS） | `js/core/persist.js`（**Cookie**：存档/通关/问候/静音） |
| `main/app/music_player.c`（蜂鸣器 PWM） | `js/core/audio.js`（WebAudio 方波合成） |
| `main/ui/*`（LVGL 界面） | `js/ui/*`（Canvas 绘制） |
| `main/games/game_*.c` | `js/games/game_*.js` |
| `main/app/img_decoder.c`（RLE 解码） | `js/core/story.js` 的 `decodeCg` |
| 字库 `font_cjk`（MiSans） | `font/MiSans-Normal.ttf`（@font-face） |

## 存档（Cookie）

- 存档键 `sav_s{series}e{ep}`：含 magic/title/FNV-1a code_hash 校验，故事重编后自动判失效
- 通关键 `clr_s{series}e{ep}`、问候计数 `greet`（默认 5）、静音 `mute`、音量 `bgmvol`/`sfxvol`（0~8）
- 清除 Cookie 即重置全部进度；`localStorage` 另存"已删除槽位"与"导入的故事"

### 存档备份（防止清 Cookie 丢进度）

- 设置 → 管理 → **导出存档**：把全部存档/通关记录下载为 `microstory-saves-YYYYMMDD.json`
- 设置 → 管理 → **导入存档**：选择备份文件恢复；逐条校验 magic/title/code_hash，
  只恢复与当前已安装故事匹配的记录，不匹配/未安装/无效的条目会分类计数提示
- 故事重编后旧存档不再被静默忽略：启动该故事或读取存档时会明确提示「存档已失效」并清除
- 设置 → 管理页还可调节 **BGM/音效音量**（←→ 或 A，0~8 格）与 **全屏** 切换

## 移动端适配清单

已落实（代码层）：

- [x] 首次交互解锁 AudioContext（点击/按键/虚拟键多入口调用 `Audio2.ensure()`）
- [x] 震动反馈均有 `navigator.vibrate` 存在性守卫（iOS Safari 无此 API 时静默跳过）
- [x] 虚拟方向键常驻可开关（`ms_pad_visible`），布局计算预留 168px 底部空间
- [x] 整数倍像素化缩放 + `devicePixelRatio` 取整，DPR 1.25/1.5 屏幕不模糊
- [x] 触屏单击画面 = A 键；`user-scalable=no` 禁双击缩放

待真机验证（欢迎反馈）：

- [ ] iOS Safari：静音按钮→游戏内声音的解锁时序；虚拟按键在浏览器工具栏收展时的表现
- [ ] Android Chrome：后台切回后 AudioContext 恢复；外接手柄与虚拟按键并存
- [ ] 小屏（<360px 宽）：画面缩放后虚拟按键与提示文字是否互相遮挡

## 故事数据更新

故事源在 `F:\MicroStory\projects\*\*.script`，用其 `compile_script.py` 编译出 `.story` 后：

```powershell
python tools/gen_story_data.py F:\MicroStory\stories
```

脚本会：复制 12 个 `.story` 到 `stories/` 并重新生成内嵌数据的 `js/stories.js`。

## 字体

- 页面字体为 MiSans 子集 `font/MiSans-Subset.ttf`（由 `font/MiSans-Normal.ttf` 子集化生成，原文件保留作子集源，勿删）。
- 新增故事或改动文本后重新生成（自动收集 js/html/css、stories/*.story 文本、GB2312 一级汉字，并自检缺字）：`python tools/subset_font.py`（依赖 fonttools）。

## 已知差异（有意为之）

- 硬件传感器（温度/光照）健康提醒未移植（Web 无传感器）
- 「SD 卡」页改为文件选择器导入 `.story`（安装到槽位，可删除）
- 围兔子 AI 思考时间从 800ms 降为 300ms（避免浏览器卡顿）
- 关于页版本号为 `MicroStory-Web v1.0.0`

## 测试

无头冒烟测试(纯 Node >=18 零依赖,`node:vm` 加载 index.html 全部脚本 + DOM/Canvas/cookie/storage 垫片,
覆盖全部故事引擎全流程、9 个小游戏、存档/备份/音量、槽位管理与组合键):

```powershell
node test/integration.js
```

GitHub Actions CI 在 push/PR 时自动运行同一命令,见 `.github/workflows/ci.yml`。
