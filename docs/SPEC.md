PUFFLY

Complete Product & Engineering Specification v1.0

«Puffly — Take a break. Skip the smoke.»

---

01. Product Definition

Puffly 是一个跨平台、低文字依赖、沉浸式的虚拟休息小游戏。

它的核心体验不是“阅读一个戒烟 App”，而是：

«打开 → 看到 → 直接操作 → 获得反馈 → 放松几分钟 → 离开。»

Puffly 将“抽烟休息时的仪式感”转化成一个无尼古丁、无真实烟草消耗的互动体验。

产品应该让用户产生：

«“哈哈，这个动作还挺像。”»

而不是：

«“我要先读说明书才能知道怎么玩。”»

---

02. Global Design Philosophy

第一原则：Zero Tutorial

默认情况下：

不提供教程页面。

不提供长篇文字说明。

不要求用户先学习规则。

第一次打开网站，用户应该能够仅凭视觉和直觉开始互动。

例如：

看到打火机
    ↓
自然会点
    ↓
看到烟
    ↓
自然会碰
    ↓
烟开始燃烧
    ↓
自然产生互动

游戏规则通过：

- 动画
- 物理反馈
- 声音
- 光影
- 手势
- 状态变化
- 微妙提示

表达。

---

03. Globalization Principle

Puffly 从设计第一天开始就面向全球用户。

核心交互必须做到：

«即使完全不认识界面文字，也能够正常使用。»

因此：

优先级

视觉
>
动作
>
反馈
>
声音
>
图标
>
极短文字

而不是：

文字
>
按钮
>
说明
>
动画

---

04. Text Budget

整个游戏严格控制文字。

必须尽量避免：

Click here to start
Press this button to smoke
Tap here to inhale
You can extinguish the cigarette here
Are you sure you want to discard?

这些都不应该出现。

优先使用：

🔥
🚬
🌫️
✦
↔
○

以及纯视觉反馈。

---

05. Language Strategy

第一版 UI 默认：

«Language Independent»

不要让核心游戏依赖 i18n。

只允许少量非核心文字存在：

- Puffly
- 时间
- 数字
- 极短状态
- 一个手势动词（见 28 的例外）
- 设置中的必要项目

如果未来增加语言：

en
zh-CN
zh-TW
ja
ko
es
fr
de
...

只扩展外围 UI。

Game Core、游戏交互、游戏动画完全不依赖语言。

2026-10-05 补充（Smoke Ritual §9 落地）：

三层降级，顺序固定：目标语言 → English → 纯图标。

- English 是锚，不是翻译：每个 key 必须在它那里存在。
- 看得见的字可以一路降到“没有”（纯图标层），这是核心循环允许的状态。
- 播报给读屏软件的名字永远不降为零：§64 优先于审美。
- 中文量词（支/口/根/次）只出现在图鉴与档案里，主循环一个字都不带。
- 语言是偏好，不是状态机输入：`Settings.language` 由核心携带，核心从不读它（有守卫测试）。
- 界面随文字镜像（工作表从右边缘开始），场景永远不镜像：烟从左往右烧，
  回看一次录像（71）在任何语言下都必须得到同一条烟。
- 缺省跟随设备：没有明确选择时读浏览器的语言列表，读不到就落到 English。

---

06. The "Smile Test"

所有交互都必须通过：

«Smoke Break Smile Test»

也就是：

一个曾经或正在吸烟的人看到某个交互时，不需要解释，就能认出它的“感觉”。

例如：

灰太长

烟灰逐渐变长。

用户看到：

───────●
       ↑
      ash

自然会想：

«弹一下。»

于是用户手指轻轻一弹：

啪

灰掉下来。

---

火星变化

烟自然燃烧。

突然：

🔥

亮了一下。

用户知道：

«刚才发生了什么。»

不需要文字。

---

风

烟雾慢慢向左。

突然一阵风：

🌫️🌫️🌫️  ←

整个烟雾偏移。

用户自然会观察。

---

07. Product Personality

Puffly 不应该表现得：

- 医疗
- 严肃
- 教育
- 说教
- 道德化
- 强制提醒

而应该：

- 安静
- 有趣
- 微妙
- 有一点幽默
- 有一点怀旧
- 有一点解压
- 有一点“你懂的”

---

08. Core Experience

整个游戏围绕一个核心循环：

NOTICE
   ↓
INTERACT
   ↓
RESPONSE
   ↓
OBSERVE
   ↓
INTERACT
   ↓
REST

而不是：

READ
 ↓
CLICK BUTTON
 ↓
READ
 ↓
CLICK BUTTON

---

09. Main Screen

首页尽可能极简。

视觉中心只有：

环境
    +
烟
    +
烟雾
    +
微弱声音

例如：

┌──────────────────────────┐
│                          │
│                          │
│          🌫️              │
│            🌫️            │
│             🚬            │
│              🔥           │
│                          │
│                          │
│                          │
└──────────────────────────┘

不要默认显示大量菜单。

UI 应该随着用户需要出现。


（2026-10-06 补充，按 Smoke Ritual S10 落地）同一块场景在 1440×900 上是"完整版"：右边常驻一条
260px 的数据栏（`侧栏 7 入口` = 休息 / 烟种 / 烟盒 / 皮肤 / 桌上其余 / 减量 / 设置），场景与所有
工作表一起缩到剩下的 1180px 里——数据栏是从场景**旁边**拿地方，不是盖在场景上。

按宽度分，不按设备分：这条栏的开关是 `@media (min-width: 860px)`，横过来的手机与 1440 的桌面只差
在有没有这块地方。栏里的数字就是减量页那一个组件（`ReductionPanel.vue`），不是第二套读数；七个入口
点开的是同一批工作表，只是带上了落点（`section` → `[data-group="…"]` 滚过去）。

实测（真浏览器 1440×900）：栏 x=1180 w=260、场景与画布 1180、hud 右边缘 1166 不压栏、入口最小高
44px、栏内最小字号 15px、点"皮肤"后四组 top 从 973/1369/1462/1551 变成 -274/122/215/304 且
`aria-current` 落在 skins。阿拉伯语下整条栏翻到 x=0..260、场景 x=260..1440（镜像的是**布局**，
燃烧方向在画布里，不跟着翻）。

---

10. Progressive UI

UI 默认隐藏。

用户操作时才出现。

例如：

idle
 ↓
tap
 ↓
controls fade in
 ↓
user stops
 ↓
controls fade out

两条补充（2026-09-30）：

- 玩家一次都没碰过的场景不许淡出。淡出的前提是「正在沉浸」；什么都还没发生的时候，
  屏幕上唯一要紧的事是让人知道可以碰什么。
- 向下划过空白处 = 把界面收起来，不是把烟掐灭。烟继续烧、时间继续走；再碰任何东西时界面
  回来，没有计时器会替玩家把它放回来。

整个体验尽可能接近：

«一个真实存在于屏幕里的“小东西”。»

---

11. Core Interaction Model

Puffly 的烟不是一张图片。

它是一个具有生命周期的动态实体。

状态：

IDLE
PICKED_UP
LIGHTING
BURNING
PUFFING
RESTING
ASH_READY
NEAR_END
EXTINGUISHING
EXTINGUISHED
DISCARDED

状态机必须存在于：

packages/game-core

而不是 Vue。

---

12. Cigarette Model

烟的所有行为由数据驱动。

interface CigaretteType {
  id: string

  burnDuration: {
    min: number
    max: number
  }

  puffProfile: {
    intensityMin: number
    intensityMax: number
    durationMin: number
    durationMax: number
  }

  smokeProfile: {
    density: number
    turbulence: number
    riseSpeed: number
    dispersion: number
  }

  emberProfile: {
    brightness: number
    flicker: number
    flareChance: number
  }

  ashProfile: {
    minLength: number
    maxLength: number
  }

  eventPool: string[]
}

---

13. Fictional Cigarettes

禁止依赖现实香烟品牌。

全部采用原创虚构设计。

例如：

Classic
Silver
Night
Long
Ember
Mist

2026-10-05 阶梯落地：品类从 6 根扩到 11 根，按 §categoryTypes 分三型——
吸入型 7（卷烟 / 手卷 / 丁香 / 薄荷 / 冰凉 / 深焙 / 典藏）、品鉴型 3（小雪茄 / 雪茄 / 斗烟）、
过滤型 1（水烟）。解锁货币是累计支数：0 / 8 / 20 / 40 / 65 / 95 / 135 / 190 / 250 / 320 / 420，
这条阶梯与"三型各几根"由 tests/sessionLoop.test.ts 现算校验，不是抄在文档里的数。
（品鉴型与过滤型的手感差异目前只有数值与烟型，专属交互在待办里。）

2026-10-05 修订（Smoke Ritual §9/§8 落地时确认）：这条红线收窄，不再一刀切。

- **舞台上的东西仍然是虚构的**：能抽的、能选的、能解锁的每一根烟都是原创设计（上面那批名字）。
  现实品牌不出现在可交互对象、封面、图标或任何"想要它"的位置。
- **现实品牌只作为档案数据存在**：图鉴/档案里可以写"某某牌 · 某国 · 1927 · ≈ 6mg"，
  它是资料，不是商品，没有获取途径，也没有推荐语气。
- 因此档案里的数字一律带 ≈（估算），并且档案文本永远不进状态机、不进回放（§71）。
- 84 那条"不推广现实烟草品牌"不变，且优先级高于本条：档案是名词表，不是货架。

每种拥有不同：

- 烟雾
- 火星
- 燃烧速度
- 灰烬
- 声音
- 环境适配

---

14. Puff Interaction

Puff 不应该只是：

Button → -1

而应该是动态互动。

支持：

tap
hold
drag
release

不同输入产生不同视觉反馈。

例如：

Hold
 ↓
ember brightness ↑
 ↓
smoke density ↑
 ↓
sound intensity ↑
 ↓
release
 ↓
smoke expands

所有数值都经过游戏化处理，不需要暴露给用户。

（2026-10-06 补充，按 Smoke Ritual `categoryTypes` 落地）"按住吸入"不是一种操作，而是三类：

| 品类 | 内容里的字段 | 手感 |
| --- | --- | --- |
| 卷烟 / 手卷 / 丁香（7） | `savourMs: 0`，`loadPerPuff > 0`，`exhaleMs: 0` | 按住多久就吸多满，次线性；每口给下一口留下阻力（余烬更亮、燃得更快）；吐就是一团 |
| 小雪茄 / 雪茄 / 斗烟（3） | `savourMs: 2000`，`loadPerPuff: 0`，`exhaleMs: 2500` | 含住两秒——进度环走的是这张嘴的曲线而不是时钟；不入肺，所以不留阻力；吐出来是缓缓的一口，寿命翻倍、初速减半、不再往上冲 |
| 水烟（1） | 三个字段全走吸入那一档，`loadPerPuff: 0.12` | 长会话低节奏：单支 50 分钟、口数更多、阻力留得最轻 |

四个字段都写进内容，核心不认"雪茄"这个词（§77）；pill 上的动词由这根烟自己的读数决定
（`readouts.savourMs > 0` → `含住 / savour`，否则 `吸入 / inhale`），家里只有一个地方知道这件事：
`ctaKeyFor()`。

判据：`packages/game-core/src/__tests__/savour.test.ts` 用同一支烟的两份内容做对照——含住的曲线在
500/1000/2000ms 上分别是 0.25/0.5/1 且不随时钟走；吸入的那条是次线性的前半段；吐出来的云按含进
嘴的量长；三口之后含住的负载是 0、吸入的 > 0.2；吐的那一团寿命翻倍、初速减半。把 `savourMs`、
`loadPerPuff`、`exhaleMs` 任一字段送进黑洞（改成常量），对应那一条必红——三次单点变异实测过。品类与抽法是不是同一件事，另有
`apps/web/src/__tests__/archive.test.ts` 双向钉住：`savourMs > 0 ⟺ kind === 'savor'`，11 根逐个走一遍。

---

15. Smoke Engine

烟雾是 Puffly 最重要的视觉系统之一。

禁止使用固定 GIF 作为主要烟雾效果。

实现：

Particle System
+
Noise Field
+
Velocity Field
+
Turbulence
+
Alpha Decay
+
Blur
+
Random Seed

每个粒子至少包含：

x
y
vx
vy
radius
alpha
life
maxLife
noiseSeed
rotation
scale

（2026-10-06 补充，"烟没有还原那张图"这一条）把出厂的引擎 + 出厂的渲染器在真浏览器里离线跑一局
（时钟由脚本给，不靠 rAF——后台页面上 rAF 是 0 帧），把画布读回来量。**第一次量就把我的猜测打掉了**：
我以为病是"太亮太饱和"，同一套编排、同一粒种子对比，吐气峰值那一帧烟带里亮度 >220 的占比
改前 0.49% / 改后 0.50%、>250 是 0.03% / 0.13% —— **饱和根本没降**。真正变了的是**内部结构**：

| 吐气峰值那一帧（烟带内，同种子同编排） | 改前 | 改后 |
| --- | --- | --- |
| 亮度 >90 的采样数（云占多大一片） | 22999 | 9806 |
| 云内平均亮度 | 146.8 | 128.1 |
| 云内标准差 / 均值（相对起伏） | 0.234 | **0.294** |
| 相邻像素平均差（碎不碎） | 5.17 | **8.44** |

也就是说改前那是一团**均匀发亮的雾**铺在画面上半部，改后是一团**有明有暗、能看出片**的云。
配方上动的就是这一点：单片不再靠"不透明"堆体积，靠"片数 × 膨胀"。

| | 改前 | 改后 |
| --- | --- | --- |
| 单片峰值 alpha | 0.24 + 0.3i | 0.08 + 0.1i |
| 单片半径（写的值） | 0.03 – 0.105 | 0.018 – 0.055 |
| 一次片数 | 20 + 46i | 34 + 70i |
| 膨胀 scaleGrowth | 2.9 | 2.9（不动） |

判据分两层。单元层：`packages/game-core/src/__tests__/savour.test.ts` 的
"the breathed cloud stays see-through"钉住 alpha 上限与**到达**半径上限（`makeBurst` 会把写下的半径乘上
这根烟自己的 plume 系数与抖动，所以判的是发出去的值：写的 0.055 到达 ≈0.086，旧的 0.105 到达 ≈0.164，
线画在 0.12），并且同时钉"仍要膨胀 + 片数仍要多"——否则"更薄"可以靠"云更小"作弊通过。
把三个数原样改回去，全库 106 条里只有这一条红。
浏览器层：`tests/smoke/touch-device.mjs` 里新增"一口气是有结构的，不只是一片发亮"，
判的是烟带内的相邻像素差（5.17 → 8.44，线画在 6.5）与云内相对起伏，两者同时不达标才红。

复跑这套图：页面里 `import('/@fs/<abs>/packages/game-{core,renderer,content}/src/index.ts')` →
`createEngine({lighterId:'brass'})`（默认 wheel 有 6% 打不着，验图别用它）→ `createCanvasRenderer({...})`
→ **`engine.on((e) => renderer.handleEvent(e))`**（漏这一条粒子池永远是 0、画面上一条烟都没有——
本轮第一次就是这么被骗的）→ 每步 `engine.advance(1000/60)` + `renderer.render(state, 1000/60)`，
用 `canvas.getContext('2d').getImageData(...)` 读回来算。`renderer.particleCount()` 是"烟在不在池子里"
的直读探针，看图之前先读它。

**这一条还没有收口**：上面所有数字都只说明"更像一团碎开的云"，不等于"就是那张图"。
和 Ardot 那几帧的正面对比需要能看画面的浏览器（本轮内嵌页面切到后台后截图直接拒），
所以最后那一眼还是要你来定。

补一轮（同一份判据下量到的另一件事）：交接文档 §6.1 的皮肤表把**烟羽**列为皮肤的四层之一，
写的是"烟雾颜色与浓度"。实现里这一层只落到那层 density veil 上——`rgbToCss(tint, (density-0.45)*0.06)`
最亮处 alpha 也只有 0.033，等于没落。量法：给渲染器一份**只有烟羽不是原值**的调色板（其余三层从
未上色的视图里原样抄回来，这样任何像素差都只可能来自烟羽），跑同一个种子的一口呼气，
比较两次跑动里渲染器**逐个索取**的 sprite 颜色（按下标对齐）：改之前 **60 片里 0 片换色**。
现在烟羽在粒子出生那一刻就换掉烟雾类 burst 的颜色，材质类（`ember` 滤嘴、`ash` 灰、`impact` 托盘灰）
保留 core 写给它们的颜色——皮肤可以改烟，不该把灰改成蓝色。
判据：`packages/game-renderer/src/__tests__/plume-palette.test.ts`（4 条）。两条单点变异各自只红一条：
调用点不传 `plumeTint` → 只红"repaints the plume…"；去掉材质那道 kind 守卫 → 只红
"leaves the ash its own material colour"。另两条是防自证的正对照（两种候选色相距 >30）与确定性对照
（同一份调色板跑两遍 0 处不同）。

一个已知行为，不是缺陷：换皮肤时**已经在空中**的那片烟保留它出生时的颜色，几秒内自然散尽后整幅才统一。
粒子不带"我是不是烟"的标记，要做到瞬时必须给粒子加一个字段，为一次设置切换付这笔钱不值。

Ardot 那条路这轮走通了**读**、走不通**看**：文件在用户自己的 Chrome 里以只读身份打得开
（S1-S6 是 390×844 六帧，S3 吸烟 = 节点 `3:127`，S4 吐烟 = 节点 `3:187`），但整页 7% 缩放下
一帧只有 27×59 CSS 像素（截图里约 55×119 设备像素），烟羽本身不可辨。要放大必须真输入：
合成的 `keydown`（Shift+2 缩放到选区）
编辑器根本不收，`cua.keypress` 只吃 `{keys:[...]}` 且同样没生效，`cua.scroll` 会挂在一次等待确认的
输入授权上把整条队列堵死。所以"像不像那张图"这一眼仍然只能你来——把 S4 吐烟放大到 100% 对一眼即可。

**再补一条，这一条把上面努力的方向纠正了一半**：看到画面之后用户的说法是「像雾、没对上焦；设计稿里的烟
是有线条的，不用散开」。照这句话去量，病根不在片数、不在 alpha、也不在张角 —— 在**流场本身**。
`curl2(x, y, seed)` 的第三个参数选的是**另一张噪声格点**，不是同一张格点里的另一个位置，而粒子池把每颗
粒子自己的 `noiseSeed` 传了进去：紧挨着的两颗粒子被推往互不相关的方向，所谓"共享的涡旋场"其实从来不存在，
画面必然是一团失焦的雾。改成全场共用一张格点（每颗只留一个亚格点抖动），同一局同一时刻变成：

| 呼气在 2 秒时 | 每颗一份格点（出厂行为） | 共用一场（现在） |
| --- | --- | --- |
| 长宽比 σy/σx | 1.10（正圆 = 雾） | 2.40 |
| 横向 σx | 0.370 | 0.035 |
| 包围盒面积（舞台 = 1） | 3.47（三个半屏幕） | 0.14 |

静置烟柱在 3 秒：σx 0.193 → 0.009，长宽比 2.21 → 12.36。把 seed 换回每颗一份，形状判据当场红
（1 红 81 绿）—— 那是刚出厂的行为，不是我编的反例。

**形状判据后来被证明量错了东西，这一条比上一条更重要。** 上面那张表里的"长宽比"量的其实是**跑了多远**：
一团云只要升得够快，它自己就会被拉成长条，跟它像不像烟无关。把整局烟雾真正画成一张图来看（把 renderer
一帧里真正 blit 的片数、位置、半径、alpha 全部录下来再合成），看到的是：2.5 秒那一帧里 698 个精灵只有
**50 个落在画面内**，其余全在屏幕外 —— 因为每支烟呼出的那口气在 **2 秒时就整体离开了舞台**（默认那支
classic：+2 秒位移 −1.06 个舞台高，+4 秒 −2.90）。用户说的"烟会到左上角""没还原 UI 图"，根子是同一个。

病根是一个常数：粒子池对**所有**粒子用同一个空气阻尼 0.9/s。烟是气溶胶，弛豫时间远小于一帧；烟灰是
2 毫米的碎片，0.9/s 差不多正好。同一个数必然对其中一个是错的，而对烟是错了一个量级 —— 终端速度
= rise / 阻尼，出厂值算出来是每秒 0.4～1.1 个舞台高，而烟头离画面上沿只有 0.37。

改法是把阻尼变成**粒子自己的属性**（`SMOKE_DRAG = 12`，`MATERIAL_DRAG = 0.9`，按 burst 是不是
`ember/ash/impact` 分派），配方里 rise 的那些倍数一个没动，内容表里 11 支烟的 riseSpeed 一个没动：

| 呼出的那口气留在画面里的比例 | 阻尼 0.9（出厂） | 烟用 12（现在） |
| --- | --- | --- |
| 11 支烟在 +2 秒 | classic 0%，最快的几支整团出画 | 全部 100% |
| 11 支烟在 +4 秒 | 早已出画 | 97%～100%，且仍看得见 |

风格差别没有被抹平：垂帘那两支（mist / pipe）依旧往下（+4 秒 +0.10），慢的那两支（cigarillo / cigar）
几乎不动（−0.04～−0.06），快的几支升 0.23～0.30。判据换成两条新的：`plume-shape.test.ts` 现在量**整团
烟**（一局 2.5 秒里所有 burst 合在一张池子里）的窄与高，`plume-on-stage.test.ts` 按 11 支烟逐一钉
"+2 秒必须 95% 以上在画面内、+4 秒若还亮着（平均亮度 > 自身最亮粒子的 45%）就必须留一半在画面内"。
把 `SMOKE_DRAG` 改回 0.9，这两份判据一起红：19 红 6 绿。`plume-shape.test.ts` 里另一条没动：共用一场
带来的新风险（每口烟会不会长成一个样）由 §16 那条盯着 —— 两次 drift 的轨迹必须互不相同。

**阻尼取多大不是拍脑袋，是被判据夹出来的。** 同一个 sweep 跑三档，取"每一支烟的气都还留在画面里"
最快的那一档：

| `SMOKE_DRAG` | 静置烟柱 6 秒的高度（单位＝一颗烟自己画出去的半径） | 判据 |
| --- | --- | --- |
| 12 | 5.1 ～ 24.1（11 支全部连续、零断点） | 26 条全绿 |
| 8 | 更活泼，但最快的那两支（long / ember）的气在 +4 秒出画时还亮着 | 2 红 |
| 6 | 再快一档 | 4 红（classic / ryo 也出局） |

`plume-continuity.test.ts` 是这一轮新加的，量的是"从烟头往上走到烟柱顶，一路上有多少被某一团烟
自己画出去的圆盘盖住"，两条断言各自被一次单点变异证明不是空转：把 drift 每 4 团只放 1 团进来
（发射变稀）→ 12 条红 7 条，最矮的那支从 5.4 个半径掉到 2.6；把每团烟画窄到 1/10（发射不变、
但接不上）→ 红 9 条，classic 的覆盖率从 1.00 掉到 0.54、断点 7 个。
**顺带纠正一句我先前对着合成图说的话**：图里那串"断开的珠子"不是烟柱，是往下掉的烟灰 ——
把 ash/ember 混进这团点云里量，连续性会被误读成 0.21，所以这份判据只收 `kind === 'drift'`。

方向改回来时撞到两条旧判据，两条都改了口径而不是删数：`savour.test.ts` 里"还必须鼓起来
（`scaleGrowth >= 2`）"是上一轮的错误结论，它真正要防的"更薄不许只是变小"现在由形状判据来防；
`rendering.test.ts` 的"风是速度不是加速度"现在先把湍流设成 0 再量，否则量到的是共享流场在两池之间的
差异，不是风。

---

16. Smoke Must Never Look Repeated

禁止：

每次 Puff：
相同路径
相同速度
相同大小
相同生命周期

必须具有：

direction variance
speed variance
density variance
scale variance
rotation variance
turbulence variance

因此：

«每一次 Puff 都应该略有不同。»

---

17. Ember Engine

火星拥有自己的动态系统。

包括：

brightness
temperature illusion
flicker
flare
decay

偶尔：

🔥

突然变亮。

然后慢慢恢复。

---

18. Ash System

灰烬是重要的互动细节。

烟灰：

逐渐增长
    ↓
轻微弯曲
    ↓
达到临界状态
    ↓
自然掉落 / 用户弹掉

掉落时：

gravity
rotation
slight randomness

不能像固定动画一样。

---

19. Extinguish

掐灭必须有很强的反馈。

例如：

ember
 ↓
bright
 ↓
pressure interaction
 ↓
smoke burst
 ↓
ember fade
 ↓
thin smoke
 ↓
silent

声音：

soft hiss

视觉：

🔥 → 🔴 → ⚫

---

20. Discard

丢弃也应该是一个有趣的动作。

例如：

drag
 ↓
ashtray
 ↓
release
 ↓
small bounce
 ↓
smoke
 ↓
fade

或者：

flick
 ↓
arc
 ↓
ashtray
 ↓
impact

不要求文字确认。

如果存在潜在误操作：

«使用动画和空间层级避免误触，而不是弹窗塞文字。»

---

21. Random Event System

随机事件必须让世界感觉“活着”。

事件不能每次按固定时间发生。

包括：

wind
rain
ash_fall
ember_flare
smoke_swirl
lighter_failure
environment_noise
light_change
shadow_change
ambient_event

---

22. Micro Events

大多数事件必须非常小。

例如：

窗外灯光闪过
汽车经过
风吹过
烟雾突然旋转
火星突然变亮
灰突然掉落
背景声音变化

用户可能甚至不知道这是系统事件。

这正是目标。

（2026-10-06 补充）"非常小"也包括**没有事件的时候**。风的风向扰动和烟的湍流原本是每帧重摇一次骰子，
60 Hz 下这就是一条没有来由的高频抖动——玩家不会说"骰子在响"，他只会说背景一直在晃。现在那一次抽样
仍然每帧照做（§71 的取数次数不许变，见 ARCHITECTURE.md「Determinism and replay」），但它是 `approach()`
的**目标**而不是字段的**值**：`windGust` 以 0.45/s、`turbulence` 以 1.1/s 追上去。

实测（同一粒种子、点着后取 30 秒里所有"没有任何事件在跑"的相邻帧）：

| | 每帧最大跳变（修好） | 每帧最大跳变（每帧重摇） |
| --- | --- | --- |
| `world.wind` | 0.00064 | 0.159 |
| `world.windDirectionDeg` | 0.0051° | 1.27° |
| `smoke.turbulence` | 0.0033 | 0.311 |

浏览器里也量到同一件事：真机上取画布上方 30%×18% 那块纯背景，逐帧 RGB 平均绝对差，
每帧重摇是 **0.150**，平滑后是 **0.033 / 0.019**（两次独立复跑）——"晃"在像素上是 4.5 倍。

判据：`packages/game-core/src/__tests__/stillness.test.ts` 四条，每条只被一次单点变异弄红——
去掉风的平滑 → 只红"相邻帧不许跳"那条；去掉湍流的平滑 → 只红湍流那条；把平滑速率改成 ≈0（冻住）→
只红"风仍然要走"；把湍流钉成常量 → 只红"烟仍然要卷"。后半组是必要的：只判"不许动"会被一个死掉的世界
满足，而 §21 明令禁止那种世界。测量刻意跳过有事件在跑的帧并在断点处断开，所以事件自己的起止不会被
读成跳变（它们本来就已经按 sin 包络进出，§59）。

---

23. Environment System

环境必须是数据驱动。

interface Environment {
  id: string

  background
  lighting
  ambientAudio

  wind
  weather

  smokeModifier
  emberModifier

  eventPool
}

环境：

Quiet Room
Balcony
Rainy Window
Night City
Neon Street
Mountain
Late Night Desk

（2026-10-06 补充）这七个地方原本只以"桌上其余"里六个无名色块的形式存在——玩家看得见颜色，看不见
那是"在哪个地方抽烟"，也看不见它们是不是有先后。现在它们从道具行里搬出来，成为一条**有名字的梯子**：
`场景 n / 7`，每张卡片是自己的房间色 + 房间名 + 右上角那一格的**门牌数字**。

门牌只有数字不够——Night City 是第 14 天，Mountain 是第 14 次休息，两个 `14` 在纯图标层是同一张卡。
所以每条轴带一个记号，且用的是界面里本来就有的形状（◷ 休息、— 一支、▭ 烟盒）：**天数不戴记号**，
因为日阶梯是整个界面已经在数的那条轴。于是按休息次数计的那间印 `◷14`、按天数计的 14 天那间只印 `14`。**本轮把 Mountain 从 `◷14` 挪到
day 45**：用户的话是「按这个等级配置一套」＋「可玩性第一」，七间落在同一条轴上才读得出「一套」，
而且 45 天本来就是 §37 已有的一个里程碑。挪走之后出厂数据里再没有非天数的房间。轴的名字只出现在
读屏里（`第 14 天` / `14 次休息` / `一开始就在`），屏幕上一个字也不多出。

放在哪：S10 侧栏明写七入口（休息/烟种/烟盒/皮肤/桌上其余/减量/设置），没有第八个，所以场景不新增入口，
而是**并进 `皮肤` 那一格**——"把背景调一下"本来就有两半，四色层是一半，房间是另一半。点侧栏/轨道的
`皮肤` 落到的就是这两行（实测手机 390×844 落在 `.rooms-kind` top=412，桌面 1440×900 栏仍是 x=1180 w=260）。

判据：`apps/web/src/__tests__/scenes.test.ts` 八条——七间房一间不丢也不重复（`byRung` 的 id 集合与
`DEFAULT_CONTENT.environments` 逐一对上）、每条轴都点名且 default 那间**没有数字**、日数递增、
`0 / 7` 与 `3 / 7`、图标层标题可以没有字但门牌必须能读出来、中文读屏逐个不为空且不残留 `{n}`、
五把轴各有自己的 key 且 EN/zh 两侧都有值。最后一条"没有任何两间房画成同一个样"是**单点变异验过的**：
把 `RUNG_MARKS.breaks` 改成 `null`：以前红在「两间都印 `14`」那条；数据换成一条轴之后，
红的是那条**合成用例**（同一格 14 必须能画出 `◷14` 与 `14` 两种样子）——判据跟着数据换了对象，
没有变成空转。

浏览器实测（真机 390×844 / 1440×900 / 阿拉伯语 RTL / 纯图标层）：七张卡、卡高 68px（≥44 触摸）、
名字一律一行不换行（超出卡宽的走省略号，例如 111px 卡宽下的 `Late Night …`；探针的 ±1px 容差量不到
只差一两个像素的 `Rainy Window`，但截图里它确实被截成了 `Rainy Wind…`——省略号是设计好的退路，
换行不是）、文档与卡片均无横向溢出、RTL 下 `◷14` 不被双向排序拆开、点未解锁的卡不改选择
（`data-selected` 仍只有 quiet-room）。

搬走之后桌上其余只剩四类 20 个色块（打火机 4 / 烟灰缸 4 / 烟形 5 / 声音 7），与环境的 7 张卡不重复；
这条"没有第二个入口控制同一个东西"的判据在浏览器里数 `.swatches .swatch` 与 `[data-scene]` 的归属。

---

24. Time System

环境随时间变化。

例如：

morning
afternoon
sunset
night
late-night

不需要告诉用户：

«“现在是夜晚模式。”»

直接改变：

- 光线
- 环境声音
- 色温
- 烟雾可见度
- 背景
- 随机事件

---

25. Weather System

支持：

clear
cloudy
rain
wind
storm

主要影响：

smoke
sound
lighting
environment

---

26. Audio System

使用 Web Audio API。

建立独立：

AudioEngine

声音：

lighter
ember
puff
ash
extinguish
wind
rain
room
city

支持：

volume
pitch variation
random variation
spatial pan
layering

声音不要重复播放得像机械按钮。

（2026-10-06 补充）"不像机械按钮"最狠的一处是**按住吸入那一段**——它不是事件，是一条持续 1–2 秒的
bed，玩家真的会听见它。原来它是"粉红噪声过一个 460Hz 带通"，一条宽带通 + 一个 0.32Hz 慢摆。
把生产侧的 `createAudioEngine` 接到 `OfflineAudioContext` 上离线渲染 2 秒（同一个引擎、同一份配方、
只把 autoplay 那个 state 标志包一下——offline 上下文永远不会报 running），量出来是：

| 吸入 0.85（同一粒种子） | 谱心 | 1.5k 以上 / 150–900Hz 之比 | 谱通量（自己动多少） | 峰值 |
| --- | --- | --- | --- | --- |
| 改前（一个带通） | 2111 Hz | 4.39 | 12.07 | 0.058 |
| 改后（管 + 抖 + 胸） | 1440 Hz | 2.02 | 16.23 | 0.080 |

诊断不是"不够亮"，是**没有下半身**：4.4 倍的高频比就是"吹风机"三个字的形状。所以加的不是高频，
是三段里的第二段和第三段：

- **管（duct）**：一个 `peaking` 挂在 body 之上（1.9kHz、Q0.9、+3dB），中心频率由引擎跟着用力走
  （`1450 + intensity*820 + density*150`）。**必须是 peaking 不能是串联 bandpass**——串联会把想强调的那段
  自己饿死，实测那样反而更暗（谱心 2114、但 19:1 的头重 + 48% 的响度是另一条走错的路，+9dB 那次）。
- **抖（flutter）**：7.3Hz 与 17.9Hz 两个不成整数倍的正弦去摇那根管（±260 / ±90Hz）。通量 12.07 → 16.23
  就是它。**摇的是管的频率，不是 bed 的 level**：LFO 是"加"到参数上的，而引擎会把 level 驱动到 0——
  挂在 level 上就等于一根不吸的时候也在呼吸的烟（这条有专门的判据）。
- **胸（rumble）**：一路并行的 brown 噪声过 300Hz 低通，`gain 0.28`，汇到 level 旁边而不是前面。
  0.55 那一次把整条 bed 压成 907Hz 的闷响，0.28 是把 2.02 这个比解出来的。

判据：`packages/game-audio/src/__tests__/draw-voice.test.ts` 四条，五次单点变异——去掉 formant 目标只红
"管会随用力收紧"；去掉 flutter 只红"两个不成整数倍的速率"（它同时弄红下一条的正对照，那是设计）；
去掉 body 只红"并在旁边而不是穿过去"；往 level 上挂一个 LFO 只红"静音的 bed 不许呼吸"。
**第五次（把 body 的 loop 排除在 re-seed 之外）一开始活了下来**——`beds.test.ts` 那条
`>= loopsBefore + 5` 挡不住它，于是把这条判据搬到它声称的地方（数喂进 `bed.draw.draw:rumble` 的 loop
源在 20 秒后必须不止一个），现在它会红，且只红 body 那一条。

顺带修掉一个真 bug：`BedController.sync()` 是**手抄字段**重建 target 的（`{ gain, cutoff }`），
所以新加的 `formant` 算好了、接好了、然后在到达图之前被丢掉——和 storage 那几个
`readSettings/cloneProgress` 逐字段重建的坑是同一个形状。现在改成展开 + 只覆盖 trim 碰的那一个。

**用户听后说"偏亮"。量下来病不在整体明暗，在那根管子的落点。** 用同一把离线尺子（`OfflineAudioContext`
渲染出厂那条链，再用 26 个对数分布的 Goertzel 探针取带能量）量：把 2.4 kHz 的能量对 900 Hz 的身体比，
旧配方是 **3.82**；把 duct 从 1900 挪到 1200、运行时 formant 从 `1450+820i+150d` 改成
`950+330i+90d` 之后是 **2.97（静止）/ 2.48–2.73（一口之中）**。抖动按同比例缩（260→170），
所以 shimmer 0.61 → 0.62 —— 颤动没被顺手抹掉。

这里有一条判据教训值得单独记：原来那条"formant 必须 < 2400"的线，比它要拦的出厂值 2379 只高了
21 Hz。**画在现有值头上的线什么都拦不住** —— 它绿了整整一轮，而声音一直是亮的。现在收到 1500
（2.4 kHz 那条"亮"带之下），并补一条"抖动深度不超过 duct 基频的 15%"：把基频调低这件事本身
会让同样的绝对深度相对变尖，这两件事必须一起看。

---

27. Ambient Audio

环境音必须是低存在感的。

用户应该：

«感觉到环境。»

而不是：

«听见一段循环音频。»

---

28. No-text Interaction

任何核心游戏操作都应该不依赖文字。

例如：

点火

不是：

LIGHT

而是：

看到打火机
↓
点击
↓
火焰出现

弹灰

不是：

TAP TO REMOVE ASH

而是：

灰变长
↓
用户自然尝试操作
↓
灰掉落

例外（2026-09-30 修订）：

画面可以在物体本来就在"呼吸"的时候，给它配一个英文动词：

tap
light
hold
flick
press
drop

它不是说明书，是那个光环的名字。必须同时满足：

- 一个词，永远不是一句话
- 和提示光环同一时刻出现、同一时刻消失，不是新增的一层 UI
- 设置里可以关掉（64），关掉之后游戏依然完整可玩
- 屏幕阅读器读到的是同一件事的口语描述，不是这个词
- 没做过的动作才提示；玩家已经在做了就闭嘴

判断标准还是 06 的 Smile Test：如果那个词让人觉得自己变笨了，它就该被删掉。

---

29. Icon Language

建立统一视觉符号系统。

例如：

✦
+
×
↗
↘
⌁
•••

图标必须：

- 简单
- 跨文化
- 不依赖文字
- 动画化
- 有状态变化

---

30. Haptic-like Feedback

Web 环境不能假设存在振动。

但可以设计：

visual impact
audio impact
micro-animation

未来 Native Desktop / Mobile 可以增加：

haptic

而不改变 Game Core。

---

31. Craving Session

用户可以直接进入短暂休息。

界面不应该出现大段说明。

例如：

🌫️

      🚬

          🔥

底部曾经只有一个极简的：

◷ 03:00

（2026-09-30 修订）首页不再出现任何数字，包括这个。时间退到「这次休息」里面：玩家主动去看的
时候它一定在，而且比摆在脸上时更准——切后台、锁屏、页面被系统回收之后，都按系统时间续上。

依据还是 09：首页是一块完整的场景，数字是贴在场景上的一层 App。

（2026-10-05 再修订，按 Smoke Ritual §9.2 与玩家决定）时间回到首页顶部那一行，和环内的支数、
剩余百分比并排：`1 · 03:00 · 100%`。理由变了——这一行不是"贴在场景上的一层 App"，它是这次休息的
仪表，而且整行只有图标与阿拉伯数字，正是 §9.2 允许的零文字形态。规则收窄为：
**首页的数字只准出现在这一行里**，场景上仍然一个数字都没有；这一行的环内读数随状态换（点燃数秒、
吸烟数口、烟灰缸量灰），换的是读数不是页面。

---

32. Craving Self-Report

如果用户愿意，可以通过非常简单的视觉控件记录：

😌 ───────── 😣

完全不需要：

«“请选择您当前的 craving intensity。”»

只需要：

😌      😐      😣

用户拖动即可。

---

33. Statistics

记录：

sessions
session duration
puffs
events
craving before
craving after
smoke-free days
cravings handled

（2026-10-06 补充，按 Smoke Ritual §reduction 落地）这一节从"记录"变成一页可看的东西：减量页
S20 折在「这次休息」里面，不是第四个 tab，也不是首页。页上只有玩家自己日志的五个数字——

```
1 / 3           近 7 天 · 支        较上周同期 少吸 2 支
（环）        ▁▁▁▂▁▁▃（当日冷色高亮）    〜 深呼气 · ◍ 喝水 · ⌇ 走两步
```

上限由玩家自己设（settings 里一行 `Limit`，0 表示不设）；到了上限**照抽**，只是环去程化：弧线
和数字一起变灰，数字换成 ◇。不弹窗、不锁死、不设断签惩罚，也没有第四条建议——替代动作固定三
个，多的那一个不许出现。

三条判据，都不靠散文：

- `apps/web/src/__tests__/reduction.test.ts` 扫全部 `reduction.*` 文案，健康断言（健康/肺/戒/风险
  /health/lung/risk…）与压力动词（should/must）一条都不许命中，并且当场证明这份词表咬得动。
- `tests/architecture.test.ts` 里"纯层只携带、不阅读上限"：`packages/game-core`、`game-renderer`、
  `game-statistics`、`shared` 任何一处读 `.dailyLimitSticks` 就红——燃烧不因为一个数字停下来。
- `packages/game-statistics/src/__tests__/reduction.test.ts` 只算日志本身：七个格子、当日、本周与
  上周同期的差（负数=少），空日志给七个 0，绝不出 NaN。

量词在这页是允许的（设计稿自己写的就是 `12 / 20 支`）；§9.2 那条"核心循环只有图标与阿拉伯数字"
仍然只管首页那一行、pill 和 rail。

---

34. Journey

Journey 页面不是传统 Dashboard。

不要堆：

Total
Average
Statistics
Data
Analytics

而是做成视觉化旅程。

例如：

●──●──●──●──●──●──●──●

D1       D7      D14      D30

用户看到自己的轨迹即可。

---

35. Statistics With Minimal Text

例如：

27

☀️  8h
🌙  3h
🔥  42
🌫️  18

尽可能用：

- 数字
- 图形
- 图标
- 时间轴

而不是段落。

---

36. Trigger Tracking

允许用户记录 craving 来源。

但不要让用户阅读一张问卷。

使用视觉标签：

☕
🍺
💼
😤
🌙
🧑‍🤝‍🧑
🚗
🍽️

用户点击即可。

---

37. Long-term Progression

整个系统支持：

Day 1
Day 3
Day 7
Day 14
Day 21
Day 30
Day 45
Day 60
Day 90

用于解锁：

environment
lighter
ashtray
smoke style
ambient sound
visual theme

不要使用复杂的 RPG 数值。

---

38. Collection

Collection 是一个视觉收藏柜。

分类：

Cigarettes
Lighters
Environments
Ashtrays
Smoke
Sounds

所有物品均原创。

---

39. Unlock Design

解锁时不要弹：

Congratulations!
You unlocked...

而应该：

物品自己出现

例如：

🌫️
     ✦
       ✦

然后新的环境卡片亮起。

---

40. Desktop Pet Vision

未来 Windows / macOS 版本必须能够成为：

«一个真正的桌面小宠物。»

不是简单把 Web 页面塞进窗口。

---

41. Desktop Pet

窗口：

transparent
frameless
always-on-top
resizable
draggable

背景透明。

只有：

烟
火
烟雾
小型环境

存在于桌面上。

---

42. Desktop Behavior

Puffly 可以：

idle
sleep
burn
look
smoke
react

用户不操作时：

«不应该疯狂吸引注意。»

它应该安静地存在。

---

43. Work Mode

用户正在：

coding
writing
browsing
working

Puffly 可以作为一个微型休息伙伴存在。

例如：

🌫️

用户点一下。

开始一个短暂休息。

然后继续工作。

---

44. Desktop Context Menu

尽可能图标化：

🔥
🌫️
📊
⚙️
×

如果必须文字：

«只使用极短单词。»

---

45. Architecture

完整架构：

                    PUFFLY
                       │
              ┌────────┴────────┐
              │                 │
          Platform          Game System
              │                 │
      ┌───────┼───────┐        │
      │       │       │        │
      Web   Desktop  Mobile    │
      │       │       │        │
      └───────┴───────┘        │
                │              │
                └──────┬───────┘
                       ↓
                  Game Core
                       │
       ┌───────────────┼───────────────┐
       ↓               ↓               ↓
   Game State        Events          Progress
       │               │               │
       └───────────────┼───────────────┘
                       ↓
                  Adapters
              ┌────────┼────────┐
              ↓        ↓        ↓
          Renderer   Audio    Storage

---

46. Monorepo

推荐：

puffly/

apps/
  web/
  desktop/

packages/
  game-core/
  game-renderer/
  game-content/
  game-audio/
  game-storage/
  game-statistics/
  shared/

docs/
tests/

---

47. Game Core Rules

Game Core：

允许：

TypeScript
pure functions
state machines
data models
random system
simulation

禁止：

Vue
DOM
Canvas
window
document
IndexedDB
Tauri
Web Audio

---

48. Renderer Rules

Renderer：

GameState
 ↓
Render

Renderer 不应该修改游戏状态。

例如：

Game Core
    ↓
state
    ↓
Canvas Renderer

而不是：

Canvas click
 ↓
直接修改 Vue data

Canvas 输入必须经过 Input Adapter → Game Core。

---

49. Input Architecture

统一输入：

interface GameInput {
  type:
    | "tap"
    | "hold"
    | "release"
    | "drag"
    | "swipe"

  x: number
  y: number

  timestamp: number
}

Web：

Pointer Events

未来 Desktop：

Mouse
Touch
Global shortcut

全部转换成 GameInput。

本轮删掉两条**没人读的事实**：`HIT.pack`（一个点击半径）和 `state.anchors.pack`（一个锚点）。
桌上那个烟盒是布景 —— 它说清"这根烟从哪儿来"，但它不是控件；而它同时带着半径和锚点，两边都没有读者，
于是画面上出现一个"看着能点、点了没反应"的东西（原话：那个红盒子我不知道那是干什么）。
判据把这件事写成类别而不是个案（`stage.test.ts`）：`hitCandidates` 给出的可点集合必须正好是
{cigarette, ember, lighter, ashtray}（挂了灰再加 ash），而 `anchors` 上不许再留任何
"没人能点却占了坐标"的字段。布局仍然知道烟盒在哪 —— 画面和 §55 的避让线都要用那个位置 ——
不再知道的是"它算不算一个按钮"。

---

50. Storage Architecture

核心只认识：

StorageAdapter

Web：

IndexedDB

Desktop：

Tauri backend / SQLite / local storage adapter

Game Core 不关心具体实现。

---

51. Export / Import

用户的数据应该可以：

Export JSON
Import JSON

因为这是纯本地产品。

用户应该能够在没有账号的情况下拥有自己的数据。

（2026-10-06 补充，按 Smoke Ritual `storage.mustSupport` 落地）三条出口都进了同一张 settings sheet：
`⤓ 导出`、`⤒ 导入`、`⌫ 清空`。清空是**两段式**——点一次按钮变成橙色、标签换成"再点一次"，六秒之内
再点才真的动手；离开这张 sheet 就重新计数。没有对话框，§64 那条"不弹技术味道的窗"对它同样成立。

它同时落下 shell 里的写回闸门：`persistence.reset()` 之后，内存里那份还在跑的模拟再怎么写
`saveSettings / saveProgress / putSession / saveOpenBreak` 都不会回来——否则"删除我的数据"只维持到
下一帧，而下一帧一定来。

判据分两层：`apps/web/src/services/__tests__/persistence.test.ts` 证明清空之后 `load()` 是全新玩家、
且清空之后再写仍然空（把闸门拆掉，第二条必红）；四个记录库被清空、`meta` 里的布局标记留下，则在
`packages/game-storage/src/__tests__/idb.test.ts`。

---

52. Privacy

默认：

Local-first

不需要：

- 注册
- 登录
- 上传
- 云端账户

除非未来明确增加同步功能。

---

53. Offline First

Puffly Web 必须支持：

PWA
Service Worker
Offline assets
IndexedDB

没有网络时：

«核心游戏依然完整可用。»

---

54. Performance

目标：

60 FPS desktop
30–60 FPS mobile

必须避免：

大量 DOM particles
每帧 Vue reactive 更新
大量 component rerender

使用：

Canvas
requestAnimationFrame
deltaTime
object pooling
particle budget

---

55. Responsive Design

必须适配：

mobile portrait
mobile landscape
tablet
desktop
ultrawide

Canvas 使用：

logical coordinates
device pixel ratio
adaptive scaling

（2026-10-06 补充）"logical coordinates" 的意思是**同一份归一化坐标喂给画和点两边**——这条破过一次，
而且是在手机上：`LighterSnapshot.at` 在引擎构造时从**默认布局**抄了一份，之后再没人更新它，
而命中锚点（`anchors.lighter`）走的是当前布局。于是在 390×844 上打火机被画在桌面版该在的位置：
**离它的可点锚点 63px、离烟盒只剩 9.8px**——玩家看见的就是"打火机压在红盒子上，点了没反应"。
现在 `at` 这个字段整个删掉了，画与点都只读 `state.stage.layout.lighter`（一个事实一个家）。

判据：`packages/game-renderer/src/__tests__/prop-placement.test.ts`。关键是它**不问布局在哪里**——
它调真的 `drawLighter`，从假画布记下的路径坐标里把画出来的盒子读回来，再要求锚点落在这个盒子内。
第一版不是这样写的：它拿 `lighterBox(vp.px(layout.lighter))` 自己算，于是把 `drawLighter` 里的位置
改回那个坏值时**一条都不红**（自己量出来的：mutation survived, 0 red）。改成读真实调用之后，
同一个 mutation 红两条。另一条按 12 种设备形状（320×568 到 2560×1080，含横屏手机）钉住
"打火机与烟盒至少留半个触摸目标（24px）的空隙"——坏的那版在 390×844 上只剩 9.8px。

复跑（不需要浏览器，rAF 不参与）：`npx vitest run packages/game-renderer`。
修完之后 390×844 实测空隙 74.7px、锚点落在画出的盒子内。

本轮补一条判据（`packages/game-renderer/src/__tests__/chrome-band.test.ts`）：**壳子的下沿家具是像素，不是比例。**
`CHROME_CLEAR_Y = 0.72` 是一条比例线，而按钮占的是"离底 74px + 高 58px"这 132 个像素，于是同一条线在不同高度上
含义完全不同：390×844 的竖屏上它占舞台 17%，同一台手机横过来（844×390）它占 37%。拿 13 个窗口形状实测，
横屏手机上**还没拿起来的那支烟伸到 y=288，而按钮从 y=258 就开始画**（烟灰缸到 300、烟盒到 256），
最小的一档 320×568 上烟灰缸离按钮只剩 1px。旧判据只量"锚点 ≤ 0.72"——锚点全部合规，画出来的东西却在按钮底下，
正是「按钮和底下的东西重叠」在横屏那一半没被治干净的原因。

现在这条线由引擎按舞台的**像素高度**现算（`chromeClearY(heightPx)`）：不够就把整套纵向坐标等比抬上去
（`liftTo`，横轴与相对关系不动），锚点本来就够高时一字不改，所以桌面窗口看到的还是简报里那张表、
§71 的回放也不受影响。判据分三层，各自只被自己那一层的变异打红：核心算法（`chromeClearY` 改成常量 → 红 2 条）、
引擎接线（`layoutFor(next)` 丢掉高度 → 只红画面那一层）、壳子有没有真把高度报上去（`usePuffly` 少传一个参数 →
只红 `chrome-furniture.test.ts`）。最后一条故意写在 shell 层而不是 `stage.test.ts` 里：**纯层不许读文件（§47）**，
"常数值等于 CSS 里那两个数"这种核对不能放在纯层。

---

56. Visual Style

整体风格：

«Cinematic + Soft + Slightly Stylized»

不是：

photorealistic

也不是：

cartoon emoji

而是：

真实光影
+
柔和粒子
+
稍微艺术化
+
干净 UI

---

57. Color System

基础：

deep charcoal
warm gray
soft white
ember orange
smoke gray

颜色必须克制。

火焰是主要视觉焦点。

这五个词在交接文档附录 C「视觉基线」里是有数值的，界面壳子现在逐一对齐（本轮之前壳子用的是
我自己选的四个十六进制值，画布上的炭头却是基线里的 #FF8A3D —— 于是**主操作按钮比它所描述的那点火
更红**，而这两样在同一个屏幕上）：

| 词 | 基线 | 落在 |
| --- | --- | --- |
| deep charcoal（底色） | `#0B0A09` | `--deep-charcoal`，同时是 PWA 的 `background_color` / `theme_color` |
| soft white（正文） | `#F2EDE6` | `--soft-white` |
| ember orange（余烬橙） | `#FF8A3D` | `--ember-orange` |
| cool（冷色·减量/水） | `#A8D4E0` | `--cool-blue`（本轮起成为 token，此前只是组件里一个字面量兜底） |
| warm gray（次级） | `#7E746A` | `--warm-gray`，**只用于分隔线** |

**一处有意不照抄**：`#7E746A` 压在 `#0B0A09` 上是 4.31:1，而 §5.4 要求正文 ≥ WCAG AA（15px 的
标签算正文）——同一份文档的两条自己打架，于是取能读的那一条：标签继续用 `--smoke-gray`（`#C4C6CD`）。
这条取舍有判据钉住（`apps/web/src/__tests__/visual-baseline.test.ts`：四个 token 等于表中数值、
manifest 那两个颜色等于底色、所有落在底色上的文字色 ≥ 4.5、而 `--warm-gray` 实测 < 4.5 且 ≥ 3）。
两条单点变异各自把红落在该落的那几格上：把 `--ember-orange` 改回旧值只红"等于表中数值"那一条；
把 `--warm-gray` 改回旧值红两条（数值 + 那条 3:1 的下界）。

字体这一行**没有**照抄：基线写 Noto Sans SC + Inter Tight，壳子用的是系统圆体
（§56 的 soft 那一支）。换字体会动到每一屏的字，而这一轮我没有能看画面的浏览器，
所以留给眼睛决定，不留给猜测。

---

58. Lighting

烟头：

local glow

烟雾：

soft scattering

环境：

subtle ambient light

不要使用大量霓虹渐变。

这一节也管"软"是怎么来的：贴图自己的衰减，不是 `ctx.filter`。而烟雾样式的 `blur` 以前**没有任何读者**
——写进状态就结束了，于是五种烟在"糊不糊"这一维上画出来完全一样。现在它决定贴图的四条 alpha 曲线
（`exp(-(r/σ)²)`，σ 随 blur 走），默认比原来更紧：原来那四条 stop 相当于 σ=0.56，现在 0.42 ——
用户说的"没对上焦"正是这件事。判据 `sprite-focus.test.ts` 量的是烘焙出来的四条 alpha：单调递减、
blur 越大则外半区的光越多、默认比旧曲线更紧，并且钉住渲染器真的把样式的 blur 传给了贴图。

---

59. Animation Principles

动画必须：

organic
non-linear
slightly imperfect

禁止：

linear
mechanical
identical loop

使用：

easing
noise
randomness
spring
inertia

---

60. Micro-interactions

每个动作必须有至少：

visual feedback

最好再有：

audio feedback

例如：

tap
→ glow

drag
→ smoke displacement

ash
→ gravity

extinguish
→ smoke burst

---

61. UI Animation

UI 出现：

fade + slight movement

UI 消失：

fade

不要大量弹窗。

---

62. No Modal Abuse

禁止频繁：

Are you sure?
Confirm?
Cancel?
Continue?

尽量使用：

undo
gesture
safe zones

---

63. Error Handling

错误也尽量不要出现技术文字。

例如：

Audio unavailable

不要直接显示。

如果浏览器禁止 Audio：

«游戏依然可以运行。»

不只是"能运行"：听不见的时候，画面要接手声音那一路的提示。哪个动作本来有一个音，
现在就要有一个看得见的记号（更大、稍长一点的同一个记号，不是新发明一套语言）。
静音、被自动播放策略挡住、平台根本没有 Web Audio，都算这种情况。

如果 Storage 出错：

«使用内存 fallback，并提供恢复。»

---

64. Accessibility

虽然整体是视觉游戏，但必须支持：

- keyboard
- reduced motion
- screen scaling
- sufficient contrast
- no audio dependency

Reduced Motion：

disable heavy smoke
reduce particle count
reduce camera movement

---

65. Keyboard

桌面 Web：

Space
Enter
Escape
Arrow keys

可以作为辅助输入。

但不能要求用户阅读说明才能知道。

---

66. Touch

移动端：

tap
hold
drag
swipe

必须避免：

tiny controls
precise pixel targets

手指目标怎么放大：小目标按倍数放大，已经够大的目标只再加一个手指的余量。
纯粹的倍数会让桌上最大的那个物体（烟灰缸）把手边的小目标整个吞掉——玩家点中的是
"旁边的桌子"，得到的却是"把烟摁灭"，而这件事他没有任何办法自己推断出来。

---

67. Desktop Pet Input

桌面端允许：

left click
right click
drag
keyboard shortcut

---

68. Data Model

核心模型：

UserProfile
Session
SessionEvent
CigaretteType
Environment
CollectionItem
Progress
Settings
Statistics

---

69. Session Event

interface SessionEvent {
  id: string

  type: string

  timestamp: number

  payload?: Record<string, unknown>
}

例如：

LIGHT
PUFF
ASH
WIND
EMBER_FLARE
EXTINGUISH
DISCARD

---

70. Statistics

统计系统必须从 Session Event 推导。

不要到处直接修改：

totalPuffs
totalSessions

避免数据不一致。

采用：

Raw Session
 ↓
Statistics Aggregator
 ↓
Derived Statistics

---

71. Deterministic Replay

由于随机系统支持 Seed：

可以保存：

session seed

未来能够：

replay session
debug event
reproduce bug

---

72. Testing

必须覆盖：

Game State
Transitions
Burn
Puff
Ash
Extinguish
Discard
Events
RNG
Statistics
Storage
Import
Export

并保证：

npm test
npm run build

通过。

---

73. Architecture Tests

增加 guard tests，确保：

game-core

不能 import：

vue
canvas
dom
tauri
indexeddb
window
document

这是架构级测试。

---

74. Code Quality

要求：

TypeScript strict
ESLint
Prettier
Vitest

禁止：

any

除非有明确理由。

---

75. Dependency Policy

不要为了一个简单功能增加大型依赖。

优先：

Web APIs
Canvas
Web Audio
Vue
TypeScript

---

76. No Premature Engine

不要因为“这是游戏”就直接引入：

Phaser
Pixi
Three.js
Unity
Godot

第一版使用：

Canvas 2D

保持轻量。

如果未来确实证明 Canvas 不够，再独立替换 Renderer。

---

77. Content Driven

新增：

烟
环境
声音
事件
收藏品

优先增加配置和 content，而不是修改 Core。

---

78. Future Desktop Reuse

未来 Tauri：

apps/desktop

只负责：

window
tray
desktop integration
native APIs

不要把：

Game Core

复制一份。

---

79. Future Renderer Reuse

Web：

CanvasRenderer

Desktop：

CanvasRenderer

优先直接复用。

只有在桌面透明窗口 / 特殊性能需求出现时，才增加：

DesktopRenderer

---

80. Future Mobile

PWA / Mobile App 同样复用：

Game Core
Game Content
Game Audio
Game Statistics
Storage abstraction

只替换：

Platform Shell

---

81. Design Anti-patterns

严格禁止：

1

大量文字教程。

2

强制注册。

3

打开后弹出 5 个权限框。

4

复杂 Dashboard。

5

大量按钮。

6

固定循环动画。

7

所有烟雾完全相同。

8

所有事件按照固定时间触发。

9

Vue 驱动每一个粒子。

10

把 Game Core 写进 Component。

11

把 Browser API 写进 Game Core。

12

为未来 Desktop 重写一套游戏逻辑。

---

82. Product Emotional Target

用户打开 Puffly 后应该产生：

第一次：
“哦，有意思。”

第二次：
“这个烟雾挺好看。”

第三次：
“刚才那个火星还挺真实。”

几天后：
“它怎么又在桌面上冒烟了。”

一段时间后：
“这个小东西已经变成我的休息仪式了。”

而不是：

“这是一个戒烟工具。”

---

83. Core Product Loop

最终循环：

WORK
 ↓
NOTICE PUFFLY
 ↓
INTERACT
 ↓
SHORT BREAK
 ↓
OBSERVE
 ↓
RELAX
 ↓
RETURN TO WORK

Puffly 应该成为：

«一个虚拟的“抽烟休息替代仪式”。»

---

84. Product Boundary

Puffly 不应该：

- 宣称治疗戒烟
- 提供医学诊断
- 伪造医学恢复数据
- 把游戏数据包装成医学结论
- 推广现实烟草品牌
- 鼓励真实吸烟
- 诱导用户购买烟草

它是一款：

«娱乐 + 解压 + 戒烟过程中的仪式替代工具。»

---

85. Final UX Rule

如果一个功能需要用户阅读超过一句话才能理解：

优先重新设计交互。

如果一个按钮可以通过视觉动作表达：

不要使用文字。

如果一个动画可以解释状态：

不要弹提示。

如果一个声音可以表达反馈：

不要显示文字。

如果用户能够自己发现：

不要主动教学。

---

86. Final Technical Rule

任何未来平台都必须能够复用：

Game Core
Game State
Simulation
RNG
Game Content
Event System
Statistics
Audio abstraction
Storage abstraction

Web / Windows / macOS / Mobile 只负责：

Input
Rendering
Platform Integration

---

87. Final Quality Bar

Puffly 的完成标准不是：

«“功能都能用。”»

而是：

«打开之后，它看起来像一个真实存在的小世界。»

烟不是一张图片。

火不是一个 GIF。

声音不是一个 MP3 循环。

随机事件不是随机弹窗。

UI 不是一堆按钮。

统计不是一堆数字。

桌面版也不是一个缩小的网站。

整个产品必须形成：

视觉
+
声音
+
物理
+
随机性
+
交互
+
长期成长

共同构成的体验。

---

88. Final Project Identity

Name

«Puffly»

Repository

«fwd001/puffly»

Slogan

«Take a break. Skip the smoke.»

Product category

«Interactive relaxation game / smoke-free break companion»

Core concept

«A tiny virtual smoke break without the smoke.»

Design language

«Cinematic / Soft / Minimal / Organic / Playful»

Global principle

«See it. Touch it. Understand it.»

Architecture principle

«One Game Core, many platforms.»

Long-term vision

«Web Game → PWA → Desktop Pet → Cross-platform companion»

---

89. Final Implementation Requirement

实现整个项目时，以上文档视为产品、架构、交互和工程设计的最高规格。

如果具体实现细节没有被明确规定：

1. 优先保持架构边界；
2. 优先保持跨平台复用；
3. 优先保持低文字依赖；
4. 优先保持直觉交互；
5. 优先保持动画自然性；
6. 优先保持 60 FPS / 移动端流畅；
7. 优先保持 Local-first；
8. 优先保持简单；
9. 不为了“功能更多”而增加复杂度；
10. 不破坏 Game Core 与 Platform 的解耦。

最终交付的 Puffly 应该不是一个 Demo，而是一套具有完整游戏核心、视觉系统、声音系统、数据系统、成长系统和跨平台扩展能力的产品级代码库。