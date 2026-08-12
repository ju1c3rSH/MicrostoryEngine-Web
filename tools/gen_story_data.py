#!/usr/bin/env python3
"""
gen_story_data.py - 生成 js/stories.js（内嵌 base64 故事数据）

将 stories/ 目录下所有 .story 文件编码为 base64 写入 js/stories.js，
使 Web 版在 file:// 下双击 index.html 即可运行（无需 HTTP 服务器）。

同时会尝试把 stories/*.story 复制到 web 项目的 stories/ 目录（fetch 优先路径）。

用法：
  python tools/gen_story_data.py [源故事目录] [输出js路径]
"""
import base64
import glob
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def main():
    src_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "..", "MicroStory", "stories")
    egg = os.path.join(ROOT, "..", "MicroStory", "projects", "easter_egg", "easter_egg.story")
    out_js = os.path.join(ROOT, "js", "stories.js")
    out_stories = os.path.join(ROOT, "stories")

    files = sorted(glob.glob(os.path.join(src_dir, "*.story")))
    if os.path.exists(egg):
        files.append(egg)

    if not files:
        print("no .story files found in", src_dir)
        sys.exit(1)

    os.makedirs(out_stories, exist_ok=True)
    entries = []
    for f in files:
        name = os.path.basename(f)
        data = open(f, "rb").read()
        b64 = base64.b64encode(data).decode("ascii")
        entries.append((name, b64))
        shutil.copyfile(f, os.path.join(out_stories, name))

    with open(out_js, "w", encoding="utf-8") as fh:
        fh.write("/* 自动生成，勿手改：python tools/gen_story_data.py */\n")
        fh.write("/* 故事数据 base64 内嵌，供 file:// 直接运行（fetch 失败时回退） */\n")
        fh.write("const EMBEDDED_STORIES = {\n")
        for name, b64 in entries:
            fh.write("  %r: %r,\n" % (name, b64))
        fh.write("};\n")

    total = sum(len(e[1]) for e in entries)
    print("embedded %d stories, %d base64 bytes -> %s" % (len(entries), total, out_js))


if __name__ == "__main__":
    main()
