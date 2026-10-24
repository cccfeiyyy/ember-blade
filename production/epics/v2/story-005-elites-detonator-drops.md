# Story 005：精英词缀 / 爆裂者 / 掉落拾取

> **Epic**: EPIC-V2 回响构筑
> **Status**: In Review（实现完成，待 QA 证据归档）
> **Layer**: Core
> **Type**: Logic
> **Estimate**: M
> **Manifest Version**: 2026-10-19
> **Last Updated**: 2026-10-19

---

## Context

**GDD**: `design/gdd/enemies-and-drops.md` §4.4–6
**Requirements**: TR-ENEMY-001~006（爆裂者/精英/护盾/缩放）、TR-DROP-001~003（掉落/拾取/清场结算）
**ADR Governing Implementation**: ADR-001（VFX/敌人工厂）、ADR-002（祝福联动：噬魂/荆棘）
**ADR Decision Summary**: 新敌人注册进 `ENEMY_TYPES` 与 `W.enemyFactory`；精英词缀作为敌人属性修正；掉落为战斗内轻量实体，拾取结算走资源增加。
**Engine**: Three.js r128 | **Risk**: MEDIUM（AI 行为 + 性能）

**Control Manifest Rules**:
- Required：新敌人在 `W.enemyFactory` 与 `ENEMY_TYPES` 双端登记；掉落实体 ≤6；拾取/清场结算不绕过资源规则。
- Forbidden：不得新增常驻大网格；不得让自爆伤害绕过 `damagePlayer`。
- Guardrail：单波敌人 ≤14；爆裂者连锁爆炸需限制并发。

**实现事实（源码，进行中）**：
- `.dev/src/world.js`：`buildDetonator()` 已实现——圆鼓外壳 + 7 尖刺 + 熔火裂隙 + 橙黄发光核心 + 短腿（模型工厂 key `detonator`）。
- `.dev/src/combat.js`：`ENEMY_TYPES.detonator` 已加入；第 4 波含 detonator×2、第 5 波含 detonator×1；`ELITE_KINDS`/`makeEndlessWave` 已出现。
- `.dev/src/audio.js`：`detonate`（滴答+爆炸）、`eliteSpawn`（三连低频脉冲）、`pickup`（拨奏）已实现。

---

## Acceptance Criteria

- [ ] AC-1：爆裂者（`detonator`）出现在第 4 波（×2）、第 5 波（×1）及无尽波次；接近（<2.7m 或累计 6.5s）后进入 0.85s 倒计时，结束时自爆：半径 3.8 内玩家受到 `e.dmg`（基础 26×倍率）。
- [ ] AC-2：倒计时结束前击杀 → 不爆炸、正常得分/连击/概率掉落；自爆 → 无击杀分/连击、必掉势能 +16（12s）。
- [ ] AC-3：精英词缀生效：迅捷（hp×1.35、速度×1.4）、护盾（hp×1.7、首击伤害×0.3 并破盾）、狂怒（hp×1.5、速度×1.15、伤害×1.45）。
- [ ] AC-4：主流程精英概率第 3 波 10%、第 4 波起 16%；无尽 `min(0.55, 0.10+0.05k)`；精英体型 ×1.12、得分 ×2。
- [ ] AC-5：精英护盾被任意首击（含弹反反伤）破除，破盾播放 `block` 与「护盾破碎」提示；无护盾再生。
- [ ] AC-6：掉落符合实现：普通 28% 治疗+9 / 22% 势能+15；精英治疗+12 与势能+20 各 1；Boss 治疗+14×2、势能+20×2；爆裂者自爆势能+16。
- [ ] AC-7：拾取半径 1.25m、磁吸 <5.2m、寿命 20s（爆裂者 12s）、场上上限 26；清波不自动结算。
- [ ] AC-8：无尽波次缩放（数量/生命/伤害/得分/精英率）符合 `makeEndlessWave` 公式。
- [ ] AC-9：新增敌人/掉落不导致明显掉帧（中端桌面 ≥30 FPS）。

---

## Implementation Notes

- 爆裂者 AI：`chase`（距离 >1.5m 以 4.9 速度追击）→ 距离 <2.7m 或累计 >6.5s → `windup` 0.85s（红环半径 3.8 + `detonate`）→ `detonateEnemy`：半径 3.8 冲击波、玩家距离 <3.8 受伤（可正面格挡）；自爆不再走 `killEnemy`（无击杀分/连击），固定掉势能 +16（12s）。
- 爆裂者被击杀：正常 `killEnemy`（得分/连击/概率掉落），播放无害殉爆特效。
- 精英：`startWave` 中按 `w.eliteChance` 掷骰，`opts.elite/eliteKind` 传入 `createEnemy`；属性倍率见 `ELITE_KINDS`；`finalScale=1.12`；`guaranteedDrop=true`。
- 护盾：`shieldHits=1`，`damageEnemy` 首次命中时伤害 ×0.3 并置 0，后续正常；弹反反伤同样触发。
- 掉落：`dropLoot(e)` 在 `killEnemy`（非 Boss/普通分支）调用；拾取物由 `updatePickups` 更新，磁吸/半径/寿命见上文；无清场自动结算。

---

## Out of Scope

- 爆裂者特殊掉落（专属道具）——不做。
- 精英组合词缀（一词缀/精英）。
- 掉落物稀有度/品质（仅两种资源）。

---

## QA Test Cases

- **AC-1**：
  - Given `__DEBUG.spawnEnemy('detonator', x, z)`
  - When 玩家靠近
  - Then 敌人进入 0.85s 倒计时并在结束后自爆；玩家在半径 3.8 内受伤、半径外不受伤
- **AC-2**：
  - Given 爆裂者倒计时中
  - When `__DEBUG.damageEnemy(999)` 击杀它
  - Then 不爆炸；`D.enemies` 中该敌人死亡；按普通概率掉落
  - Edge cases：让爆裂者自爆 → `D.pickups` 出现势能 +16、`S.score` 不因击杀增加
- **AC-3**：
  - Given 人工生成护盾精英（`debugSpawn` 支持 opts 时）
  - When 首次攻击
  - Then 伤害 ×0.3 且 `shieldHits=0`；第二次攻击正常
- **AC-4**：
  - Given 第 4 波
  - When 统计精英
  - Then 出现概率与属性倍率符合 §5；得分 ×2
- **AC-6/AC-7**：
  - Given 击杀多个敌人
  - When 统计掉落
  - Then 概率/数值符合 §6；拾取后资源增加；20s 后消失；场上上限 26
- **AC-8/AC-9**：
  - Setup：无尽第 10 波
  - Verify：敌人属性/数量缩放；帧率可接受

---

## Test Evidence

- 自动化：CDP 生成爆裂者/精英，断言自爆伤害、护盾、精英属性和掉落拾取；`__DEBUG.enemies()`/`player()` 数据。
- 手动：爆裂者倒计时音效/红环、精英光环、拾取反馈。
- 截图：爆裂者、护盾精英、掉落物。

---

## Dependencies

- Story 002（弹反碎盾、格挡判定）。
- 被依赖：Story 006（无尽波次生成调用精英/爆裂者参数）。
