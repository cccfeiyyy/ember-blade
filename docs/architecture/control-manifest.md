# 控制清单（Control Manifest）— v2.0

> **Manifest Version**: 2026-10-19（v2.0）
> **Source**: Accepted ADRs（ADR-001/002/003）+ 技术偏好 + 引擎约束（Three.js r128）
> **用途**: 程序员实现/评审时的「必须做 / 禁止做」速查；Story 中直接引用本文件。
> **更新规则**: 新增 ADR 或技术偏好变更后必须同步本文件；实现不得违反本清单，除非新 ADR 明确豁免。

---

## Foundation 层规则

### Required Patterns
- **单文件构建**：新增运行时模块必须作为 `.dev/src/*.js` 的 IIFE 接入，并在 `template.html` 添加 `/*__MODULE__*/` 标记、在 `build.mjs` 的 `parts` 中登记；顺序必须保证依赖先加载（参考：`THREE → util → audio → world → blessings → game → hud → combat`）。
- **全局命名空间**：模块只通过 `window.G.*` 通信；挂载点在 IIFE 末尾（如 `G.hud = H;`）。
- **状态真值**：游戏状态只在 `game.js` 的 `S/P/C/D/CFG`；其他模块通过 `G.game` 门面读写。
- **模式切换**：必须走 `G.game.setMode(m)`；`blessing` 为合法模式，`HUD_MODES` 需包含它。
- **持久化集中**：`localStorage` 只允许在 `game.js` 中访问，全部包 `try/catch`；键名必须是常量（`emberblade_best_v2`、`emberblade_settings_v2`）。
- **失败安全**：启动/音频/存档/渲染更新不得因单点异常中断主循环；主循环已有 try/catch，新增代码仍需自保。

### Forbidden Approaches
- 禁止引入 npm 依赖、打包器、`<script type="module">`（`file://` 不可用）、CDN、外部资源文件。
- 禁止在模块内容中出现 `</script>` 字符串（构建会失败）。
- 禁止在 `src/*.js` 中直接 `document.getElementById` 获取 HUD 节点做逻辑判断（HUD 只由 `hud.js` 操作；其他模块调用 `G.hud.*`）。
- 禁止跨模块直接修改 `S.mode`（除既有 `onVictory/onDefeat` 与 `openBlessing/selectBlessing` 内部流程）。
- 禁止在每帧循环中创建大量对象/数组（除既有 VFX 临时对象）。

### Performance Guardrails
- 帧预算 16.7ms（60 FPS）；新增每帧逻辑应 <0.2ms（纯数值）。
- 粒子/特效复用 `world.js` 粒子池；新增一次性特效需自动回收（life/remove）。
- DOM 每帧更新仅限文本/宽度/transform，禁止触发 layout thrash（读写分离）。
- `index.html` 体积 ≤1 MB；新增代码前先评估体积。

---

## Core 层规则（combat.js / game.js 战斗与流程）

### Required Patterns
- **伤害入口**：所有对敌伤害必须经 `damageEnemy(e, dmg, opts)`；所有对玩家伤害必须经 `damagePlayer(amount, sourcePos)`，以便统一处理格挡/弹反/无敌/风格惩罚。
- **战斗读数**：玩家输出/防御数值必须读取 `P.mods`（祝福聚合）与 `G.game.styleMul()`（风格倍率），不得硬编码忽略祝福。
- **动作状态机**：新增动作（格挡/弹反/处决）必须作为 `P.state` 的显式状态，并在 `updatePlayer()` 的 switch 中有分支；输入缓冲沿用 `P.buffered`。
- **弹反判定顺序**：完美弹反 → 普通格挡 → 破防 → 受击；同帧只结算一次。
- **波次入口**：所有波次推进必须经 `startWave(n)`；清场奖励与祝福触发必须经 `onWaveCleared(wave)` → `pendingBlessing` 流程。
- **Boss 阶段**：阶段转换只由 HP 阈值触发一次；转阶段必须调用 `audio.sfx('bossPhase')`、`W.setCrimson(true)`、`audio.setMusicMode('boss2')`，退出时必须 `setCrimson(false)`。
- **敌人注册**：新增敌人模型必须在 `W.enemyFactory` 注册，并在 `combat.js` 的 `ENEMY_TYPES` 与更新分支中登记。
- **掉落/拾取**：拾取判定用 XZ 距离；掉落实体上限 6，超限按先进先出结算。

### Forbidden Approaches
- 禁止绕过 `damagePlayer()` 直接扣血（会跳过格挡/弹反/无敌/风格惩罚）。
- 禁止在 `combat.js` 中直接读取/修改 `P.blessings` 数据表（只能读 `P.mods` 与 `P.blessingCounts`）。
- 禁止在 Boss 二阶段新建常驻大网格/新光源（只用 `setCrimson` 参数切换）。
- 禁止在 `update()` 内调用 `setMode` 进行流程跳转（应在结算/波次回调中处理，避免状态竞争）。
- 禁止把「是否无尽」判断散落各处：统一判断 `S.endless`，并只在 `waveIntro/showEnd/startWave` 等明确定义处分支。

### Performance Guardrails
- 敌人数量上限：主流程 ≤13、无尽单波 ≤14（含精英）；掉落 ≤6。
- 同屏粒子数量受粒子池约束；剑雨/冲击波等大招需限制并发。
- 每帧遍历 `D.enemies` 的循环不得嵌套过深；新增 O(n²) 判定需加距离早退。

---

## Feature 层规则（blessings.js / 风格 / 无尽）

### Required Patterns
- **祝福数据**：新祝福只能添加到 `BLESSINGS` 数组，字段固定（`id/name/icon/rarity/max/desc/flavor/apply`，可选 `onPick`）；数值修改只改数据表。
- **新 `mods` 字段**：必须先加入 `G.blessingModsBase()`，再在消费方读取，并在 `blessing-system.md` 登记；默认值必须中性（乘区 1、加区 0）。
- **重算幂等**：`recalcBlessingMods(P)` 必须先重置再 apply；禁止增量修改 `P.mods`。
- **稀有度与抽取**：只能通过 `G.rollBlessingChoices(P, wave, count)` 获取候选；不得在 UI 侧重掷或去重。
- **风格事件**：所有风格加分必须经 `G.game.addStyle(n)`；等级/倍率只能读 `G.game.styleRank()`/`styleMul()`。
- **处决判定**：阈值 = `0.18 + P.mods.execThresholdBonus`（实现值以 combat 为准，修改需同步文档）；Boss 免疫。
- **无尽纪录**：写入必须经 `saveResult()`；读取必须经 `S.best`。

### Forbidden Approaches
- 禁止在 `hud.js` / `combat.js` 中重复定义祝福数值（唯一真源是 `blessings.js`）。
- 禁止修改 `STYLE_TIERS` 而不更新文档与结算阈值（会破坏评级一致性）。
- 禁止在 `acquireBlessing` 之外 push `P.blessings`（否则 HUD chip 与重算不同步）。
- 禁止把无尽纪录写成两个键或不同结构（键与结构见 ADR-003）。

### Performance Guardrails
- 祝福抽取最多 200 次循环，禁止无界随机重试。
- 每局 `recalc` 次数 ≤12，单次 O(已选数量)，无性能风险。
- 风格更新为标量运算，禁止在其中创建对象。

---

## Presentation 层规则（hud.js / world.js / audio.js / style.css / template.html）

### Required Patterns
- **HUD 节点**：新 HUD 元素必须同时更新 `template.html`、`hud.js` 的 `cache()` 列表、`style.css`；缺一不可。
- **HUD 数据来源**：只读 `G.game.S/P` 与 `G.hud` 事件，不参与规则判定。
- **祝福界面**：由 `G.game.openBlessing()` 触发、`hud.showBlessings(choices, note, cb)` 渲染；卡片必须含稀有度标签/图标/名称/效果/风味；选择通过回调 `G.game.selectBlessing(i)`。
- **音频调用**：未知 SFX 名称必须静默（`default: break`）；音乐模式只接受 `none/title/battle/boss/boss2`（非法值降级 battle）。
- **世界视觉**：新 VFX 必须走 `world.js` 的工厂 API（`emitBurst/slashArc/shockwave/telegraphRing/telegraphSector/portal/afterimage/flash`），便于统一回收与降质。
- **赤红竞技场**：只能通过 `W.setCrimson(on)` 切换；恢复时必须完整还原背景/雾/灯光/月光/火盆/地面材质。

### Forbidden Approaches
- 禁止在 HUD 中硬编码颜色绕过 `style.css` 变量（新语义色需先在 art bible 登记）。
- 禁止外部字体/图片/音频文件；所有视觉由几何/Canvas/粒子生成，音频由 WebAudio 合成。
- 禁止使用 Three.js r128 之后新增的 API（如 `outputColorSpace`、`useLegacyLights`、`WebGPURenderer`）。
- 禁止在 `world.update` 中进行 DOM 操作或读取游戏状态做判定。
- 禁止新增全屏后处理叠层（已有 vignette/grain/slowmo/hurt/flash 足够）。

### Performance Guardrails
- 渲染分辨率 pixelRatio ≤1.75；低画质档 0.75 且关闭阴影。
- 新增光源需评估移动端/低端桌面性能；优先用自发光材质/精灵光晕代替真实光源。
- 音频同时发声节点数量受事件频率控制；避免每帧触发 SFX。

---

## Global Rules（全层）

### Naming Conventions
| 类别 | 规范 | 示例 |
| --- | --- | --- |
| 模块挂载 | `G.<module>` | `G.combat`、`G.hud` |
| 构建标记 | `/*__NAME__*/` 全大写 | `/*__BLESSINGS__*/` |
| 存档键 | `emberblade_<data>_<version>` | `emberblade_best_v2` |
| 敌人类型 id | 小写单词 | `wraith`、`golem`、`hexer`、`detonator`、`boss` |
| 祝福 id | 小驼峰 | `perfectEcho`、`deathDefy` |
| 调试接口 | `__DEBUG.<verb>` | `__DEBUG.player()` |
| 事件/音效名 | 小驼峰 | `swordRain`、`blessingPick` |

### Performance Budgets
| 指标 | 预算 |
| --- | --- |
| 帧率 | 中端桌面 60 FPS；低端 ≥30 FPS（自动降质） |
| 单文件体积 | ≤1 MB |
| 敌人同屏 | ≤14（含精英/Boss 召唤） |
| 掉落实体 | ≤6 |
| 主循环单帧新增逻辑 | <2ms（不含渲染） |
| 存档体积 | <4 KB |

### Approved Libraries / Addons
- Three.js **r128**（内嵌 `three.min.js`，单文件）。
- 浏览器原生：WebAudio、Pointer Lock、localStorage、Canvas 2D（纹理生成）。
- **无其他第三方库**。

### Forbidden APIs（r128 约束）
- `renderer.outputColorSpace`、`THREE.ColorManagement` 新语义（r128 用 `outputEncoding`）。
- `renderer.useLegacyLights`、`WebGPURenderer`、`THREE.BatchedMesh`。
- `structuredClone` 等较新全局 API（如需深拷贝用 JSON/手工实现）。
- 网络请求（`fetch`/`XMLHttpRequest`）、外部资源加载（`TextureLoader`/`AudioLoader` 指向外部 URL）。

### Cross-Cutting Constraints
1. 所有新代码必须可通过无头 Chrome（CDP）自动化验证；新增状态应在 `__DEBUG` 可读。
2. 实现与设计文档冲突时：**以实现真相为准**，并更新对应文档（任务规则）。
3. 任何新增的玩家可见文案使用简体中文；无本地化基建（v2 非目标）。
4. 禁止修改 `index.html`（构建产物）作为提交方式；必须改 `.dev/src` 后重新构建。
5. 变更需保持 v1 手感基线（移动/镜头/连击帧数不得回退），v2 只做增量。
