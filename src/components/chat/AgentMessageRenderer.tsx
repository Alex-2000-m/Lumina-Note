/**
 * Agent 消息渲染组件
 * 
 * 将 Agent 的消息渲染为：
 * - 思考过程：折叠显示，小字灰色
 * - 工具调用：折叠卡片，小字灰色
 * - 最终回答：正常大字体，Markdown 渲染
 */

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { parseMarkdown } from "@/lib/markdown";
import { Message } from "@/agent/types";
import {
  ChevronRight,
  ChevronDown,
  Wrench,
  Brain,
  Check,
  X,
  Loader2,
  Bot,
  Copy,
} from "lucide-react";

// ============ 类型定义 ============

interface ToolCallInfo {
  name: string;
  params: string;
  result?: string;
  success?: boolean;
}

interface ThinkingBlock {
  content: string;
  durationHint?: string; // 如 "3s"
}

interface ParsedAgentMessage {
  thinkingBlocks: ThinkingBlock[];
  toolCalls: ToolCallInfo[];
  finalAnswer: string; // attempt_completion 的 result 或清理后的文本
  rawTextBeforeCompletion: string; // 工具调用前的说明文字（通常不显示）
}

// ============ 解析函数 ============

/**
 * 解析 assistant 消息，提取思考、工具调用、最终回答
 */
function parseAssistantMessage(content: string, toolResults: Map<string, { result: string; success: boolean }>): ParsedAgentMessage {
  const thinkingBlocks: ThinkingBlock[] = [];
  const toolCalls: ToolCallInfo[] = [];
  let finalAnswer = "";
  let text = content;

  // 1. 提取 thinking 块
  const thinkingRegex = /<thinking>([\s\S]*?)<\/thinking>/g;
  let thinkingMatch;
  while ((thinkingMatch = thinkingRegex.exec(content)) !== null) {
    thinkingBlocks.push({ content: thinkingMatch[1].trim() });
  }
  text = text.replace(thinkingRegex, "");

  // 2. 提取 attempt_completion_result（我们添加的特殊标签）
  const completionResultMatch = text.match(/<attempt_completion_result>([\s\S]*?)<\/attempt_completion_result>/);
  if (completionResultMatch) {
    finalAnswer = completionResultMatch[1].trim();
    text = text.replace(/<attempt_completion_result>[\s\S]*?<\/attempt_completion_result>/, "");
  }

  // 3. 提取 attempt_completion（XML 模式）
  if (!finalAnswer) {
    const attemptMatch = text.match(/<attempt_completion>[\s\S]*?<result>([\s\S]*?)<\/result>[\s\S]*?<\/attempt_completion>/);
    if (attemptMatch) {
      finalAnswer = attemptMatch[1].trim();
    }
  }

  // 4. 提取工具调用
  const nonToolTags = ["thinking", "task", "current_note", "tool_result", "tool_error", "result",
                       "directory", "recursive", "paths", "path", "content", "edits", "search", "replace",
                       "attempt_completion", "attempt_completion_result", "related_notes"];
  const toolCallRegex = /<(\w+)>([\s\S]*?)<\/\1>/g;
  let match;
  
  while ((match = toolCallRegex.exec(content)) !== null) {
    const tagName = match[1];
    if (!nonToolTags.includes(tagName.toLowerCase())) {
      const params = match[2].trim();
      const resultData = toolResults.get(tagName);
      
      toolCalls.push({
        name: tagName,
        params: formatToolParams(params),
        result: resultData?.result,
        success: resultData?.success,
      });
    }
  }

  // 5. 清理剩余文本
  let rawTextBeforeCompletion = text
    .replace(/<[^>]+>[\s\S]*?<\/[^>]+>/g, "") // 移除所有标签对
    .replace(/<[^>]+>/g, "") // 移除单个标签
    .replace(/\s+/g, " ")
    .trim();

  // 移除 DeepSeek 的特殊标签
  rawTextBeforeCompletion = rawTextBeforeCompletion.replace(/<\|end_of_thinking\|>/g, "").trim();

  return {
    thinkingBlocks,
    toolCalls,
    finalAnswer,
    rawTextBeforeCompletion,
  };
}

/**
 * 格式化工具参数为可读形式
 */
function formatToolParams(params: string): string {
  const parts: string[] = [];
  
  const dirMatch = params.match(/<directory>([^<]*)<\/directory>/);
  if (dirMatch) parts.push(`目录: ${dirMatch[1] || "/"}`);
  
  const recursiveMatch = params.match(/<recursive>([^<]*)<\/recursive>/);
  if (recursiveMatch) parts.push(`递归: ${recursiveMatch[1]}`);
  
  const pathsMatch = params.match(/<paths>([^<]*)<\/paths>/);
  if (pathsMatch) parts.push(`路径: ${pathsMatch[1]}`);
  
  const pathMatch = params.match(/<path>([^<]*)<\/path>/);
  if (pathMatch) parts.push(`文件: ${pathMatch[1]}`);
  
  if (parts.length > 0) {
    return parts.join(" | ");
  }
  
  return params.replace(/<[^>]+>/g, " ").trim().slice(0, 100);
}

/**
 * 生成工具摘要 - 优先显示参数信息
 */
function getToolSummary(name: string, params: string, result?: string): string {
  // 优先从参数中提取关键信息
  if (name === "list_notes") {
    const dirMatch = params.match(/目录:\s*([^\s|]+)/);
    if (dirMatch) return `目录: ${dirMatch[1] || "/"}`;
  }
  if (name === "read_note") {
    const fileMatch = params.match(/文件:\s*([^\s|]+)/);
    if (fileMatch) return `文件: ${fileMatch[1]}`;
  }
  if (name === "create_note" || name === "edit_note") {
    const fileMatch = params.match(/文件:\s*([^\s|]+)/);
    if (fileMatch) return `文件: ${fileMatch[1]}`;
  }
  if (name === "search_notes" || name === "grep_search" || name === "semantic_search") {
    // 搜索工具显示搜索关键词
    return params.slice(0, 30) + (params.length > 30 ? "..." : "");
  }
  
  // 如果没有匹配到，显示参数摘要
  if (params) {
    return params.slice(0, 40) + (params.length > 40 ? "..." : "");
  }
  
  // 最后回退到结果
  if (result) {
    return result.length > 50 ? result.slice(0, 50) + "..." : result;
  }
  
  return "执行中...";
}

/**
 * 从所有消息中收集工具执行结果
 */
function collectToolResults(messages: Message[]): Map<string, { result: string; success: boolean }> {
  const toolResults = new Map<string, { result: string; success: boolean }>();
  
  messages.forEach(msg => {
    const content = msg.content;
    
    // 提取 tool_result
    const resultRegex = /<tool_result name="([^"]+)">([\s\S]*?)<\/tool_result>/g;
    let match;
    while ((match = resultRegex.exec(content)) !== null) {
      toolResults.set(match[1], { result: match[2].trim(), success: true });
    }
    
    // 提取 tool_error
    const errorRegex = /<tool_error name="([^"]+)">([\s\S]*?)<\/tool_error>/g;
    while ((match = errorRegex.exec(content)) !== null) {
      toolResults.set(match[1], { result: match[2].trim(), success: false });
    }
  });
  
  return toolResults;
}

/**
 * 判断 user 消息是否应该跳过（工具结果、系统提示等）
 */
function shouldSkipUserMessage(content: string): boolean {
  return content.includes("<tool_result") || 
         content.includes("<tool_error") ||
         content.includes("你的响应没有包含有效的工具调用") ||
         content.includes("请使用 <thinking> 标签分析错误原因") ||
         content.includes("系统错误:") ||
         content.includes("系统拒绝执行") ||
         content.includes("用户拒绝了工具调用");
}

/**
 * 清理 user 消息显示内容
 */
function cleanUserMessage(content: string): string {
  return content
    .replace(/<task>([\s\S]*?)<\/task>/g, "$1")
    .replace(/<current_note[^>]*>[\s\S]*?<\/current_note>/g, "")
    .replace(/<related_notes[^>]*>[\s\S]*?<\/related_notes>/g, "")
    .trim();
}

// ============ 子组件 ============

/**
 * 过程步骤块 - 根据任务状态决定展开/折叠
 * - 运行中：展开显示每个步骤
 * - 完成后：折叠成一行摘要
 */
function ProcessStepsBlock({
  thinkingBlocks,
  toolCalls,
  totalSteps,
  isRunning,
}: {
  thinkingBlocks: ThinkingBlock[];
  toolCalls: ToolCallInfo[];
  totalSteps: number;
  isRunning: boolean;
}) {
  const [manualExpanded, setManualExpanded] = useState(false);
  
  // 运行中自动展开，完成后自动折叠（除非用户手动展开）
  const isExpanded = isRunning || manualExpanded;
  
  // 生成摘要文字
  const toolNames = [...new Set(toolCalls.map(t => t.name))];
  const summaryText = toolNames.length > 0 
    ? `${toolNames.slice(0, 2).join(", ")}${toolNames.length > 2 ? "..." : ""}`
    : "思考";
  
  return (
    <div className="bg-muted/20 rounded-lg overflow-hidden">
      {/* 折叠头部 - 始终显示 */}
      <button
        onClick={() => setManualExpanded(!manualExpanded)}
        className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors"
      >
        {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Wrench size={12} />
        <span>{totalSteps} 个步骤{!isExpanded && `: ${summaryText}`}</span>
      </button>
      
      {/* 展开内容 - 带动画 */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-1.5 space-y-px">
              {thinkingBlocks.map((thinking, i) => (
                <ThinkingCollapsible key={`thinking-${i}`} thinking={thinking} />
              ))}
              {toolCalls.map((tool, i) => (
                <ToolCallCollapsible key={`tool-${i}`} tool={tool} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * 思考块折叠组件
 */
function ThinkingCollapsible({ thinking }: { thinking: ThinkingBlock }) {
  const [expanded, setExpanded] = useState(false);
  
  return (
    <div className="text-xs text-muted-foreground/70">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 hover:text-muted-foreground transition-colors py-0.5"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Brain size={12} />
        <span>思考中...</span>
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="pl-5 py-1 text-[11px] text-muted-foreground/60 whitespace-pre-wrap border-l border-muted-foreground/20 ml-1.5">
              {thinking.content}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * 工具调用折叠卡片
 */
function ToolCallCollapsible({ tool }: { tool: ToolCallInfo }) {
  const [expanded, setExpanded] = useState(false);
  const isComplete = tool.result !== undefined;
  const summary = getToolSummary(tool.name, tool.params, tool.result);
  
  return (
    <div className="text-xs text-muted-foreground/70">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 hover:text-muted-foreground transition-colors py-0.5 w-full text-left"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Wrench size={12} />
        <span className="font-medium">{tool.name}</span>
        
        {/* 状态图标 */}
        {isComplete ? (
          tool.success ? (
            <Check size={12} className="text-green-500/70" />
          ) : (
            <X size={12} className="text-red-500/70" />
          )
        ) : (
          <Loader2 size={12} className="animate-spin" />
        )}
        
        {/* 摘要 */}
        <span className="truncate flex-1 opacity-70">{summary}</span>
      </button>
      
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="pl-5 py-1 space-y-1 border-l border-muted-foreground/20 ml-1.5">
              {tool.params && (
                <div>
                  <div className="text-[10px] text-muted-foreground/50 mb-0.5">参数:</div>
                  <pre className="text-[10px] bg-muted/30 p-1.5 rounded overflow-x-auto">
                    {tool.params}
                  </pre>
                </div>
              )}
              {tool.result && (
                <div>
                  <div className="text-[10px] text-muted-foreground/50 mb-0.5">结果:</div>
                  <pre className="text-[10px] bg-muted/30 p-1.5 rounded overflow-x-auto max-h-32 overflow-y-auto">
                    {tool.result}
                  </pre>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============ 主组件 ============

interface AgentMessageRendererProps {
  messages: Message[];
  isRunning: boolean;
  className?: string;
}

/**
 * Agent 消息列表渲染器
 * 
 * 核心逻辑：将消息按"轮次"分组
 * - 每轮以用户消息开始
 * - 该轮内所有 assistant 消息的工具调用合并显示
 * - 最后一条 assistant 消息的 finalAnswer 作为最终回答
 */
export function AgentMessageRenderer({ messages, isRunning, className = "" }: AgentMessageRendererProps) {
  // 收集所有工具结果
  const toolResults = useMemo(() => collectToolResults(messages), [messages]);
  
  // 按轮次分组渲染
  const renderedContent = useMemo(() => {
    const elements: JSX.Element[] = [];
    
    // 找到所有用户消息的索引，用于分组
    const userMessageIndices: number[] = [];
    messages.forEach((msg, idx) => {
      if (msg.role === "user" && !shouldSkipUserMessage(msg.content)) {
        userMessageIndices.push(idx);
      }
    });
    
    // 按轮次处理
    userMessageIndices.forEach((userIdx, roundIndex) => {
      const userMsg = messages[userIdx];
      const displayContent = cleanUserMessage(userMsg.content);
      
      if (!displayContent) return;
      
      // 渲染用户消息
      elements.push(
        <motion.div 
          key={`user-${userIdx}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex justify-end mb-4"
        >
          <div className="max-w-[80%] bg-muted text-foreground rounded-2xl rounded-tr-sm px-4 py-2.5">
            <span className="text-sm">{displayContent}</span>
          </div>
        </motion.div>
      );
      
      // 找到这轮的所有 assistant 消息（从当前 user 到下一个 user 之间）
      const nextUserIdx = userMessageIndices[roundIndex + 1] ?? messages.length;
      const assistantMessages = messages.slice(userIdx + 1, nextUserIdx).filter(m => m.role === "assistant");
      
      if (assistantMessages.length === 0) return;
      
      // 聚合这轮所有 assistant 消息的内容
      const allThinkingBlocks: ThinkingBlock[] = [];
      const allToolCalls: ToolCallInfo[] = [];
      let finalAnswer = "";
      
      assistantMessages.forEach(msg => {
        const parsed = parseAssistantMessage(msg.content, toolResults);
        allThinkingBlocks.push(...parsed.thinkingBlocks);
        allToolCalls.push(...parsed.toolCalls);
        // 最终回答取最后一个非空的
        if (parsed.finalAnswer) {
          finalAnswer = parsed.finalAnswer;
        }
      });
      
      // 跳过没有内容的轮次
      if (allThinkingBlocks.length === 0 && allToolCalls.length === 0 && !finalAnswer) {
        return;
      }
      
      // 渲染这轮的 AI 回复
      const hasProcessSteps = allThinkingBlocks.length > 0 || allToolCalls.length > 0;
      const totalSteps = allThinkingBlocks.length + allToolCalls.length;
      
      elements.push(
        <motion.div 
          key={`assistant-round-${roundIndex}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex gap-3 mb-4"
        >
          <div className="w-8 h-8 rounded-full bg-background border border-border flex items-center justify-center shrink-0">
            <Bot size={16} className="text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            {/* 过程步骤：思考 + 工具调用 */}
            {hasProcessSteps && (
              <ProcessStepsBlock
                thinkingBlocks={allThinkingBlocks}
                toolCalls={allToolCalls}
                totalSteps={totalSteps}
                isRunning={isRunning}
              />
            )}
            
            {/* 最终回答 */}
            {finalAnswer && (
              <div 
                className="prose prose-sm dark:prose-invert max-w-none leading-relaxed"
                dangerouslySetInnerHTML={{ __html: parseMarkdown(finalAnswer) }}
              />
            )}
          </div>
        </motion.div>
      );
    });
    
    return elements;
  }, [messages, toolResults, isRunning]);
  
  return (
    <div className={className}>
      {renderedContent}
    </div>
  );
}

/**
 * 复制按钮组件
 */
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  return (
    <button
      onClick={handleCopy}
      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
      title="复制"
    >
      {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
    </button>
  );
}

export default AgentMessageRenderer;
