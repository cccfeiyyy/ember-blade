# Story 001：祝福数据表与三选一流程

> **Epic**: EPIC-V2 回响构筑
> **Status**: Complete（实现已落地，待 QA 证据归档）
> **Layer**: Feature
> **Type**: Logic / Data / UI
> **Estimate**: M
> **Manifest Version**: 2026-10-19
> **Last Updated**: 2026-10-19

---

## Context

**GDD**: `design/gdd/blessing-system.md`
**Requirements**: TR-BLESS-001 ~ TR-BLESS-007
**ADR Governing Implementation**: ADR-002（数据驱动祝福与 `mods` 聚合）
**ADR Decision Summary**: 祝福数据集中在 `src/blessings.js`，通过 `apply(P)` 修改统一 `P.mods`，`recalcBlessingMods` 全量重算；抽取与稀有度权重由数据模块统一提供。
**Engine**: Three.js r128（UI 为 DOM） | **Risk**: LOW

**Control Manifest Rules**:
- Required：新祝福只加 `BLESSINGS` 数据表；新 `mods` 字段先入 `blessingModsBase()`；重算必须幂等。
- Forbidden：不得在 HUD/combat 重复定义祝福数值；不得绕过 `G.recalcBlessingMods`。
- Guardrail：抽取最多 200 次循环；`recalc` 每局 ≤12 次。

**实现事实（源码）**：
- `.dev/src/blessings.js`：22 条祝福（普通 8 / 稀有 8 / 史诗 6）、`RARITY`（62/28/10，波次漂移）、`rollBlessingChoices`、`recalcBlessingMods`。
- `.dev/src/game.js`：`openBlessing/selectBlessing/acquireBlessing/onWaveCleared`；`S.mode='blessing'`；选择后 430ms 进入下一波。
- `.dev/src/hud.js`：`showBlessings/pickBlessingCard/hideBlessings/addBlessingChip`。

---

## Acceptance Criteria

- [ ] AC-1：`G.BLESSINGS.length === 22`；稀有度分布 8/8/6；每条含 `id/name/icon/rarity/max/desc/flavor/apply`。
- [ ] AC-2：开局弹出三选一（`S.mode === 'blessing'`），选择后第 1 波开始；`P.blessings.length === 1`。
- [ ] AC-3：每波清场后弹出三选一（主流程清第 1–4 波后）；Boss 胜利不弹。
- [ ] AC-4：稀有度权重随波次漂移（`max(18,62-2w)`、`min(52,28+2.5w)`、`min(40,10+3.5w)`）。
- [ ] AC-5：达 `max` 的祝福不再进入候选；候选不足 3 时安全处理；空池时自动跳过。
- [ ] AC-6：选择后 `P.mods` 与 `maxHp/maxStamina/maxPotions` 更新；`recalc` 幂等。
- [ ] AC-7：祝福界面支持鼠标点击与 1/2/3 键；`Esc` 无效；HUD 左上出现图标 chip（叠加显示层数）。
- [ ] AC-8：音效 `blessingOpen`/`blessingPick(rarity)` 正确触发；选择后 430ms 恢复 `playing` 并锁指针。

---

## Implementation Notes

- 数据表是唯一真源；不要在别处硬编码祝福数值。
- `recalc`：先 `P.mods = G.blessingModsBase()`，再遍历 `P.blessings` 执行 `apply(P)` 并统计 `counts`；派生上限后 clamp。
- `acquireBlessing`：push → recalc → `onPick` → HP 兜底（`if (P.hp < 1) P.hp = 1`）→ HUD chip → `addStyle(4)` → 提示。
- `openBlessing` 的 `rollWave`：`from === 'start' ? 1 : S.wave + 1`。
- 祝福不落盘（ADR-003）。

---

## Out of Scope

- 祝福的强化/重铸/删除功能（v2 不做）。
- 祝福图鉴/详情页（HUD chip 的 title 已提供基础信息）。
- 无尽模式的祝福特殊规则（由 Story 006 处理：无尽每波 1 次，无 Boss 波双选）。

---

## QA Test Cases

- **AC-1**：
  - Given `G.BLESSINGS` 已加载
  - When 读取长度与稀有度分布
  - Then `length===22`，common=8，rare=8，epic=6；每条字段齐全
- **AC-2/AC-3**：
  - Given 点击开始游戏
  - When 观察模式与波次
  - Then `S.mode==='blessing'`；选择后 `wave===1` 且 `P.blessings.length===1`；清第 1 波后再次进入 blessing
  - Edge cases：清波瞬间玩家死亡 → 不弹祝福
- **AC-4**：
  - Given 固定波次参数
  - When 抽样 200 次 `rarityWeight`
  - Then 权重符合公式（可读函数或统计趋势）
- **AC-5**：
  - Given 某祝福已满层
  - When 抽取 100 次
  - Then 候选不包含该祝福；全部满层时返回空数组且流程跳过
- **AC-6**：
  - Given 已选 `sharp` ×2
  - When 读取 `P.mods.lightMul`
  - Then ≈1.3225；连续 `recalc` 10 次数值不变
- **AC-7/AC-8**：
  - Given 祝福界面显示
  - When 按 2 键 / 点击第二张卡
  - Then 选中第二条并关闭；`audio.musicMode` 恢复；430ms 后 `S.mode==='playing'`
  - Setup：无头浏览器 `__DEBUG` 打开祝福；Verify：DOM `#blessing-screen` 显隐与卡片数量

---

## Test Evidence

- 自动化：`production/qa/` CDP 脚本（blessing 流程断言）——待 qa-verifier 归档。
- 手动：祝福界面截图（三卡、稀有度、选择动画）——待补。
- 构建：`node .dev/build.mjs` 输出 `index.html` 含 `blessings.js`。

---

## Dependencies

- 依赖：ADR-001（构建标记）、ADR-002（数据契约）、`game.js` 模式机。
- 被依赖：Story 002（`P.mods` 消费）、Story 003（风格/祝福联动）、Story 006（无尽祝福双选）。
