# 第 5 章：消息 / 事件 / Session —— 一段对话的事实源长什么样

本章是 L1–L4 全部设计差异的**根源层**：一段 Agent 对话的事实源到底是什么、由什么单元构成、如何被拆分与重建。四个项目在这里给出了四种互不兼容的世界观——**可分支文档树、可审计事件流、provider 原生 item 数组、带父指针的消息 DAG**。不先读懂这一层，前面几章的很多结论都会缺根因。

> **本层定位**：L5，L1–L4 全部设计差异的**根源层**。回答「一段 Agent 对话的事实源到底是什么、由什么单元构成、如何被拆分与重建」。
>
> **前置依赖**：无（本层是其余各层的上游）。
>
> **分析对象**：
> - **pi** —— `packages/agent/src/harness/session/types.ts`（Entry/Branch）+ `packages/ai/src/types.ts`（Message）+ `harness/messages.ts`（宿主消息）
> - **deepseek-harness** —— `packages/core/session/src/{types,surface}.ts` + `packages/llm/llm/src/{message,types}.ts`
> - **codex** —— `codex-rs/protocol/src/{items,models}.rs` + `core/src/context_manager/history.rs` + `core/src/state/session.rs`
> - **Claude-Code** —— `src/types/message.ts` + `src/types/ids.ts` + `src/utils/messages.ts`（规范化与配对）+ `src/utils/sessionStorage.ts`（消息链落盘）
>
> **易混点**：Claude-Code 的 `src/history.ts` 是**用户输入的 prompt/命令历史**（Up 箭头复用、Ctrl+R 搜索，存 `~/.claude/history.jsonl`），与会话消息无关；会话消息落在 `src/utils/sessionStorage.ts`。

---

## 一、核心结论速览

1. **四种世界观**：pi 是**可分支文档树**（Entry 是树节点，Branch 是游标）；dsh 是**可审计事件流**（append-only 日志为唯一事实源，消息从事件 derive）；codex 是**provider 原生 item 数组**（`ResponseItem` 直出 API，零转换）；Claude-Code 是**带父指针的消息 DAG**（`uuid` + `parentUuid`，写入时线性、读取时从 leaf 回溯）。
2. **只有 dsh 有独立的「事实源 vs 视图」分离**：`surfaceOp: 'replace'` 让模型可见序列可被替换（压缩用），而日志永远保留被替换前的全部事件。pi/codex/CC 都是「历史即事实」。
3. **只有 dsh 与 Claude-Code 把「不是模型可见消息」的记录也结构化保留**：dsh 的 `assistant/attempt`（失败的模型尝试）、`request/header`（log-only 事件）；CC 的 `ProgressMessage`/`HookResultMessage`/`TombstoneMessage`（判别联合的独立成员，而不是塞进某条消息的字段）。
4. **Claude-Code 的 `TombstoneMessage`（墓碑）是四家中唯一的「就地删除标记」**：transcript 是 append-only 且有多消费者（UI/磁盘/SDK），删除通过墓碑广播，磁盘侧再按 UUID 做 truncate。
5. **最严的边界守卫是 dsh 的 `ignorable`**（`session/types.ts:511`）：未知事件类型若无 `ignorable: true` 标记，读取方**必须拒绝重建**——「宁可误拒（不便），也不静默续上一个被掏空的会话（灾难）」（源码注释）。

---

## 二、本层职责与边界

### 2.1 本层解决什么问题

| 职责 | 问题 |
|---|---|
| **① 消息单元** | 一条消息是什么？有哪些 role？内容怎么分块？ |
| **② 事件/条目体系** | 除消息外还要记录什么（失败尝试、压缩、分支、进度）？ |
| **③ 身份与顺序** | 消息/事件的身份怎么给？顺序怎么保证？ |
| **④ 事实源 vs 视图** | 模型看到的历史与「记录下来的历史」是同一份吗？ |
| **⑤ 协议转换** | 内部模型 → provider 请求体怎么走？ |
| **⑥ 扩展与演进** | 新增消息类型/事件类型要不要改核心？ |

### 2.2 层次定位

```text
四家如何回答「事实源是什么」

  pi          Entry 是树节点 · Branch 是游标          可分支文档树
              [e1]─[e2]─[e3]        ← 分支 A
                           └─[e4]  ← 分支 B

  dsh         日志是唯一事实源，消息由事件 derive      可审计事件流
              log ──fold──▶ surface（可替换视图）

  codex       ResponseItem[] 直接就是 provider 格式     原生 item 数组
              [message, reasoning, function_call, …]

  Claude-Code uuid + parentUuid，写入线性、读取回溯    带父指针的消息 DAG
              msg1 ─▶ msg2 ─▶ msg3 ─▶ leaf
```

**图 5-1**：四种数据模型。它们是四种互不兼容的世界观，而不是同一事物的四种实现——这也解释了为什么前三章里到处都是「同一问题、四种答案」。

```text
        ┌───── L1 主循环（组装请求） · L4 压缩（替换历史） ────┐
        └──────────────────────────┬───────────────────────────┘
                                   │ 读写
        ┌──────────────────────────▼───────────────────────────┐
        │  L5 消息 / 事件 / Session（本篇）= 数据模型地基      │
        │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │
        │  │ 消息单元    │  │ 事件 / 条目 │  │ Session     │   │
        │  │ Message     │  │ Entry/Event │  │ 状态持有    │   │
        │  └─────────────┘  └─────────────┘  └─────────────┘   │
        └───────┬────────────┬────────────┬────────────┬───────┘
                │            │            │            │
          ┌─────▼────┐ ┌─────▼────┐ ┌─────▼────┐ ┌─────▼────┐
          │ L6 持久化│ │ 压缩     │ │ UI / 协议│ │ provider │
          │ 落盘     │ │ 替换语义 │ │ 消费者   │ │ 请求体   │
          └──────────┘ └──────────┘ └──────────┘ └──────────┘
```

### 2.3 四家边界差异

| 边界问题 | pi | dsh | codex | Claude-Code |
|---|---|---|---|---|
| 事实源 | 树（Entry + Branch） | append-only 日志 + surface | `ResponseItem` 数组（Arc COW） | 消息 DAG（`parentUuid`） |
| 模型可见 == 记录？ | 是 | **否**（surface 可替换） | 是 | 是（但可用墓碑撤销） |
| 顺序标识 | `seq`（单调）+ `parentId` | `seq`（连续 branded） | Vec 位置 + 三版本号 | `uuid` + `parentUuid` + 文件行序 |
| 转换成本 | 有（`convertToLlm`） | 有（`deriveEventMessage`） | **零**（直接 serde） | 中（`normalizeMessagesForAPI`） |

---

## 三、概念对齐表

| 概念 | pi | deepseek-harness | codex | Claude-Code |
|---|---|---|---|---|
| 消息联合类型 | `Message`（4 成员）`ai/types.ts:553` | `Message`（role map）`llm/message.ts:196` | `ResponseItem`（enum）`models.rs:1011` | `Message`（9 成员）`types/message.ts:124-134` |
| 消息基类 | `AgentMessage` `agent/types.ts:370` | `MessageBase`（id + content + **source**） | 各 enum 变体自带字段 | `MessageBase`（uuid/parentUuid/…）`message.ts:6-17` |
| 内容块 | `TextContent`/`ThinkingContent`/`ToolCall`/`ImageContent` `ai/types.ts:364-386` | `ContentBlockMap` 声明合并 `llm/types.ts:138` | `ContentItem` 4 变体 `models.rs:878` | 复用 Anthropic API 的 block 结构 |
| 溯源字段 | 隐式（entry 位置） | **显式 `source`** `llm/message.ts:136` | 隐式（role） | `origin?` + `sourceToolAssistantUUID` |
| 语义轴 | ✗ | **`ContextForm`** `llm/message.ts:55` | `MessagePhase`（commentary/final_answer） | `isMeta` / `isVirtual` / `isCompactSummary` |
| 事件/条目 | `Entry`（4 型）`session/types.ts:64` | `SessionEvent`（声明合并）`types.ts:493` | `TurnItem`（20+ 型，UI/协议视图）`items.rs:46` | `Message` 联合即事件（无独立日志） |
| 顺序标识 | `seq` + `parentId` | `seq`（branded，连续） | Vec 位置 + 三版本号 | `uuid` + `parentUuid` |
| Session 头 | `JsonlStorageHeader` `jsonl/types.ts:7` | `SessionHeader` `types.ts:94` | —（rollout 元数据） | `sessionId` + 项目目录 |
| 分支 | `Branch` `session/types.ts:521` | `session/end-seed` 继承标记 | `forked_from_ordinal_exclusive` | `parentUuid` 分叉 |
| 未知类型策略 | 无（union 硬编码） | **`ignorable` 守卫** `types.ts:511` | serde tag 失败即错 | 宽松影子类型（`[key:string]: unknown`） |
| 删除标记 | ✗（树不可变） | ✗（用 `surfaceOp.replace`） | ✗（重写 history） | **`TombstoneMessage`** `message.ts:82-84` |
| 协议转换 | `convertToLlm` + adapter | `deriveEventMessage` 纯函数 | **无转换** | `normalizeMessagesForAPI` `messages.ts:1989` |

---

## 四、逐项目实现

```text
┌───────────────────────────────────────────────────────────┐
│ dsh：唯一把「事实源」与「视图」物理分离的实现             │
│                                                           │
│ append-only 日志（唯一事实源 · 永不销毁）                 │
│ e1  e2  e3  e4  e5  e6  e7 …        ← 压缩只追加，不删除  │
│                                                           │
│               │ fold / derive                             │
│               ▼                                           │
│ surface（当前模型可见序列 · 可替换）                      │
│ e1  e2  [ 摘要 ]  e6  e7             ← surfaceOp: replace │
└───────────────────────────────────────────────────────────┘
```

**图 5-2**：事实源与视图的分离。其余三家都是「历史即事实」——压缩会真的改写历史；只有 dsh 让压缩变成一次「换视图」操作，从而零成本获得回滚能力。

### 4.1 pi —— 树 + 分支游标

#### 4.1.1 Entry：既是存储单元又是树节点

```ts
// packages/agent/src/harness/session/types.ts:16
type EntryType = "message" | "compaction" | "branch_summary" | "custom";
// :18 EntryBase { id; parentId; seq; timestamp; type; customType? }
// :64
export type Entry = MessageEntry | CompactionEntry | BranchSummaryEntry | CustomEntry;
// :27 / :33 / :43 / :52  四型定义
export interface CompactionEntry extends EntryBase { /* 摘要 + retainedTail */ }
```

`parentId` 构成树，`seq` 是单调序号（供范围扫描）。**事件与消息合一**——pi 没有独立的「事件日志」，每条消息、每个压缩、每个分支摘要都是一个 entry。

#### 4.1.2 Branch：树上的游标

```ts
// packages/agent/src/harness/session/types.ts:521
export interface Branch { ... }
// packages/agent/src/harness/session/session.ts:63/95/109/146  create/open/list/fork
// :300 scanBranch / :349 branch / :355 createBranch / :416 getBranchTip / :422 appendToBranch
```

#### 4.1.3 消息：`Message`（LLM 层）与 `AgentMessage`（agent 层）

```ts
// packages/ai/src/types.ts:553
export type Message = SystemMessage | UserMessage | AssistantMessage | ToolResultMessage;
// :364 / :370 / :380 / :386 / :539
TextContent / ThinkingContent / ImageContent / ToolCall / ToolResultMessage
// packages/agent/src/types.ts:370
export type AgentMessage = Message | CustomAgentMessages[keyof CustomAgentMessages];
```

**SystemMessage 是「增量变更」载体**（pi 独有）：`sections?: Record<string, string | null>`（命名段落，后续消息按名替换/删除）+ `toolsAdded`/`toolsRemoved`（工具集变更，见 第 3 章）。

宿主消息（不进 `ai` 包）在 `harness/messages.ts`：`BashExecutionMessage`（`:19`）、`BranchSummaryMessage`（`:40`）、`CompactionSummaryMessage`（`:47`）。

#### 4.1.4 独有能力：并行探索

树模型允许「离开主干去探索」——`BranchSummaryEntry` 在离开分支前生成摘要，回树时恢复（详见 第 4 章 4.1.6）。**dsh（线性日志）与 codex（单线回滚）与 CC（消息 DAG 但无分支摘要）都没有这个语义**。

---

### 4.2 deepseek-harness —— 事件溯源日志 + surface 投影

#### 4.2.1 SessionEvent：声明合并的日志单元

```ts
// packages/core/session/src/types.ts:281
export interface SessionEventMap {
  // :288/297  turn/start · turn/end
  // :299/301  step/start · step/end
  // :309/311  user/message · developer/message
  // :330/341  system/message · assistant/message
  // :355      assistant/attempt（未产生 surface 的失败/重试尝试）
  // :361/375  tool/call · tool/result
  // :390/402/427  request/header · request/context · session/end-seed
}
// :493
export type SessionEvent<T> = { ... }
// :511
ignorable?: true      // ← 关键守卫字段
```

**三件套声明合并**：`SessionEventMap`（`types.ts:281`）、`ContentBlockMap`（`llm/types.ts:138`）、`MessageSourceMap`（`llm/message.ts:136`）。插件可 `declare module` 增类型，**核心零改动**——compaction 的四个事件就是这样挂进来的（第 4 章）。

#### 4.2.2 消息：强制的 source + 语义轴

```ts
// packages/llm/llm/src/message.ts:196
export type Message = MessageRoleMap[keyof MessageRoleMap]
// :136
export type MessageSource = MessageSourceMap[keyof MessageSourceMap]   // 谁生产的
// :55
ContextForm = 'instructions' | 'catalog' | 'snapshot' | 'notice' | 'relay' | 'recall'
```

- **`source` 强制**：没有 catch-all 的 `plugin` 兜底——每个生产者自证身份。
- **`ContextForm` 语义轴**：声明「这是什么内容」，消费者决定展示形式（源码注释 `[注释]`：「colors, icons, ordering are the consumer's business」）。**语义与视觉严格分离**。
- **`ContentBlockMap`**（`llm/types.ts:138/149/151`，块类型 `:62-127`）：`TextBlock`/`ReasoningBlock`/`ImageBlock`/`FileBlock`/`ToolCallBlock`/`ToolAdditionBlock`/`ToolRemovalBlock`。其中 `tool-addition`/`tool-removal` 必须出现在 **developer role** 消息中（`validateSessionEventData` 强制）。

#### 4.2.3 SessionHeader：会话配置随会话落盘

```ts
// packages/core/session/src/types.ts:94
export interface SessionHeader {
  // :123  readonly delegationDepth?: number
  // :130  readonly agentPreset?: string
}
```

**两个持久化字段最有价值**（`[注释]`）：
- `delegationDepth`：子 agent 递归深度存盘——「runtime-only 深度会在 resume 时失效」，重启后子 agent 不会被误当成顶层。
- `agentPreset`：resume 必须恢复**相同的工具 + prompt 组合**，否则模型面对的历史它无法操作。

**结论**：**「决定会话语义的配置」必须与会话一起落盘**。

#### 4.2.4 surface：事实源与视图的分离

```ts
// packages/core/session/src/surface.ts:63 / 251 / 410 / 600
isSurfaceEligibleType / SessionSurface / validateSurfaceMetadata / foldSurface
// :120
export function deriveEventMessage(...)     // 单事件 → LLM 消息（纯函数，可离线重放）
```

`surfaceOp: 'append' | { op: 'replace', startSeq, endSeq }`：模型可见序列可被后续事件**替换**（压缩用），日志保留全部被替换的事件。**这是 dsh 一切恢复能力的地基**。

---

### 4.3 codex —— provider 原生 item 数组

#### 4.3.1 ResponseItem：消息结构由 provider 协议反向决定

```rust
// codex-rs/protocol/src/models.rs:1011   ← 注意：不是 ~870
pub enum ResponseItem {
    // :1073 FunctionCall { ... }
    // :1113 FunctionCallOutput { ... }
    // :1227 Compaction { ... }
    // :1242 ContextCompaction { ... }
}
// :878  ContentItem 4 变体（InputText 879 / InputImage 882 / InputAudio 889 / OutputText 892）
// :2179 FunctionCallOutputPayload（struct 版）
```

序列化后**直接作为请求体**发送（与 `ToolSpec` 同理，见 第 3 章）。`MessagePhase`（commentary / final_answer）来自 provider 的分类。

#### 4.3.2 TurnItem：UI/协议视图（20+ 型）

```rust
// codex-rs/protocol/src/items.rs:46
pub enum TurnItem {
    // :47-77  变体：UserMessage / FunctionCallOutput / HookPrompt / AgentMessage / Plan /
    //         Reasoning / CommandExecution / DynamicToolCall / CollabAgentToolCall /
    //         SubAgentActivity / WebSearch / ImageView / Extension / ImageGeneration /
    //         EnteredReviewMode / ExitedReviewMode / FileChange / McpToolCall / ContextCompaction
}
// :509
pub struct ContextCompactionItem { ... }
```

**没有事件日志**：`TurnItem` 是对外发布的 item 类型（app-server 协议、UI 视图、扩展 item）。类型丰富反映 codex 作为完整 CLI/IDE 产品的定位——UI 需要知道「发生了什么活动」。`ContextCompactionItem` 说明**压缩被建模为一次可见的 turn**（呼应 第 4 章）。

#### 4.3.3 ContextManager：Arc COW + 三版本号

```rust
// codex-rs/core/src/context_manager/history.rs:76
pub(crate) struct ContextManager {
    items: Arc<Vec<ResponseItemEnvelope>>,   // 最老在前；快照共享 Arc，改动时 Arc::make_mut
    review_history: Option<TranscriptHistory>,
    retained_context: Arc<RetainedContext>,
    guardian_context_mode: ...,
    // :90 / :92 / :94  ← 版本号在 ContextManager，不在 SessionState
    history_version: u64,            // 每次历史重写自增
    reset_version: u64,              // 最后一次破坏性替换
    user_message_revision: u64,      // 用户输入/reset 单调修订
    reference_context_item: Option<TurnContextItem>,   // 上下文 diff 基线
}
// :179 impl ContextManager
// :400 record_items / :471 for_prompt / :488 raw_items / :495 annotated_items
// :555 replace / :559 replace_annotated / :509 history_version()
```

**写时复制快照**（`[注释]`）：「snapshots share the vector until a caller needs to mutate it」——只读消费者零拷贝共享历史。

**三版本号**管理重写语义：`history_version`（压缩/回滚等重写）、`reset_version`（破坏性重置）、`user_message_revision`（用户输入，自增点在 `context_manager/history_user_authorization.rs:103`）。

```rust
// codex-rs/core/src/state/session.rs:69 / :75
pub(crate) struct SessionState { pub(crate) history: ContextManager, ... }
// :147 record_items / :175 clone_history / :180 replace_history / :192 replace_annotated_history
```

**归属说明**：`clone_history` / `replace_annotated_history` 定义在 `state/session.rs`（`:175`/`:192`），它们转发到 `history.rs` 的 `replace_annotated`（`:559`）；三个版本号存放在 `ContextManager` 中。

---

### 4.4 Claude-Code —— 消息 DAG + 墓碑

#### 4.4.1 Message：9 类判别联合

```ts
// src/types/message.ts:124-134
export type Message =
  | UserMessage          // :24-30   type='user'
  | AssistantMessage     // :32-38   type='assistant'
  | ProgressMessage      // :40-43   type='progress'
  | SystemMessage        // :47-52   type='system' + 可选 subtype
  | AttachmentMessage    // :19-22   type='attachment'
  | HookResultMessage    // :74      type='hook_result'
  | ToolUseSummaryMessage// :78      type='tool_use_summary'
  | TombstoneMessage     // :82-84   type='tombstone'
  | GroupedToolUseMessage// :107-109 type='grouped_tool_use'
// :6-17
export type MessageBase = {
  uuid?: string; parentUuid?: string; timestamp?: string; createdAt?: string
  isMeta?: boolean; isVirtual?: boolean; isCompactSummary?: boolean
  toolUseResult?: unknown; origin?: MessageOrigin
  [key: string]: unknown          // ← source-map 还原版的宽松影子类型
}
```

**边界系统消息全部是 `SystemMessage` 的别名**（`:54-72`），靠 `subtype` 字符串区分：`SystemLocalCommandMessage` / `SystemCompactBoundaryMessage` / `SystemMicrocompactBoundaryMessage` / `SystemAPIErrorMessage` / `SystemTurnDurationMessage` / `SystemBridgeStatusMessage`。

**注意**（`[代码]`）：这是 source-map 还原版的**宽松**类型——索引签名 `[key: string]: unknown` 意味着运行时会带更多字段（`context_management`、`sourceToolAssistantUUID`、`permissionMode`、`imagePasteIds` 等）。这也是这套源码不可与官方源码完全等同的证据之一。

#### 4.4.2 身份与链：DAG

```ts
// src/types/ids.ts:10/17/23-33/35  品牌类型 + AgentId 格式校验 /^a(?:.+-)?[0-9a-f]{16}$/
// src/bootstrap/state.ts:331  sessionId: randomUUID() as SessionId
//   :431 getSessionId / :435-448 regenerateSessionId / :468-477 switchSession（原子切换）
// src/utils/messages.ts:513  createUserMessage → uuid ?? randomUUID()
//   :388 createAssistantMessage / :4347 createSystemMessage
//   :725-728  确定性派生
export function deriveUUID(parentUUID: UUID, index: number): UUID {
  const hex = index.toString(16).padStart(12, '0')
  return `${parentUUID.slice(0, 24)}${hex}` as UUID
}
```

**写入时线性、读取时 DAG**：`insertMessageChain`（`sessionStorage.ts:993-1069`）逐条推进 `parentUuid`；**compact boundary 特殊处理** `parentUuid: null, logicalParentUuid: <前一条>`（`:1040-1041`），tool_result 用 `sourceToolAssistantUUID` 覆盖父指针（`:1031-1037`）。读取用 `buildConversationChain`（`:2069-2094`）从 leaf 回溯并 reverse，**检测环**（`:2077-2085`）。

链实际是 DAG（并行 tool_use 会分叉），有专门的 `recoverOrphanedParallelToolResults`（`:2118`）修复分叉。

#### 4.4.3 TombstoneMessage：四家唯一的「就地删除标记」

```ts
// 产生：src/query.ts:713-724  流式 fallback 时逐条 yield
if (streamingFallbackOccured) {
  for (const msg of assistantMessages) yield { type: 'tombstone' as const, message: msg }
  logEvent('tengu_orphaned_messages_tombstoned', {...})
}
// 消费 1：src/utils/messages.ts:2954-2958  onTombstone?.(message.message) 而非 onMessage
// 消费 2：src/screens/REPL.tsx:2678-2680   setMessages(old => old.filter(m => m !== t)) + removeTranscriptMessage(t.uuid)
// 消费 3：src/QueryEngine.ts:758-760       直接 skip
// 磁盘侧：src/utils/sessionStorage.ts:871-951  removeMessageByUuid → 按 UUID 定位行 + truncate
//   尾部快路径：lastIndexOf('"uuid":"..."') → truncate
//   慢路径：整文件重写；>50MB 直接放弃（:927-933）
```

**为什么不用删除**（`[推断]`）：transcript 是 append-only，且有**三路消费者**（UI、磁盘、SDK stream）。墓碑是一个「控制信号」载体，把「要移除谁」一次性广播给所有消费者，还能参与遥测。这比让每个消费者各自判断「哪些消息不该显示」要可靠。

#### 4.4.4 协议转换：`normalizeMessagesForAPI`

```ts
// src/utils/messages.ts:1989
normalizeMessagesForAPI()
// :1999-2001  reorderAttachmentsForAPI + 按 isVirtual 过滤
// :2004-2010  error → strip 映射
// :2066-2074  过滤 progress / 非 local_command system / 合成错误消息
// :2078-2093  system(local_command) 转 user 并合并
// :2094-2098  连续 user 合并（Bedrock 限制）
// :2103-2111  strip 不可用 tool_reference
// :731-820    normalizeMessages（更早的规范化：拆多 block、保序、重派生 UUID）
```

#### 4.4.5 `ensureToolResultPairing`：配对兜底

```ts
// src/utils/messages.ts:5133-5460，调用点 src/services/api/claude.ts:1301
// :5147        跨消息 allSeenToolUseIds 去重 tool_use
// :5161-5200   strip 孤儿 tool_result
// :5235-5241   strip 无对应 result 的 server_tool_use / mcp_tool_use
// :5250-5256   空 content 补 placeholder
// :5321-5326   正/反向配对检查生成 syntheticBlocks
// :5382-5387   空孤儿时补 NO_CONTENT_MESSAGE 保 role 交替
// :5437-5443   严格模式 getStrictToolResultPairing() 直接抛错
```

**这是 L5 层最实用的一段代码**：Anthropic API 强制要求 `tool_use`/`tool_result` 严格配对，任何一条不配对的残留都会导致整个会话 400。四家中只有 CC 把它做成独立的、可测试的兜底函数。

---

## 五、横向对比矩阵

### 5.1 消息单元设计

| 维度 | pi | dsh | codex | Claude-Code | 共识度 |
|---|---|---|---|---|---|
| 联合成员数 | 4（+ 声明合并） | role map（+ 声明合并） | enum（含 4 内容块） | **9** | 0/4 |
| 身份载体 | entry `id`（存储层） | `MessageId`（消息自带） | 无（Vec 位置） | `uuid`（消息自带） | 2/4 自带 |
| 溯源 | 隐式 | **显式 `source`** | 隐式（role） | `origin` + `sourceToolAssistantUUID` | 1/4 |
| 语义/展示分离 | 无 | **`ContextForm`** | `MessagePhase` | `isMeta`/`isVirtual`（弱） | 1/4 |
| 非展示类消息 | 无（靠 role） | `assistant/attempt` 等 log-only | HookPrompt 等 TurnItem | **Progress/HookResult/Tombstone 独立成员** | 1/4 |

### 5.2 事件/记录体系

| 维度 | pi | dsh | codex | Claude-Code | 共识度 |
|---|---|---|---|---|---|
| 记录模型 | 树节点（消息即条目） | **事件日志** | item 数组 | 消息联合即记录 | 0/4 |
| 类型扩展 | custom entry + projector | **声明合并 map** | serde enum + Extension | 宽松影子类型 + `[key:string]:unknown` | 0/4 |
| 失败尝试落盘 | ✗ | ✓ `assistant/attempt` | ✓ rollout | ✗ | 2/4 |
| 删除/撤销语义 | 树不可变 | `surfaceOp.replace` | 重写 history | **`TombstoneMessage`** | 0/4 |

### 5.3 Session 状态持有

| 维度 | pi | dsh | codex | Claude-Code | 共识度 |
|---|---|---|---|---|---|
| 核心持有 | 存储抽象 + 分支游标 | 日志句柄 + surface | `SessionState` + `ContextManager` | 消息数组 + transcript 落盘 | 0/4 |
| 写并发控制 | `mutate` 互斥屏障 | append-only + 锁 | `Mutex<SessionState>` | 进程内队列 + 定时 drain | 0/4 |
| 只读共享 | ✗ | 日志可重放 | **`Arc<Vec>` COW** | ✗ | 1/4 |
| 重写管理 | `storageVersion` | 格式版本 + 迁移包链 | **三版本号** | `logicalParentUuid` + preservedSegment | 0/4 |
| 会话配置落盘 | storageVersion / fork lineage | **`agentPreset`/`delegationDepth`** | 部分 | `sessionId` + 项目目录 | 1/4 |

### 5.4 分支与回放

| 维度 | pi | dsh | codex | Claude-Code | 共识度 |
|---|---|---|---|---|---|
| 分支模型 | **Branch 树**（fork 子树/整树） | seed 继承（`session/end-seed`） | `forked_from_ordinal_exclusive` | `parentUuid` 分叉 | 0/4 |
| 分支摘要 | **✓ `branch_summary`** | ✗ | ✗ | ✗ | 1/4 |
| 并行探索语义 | **✓ 独有** | ✗ | ✗ | ✗ | 1/4 |
| 回放 | 从 tip 沿 parent 链收集 | **`foldSurface` 全量折叠** | rollout 重建 | `buildConversationChain` 回溯 | 2/4 |

### 5.5 协议转换

| 维度 | pi | dsh | codex | Claude-Code | 共识度 |
|---|---|---|---|---|---|
| 转换成本 | 中（`convertToLlm` + adapter） | 中（`deriveEventMessage` 纯函数） | **零**（直接 serde） | 高（`normalizeMessagesForAPI` + `ensureToolResultPairing`） | 0/4 |
| 系统提示更新 | system 消息 `sections`/`toolsAdded` 增量 | `system/message` + developer tool 块 | `reference_context_item` 基线 diff | `isMeta` 注入 + 重放 | 0/4 |
| 配对兜底 | 无（构造时保证） | `sourceEventSeqs` 引用校验 | payload 类型校验 | **`ensureToolResultPairing`** | 1/4 |
| 前缀缓存友好 | ✓（差分） | ✓（前缀不变） | ✓（保留前缀，压缩删最旧） | ✓（boundary + 排序稳定） | **4/4 都考虑** |

### 5.6 边界防护

| 维度 | pi | dsh | codex | Claude-Code | 共识度 |
|---|---|---|---|---|---|
| 未知类型 | 编译期 union | **`ignorable` 守卫（fail-closed）** | serde 失败即错 | 宽松类型（静默容忍） | 1/4 |
| 序号完整性 | `seq` 单调 | **branded 连续 seq** | Vec 位置 | 文件行序 + uuid | 1/4 |
| 悬空引用 | `findTurnStartIndex` 抛 `SessionInvariantError` | `sourceEventSeqs` 校验 | `response_id` 元数据 | `buildConversationChain` 截断 + 环检测 | 4/4 有检测 |
| 损坏恢复 | 抛错 | 合成 closer（第 6 章） | 跳过 + 计数 | 静默 try/catch + 部分链 | 0/4 |

---

## 六、异常与降级

### 6.1 未知消息/事件类型

- **pi**：编译期 union，无运行时概念。
- **dsh**：`ignorable` 守卫（`types.ts:511`）——未知事件若无标记，**拒绝重建**。源码注释（`[注释]`）：「forgotten marker over-refuses（不便）而不是 silently resuming a gutted session（灾难）」。
- **codex**：serde tag 反序列化失败即错。
- **Claude-Code**：宽松影子类型（`[key: string]: unknown`）——**静默容忍**，未知字段直接透传。

**设计理由**：dsh 的 fail-closed 与 CC 的 fail-open 是两种极端，取决于定位——dsh 要保证「恢复出来的会话与用户实际经历一致」，CC 要保证「旧版本能打开新版本写的会话」。

### 6.2 引用悬空

| 项目 | 机制 | 依据 |
|---|---|---|
| pi | `parentId` 存在性校验；缺失时抛 `SessionInvariantError` | `session.ts` |
| dsh | `sourceEventSeqs` 必须覆盖被替换节点；`tool/result` 必须配对 `tool/call` | `surface.ts:410` |
| codex | `response_id`/`window_ids` 随元数据持久化 | `CompactedHistoryMetadata` |
| Claude-Code | `buildConversationChain` 遇 undefined 即**截断链**（已知故障类「chain truncation」）；`recoverOrphanedParallelToolResults`（`:2118`）修分叉 | `sessionStorage.ts:2088-2090` |

**设计理由**（`[注释]` CC）：截断是「宁可多加载也不丢历史」的反面——它选择截断；而 `applyPreservedSegmentRelinks` 在链断裂时记 `tengu_relink_walk_broken` 后**整体 no-op**（`:1888-1902`），这才体现「宁可多加载也不丢历史」。

### 6.3 消息被撤销

- **Claude-Code**：`TombstoneMessage` 广播 + 磁盘 `removeMessageByUuid` truncate（`:871-951`）；**>50MB 直接放弃**（不重写大文件）。
- **dsh**：不用删除，用 `surfaceOp.replace` 把区间从「视图」中移出，日志保留。
- **pi / codex**：无法撤销（pi 树不可变；codex 靠重写 history + 版本号递增）。

**设计理由**（`[推断]` CC 的 50MB 上限）：大文件整写代价过高，宁可保留被撤销的消息（多几条历史）也不阻塞用户。

### 6.4 tool_use / tool_result 配对

| 项目 | 保证方式 |
|---|---|
| pi | 构造时保证（每条 toolCall 必生成结果，见 第 2 章「零逃逸」） |
| dsh | 事件层校验：`tool/result` 必须引用 `tool/call` 的 seq |
| codex | payload 类型校验 + `Fatal` |
| Claude-Code | **`ensureToolResultPairing` 独立兜底**（`:5133`，7 路修复） |

**设计理由**（`[推断]`）：CC 需要独立兜底，因为它的消息可能来自历史文件（可能被手工编辑、可能来自旧版本、可能因压缩留下残片）。pi/dsh 的配对在写入时就保证了。

### 6.5 分支/继承边界的识别

- **pi**：`parentId` 链（数据层）。
- **dsh**：`session/end-seed` **一等日志事件**（`types.ts:427`）+ `inheritedEventCount`——fork 语义可审计、可重放。
- **codex**：`forked_from_ordinal_exclusive`（按序列位置截断）。
- **Claude-Code**：`parentUuid` 分叉 + `logicalParentUuid`（压缩边界用）。

**设计理由**（`[推断]`）：dsh 把 fork 边界做成事件而非隐式约定，是为了让「一段历史从哪来」在日志里可查——这对多 agent 协作（父子会话）是必需的。

### 6.6 上下文替换（压缩后）

- **dsh**：`surfaceOp: { op: 'replace', startSeq, endSeq }` ——视图替换，日志保留。
- **codex**：重写 `history` + `history_version` 自增；`review_history` 保留旧 transcript 供 guardian 审查。
- **pi**：`CompactionEntry` 进树（`retainedTail` 自包含）。
- **Claude-Code**：`compact_boundary` 系统消息 + `preservedSegment`（`headUuid`/`anchorUuid`/`tailUuid`）+ 加载时 `applyPreservedSegmentRelinks` 重连（`:1839`），并**物理裁剪** boundary 之前的未保留消息（`:1944-1955`）。

### 6.7 resume 已压缩会话

- **Claude-Code**：`findLastCompactBoundaryIndex`（`messages.ts:4618`）/ `getMessagesAfterCompactBoundary`（`:4643`）在 API 前切到最近 boundary 之后；`preservedSegment` 重连并清 stale `usage`（防 resume 后立即 autocompact，`:1920-1939`）。
- **codex**：`InitialHistory::Resumed` + `CompactedItem` 回填（见 第 6 章）。
- **dsh**：`foldSurface` 折叠出不变量。
- **pi**：`newestCompactionIndex` 检测已有更新的压缩 entry 即跳过（见 第 4 章）。

### 6.8 会话配置与历史不匹配

- **dsh**：`agentPreset`/`delegationDepth` 随会话落盘——resume 时配置必然匹配。
- **其余三家**：无此机制（配置来自当前启动参数，可能与历史不匹配）。

**设计理由**（`[注释]` dsh）：模型面对的历史如果超出它当前的工具/prompt 能力，会产生「历史里有我无法执行的操作」的错位。这是多 agent / 多 preset 系统的真实风险。

---

## 七、设计建议

### 7.1 共识（可直接采纳）

1. **每条消息携带稳定 `id`**，跨表示层（日志/UI/请求）身份不漂移。
2. **顺序标识要么单调序号（dsh/pi），要么显式父指针（CC）**，二者至少要有一个。
3. **消息内容分块（content blocks）**，不要拼成单个字符串。
4. **维护一份「模型看到的历史」与「记录下来的历史」的映射关系**——即使不做替换，也要能回答「这条消息为什么在请求里」。
5. **前缀缓存友好**：排序稳定、增量更新、压缩时保留前缀（四家都做了）。
6. **引用完整性检测**：悬空父指针、未配对的 tool_use 必须有检测/修复路径。

### 7.2 推荐（按收益排序）

1. **事实源与视图分离**（学 dsh）：日志 append-only，模型可见序列是「投影」。上限最高——支持压缩替换、回滚、多视图（模型视图 vs 用户 transcript 视图）。成本：需要 `foldSurface`/`deriveEventMessage` 全套。
2. **给消息加 `source` 溯源字段**（学 dsh `llm/message.ts:136`）：压缩后仍能回答「这条是工具产的还是用户写的」。这是 第 4 章 checkpoint source 的前提。
3. **语义与展示解耦**（学 dsh `ContextForm`）：content 声明「是什么」，消费者决定「长什么样」。
4. **会话配置随会话落盘**（学 dsh `agentPreset`/`delegationDepth`）：凡决定会话语义的配置都必须持久化。
5. **把「非展示类记录」做成独立消息类型**（学 CC 的 Progress/HookResult/Tombstone）：比塞进普通消息的字段更清晰，也让消费者可以做类型穷尽检查。
6. **配对兜底写成独立可测函数**（学 CC `ensureToolResultPairing`）：不要依赖「构造时总是正确」。
7. **只读共享用 COW**（学 codex `Arc<Vec>`）：多消费者（主循环、压缩、UI）零拷贝共享历史。
8. **未知类型默认 fail-closed，除非数据自己声明可忽略**（学 dsh `ignorable`）。

### 7.3 权衡

1. **四种世界观怎么选**：框架/多消费者 → dsh 式事件溯源；轻量嵌入 → pi 式树；深度绑定单一 provider → codex 式原生 item；交互式产品 + 已有 provider 协议 → CC 式消息 DAG。
2. **树（pi）vs 日志（dsh）**：树的独有价值是**并行探索**（branch_summary）；日志的独有价值是**可审计与可替换**。若产品不需要「离开主干探索」，树的分支能力就是冗余复杂度。
3. **宽松类型（CC）vs 严格类型（dsh）**：宽松让旧版本能打开新版本的数据，代价是编译期保障丧失（CC 的 `[key: string]: unknown` 让大量字段无法被类型检查）。
4. **序号 vs 父指针**：序号便于范围扫描与压缩区间表达（dsh/pi）；父指针天然支持分叉（CC）。**两者并存成本不高，建议都有**。

### 7.4 反例

1. **不要让「记录下来的历史」与「发给模型的历史」只靠隐式约定对齐**（对照 dsh 用事件显式表达替换）。一旦不一致，排查成本极高。
2. **不要用「删除」处理流式中断的残留消息**（对照 CC 的墓碑）。append-only 存储 + 多消费者场景下，删除需要每个消费者各自实现，必然漏。
3. **不要在 resume 后立即触发压缩**（对照 CC 清 stale `usage` `:1920-1939`）。旧 token 计数在加载后不成立，会导致「刚打开就压缩」。
4. **不要忽略子 agent 的递归深度持久化**（对照 dsh `delegationDepth`）。重启后子 agent 被当顶层会破坏工具与权限边界。
5. **不要用 `arc` 共享后又期望独立修改**（对照 codex 的 `Arc::make_mut` 语义）。COW 的前提是「只读共享、写时复制」，误改会让所有持有者看到变化。

---

## 附录：关键文件索引

### pi

| 文件 | 行号 | 用途 |
|---|---|---|
| `packages/agent/src/harness/session/types.ts` | 16 / 18 / 27 / 33 / 43 / 52 / 64 / 521 | `EntryType` / `EntryBase` / 四型 Entry / `Entry` 联合 / `Branch` |
| `packages/agent/src/harness/session/session.ts` | 63 / 95 / 109 / 146 / 300 / 349 / 355 / 416 / 422 | 建/开/列/fork / `scanBranch` / `branch` / `createBranch` / tip / append |
| `packages/ai/src/types.ts` | 364 / 370 / 380 / 386 / 539 / 553 | 内容块 / `ToolResultMessage` / `Message` 联合 |
| `packages/agent/src/types.ts` | 370 | `AgentMessage` |
| `packages/agent/src/harness/messages.ts` | 19 / 40 / 47 | `BashExecutionMessage` / `BranchSummaryMessage` / `CompactionSummaryMessage` |

### deepseek-harness

| 文件 | 行号 | 用途 |
|---|---|---|
| `packages/core/session/src/types.ts` | 94 / 123 / 130 | `SessionHeader` / `delegationDepth` / `agentPreset` |
| `packages/core/session/src/types.ts` | 281 / 288-427 / 493 / 511 | `SessionEventMap` / 各事件 / `SessionEvent` / `ignorable` |
| `packages/core/session/src/surface.ts` | 63 / 120 / 251 / 410 / 600 | `isSurfaceEligibleType` / `deriveEventMessage` / `SessionSurface` / `validateSurfaceMetadata` / `foldSurface` |
| `packages/llm/llm/src/message.ts` | 55 / 136 / 196 | `ContextForm` / `MessageSource` / `Message` |
| `packages/llm/llm/src/types.ts` | 62-127 / 138 / 149 / 151 | 各 `*Block` / `ContentBlockMap` / type / `ContentBlock` |

### codex

| 文件 | 行号 | 用途 |
|---|---|---|
| `codex-rs/protocol/src/items.rs` | 46 / 47-77 / 509 | `TurnItem` / 20+ 变体 / `ContextCompactionItem` |
| `codex-rs/protocol/src/models.rs` | 878 / 1011 / 1073 / 1113 / 1227 / 1242 / 2179 | `ContentItem` / **`ResponseItem`** / 各变体 / payload struct |
| `codex-rs/core/src/context_manager/history.rs` | 76 / 90 / 92 / 94 / 179 | `ContextManager` / 三版本号 / impl |
| `codex-rs/core/src/context_manager/history.rs` | 400 / 471 / 488 / 495 / 509 / 555 / 559 | `record_items` / `for_prompt` / `raw_items` / `annotated_items` / 版本访问器 / `replace` / `replace_annotated` |
| `codex-rs/core/src/state/session.rs` | 69 / 75 / 147 / 175 / 180 / 192 | `SessionState` / `history` / 转发方法 |
| `codex-rs/core/src/context_manager/history_user_authorization.rs` | 103 | `user_message_revision` 自增 |

### Claude-Code

| 文件 | 行号 | 用途 |
|---|---|---|
| `src/types/message.ts` | 6-17 / 19-109 / 124-134 | `MessageBase` / 9 类成员 / `Message` 联合 |
| `src/types/message.ts` | 54-72 / 82-84 | 边界系统消息别名 / **`TombstoneMessage`** |
| `src/types/ids.ts` | 10 / 17 / 23-35 | 品牌类型 / AgentId 校验 |
| `src/bootstrap/state.ts` | 331 / 431 / 435-448 / 468-477 | sessionId 生成 / 获取 / 重生成 / 切换 |
| `src/utils/messages.ts` | 388 / 513 / 725-728 / 731-820 | 消息构造 / `deriveUUID` / `normalizeMessages` |
| `src/utils/messages.ts` | 1989-2111 | `normalizeMessagesForAPI` 全流程 |
| `src/utils/messages.ts` | 2954-2958 / 4530-4555 | 墓碑消费 / `createCompactBoundaryMessage` |
| `src/utils/messages.ts` | 4618 / 4643 / **5133-5460** | boundary 定位 / `ensureToolResultPairing` |
| `src/utils/sessionStorage.ts` | 202-205 / 247-258 | transcript 路径 / 子 agent 路径 |
| `src/utils/sessionStorage.ts` | 871-951 / 993-1069 | `removeMessageByUuid` / `insertMessageChain` |
| `src/utils/sessionStorage.ts` | 1408-1449 / 1839 / 1920-1939 / 1944-1955 / 1982 | `recordTranscript` / `applyPreservedSegmentRelinks` / 清 stale usage / 物理裁剪 / `applySnipRemovals` |
| `src/utils/sessionStorage.ts` | 2069-2094 / 2118 | `buildConversationChain` / 孤儿并行结果修复 |
| `src/query.ts` | 713-724 | 墓碑产生 |
| `src/QueryEngine.ts` | 758-760 | 墓碑 skip |
| `src/services/api/claude.ts` | 1301 | `ensureToolResultPairing` 调用点 |
