# bug-002（已关闭 · S4 轻微）：翻滚期间部分模型部件/地面阴影短暂低于地面

| 字段 | 内容 |
| --- | --- |
| 编号 | bug-002 |
| 严重级别 | S4（轻微，非阻断；视觉穿插观察项） |
| 状态 | **CLOSED（已修复并复验）** |
| 发现构建 | `BB92E66C98A7C48273B439FE3C4BD194909382F6D14D370319F0368E50E24C68`（v2.0.1） |
| 修复/复验构建 | `60714292965A126A2DAEC440B639AAFAE8F6ACF6123DB1D84022790085948F89`（v2.0.2） |
| 模块 | 玩家动作 / 翻滚（DODGE-01） |
| 环境 | Windows Chrome 无头 + SwiftShader |
| 发现/关闭日期 | 2026-10-19 / 2026-10-19 |

## 原始问题（v2.0.1）

头/膝验收通过（头 0.142 / 膝 0.388 >0，位移 3.00m），但整模型 AABB 显示翻滚翻转峰值时部分非头/膝部件与地面 blob 阴影短暂低于 y=0（约 -0.16 ~ -0.50）。

## v2.0.2 修复内容（Lead）

- 翻滚增加角度相关抬升补偿：`lift = L·sin(θ/2) + 0.95·|sin(θ)|`，视觉横向 0.9 收束；
- 翻滚中段 `t∈(0.045, 0.39)` 暂时隐藏长剑（`P.model.sword.visible=false`），结束/受击/死亡等非翻滚状态立即恢复。

## 复验口径修正（按 Lead 要求）

AABB 断言**跳过不可见对象**（自身或任一祖先 `visible===false` 的 Mesh 不计入），并按可见 Mesh 几何包围盒计算世界 Y；同时验证收剑与恢复。这样不会把「设计上隐藏的长剑」与「贴地阴影 Sprite」误算为穿地。

## 复验结果（v2.0.2，PASS）

数据来源：`production/qa/diagnostics/dodge-v202-experiment.json`、`dodge-midframe.json`；截图 `production/qa/screenshots/v2.0.2-10-dodge-v202-20-dodge-midroll.png`、`…-20-dodge-v202.png`。

| 检查 | 结果 |
| --- | --- |
| 基础位移（四方向，祝福倍率归一） | 全部 **3.000m** |
| 可见 Mesh 最低世界 Y（翻滚+结束后 0.5s） | **0.043 / 0.045 / 0.058 / 0.063**（四方向，均 ≥0；offenders 空） |
| 头部最低 Y | **0.363**（四方向一致，与 Lead 自测一致） |
| 膝部最低 Y | **0.527 – 0.547**（与 Lead 自测 0.528 一致） |
| 翻滚中段（t≈0.20）可见 Mesh 最低 Y / 长剑 | **0.185** / `sword.visible=false`（收剑生效） |
| 长剑可见性 | 翻滚前 true → 中段 21/25 采样为 false → 结束后 true（立即恢复） |
| 结束归位 | state=idle；rotX/rotY=0、posY=0、scaleX/scaleZ=1（四方向） |
| 无敌帧 | 0.017–0.25s（15 帧） |
| 站立基准 | 可见 Mesh 0.061–0.082、头 1.65–1.67、膝 0.53–0.55（对照正常） |
| 控制台 | 0 error / 0 exception，`window.__ERRORS` 为空 |

结论：**可见部件已修复；不可见剑/阴影不计入。** 原 S4 问题关闭。

## 复现/验证步骤（v2.0.2 最终口径）

1. 打开 `index.html?qa`，开始游戏并选择任意祝福进入 `playing`。
2. `__DEBUG.god(true);` 将现有敌人移到远处并锁血；`P.mods.dodgeDistMul=1`（隔离祝福位移加成）。
3. `__DEBUG.dodge();`，以 `1/60s` `__DEBUG.tick(1/60)` 逐帧：
   - `P.model.root.updateMatrixWorld(true);`
   - 遍历 `P.model.root` 的 Mesh，跳过自身或任一祖先不可见的对象；
   - 用 `geometry.boundingBox.clone().applyMatrix4(obj.matrixWorld).min.y` 统计可见 Mesh 最低 Y；
   - 同时记录 `P.model.sword.visible`、头/膝世界坐标、`state`、`visual` 旋转/缩放。
4. 预期：可见 Mesh minY ≥ 0；中段剑隐藏、结束恢复；位移 3.00m；结束归位；无控制台错误。

## 证据

- 结果：`.dev/qa/results/latest.json`（v2.0.2 聚焦运行，08+10，47 checks / 0 FAIL；构建指纹 `60714292…948F89`）
- 诊断：`production/qa/diagnostics/dodge-v202-experiment.json`、`dodge-midframe.json`
- 截图：`production/qa/screenshots/v2.0.2-10-dodge-v202-20-dodge-midroll.png`、`…-20-dodge-v202.png`
- 报告附录：`production/qa/qa-report-v2.0.1.md` §附录 v2.0.2
