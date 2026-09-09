# MicroStory 故事封面提示词（12 张 · 全彩像素风）

> 给 AI 生图工具（豆包/即梦/GPT-4o/ SD）用的封面提示词。
> 与 CG 的灰度速写风不同：封面走**全彩像素风**，对标 `F:/MicroStory/hiffu.png`。
>
> ## 必读：封面最终形态（决定构图怎么写）
>
> - 封面 = 160×128 全彩图，经 `img2rle.py` 转 RGB565 → `rle2thumb.py` 降采样为 **48×48**
>   缩略图，显示在标题画面左侧（`title_screen.js:81` `Draw.image(st.thumb, 6, 4)`）。
> - 48×48 下只有**大色块+大人脸**能看清：人物半身越大越好，背景只留一个标志性剪影，
>   细节（小字、小道具、远景人物）全部会糊掉。
> - 当前全故事共用 `hiffu.thumb` 占位；产出后按第五节接入，替换各故事 `--thumbnail`。
> - **本次只出提示词文档**：用户拿去生图 → 发回 PNG → 我做像素化（posterize+缩
>   放）→ 转 `.thumb` → 重新打包。这是既定分工，本轮不做图、不写盘图片。
>
> ## 通用风格前缀（每张必加）
>
> 中文：全彩像素风游戏封面，16-bit 复古像素画，干净色块，粗像素颗粒可见；
> 半身人物居中占画面 2/3 以上，脸部清晰；背景只保留一个标志性剪影元素；
> 色彩鲜明对比强，暗色底衬亮色人物；无文字、无水印、无署名、无边框。
>
> 英文：`full-color pixel-art game cover, 16-bit retro pixel style, clean color
> blocks, visible chunky pixels; half-body character centered, taking over 2/3
> of the frame, clear face; background keeps ONE iconic silhouette element only;
> strong vivid contrast, dark backdrop with bright character; no text, no
> watermark, no signature, no border.`
>
> 尺寸建议：出方形 1024×1024 或 512×512（像素风模型常用），**人物脸部占整图
> 1/4 以上**；我后续居中裁 5:4 → 缩 160×128。
> 横构图备选：直接出 5:4（1280×1024），人物更大，但注意标题画面只取 48×48，
> 人脸越大越好。
>
> ## 角色速查（封面只画关键配饰，48px 下能认出即可）
>
> - 莲子：黑短发+眼镜+红丝带（sealing 系与梅莉双人时站左，穿深色外套）
> - 梅莉：金长发+紫裙+大蝴蝶结帽饰（站右，暖色）
> - 灵梦：红白巫女服+黑色长发上的大红蝴蝶结
> - 魔理沙：黑巫师帽+金发+黑白配色
> - 恋：黑圆顶帽+黄缎带+绿裙+心形第三只眼（可简化为一根线连着一只闭眼）
> - 文：黑长直+高脚帽+翅膀+相机（相机挂脖子当小点缀即可）
> - 天子：蓝长发+红白宽袖+绯想之剑（剑画出轮廓即可）
> - 哆来咪：淡蓝长发+紫白睡袍+蛇形发饰
> - 初代巫女（drwho限定）：褪色旧巫女服+小神社剪影
> - 狐妖铃（gravity限定）：狐耳+围裙+肉爪
> - 银发导游（east_sea限定）：银发+和服式导游装+彼岸花剪影
>
> ---

## sealing 系（莲子×梅莉双人，莲左梅右是固定站位）

### S1《重力只有0.8倍的那一天》gravity.story —— 天台星夜失重

- 画面：一高一低两名少女在夜晚天台边缘漂浮，星空为底，发丝衣摆向上飘。
- 中文：［通用前缀］夜晚天台，星空为底；黑短发眼镜少女（深色外套）与金长发少女
  （紫裙）并肩漂浮，身体微微上浮倾斜，发丝衣摆向上飘起，两人相视微笑；
  背景只有天台栏杆剪影+大片星空；深蓝底、人物暖色提亮。
- 英文：`[common prefix]; night rooftop under a starry sky, black short-haired
  girl with glasses in dark coat and blonde long-haired girl in purple dress
  floating side by side, hair and clothes drifting upward, smiling at each other;
  background only rooftop railing silhouette and vast stars; deep blue backdrop,
  warm-lit characters.`
- 备注：两人脸都要大；失重感靠"上飘的发梢"表达；栏杆只画底部一条横线。

### S2《朝夕之间》hiffu.story —— 雪窗与星星

- 画面：冬日窗边两人并肩侧影，金发少女指尖在雾气玻璃上画星。
- 中文：［通用前缀］冬日和室窗边，黑短发少女与穿过大旧毛衣的金长发少女并肩
  坐着看雪的侧影，金发少女指尖点在雾气玻璃上，身后一颗小星星印记；
  背景只有窗框剪影+窗外雪白；冷蓝窗外、暖黄室内。
- 英文：`[common prefix]; winter window side, black short-haired girl and
  blonde girl in oversized sweater sitting side by side watching snow, blonde
  fingertip touching fogged glass with a small star mark behind it; background
  only window frame silhouette and white snow outside; cold blue outside, warm
  yellow inside.`
- 备注：现有 `hiffu.png`（莲梅相拥夜景霓虹）就是本篇封面，可直接沿用或按此重画；
  侧影+窗框在 48px 下识别度最高。

### S3《境界漂流》drwho.story —— 月下小塔与初代巫女

- 画面：莲梅两人在月光下站在小塔旁，远处一座小神社剪影（初代巫女的时代）。
- 中文：［通用前缀］夜晚，黑短发眼镜少女与金长发少女站在一个铜线圈小塔旁，
  抬头看月亮；背景只有一轮大满月+远处小神社剪影；月光银白、人物剪影暖边。
- 英文：`[common prefix]; night, black short-haired girl with glasses and
  blonde long-haired girl standing beside a small copper-coil tower, looking up
  at the moon; background only a big full moon and a distant small shrine
  silhouette; silver moonlight, warm-rimmed silhouettes.`
- 备注：满月要大（占背景 1/3），神社只画鸟居+屋顶剪影；本篇无固定 CP 感，
  "看月亮"比"相视"更贴题（境界观测主题）。

### S4《卯酉东海道》east_sea.story —— 新干线与富士

- 画面：新干线车窗前两人侧脸，窗外富士山剪影。
- 中文：［通用前缀］新干线车厢内，黑短发少女与金长发少女并肩坐着看向窗外侧脸；
  车窗外一座富士山剪影+扭曲的云；背景只有车窗框+富士；车内暖、窗外亮蓝。
- 英文：`[common prefix]; inside Shinkansen carriage, black short-haired girl
  and blonde girl sitting side by side in profile looking out the window; outside
  a Mt. Fuji silhouette with warped clouds; background only window frame and
  Fuji; warm interior, bright blue outside.`
- 备注：富士山三角形剪影在 48px 下极具识别度；两人只画侧脸即可，重心给富士。

### S5《弦网之外的一日》xianwang.story —— 裂隙与旧石片

- 画面：莲梅两人站在裂隙前，中间一块刻着弦纹的旧石片发光。
- 中文：［通用前缀］废弃观测所，两名少女（黑短发眼镜+金长发）站在一条发光的
  天空裂隙前，中间一块刻着弦形纹路的旧石片悬浮发光；背景只有裂隙光带+石墙
  剪影；暗底、裂隙与石片是最亮点。
- 英文：`[common prefix]; abandoned observatory, two girls (black short hair
  with glasses, blonde long hair) standing before a glowing sky rift, an old
  stone slab carved with string-like patterns floating and glowing between them;
  background only the rift light band and stone wall silhouette; dark backdrop,
  rift and slab are the brightest spots.`
- 备注：石片放画面中心偏下，裂隙竖向贯穿背景；两人分居左右，不遮石片。

---

## gensokyo 系（单人女主 +"你"不露脸，只画女主）

### G1《红白的休日》reimu.story —— 缘侧茶杯灵梦

- 画面：黄昏神社缘侧，红白巫女捧茶侧坐。
- 中文：［通用前缀］黄昏神社缘侧，黑色长发系大红蝴蝶结的红白巫女侧坐，捧着一杯
  热茶低头微笑；背景只有鸟居一角剪影+夕阳；暖橘底、红白巫女服最亮。
- 英文：`[common prefix]; shrine veranda at dusk, red-and-white miko with big
  red bow in black hair sitting sideways holding a hot tea cup, gentle downward
  smile; background only a torii corner silhouette and setting sun; warm orange
  backdrop, red-white outfit brightest.`
- 备注：大蝴蝶结是 48px 下的识别核心，必须大而清晰；茶杯热气画两道曲线。

### G2《星屑与魔法》marisa.story —— 掌心星屑魔理沙

- 画面：魔法森林之夜，戴黑帽的金发魔法使托着发光星屑。
- 中文：［通用前缀］夜晚魔法森林，戴黑巫师帽的金发少女掌心朝上托着一颗发光的
  星屑光点，眼睛映着光低头看掌心；背景只有树冠剪影+几点星；深绿黑底、光点
  是全图最亮。
- 英文：`[common prefix]; magic forest at night, blonde witch girl in black
  wizard hat holding a glowing star sparkle in her open palm, eyes reflecting
  the light looking down; background only canopy silhouette and few stars; dark
  green-black backdrop, the sparkle is the brightest spot.`
- 备注：黑帽剪影+掌心光点构成"暗底一亮点"，缩略图下最醒目的一张。

### G3《心的温度》koishi.story —— 花园中的恋

- 画面：发光花园中戴黑帽的少女，帽上黄缎带飘起。
- 中文：［通用前缀］幽暗洞窟花园，戴黑圆顶帽（黄色缎带飘起）的黑发少女站在
  发光花丛中微笑，身旁一根细线连着一只闭着的眼睛；背景只有洞顶一束光+花丛
  光点；暗底、花与缎带提亮。
- 英文：`[common prefix]; dim cave garden, black-haired girl in black round hat
  with yellow ribbon fluttering, smiling among glowing flowers, a thin line from
  her side connecting a closed eye; background only one light shaft from above
  and flower glows; dark backdrop, flowers and ribbon highlighted.`
- 备注：黄缎带是识别核心；第三只眼画小即可（48px 下只求"有个东西跟着她"）。

### G4《快门之外的你》aya.story —— 举机文（雾之湖版，已修正无海）

- 画面：雾之湖畔举相机的黑长直天狗少女，雾气+湖波。（本篇海已改为雾之湖，
  封面严禁出现大海沙滩。）
- 中文：［通用前缀］雾气弥漫的湖畔，黑色长直发、戴高脚帽的天狗少女举起相机
  对准镜头方向，身后翅膀张开，脚下湖波粼粼、远处山影；背景只有雾中山影剪影
  +湖面亮带；灰蓝底、人物黑白衣装+相机最清晰。
- 英文：`[common prefix]; misty lakeshore, long black-haired tengu girl in tall
  hat raising a camera toward the viewer, wings spread behind her, shimmering
  lake ripples at her feet and mountain shades afar; background only misty
  mountain silhouette and bright lake band; gray-blue backdrop, black-white
  outfit and camera sharpest.`
- 备注：相机正对镜头=天然视觉中心；翅膀张开占满上半幅；切记是湖不是海。

### G5《凡人的告白》tenshi.story —— 银樱与剑的天子

- 画面：银樱树下蓝发天人少女，腰间长剑，樱瓣飘落。
- 中文：［通用前缀］银色樱树下，蓝色长发、红白宽袖衣装的天人少女站立，腰间
  一柄长剑，银色花瓣飘落；背景只有樱树干剪影+花瓣；浅底（本系列唯一亮底封面，
  在列表里一眼区分）、红白衣装最亮。
- 英文：`[common prefix]; under a silver cherry tree, celestial girl with long
  blue hair in red-and-white wide-sleeved outfit standing, a long sword at her
  waist, silver petals falling; background only tree trunk silhouette and petals;
  light backdrop (the only bright cover in the series), red-white outfit brightest.`
- 备注：全系列唯一浅色底，列表辨识度担当；剑画出轮廓即可，花瓣画大而疏。

### G6《梦境相会》doremy.story —— 云端回眸哆来咪

- 画面：云海边缘淡蓝长发少女回眸，脚下光点如星海。
- 中文：［通用前缀］云海之巅，淡蓝长发、穿紫白睡袍的少女站在云缘回眸，头发
  被风吹起，脚下无数发光小点如星海；背景只有云海留白+光点；淡紫底、人物
  与光点最亮。
- 英文：`[common prefix]; atop a sea of clouds, light-blue-haired girl in
  purple-white sleeping robe standing at the cloud edge glancing back, hair
  lifted by wind, countless glowing sparks like a star sea below; background
  only cloud whiteness and sparks; pale purple backdrop, character and sparks
  brightest.`
- 备注：回眸脸+飘发是识别核心；光点画大而疏（48px 下密点会糊成一片）。

---

## 彩蛋（可选，不进标题列表）

### EX 秘封俱乐部 easter_egg.story —— 霓虹相拥（已有 hiffu.png 可用）

- 现有 `F:/MicroStory/hiffu.png`（莲梅霓虹夜景相拥像素画）即为本彩蛋气质，
  可直接用作 EX 封面或 S2 封面。若重画：霓虹夜景下黑短发少女与金长发少女
  相拥，左右霓虹灯牌剪影（无文字），深蓝底暖光人物。

---

## 产出与交接规范（给下一轮"我"的备忘）

1. 用户按上文逐张生图，发回 PNG（方形或 5:4 均可，脸越大越好）。
2. 我对每张 PNG 做像素化：居中裁 5:4 → 灰度检查（封面保留彩色！只压色阶，
   建议 posterize 16~32 级，保证 RLE 压缩率）→ `img2rle.py` 缩 160×128 →
   产出 `cover_s{series}e{ep}.rle`（如 `cover_sgensokyo_e1.rle`）。
3. 每张再 `rle2thumb.py` 生成对应 `.thumb`。
4. 更新 `F:/MicroStory/CMakeLists.txt` 各故事 `--thumbnail` 参数（现状：除 east_sea
   用 `cover.thumb` 外全部共用 `hiffu.thumb` 占位），重编全部 `.story`。
5. 本仓跑 `gen_story_data.py` + `subset_font.py` + `node test/integration.js`，
   全绿后交付。
