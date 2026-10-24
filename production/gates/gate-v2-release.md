# Gate Check：Release Candidate → Release（v2.0）

> **Gate**: 发布前关卡（Production → Release / Release Candidate 验收）
> **Date**: 2026-10-19
> **Author**: design-docs
> **Project**: 《余烬之刃》v2.0
> **Template**: Gate Check（/gate-check）+ Release Checklist（简化版）
> **Release Candidate**: `index.html`（937,101 字节，2026-10-19 22:01:42；sha256 `60714292965A126A2DAEC440B639AAFAE8F6ACF6123DB1D84022790085948F89`，v2.0.2 最终构建；QA 复验前后一致）

---

## 1. Required Artifacts（发布必需产物）

| 产物 | 要求 | 状态 | 证据 |
| --- | --- | --- | --- |
| 发布构建 | 单文件 `index.html`，双击可玩，无外部资源 | ✅ | 937,101 字节（约 916 KB，22:01:42 构建，`__DEBUG.version=2.0.2`）；`node .dev/build.mjs` 产出；无 `/*__` 残留标记 |
| QA 执行报告 | 存在且结论明确 | ✅ | `production/qa/qa-report-v2.md`（v2.0.0：233 项，FAIL 0）+ `qa-report-v2.0.1.md`（v2.0.1：265 项，FAIL 0；附录 v2.0.2：47 项，FAIL 0） |
| 冒烟/关键路径证据 | CDP 自动化或人工记录 | ✅ | v2.0.2 证据：`production/qa/screenshots/v2.0.2-*`（翻滚中段/贴地/收剑）、`v2.0.1-*` 39 张、20+ 份实验 JSON、`.dev/qa/results/latest.json` |
| 玩家反馈修复 | 翻滚穿地/位移、敌人攻击预警 | ✅ | v2.0.1 修复翻滚与预警；v2.0.2 按 QA S4 关闭可见部件穿地；QA DODGE/TELE 全部 PASS |

## 2. Quality Checks

| 检查 | 结果 | 说明 |
| --- | --- | --- |
| 核心机制实现（祝福/弹反/处决/风格/Boss 二阶段/精英/爆裂者/掉落/无尽/设置/音频） | ✅ | 最终源码已核对；各 GDD 附录「实现对齐记录」逐项对应 |
| 主流程可玩（5 波 + Boss 二阶段 + 胜利） | ✅ | QA BOSS/WIN 套件 PASS：二阶段 48% 触发、六种攻击、胜利 S 结算 |
| 无尽模式（第 6 波起、每 5 波 Boss、纪录持久化） | ✅ | QA ENDLESS 套件 PASS：连续推进、纪录跨刷新只增不减、「再入无尽」 |
| 设置持久化（反转 Y/画质/灵敏度/音量） | ✅ | QA SET 套件 PASS：四项设置刷新后保持 |
| 赤红竞技场退出恢复 | ✅ | 实现与 QA 色值验证均通过（Boss 死亡/clearAll/startEndless 调用 `setCrimson(false)`） |
| 单文件离线可玩 | ✅ | 无网络请求、无外部资源、无 `file://` 限制的模块语法 |
| 体积/性能预算 | ✅（带环境注记） | 体积 910 KB ≤1 MB；无头 SwiftShader 7.7–8.1 FPS 为软渲染环境限制（WARN），建议真机 GPU 复核 |
| 文档与实现一致 | ✅ | 关键数值已回写（弹反 0.20s、处决 24%、Boss 820/968、无尽 11%/6.5%/16%、受击 -10 风格）；差异均已注明 |
| 本地化 | N/A | 单语言（简体中文）为 v2 明确范围 |
| 商店/法务/年龄分级 | N/A | 单文件离线实验项目，无商店分发 |
| 无 P0（崩溃/白屏/流程卡死） | ✅ | QA 全流程 0 控制台错误 / 0 未捕获异常 |
| 无 P1（阻断主流程） | ✅ | 233 项检查 FAIL 0；唯一 WARN 为环境性能 |

## 3. Blockers

无阻断项。QA 执行报告与跨刷新证据已归档（`production/qa/qa-report-v2.md`），发布前唯一建议为「真机 GPU 性能 + 音频听感」人工复核。

## 4. Known Issues / Accepted Deviations（记录，不阻断）

| # | 项 | 说明 | 处置 |
| --- | --- | --- | --- |
| K1 | ~~标题页操作说明缺 Q~~ | **已修复**：标题页含 `Q 格挡 · 精准弹反` 与 `1/2/3 选择回响` | 关闭 |
| K2 | 弹反窗口 0.18s（企划）→ 0.20s（实现） | 帧率/输入容错取舍 | 已回写 GDD，QA 按 0.20 验收 |
| K3 | 处决为「破绽常驻 + 即时斩杀」 | 无 4s 窗口/0.9s 独立动画 | 已记录差异 D3；列入 v2.1 体验提案 |
| K4 | 弹反不反弹弹幕（仅免伤+消除） | 设计缺口 | 已记录差异 D2；v2.1 提案 |
| K5 | 风格倍率不作用于势能（企划含势能） | 实现取舍 | 已记录差异 D5；作为平衡实验项 |
| K6 | ~~无尽死亡后不显示「再次无尽」按钮~~ | **已修复**：无尽死亡结算页显示「再 入 无 尽」，以新构筑回到第 6 波 | 关闭 |
| K7 | 无自动化单元测试框架 | 项目采用 CDP 无头验收（技术债） | 记录；不阻断本实验项目发布 |

## 5. Recommendations

1. **发布前必做**：由 qa-verifier 完成冒烟 + 关键路径 CDP 验收，产出 `production/qa/qa-report-v2.md`（PASS / 带条件 PASS / FAIL），并将报告路径回写本 Gate。
2. 若 QA 发现 S1/S2 缺陷：Lead 修复后重新构建 `index.html`，更新本 Gate 的构建指纹（文件大小/时间）并复验。
3. 建议人工试玩 1 局（10 分钟）：验证弹反手感（0.20s）与二阶段可读性；这是自动化无法替代的「手感」关卡。
4. 发布公告/更新说明可直接引用 README 的 v1 结构 + 本 Gate 的 v2 特性清单；无需商店素材。

## 6. Verdict

**PASS（v2.0.2 Release，附带发布后复核项）**

依据：
- 最终构建 `937,101 字节 / 916 KB / sha256 60714292… / __DEBUG.version=2.0.2` 在 QA 复验前后一致，单文件离线可玩。
- 全量验收基线（v2.0.0）：233 项 PASS 160 / FAIL 0；v2.0.1 全量：265 项 PASS 186 / FAIL 0；v2.0.2 聚焦 DODGE + 08 回归：47 项 PASS 32 / FAIL 0；全程控制台 0 error、`window.__ERRORS` 为空。
- 玩家实测反馈两项问题（翻滚穿地/位移异常、敌人攻击预警可读性）均已修复并通过专项验收；QA S4 观察项（可见部件穿地）已在 v2.0.2 关闭（可见 Mesh 最低 Y=+0.043~+0.066，收剑/归位正常）。
- 核心机制、主流程、无尽、纪录持久化、设置持久化、死亡/胜利/重开与 v1 回归全部通过。
- 唯一 WARN 为无头 SwiftShader 软渲染性能（7~8 FPS，环境限制，建议真机复核）。
- 设计/架构/UX/流程文档与最终源码对齐，差异逐项注明。

**放行条件（Conditions / 发布后建议）**：
1. 真机 GPU 复核性能上限与稳定性（无头软渲染不代表实机）。
2. 音频听感人工复核（无头环境静音）。
3. 真人试玩复核 S 级维持难度与结算评级阈值（自动化使用调试接口清怪，分数不代表真人）。
4. 已知设计差异（弹反窗口 0.20s、处决常驻破绽、弹反不反弹弹幕、风格倍率不作用于势能）作为 v2.1 体验提案记录，不阻断发布。

---

## 附录 A：证据索引

| 证据 | 路径 | 说明 |
| --- | --- | --- |
| 发布构建 | `index.html` | 937,101 字节，2026-10-19 22:01:42，sha256 60714292…，version 2.0.2 |
| 构建脚本 | `.dev/build.mjs` | 含 `/*__BLESSINGS__*/`，缺标记/残留标记校验 |
| 构建源码 | `.dev/src/*.js` | 7 模块 + util + three.min.js |
| QA 计划 | `production/qa/qa-plan-v2.md` | P0/P1 用例与准入/准出 |
| QA 报告 | `production/qa/qa-report-v2.md` + `qa-report-v2.0.1.md`（含 v2.0.2 附录） | 主验收 233 项 + v2.0.1 265 项 + v2.0.2 47 项，FAIL 均 0 |
| 试玩报告 | `production/playtests/playtest-v2.md` | 含 §12 v2.0.2 翻滚/预警体验观察 |
| QA 过程数据 | `production/qa/diagnostics/probe.json`、`.dev/qa/results/latest.json` | `__DEBUG` 能力表与逐项结果 |
| 试玩报告 | `production/playtests/playtest-v2.md` | 可玩性观察/平衡建议 |
| 设计基线 | `design/gdd/game-concept-v2.md` | v2 范围/支柱/风险 |
| 系统设计 | `design/gdd/*.md` | 6 份 GDD + 交叉评审 |
| 架构决策 | `docs/architecture/adr-00{1,2,3}-*.md` | 单文件/祝福/存档 |
| 控制清单 | `docs/architecture/control-manifest.md` | 必须做/禁止做 |
| 实施记录 | `production/sprints/sprint-v2.md` | 任务状态与风险 |
| 验收关卡 | `production/gates/gate-v2-concept.md`、`gate-v2-design.md` | 前序 Gate 结论 |
