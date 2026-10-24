# 《余烬之刃》v2.0 QA 验收报告

| 项目 | 内容 |
| --- | --- |
| 报告版本 | v2.0-FINAL |
| 测试日期 | 2026-10-19 20:33 – 21:16（Asia/Shanghai） |
| QA 负责人 | qa-verifier |
| 被测对象 | `D:\Bigfish工作区\50元做一款游戏\index.html`（单文件浏览器游戏） |
| 构建版本 | `__DEBUG.version = 2.0.0` |
| 构建指纹 | **size = 931,204 bytes；mtime = 2026-10-19 21:09:51；sha256 = `8CD795A8CED3878F2AF71E5506AC708D259ADC0B0DA6A006B8A5C3D87CD6468B`** |
| 构建一致性 | 测试前后 SHA-256 一致（`sha256AfterRun = 8CD795A8…D6468B`，`changedDuringRun = false`）→ 结果有效 |
| 测试方式 | 真实浏览器（无头 Chrome）+ CDP 自动化 + `window.__DEBUG` 白盒辅助 + 截图证据 |
| 正式结论 | **PASS_WITH_CONCERNS（0 失败；唯一 concern 为软件渲染环境的性能基线，需真机复核）** |

---

## 1. 结论摘要

在最终构建 `8CD795A8…` 上执行 **10 个套件、233 项检查**：

| 状态 | 数量 | 说明 |
| --- | --- | --- |
| PASS | **160** | 全部 P0/P1 功能用例通过 |
| FAIL | **0** | 无游戏侧功能失败 |
| WARN | 1 | `PERF-01b`：SwiftShader 软件渲染下帧率 7.7 FPS（环境限制，非游戏缺陷结论） |
| BLOCKED / SKIP / ERROR | 0 / 0 / 0 | — |
| INFO（诊断数据） | 72 | 用于报告与证据，不计入通过率 |
| 控制台错误/异常 | **0** | 全流程 `console.error` / `uncaught exception` / `window.__ERRORS` 均为空 |

**判定：PASS（带条件）** —— v2.0 功能验收通过；发布前唯一需补做的是**真机 GPU 性能 + 音频听感**的人工复核（无头 SwiftShader 与静音环境无法代表最终体验）。

与此前迭代相比，最终构建已修复 QA 发现的全部功能问题：
- **S3（已修复并复验）**：受击不扣风格分 → 最终构建 `damagePlayer` 命中路径新增 `addStyle(-10)`，实测受击前后风格分 46.6 → 36.6（-10），见 §7.1。
- 其余针对迭代的修正（Boss 突进 `attackKind=charge`、Ult 不回充势能、`skipToBoss` 立即生成、受击硬直可输入、自动化接口 `setAutoPause/pauseInfo/overlayVisible/uiState`）均已验证生效。

---

## 2. 测试环境

| 项 | 值 |
| --- | --- |
| OS | Windows |
| Node | v24.16.0 |
| 浏览器 | Chrome `--headless=new`，`C:\Program Files\Google\Chrome\Application\chrome.exe` |
| 渲染 | SwiftShader 软件 WebGL（`--enable-unsafe-swiftshader --use-angle=swiftshader`），1280×720 |
| 启动 URL | `file:///D:/…/index.html?qa`（`?qa` 关闭指针锁定丢失自动暂停，仅自动化用） |
| 音频 | 无头静音；仅验证音频状态/设置逻辑，不评价听感 |
| 指针锁定 | 无头环境不可用（`pointerlockerror`）；视角类用例通过 `__DEBUG.mouse/camera` 与内部相机状态做白盒验证 |
| 数据隔离 | 每轮独立临时 Chrome profile；`localStorage` 从空开始，持久化用例同一 profile 内刷新验证 |

工具：`.dev/qa/run-v2-qa.mjs`（零 npm 依赖，9 个套件）；原始数据 `.dev/qa/results/latest.json`、`.dev/qa/results/summary.md`；能力探针 `production/qa/diagnostics/probe.json`。

---

## 3. 套件执行结果

| 套件 | 覆盖 | 状态 | 检查数 | 截图 |
| --- | --- | --- | --- | --- |
| 00-probe 构建探针+标题/开始 | ENTRY / TITLE | PASS | 27 | 3 |
| 01-blessing 回响祝福 | BLESS | PASS | 20 | 2 |
| 02-parry-style-execute 格挡/弹反/风格/处决 | PARRY/STYLE/EXEC | PASS | 25 | 4 |
| 03-boss Boss 二阶段 | BOSS | PASS | 27 | 5 |
| 04-enemies-drops 爆裂者/精英/掉落 | BOMB/ELITE/DROP | PASS | 20 | 3 |
| 05-endless-persistence 无尽+纪录 | ENDLESS | PASS | 31 | 5 |
| 06-pause-settings 暂停/设置 | PAUSE/SET | PASS | 26 | 3 |
| 07-endings-console-perf 结算/控制台/性能 | END/WIN/CONSOLE/PERF | WARN（1 环境 WARN） | 27 | 4 |
| 08-regression-v1 v1 回归 | REG | PASS | 29 | 0（复用截图） |
| 99-console-global 全局控制台 | CONSOLE | PASS | 1 | — |

---

## 4. 功能验收明细

> 证据路径均相对工作区根目录；完整逐项结果见 `.dev/qa/results/latest.json` 与 `.dev/qa/results/checks-table.md`。
> 说明：v2 构建不提供公开“暂停设置/暂停面板”之外的隐藏界面，所有结论均基于真实 DOM/输入与 `state()` 可观测状态。

### 4.1 标题与开始（TITLE）— PASS
- 标题页渲染完整（标题、副标题、操作说明、最高纪录区 `#best-record`），无错误页；`#title-screen` 可见。
- 真实鼠标点击「开始战斗」→ 进入 `mode=blessing` 初始祝福 → 选择后进入 `playing` 并生成第 1 波敌人（`enemiesAlive > 0`，HUD 可见）。
- 证据：`production/qa/screenshots/v2-8cd795a8-00-probe-01-title.png`、`…-00-probe-03-wave1.png`

### 4.2 回响祝福（BLESS）— PASS（20/20）
- 初始三选一：`state().mode==='blessing'`，`blessingOptions` 为 3 个互不相同 id；DOM 渲染 3 张卡（含稀有度 class、名称、效果文本、风味文本、序号 1/2/3 提示）。
- 选择生效：`chooseBlessing` / 真实数字键 `1` 均可选择；0.45s 卡牌动画后回到 `playing`；`P.blessings` 记录、HUD `#blessing-list` 增加 chip。
- 波次间祝福：清波后约 1.6s 弹出 `mode=blessing`（实测 options：`perfectEcho / thorn / vigor`），可再次三选一并继续。
- 效果可验证：`giveBlessing('vigor')` 使 `maxHp` 100 → 125（+25，符合「不屈」）+ HUD 生命上限同步。
- 输入隔离：祝福界面按 ESC/Q 不会触发暂停或格挡（`mode` 保持 `blessing`，`parry.blocking=false`）。
- 证据：`v2-8cd795a8-01-blessing-02-blessing-initial.png`、`v2-8cd795a8-01-blessing-04-blessing-wave-end.png`

### 4.3 Q 格挡 / 精准弹反（PARRY）— PASS（7/7）
| 用例 | 期望 | 实测 |
| --- | --- | --- |
| PARRY-01 格挡状态 | 按住 Q → `state='block'`，HUD 技能位存在 | `playerState=block`、`blocking=true`、`#skill-parry` 存在 |
| PARRY-02 精准窗口 | 按下 Q 后窗口 >0 且 ~0.2s 内衰减 | 首帧 0.167s，300ms 后 0；GDD 0.18s 为设计值，0.20s 为 Lead 确认的预期手感 |
| PARRY-01b 减伤 | 格挡显著减伤 | 对照组 20 伤害 vs 格挡组 6 伤害（-70%），体力 99.8→83.8 |
| PARRY-03/04 精准弹反 | 窗口内被命中 → 完美弹反、敌人硬直、加分/加势/风格 | `parries 0→1`、敌人进入 `stagger`、得分 5328、势 86.1、HUD 显示「完美弹反」 |
| PARRY-05 输入链路 | 可在敌人攻击时序内按下 Q | 3 次尝试均可按下并触发 |
- 证据：`v2-8cd795a8-02-parry-style-execute-05-parry.png`、`…-05-parry-perfect.png`
- 诊断：`production/qa/diagnostics/parry-experiment.json`

### 4.4 风格评级 D→S（STYLE）— PASS
- 初始 D（points 4，HUD `D / ×1.00`）；连续攻击/击杀自然涨分（4 → 100）。
- 阈值与 HUD 同步：按 12/28/48/70 阈值切换 C/B/A/S，`state().style.rank` 与 HUD `#style-rank`、`#style-mul`、`#style-fill` 一致（S 时 ×1.50，100%）。
- 衰减：无事件 2.6s 后 ≈9/s；实测 100 → 46.6（9 秒）。
- 受击惩罚（本轮修复点）：受击后 -10 风格分，实测 46.6 → 36.6，同时 HP 100→95。
- 证据：`v2-8cd795a8-02-parry-style-execute-06-style-hud.png`；诊断：`style-experiment.json`

### 4.5 处决（EXEC）— PASS
- 非 Boss 敌人 HP 降至 15%（低于 18% 阈值）→ `e.executable=true`，敌人血条 `exec` 状态/处决提示出现。
- 近战命中触发处决：目标死亡，`executions 3→4`，玩家回血 66→72（+6），得分 +627（6009-5382）。
- 处决后模式/状态机正常（`mode=playing`）。
- 证据：`v2-8cd795a8-02-parry-style-execute-07-execute.png`；诊断：`execute-experiment.json`

### 4.6 Boss 二阶段（BOSS）— PASS（27/27）
| 用例 | 期望 | 实测 |
| --- | --- | --- |
| BOSS-01 Boss 生成/HUD | 血条可见、名称正确 | `#boss-bar` 可见，名称「无面守望者」 |
| BOSS-02 一阶段行为 | 有主动攻击 | 观察到 `sweep3/overhead/slam/summon` 等 |
| BOSS-03 二阶段触发 | HP ≤50% 触发 | 触发时 `hpRatio=0.48`、`bossPhase2=true`、HUD「回响形态 · 第 2 阶段」、名称「回响之主」 |
| BOSS-03b 阈值 | 50%±2% | 0.48 ✔ |
| BOSS-03c 25% 狂怒 | `bossEnraged=true`、名称「终焉守望者」 | ✔（HUD「终焉形态」） |
| BOSS-04 赤红环境 | `W.setCrimson(true)`、颜色显著变化 | 背景 `#05070d→#160409`、雾 `#05070d→#24060a`、灯光转赤红（Hemisphere `#8a4a5a`、Directional `#ff9a88` 等），`crimson=true` |
| BOSS-05 音乐/HUD | 二阶段音乐 | `audio.musicMode: boss → boss2`，HUD 阶段名更新 |
| BOSS-06 剑雨 | `swordrain` 出现 | 观察到 `swordrain`（windup/attack/recover 全周期） |
| BOSS-07 三连冲击波 | `shock3` 出现 | 观察到 `shock3` |
| BOSS-08 突进 | `charge` 出现 | 观察到 `charge`（最终构建改名生效） |
| BOSS-09 二阶段可输出 | 伤害正常 | HP 212.96 → 162.96 |
| BOSS-10 击败→胜利 | 进入 victory 结算 | `mode=victory`、`endShown=true`、结算评级 S |
- 二阶段 120s 内六种攻击均出现：`swordrain / summon / overhead / charge / shock3 / sweep3`（见 `production/qa/diagnostics/boss-experiment.json`）。
- 证据：`v2-8cd795a8-03-boss-08-boss-phase1.png`、`…-09-boss-phase2-crimson.png`、`…-10-boss-attack-*.png`、`…-18-victory-end.png`

### 4.7 精英词缀 / 爆裂者 / 掉落（BOMB·ELITE·DROP）— PASS（20/20）
- 精英（`spawnElite` 三种词缀均可生成）：
  - `shield`：HP 78（46×1.7）、`shieldHits=1`、有光环；`fury`：HP 69（×1.5）、`speedMul=1.15`；`swift`：HP 62（×1.35）、`speedMul=1.4`。
  - 均带 `elite/eliteKind` 标识与受击/击杀表现；击杀必有掉落（`guaranteedDrop`，实测拾取到 momentum/生命恢复）。
- 爆裂者：`windup 0.85s` + 地面预警圈 + `detonate` 音效触发；自爆消失并对范围内玩家造成 26 伤害；自爆生成 momentum 掉落。
- 掉落：`spawnPickup('heal')` / `('momentum')` 可生成并被磁吸拾取；治疗 +10 HP、势能 +18；拾取后对应实体从场上移除。
- 证据：`v2-8cd795a8-04-enemies-drops-11-elite.png`、`…-12-detonator.png`、`…-13-drop.png`；诊断：`elite.json / detonator.json / drops.json`

### 4.8 无尽模式与最高纪录持久化（ENDLESS）— PASS（31/31）
- 入口：剧情胜利结算页出现「无 尽 回 响」按钮，点击后 `S.endless=true`、从第 6 波开始；`#endless-btn` 文案与状态正确。
- 波次持续：连续清波推进超过第 5 波，实测到达第 9 波（第一局）与第 11 波（第二局）。
- 无尽 HUD：`无尽 · 第 N 波` 标识；无尽结算标题「回 响 止 步」、评级按波次（第 9 波 → B）。
- 最高纪录：结束写入 `localStorage['emberblade_best_v2']`（`endlessBest=9`、`bestScore=1,082,261`、`endlessLast=9`），结算页显示「历史最高得分…◆ 新纪录」；刷新后标题页显示「最高纪录 · 得分 1,082,261 · 无尽 第 9 波 · 通关 1 次」，storage 保持一致。
- 新纪录只增不减：第二局第 11 波后 `endlessBest 9→11`。
- 「再 入 无 尽」：无尽死亡结算按钮可返回初始祝福并重新进入第 6 波（`S.endless=true`, `wave>=6`）。
- 损坏存储容错：写入非法 JSON 后刷新，游戏仍正常启动、无错误页（坏数据被忽略）。
- 证据：`v2-8cd795a8-05-endless-persistence-14-endless-entry.png`、`…-14-endless.png`、`…-15-record.png`、`…-14-endless-restart.png`、`…-15-record-after-reload.png`；诊断：`endless-progress.json / endless-finish.json / endless-after-reload.json`
- 备注：测试中通过 `killAll/damagePlayer` 推进，到达波次与得分不代表真人难度曲线（见试玩报告）。

### 4.9 暂停与设置（PAUSE·SET）— PASS（26/26）
- ESC 暂停：`mode=paused`、暂停面板可见（等待淡入）、游戏 `elapsed` 冻结（2.03→2.03，暂停期间推进 1s 不变）；继续/重开/返回标题均正常（重开后第 1 波、满血）。
- 反转 Y：勾选后 `settings().invertY` false→true；`__DEBUG.mouse(0,120)` 的 pitch 增量方向反转（-0.153 ↔ +0.153，行为级验证）。
- 灵敏度：0.3 → 2.0 时同样鼠标输入的 yaw 增量 0.0459 → 0.306（约 6.7 倍），设置值同步。
- 音量：滑条 0 → `audio.volume=0`（master gain≈0.05 平滑中）；100 → `volume=1`（gain≈0.93）；音效触发无异常。
- 画质：`auto→low` 后 `renderer.pixelRatio 1→0.75`、`shadowMap true→false`、渲染尺寸 1258×622→943×466，实际生效。
- 持久化：`localStorage['emberblade_settings_v2'] = {sens:1.2, volume:0.55, invertY:false, quality:'low'}`；刷新后 UI 值与 `settings()` 完全一致。
- 证据：`v2-8cd795a8-06-pause-settings-16-pause-settings.png`、`…-16-settings-quality.png`、`…-16-pause-settings-after-reload.png`；诊断：`settings-*.json`

### 4.10 死亡 / 胜利 / 重开（END·WIN）— PASS
- 死亡：HP 归零 → `mode=dead`、结算页出现（`endShown=true`、可见），标题「余 烬 熄 灭」、评级 D，统计项（得分/用时/击破/最高连击）完整；最佳纪录写入 localStorage。
- 再战一次：回到第 1 波新局；返回标题正常。
- 胜利：击败 Boss → `mode=victory`、结算页标题「逃 出 生 天」、评级 S（测试用调试击杀，分数/评级不代表真人结算）、纪录与「无 尽 回 响」入口显示。
- 胜利后重开：第 1 波干净新局，`bossPhase2/bossEnraged/endless` 全部重置。
- 证据：`v2-8cd795a8-07-endings-console-perf-17-death-end.png`、`…-18-victory-end.png`

### 4.11 v1 功能回归（REG）— PASS（29/29）
- 轻斩三段连击命中、连击数与得分增长；重斩消耗体力（100→70）；闪避无敌帧内不受伤害（对照组无无敌帧正常受伤）；剑气（E）生成投射物/进入冷却；烬灭（F）释放时势能 100→0 且造成范围伤害；饮烬（R）回复 40 HP 且药剂 3→2；Tab 锁定/解除；清波后自动进入下一波（含祝福流程）；暂停面板原有控件（灵敏度/音量/重开/返回标题）全部存在。
- 全程控制台零错误。

### 4.12 控制台与稳定性（CONSOLE）— PASS
- 全量运行期间 `Runtime.exceptionThrown` / `console.error` / `Log.entryAdded(error)` 计数 **0**；`window.__ERRORS.length === 0`；未出现 `#error-screen`。
- 60s 逻辑推进稳定性：`elapsed=62.18`、实体数正常、无内部错误（诊断 `PERF-03a`）。

### 4.13 性能粗测（PERF）— WARN（环境限制，不作为失败）
| 场景 | 帧数/时长 | 平均 FPS | 平均帧 | p95 | 最大帧 |
| --- | --- | --- | --- | --- | --- |
| 战斗（18 敌人） | 31 / 4.0s | 7.7 | 129.6ms | 145.5ms | 151.6ms |
| Boss 二阶段 | 33 / 4.1s | 8.1 | 123.3ms | 133.3ms | 133.3ms |
- 结论：无 >1500ms 超长冻结帧、无崩溃；但 SwiftShader 软件渲染 FPS 低（7–8），**不能代表真机 GPU 表现**。发布前需在真实 Chrome/GPU 上人工复核帧率与手感（建议 1080p 战斗中 ≥50 FPS、Boss 二阶段 ≥40 FPS，作为参考目标）。
- 证据：`v2-8cd795a8-07-endings-console-perf-19-perf-combat.png`、`…-19-perf-boss.png`；诊断：`perf-combat.json / perf-boss2.json`

---

## 5. 证据清单

### 5.1 截图（30 张，`production/qa/screenshots/`，前缀 `v2-8cd795a8-`）
- 标题/开局：`00-probe-01-title.png`、`00-probe-02-blessing-initial.png`、`00-probe-03-wave1.png`
- 祝福：`01-blessing-02-blessing-initial.png`、`01-blessing-04-blessing-wave-end.png`
- 战斗机制：`02-parry-style-execute-05-parry.png`、`…-05-parry-perfect.png`、`…-06-style-hud.png`、`…-07-execute.png`
- Boss：`03-boss-08-boss-phase1.png`、`…-09-boss-phase2-crimson.png`、`…-10-boss-attack-{1..3}-*.png`、`…-18-victory-end.png`
- 敌人/掉落：`04-enemies-drops-11-elite.png`、`…-12-detonator.png`、`…-13-drop.png`
- 无尽/纪录：`05-endless-persistence-14-endless-entry.png`、`…-14-endless.png`、`…-15-record.png`、`…-14-endless-restart.png`、`…-15-record-after-reload.png`
- 暂停/设置：`06-pause-settings-16-pause-settings.png`、`…-16-settings-quality.png`、`…-16-pause-settings-after-reload.png`
- 结算/性能：`07-endings-console-perf-17-death-end.png`、`…-18-victory-end.png`、`…-19-perf-combat.png`、`…-19-perf-boss.png`

### 5.2 结构化数据（`production/qa/diagnostics/`）
`probe.json`（`__DEBUG` 能力表/DOM/存储）、`parry-experiment.json`、`style-experiment.json`、`execute-experiment.json`、`boss-experiment.json`、`detonator.json`、`elite.json`、`drops.json`、`endless-progress.json`、`endless-finish.json`、`endless-after-reload.json`、`settings-*.json`、`perf-*.json`、`index-at-probe.html`（测试时构建只读副本）。

### 5.3 机器结果
`.dev/qa/results/latest.json`（逐 check 状态/detail/evidence）、`.dev/qa/results/summary.md`、`.dev/qa/results/checks-table.md`。

---

## 6. 缺陷与问题记录

### 6.1 未关闭缺陷
**无。** 最终构建 `8CD795A8…` 上 0 FAIL、0 BLOCKED；无 S1/S2/S3 未关闭问题。

### 6.2 已修复并复验（历史构建发现）
| 编号 | 级别 | 问题 | 状态 |
| --- | --- | --- | --- |
| QA-ITER1-01 | S3 | 受击不扣风格分（GDD §4.4 规定 -10，旧构建 `damagePlayer` 无 `addStyle(-10)`，只发生自然衰减） | **已修复**：最终构建受击实测 46.6→36.6（-10），HP 100→95，见 `style-experiment.json`/STYLE-03b PASS |

### 6.3 环境限制（非游戏缺陷）
1. SwiftShader 软件渲染 7–8 FPS → 真机 GPU 性能需人工复核。
2. 无头环境指针锁定不可用、音频静音 → 真实鼠标手感与音频听感需人工试玩。
3. 自动化用 `?qa` 关闭“指针锁定丢失自动暂停”，真机需人工确认该自动暂停逻辑符合预期。
4. 测试通过调试接口击杀 Boss/清波，结算分数与评级（如胜利 S、无尽 9 波 B）**不代表真人正常流程**，评分平衡需真机试玩复核。

---

## 7. 设计与实现差异（已确认可接受/仅记录）

| 项 | GDD | 实现（最终构建） | 处理 |
| --- | --- | --- | --- |
| 精准弹反窗口 | 0.18s | 0.20s | Lead 明确 0.20 为预期手感，接受 |
| 受击风格惩罚 | -10 | -10（最终构建已对齐） | 已修复复验 |
| 格挡体力消耗 | max(8, 伤害×0.8) | max(8, 伤害×0.8)（最终构建已对齐） | 已验证（20 伤害→16 体力） |
| 完美弹反风格 | +12 | +12（最终构建已对齐） | 已验证 |
| Boss 突进内部名 | `charge` | `charge`（最终构建已统一） | BOSS-08 PASS |
- 另：源文档 `parry-style-system.md` 中的部分旧数值（窗口 0.18 等）与最终实现存在差异，建议 design-docs 侧同步更新文档以免后续误读。

---

## 8. 发布建议

1. **可发布（功能维度）**：所有 v2.0 新增系统与 v1 回归在主流程、持久化、控制台稳定性上均通过真实浏览器验证。
2. **发布前建议补做（非阻断）**：
   - 真机 GPU（Chrome/Edge 最新版）FPS 与手感复核；若低于目标，优先检查画质自动降级是否生效；
   - 人工试玩 1–2 局完整剧情 + 1 局无尽，复核难度曲线、S 级维持难度、结算评级阈值；
   - 音频（音乐/音效）听感复核（无头环境无法评价）。
3. 若后续再构建，请按本报告 §1 的构建指纹核对；任何 `index.html` 变更后需重跑全量（脚本已内置运行前后 SHA-256 校验，变更会自动判定结果作废）。

---

## 9. 签署

- QA 执行：qa-verifier（自动化全量 + 截图/数据复核）
- 结论：**PASS（带条件，条件均为环境/人工复核项）**
- 报告路径：`production/qa/qa-report-v2.md`
- 原始结果：`.dev/qa/results/latest.json`、`.dev/qa/results/summary.md`
- 试玩报告：`production/playtests/playtest-v2.md`
