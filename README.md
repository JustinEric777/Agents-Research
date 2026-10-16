# Agents-Research

<p align="center" class="online-reading">
  <a href="https://justineric777.github.io/Agents-Research/"><strong>在线阅读：Agents-Research</strong></a>
</p>

**pi**、**dsh**（deepseek-harness）、**codex**、**CC**（Claude-Code）四个 Agent 项目的**代码级横向对比研究**。按 Agent 运行时的架构层次逐层深入，每层产出一篇对比分析，每篇沿同一条**七问链**推进——先界定范围，再逐维对比，最后落到可执行的设计结论（见第四节）。

> **当前基线（2026-10-15）**：四个项目的版本、提交、发行产物和章节优先级统一记录在 [`sources.lock.json`](sources.lock.json) 与 [当前版本与结构复核](https://justineric777.github.io/Agents-Research/refresh/)；阅读结论时先看证据等级和验证方式。

全文按**三部分**组织：**第一部分 · 启动区**（循环之前，第 1–2 章）、**第二部分 · 内核区**（一轮循环及其子系统，第 3–12 章）、**第三部分 · 外围区**（内核之外，第 13–17 章）。**章号即层码**——第 N 章就是第 N 层（`LN`）：正文跨章引用写「第 N 章」，指代架构位置写「`LN`」。

代码级引用提供 `文件:行号`；当前登记结论可通过证据图核验，推断单独标注。

---

## 一、研究对象

| 代号 | 语言 / 分发 | 一句话定位 |
|---|---|---|
| **pi** | TypeScript / Node | durable runtime + coding-agent harness |
| **dsh** | TypeScript / Node | profile/bundle + 事件溯源运行时 |
| **codex** | Rust / tokio | multi-agent + provider 原生协议 + 强沙箱 |
| **CC** | 平台二进制 / npm | 产品化任务、权限与结构化 I/O |

版本与提交以[当前来源与版本](https://justineric777.github.io/Agents-Research/appendix/sources/)为准。

**证据等级约定**（贯穿全系列）：

- `[code]` —— 官方源码，可直接引用
- `[release]` —— 官方发行物、npm 包或帮助文本
- `[inference]` —— 明确标记的设计推断，不能写成源码事实
- 附加限定：`[code]` 之下的**源码注释**与 `feature()` **门控路径**，引用处须写明「注释给出」或「还原版可见 ≠ 发布版启用」——这是 `[code]` 级引用的硬约束，不是另立一级。

> pi / dsh / codex 使用官方源码；CC 使用当前发行物身份和公开资料。结论分别标明实现、类型声明、源码注释或推断的证明范围。

关键结论、源码入口和设计建议见[当前结论与源码证据](https://justineric777.github.io/Agents-Research/appendix/claims/)；阅读时结合[源码复核矩阵](https://justineric777.github.io/Agents-Research/appendix/experiments/)核对适用范围和证据边界。

---

## 二、文档地图

按章号从「循环之前」走到「内核之外」。**表中「主题」一列即入口**——点进去就是该篇（在仓库里读则对应同号 `NN-….md` 文件）。

| 章 | 主题 | 覆盖的子职责 |
|---|---|---|
| **00** | [总览与导航](https://justineric777.github.io/Agents-Research/overview/) | 四项目档案卡 / 模块地图 / 术语对照表 / 报告索引 / 阅读路径 / 锚点速查 |
| **01** | [配置 · 凭据与启动引导](https://justineric777.github.io/Agents-Research/ch/01/) | 配置分层与优先级 / 配置载体与 schema / 等价来源 / 凭据来源与解析 / 登录与授权流 / 凭据存储与安全 / 启动引导序列 / 自检 · 迁移 · 项目信任 |
| **02** | [提示词与上下文注入](https://justineric777.github.io/Agents-Research/ch/02/) | 分节建模 / 顺序与优先级 / 项目指令发现 / 环境探测 / 内容预算 / 重算与提交 / 缓存前缀 / 异常降级 |
| **03** | [Agent 主循环](https://justineric777.github.io/Agents-Research/ch/03/) | 循环骨架 / 流式事件 / 出口判定 / 熔断 |
| **04** | [工具调用流程](https://justineric777.github.io/Agents-Research/ch/04/) | 调度链路 / 并发模型 / 权限门 / 失败物化 / 取消 / 进程与 Shell |
| **05** | [工具定义机制](https://justineric777.github.io/Agents-Research/ch/05/) | 定义分层 / 模型可见投影 / schema 体积治理 / 动态工具 / 程序化调用 |
| **06** | [上下文管理与压缩](https://justineric777.github.io/Agents-Research/ch/06/) | 计量 / 触发 / 选段 / 摘要 / 安装 / 策略级联 |
| **07** | [消息 / 事件 / Session](https://justineric777.github.io/Agents-Research/ch/07/) | 消息模型 / 事件体系 / 会话组织 / 分支与回放 |
| **08** | [会话持久化与恢复](https://justineric777.github.io/Agents-Research/ch/08/) | 落盘协议 / 崩溃恢复 / 迁移 / 损坏处理 / 写者所有权 |
| **09** | [任务与子 Agent](https://justineric777.github.io/Agents-Research/ch/09/) | 委派入口 / 实体建模 / 上下文继承 / 驱动模型 / 通信 / 配额 / 对等协作 |
| **10** | [权限与沙箱](https://justineric777.github.io/Agents-Research/ch/10/) | 判定入口 / 策略表达 / 决策 / 交互与记忆 / 系统隔离 / 失败降级 |
| **11** | [模型调用与 Provider](https://justineric777.github.io/Agents-Research/ch/11/) | 模型标识 / 清单与能力 / 请求组装 / 传输 / 事件归一 / 重试降级 / 计量与鉴权 |
| **12** | [Hook 与扩展机制](https://justineric777.github.io/Agents-Research/ch/12/) | 扩展单位 / 挂载点 / 调度语义 / 能力面 / 发现装配 / 协议契约 / 信任降级 |
| **13** | [MCP 与外部能力接入](https://justineric777.github.io/Agents-Research/ch/13/) | 连接生命周期 / 能力协商 / 三类原语投影 / 传输 / 鉴权 / 失败降级 |
| **14** | [长时任务与后台作业](https://justineric777.github.io/Agents-Research/ch/14/) | 作业类型学 / 提交与登记 / 生命周期状态机 / 调度与触发 / 输出收集与回注 / 存活与持久化 / 并发配额 / 取消级联与回收 |
| **15** | [对外接口与集成协议](https://justineric777.github.io/Agents-Research/ch/15/) | 驱动面形态 / 会话镜像与注册表 / 事件推送 / 请求协议 / 审批回流 / 承载与传输 / 握手与鉴权 / 断连与并发 |
| **16** | [交互层与终端 UI 机制](https://justineric777.github.io/Agents-Research/ch/16/) | 帧调度与合帧 / 差量绘制与视口 / 流式增量的提交边界 / 工具行状态载体 / 中断交互与键位 / 输入侧（Vim、粘贴、附件）/ 终端能力适配 / 界面权威源 |
| **17** | [遥测 · 追踪 · 诊断](https://justineric777.github.io/Agents-Research/ch/17/) | 采集口径与事件模型 / 开关 · 同意与采样 / 导出通道与失败处理 / 脱敏与隐私边界 / 追踪模型 / 本地日志与诊断产物 / 诊断命令与运行时自检 / 用户反馈与故障上报 |

---

## 三、阅读路径

| 路径 | 顺序 | 适合 |
|---|---|---|
| **A｜快速建立认知**（约 30 分钟） | `00` → 各篇 一、核心结论速览 → 各篇 五、横向对比矩阵 → 各篇 七、设计建议 | 先要结论、暂不看细节 |
| **B｜深研某一层** | `00` 三、术语对照表 → 目标篇全文（一 → 七）→ 打开源码验证附录锚点 | 要做设计决策 |
| **C｜找特定问题的答案** | 先查 `00` 三、术语对照表定位概念 → 再看该层的 Q4（五、横向对比矩阵）与 Q5（六、异常与降级） | 带着具体问题来 |
| **D｜从零搭一个** | 01 → 02 → 03 → 05 → 04 → 06 → 08 → 11 → 10 | 按**实际执行链**读，回答「一次请求依次经过哪些层」 |
| **E｜嵌进产品** | 外围区 15 → 16 → 13 → 02 → 17 → 14 | 做 IDE 插件 / Web UI / 自动化编排，关心「怎么被驱动、被看见、被观测」 |

---

## 四、每篇回答的同一组问题

各篇沿同一条**问题链**推进，**一问对应一节**。顺序是先界定范围、再逐维对比、最后落到设计结论：

| # | 问题 | 对应节 | 产出物 |
|---|---|---|---|
| **Q1** | 这一层是什么？管什么、不管什么？上下游是谁？ | 二、本层职责与边界 | 子职责拆解 + 层次定位图 |
| **Q2** | 同一个概念，四家分别叫什么？ | 三、概念对齐表 | 横向对齐表（`—` / 「无」= 该项目无对应物） |
| **Q3** | 四家各自的核心流程是什么？入口 → 主流程 → 状态载体怎么走？ | 四、逐项目实现 | 源码摘录，每个断言附 `文件:行号` |
| **Q4** | 同一维度上四家分别怎么做？共识度多高？ | 五、横向对比矩阵 | 一维度一矩阵，附「共识度」列 |
| **Q5** | 出错、越界、被中断时四家怎么办？为什么这么办？ | 六、异常与降级 | 场景 → 四家做法 → 源码依据 → **设计理由** |
| **Q6** | 哪些能直接采纳？哪些要按产品形态权衡？哪些明确不该做？ | 七、设计建议 | 共识 / 推荐 / 权衡 / 反例 四级 |
| **Q7** | 这些结论在源码哪里？怎么复核？ | 附录：关键文件索引 | 项目 / 文件 / 行号 / 用途 四张表 |

「一、核心结论速览」是把 Q1–Q6 的答案压成一屏摘要（≤5 条），不是独立一问。

**两个易混点**

- **「边界」有两个意思**：Q1 的「边界」是**职责范围**（这层管什么、不管什么），Q5 的「边界」是**异常情形**（出错、越界、被打断时的行为）。第六节标题已正名为「异常与降级」，与第二节的职责界定彻底分开，不再共用一词。
- **「共识度」是 Q4 通往 Q6 的桥梁**：四家一致 → 进 Q6 的「共识」级；只有一家这么做 → 进「权衡」级。因此 Q6 的每条建议都能回溯到 Q4 的某个矩阵行，而不是拍脑袋的主观意见。

---

## 五、关联文档

- **[总览与导航](https://justineric777.github.io/Agents-Research/overview/)**（仓库内即 `00-总览与导航.md`）—— 结构地图与索引：四项目档案卡、模块地图（架构层次 × 四项目源码入口）、核心术语对照表、报告索引、阅读路径建议、跨项目源码锚点速查。
- **三个分区入口页**（站点侧栏的三个分区）：**[第一部分 · 启动区](https://justineric777.github.io/Agents-Research/startup/)**（第 1–2 章）· **[第二部分 · 内核区](https://justineric777.github.io/Agents-Research/core/)**（第 3–12 章）· **[第三部分 · 外围区](https://justineric777.github.io/Agents-Research/peripheral/)**（第 13–17 章）。
- 本 README 只做「门面与读法」——**项目档案卡、术语表与锚点表以 `00` 为准**，避免两处维护同一份信息。
- **[版本更新与结构复核](https://justineric777.github.io/Agents-Research/refresh/)**——当前版本的架构定位、逐层结论和证据边界。
- **横切附录**——[证据与新鲜度](https://justineric777.github.io/Agents-Research/appendix/evidence/)、[持久化与所有权](https://justineric777.github.io/Agents-Research/appendix/durability/)、[安全与兼容性](https://justineric777.github.io/Agents-Research/appendix/security/)、[源码复核矩阵](https://justineric777.github.io/Agents-Research/appendix/experiments/)。

---

*本文件与 `00-总览与导航.md` 分工：README 管「这是什么、怎么读」，`00` 管「结构地图与详细索引」。*
