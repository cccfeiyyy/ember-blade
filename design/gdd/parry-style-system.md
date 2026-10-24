# 防御与风格 · 弹反 / 格挡 / 处决 / 风格评价 GDD

> **Status**: Approved
> **Author**: design-docs
> **Last Updated**: 2026-10-19
> **Template**: System GDD（/design-system）
> **System ID**: SYS-03（动作扩展）+ SYS-08（风格评价）
> **实现真相（本版依据）**: `.dev/src/combat.js`（v2，约 2,750 行）与 `.dev/src/game.js`（`STYLE_TIERS` / `addStyle` / `updateStyle`），构建产物 `index.html` 约 926 KB（2026-10-19 20:28 构建）
> **关联文档**: `blessing-system.md`、`enemies-and-drops.md`、`boss-phase2-endless.md`、`design/ux/hud-and-blessing-screen.md`

---

## 1. 概览

本系统为 v2 战斗增加三层「主动防御—反击—收割」的深度：

1. **Q 格挡**：按住 Q 举剑防御，减伤约 70%，但持续消耗体力，体力耗尽架势崩溃。
2. **精准弹反**：进入格挡后 **0.2 秒**（实现常量）内被正面命中，触发完美弹反——免伤、硬直敌人、回复体力/势能、获得风格分与得分。
3. **处决**：非 Boss 敌人生命 ≤ **24% + 祝福加成** 时进入「破绽」（`executable`），下一次近战/剑气命中直接斩杀并回血。
4. **风格评价 D/C/B/A/S**：由高风险行为驱动的动态评级，提供全局**得分**倍率。

> 与企划方向的差异（以实现为准，已记录）：弹反窗口实现为 **0.20s**（方向为 0.18s）；弹反**不反弹**弹幕（仅免伤并消除）；处决为**即时斩杀**（无 4 秒窗口/0.9 秒独立动画）；风格倍率**只作用于得分**，不作用于势能；正面来源的地面 AOE（震地/剑雨/自爆）只要面向来源也可被格挡（无「不可格挡」标记）。详见 §11。

---

## 2. 玩家幻想

> 「它挥剑的那一瞬，时间变慢了。我的剑比它先到。」

- **读懂**：红色预警 = 该防；扇形/圆环形状与音效帮助判断来源方向。
- **化解**：按准窗口，金属铿锵 + 慢动作 + 敌人踉跄 + 青白火花，节奏瞬间倒向自己（P2 弹反改写回合）。
- **收割**：敌人血条亮起金色「处决」标记，一剑斩杀回血，风格等级跳升（P3 漂亮即成长）。

---

## 3. 详细设计

### 3.1 Q 格挡（Block）

| 项 | 实现规则（`.dev/src/combat.js`） |
| --- | --- |
| 进入条件 | `P.state ∈ {idle, run}`（已在格挡中也允许再次进入判定），体力 ≥8 且 `P.parryCd ≤ 0` |
| 输入 | 按住 `Q`（`game.js` 映射 `P.blockHeld=true` → `playerParryDown()`）；松开 → `playerParryUp()` 回到 idle |
| 移速 | ×0.28；锁定目标时缓慢转向（damp 10） |
| 伤害减免 | 受到伤害 ×**0.30**（减伤 70%），再乘 `P.mods.damageTakenMul` |
| 体力消耗 | 每次格挡 `amount × 1.15`（按原始伤害计）；另外持续格挡超过 0.25s 后每秒 −13 体力 |
| 判定方向 | 正面 `±1.95 rad ≈ ±112°`（`blockFacing()`），背后攻击不减伤 |
| 命中反馈 | 屏幕轻闪、镜头轻震、命中停顿 0.035s、格挡火花、`audio.sfx('block')`、无敌 0.42s、击退 2.2 |
| 架势崩溃 | 格挡后体力 ≤0 → `P.state='hurt'`（0.34s）、`parryCd=1.6`、`parryWindow=0`、`audio.sfx('guardBreak')`、提示「架 势 崩 溃」 |
| 可格挡范围 | 实现上只要**正面来源**即可格挡：Boss 震地/剑雨/爆裂者自爆等 AOE 若来源在其正面也能减伤（无 AOE 排除标记） |
| 收招 | 松开 Q 立即回到 idle（无固定收招时间），可直接攻击/闪避 |

### 3.2 精准弹反（Perfect Parry）

| 项 | 实现规则 |
| --- | --- |
| 判定窗口 | 按下 Q 进入格挡时 `P.parryWindow = 0.2` 秒；受击时若 `P.state==='block' && blockFacing && P.parryWindow > 0` → 完美弹反 |
| 触发对象 | 近战与弹幕（弹幕命中玩家时把 `sourceProjectile` 传入 `damagePlayer`）；Boss 招式同样可弹反 |
| 伤害 | 0（完全免伤） |
| 体力 | +16（`min(maxStamina, +16)`） |
| 势能 | +24（不受风格倍率影响） |
| 得分 | +320（固定，不受连击/风格倍率） |
| 风格 | +18 风格分 |
| 无敌 | `P.invuln = max(invuln, 0.5)` |
| 演出 | 命中停顿 0.06s、慢动作 `0.34×0.5s`（祝福「时之砂」→ `0.30×0.95s`）、镜头震动 0.18、青白爆发/刀光、`audio.sfx('parry')`、飘字「完 美 弹 反」 |
| 普通敌人反馈 | 进入 stagger 1.2s + 弹反反击伤害 22（`damageEnemy(reflect)`） |
| Boss 反馈 | `stunTimer = 0.5`（攻击/收招等待 0.5s 后可再行动） |
| 弹幕反馈 | 本次伤害被免除，弹幕在调用方被移除并爆散（**当前未实现反弹伤害敌人**；设计方向中的「反弹幕」未落地，见 §11） |
| 再次弹反 | 成功后 `parryWindow=0`；由于 `playerParryDown` 只在非 block 时重置窗口，需要**松开 Q 再按**才能获得新的 0.2s 窗口 |
| 失败格挡 | 窗口外命中按 §3.1 普通格挡结算 |

**为什么是 0.18 → 0.20**：企划方向为 0.18s（约 11 帧），实现取 0.2s 以容纳帧率波动与浏览器输入延迟；两者差异不影响设计意图，最终以实现常量为准并已回写文档。

### 3.3 处决（Execution）

| 项 | 实现规则 |
| --- | --- |
| 触发条件 | 非 Boss、存活且 `hp > 0`，`hp ≤ maxHp × (0.24 + P.mods.execThresholdBonus)` → 置 `e.executable = true` |
| 破绽表现 | 敌人血条加 `exec` 类（金色高亮）；持续金屑粒子；无时间限制（不设 4 秒窗口） |
| 触发输入 | 任何玩家近战命中（轻斩/重斩）或剑气命中该敌人 → 调用 `executeEnemy(e)` |
| 处理 | 立即斩杀（`hp=0` → `killEnemy({execution:true, silent:true})`）；**无独立 0.9s 动画/无敌状态**，以慢动作 0.34×0.55s、金色刀光/爆发/闪光呈现 |
| 回血 | 基础 **+6** 生命 + `executeHealBonus`（处决者每层 +8） |
| 势能 | +20 |
| 得分 | `300 × 连击倍率 × 风格倍率` |
| 风格 | 处决 +18；随后 `killEnemy` 的击杀 +8（合计 +26） |
| 免疫 | Boss 不进入破绽、不可处决 |
| 边界 | 破绽标记不会过期；敌人恢复行动后仍可被处决（只要未死亡且未超阈值回升——生命不会回升，因此标记会保留到死亡） |

### 3.4 与闪避的定位差异

| 维度 | 闪避（Space） | 格挡（Q 按住） | 精准弹反（Q 窗口内） |
| --- | --- | --- | --- |
| 消耗 | 体力 25 | 每次命中体力 ×1.15 + 持续 13/s | 0，且 +16 体力 |
| 收益 | 位移 + 完美闪避（+300 分、+22 势能、+16 风格） | 70% 减伤 | 免伤 + 敌人硬直 1.2s + 22 反击伤害 + 320 分 + 24 势能 + 18 风格 |
| 风险 | 时机错误吃满伤 | 体力耗尽架势崩溃（1.6s 弹反冷却） | 窗口失误退回格挡 |
| 适用 | AOE、拉开距离、位移取消 | 连续多段、正面压力 | 单次可读攻击、弹幕、Boss 招式 |

### 3.5 状态机与插入点

```
玩家状态：idle / run / attack / dodge / block / cast / heal / ult / hurt / dead
新增：block（按住 Q）、hurt（架势崩溃复用既有受击态）
```

- 进入格挡：仅 idle/run（攻击、闪避、施法、喝药、必杀中不可直接进入）。
- 受击判定顺序（`damagePlayer`）：`invuln` → **格挡/弹反** → `iframe`（完美闪避）→ 普通受伤（含「向死而生」免死）。
- 弹反判定在格挡分支内：`parryWindow > 0` → `perfectParry`；否则普通格挡。
- 架势崩溃：格挡中体力 ≤0 → 进入 `hurt`，并给 1.6s 弹反冷却，防止立刻再次格挡。

---

## 4. 公式

### 4.1 格挡

```
blockedDamage = incoming × 0.30 × P.mods.damageTakenMul
staminaCost   = incoming × 1.15            // 按原始伤害
blockDrain    = 13 /s                      // 格挡持续 >0.25s 后
if 格挡后 stamina <= 0 → hurt(0.34s) + parryCd=1.6
```

### 4.2 弹反判定

```
if P.state === 'block' && blockFacing(source) && P.parryWindow > 0:
    perfectParry(sourceEnemy)
else if P.state === 'block' && blockFacing(source):
    block()
else if P.iframe:
    perfectDodge()
else:
    damagePlayer normal
```

### 4.3 处决阈值

```
threshold = 0.24 + P.mods.execThresholdBonus      // 处决者 2 层 = 0.40
if enemy.hp / enemy.maxHp <= threshold && type !== 'boss' → executable = true
```

### 4.4 风格评价（源码事实，`.dev/src/game.js` `STYLE_TIERS`）

| 等级 | 分数下限 | 倍率 | 称号 |
| --- | --- | --- | --- |
| D | 0 | 1.00 | 静默 |
| C | 12 | 1.08 | 锋利 |
| B | 28 | 1.18 | 华丽 |
| A | 48 | 1.32 | 无双 |
| S | 70 | 1.50 | 余烬 |

- `S.stylePoints ∈ [0, 100]`，上限 100；无加分事件 2.6s 后开始衰减 **9 分/秒**。
- 事件加分（源码事实）：
  | 事件 | 风格分 |
  | --- | --- |
  | 轻斩挥出且命中 | +3 |
  | 重斩挥出且命中 | +6 |
  | 每命中一个敌人（轻/重） | +2 / +4 |
  | 完美闪避 | +16 |
  | 精准弹反 | +18 |
  | 处决 | +18（另击杀 +8） |
  | 击杀普通/精英 | +8 |
  | 击杀 Boss | +25 |
  | 释放烬灭 | +20 |
  | Boss 进入二阶段 | +10 |
  | 爆裂者自爆（玩家附近） | +3 |
  | 获得祝福 | +4 |
- 跨级时播放 `styleUp`（按等级变调）/ 回落播放 `styleDown`；B 级以上弹出称号提示。
- **风格倍率只作用于得分**：`得分 = 基础 × comboMult × styleMul`；势能获取只乘 `P.mods.momentumMul`（见 §11 差异说明）。

### 4.5 得分与势能

```
// 命中（damageEnemy）
score   += actualDamage × comboMult × (heavy ? 1.4 : 1) × styleMul
momentum += (heavy ? 12 : 6) × momentumMul
// 击杀（killEnemy）
score   += enemy.score × comboMult × styleMul
momentum += (isBoss ? 60 : 22) × momentumMul
// 连击
comboMult = 1 + min(2, combo × 0.07)   // 封顶 ×3.0
```

---

## 5. 边界情况（实现行为）

| 场景 | 当前行为 |
| --- | --- |
| 同帧多段命中 | 首次命中选择格挡/弹反分支，后续按 `invuln`（0.42s）忽略；不会重复结算 |
| 弹反与闪避同帧 | 格挡优先于 `iframe` 判定（受击先走格挡分支） |
| 格挡中体力归零 | 立即进入 hurt + 架势崩溃提示 + `parryCd=1.6` |
| 背刺/侧后攻击 | `blockFacing` 超出 ±1.95rad → 不格挡，正常受伤 |
| AOE（震地/剑雨/自爆） | 只要来源在正面即可格挡减伤（无 AOE 排除） |
| 弹幕被弹反 | 玩家免伤、弹幕被移除；不产生反弹伤害 |
| 破绽敌人 | 标记不过期；可被普攻/剑气处决；敌人仍可移动/攻击（未锁定行动） |
| 处决期间其他敌人攻击 | 处决为即时结算，无保护帧；同帧其他伤害仍按 `invuln` 判定 |
| Boss 处决 | 永不进入破绽 |
| 风格分 100 | 封顶不溢出；升级音效仅跨级触发一次 |
| 祝福界面按 Q | `game.js` 在 `blessing` 模式屏蔽 Q，不会进入格挡 |

---

## 6. 依赖

- 上游：SYS-02（Q 键、反转 Y）、既有动作状态机。
- 下游：SYS-07（完美余音/处决者/时之砂/荆棘/无限连/向死而生）、SYS-10（HUD 风格盒/Q 技能位/处决标记）、SYS-11（parry/block/guardBreak/execute/styleUp/styleDown）。
- 数据：`P.parryWindow`、`P.parryCd`、`P.blockHeld`、`P.perfectBuffTimer`、`P.stats.parries/executions`（均在 `game.js` 初始化）。

---

## 7. 可调参数（源码位置与现值）

| 参数 | 位置 | 现值 |
| --- | --- | --- |
| 弹反窗口 | `combat.js` `playerParryDown` | 0.2s |
| 弹反冷却（仅架势崩溃后） | `P.parryCd` | 1.6s |
| 格挡减伤 | `damagePlayer` block 分支 | ×0.30 |
| 格挡体力系数 | 同上 | ×1.15 |
| 格挡持续消耗 | `updatePlayer` | 13/s（0.25s 后） |
| 格挡方向 | `blockFacing` | ±1.95 rad |
| 弹反硬直（非 Boss） | `perfectParry` | 1.2s + 22 反伤 |
| 弹反 Boss 硬直 | `stunTimer` | 0.5s |
| 处决阈值 | `damageEnemy` | 0.24 + 祝福加成 |
| 处决回血 | `executeEnemy` | 6 + 祝福加成 |
| 风格事件分值 | `combat.js` 各事件 | §4.4 |
| 风格衰减 | `game.js` `updateStyle` | 9/s，2.6s 延迟 |
| 等级阈值/倍率 | `game.js` `STYLE_TIERS` | 12/28/48/70；1.08/1.18/1.32/1.5 |

---

## 8. 视觉 / 音频

| 事件 | 视觉 | 音频 |
| --- | --- | --- |
| 普通格挡 | 青白火花、轻闪、击退、`-N` 伤害数字 | `block` 沉闷金属撞击 |
| 架势崩溃 | 镜头震动 + 「架 势 崩 溃」提示 | `guardBreak` 护甲碎裂 |
| 精准弹反 | 慢动作、青白爆发/刀光、闪光、飘字、敌人踉跄 | `parry` 金属铿锵 + 高频泛音 |
| 处决 | 金色爆发 + 刀光 + 屏幕闪 + 「处 决 / 生命 +N」 | `execute` 破风 + 重击 + 低频轰鸣 |
| 风格升级 | 风格字母放大回弹、颜色升阶、称号提示 | `styleUp`（等级越高越亮） |
| 风格回落 | 字母降级 | `styleDown` 下行 |
| 破绽标记 | 敌人血条金色高亮 + 持续金屑粒子 | 无独立音效 |

---

## 9. UI 要求

- 右下技能位 `#skill-parry`（Q · 格挡·弹反）：格挡中 `active` 高亮；`parryCd` 时 `cooling`。
- 右上风格盒 `#style-box`：等级 `#style-rank`、风格条 `#style-fill`、倍率 `#style-mul`。
- 敌人破绽：血条 `exec` 金色类 + 粒子；Boss 无。
- 详见 `design/ux/hud-and-blessing-screen.md` §2/§4。

---

## 10. 验收标准

- [ ] AC-1：按住 Q 进入 `block`；正面受击伤害约 ×0.30，体力按 ×1.15 扣除；背刺不减免。
- [ ] AC-2：格挡中体力耗尽 → 架势崩溃（hurt + parryCd 1.6 + `guardBreak`）。
- [ ] AC-3：按 Q 后 0.2s 内被正面命中 → 完美弹反：0 伤害、敌人硬直 1.2s、玩家 +16 体力/+24 势能/+320 分/+18 风格、`parry` 音效与慢动作。
- [ ] AC-4：弹反弹幕 → 免伤、弹幕消除；不产生反弹伤害（当前实现）。
- [ ] AC-5：Boss 被弹反 → `stunTimer=0.5`。
- [ ] AC-6：非 Boss 敌人 ≤24%（+祝福）→ `executable`；近战/剑气命中 → 处决：击杀、+6 回血、+20 势能、300×连击×风格得分、`execute` 音效。
- [ ] AC-7：Boss 不可处决。
- [ ] AC-8：风格事件/衰减/阈值符合 §4.4；升级/降级音效与 HUD 同步。
- [ ] AC-9：得分乘 `styleMul`；势能不乘风格倍率（当前实现）。
- [ ] AC-10：`P.stats.parries/executions` 与 `__DEBUG.player()` 数据正确。
- [ ] AC-11：祝福「完美余音/时之砂/向死而生/荆棘」联动可观测。

---

## 11. 与企划方向的差异（实现真相）与开放问题

| # | 差异 | 实现行为 | 处置 |
| --- | --- | --- | --- |
| D1 | 弹反窗口 0.18s → **0.20s** | `playerParryDown` 设 0.2 | 以实现为准；文档与 QA 用 0.20 |
| D2 | 弹反「反弹弹幕」未实现 | 弹幕被消除，不反伤 | 记录为设计缺口；若 v2.1 补做需翻转 owner/方向 |
| D3 | 处决「4s 破绽 + 0.9s 处决动画」未实现 | 破绽常驻、处决即时斩杀（慢动作演出） | 以实现为准；动作时长需求记入 v2.1 提案 |
| D4 | 格挡「地面 AOE 不可格挡」未实现 | 正面来源均可格挡 | 以实现为准；AOE 排除标记为可选改进 |
| D5 | 风格「影响势能」未实现 | 风格只影响得分 | 以实现为准；若需强化 P3 可将 `momentumMul × styleMul` 并入战斗 |
| D6 | 格挡 65% 减伤 → **70%** | ×0.30 | 以实现为准 |

**开放问题**：
1. 弹反成功后必须松开再按才能获得新窗口，是否符合手感预期？（当前是防止长按无脑弹反）
2. 破绽标记常驻是否会让战斗后期「到处可处决」？需 QA 数值观察。
3. 风格 S 级（70 分）在持续战斗中是否可稳定维持？衰减 9/s 较严格，可能需要 QA 数据支撑。
4. 是否需要为处决增加独立动作状态（0.6–0.9s）以强化演出？v2 非目标。

---

## 附录 A：实现对齐记录

| 事实 | 源码 | 文档状态 |
| --- | --- | --- |
| 风格等级/倍率/称号、上限 100、衰减 9/s、2.6s 延迟 | `game.js` `STYLE_TIERS`/`addStyle`/`updateStyle` | ✅ 已对齐 |
| 弹反窗口 0.2s、格挡 ×0.30、体力 ×1.15、持续 13/s、±1.95rad | `combat.js` `playerParryDown`/`damagePlayer`/`blockFacing`/`updatePlayer` | ✅ 已对齐 |
| 弹反奖励 +320/+24/+18/+16、慢动作 0.34×0.5（时之砂 0.30×0.95）、敌人 1.2s 硬直/22 反伤、Boss 0.5s | `combat.js` `perfectParry` | ✅ 已对齐 |
| 处决阈值 0.24+加成、回血 6+加成、300×连击×风格、+20 势能、+18 风格、即时斩杀 | `combat.js` `damageEnemy`/`executeEnemy` | ✅ 已对齐 |
| 风格事件（+3/+6、+2/+4、+16/+18/+8/+25/+20/+10/+3/+4） | `combat.js` 各事件 | ✅ 已对齐 |
| 得分 ×styleMul、势能 ×momentumMul | `combat.js` `damageEnemy`/`killEnemy` | ✅ 已对齐（差异 D5 已注明） |
