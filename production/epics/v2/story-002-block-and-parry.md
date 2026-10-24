# Story 002：格挡与精准弹反

> **Epic**: EPIC-V2 回响构筑
> **Status**: In Review（实现完成，待 QA 证据归档）
> **Layer**: Core
> **Type**: Integration
> **Estimate**: M
> **Manifest Version**: 2026-10-19
> **Last Updated**: 2026-10-19

---

## Context

**GDD**: `design/gdd/parry-style-system.md` §3.1–3.2、§4.1–4.2
**Requirements**: TR-COMBAT-002（格挡）、TR-COMBAT-003（弹反窗口）、TR-COMBAT-004（反弹幕）、TR-COMBAT-008（方向/背刺）、TR-INPUT-001（Q 键）
**ADR Governing Implementation**: ADR-001（单文件/运行时）与 ADR-002（`P.mods` 读取）
**ADR Decision Summary**: Q 输入经 `game.js` 映射到 `G.combat.playerParryDown/Up`；弹反/格挡判定集中在 `damagePlayer()` 之前的防御分支，统一走玩家状态机。
**Engine**: Three.js r128 | **Risk**: MEDIUM（手感与判定顺序）

**Control Manifest Rules**:
- Required：所有玩家受伤必须经 `damagePlayer()`；判定顺序「弹反 → 格挡 → 破防 → 受击」；同帧只结算一次。
- Forbidden：不得绕过 `damagePlayer()` 直接扣血；不得在 `combat.js` 里硬编码忽略祝福的数值。
- Guardrail：弹反窗口按时间判定（非帧计数），逻辑步长限幅 ≤0.05s。

**实现事实（源码，进行中）**：
- `.dev/src/game.js`：`KeyQ` 按下 → `P.blockHeld = true; G.combat.playerParryDown()`；松开 → `playerParryUp()`；`P.parryWindow/parryCd` 已初始化。
- `.dev/src/combat.js`：`playerParryDown/playerParryUp/perfectParry` 已出现；当前实现 `P.parryWindow = 0.2`（设计方向为 0.18s，**以实现常量为准**，文档需回写）；弹反成功 `addStyle(18)` + `audio.sfx('parry')`。
- `.dev/src/hud.js`：`setCooldowns(waveCd, dodgeCd, parryCd)` 已支持 Q 技能位冷却显示。

---

## Acceptance Criteria

- [ ] AC-1：按住 Q 进入 `block` 状态，移速下降；松开结束。
- [ ] AC-2：格挡正面来源伤害 ×0.30（减伤 70%），并按 `amount × 1.15` 消耗体力；持续格挡 >0.25s 每秒额外 −13 体力。
- [ ] AC-3：按下 Q 后 0.20s（实现常量）内被命中 → 完美弹反：0 伤害、敌人硬直 1.2s（Boss 0.5s）、+16 体力/+24 势能/+320 分/+18 风格、慢动作与 `parry` 音效。
- [ ] AC-4：弹反敌方投射物 → 免伤并消除弹幕（当前实现不反弹伤害）。
- [ ] AC-5：背刺（超出 ±1.95rad）不减伤；格挡体力耗尽 → 架势崩溃（`hurt` 0.34s + `parryCd` 1.6s + `guardBreak`）。
- [ ] AC-6：弹反成功回体力、加势能、加风格分（经 `G.game.addStyle`）。
- [ ] AC-7：祝福 `perfectEcho/timeSand` 等对弹反收益的加成效力可验证（如 3 秒增伤）。
- [ ] AC-8：HUD Q 技能位冷却/可用状态正确（`setCooldowns`）。

---

## Implementation Notes

- 状态：`P.state !== 'dead'` 且非攻击/闪避/处决时可进入 `block`；松开 Q 后 0.2s 收招。
- 判定顺序建议：
  ```
  if (P.iframe) → 完美闪避（既有）
  else if (P.parryWindow > 0) → perfectParry()
  else if (P.blockHeld && 正面 && !AOE) → block()
  else → damagePlayer()
  ```
- 弹反成功：`P.parryWindow = 0`、`P.parryCd = 0.3`、敌人 `stagger`（普通/精英/Boss 差异化）、投射物 owner 翻转、`addStyle(18)`、`addMomentum`、`setSlowmo(0.35, 0.18)`、`audio.sfx('parry')`。
- 普通格挡：伤害 ×0.30（再乘 `damageTakenMul`），体力 `amount × 1.15`；不足则架势崩溃（`hurt` 0.34s、`parryCd=1.6`、`audio.sfx('guardBreak')`）。
- 弹反成功：+16 体力、+24 势能、+320 分、+18 风格、`invuln 0.5`、慢动作 `0.34×0.5`（时之砂 `0.30×0.95`）、非 Boss 敌人 stagger 1.2s + 22 反伤、Boss `stunTimer=0.5`。
- 与祝福联动：减伤/体力/移速读取 `P.mods`；弹反后的增伤由 `perfectBuffTimer` 计时（3s，×1.5 伤害）。

---

## Out of Scope

- 处决（Story 003）。
- 弹反 Boss 二阶段新招式（剑雨/三连/突进）的专属反制（Story 004 细化）。
- 盾反/武器切换（v2 不做）。

---

## QA Test Cases

- **AC-1/AC-2**：
  - Given 玩家站在石卫砸地范围内并按住 Q
  - When 受击
  - Then 扣血 ≈ 伤害 ×0.30，体力按 ×1.15 下降；移速低于正常
  - Edge cases：体力恰好等于消耗 → 允许格挡；背刺 → 无减伤
- **AC-3**：
  - Given 蚀影进入 windup
  - When 在它的命中帧前 ≤0.2s 按下 Q
  - Then 玩家 HP 不变、蚀影进入 stagger、`timeScale<1` 短时、audio 无异常
  - Edge cases：提前 0.4s 按 → 普通格挡；同帧多段 → 仅结算一次
- **AC-4**：
  - Given 咒眼弹幕接近
  - When 弹反
  - Then `D.projectiles` 中该弹幕 owner 改变、方向反转，命中咒眼后其 HP 下降
- **AC-5**：
  - Given 体力 5
  - When 格挡一次命中
  - Then 进入 guardBreak（硬直/受伤倍率），播放 `guardBreak`
- **AC-6/AC-7**：
  - Given 已选「完美余音」×2
  - When 弹反后 3 秒内攻击
  - Then 伤害提升约 +100%（+50%/层）
- **AC-8**：
  - Setup：`__DEBUG` 强制 `P.parryCd=0.3`
  - Verify：`#skill-parry` 存在且 `classList` 含 `cooling`

---

## Test Evidence

- 自动化：CDP 脚本构造「弹反成功/格挡/破防/反弹幕」四类断言；`__DEBUG.state().playerState`、`P.stats.parries`。
- 手动：弹反慢动作与音效试听；格挡火花视觉。
- 截图：弹反瞬间、破防提示。

---

## Dependencies

- Story 001（`P.mods` 与 `mods` 字段）。
- 被依赖：Story 003（处决依赖破绽/硬直）、Story 004（Boss 招式可弹反设定）、Story 005（精英护盾可被弹反击碎）。
