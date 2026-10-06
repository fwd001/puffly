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
| 卷烟 / 手卷 / 丁香（7） | `savourMs: 0`，`loadPerPuff > 0` | 按住多久就吸多满，次线性；每口给下一口留下阻力（余烬更亮、燃得更快） |
| 小雪茄 / 雪茄 / 斗烟（3） | `savourMs: 2000`，`loadPerPuff: 0` | 含住两秒——进度环走的是这张嘴的曲线而不是时钟；不入肺，所以不留阻力 |
| 水烟（1） | `savourMs: 0`，`loadPerPuff: 0.12` | 长会话低节奏：单支 50 分钟、口数更多、阻力留得最轻 |

三个字段都写进内容，核心不认"雪茄"这个词（§77）；pill 上的动词由这根烟自己的读数决定
（`readouts.savourMs > 0` → `含住 / savour`，否则 `吸入 / inhale`），家里只有一个地方知道这件事：
`ctaKeyFor()`。

判据：`packages/game-core/src/__tests__/savour.test.ts` 用同一支烟的两份内容做对照——含住的曲线在
500/1000/2000ms 上分别是 0.25/0.5/1 且不随时钟走；吸入的那条是次线性的前半段；吐出来的云按含进
嘴的量长；三口之后含住的负载是 0、吸入的 > 0.2。把 `savourMs` 或 `loadPerPuff` 任一字段送进黑洞
（改成常量），对应那两条必红——两次单点变异实测过。品类与抽法是不是同一件事，另有
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

---

58. Lighting

烟头：

local glow

烟雾：

soft scattering

环境：

subtle ambient light

不要使用大量霓虹渐变。

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