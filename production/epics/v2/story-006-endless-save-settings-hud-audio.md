# Story 006：无尽 / 持久化 / 设置 / HUD / 音频整合

> **Epic**: EPIC-V2 回响构筑
> **Status**: In Review（实现完成，待 QA 证据归档）
> **Layer**: Presentation / Foundation
> **Type**: UI / Config / Integration
> **Estimate**: M
> **Manifest Version**: 2026-10-19
> **Last Updated**: 2026-10-19

---

## Context

**GDD**: `design/gdd/boss-phase2-endless.md` §4、`design/ux/hud-and-blessing-screen.md`、`design/art-bible-v2.md` §7/§10
**Requirements**: TR-WAVE-002~005、TR-SAVE-001~003、TR-HUD-001~007、TR-AUDIO-001~005、TR-CORE-003/004、TR-INPUT-002/003
**ADR Governing Implementation**: ADR-001（DOM HUD/单文件）、ADR-003（localStorage 持久化）
**ADR Decision Summary**: 无尽纪录/设置以两个版本化 localStorage 键保存并 try/catch 降级；HUD 通过 DOM 节点与 `hud.js` 门面更新；音频未知名称静默降级。
**Engine**: Three.js r128 + DOM + WebAudio | **Risk**: MEDIUM（状态分支/多界面叠层）

**Control Manifest Rules**:
- Required：新 HUD 元素同时更新 `template.html`/`hud.js cache()`/`style.css`；`localStorage` 只在 `game.js`；音乐模式只接受合法值。
- Forbidden：不得绕过 `G.game.setMode` 切界面；不得外部资源；不得新增全屏后处理层。
- Guardrail：DOM 每帧更新仅文本/宽度/transform。

**实现事实（源码，已基本落地）**：
- `.dev/src/game.js`：`loadBest/saveResult/loadSettings/saveSettings/applyQualityMode/startEndless`；键 `emberblade_best_v2`、`emberblade_settings_v2`；结构见 ADR-003。
- `.dev/src/hud.js`：风格盒、祝福卡、无尽波次标签、结算页 `end-record`/`endless-btn`、标题 `best-record`。
- `.dev/src/template.html`：`#style-box`、`#blessing-screen`、`#invert-y`、`#quality-select`、`#endless-btn`、`#best-record`、`#end-record`、`#skill-parry`。
- `.dev/src/audio.js`：16 种新 SFX、`boss2` 音乐层。

---

## Acceptance Criteria

- [ ] AC-1：胜利结算显示「无尽回响」按钮；点击后进入无尽（`S.endless=true`，从第 6 波开始，HP ≥50%、药剂 ≥1、无敌 1.2s）。
- [ ] AC-2：无尽模式每 5 波 Boss；波次/敌人属性缩放生效；死亡结算显示到达波次与评级（S≥15 / A≥10 / B≥7 / C）。
- [ ] AC-3：无尽纪录写入 `emberblade_best_v2`（`{bestScore,endlessBest,endlessLast,storyBest,storyWins,updated}`），刷新后标题页显示。
- [ ] AC-4：设置四项（灵敏度/音量/反转 Y/画质）可调、即时生效、写入 `emberblade_settings_v2`、刷新后保留。
- [ ] AC-5：反转 Y 只影响鼠标 pitch 输入；画质 auto/high/low 正确调用 `W.setQuality`/`applyQualityMode`。
- [ ] AC-6：HUD 新增元素完整：风格盒（等级/条/倍率）、Q 技能位、祝福 chip、标题最高纪录、结算纪录、无尽按钮。
- [ ] AC-7：16 种新 SFX 均可触发且无异常；`boss2` 音乐在 Boss 二阶段切换；未知音效名静默。
- [ ] AC-8：`localStorage` 禁用时游戏不崩溃（纪录/设置不保存，可正常游玩）。
- [x] AC-9：标题页操作说明包含 Q 格挡·弹反（已实现：另含 1/2/3 选择回响）。
- [ ] AC-10：无界面叠层冲突（死亡不弹祝福、祝福界面不弹暂停、结算与无尽切换不重叠）。

---

## Implementation Notes

- 无尽进入：`startEndless()` 需先 `clearAll()`、`W.setCrimson(false)`、`setMode('playing')`、`startWave(6)`；`#endless-btn` 仅在 `victory && !endless` 显示。
- 纪录：`saveResult()` 在胜利/死亡结算时调用；`S.newRecord` 供 `#end-record` 高亮。
- 设置：控件初始化值来自 `loadSettings()`；`input/change` 时应用并 `saveSettings()`；画质切档调用 `applyQualityMode()`。
- HUD：新元素必须进 `hud.js` 的 `cache()` 数组，否则 `el` 为 undefined。
- 音频：Boss 二阶段 `audio.setMusicMode('boss2')`；退出/胜利切 `none`。
- 标题页操作说明：`template.html` 的 `.title-controls` 需补 `Q 格挡·弹反`（v2 UI 缺口，记入开放问题）。

---

## Out of Scope

- 历史纪录多档/多存档槽。
- 成就/排行榜/网络同步。
- 本地化与文案外置。
- 关闭屏幕震动/慢动作的辅助选项（v2 非目标）。

---

## QA Test Cases

- **AC-1/AC-2**：
  - Given 击败 Boss
  - When 点击 `#endless-btn`
  - Then `S.endless===true`、`S.wave===6`、HUD 波次显示「无尽 · 第 6 波」
  - Edge cases：死亡结算不显示无尽按钮；再次进入无尽从第 6 波开始且赤红状态已清除
- **AC-3**：
  - Given 无尽推进至第 8 波后死亡
  - When 刷新页面
  - Then 标题 `#best-record` 含「无尽 第 8 波」；`localStorage` 结构字段齐全
- **AC-4/AC-5**：
  - Given 修改灵敏度 1.4、关闭反转 Y、画质低
  - When 刷新
  - Then 滑条/复选框/下拉值保持；`C.sens===1.4`、`C.invertY===false`、`S.qualityMode==='low'`
  - Edge cases：localStorage 抛异常 → 控件仍可用，无未捕获错误
- **AC-6/AC-9**：
  - Setup：进入战斗
  - Verify：`#style-box`、`#skill-parry`、`#blessing-list` 存在且数值更新；标题页含 Q 说明
- **AC-7**：
  - Given `G.audio.sfx('parry')` 等逐个调用
  - Then 无异常；`audio.musicMode` 在 Boss 二阶段为 `boss2`
- **AC-10**：
  - Given 死亡瞬间恰逢清波
  - When 观察界面
  - Then 只出现死亡结算，无祝福界面

---

## Test Evidence

- 自动化：CDP 脚本覆盖 无尽进入/结算/刷新/设置持久化/音频模式/DOM 存在性。
- 手动：设置面板交互、标题操作说明、无尽纪录展示。
- 截图：标题页纪录、设置面板、无尽结算、无尽第 6 波 HUD。

---

## Dependencies

- Story 001（祝福 UI/流程）、Story 003（风格盒）、Story 004（boss2 音乐）、Story 005（无尽敌人）。
- 最终验收依赖 Lead 完成 `index.html` 构建。
