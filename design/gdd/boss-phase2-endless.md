# Boss 二阶段与无尽模式 GDD（无面守望者 · 无尽回响）

> **Status**: Approved
> **Author**: design-docs
> **Last Updated**: 2026-10-19
> **Template**: System GDD（/design-system）
> **System ID**: SYS-06（Boss 阶段）+ SYS-05（无尽模式）
> **实现真相（本版依据）**: `.dev/src/combat.js`（Boss/波次/掉落）、`.dev/src/game.js`（`startEndless`/`saveResult`）、`.dev/src/world.js`（`setCrimson`）、`.dev/src/audio.js`（`boss2`）
> **构建产物**: `index.html` 约 926 KB（2026-10-19 20:28 构建，最终以发布构建为准）
> **关联文档**: `enemies-and-drops.md`、`parry-style-system.md`、`docs/architecture/adr-003-save-endless.md`

---

## 1. 概览

本系统把 v1「5 波通关即结束」的终局扩展为两层：

1. **Boss 二阶段**：无面守望者在生命 **50%** 时进入「回响形态」——赤红竞技场、剑雨、三连冲击波、突进；生命 **<25%** 时进入「终焉形态」（狂怒）。
2. **无尽模式**：通关后从结算页进入「无尽回响」，波次程序化生成、无上限，每 5 波 Boss，本机最高纪录持久化。

---

## 2. 玩家幻想

> 「它跪下了一半，竞技场开始燃烧。剑从天而降——而我要让它知道，余烬也能燎原。」

- **阶段感**：Boss 名称、场地颜色、音乐（`boss2`）、招式池同时改变。
- **成长感**：剑雨落点、冲击波间隔、突进直线变成可读语言。
- **征服感**：无尽每 5 波 Boss 再临，纪录成为长期目标。

---

## 3. Boss 详细设计

### 3.1 基础属性（源码事实）

| 属性 | 值 | 说明 |
| --- | --- | --- |
| 名称 | 无面守望者 | 阶段名随 HP/状态变化 |
| 基础最大生命 | **820** | `ENEMY_TYPES.boss.maxHp` |
| 主流程第 5 波实际生命 | **968** | 波次缩放 `getWaveDef(5).hpMul = 1+(5-2)×0.06 = 1.18` |
| 半径 / 速度 | 2.1 / 2.9 | 速度受 `speedMul` 影响（精英/狂怒） |
| 基础伤害 | 20 | 招式伤害另计（16/34/26/18/14/26） |
| 基础得分 | 3000 | 击杀 × 连击 × 风格倍率 |
| 二阶段附加 | `speedMul` 仍 2.9；狂怒 ×1.3 | 前摇在狂怒 ×0.78 |

### 3.2 阶段与 HUD 名称

| 阶段 | 触发（源码） | HUD 名称（`boss-name`） | HUD 阶段（`boss-phase`） | 变化 |
| --- | --- | --- | --- | --- |
| 一阶段 | 战斗开始 | 无面守望者 | HP >66% 深渊守望者；≤66% 破碎的守望者 | 横扫/重斩/震地/召唤（66% 一次） |
| **二阶段 · 回响形态** | `hp ≤ maxHp × 0.5` 且非 transition | **回响之主** | **回响形态 · 第 2 阶段** | 赤红竞技场、`boss2` 音乐、剑雨/三连冲击波/突进 |
| **终焉形态（狂怒）** | `hp < maxHp × 0.25` 且非 transition | **终焉守望者** | **终焉形态** | 速度 ×1.3、前摇 ×0.78、攻击冷却 2.1/1.7 → 1.3s |

**转阶段演出（`startBossPhase2`）**：
- 状态切到 `transition`，持续 **1.9s**；期间不攻击，玩家可继续输出（无伤害减免标记）。
- `W.setCrimson(true)` + `audio.setMusicMode('boss2')` + `audio.sfx('bossPhase')`。
- 慢动作 0.4×0.9s、屏幕闪 0.8、镜头震动 0.8、Boss 位置红色/金色爆发 + 半径 14 冲击波。
- 风格 +10；HUD 中央大字「无 面 守 望 者 · 回 响 形 态」+「它 记 起 了 你 的 剑」。
- 结束后进入 `chase`，冷却 0.8s。

**狂怒演出**：`enraged=true`、`speedMul=1.3`、`windMul=0.78`、咆哮、红色爆发、HUD「终 焉 形 态」。

### 3.3 招式表

#### 一阶段（源码事实）

| 招式 | 预警 | 伤害 | 判定 | 备注 |
| --- | --- | --- | --- | --- |
| 三连横扫 `sweep3` | 红扇区 6.6m / ±1.25rad | 16/段 ×3 | 正面扇形 | 狂怒时时间点 ×0.85 |
| 蓄力重斩 `overhead` | 红扇区 7.2m / ±0.55rad | 34 | 正面窄扇 | 附带半径 5 冲击波 |
| 震地冲击波 `slam` | 红圆环半径 11 | 26 | 距离 <11 | 双圈冲击波 |
| 召唤援军 `summon` | 紫圆环 | — | 66% 时一次，召唤 2 只（蚀影/咒眼） | 二阶段另有召唤 |

**一阶段选招**（`chooseBossAttack`）：`hpF≤0.66` 且未召唤 → 召唤；`dist>8.5` → slam；`dist>5.5` → 55% slam / sweep3；近身 → 58% sweep3 / overhead。

#### 二阶段新增招式（源码事实）

| 招式 | 预警 | 伤害 | 判定/节奏 | 应对 | 弹反 |
| --- | --- | --- | --- | --- | --- |
| **剑雨 `swordrain`** | 玩家当前位置红圈 2.9 + 周围 4 个红圈 2.6，前摇 1.2s | 18/处 | 攻击时在玩家周围 4 点（半径 2.2–4.8）落下；每处半径 2.8 AOE；每处落点 0.15s 后同时结算 | 快速离开红圈 | 来源为落点位置，正面格挡可减伤 |
| **三连冲击波 `shock3`** | 红圆环半径 12，前摇 1.05s | 14/环 ×3 | 0.2/0.55/0.9s 三环依次扩散，半径 12 | 闪避/拉开 | 无弹反判定（AOE 来源为 Boss，正面格挡可减伤） |
| **突进 `dash`** | 红扇区 13m / ±0.34rad，前摇 0.75s | 26 | 锁定玩家方向，速度 26 递减（0.55s），命中半径 3.4 | 侧闪/格挡 | 来源 Boss，可弹反（硬直 0.5s） |

**二阶段选招**：`hpF≤0.25` 且未召唤 → 召唤（一次，4 只：蚀影×2、精英咒眼、爆裂者）；`dist>9` → 50% 剑雨 / 突进；`dist>5` → 42% 剑雨，否则 50% 冲击波 / 横扫；近身 → 42% 冲击波，否则 50% 横扫 / 重斩。

### 3.4 状态机

```
spawn → chase ⇄ windup → attack → recover → chase
                 │
                 ├─ 50%：startBossPhase2 → transition(1.9s) → chase（phase2 招式池）
                 └─ <25%：enraged（speed/windup/cooldown 全局修正；二阶段召唤一次）
```

- 收招冷却：普通 2.1s / 二阶段 1.7s / 狂怒 1.3s。
- Boss 被弹反：`stunTimer=0.5`，收招等待结束后才能继续（`recover` 分支检查 `stunTimer<=0`）。

### 3.5 赤红竞技场（实现事实）

`W.setCrimson(on)` 切换（不重建网格）：
- 开启：背景 `0x160409`、雾 `0x24060a`、半球光 `0x8a4a5a/0x160406`、月光 `0xff9a88` 强度 1.55、背光 `0x8a2a3a`、轮廓光 `0xa83a3a`、月面 `0xff9a8a`、月晕 `0xff3a20`、余烬光 `0xff2a12`、地面自发光 `0xff6040` 强度 0.6、火盆 `0xff2a10/0xff3a18`、玩家剑光 `0xff3a10`。
- 关闭：完整还原全部颜色与强度。
- 调用点：`startBossPhase2(true)`、Boss 死亡、`clearAll()`、`startEndless()`；保证退出不残留。

---

## 4. 无尽模式详细设计

### 4.1 解锁与进入（源码事实）

| 项 | 规则 |
| --- | --- |
| 解锁 | 主流程胜利结算页显示「无 尽 回 响」按钮（`#endless-btn`，仅 `victory && !endless`） |
| 进入 | `startEndless()`：`S.endless=true`，生命补到至少上限 50%，药剂至少 1，无敌 1.2s，清场并 `setCrimson(false)`，`startWave(6)` |
| 音乐 | `audio.setMusicMode('battle')` + `audio.sfx('endlessStart')` |
| HUD | 大字「无 尽 回 响」+「回响不会结束 · 击破得越深，纪录越远」；波次标签「无尽 · 第 N 波」 |
| 注意 | `startEndless` 允许 `victory` 或 `dead` 进入，但 HUD 仅在「剧情胜利结算」显示按钮；无尽死亡后不显示再次进入按钮（见开放问题） |

### 4.2 波次生成（源码事实 `makeEndlessWave(n)`）

| 参数 | 公式 |
| --- | --- |
| 起始波次 | n = 6（k = n − 5） |
| Boss 波 | `n % 5 === 0`（10、15、20…） |
| 敌人总数 | `count = min(16, 4 + floor(k × 0.9))` |
| 普通敌人类型轮换 | `[wraith, golem, detonator]`；k≥2 加入 `hexer`；k≥4 再追加 `detonator, hexer` |
| Boss 波普通敌人 | `max(2, floor(count × 0.35))` 只 + Boss 1 只 |
| 生命缩放 | `hpMul = 1 + max(0, k−1) × 0.11` |
| 伤害缩放 | `dmgMul = 1 + max(0, k−1) × 0.065` |
| 得分缩放 | `scoreMul = 1 + max(0, k−1) × 0.16` |
| 精英概率 | `eliteChance = min(0.55, 0.10 + k × 0.05)` |
| Boss 生命 | `Boss 基础 820 × hpMul`（`bossHpScale` 复用 hpMul） |

> 主流程波次缩放（`getWaveDef`）：第 1–2 波 ×1；第 3 波起 `hpMul = 1+(n−2)×0.06`、`dmgMul = 1+(n−2)×0.04`；精英概率第 3 波 10%、第 4 波起 16%。

### 4.3 奖励与结算

| 项 | 规则 |
| --- | --- |
| 清波奖励 | 得分：无尽 `420 + 180×(n−5)`；生命 +20（+祝福回血加成）；药剂 +1；无伤清波额外 +300 |
| 祝福 | 每波清场后 1 次三选一（`onWaveCleared` 在无尽恒为 true，延迟 1.5s）；主流程仅在 wave<5 时 |
| 无尽 Boss | 击杀后**不进入胜利**：`setCrimson(false)`、音乐切回 battle、`waveState='clear'`、HUD「回 响 守 望 者 陨 落 / 继续下沉 · 选择新的回响」→ 祝福 → 下一波 |
| 死亡结算 | 评级按到达波次：`≥15 S / ≥10 A / ≥7 B / 其余 C`；kicker `THE ECHO ENDURES`、标题「回 响 止 步」、note「无尽回响 · 止步于第 N 波 · 评级 X」 |
| 纪录写入 | `saveResult()`：`bestScore`、`endlessBest`（最远波次）、`endlessLast`（最近波次）、`updated`；新纪录时 `S.newRecord=true` |
| 主流程结算 | 胜利评级按 `得分 + 时间奖励 + 生命奖励 + 药剂奖励`：S≥38,000 / A≥29,000 / B≥21,000 / C；失败按波次（≥5 A / ≥4 B / ≥3 C / 否则 D） |

### 4.4 持久化（源码事实）

| 键 | 结构 |
| --- | --- |
| `emberblade_best_v2` | `{ bestScore, endlessBest, endlessLast, storyBest, storyWins, updated }` |
| `emberblade_settings_v2` | `{ sens, volume, invertY, quality }` |

- 读取失败/存储禁用 → 静默降级（不弹错、可正常游玩）。
- 标题页 `#best-record`：无纪录「尚无纪录 · 成为第一个回响」；有纪录「最高纪录 · 得分 X · 无尽 第 N 波 · 通关 N 次」。
- 结算页 `#end-record`：「历史最高得分 b」+「无尽最高 第 N 波」+「◆ 新纪录」。

---

## 5. 公式汇总

```
// Boss 阶段
phase2  = hp <= maxHp × 0.50 && !phase2
enraged = hp <  maxHp × 0.25 && !enraged
speedMul    = enraged ? 1.3 : 1
windupMul   = enraged ? 0.78 : 1
cooldown    = enraged ? 1.3 : (phase2 ? 1.7 : 2.1)

// 无尽
n ≥ 6; k = n - 5
hpMul    = 1 + max(0,k-1) × 0.11
dmgMul   = 1 + max(0,k-1) × 0.065
scoreMul = 1 + max(0,k-1) × 0.16
count    = min(16, 4 + floor(k × 0.9))
eliteChance = min(0.55, 0.10 + k × 0.05)
bossWave = (n % 5 === 0)
bossHp   = 820 × hpMul

// 纪录
endlessBest  = max(prev.endlessBest || 0, reachedWave)
endlessLast  = reachedWave
bestScore    = max(prev.bestScore || 0, score)
```

---

## 6. 边界情况（实现行为）

| 场景 | 行为 |
| --- | --- |
| 转阶段演出中击杀 Boss | 允许；不重复触发阶段，进入死亡/无尽清波流程 |
| 同一帧跨过 50% 与 25% | 先 phase2（transition），狂怒在 transition 结束后下一次 update 判定；不会叠加演出 |
| Boss 二阶段召唤时场上敌人已满 | 仍会生成（最多 4 只），无尽敌人上限由波次生成控制 |
| 无尽 Boss 击杀后祝福 | `onWaveCleared` 触发；祝福界面暂停；选择后 `startWave(wave+1)` 继续 |
| 无尽死亡瞬间清波 | 死亡优先（`onDefeat` 已切 mode，`onWaveCleared` 检查 `S.mode==='playing'` 会跳过） |
| 赤红竞技场残留 | `Boss 死亡 / clearAll / startEndless` 均调用 `setCrimson(false)` |
| localStorage 禁用 | 静默失败，游戏继续 |
| 无尽死亡后再进无尽 | 当前 UI 不提供入口（按钮只在剧情胜利显示）；`startEndless` 本身支持 dead 态（调试/未来扩展） |

---

## 7. 依赖

- 上游：SYS-04 敌人/波次、SYS-03 战斗、SYS-07 祝福（无尽成长）。
- 下游：SYS-10 HUD（Boss 条/阶段名/无尽波次/纪录/结算）、SYS-11 音频（`bossPhase`/`swordRain`/`boss2`/`endlessStart`）、SYS-12 持久化。
- 世界：`W.setCrimson()`、Boss 模型（v1 `buildBoss` 复用）、`W.telegraphRing/telegraphSector`、粒子工厂。
- 源码入口：`combat.js` `updateBoss/chooseBossAttack/updateBossAttack/startBossPhase2/startWave/updateWaves`；`game.js` `onVictory/onDefeat/startEndless/saveResult`；`world.js` `setCrimson`。

---

## 8. 可调参数

| 参数 | 位置 | 现值 |
| --- | --- | --- |
| Boss 基础生命 | `ENEMY_TYPES.boss.maxHp` | 820 |
| 二阶段/狂怒阈值 | `updateBoss` | 0.50 / 0.25 |
| 转阶段时长 | `transition` case | 1.9s |
| 剑雨前摇/伤害/落点 | `chooseBossAttack`/`updateBossAttack` | 1.2s / 18 / 4 点 + 中心 |
| 三连冲击波前摇/伤害/半径 | 同上 | 1.05s / 14×3 / 12 |
| 突进前摇/速度/伤害 | 同上 | 0.75s / 26 递减 / 26（距离 3.4） |
| 攻击冷却（普通/二阶段/狂怒） | `updateBoss` recover | 2.1 / 1.7 / 1.3 |
| 无尽 hp/dmg/score 增长率 | `makeEndlessWave` | 11% / 6.5% / 16% 每波（k−1） |
| 无尽敌人上限/精英概率 | 同上 | 16 / 最高 55% |
| 纪录键 | `game.js` | `emberblade_best_v2` |

---

## 9. 视觉 / 音频

| 事件 | 视觉 | 音频 |
| --- | --- | --- |
| 50% 转阶段 | 赤红竞技场 + 红金光爆 + 冲击波 + 大字 + 屏幕闪 | `bossPhase`；音乐 `boss2`（100 BPM，密集鼓点/低音铜管/不协和层） |
| 25% 狂怒 | 眼焰增强、粒子加速、HUD「终焉形态」 | 咆哮（`roar`）；音乐强度提升 |
| 剑雨 | 玩家周围红圈预警 → 红色下落粒子 + 落点冲击波 + 闪光 | `swordRain` |
| 三连冲击波 | 三次扩散红环（第三环橙色） | `swordRain`（沿用的冲击音） |
| 突进 | 红色速度线/拖尾粒子 | `swingHeavy` |
| 无尽进入 | 大字 + 号角 | `endlessStart` |
| 无尽 Boss 陨落 | 赤红消退 + 大字「回 响 守 望 者 陨 落」 | `bossStart`/`enemyDeath` 变体 |

---

## 10. UI 要求

- Boss 血条：名称/阶段按 §3.2 切换；二阶段与狂怒颜色更红。
- 无尽：波次标签「无尽 · 第 N 波」（青色 `endless` 类）；无尽 Boss 波附加提示「无 尽 · 第 N 波 · 守望者再临」。
- 结算：`#end-record`、`#endless-btn`、评级与 note 见 §4.3。
- 详见 `design/ux/hud-and-blessing-screen.md` §6。

---

## 11. 验收标准

- [ ] AC-1：Boss HP ≤50% 触发一次「回响形态」：赤红竞技场、`boss2` 音乐、`bossPhase` 音效、HUD 回响之主/回响形态、中央大字、1.9s 转阶段。
- [ ] AC-2：二阶段可观测剑雨/三连冲击波/突进三种新招式（各 ≥1 次）。
- [ ] AC-3：Boss HP <25% 触发「终焉形态」：速度/前摇/冷却生效、HUD 终焉守望者/终焉形态。
- [ ] AC-4：二阶段召唤一次（4 只，含精英咒眼与爆裂者）在 ≤25% 时触发。
- [ ] AC-5：Boss 死亡后赤红竞技场恢复（`W._crimson === false`）。
- [ ] AC-6：胜利结算显示「无尽回响」按钮；点击后 `S.endless=true`、从第 6 波开始。
- [ ] AC-7：无尽每 5 波 Boss；波次/生命/伤害/得分按公式缩放；无尽 Boss 击杀后继续下一波而非结算。
- [ ] AC-8：无尽死亡结算显示波次/评级/纪录；刷新后标题页记录保留。
- [ ] AC-9：`localStorage` 异常时不崩溃。
- [ ] AC-10：`__DEBUG.state()` 可读 `endless/bossPhase2/bossEnraged/best/wave`，供自动化验收。

---

## 12. 开放问题

1. 无尽死亡后不显示「再次无尽」入口（按钮条件 `victory && !endless`），与 `startEndless` 支持 dead 态不一致；是否在 v2.1 放开？
2. 转阶段 1.9s 期间无伤害减免，Boss 可能在演出中被直接打进狂怒阶段（两段演出衔接）；是否需要伤害上限/减免？
3. 二阶段召唤的精英咒眼 + 爆裂者组合难度较高，需 QA 评估是否造成「无限打断」体验。
4. 无尽后期敌人数量上限 16、单波 Boss 战普通敌人 `max(2, floor(count×0.35))`，高波次（>20）是否会出现清怪时间过长？需实测。
5. 赤红竞技场是否需要在二阶段结束后淡出（当前为瞬时切换）？

---

## 附录 A：实现对齐记录

| 事实 | 源码 | 文档 |
| --- | --- | --- |
| Boss 820 HP，第 5 波缩放 ×1.18 → 968 | `combat.js` `ENEMY_TYPES`/`getWaveDef`/`createEnemy` | ✅ |
| 50% 回响形态（1.9s transition、+10 风格、赤红、boss2）、<25% 终焉形态 | `combat.js` `updateBoss`/`startBossPhase2` | ✅ |
| HUD 名称：回响之主/回响形态·第 2 阶段、终焉守望者/终焉形态 | `hud.js` update Boss 段 | ✅ |
| 剑雨 4+1 落点、18 伤害、1.2s 前摇；三连 14×3、1.05s；突进 26、0.75s | `combat.js` `chooseBossAttack`/`updateBossAttack` | ✅ |
| 无尽起始第 6 波、hp/dmg/score 11%/6.5%/16%、每 5 波 Boss、16 上限、精英 ≤55% | `combat.js` `makeEndlessWave` | ✅ |
| 无尽 Boss 击杀 = 清波而非胜利；赤红恢复、音乐切 battle、onWaveCleared | `combat.js` `killEnemy` | ✅ |
| 无尽评级 S≥15/A≥10/B≥7/C；标题「回响止步」/`THE ECHO ENDURES` | `hud.js` `showEnd` | ✅ |
| 纪录结构/键、设置结构/键 | `game.js` `saveResult`/`loadSettings` | ✅ |
