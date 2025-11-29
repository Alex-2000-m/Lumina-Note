# Lumina Note 架构概览

> 帮助新开发者快速理解和上手项目

---

## 📋 目录

1. [项目概述](#1-项目概述)
2. [技术栈](#2-技术栈)
3. [项目结构](#3-项目结构)
4. [前端架构](#4-前端架构)
5. [后端架构](#5-后端架构)
6. [AI Agent 系统](#6-ai-agent-系统)
7. [RAG 搜索系统](#7-rag-搜索系统)
8. [数据流](#8-数据流)
9. [开发环境配置](#9-开发环境配置)
10. [核心文件速查](#10-核心文件速查)

---

## 1. 项目概述

**Lumina Note** 是一个本地优先、AI 驱动的 Markdown 笔记应用。主要特点：

- 🏠 **本地优先**: 所有数据存储在本地，保护隐私
- 🤖 **AI Agent**: 具备工具调用能力的智能助手，可自动执行读取、编辑、搜索等任务
- 🔍 **语义搜索 (RAG)**: 基于向量数据库的语义检索
- 📝 **沉浸式编辑**: 多模式切换（源码/预览/阅读模式）
- 🔗 **双向链接**: WikiLinks 支持构建知识图谱
- 🎨 **现代 UI**: 基于 Tailwind CSS 的美观界面

---

## 2. 技术栈

### 前端 (Web)
| 技术 | 用途 | 版本 |
|------|------|------|
| **React** | UI 框架 | 18.x |
| **TypeScript** | 类型安全 | 5.x |
| **Vite** | 构建工具 | 5.x |
| **Tailwind CSS** | 样式 | 3.x |
| **Zustand** | 状态管理 | 5.x |
| **CodeMirror 6** | 代码编辑器 | 6.x |
| **TipTap** | 富文本编辑 | 2.x |
| **Lucide React** | 图标库 | - |

### 后端 (Native)
| 技术 | 用途 | 版本 |
|------|------|------|
| **Tauri v2** | 原生应用框架 | 2.0 |
| **Rust** | 后端逻辑 | 1.70+ |
| **SQLite** | 向量数据库 | - |
| **rusqlite** | SQLite 绑定 | 0.32 |
| **tokio** | 异步运行时 | 1.40 |
| **notify** | 文件监听 | 6.1 |

### AI 服务
支持多个 LLM Provider：
- Anthropic (Claude)
- OpenAI (GPT)
- DeepSeek
- Moonshot
- Groq
- OpenRouter
- Ollama (本地)

---

## 3. 项目结构

```
lumina-note/
├── 📁 src/                     # 前端源码
│   ├── 📄 App.tsx              # 应用入口组件
│   ├── 📄 main.tsx             # React 入口点
│   │
│   ├── 📁 agent/               # 🤖 AI Agent 核心
│   │   ├── core/               # Agent 循环、状态管理
│   │   ├── prompts/            # System Prompt 构建
│   │   ├── providers/          # LLM 调用封装
│   │   ├── tools/              # 工具定义与执行器
│   │   ├── modes/              # Agent 模式 (编辑/整理/研究/写作)
│   │   └── types.ts            # 类型定义
│   │
│   ├── 📁 components/          # React UI 组件
│   │   ├── AIFloatingBall.tsx  # AI 悬浮球
│   │   ├── AIFloatingPanel.tsx # AI 面板
│   │   ├── AgentPanel.tsx      # Agent 对话面板
│   │   ├── CommandPalette.tsx  # 命令面板 (Ctrl+P)
│   │   ├── DiffView.tsx        # Diff 预览视图
│   │   ├── GlobalSearch.tsx    # 全局搜索
│   │   ├── KnowledgeGraph.tsx  # 知识图谱
│   │   ├── Sidebar.tsx         # 文件树侧边栏
│   │   ├── RightPanel.tsx      # 右侧面板
│   │   └── TabBar.tsx          # 标签栏
│   │
│   ├── 📁 editor/              # 编辑器相关
│   │   ├── CodeMirrorEditor.tsx  # CodeMirror 编辑器
│   │   ├── Editor.tsx            # 编辑器容器
│   │   ├── ReadingView.tsx       # 阅读模式
│   │   └── extensions/           # CodeMirror 扩展
│   │
│   ├── 📁 services/            # 服务层
│   │   ├── llm/                # LLM 客户端
│   │   │   ├── config.ts       # 配置
│   │   │   ├── types.ts        # 类型
│   │   │   └── providers/      # 各 Provider 实现
│   │   │       ├── anthropic.ts
│   │   │       ├── openai.ts
│   │   │       ├── deepseek.ts
│   │   │       └── ...
│   │   │
│   │   └── rag/                # RAG 系统
│   │       ├── manager.ts      # RAG 管理器
│   │       ├── embedder.ts     # Embedding 服务
│   │       ├── chunker.ts      # Markdown 分块器
│   │       └── vectorStore.ts  # 向量存储 (Tauri wrapper)
│   │
│   ├── 📁 stores/              # Zustand 状态管理
│   │   ├── useFileStore.ts     # 文件/标签页状态
│   │   ├── useAIStore.ts       # AI 对话状态
│   │   ├── useAgentStore.ts    # Agent 状态
│   │   ├── useUIStore.ts       # UI 状态
│   │   ├── useRAGStore.ts      # RAG 配置状态
│   │   └── useNoteIndexStore.ts  # 笔记索引状态
│   │
│   ├── 📁 lib/                 # 工具库
│   │   ├── tauri.ts            # Tauri 命令封装
│   │   ├── ai.ts               # AI 辅助函数
│   │   ├── markdown.ts         # Markdown 处理
│   │   └── utils.ts            # 通用工具
│   │
│   ├── 📁 types/               # 类型定义
│   └── 📁 styles/              # 样式文件
│
├── 📁 src-tauri/               # Rust 后端
│   ├── 📄 Cargo.toml           # Rust 依赖配置
│   ├── 📄 tauri.conf.json      # Tauri 配置
│   │
│   └── 📁 src/
│       ├── 📄 main.rs          # Tauri 入口
│       ├── 📄 lib.rs           # 库入口/模块导出
│       ├── 📄 error.rs         # 错误处理
│       │
│       ├── 📁 commands/        # Tauri 命令
│       │   └── mod.rs          # 文件操作命令
│       │
│       ├── 📁 fs/              # 文件系统
│       │   ├── manager.rs      # 文件管理
│       │   ├── watcher.rs      # 文件监听
│       │   └── mod.rs
│       │
│       └── 📁 vector_db/       # 向量数据库
│           ├── mod.rs          # 核心实现
│           └── commands.rs     # Tauri 命令
│
├── 📁 docs/                    # 文档
├── 📁 public/                  # 静态资源
├── 📄 package.json             # NPM 配置
├── 📄 vite.config.ts           # Vite 配置
├── 📄 tailwind.config.js       # Tailwind 配置
└── 📄 tsconfig.json            # TypeScript 配置
```

---

## 4. 前端架构

### 4.1 组件层次

```
App.tsx
├── Ribbon (左侧图标栏)
├── Sidebar (文件树)
├── Main Content
│   ├── TabBar
│   ├── Editor / ReadingView / KnowledgeGraph
│   └── SplitEditor (分屏模式)
├── RightPanel (AI/Agent 面板)
├── CommandPalette (模态框)
├── GlobalSearch (模态框)
├── DiffView (AI 修改预览)
└── AIFloatingBall (悬浮球)
```

### 4.2 状态管理 (Zustand)

| Store | 职责 | 持久化 |
|-------|------|--------|
| `useFileStore` | 文件、标签页、撤销/重做历史 | ✅ (vaultPath) |
| `useUIStore` | 侧边栏宽度、主题、视图模式 | ✅ |
| `useAIStore` | AI 对话消息、待处理 Diff | ❌ |
| `useAgentStore` | Agent 状态、配置 | ✅ (配置) |
| `useRAGStore` | RAG 配置、索引状态 | ✅ |
| `useNoteIndexStore` | 笔记索引 (用于搜索/链接) | ❌ |

### 4.3 关键流程

#### 打开文件
```
用户点击 -> Sidebar -> useFileStore.openFile()
  -> 创建 Tab -> 加载文件内容 -> 更新 Editor
```

#### AI 编辑
```
用户发送消息 -> useAIStore.sendMessage()
  -> LLM 返回修改建议 -> 解析 SEARCH/REPLACE
  -> 设置 pendingDiff -> 显示 DiffView
  -> 用户确认 -> 应用修改 -> 保存文件
```

---

## 5. 后端架构

### 5.1 Tauri 命令

在 `src-tauri/src/commands/mod.rs` 中定义：

| 命令 | 功能 |
|------|------|
| `read_file` | 读取文件内容 |
| `save_file` | 保存文件内容 |
| `list_directory` | 递归列出目录 |
| `create_file` | 创建新文件 |
| `delete_file` | 删除文件/目录 |
| `rename_file` | 重命名/移动文件 |

向量数据库命令 (`src-tauri/src/vector_db/commands.rs`)：

| 命令 | 功能 |
|------|------|
| `init_vector_db` | 初始化 SQLite 数据库 |
| `upsert_vector_chunks` | 插入/更新向量 |
| `search_vector_chunks` | 向量相似性搜索 |
| `delete_file_vectors` | 删除文件相关向量 |
| `get_vector_index_status` | 获取索引状态 |

### 5.2 文件类型

```rust
// FileEntry - 文件树节点
pub struct FileEntry {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
    pub children: Option<Vec<FileEntry>>,
}

// VectorChunk - 向量存储单元
pub struct VectorChunk {
    pub id: String,
    pub vector: Vec<f32>,
    pub content: String,
    pub file_path: String,
    pub heading: String,
    pub start_line: i32,
    pub end_line: i32,
}
```

---

## 6. AI Agent 系统

### 6.1 核心组件

```
AgentLoop (循环控制)
    ├── StateManager (状态管理)
    ├── MessageParser (XML 解析)
    ├── PromptBuilder (Prompt 构建)
    ├── ToolRegistry (工具注册)
    └── LLM Provider (模型调用)
```

### 6.2 Agent 循环

```typescript
while (status === "running") {
  // 1. 调用 LLM
  response = await callLLM(messages)
  
  // 2. 解析工具调用
  toolCalls = parseResponse(response)
  
  // 3. 执行工具 (可能需要用户审批)
  for (tool of toolCalls) {
    if (requiresApproval(tool)) {
      await waitForApproval()
    }
    result = await executeTool(tool)
    messages.push(formatResult(result))
  }
  
  // 4. 检查是否完成
  if (toolCalls.includes("attempt_completion")) {
    status = "completed"
  }
}
```

### 6.3 可用工具

| 工具 | 功能 | 需审批 |
|------|------|--------|
| `read_note` | 读取笔记内容 | ❌ |
| `edit_note` | 编辑笔记 (SEARCH/REPLACE) | ✅ |
| `write_note` | 创建新笔记 | ✅ |
| `list_notes` | 列出笔记目录 | ❌ |
| `move_note` | 移动/重命名笔记 | ✅ |
| `search_notes` | 语义搜索 (RAG) | ❌ |
| `attempt_completion` | 任务完成 | ❌ |

### 6.4 Agent 模式

| 模式 | 描述 | 可用工具 |
|------|------|----------|
| **编辑助手** | 优化 Markdown、改进结构 | read, edit, write, search |
| **整理大师** | 分类、重组笔记 | read, list, move, search |
| **研究助手** | 发现关联、生成摘要 | read, list, search |
| **写作助手** | 扩展想法、润色文字 | read, edit, write, search |

---

## 7. RAG 搜索系统

### 7.1 架构

```
                    +------------------+
                    |   RAG Manager    |
                    +--------+---------+
                             |
        +----------+---------+--------+----------+
        |          |                  |          |
   +----v----+ +---v----+      +------v-----+ +--v---+
   | Chunker | |Embedder|      |VectorStore | |Config|
   +---------+ +--------+      +------------+ +------+
        |          |                  |
        |    Embedding API     +------v------+
        |    (OpenAI/Ollama)   | SQLite (Rust)|
        |                      +-------------+
        v
  Markdown 分块 -> 生成向量 -> 存储到 SQLite
```

### 7.2 工作流程

1. **索引构建**
   - Markdown 文件按标题/段落分块
   - 调用 Embedding API 生成向量
   - 存储到本地 SQLite 数据库

2. **语义搜索**
   - 用户查询转换为向量
   - 计算余弦相似度
   - 返回最相关的笔记片段

### 7.3 分块策略

```typescript
// 按 Markdown 标题分块
# 标题 1  <- 开始新块
内容...

## 标题 2  <- 开始新块
内容...

// 每块最大约 2000 字符
```

---

## 8. 数据流

### 8.1 文件操作

```
React Component
    |
    v
useFileStore (Zustand)
    |
    v
lib/tauri.ts (invoke wrapper)
    |
    v
Tauri IPC Bridge
    |
    v
Rust Command (src-tauri/src/commands/)
    |
    v
File System
```

### 8.2 AI 对话

```
User Input
    |
    v
useAIStore / useAgentStore
    |
    v
services/llm/providers/*.ts
    |
    v
HTTP Request to LLM API
    |
    v
Parse Response -> Tool Calls
    |
    v
Execute Tools -> Update State
```

---

## 9. 开发环境配置

### 9.1 前置要求

- **Node.js**: 18.0+
- **Rust**: 1.70+
- **pnpm** 或 **npm**

### 9.2 安装依赖

```bash
# 安装前端依赖
npm install

# Rust 依赖会在首次运行时自动安装
```

### 9.3 开发命令

```bash
# 开发模式 (热重载)
npm run tauri dev

# 仅前端开发
npm run dev

# 构建生产版本
npm run tauri build

# 类型检查
npm run build  # 包含 tsc
```

### 9.4 调试技巧

- **前端**: 使用 Chrome DevTools (Tauri 窗口中右键 -> 检查)
- **Rust**: 在 `src-tauri/` 目录使用 `cargo build` 检查编译错误
- **日志**: 使用 `console.log()` (前端) 和 `println!()` (Rust)

---

## 10. 核心文件速查

### 必看文件

| 文件 | 说明 |
|------|------|
| `src/App.tsx` | 应用主入口，理解整体布局 |
| `src/stores/useFileStore.ts` | 核心状态管理，文件/标签页操作 |
| `src/agent/core/AgentLoop.ts` | Agent 主循环，理解 AI 如何工作 |
| `src/agent/tools/executors/` | 工具实现，了解具体操作 |
| `src/services/llm/providers/` | LLM 调用实现 |
| `src-tauri/src/commands/mod.rs` | Rust 命令入口 |
| `src-tauri/src/vector_db/mod.rs` | 向量数据库核心 |

### 快速定位

| 功能 | 位置 |
|------|------|
| 文件树 | `src/components/Sidebar.tsx` |
| 编辑器 | `src/editor/Editor.tsx` |
| AI 面板 | `src/components/AgentPanel.tsx` |
| Diff 预览 | `src/components/DiffView.tsx` |
| 命令面板 | `src/components/CommandPalette.tsx` |
| 快捷键 | `src/App.tsx` (useEffect 中的 handleKeyDown) |
| LLM 配置 | `src/services/llm/config.ts` |
| 工具定义 | `src/agent/tools/definitions/index.ts` |

---

## 快速入门建议

1. **先跑起来**: 运行 `npm run tauri dev` 体验应用
2. **看 App.tsx**: 理解整体布局和组件关系
3. **看 useFileStore**: 理解核心状态管理
4. **看 AgentLoop**: 理解 AI Agent 工作原理
5. **修改一个小功能**: 比如添加一个快捷键，验证理解

---

*文档更新日期: 2024-11-29*
