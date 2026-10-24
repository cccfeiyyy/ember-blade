# 《余烬之刃》v2.0.1 修复构建 · 聚焦复验报告（Addendum）

| 项目 | 内容 |
| --- | --- |
| 报告类型 | v2.0 主报告 `qa-report-v2.md` 的修复构建附录 |
| 报告日期 | 2026-10-19 21:43 – 21:57（Asia/Shanghai） |
| QA 负责人 | qa-verifier |
| 被测构建 | **`index.html` v2.0.1** |
| 构建指纹 | size = **936,695 B**；mtime = **2026-10-19 21:42:44**；sha256 = **`BB92E66C98A7C48273B439FE3C4BD194909382F6D14D370319F0368E50E24C68`**；`__DEBUG.version = 2.0.1` |
| 构建一致性 | 运行前/后 SHA-256 一致（`changedDuringRun=false`）→ 结果有效 |
| 复验范围 | 按 Lead 要求聚焦 **02/03/04/08 + 新增 DODGE/TELE 用例**；额外补跑全量 10 套件确认无回归 |
| **结论** | **PASS_WITH_CONCERNS（0 FAIL；唯一 WARN 为软件渲染环境性能；新增 1 个非阻断 S4 视觉观察项，见 §6）** |

---

## 1. 本轮复验结果总览

在最终 v2.0.1 构建上执行全量 10 套件（含新增 `09-dodge-telegraph`）：

| 状态 | 数量 |
| --- | --- |
| PASS | **186** |
| FAIL | **0** |
| WARN | 1（`PERF-01b`：SwiftShader 7.3 FPS，环境基线） |
| BLOCKED / SKIP / ERROR | 0 / 0 / 0 |
| INFO（诊断数据） | 78 |
| 控制台错误 / 未捕获异常 | **0**（`window.__ERRORS` 为空） |
| 检查总数 | 265（11 个"套件"，含全局控制台检查） |

套件结果：00/01/02/03/04/05/06/08/09 全部 PASS；07 WARN（1 环境性能）。相比 v2.0.0 主报告：
- 02/03/04/08 无回归；
- 05/06/07 也一并复跑通过（更强于 Lead 要求的聚焦范围）；
- 03 新增可复现的 `charge`/`swordrain` 攻击截图（本轮观测窗口内 6 种攻击均出现）。

---

## 2. 新增用例 DODGE-01：翻滚修复验证 — **PASS**

数据来源：`production/qa/diagnostics/dodge-experiment.json`，截图 `production/qa/screenshots/v2.0.1-09-dodge-telegraph-20-dodge.png`。

| Check | 期望 | 实测（4 个朝向：+z / +x / -z / 对角） |
| --- | --- | --- |
| DODGE-01a 位移 | 无祝福 ≈3.00m | **全部 = 3.000m**（`finalDist=3`） |
| DODGE-01 不穿地（头/膝） | 翻滚全程及结束后 0.5s 头部/膝部世界 Y ≥ 0 | **头部最低 Y = 0.142；膝部最低 Y = 0.388**（四方向一致，均 >0） |
| DODGE-01b 无敌帧 | 存在（0.02~0.28s） | 15 帧，**0.017s – 0.25s** |
| DODGE-01c 结束归位 | idle，无残留旋转/缩放/抬升 | 四方向均为 `state=idle, rotX=0, rotY=0, posY=0, scaleX=1, scaleY=1` |
| DODGE-01d 基准对照 | 站立头/膝高于地面 | 头 1.65–1.67、膝 0.53–0.55（正常） |

结论：Lead 自测口径（3.00m、头 minY 0.142、膝 minY 0.388、不穿地、归位）**全部复现通过**，此前的"2π 反向插值回落穿地"未再出现。

> 补充观察（S4，非失败项）：用整模型 AABB 检查时，翻滚最大翻转阶段（t≈0.10–0.14s）仍有非头/膝部件（披风/护甲饰件等 Mesh 与地面 blob 阴影 Sprite）短暂低于 y=0，最低约 -0.50（阴影 Sprite 的方形几何贴地时天然为负）。头/膝满足验收；是否可见需真机确认。详见 `production/qa/bugs/bug-002-roll-part-clipping.md`。

---

## 3. 新增用例 TELE-01：攻击预警修复验证 — **PASS**

数据来源：`production/qa/diagnostics/telegraph-experiment.json`、`boss-swordrain-telegraph.json`，截图 `…-09-dodge-telegraph-21-telegraph.png`、`…-21-boss-swordrain-telegraph.png`。

| Check | 期望 | 实测 |
| --- | --- | --- |
| TELE-01a 基线 | 无残留 telegraph | 0 组 |
| TELE-01 石卫 windup 出现 telegraph | 场景存在 `name==='telegraph'` 组 | 1 组（位置跟随石卫） |
| TELE-01b 白色范围底/描边 | 白色材质 | 2 个白色 Mesh（`#ffffff` ×2，opacity 0.5/0.12） |
| TELE-01c 红色蓄力填充 | 红色填充 | 1 个红色 Mesh（`#ff2a1a`，`fillProgress` 随蓄力增长） |
| TELE-01d 石卫预警半径 | ≈4.0m（与判定一致） | **4.00m** |
| TELE-01e 红填充递增 | 随蓄力扩大 | `fillProgress 0.25 → 0.333`（windup 内递增，末段脉冲） |
| TELE-01f 攻击结束清理 | 0 组残留 | 0（含 flash 110ms 后清理） |
| TELE-01g/h/i/j 蚀影扇形 | 白底+红填充、半径 ≈3.0、状态一致 | 1 组，白2红1（`#ff2f7a`），半径 **3.00m**，`state().enemies` 同步为 `windup` |
| TELE-01k 蚀影结束清理 | 0 组 | 0 |
| TELE-01l `clearAll()` 清理未结束预警 | 0 组 | 清理前 1 → 清理后 **0** |
| TELE-01m Boss 剑雨预警 | 存在 ≈2.9m 圆环 | 5 组落点圆环，全部半径 **2.90m** |
| TELE-01n 剑雨落点半径 | ≈2.9m | `[2.9, 2.9, 2.9, 2.9, 2.9]` |
| TELE-01o 状态一致 | `state().bossAttack==='swordrain'`、`bossState==='windup'` | 完全一致（phase2=true，HP 48%） |
| TELE-01p 剑雨结束清理 | 0 组 | 结束后 0；额外等待后仍 0 |
| TELE-01q 收尾 | `clearAll()` 后 0 组 | 0 |

补充：本轮 03-boss 套件在 180s 观察窗口内完整观测到 `sweep3 / overhead / summon / shock3 / swordrain / charge` 六种攻击；截图新增 `charge`、`swordrain`、`shock3` 等（`production/qa/screenshots/v2.0.1-03-boss-10-boss-attack-*-{overhead,sweep3,swordrain,charge,shock3}.png`），再次确认 `charge` 命名与突进可观测性。

---

## 4. 回归确认（02/03/04/08 + 全量）

| 套件 | 检查 | 结果 | 备注 |
| --- | --- | --- | --- |
| 00-probe | 27 | PASS | 标题/开始/初始祝福/首波，`__DEBUG.version=2.0.1` |
| 01-blessing | 20 | PASS | 祝福流程未受本轮改动影响 |
| 02-parry-style-execute | 25 | PASS | 格挡/精准弹反/风格 D→S/衰减/受击 -10/处决全部通过 |
| 03-boss | 29 | PASS | 50% 二阶段、赤红、boss2、25% 狂怒、六种攻击、胜利结算 |
| 04-enemies-drops | 20 | PASS | 精英三词缀/爆裂者/掉落拾取 |
| 05-endless-persistence | 31 | PASS | 无尽/纪录/持久化/再入无尽/坏存储容错 |
| 06-pause-settings | 26 | PASS | 暂停/反转Y/画质/灵敏度/音量/持久化 |
| 07-endings-console-perf | 27 | WARN | 死亡/胜利/重开均 PASS；仅环境性能 WARN（7.3/7.4 FPS，SwiftShader；无超长冻结帧结论不变） |
| 08-regression-v1 | 29 | PASS | 连击/重击/闪避无敌帧/剑气/烬灭/饮烬/锁定/波次/暂停控件，无回归 |
| 09-dodge-telegraph（新增） | 30 | PASS | DODGE-01 / TELE-01 全部通过 |

控制台：全程 **0 error / 0 uncaught exception / `window.__ERRORS` 为空**。

---

## 5. 本轮改动验证映射（Lead 自测项 → QA 复验）

| Lead 自测/改动 | QA 复验结果 |
| --- | --- |
| 翻滚动画绕身体中心 + 抬升补偿，任何角度不入地（头/膝 >0） | 头 minY **0.142**、膝 minY **0.388**，四方向一致 → PASS（整模型非头/膝部件见 S4 观察） |
| 翻滚结束立即归位（修 2π 反向插值穿地） | 结束 `state=idle`、rot/pos/scale 精确归零 → PASS |
| 位移精确 3.0m（祝福可延长） | 无祝福四方向均为 **3.000m** → PASS |
| 无敌帧 0.02~0.28s | 实测 **0.017–0.25s** → PASS |
| 白色攻击范围底 + 白色描边 + 红色蓄力填充 | 所有预警组均含 2 白 + 1 红材质（`#ffffff` + 红填充）→ PASS |
| 预警范围与实际判定对齐（石卫 4.0m / 蚀影 3.0m / 剑雨 2.9m） | 实测半径 **4.00 / 3.00 / 2.90m** → PASS |
| 红色填充随蓄力推进、末段脉冲 | `fillProgress` 0.25→0.333 递增；opacity 0.12→0.33 → PASS |
| 攻击结束/`clearAll()`/切换波次/重开清理预警 | `clearAll` 前后 1→0；攻击结束 0；切场景后 0 → PASS |
| 版本号 2.0.1 | `__DEBUG.version=2.0.1` → PASS |
| 新截图 screenshots/06-dodge.png、07-telegraph.png | （属 README/产物，不由 QA 覆盖；QA 已另存 39 张 v2.0.1 证据截图） |

---

## 6. 缺陷与观察项

- **未关闭阻断/严重/一般缺陷：0**
- **新增 S4（非阻断，视觉观察项）**：`bug-002-roll-part-clipping.md` — 翻滚时头/膝符合验收（>0），但整模型 AABB 显示部分非核心部件与地面装饰阴影在翻转峰值短暂低于 y=0（最低约 -0.50，其中阴影 Sprite 的方形几何贴地天然为负）。不影响操作/判定/无敌帧/位移；建议真机视角确认是否可见，若不可见可作为可接受表现。
- 历史 S3（受击不扣风格分）在 v2.0.1 仍保持修复（02 套件 STYLE-03b PASS：46.6→36.6）。
- 环境限制同主报告：SwiftShader 7.3/7.4 FPS 不代表真机；无头无音频/指针锁定；调试接口分数不代表真人。

---

## 7. 证据与产物

- 最终结果（v2.0.1 全量）：`.dev/qa/results/latest.json`（265 checks / 0 FAIL）、`.dev/qa/results/summary.md`
- v2.0.1 截图（39 张，前缀 `v2.0.1-`）：`production/qa/screenshots/`
  - 新增重点：`v2.0.1-09-dodge-telegraph-20-dodge.png`、`21-telegraph.png`、`21-boss-swordrain-telegraph.png`
  - Boss 攻击：`v2.0.1-03-boss-10-boss-attack-{1..5}-{overhead,sweep3,swordrain,charge,shock3}.png`
- v2.0.1 诊断：`production/qa/diagnostics/{dodge-experiment,telegraph-experiment,boss-swordrain-telegraph,probe}.json` 等
- v2.0.0 归档（保留，勿覆盖）：`production/qa/screenshots/v2-8cd795a8-*`（30 张）、`production/qa/diagnostics-v2.0.0/`、`.dev/qa/results/latest-v2.0.0.json`
- 主报告：`production/qa/qa-report-v2.md`；试玩：`production/playtests/playtest-v2.md`（含 v2.0.1 补充）

---

## 8. 结论与建议

- **v2.0.1 修复构建：PASS（带条件）**。两个玩家反馈问题（翻滚穿地/归位、攻击预警可读性与判定对齐）均按 Lead 验收口径复验通过；02/03/04/08 及全量 10 套件无功能回归，控制台零错误。
- 建议：发布前补做真机 GPU 性能与音频听感人工复核；真机确认翻滚时非核心部件穿插是否可见（S4）；如 release gate 要求，本报告可作为 v2.0 主报告的最终构建附录使用。
- 本轮未发现阻断/严重问题，无需再次构建。

---

# 附录：v2.0.2 修复构建复验（bug-002 S4 关闭）

| 项目 | 内容 |
| --- | --- |
| 构建 | size **937,101 B** / mtime **2026-10-19 22:01:42** / sha256 **`60714292965A126A2DAEC440B639AAFAE8F6ACF6123DB1D84022790085948F89`** / `__DEBUG.version = 2.0.2` |
| 构建一致性 | 运行前/后 SHA-256 一致（`changedDuringRun=false`）→ 结果有效 |
| 复验范围 | 按 Lead 要求**只复验 DODGE**（新增 `10-dodge-v202` 套件）+ 复跑 08 回归确认无副作用；未重跑 01/03/04/05/06/07/09 |
| 结果 | **PASS**：08-regression-v1（29 checks）+ 10-dodge-v202（17 checks）+ 全局控制台（1）= 47 checks，**PASS 32 / FAIL 0 / WARN 0 / SKIP 0**；控制台 0 error / `window.__ERRORS` 为空 |
| S4 状态 | **CLOSED（已修复并复验）**，详见 `production/qa/bugs/bug-002-roll-part-clipping.md` |

## A.1 v2.0.2 改动验证映射

| Lead 改动 | QA 复验结果 |
| --- | --- |
| 翻滚抬升 `lift = L·sin(θ/2) + 0.95·|sin(θ)|` + 横向 0.9 收束 | 可见 Mesh 不穿地：四方向最低 Y **0.043 / 0.045 / 0.058 / 0.063**（≥0）；头部最低 **0.363**、膝部 **0.527–0.547**（与 Lead 自测 0.066/0.363/0.528 同量级且均 >0） |
| 翻滚中段（t∈0.045–0.39）隐藏长剑，结束/非翻滚立即恢复 | 翻滚前 `sword.visible=true`；中段 t≈0.20 为 `false`（25 个翻滚采样中 21 个隐藏）；结束后 `true`；结束归位精确（state=idle、rot/pos/scale 归零） |
| 版本号 2.0.2 | `__DEBUG.version=2.0.2` → PASS |
| 位移仍应为 3.00m | 四方向基础位移均 **3.000m**（祝福 `dodgeDistMul` 归一后验证；此前若选中「疾风」等祝福位移会按 ×1.12 变为 3.36m，属设计内行为） |
| 无控制台错误 | 0 error / 0 exception |

## A.2 复验口径修正

按 Lead 要求，AABB 断言**跳过不可见对象**：遍历 `P.model.root` 的 Mesh 时，若对象自身或任一祖先 `visible===false` 则跳过；使用 `geometry.boundingBox.clone().applyMatrix4(matrixWorld)` 计算可见 Mesh 世界 Y。从而排除「设计上隐藏的长剑」与「贴地 blob 阴影 Sprite（方形几何天然为负，不可见）」的误报。

## A.3 详细结果（10-dodge-v202）

| Check | 结果 |
| --- | --- |
| VER-01 `__DEBUG.version=2.0.2` | PASS |
| DODGE-01a 四方向位移 3.000m | PASS |
| DODGE-01b 可见 Mesh 全程 minY ≥ 0（四方向 0.043–0.063，offenders 空） | PASS |
| DODGE-01b-mid 翻滚中段（t=0.20）可见 Mesh minY = **0.185** | PASS |
| DODGE-01c 结束 idle + 无残留旋转/缩放/抬升 | PASS |
| DODGE-01d 站立基准可见 Mesh/头/膝均 >0 | PASS |
| DODGE-01e 长剑：前可见 → 中段隐藏 → 结束恢复 | PASS |
| DODGE-01f 中段收剑 `sword.visible=false` | PASS |
| DODGE-01g 头部/膝部 ≥0（头 0.363、膝 0.527–0.547） | PASS |
| DODGE-01h 无敌帧 0.017–0.25s | PASS |
| ERR-01/02 控制台零错误 | PASS |
| 08 回归（连击/重击/闪避无敌帧/剑气/烬灭/饮烬/锁定/波次/暂停控件） | PASS（29/29） |

## A.4 证据

- 结果（v2.0.2 聚焦）：`.dev/qa/results/latest.json`（47 checks / 0 FAIL；v2.0.1 全量归档 `.dev/qa/results/latest-v2.0.1.json`）
- 诊断：`production/qa/diagnostics/dodge-v202-experiment.json`、`dodge-midframe.json`
- 截图（前缀 `v2.0.2-`）：`production/qa/screenshots/v2.0.2-10-dodge-v202-20-dodge-midroll.png`（翻滚中段：可见 Mesh 不穿地 + 长剑隐藏）、`…-20-dodge-v202.png`（结束后恢复）
- 归档：v2.0.0 → `diagnostics-v2.0.0/`、`latest-v2.0.0.json`；v2.0.1 → `diagnostics-v2.0.1/`、`latest-v2.0.1.json`、`screenshots/v2.0.1-*`（39 张）

## A.5 结论

- **v2.0.2：PASS**。S4（翻滚非核心部件/阴影短暂低于地面）按修正口径复验通过并关闭：可见 Mesh 全程不穿地、长剑中段收纳且结束恢复、位移 3.00m、归位精确、无敌帧正常、无控制台错误；08 回归无副作用。
- 未发现新增阻断/严重/一般问题；无需再次构建。发布前仍建议真机 GPU 性能与音频听感人工复核。

