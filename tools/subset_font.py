#!/usr/bin/env python3
"""
subset_font.py - 生成 font/MiSans-Subset.ttf（MiSans 子集，可重复执行）

把 8MB 的 MiSans-Normal.ttf 按实际需要的字符集子集化，大幅缩小体积。
输出为 TTF 格式（非 woff2），保证 file:// 下 @font-face 直接加载兼容。

字符集取以下来源的并集：
  (a) js/**/*.js、index.html、css/shell.css 中出现的全部非 ASCII 字符
  (b) 解析 stories/*.story（复刻 js/core/story.js 的 parseStory 逻辑）提取的
      全部文本字符：标题/副标题/字符串表/属性名/CG 名（UTF-8，\0 分隔）
  (c) ASCII 可打印区 0x20-0x7E
  (d) 常用 CJK 标点与符号
  (e) GB2312 一级汉字 3755 个（未来故事的安全余量）

生成后自检：读回子集字体，校验 cmap 覆盖抽样文本 + 每个 .story 提取文本的
全部字符；若"源字体有而子集缺"的字（真正的子集化丢字）非零退出；若源字体
本身就没有的字（如 emoji，浏览器走系统字体兜底，行为与子集化前一致）仅警告。

用法：
  python tools/subset_font.py
"""
import glob
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

SRC_FONT = os.path.join(ROOT, "font", "MiSans-Normal.ttf")
DST_FONT = os.path.join(ROOT, "font", "MiSans-Subset.ttf")

# 自检抽样文本（覆盖 UI 高频词）
SAMPLE_TEXT = "MicroStory 掌机 视觉小说 选项 设置 存档 静音 全屏 音效 开始游戏 上下左右确认取消"

# (d) 常用 CJK 标点与符号（任务列举 + 合理补充；故事文本字符由 (b) 动态覆盖）
EXTRA_CHARS = (
    # 中文标点
    "，。！？：；、·…—～―ー"
    # 引号与书名号/括号
    "“”‘’«»‹›„「」『』【】〖〗〔〕《》〈〉（）［］｛｝"
    # 全角符号
    "￥％＋－＊／＝＄"
    # 常用符号
    "※♪♬♪★☆♂♀♥♦♣♠○●◎◇◆□■△▲▽▼"
    "←↑→↓↔⇒⇔√±×÷≈≠≤≥℃°‰§№†‡©®™"
    "¨ˉˊˋ˙〒〓"
    # 全角空格
    "\u3000"
)


class StoryParseError(Exception):
    """解析 .story 失败（结构错误），必须报错而不是静默跳过。"""


def decode_utf8(raw, warnings):
    """与 TextDecoder 默认行为一致：UTF-8，非法序列替换为 U+FFFD。"""
    text = raw.decode("utf-8", errors="replace")
    if "\ufffd" in text:
        warnings.append("含 %d 个无法解码的 UTF-8 序列（已按 U+FFFD 替换）" % text.count("\ufffd"))
    return text


def parse_story(path, warnings):
    """复刻 js/core/story.js parseStory()：返回该故事提取到的全部文本字符集合。"""
    b = open(path, "rb").read()
    if len(b) < 30 or b[0] != 0x53 or b[1] != 0x54:
        raise StoryParseError("%s: 缺少 ST 魔数或文件过短" % path)
    ver = b[2] | (b[3] << 8)
    if ver < 1 or ver > 5:
        raise StoryParseError("%s: 版本号 %d 超出 1-5" % (path, ver))

    def u16(o):
        return b[o] | (b[o + 1] << 8)

    def u32(o):
        return b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)

    def i16(o):
        v = u16(o)
        return v - 0x10000 if v >= 0x8000 else v

    # 头部字段：与 parseStory 完全一致的顺序
    pos = 4
    tlen = b[pos]; pos += 1
    title = decode_utf8(b[pos:pos + tlen], warnings); pos += tlen
    slen = b[pos]; pos += 1
    subtitle = decode_utf8(b[pos:pos + slen], warnings); pos += slen

    code_size = u16(pos); pos += 2
    str_ofs = u32(pos); pos += 4
    str_count = u16(pos); pos += 2
    pos += 1                      # speakerCount
    prop_ofs = u32(pos); pos += 4
    prop_count = b[pos]; pos += 1
    pos += 4 + 1                  # bgmOfs + bgmCount
    pos += 4 + 1                  # bgOfs + bgCount
    cg_ofs, cg_count = 0, 0
    if ver >= 2:
        pos += 8                  # thumbOfs + thumbSize
    if ver >= 3:
        cg_ofs = u32(pos); pos += 4
        cg_count = b[pos]; pos += 1
    if ver >= 4:
        pos += 1                  # series
    if ver >= 5:
        pos += 1                  # episode

    texts = [title, subtitle]

    # 字符串表：\0 分隔扁平 blob，区间 [strOfs, min(propOfs, len))
    str_end = min(prop_ofs, len(b))
    sp, i = str_ofs, 0
    while i < str_count and sp < str_end:
        e = sp
        while e < str_end and b[e] != 0:
            e += 1
        texts.append(decode_utf8(b[sp:e], warnings))
        sp = e + 1
        i += 1
    if i != str_count:
        raise StoryParseError("%s: 字符串表不完整，读到 %d/%d 条" % (path, i, str_count))

    # 属性名（属性面板会显示）
    pp = prop_ofs
    for _ in range(prop_count):
        if not pp + 7 < len(b):
            raise StoryParseError("%s: 属性表越界" % path)
        nlen = b[pp]; pp += 1
        texts.append(decode_utf8(b[pp:pp + nlen], warnings)); pp += nlen
        pp += 6                   # min/max/default 各 i16

    # CG 资源名（一并纳入，成本极低）
    if ver >= 3:
        cp = cg_ofs
        for _ in range(cg_count):
            if cp + 5 > len(b):
                raise StoryParseError("%s: CG 表越界" % path)
            nlen = b[cp]; cp += 1
            texts.append(decode_utf8(b[cp:cp + nlen], warnings)); cp += nlen
            rle_size = u32(cp); cp += 4
            cp += rle_size

    chars = set()
    for t in texts:
        for ch in t:
            o = ord(ch)
            if o >= 0x20 and ch != "\ufffd":
                chars.add(ch)
    return chars


def collect_source_chars(warnings):
    """(a) js/**/*.js + index.html + css/shell.css 中的非 ASCII 字符。"""
    files = sorted(glob.glob(os.path.join(ROOT, "js", "**", "*.js"), recursive=True))
    files.append(os.path.join(ROOT, "index.html"))
    files.append(os.path.join(ROOT, "css", "shell.css"))
    chars = set()
    for f in files:
        text = open(f, encoding="utf-8").read()
        for ch in text:
            if ord(ch) > 127:
                chars.add(ch)
    return chars, files


def gb2312_level1():
    """(e) GB2312 一级汉字（0xB0A1-0xD7F9），应恰好 3755 个。"""
    chars = []
    for hi in range(0xB0, 0xD8):
        for lo in range(0xA1, 0xFF):
            try:
                chars.append(bytes([hi, lo]).decode("gb2312"))
            except UnicodeDecodeError:
                # 0xD7FA-0xD7FE 为标准保留码位（无汉字），跳过
                if hi == 0xD7 and lo >= 0xFA:
                    continue
                raise StoryParseError("GB2312 一级汉字区出现无法解码的码位 %02X%02X" % (hi, lo))
    if len(chars) != 3755:
        raise StoryParseError("GB2312 一级汉字数量异常：%d（应为 3755）" % len(chars))
    return chars


def main():
    if not os.path.exists(SRC_FONT):
        print("错误：找不到源字体 %s" % SRC_FONT)
        sys.exit(1)

    # ---------- 1. 收集字符集 ----------
    warnings = []
    js_chars, js_files = collect_source_chars(warnings)

    story_files = sorted(glob.glob(os.path.join(ROOT, "stories", "*.story")))
    if not story_files:
        print("错误：stories/ 下没有 .story 文件")
        sys.exit(1)
    story_chars = set()
    for f in story_files:
        story_chars |= parse_story(f, warnings)

    ascii_chars = {chr(c) for c in range(0x20, 0x7F)}
    extra_chars = set(EXTRA_CHARS)
    gb_chars = set(gb2312_level1())

    charset = js_chars | story_chars | ascii_chars | extra_chars | gb_chars

    print("字符集来源统计：")
    print("  (a) JS/HTML/CSS 非ASCII : %5d 个（%d 个文件）" % (len(js_chars), len(js_files)))
    print("  (b) stories/*.story 文本 : %5d 个（%d 个故事）" % (len(story_chars), len(story_files)))
    print("  (c) ASCII 可打印区       : %5d 个" % len(ascii_chars))
    print("  (d) 常用标点符号         : %5d 个" % len(extra_chars))
    print("  (e) GB2312 一级汉字      : %5d 个" % len(gb_chars))
    print("  并集总计                 : %5d 个" % len(charset))
    for w in sorted(set(warnings)):
        print("  警告：%s" % w)

    # ---------- 2. 子集化（TTF 输出，file:// 下 @font-face 兼容） ----------
    from fontTools import subset
    from fontTools.ttLib import TTFont

    opts = subset.Options()
    opts.layout_features = ["*"]   # 保留全部排版特性（kern 等），避免字距变化
    opts.notdef_outline = True     # 保留 .notdef 轮廓，缺字时显示豆腐块而非空白
    opts.flavor = None             # 强制 TTF（不用 woff2）

    font = subset.load_font(SRC_FONT, opts)
    subsetter = subset.Subsetter(opts)
    subsetter.populate(unicodes=sorted(ord(c) for c in charset))
    subsetter.subset(font)
    subset.save_font(font, DST_FONT, opts)

    # ---------- 3. 自检：读回子集字体校验 cmap 覆盖 ----------
    src_font = TTFont(SRC_FONT, lazy=True)
    sub_font = TTFont(DST_FONT, lazy=True)
    src_cmap = src_font.getBestCmap()
    sub_cmap = sub_font.getBestCmap()

    # 必查集合：抽样文本 + 全部 .story 文本 + (a)(c)(d)（GB2312 余量一并核对）
    required = (set(SAMPLE_TEXT) | story_chars | js_chars
                | ascii_chars | extra_chars | gb_chars)

    lost, absent_in_src = [], []
    for ch in sorted(required, key=ord):
        cp = ord(ch)
        if cp in sub_cmap:
            continue
        if cp in src_cmap:
            lost.append(ch)          # 源字体有而子集缺：真丢字，致命
        else:
            absent_in_src.append(ch)  # 源字体本来就没有：无法靠子集化解决

    if lost:
        print("自检失败：以下 %d 个字在源字体中存在但子集缺失（渲染会退回系统字体）：" % len(lost))
        print("  " + "".join(lost))
        sys.exit(2)
    if absent_in_src:
        print("注意：%d 个字符 MiSans 源字体本身不含（与子集化前行为一致，浏览器兜底）：" % len(absent_in_src))
        print("  " + "".join(absent_in_src))
    print("自检通过：抽样文本 + %d 个故事全部文本 + GB2312 一级汉字均在子集 cmap 中" % len(story_files))
    print("子集字形数：%d（源字体 %d）" % (len(sub_font.getGlyphOrder()), len(src_font.getGlyphOrder())))

    # ---------- 4. 体积对比 ----------
    src_size = os.path.getsize(SRC_FONT)
    dst_size = os.path.getsize(DST_FONT)
    print("体积对比：")
    print("  原始 %s : %s 字节" % (os.path.basename(SRC_FONT), format(src_size, ",")))
    print("  子集 %s : %s 字节" % (os.path.basename(DST_FONT), format(dst_size, ",")))
    print("  缩小到 %.1f%%（减少 %.1f%%）" % (dst_size / src_size * 100, (1 - dst_size / src_size) * 100))


if __name__ == "__main__":
    main()
