/* engine.js - 字节码剧情引擎（components/story_engine/engine.c 移植）
 *
 * 状态与 C 侧一一对应；存档序列化为 JSON 对象（cookie 存储）。
 * 字节码为小端序，直接读 Uint8Array。
 */

const OP_TEXT      = 0x01;
const OP_CHOICE    = 0x02;
const OP_JUMP      = 0x03;
const OP_CJUMP     = 0x04;
const OP_SET       = 0x05;
const OP_ADD       = 0x06;
const OP_RAND      = 0x07;
const OP_TRIGGER   = 0x08;
const OP_TEXT_VAR  = 0x09;
const OP_CALL      = 0x0A;
const OP_RET       = 0x0B;
const OP_SHOW_BG   = 0x0C;
const OP_PLAY_BGM  = 0x0D;
const OP_STOP_BGM  = 0x0E;
const OP_MINIGAME  = 0x0F;
const OP_SHOW_CG   = 0x10;
const OP_END       = 0xFF;

const CMP_LT = 0, CMP_LE = 1, CMP_EQ = 2, CMP_GE = 3, CMP_GT = 4;

const ACT_RUNNING     = 0;
const ACT_WAIT_CLICK  = 1;
const ACT_WAIT_CHOICE = 2;
const ACT_WAIT_MINIGAME = 3;
const ACT_WAIT_CG     = 4;
const ACT_END         = 5;
const ACT_ERROR       = 6;

const SAVE_TEXT_ID_BUF = 0xFFFF;

class StoryEngine {
    constructor() {
        this.code = null;       /* Uint8Array 字节码 */
        this.codeSize = 0;
        this.pc = 0;
        this.strings = [];
        this.action = ACT_RUNNING;

        this.curSpk = 0;
        this.curText = '';
        this.curTextId = SAVE_TEXT_ID_BUF;

        this.choiceCnt = 0;
        this.choiceTextIds = new Array(MAX_CHOICES).fill(0);
        this.choiceJmps = new Array(MAX_CHOICES).fill(0);

        this.callStack = new Array(CALL_STACK_SIZE).fill(0);
        this.callSp = 0;

        this.textBuf = '';

        this.curBg = 0xFF;
        this.curBgm = 0xFF;
        this.curGameId = 0;
        this.gameResultProp = 0;
        this.curCgId = 0;

        /* 属性系统 */
        this.propDefs = [];
        this.props = [];
        this.propCount = 0;
    }

    /* ---------- 属性 ---------- */
    propsInit(defs, count) {
        this.propCount = Math.min(count, MAX_PROPS);
        this.propDefs = [];
        this.props = [];
        for (let i = 0; i < this.propCount; i++) {
            this.propDefs.push({ ...defs[i] });
            this.props.push(defs[i].default_val);
        }
    }
    propSet(id, val) {
        if (id >= this.propCount) return;
        const d = this.propDefs[id];
        if (val < d.min) val = d.min;
        if (val > d.max) val = d.max;
        this.props[id] = val;
    }
    propAdd(id, delta) {
        if (id >= this.propCount) return;
        let r = this.props[id] + delta;
        const d = this.propDefs[id];
        if (r < d.min) r = d.min;
        if (r > d.max) r = d.max;
        this.props[id] = r;
    }
    propGet(id) {
        if (id >= this.propCount) return 0;
        return this.props[id];
    }

    /* ---------- 触发器（main.c 恒注册 0 个，保留实现） ---------- */
    triggersInit(trigs) {
        this.triggers = (trigs || []).map(t => ({ ...t, fired: 0 }));
    }
    triggersCheck() {
        for (const t of this.triggers) {
            if (t.fired) continue;
            const v = this.propGet(t.prop_id);
            let hit = false;
            switch (t.cmp) {
                case CMP_LT: hit = v < t.threshold; break;
                case CMP_LE: hit = v <= t.threshold; break;
                case CMP_EQ: hit = v === t.threshold; break;
                case CMP_GE: hit = v >= t.threshold; break;
                case CMP_GT: hit = v > t.threshold; break;
            }
            if (hit) {
                if (t.once) t.fired = 1;
                return t.jump_addr;
            }
        }
        return 0;
    }

    /* ---------- 引擎核心 ---------- */

    /* 小端读取 */
    _u8(p) { return this.code[p]; }
    _u16(p) { return this.code[p] | (this.code[p + 1] << 8); }
    _i16(p) { const v = this._u16(p); return v >= 0x8000 ? v - 0x10000 : v; }

    init(bytecode, codeSize, strings) {
        this.code = bytecode;
        this.codeSize = codeSize;
        this.pc = 0;
        this.strings = strings;
        this.action = ACT_RUNNING;
        this.curTextId = SAVE_TEXT_ID_BUF;
        this.curBg = 0xFF;
        this.curBgm = 0xFF;
        this.callSp = 0;
        this.choiceCnt = 0;
        this.textBuf = '';
    }

    _addrValid(addr) { return addr < this.codeSize; }
    _safeJump(addr) {
        if (!this._addrValid(addr)) { this.action = ACT_ERROR; return false; }
        this.pc = addr;
        return true;
    }

    proceed() {
        if (this.action === ACT_WAIT_CLICK || this.action === ACT_WAIT_CHOICE ||
            this.action === ACT_WAIT_MINIGAME || this.action === ACT_WAIT_CG ||
            this.action === ACT_END || this.action === ACT_ERROR) {
            return this.action;
        }
        this.action = ACT_RUNNING;

        while (true) {
            if (this.pc >= this.codeSize) { this.action = ACT_ERROR; return this.action; }
            const op = this._u8(this.pc);
            let p = this.pc + 1;

            switch (op) {
            case OP_TEXT: {
                const spk = this._u8(p); p += 1;
                const strId = this._u16(p); p += 2;
                this.pc = p;
                this.curSpk = spk;
                this.curText = this.strings[strId];
                this.curTextId = strId;
                this.action = ACT_WAIT_CLICK;
                return this.action;
            }
            case OP_CHOICE: {
                const cnt = this._u8(p); p += 1;
                const store = Math.min(cnt, MAX_CHOICES);
                this.choiceCnt = store;
                for (let i = 0; i < cnt; i++) {
                    const sid = this._u16(p); p += 2;
                    const jmp = this._u16(p); p += 2;
                    if (i < store) { this.choiceTextIds[i] = sid; this.choiceJmps[i] = jmp; }
                }
                this.pc = p;
                this.action = ACT_WAIT_CHOICE;
                return this.action;
            }
            case OP_JUMP: {
                const addr = this._u16(p);
                if (!this._safeJump(addr)) return this.action;
                break;
            }
            case OP_CJUMP: {
                const varId = this._u8(p); p += 1;
                const cmp = this._u8(p); p += 1;
                const val = this._i16(p); p += 2;
                const addr = this._u16(p); p += 2;
                this.pc = p;
                if (this._compareProp(varId, cmp, val)) {
                    if (!this._safeJump(addr)) return this.action;
                }
                break;
            }
            case OP_SET: {
                const varId = this._u8(p); p += 1;
                const val = this._i16(p); p += 2;
                this.pc = p;
                this.propSet(varId, val);
                break;
            }
            case OP_ADD: {
                const varId = this._u8(p); p += 1;
                const delta = this._i16(p); p += 2;
                this.pc = p;
                this.propAdd(varId, delta);
                break;
            }
            case OP_RAND: {
                const prob = this._u8(p); p += 1;
                const addrOk = this._u16(p); p += 2;
                const addrFail = this._u16(p); p += 2;
                const r = halRandom() % 100;
                if (!this._safeJump(r < prob ? addrOk : addrFail)) return this.action;
                break;
            }
            case OP_TRIGGER: {
                const addr = this.triggersCheck();
                this.pc = p;
                if (addr !== 0) {
                    if (!this._safeJump(addr)) return this.action;
                }
                break;
            }
            case OP_TEXT_VAR: {
                const spk = this._u8(p); p += 1;
                const strId = this._u16(p); p += 2;
                const varId = this._u8(p); p += 3;
                this.pc = p;
                /* {0} 替换为属性值 */
                this.textBuf = this.strings[strId].replace(/\{0\}/g, String(this.propGet(varId)));
                this.curSpk = spk;
                this.curText = this.textBuf;
                this.curTextId = SAVE_TEXT_ID_BUF;
                this.action = ACT_WAIT_CLICK;
                return this.action;
            }
            case OP_CALL: {
                const addr = this._u16(p); p += 2;
                if (this.callSp >= CALL_STACK_SIZE) { this.action = ACT_ERROR; return this.action; }
                this.callStack[this.callSp++] = p;
                if (!this._safeJump(addr)) return this.action;
                break;
            }
            case OP_RET: {
                if (this.callSp === 0) { this.action = ACT_END; return this.action; }
                this.callSp--;
                if (!this._safeJump(this.callStack[this.callSp])) return this.action;
                break;
            }
            case OP_SHOW_BG: {
                const idx = this._u8(p); p += 1;
                this.pc = p;
                this.curBg = idx;
                break;
            }
            case OP_PLAY_BGM: {
                const idx = this._u8(p); p += 1;
                this.pc = p;
                this.curBgm = idx;
                break;
            }
            case OP_STOP_BGM: {
                this.pc = p;
                this.curBgm = 0xFF;
                break;
            }
            case OP_MINIGAME: {
                const gameId = this._u8(p); p += 1;
                const resultProp = this._u8(p); p += 1;
                this.pc = p;
                this.curGameId = gameId;
                this.gameResultProp = resultProp;
                this.action = ACT_WAIT_MINIGAME;
                return this.action;
            }
            case OP_SHOW_CG: {
                const cgId = this._u8(p); p += 1;
                const captionSid = this._u16(p); p += 2;
                this.pc = p;
                this.curCgId = cgId;
                this.curText = this.strings[captionSid];
                this.curTextId = captionSid;
                this.action = ACT_WAIT_CG;
                return this.action;
            }
            case OP_END: {
                this.action = ACT_END;
                return this.action;
            }
            default:
                this.action = ACT_ERROR;
                return this.action;
            }
        }
    }

    _compareProp(propId, cmp, threshold) {
        const v = this.propGet(propId);
        switch (cmp) {
            case CMP_LT: return v < threshold;
            case CMP_LE: return v <= threshold;
            case CMP_EQ: return v === threshold;
            case CMP_GE: return v >= threshold;
            case CMP_GT: return v > threshold;
        }
        return false;
    }

    makeChoice(choiceIdx) {
        if (this.action !== ACT_WAIT_CHOICE) { this.action = ACT_ERROR; return; }
        if (choiceIdx >= this.choiceCnt) { this.action = ACT_ERROR; return; }
        if (!this._safeJump(this.choiceJmps[choiceIdx])) return;
        this.action = ACT_RUNNING;
    }

    getText() { return { spk: this.curSpk, text: this.curText }; }
    choiceCount() { return this.choiceCnt; }
    choiceText(idx) {
        if (idx >= this.choiceCnt) return '';
        return this.strings[this.choiceTextIds[idx]];
    }
    forceJump(addr) {
        if (!this._safeJump(addr)) return;
        this.action = ACT_RUNNING;
    }

    /* ---------- 存档（JSON，对应 engine_save/load 语义） ---------- */

    serialize() {
        const trigBitmap = this.triggers ? this.triggers.reduce((b, t, i) => b | (t.fired << i), 0) : 0;
        return {
            action: this.action,
            pc: this.pc,
            curSpk: this.curSpk,
            curTextId: this.curTextId,
            textBuf: this.textBuf,
            callSp: this.callSp,
            callStack: this.callStack.slice(0, CALL_STACK_SIZE),
            choiceCnt: this.choiceCnt,
            choiceTextIds: this.choiceTextIds.slice(0, MAX_CHOICES),
            choiceJmps: this.choiceJmps.slice(0, MAX_CHOICES),
            props: this.props.slice(0, MAX_PROPS),
            trigFired: trigBitmap,
        };
    }

    deserialize(save) {
        if (!save || typeof save !== 'object') return false;
        if (typeof save.pc !== 'number' || !(save.pc >= 0) || save.pc >= this.codeSize) return false;
        if (save.callSp > CALL_STACK_SIZE) return false;
        if (save.choiceCnt > MAX_CHOICES) return false;

        this.action = save.action;
        this.pc = save.pc;
        this.curSpk = save.curSpk || 0;
        this.curTextId = save.curTextId;
        if (this.curTextId === SAVE_TEXT_ID_BUF) {
            this.textBuf = save.textBuf || '';
            this.curText = this.textBuf;
        } else {
            this.curText = this.strings[this.curTextId];
        }
        this.callSp = save.callSp;
        for (let i = 0; i < CALL_STACK_SIZE; i++) this.callStack[i] = save.callStack[i] || 0;
        this.choiceCnt = save.choiceCnt;
        for (let i = 0; i < MAX_CHOICES; i++) {
            this.choiceTextIds[i] = save.choiceTextIds[i] || 0;
            this.choiceJmps[i] = save.choiceJmps[i] || 0;
        }
        for (let i = 0; i < MAX_PROPS; i++) this.props[i] = save.props[i] || 0;
        if (this.triggers) {
            for (let i = 0; i < this.triggers.length; i++) {
                this.triggers[i].fired = (save.trigFired >> i) & 1;
            }
        }
        return true;
    }
}
