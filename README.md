# MicroStory-Web

ESP32 掌机游戏 MicroStory 的 H5 移植版：纯原生 JavaScript + Canvas，无框架、无构建、零依赖。视觉小说引擎、9 个小游戏、存档、Konami 彩蛋全部收录，页面本身就是一台 DMG-01 风格的米灰复古掌机。

## 运行

直接双击 `index.html` 即可（故事数据已内嵌）。也可以起个静态服务器：

```powershell
python -m http.server 8000
# 浏览器打开 http://localhost:8000
```

> 首次运行需点击一下画面（浏览器自动播放策略），之后按键才会有声音。

## 操作

| 按键 | 功能 |
|------|------|
| ↑ ↓ ← → / WASD | 移动 / 选项 |
| Enter / Space / Z / 单击画面 | A（确认、推进对话） |
| Esc / Backspace / X | B（暂停菜单、返回） |

- 标题画面 Konami（↑↑↓↓←→←→ B A）→ 彩蛋故事
- 设置页可备份/恢复存档、调音量、切全屏、导入 `.story` 文件

## 测试

```powershell
node test/integration.js
```
