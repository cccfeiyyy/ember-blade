# Story 004：Boss 50% 二阶段与 25% 狂怒

> **Epic**: EPIC-V2 回响构筑
> **Status**: In Review（实现完成，待 QA 证据归档）
> **Layer**: Feature
> **Type**: Integration / Visual
> **Estimate**: L
> **Manifest Version**: 2026-10-19
> **Last Updated**: 2026-10-19

---

## Context

**GDD**: `design/gdd/boss-phase2-endless.md` §3
**Requirements**: TR-BOSS-001（50% 二阶段 + 赤红竞技场 + `boss2` 音乐）、TR-BOSS-002（剑雨）、TR-BOSS-003（三连冲击波）、TR-BOSS-004（突进）、TR-BOSS-005（25% 狂怒）
**ADR Governing Implementation**: ADR-001（VFX/音乐接口）、ADR-002（`P.mods` 在 Boss 战生效）
**ADR Decision Summary**: 阶段只由 HP 阈值触发一次；转阶段调用 `audio.sfx('bossPhase')`、`W.setCrimson(true)`、`audio.setMusicMode('boss2')`；新招式复用 `world.js` 的预警/冲击波/VFX 工厂。
**Engine**: Three.js r128 | **Risk**: HIGH（战斗节奏 + 性能 + 状态清理）

**Control Manifest Rules**:
- Required：阶段转换唯一入口；退出必须 `setCrimson(false)`；新招式必须使用既有 VFX 工厂。
- Forbidden：二阶段不得新建常驻大网格/新光源；不得在 `update()` 内直接 `setMode`。
- Guardrail：Boss 战同屏敌人 ≤14；剑雨/冲击波并发受限。

**实现事实（源码，进行中）**：
- `.dev/src/world.js`：`W.setCrimson(on)` 已实现（背景 `0x160409`、雾 `0x24060a`、地面自发光 `0xff6040`、月光 `0xff9a88`、火盆/剑光变红），可完整恢复原色。
- `.dev/src/audio.js`：`bossPhase`/`swordRain` SFX 与 `boss2` 音乐层（100 BPM）已实现。
- `.dev/src/combat.js`：Boss 二阶段招式实现进行中（待核对剑雨/三连/突进的判定与常量）。

---

## Acceptance Criteria

- [ ] AC-1：Boss HP ≤50% 时触发一次转阶段：**1.9s** `transition` 演出、`W.setCrimson(true)`、`audio.setMusicMode('boss2')`、`audio.sfx('bossPhase')`、HUD 名称「回响之主 / 回响形态 · 第 2 阶段」、中央大字「无 面 守 望 者 · 回 响 形 态」。
- [ ] AC-2：二阶段加入剑雨：玩家位置中心红圈 2.9 + 周围 4 个红圈 2.6（前摇 1.2s）→ 4 处落点 AOE（半径 2.8、伤害 18）；正面来源可被格挡减伤。
- [ ] AC-3：二阶段加入三连冲击波：前摇 1.05s，0.2/0.55/0.9s 三环（半径 12）各造成 14 伤害；无弹反判定。
- [ ] AC-4：二阶段加入突进：前摇 0.75s，直线预警，速度 26 递减突进，命中半径 3.4、伤害 26；可被精准弹反（Boss 硬直 0.5s）。
- [ ] AC-5：Boss HP <25% 时进入「终焉形态」：`speedMul 1.3`、`windMul 0.78`、攻击冷却 1.3s、HUD「终焉守望者 / 终焉形态」。
- [ ] AC-6：二阶段 ≤25% 时召唤一次（4 只：蚀影×2、精英咒眼、爆裂者）；Boss 仍保留横扫/重斩/冲击波与可弹反的突进/横扫。
- [ ] AC-7：Boss 死亡 → 主流程胜利结算；赤红竞技场恢复（`W.setCrimson(false)`）；音乐停止/切回。
- [ ] AC-8：重开/返回标题/进入无尽后赤红状态不残留（`W._crimson === false`）。
- [ ] AC-9：二阶段帧率不低于 30 FPS（中端桌面；自动降质生效）。

---

## Implementation Notes

- 转阶段：`updateBoss` 中 `!e.phase2 && hp <= maxHp*0.5 && state!=='transition'` → `startBossPhase2(e)`：`state='transition'`、`phaseT=0`，1.9s 后进入 `chase`（冷却 0.8s）。期间无伤害减免。
- 赤红：只在进入/退出时调用 `setCrimson`，不要每帧调用。
- 音乐：`audio.setMusicMode('boss2')`；Boss 死亡后 `setMusicMode('none')`（主流程）或 `battle`（无尽）。
- 剑雨：`chooseBossAttack` 生成中心 + 周边 4 个 `telegraphRing`；`updateBossAttack` 在 t≥0.15 按玩家当前位置周围 4 点结算（伤害 18×dmgScale）。
- 三连冲击波：`W.shockwave` 三次（0.2/0.55/0.9s），半径 12，伤害 14×dmgScale；无弹反判定。
- 突进：`telegraphSector` 直线预警；t≥0.1 锁定方向，速度 26 递减至 t=0.62；命中半径 3.4、伤害 26×dmgScale；来源为 Boss，可被精准弹反（Boss `stunTimer=0.5`）。
- 狂怒：`hp < maxHp×0.25` → `enraged=true`（speed 1.3 / windMul 0.78 / 冷却 1.3s）。
- 退出清理：`clearAll()`/`startEndless()`/Boss 死亡中确保 `W.setCrimson(false)`。

---

## Out of Scope

- 无尽模式的 Boss 专属词缀（v2 不做）。
- Boss 第二阶段的新模型/新贴图（复用 v1 无面守望者模型）。
- Boss 处决（免疫）。

---

## QA Test Cases

- **AC-1**：
  - Given 进入第 5 波
  - When `__DEBUG.damageEnemy()` 将 Boss 打至 50% 以下
  - Then `W._crimson===true`；`audio.musicMode==='boss2'`；HUD `#boss-phase` 为「回响形态 · 第 2 阶段」
  - Edge cases：在转阶段演出中击杀 Boss → 直接胜利且不崩溃；重复跨过 50% 不重复触发
- **AC-2/3/4**：
  - Given 二阶段
  - When 推进 30 秒
  - Then 三种新招式各出现 ≥1 次（`__DEBUG.state()` 的 `bossPhase2`/日志）
  - Edge cases：剑雨落点时玩家在圈内 → 受伤；突进正面弹反 → Boss `stunTimer>0`
- **AC-5**：
  - Given Boss HP 降至 24%
  - When 读取 Boss 参数
  - Then `bossEnraged===true`；速度/前摇/冷却按 1.3/0.78/1.3s 生效
- **AC-7/AC-8**：
  - Given Boss 战二阶段
  - When 击杀/重开/进入无尽
  - Then `W._crimson===false`，背景/雾/灯光恢复
- **AC-9**：
  - Setup：二阶段持续 60s
  - Verify：无持续掉帧（FPS 采样）

---

## Test Evidence

- 自动化：`__DEBUG.skipToBoss()` + `damageEnemy()` 触发阶段；`state()` 读取 `bossHp`、`music`、`waveState`。
- 视觉：二阶段赤红竞技场、剑雨、三连冲击波、突进、狂怒的截图（v1 截图目录之外的 v2 证据由 QA 归档）。
- 音频：`boss2` 与 `bossPhase` 试听。

---

## Dependencies

- Story 002（弹反判定复用）、Story 003（处决窗口与 Boss 免疫）。
- 被依赖：Story 006（无尽 Boss 复用二阶段参数）。
