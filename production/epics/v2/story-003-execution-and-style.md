# Story 003：处决与风格评价

> **Epic**: EPIC-V2 回响构筑
> **Status**: In Review（实现完成，待 QA 证据归档）
> **Layer**: Core / Feature
> **Type**: Logic / Integration
> **Estimate**: M
> **Manifest Version**: 2026-10-19
> **Last Updated**: 2026-10-19

---

## Context

**GDD**: `design/gdd/parry-style-system.md` §3.3、§4.3–4.5；`design/gdd/blessing-system.md`（处决者/完美余音联动）
**Requirements**: TR-COMBAT-005（破防）、TR-COMBAT-006（处决）、TR-COMBAT-007（Boss 免疫）、TR-STYLE-001~005
**ADR Governing Implementation**: ADR-001 / ADR-002
**ADR Decision Summary**: 破绽与处决在 `combat.js` 内实现；风格分由 `G.game.addStyle()` 统一入口，等级/倍率由 `STYLE_TIERS` 定义，得分与势能乘 `styleMul()`。
**Engine**: Three.js r128 | **Risk**: MEDIUM（状态机插入 + 得分膨胀）

**Control Manifest Rules**:
- Required：处决阈值读 `P.mods.execThresholdBonus`；Boss 免疫；处决演出期间玩家无敌；风格加分只经 `G.game.addStyle`。
- Forbidden：不得绕过 `damagePlayer/damageEnemy` 结算；不得在别处定义风格阈值。
- Guardrail：处决动画 ≤1s，不得阻塞主循环；风格更新为标量运算。

**实现事实（源码，进行中）**：
- `.dev/src/game.js`：`STYLE_TIERS`（D 0 / C 12 / B 28 / A 48 / S 70；倍率 1.0/1.08/1.18/1.32/1.5；称号 静默/锋利/华丽/无双/余烬）；`stylePoints ∈[0,100]`；衰减 9/s、2.6s 延迟；`addStyle` 触发 `styleUp/styleDown` 与 HUD。
- `.dev/src/combat.js`：`e.executable`、`executeEnemy(e)` 已出现；轻/重命中 `addStyle(3/6)`；弹反 `addStyle(18)`；处决 `addStyle(20)`。

---

## Acceptance Criteria

- [ ] AC-1：非 Boss 敌人 HP ≤ `maxHp × (0.24 + P.mods.execThresholdBonus)` 时进入破绽（`e.executable`），血条金色高亮并持续金屑粒子（标记无时限）。
- [ ] AC-2：破绽期间近战/剑气命中触发处决：敌人立即死亡、玩家回血（基础 **6** + `executeHealBonus`）、势能 +20、风格 +18（另加击杀 +8）、播放 `execute`。
- [ ] AC-3：处决为即时斩杀演出（慢动作 0.34×0.55 + 金色刀光/爆发），无独立 0.9s 动作与保护帧；敌人从 `D.enemies` 正确移除。
- [ ] AC-4：Boss 不可处决（TR-COMBAT-007）；破绽标记不会过期（敌人不恢复生命）。
- [ ] AC-5：风格事件覆盖轻斩/重斩/弹反/处决/击杀/完美闪避；受击扣分；衰减符合源码（9/s，2.6s 延迟）。
- [ ] AC-6：D→S 阈值/倍率与 `STYLE_TIERS` 一致；升级/降级播放 `styleUp/styleDown` 并更新 HUD 风格盒。
- [ ] AC-7：命中得分 = `base × comboMult × styleMul`；势能获取乘 `styleMul`（及 `momentumMul`）。
- [ ] AC-8：`P.stats.executions` 与 `P.stats.parries` 正确累计，`__DEBUG.player()` 可读。
- [ ] AC-9：祝福「处决者」「完美余音」「时之砂」与处决/风格联动可验证。

---

## Implementation Notes

- 破绽进入：在 `damageEnemy()` 结算后检查 `hp/maxHp <= 0.24 + execThresholdBonus && type !== 'boss'` → 设 `e.executable = true`（无计时器；敌人仍会行动）。
- 处决触发：玩家近战或剑气命中 `e.executable` 敌人时优先于普通伤害处理：`executeEnemy(e)`（回血 6+加成、得分 `300 × comboMult × styleMul`、势能 +20、风格 +18、`audio.sfx('execute')`），随后 `killEnemy`。
- 处决得分：`300 × comboMult × styleMul`（实现值，非敌人基础分）。
- 风格事件统一走 `addStyle(n)`：不要在命中逻辑里直接改 `S.stylePoints`。
- 受击惩罚：当前实现**没有**受击扣风格分（只清连击，除非「无限连」）；以源码为准，文档不虚构惩罚。
- 结算阈值（胜利 38000/29000/21000）沿用 v1；若 `comboMult × styleMul` 导致普遍 S，由 QA 提出后统一调参（Story 006）。

---

## Out of Scope

- Boss 处决（不做）。
- 处决专属动画骨骼/镜头（复用现有挥剑动作 + 演出特效）。
- 结算评级阈值重算（由 Story 006 的 HUD/结算部分统一处理）。

---

## QA Test Cases

- **AC-1/AC-2**：
  - Given 蚀影 HP 降至 10/46（<24%）
  - When 近战或剑气命中
  - Then 触发处决：蚀影死亡、玩家 HP +6（+祝福加成）、`P.stats.executions` +1
  - Edge cases：处决后立即被其他敌人攻击 → 无保护帧，按正常受击处理
- **AC-3**：
  - Given 处决触发
  - When 读取状态
  - Then 敌人立即 `alive=false`；`timeScale<1` 短时；回到正常战斗
- **AC-4**：
  - Given Boss HP 降至 10%
  - When 近战命中
  - Then 不触发处决；Boss 照常受伤
- **AC-5/AC-6**：
  - Given 连续命中
  - When 读取 `stylePoints` 与 `styleRank()`
  - Then 阈值 12/28/48/70 正确切换；倍率 1.08/1.18/1.32/1.5；衰减 9/s
  - Edge cases：分数达 100 不溢出；升级音效只跨级触发一次
- **AC-7**：
  - Given 风格 A（×1.32）与连击 ×2.0
  - When 一次重斩命中
  - Then 得分 ≈ 伤害 ×1.4 ×2.0 ×1.32
- **AC-9**：
  - Given 选「处决者」×2
  - When 检查阈值与回血
  - Then 0.24 + 0.16 = 0.40；处决回血 6+16=22

---

## Test Evidence

- 自动化：CDP `__DEBUG` 构造低血敌人 + 处决断言；风格分序列断言。
- 手动：处决演出、风格升级音效/HUD 试听。
- 截图：破绽符文、处决瞬间、S 级风格盒。

---

## Dependencies

- Story 001（处决者等祝福）、Story 002（弹反/破防状态机）。
- 被依赖：Story 004（Boss 阶段可输出窗口）、Story 006（结算/风格 HUD）。
