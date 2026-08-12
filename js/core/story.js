/* story.js - .story 二进制格式解析（main.c setup_slot_story 移植）
 *
 * 布局见 docs（AGENTS.md）：签名/版本/标题/偏移表/字节码/字符串/属性/BGM/CG/缩略图。
 * 同时提供 RGB565 与 RLE 图像解码（img_decoder.c + 缩略图）。
 */

/* 解析 .story 二进制 → 故事对象 */
function parseStory(fileName, bytes) {
    if (bytes.length < 30 || bytes[0] !== 0x53 || bytes[1] !== 0x54) return null; /* "ST" */
    const ver = bytes[2] | (bytes[3] << 8);
    if (ver < 1 || ver > 5) return null;

    const u16 = o => bytes[o] | (bytes[o + 1] << 8);
    const u32 = o => bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16) | (bytes[o + 3] << 24);
    const i16 = o => { const v = u16(o); return v >= 0x8000 ? v - 0x10000 : v; };

    let pos = 4;
    const tlen = bytes[pos++];
    const title = new TextDecoder().decode(bytes.subarray(pos, pos + tlen));
    pos += tlen;
    const slen = bytes[pos++];
    const subtitle = new TextDecoder().decode(bytes.subarray(pos, pos + slen));
    pos += slen;

    const hdrBase = ver === 1 ? 30 : ver === 2 ? 38 : ver === 3 ? 43 : ver === 4 ? 44 : 45;
    const codeSize = u16(pos); pos += 2;
    const strOfs = u32(pos); pos += 4;
    const strCount = u16(pos); pos += 2;
    const speakerCount = bytes[pos++];
    const propOfs = u32(pos); pos += 4;
    const propCount = bytes[pos++];
    const bgmOfs = u32(pos); pos += 4;
    const bgmCount = bytes[pos++];
    const bgOfs = u32(pos); pos += 4;
    const bgCount = bytes[pos++];

    let thumbOfs = 0, thumbSize = 0;
    let cgOfs = 0, cgCount = 0;
    let series = 0, episode = 0;
    if (ver >= 2) { thumbOfs = u32(pos); pos += 4; thumbSize = u32(pos); pos += 4; }
    if (ver >= 3) { cgOfs = u32(pos); pos += 4; cgCount = bytes[pos++]; }
    if (ver >= 4) series = bytes[pos++];
    if (ver >= 5) episode = bytes[pos++];

    /* 字节码 */
    const codeStart = 4 + 1 + tlen + 1 + slen + (hdrBase - 6);
    const code = bytes.subarray(codeStart, codeStart + codeSize);

    /* 字符串表（\0 分隔扁平 blob） */
    const strings = [];
    let sp = strOfs;
    const strEnd = Math.min(propOfs, bytes.length);
    for (let i = 0; i < strCount && sp < strEnd; i++) {
        let e = sp;
        while (e < strEnd && bytes[e] !== 0) e++;
        strings.push(new TextDecoder().decode(bytes.subarray(sp, e)));
        sp = e + 1;
    }

    /* 属性定义 */
    const props = [];
    let pp = propOfs;
    for (let i = 0; i < propCount && pp + 7 < bytes.length; i++) {
        const nlen = bytes[pp++];
        const name = new TextDecoder().decode(bytes.subarray(pp, pp + nlen));
        pp += nlen;
        const min = i16(pp); pp += 2;
        const max = i16(pp); pp += 2;
        const dv = i16(pp); pp += 2;
        props.push({ name, min, max, default_val: dv });
    }

    /* BGM 音轨 */
    const bgmTracks = [];
    let bp = bgmOfs;
    for (let i = 0; i < bgmCount; i++) {
        const n = u16(bp); bp += 2;
        const notes = [];
        for (let j = 0; j < n && bp + 5 <= bytes.length; j++) {
            notes.push({ freq: u16(bp), duration_ms: u16(bp + 2), velocity: bytes[bp + 4] });
            bp += 5;
        }
        bgmTracks.push(notes);
    }

    /* CG 资源（RLE，格式见 img_decoder.c） */
    const cg = [];
    let cp = cgOfs;
    for (let i = 0; i < cgCount && cp + 5 <= bytes.length; i++) {
        const nlen = bytes[cp++];
        const name = new TextDecoder().decode(bytes.subarray(cp, cp + nlen));
        cp += nlen;
        const rleSize = u32(cp); cp += 4;
        cg.push({ name, rle: bytes.subarray(cp, cp + rleSize) });
        cp += rleSize;
    }

    const thumbnail = (thumbOfs > 0 && thumbSize > 0)
        ? bytes.subarray(thumbOfs, thumbOfs + thumbSize) : null;

    return {
        fileName,
        title,
        subtitle,
        code,
        codeSize,
        strings,
        speakerCount,
        props,
        bgmTracks,
        cg,
        thumbnail,
        series,
        episode,
        hash: fnv1a32(bytes),
        raw: bytes,
    };
}

/* ---------- 图像解码 ---------- */

const CG_W = 160, CG_H = 128;
const THUMB_W = 48, THUMB_H = 48;

/* RLE/raw RGB565（小端）→ 160×128 canvas */
function decodeCg(rleBytes) {
    const canvas = document.createElement('canvas');
    canvas.width = CG_W; canvas.height = CG_H;
    const cctx = canvas.getContext('2d');
    const imgData = cctx.createImageData(CG_W, CG_H);
    const px = imgData.data;
    let out = 0;

    const put = v => {
        const r = ((v >> 11) & 0x1F) << 3;
        const g = ((v >> 5) & 0x3F) << 2;
        const b = (v & 0x1F) << 3;
        px[out++] = r; px[out++] = g; px[out++] = b; px[out++] = 255;
    };

    if (rleBytes.length < 5) return null;
    if (rleBytes[0] === 0) {
        /* raw RGB565 */
        const n = Math.min(rleBytes.length - 1, CG_W * CG_H * 2);
        for (let i = 0; i + 1 < n; i += 2) put(rleBytes[i] | (rleBytes[i + 1] << 8));
    } else {
        /* RLE: [count:u16][pixel:u16] 对 */
        let ip = 1;
        const end = Math.min(rleBytes.length, CG_W * CG_H * 2);
        while (ip + 4 <= rleBytes.length && out < end) {
            const count = rleBytes[ip] | (rleBytes[ip + 1] << 8);
            const pixel = rleBytes[ip + 2] | (rleBytes[ip + 3] << 8);
            ip += 4;
            const limit = Math.min(out + count * 4, end);
            while (out < limit) put(pixel);
        }
    }
    cctx.putImageData(imgData, 0, 0);
    return canvas;
}

/* 48×48 RGB565（小端）→ canvas */
function decodeThumb(thumbBytes) {
    const canvas = document.createElement('canvas');
    canvas.width = THUMB_W; canvas.height = THUMB_H;
    const cctx = canvas.getContext('2d');
    const imgData = cctx.createImageData(THUMB_W, THUMB_H);
    const px = imgData.data;
    for (let i = 0; i < THUMB_W * THUMB_H; i++) {
        const v = thumbBytes[i * 2] | (thumbBytes[i * 2 + 1] << 8);
        px[i * 4] = ((v >> 11) & 0x1F) << 3;
        px[i * 4 + 1] = ((v >> 5) & 0x3F) << 2;
        px[i * 4 + 2] = (v & 0x1F) << 3;
        px[i * 4 + 3] = 255;
    }
    cctx.putImageData(imgData, 0, 0);
    return canvas;
}

/* 故事数据加载：优先 fetch stories/*.story，失败回退内嵌 base64（file:// 可用） */
const StoryLoader = {
    _cache: {},

    async load(fileName) {
        if (this._cache[fileName]) return this._cache[fileName];

        let bytes = null;
        try {
            const resp = await fetch('stories/' + fileName);
            if (resp.ok) {
                const buf = await resp.arrayBuffer();
                bytes = new Uint8Array(buf);
            }
        } catch (e) { /* file:// 下 fetch 失败，走内嵌 */ }

        if (!bytes && typeof EMBEDDED_STORIES !== 'undefined' && EMBEDDED_STORIES[fileName]) {
            const bin = atob(EMBEDDED_STORIES[fileName]);
            bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        }

        if (!bytes) throw new Error('无法加载故事: ' + fileName);
        const story = parseStory(fileName, bytes);
        if (!story) throw new Error('故事格式错误: ' + fileName);
        this._cache[fileName] = story;
        return story;
    },

    /* 加载全部内置故事，返回按 (series, episode) 升序数组 */
    async loadAll() {
        const names = Object.keys(EMBEDDED_STORIES).sort();
        const stories = [];
        for (const n of names) {
            try { stories.push(await this.load(n)); }
            catch (e) { console.warn(e); }
        }
        stories.sort((a, b) => a.series - b.series || a.episode - b.episode);
        return stories;
    },
};
