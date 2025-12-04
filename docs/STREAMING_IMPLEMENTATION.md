# Chat 流式输出实现文档

> 本文档总结 Chat 模式流式输出的完整实现，供后续开发参考。
> 
> **最后更新**: 2025-12-04 - 添加 Agent 消息渲染优化记录

## 架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                        前端 UI 层                                │
├─────────────────────────────────────────────────────────────────┤
│  MainAIChatShell.tsx  │  ChatPanel.tsx  │  StreamingMessage.tsx │
│  (主聊天界面)          │  (右侧面板/悬浮球) │  (独立组件，未使用)    │
└──────────────┬────────────────┬──────────────────────────────────┘
               │                │
               ▼                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     状态管理层 (Zustand)                         │
├─────────────────────────────────────────────────────────────────┤
│                      useAIStore.ts                              │
│  - isStreaming: boolean        (是否正在流式)                    │
│  - streamingContent: string    (当前流式内容)                    │
│  - sendMessageStream()         (发送消息并流式接收)               │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      LLM 服务层                                  │
├─────────────────────────────────────────────────────────────────┤
│  src/services/llm/index.ts     - callLLMStream() 统一入口        │
│  src/services/llm/providers/   - 各 Provider 的 stream() 实现    │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Rust 后端                                   │
├─────────────────────────────────────────────────────────────────┤
│  src-tauri/src/llm.rs          - llm_fetch_stream 命令          │
│  (使用 Tauri Event 推送流式数据)                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 核心文件和接口

### 1. 状态管理 - `src/stores/useAIStore.ts`

#### 状态定义
```typescript
interface AIState {
  // 流式相关状态
  isStreaming: boolean;           // 是否正在流式输出
  streamingContent: string;       // 当前流式内容
  streamingReasoning: string;     // 推理内容（DeepSeek R1 等）
  
  // 方法
  sendMessageStream: (content, currentFile?, displayContent?) => Promise<void>;
  stopStreaming: () => void;
}
```

#### 关键方法 - `sendMessageStream`
```typescript
// 位置: useAIStore.ts 约第 480-640 行
sendMessageStream: async (content, currentFile, displayContent) => {
  // 1. 设置流式状态
  set({ isStreaming: true, streamingContent: "", streamingReasoning: "" });
  
  // 2. 调用 LLM 流式接口
  for await (const chunk of callLLMStream(messages, options, config)) {
    if (chunk.type === "text") {
      finalContent += chunk.text;
      set({ streamingContent: finalContent });  // 实时更新
    }
  }
  
  // 3. 流式结束，合并更新（避免闪烁）
  set((state) => ({
    messages: [...state.messages, { role: "assistant", content: finalContent }],
    isStreaming: false,
    streamingContent: "",
  }));
}
```

### 2. LLM 服务层 - `src/services/llm/`

#### 统一入口 - `index.ts`
```typescript
// 流式调用 LLM
export async function* callLLMStream(
  messages: Message[],
  options?: LLMOptions,
  configOverride?: Partial<LLMConfig>
): AsyncGenerator<StreamChunk> {
  const provider = createProvider(config);
  yield* provider.stream(messages, options);
}
```

#### 流式数据块类型 - `types.ts`
```typescript
export type StreamChunk = 
  | { type: "text"; text: string }           // 文本内容
  | { type: "reasoning"; text: string }      // 推理内容
  | { type: "usage"; inputTokens, outputTokens, totalTokens }  // Token 统计
  | { type: "error"; error: string };        // 错误
```

#### Provider 实现示例 - `providers/deepseek.ts`
```typescript
async *stream(messages, options): AsyncGenerator<StreamChunk> {
  // 1. 调用 Rust 后端启动流式请求
  await invoke("llm_fetch_stream", { requestId, url, headers, body });
  
  // 2. 监听 Tauri Event 接收数据
  const unlisten = await listen<StreamEvent>(`llm-stream-${requestId}`, (event) => {
    // 解析 SSE 数据，推入队列
  });
  
  // 3. 从队列 yield 数据块
  while (true) {
    const chunk = await queue.shift();
    if (chunk.done) break;
    yield chunk;
  }
}
```

### 3. UI 层

#### 主聊天界面 - `src/components/layout/MainAIChatShell.tsx`

**状态获取**（使用 selector 确保正确重渲染）：
```typescript
const chatStreaming = useAIStore((state) => state.isStreaming);
const streamingContent = useAIStore((state) => state.streamingContent);
```

**流式消息渲染**（约第 772-802 行）：
```tsx
{/* Chat 模式的流式消息 - 直接渲染在消息列表中 */}
{chatMode === "chat" && chatStreaming && (
  <motion.div className="flex gap-3 mb-6">
    <BotAvatar />
    <div className="max-w-[80%] text-foreground">
      {streamingContent ? (
        <div className="prose prose-sm ...">
          <span dangerouslySetInnerHTML={{ __html: parseMarkdown(streamingContent) }} />
          {/* 闪烁光标 | */}
          <span className="inline-block w-0.5 h-4 bg-primary ml-0.5 animate-pulse" />
        </div>
      ) : (
        {/* 等待首个 token 的打字指示器 */}
        <BouncingDots />
      )}
    </div>
  </motion.div>
)}
```

#### 右侧面板/悬浮球 - `src/components/chat/ChatPanel.tsx`

**状态获取**（整体解构，因为组件较简单）：
```typescript
const { isStreaming, streamingContent, ... } = useAIStore();
```

**流式消息渲染**（约第 268-290 行）：
```tsx
{(isLoading || isStreaming) && (
  <div>
    {streamingContent ? (
      <div className="prose prose-sm ...">
        <span dangerouslySetInnerHTML={{ __html: parseMarkdown(streamingContent) }} />
        <span className="inline-block w-0.5 h-4 bg-primary animate-pulse" />
      </div>
    ) : (
      <BouncingDots />
    )}
  </div>
)}
```

### 4. Rust 后端 - `src-tauri/src/llm.rs`

```rust
#[tauri::command]
pub async fn llm_fetch_stream(
    app: AppHandle,
    request_id: String,
    url: String,
    headers: HashMap<String, String>,
    body: String,
) -> Result<(), String> {
    // 1. 发起 HTTP 请求
    // 2. 读取响应流
    // 3. 通过 Tauri Event 推送数据到前端
    app.emit(&format!("llm-stream-{}", request_id), payload)?;
}
```

---

## 关键设计点

### 1. 状态更新合并
```typescript
// ❌ 错误：两次 set 会导致闪烁
set({ isStreaming: false, streamingContent: "" });
set({ messages: [...messages, newMessage] });

// ✅ 正确：合并为一次 set
set((state) => ({
  messages: [...state.messages, newMessage],
  isStreaming: false,
  streamingContent: "",
}));
```

### 2. Zustand Selector 确保重渲染
```typescript
// ❌ 可能不触发重渲染（在复杂组件中）
const { isStreaming } = useAIStore();

// ✅ 明确订阅，确保重渲染
const isStreaming = useAIStore((state) => state.isStreaming);
```

### 3. 流式与普通消息样式统一
```tsx
// 流式消息和普通消息使用相同的样式类
className="prose prose-sm dark:prose-invert max-w-none"
```

### 4. 光标效果
```tsx
// 闪烁竖线光标
<span 
  className="inline-block w-0.5 h-4 bg-primary ml-0.5 align-middle animate-pulse"
  style={{ animationDuration: '1s' }}
/>
```

---

## Agent 流式支持复用分析

### 可直接复用 ✅

| 组件/模块 | 说明 |
|----------|------|
| `callLLMStream()` | LLM 流式调用入口，与业务无关 |
| 所有 Provider 的 `stream()` | 已实现的流式提供商 |
| `src-tauri/src/llm.rs` | Rust 后端流式请求 |
| 光标和打字指示器样式 | CSS 动画 |
| `parseMarkdown()` | Markdown 渲染 |

### 需要新增 🔧

| 组件/模块 | 说明 |
|----------|------|
| `useAgentStore` 状态 | 新增 `isStreaming`, `streamingContent` |
| `AgentLoop.ts` 流式方法 | 类似 `sendMessageStream`，但需处理工具调用 |
| UI 渲染逻辑 | 在 `MainAIChatShell` 的 Agent 区域添加流式渲染 |

### Agent 流式实现建议

```typescript
// useAgentStore.ts 新增状态
interface AgentState {
  isStreaming: boolean;
  streamingContent: string;
  // ...
}

// AgentLoop.ts 新增流式方法
async runTaskStream(userMessage: string, context: TaskContext) {
  for await (const chunk of callLLMStream(messages)) {
    if (chunk.type === "text") {
      // 检测工具调用标记
      if (chunk.text.includes("<tool_name>")) {
        // 暂停流式，执行工具
      } else {
        set({ streamingContent: content });
      }
    }
  }
}
```

### Agent 流式的特殊挑战

1. **工具调用中断**：流式过程中检测到 `<tool_name>` 标签需要暂停
2. **多轮对话**：Agent 可能有多轮 LLM 调用，每轮都需要流式
3. **审批流程**：工具审批期间流式状态的处理
4. **状态回退**：工具执行失败时的流式内容回滚

---

## 测试要点

1. **正常流式**：消息逐字显示，光标闪烁
2. **空响应**：首个 token 前显示打字指示器
3. **中断**：点击停止按钮能正确终止
4. **切换会话**：流式中切换会话不会出错
5. **样式一致**：流式消息和普通消息无视觉差异
6. **多端同步**：主界面、右侧面板、悬浮球都正常显示

---

## 相关文件索引

```
src/
├── stores/
│   └── useAIStore.ts          # 核心状态管理
├── services/llm/
│   ├── index.ts               # callLLMStream 入口
│   ├── types.ts               # StreamChunk 类型
│   └── providers/
│       ├── deepseek.ts        # DeepSeek 流式实现
│       ├── openai.ts          # OpenAI 流式实现
│       └── ...
├── components/
│   ├── layout/
│   │   └── MainAIChatShell.tsx  # 主聊天界面
│   └── chat/
│       ├── ChatPanel.tsx        # 右侧面板/悬浮球
│       └── StreamingMessage.tsx # 独立组件（当前未使用）
└── lib/
    └── markdown.ts            # Markdown 渲染

src-tauri/src/
└── llm.rs                     # Rust 流式请求
```

---

## ✅ Agent 消息渲染优化（2025-12-04 完成）

### 问题背景

1. **消息气泡问题**：Agent 每轮循环输出都被渲染成独立的消息卡片
2. **FC 模式兼容**：DeepSeek 等 Function Calling 模式下，工具调用不在文本中
3. **最终回答不显示**：`attempt_completion` 的 result 在 FC 模式下丢失

### 解决方案

#### 1. AgentLoop.ts 修改

**FC 模式工具调用转 XML**（便于前端解析）：
```typescript
// 第 186-195 行
if (isFCMode && toolCalls.length > 0) {
  const toolCallsXml = toolCalls.map(tc => {
    const paramsXml = Object.entries(tc.params)
      .map(([key, value]) => `<${key}>${value}</${key}>`)
      .join('\n');
    return `<${tc.name}>\n${paramsXml}\n</${tc.name}>`;
  }).join('\n\n');
  assistantContent = `${response.content}\n\n${toolCallsXml}`;
}
```

**attempt_completion 结果保存**：
```typescript
// 第 324-333 行
if (toolCall.name === "attempt_completion" && result.success) {
  const completionResult = toolCall.params.result as string;
  if (completionResult) {
    this.stateManager.addMessage({
      role: "assistant",
      content: `<attempt_completion_result>\n${completionResult}\n</attempt_completion_result>`,
    });
  }
}
```

#### 2. AgentMessageRenderer.tsx（新建）

**核心功能**：
- 按"轮次"分组渲染（用户消息 → 该轮所有 assistant 消息）
- 聚合工具调用到一个区域
- 思考/工具折叠显示（小字灰色）
- 任务完成后自动折叠成一行摘要
- 展开/折叠动画（framer-motion）

**关键组件**：
```typescript
// ProcessStepsBlock - 根据任务状态自动展开/折叠
function ProcessStepsBlock({
  thinkingBlocks,
  toolCalls,
  totalSteps,
  isRunning,  // 运行中展开，完成后折叠
}) {
  const [manualExpanded, setManualExpanded] = useState(false);
  const isExpanded = isRunning || manualExpanded;
  // ...
}

// ThinkingCollapsible - 思考块折叠
// ToolCallCollapsible - 工具调用折叠
```

**摘要生成**（优先显示参数）：
```typescript
function getToolSummary(name: string, params: string, result?: string): string {
  if (name === "list_notes") {
    const dirMatch = params.match(/目录:\s*([^\s|]+)/);
    if (dirMatch) return `目录: ${dirMatch[1]}`;
  }
  // ...
}
```

#### 3. UI 层修改

**MainAIChatShell.tsx**：
```tsx
{chatMode === "agent" ? (
  <AgentMessageRenderer 
    messages={agentMessages} 
    isRunning={agentStatus === "running"} 
  />
) : (
  // Chat 模式渲染
)}
```

**AgentPanel.tsx**（右侧面板/悬浮球）：
```tsx
<AgentMessageRenderer 
  messages={messages} 
  isRunning={status === "running"} 
/>
```

### 最终效果

```
用户: 帮我看看工作区

┌────────────────────────────────────────┐
│ > 🔧 9 个步骤: list_notes, read_note   │  ← 完成后折叠
└────────────────────────────────────────┘
                    ↓ 点击展开
┌────────────────────────────────────────┐
│ ∨ 🔧 9 个步骤                          │
│   > 🔧 list_notes ✓ 目录: /            │  ← 每个工具显示参数
│   > 🔧 list_notes ✓ 目录: 01_极限      │
│   > 🔧 read_note ✓ 文件: xxx.md        │
│   ...                                  │
└────────────────────────────────────────┘

📁 工作区文件结构                          ← 最终回答突出显示
1. 按章节分类的目录...
```

---

## 🔮 Agent 流式开发指南（TODO）

### 可复用的组件和接口

| 组件/接口 | 位置 | 说明 |
|----------|------|------|
| `callLLMStream()` | `src/services/llm/index.ts` | 流式调用 LLM，返回 `AsyncGenerator<StreamChunk>` |
| `StreamChunk` 类型 | `src/services/llm/types.ts` | `text` / `reasoning` / `usage` / `error` |
| 所有 Provider `stream()` | `src/services/llm/providers/` | 已实现 8 个提供商的流式 |
| `llm_fetch_stream` | `src-tauri/src/llm.rs` | Rust 后端流式请求 |
| `AgentMessageRenderer` | `src/components/chat/` | **可直接复用** - 已支持 `isRunning` 状态 |
| `ProcessStepsBlock` | 同上 | 运行时展开，完成时折叠 |
| `parseMarkdown()` | `src/lib/markdown.ts` | Markdown 渲染 |

### useAgentStore 需要新增的状态

```typescript
interface AgentState {
  // 现有
  status: AgentStatus;
  messages: Message[];
  
  // 流式新增
  isStreaming: boolean;           // 是否正在流式
  streamingContent: string;       // 当前流式内容
  streamingReasoning: string;     // 推理内容（DeepSeek R1）
}
```

### AgentLoop 流式方法建议

```typescript
// AgentLoop.ts
async *runLoopStream(context: TaskContext): AsyncGenerator<AgentStreamEvent> {
  while (shouldContinue) {
    // 1. 流式调用 LLM
    for await (const chunk of callLLMStream(messages, options)) {
      if (chunk.type === "text") {
        currentContent += chunk.text;
        
        // 2. 检测工具调用标签
        const toolMatch = currentContent.match(/<(\w+)>/);
        if (toolMatch && isToolTag(toolMatch[1])) {
          // 暂停流式，等待完整工具调用
          yield { type: "tool_detecting", toolName: toolMatch[1] };
        } else {
          // 正常流式输出
          yield { type: "text", text: chunk.text };
        }
      }
    }
    
    // 3. 解析工具调用
    const { toolCalls, isCompletion } = parseResponse(currentContent);
    
    // 4. 执行工具
    if (toolCalls.length > 0) {
      for (const tool of toolCalls) {
        yield { type: "tool_start", tool };
        const result = await executeTool(tool);
        yield { type: "tool_end", tool, result };
      }
    }
    
    if (isCompletion) break;
  }
}
```

### AgentStreamEvent 类型

```typescript
type AgentStreamEvent = 
  | { type: "text"; text: string }              // 流式文本
  | { type: "reasoning"; text: string }         // 推理内容
  | { type: "tool_detecting"; toolName: string }// 检测到工具
  | { type: "tool_start"; tool: ToolCall }      // 工具开始执行
  | { type: "tool_end"; tool: ToolCall; result: ToolResult }  // 工具执行完成
  | { type: "completion"; content: string }     // 任务完成
  | { type: "error"; error: string };           // 错误
```

### UI 层流式渲染建议

```tsx
// MainAIChatShell.tsx 或 AgentMessageRenderer.tsx
{agentStreaming && (
  <motion.div className="flex gap-3 mb-4">
    <BotAvatar />
    <div className="flex-1 min-w-0 space-y-2">
      {/* 当前流式内容 */}
      <div className="prose prose-sm">
        <span dangerouslySetInnerHTML={{ __html: parseMarkdown(streamingContent) }} />
        <span className="w-0.5 h-4 bg-primary animate-pulse" />
      </div>
      
      {/* 检测到工具时显示 */}
      {detectingTool && (
        <div className="text-xs text-muted-foreground">
          🔧 检测到工具调用: {detectingTool}...
        </div>
      )}
    </div>
  </motion.div>
)}
```

### 特殊挑战和解决思路

| 挑战 | 解决思路 |
|------|----------|
| **工具调用中断** | 检测到 `<tool_name>` 标签时暂停流式，缓存内容，等待完整标签 |
| **多轮对话** | 每轮 LLM 调用独立流式，通过 `yield` 事件区分轮次 |
| **审批流程** | 工具审批期间暂停生成器，用户操作后 `continue` |
| **状态回退** | 工具执行失败时，清空当前轮的 `streamingContent` |
| **FC 模式** | FC 模式不支持流式工具调用，需要等待完整响应后解析 |

### 实现优先级

1. **Phase 1**：基础流式输出（文本 token 逐字显示）
2. **Phase 2**：工具调用检测和中断
3. **Phase 3**：多轮对话流式
4. **Phase 4**：推理内容流式（DeepSeek R1 等）
