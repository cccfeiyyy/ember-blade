# EPIC：v2.0「回响构筑」— 战斗深化与无尽循环

> **Status**: In Progress
> **Author**: design-docs
> **Last Updated**: 2026-10-19
> **Epic ID**: EPIC-V2
> **Layer**: Feature（跨 Foundation/Core/Presentation）
> **GDD**: `design/gdd/game-concept-v2.md`（v2 范围）、`systems-index.md`
> **Architecture**: `docs/architecture/master.md`；ADR-001/002/003
> **Control Manifest**: `docs/architecture/control-manifest.md`（Manifest 2026-10-19）

---

## 1. Overview

把《余烬之刃》从「5 波通关的动作小游戏」升级为「有构筑、有评分、有重复挑战动机」的 v2.0：

- **构筑**：回响祝福三选一（22 条、3 档稀有度、统一 `mods` 聚合）。
- **战斗深度**：Q 格挡 / 0.18–0.20s 精准弹反、低血处决、D→S 风格评价。
- **敌人压力**：精英词缀（迅捷/护盾/狂怒）、爆裂者（自爆 AOE）、掉落拾取。
- **终局扩展**：Boss 50% 二阶段（赤红竞技场/剑雨/三连冲击波/突进）+ 25% 狂怒；胜利后无尽模式 + 本机最高纪录。
- **基础体验**：设置扩展（反转 Y/画质/灵敏度/音量，持久化）、程序化音频扩展（16 种 SFX + boss2 音乐层）。

成功定义：玩家在一局内能形成可辨认的构筑、用弹反改写战斗、通关后愿意再挑战无尽；单文件离线可玩且体积 ≤1 MB。

---

## 2. Scope

### In Scope
- 新模块 `src/blessings.js`（构建标记 `/*__BLESSINGS__*/`）。
- `game.js`：祝福流程/风格/纪录/设置/无尽状态与接口。
- `combat.js`：格挡/弹反/处决/风格事件/爆裂者/精英词缀/掉落/无尽波次/Boss 二阶段。
- `hud.js` + `template.html` + `style.css`：祝福界面、风格盒、Q 技能位、设置项、无尽结算/纪录。
- `world.js`：赤红竞技场 `setCrimson`、爆裂者模型、剑雨/冲击波 VFX。
- `audio.js`：16 种新 SFX、`boss2` 音乐层。
- `build.mjs`：新模块标记。
- QA：`production/qa/` 无头浏览器验收与冒烟。

### Out of Scope（见 game-concept §9.3）
新关卡/地图、剧情模式、装备/商店/经济、多人/排行榜、成就、手柄、移动端、多语言、外部美术/音频资源。

---

## 3. Governing ADRs

| ADR | 约束 |
| --- | --- |
| ADR-001 | 单文件构建、全局命名空间、脚本顺序、DOM HUD、`file://` 可玩 |
| ADR-002 | 祝福数据表唯一真源、`mods` 全量重算、新字段先入 base |
| ADR-003 | localStorage 键/结构、异常降级、局内不落盘 |

---

## 4. GDD Requirements（Epic 覆盖）

| 系统 | TR 范围 | 交付 |
| --- | --- | --- |
| 祝福 | TR-BLESS-001~007 | 22 条数据、三选一、权重漂移、层数、`mods`、UI、空池 |
| 弹反/格挡 | TR-COMBAT-002~004/008 | 减伤、0.18–0.20s 窗口、反弹幕、背刺/方向、破防 |
| 处决/风格 | TR-COMBAT-005~007、TR-STYLE-001~005 | 破绽/处决/回血、D→S 事件与倍率、HUD/音效 |
| Boss 二阶段 | TR-BOSS-001~005 | 赤红竞技场、`boss2`、剑雨、三连冲击波、突进、狂怒 |
| 敌人/掉落 | TR-ENEMY-001~006、TR-DROP-001~003 | 爆裂者、3 词缀、掉落/拾取/自动结算 |
| 无尽/存档 | TR-WAVE-002~005、TR-SAVE-001~003、TR-CORE-003/004 | 无尽解锁/缩放/Boss/纪录、设置持久化 |
| HUD | TR-HUD-001~007 | 祝福卡、风格盒、Q 位、设置、结算、纪录、色盲编码 |
| 音频 | TR-AUDIO-001~005 | 16 SFX、boss2、降级、同步、音量持久化 |
| 输入/构建/调试 | TR-INPUT-001~003、TR-BUILD-001/002、TR-DEBUG-001~004 | Q 键、反转 Y、画质、构建、测试接口 |

---

## 5. Stories

| # | Story | 类型 | 主要 TR | 依赖 |
| --- | --- | --- | --- | --- |
| 001 | 祝福数据表与三选一流程 | Logic / Data / UI | TR-BLESS-001~007 | ADR-002 |
| 002 | 格挡与精准弹反 | Integration | TR-COMBAT-002~004/008 | Story 001（mods）、ADR-001 |
| 003 | 处决与风格评价 | Logic / Integration | TR-COMBAT-005~007、TR-STYLE-001~005 | Story 002 |
| 004 | Boss 二阶段与狂怒 | Integration / Visual | TR-BOSS-001~005 | Story 002/003 |
| 005 | 精英词缀 / 爆裂者 / 掉落 | Logic | TR-ENEMY-001~006、TR-DROP-001~003 | Story 002 |
| 006 | 无尽 / 持久化 / 设置 / HUD / 音频整合 | UI / Config / Integration | TR-WAVE-002~005、TR-SAVE、TR-HUD、TR-AUDIO、TR-INPUT | Story 001/003/004/005 |

> 详细文件：`production/epics/v2/story-001-*.md` … `story-006-*.md`。

---

## 6. Definition of Done（Epic 级）

- [ ] 全部 Must Have Story 完成，验收标准（AC）逐条通过。
- [ ] `node .dev/build.mjs` 成功，`index.html` ≤1 MB，单文件双击可玩。
- [ ] 主流程 5 波 + Boss 二阶段可完整通关；胜利后可进入无尽并至少推进 3 波。
- [ ] 22 条祝福可抽取；三选一鼠标/键盘可用；`mods` 生效。
- [ ] 弹反/处决/风格 HUD 可见且与数值一致。
- [ ] 设置四项可调、刷新后保留；纪录刷新后保留。
- [ ] 无 P0（崩溃/白屏/流程卡死）；无 P1（阻断主流程）缺陷。
- [ ] `production/qa/` 有冒烟/QA 记录；关键路径有 CDP 自动化证据。
- [ ] 文档（GDD/架构/UX/本 Epic）与最终实现对齐，差异已注明。

---

## 7. Risks & Mitigations

| 风险 | 缓解 |
| --- | --- |
| `combat.js` 改动面大（弹反/处决/Boss/敌人/波次同改） | 分 Story 提交；先跑 v1 回归（移动/连击/闪避/剑气/锁定）再逐项加 |
| 祝福数值滚雪球 | 叠加上限、史诗唯一、发版前组合检查 |
| 弹反窗口手感（0.18 vs 0.20） | 以源码常量为准并回写文档；QA 用固定步长断言 |
| 无尽/纪录状态分支遗漏 | 以 `S.endless` 单点判断；QA 覆盖死亡/胜利/刷新 |
| 体积膨胀 | 构建输出体积校验；无外部资源 |

---

## 8. Handoff / Evidence

- 构建：`node .dev/build.mjs` → `BUILD OK / SIZE`。
- 自动化：`production/qa/` 的 CDP 脚本与报告（qa-verifier）。
- 手动：`screenshots/` 的标题/战斗/Boss/结算截图（v1 基线；v2 截图由 QA 补充）。
- 文档对齐：各 GDD 附录「实现对齐约定」在发版前更新为最终源码事实。
