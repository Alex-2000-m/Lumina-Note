/**
 * 可折叠的对话历史列表组件
 * 参考设计：默认折叠显示图标，展开显示完整列表
 */

import { useState } from "react";
import { useUIStore } from "@/stores/useUIStore";
import { useAIStore } from "@/stores/useAIStore";
import { useAgentStore } from "@/stores/useAgentStore";
import { useRustAgentStore } from "@/stores/useRustAgentStore";
import { useDeepResearchStore } from "@/stores/useDeepResearchStore";
import {
  Bot,
  MessageSquare,
  Plus,
  Trash2,
  PanelLeftClose,
  PanelLeftOpen,
  Microscope,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocaleStore } from "@/stores/useLocaleStore";

// 使用 Rust Agent（与 MainAIChatShell 保持一致）
const USE_RUST_AGENT = true;

interface ConversationListProps {
  className?: string;
}

export function ConversationList({ className }: ConversationListProps) {
  const { t } = useLocaleStore();
  const { chatMode } = useUIStore();
  const [isExpanded, setIsExpanded] = useState(false);

  // Chat mode sessions
  const {
    sessions: chatSessions,
    currentSessionId: chatCurrentId,
    createSession: createChatSession,
    deleteSession: deleteChatSession,
    switchSession: switchChatSession,
  } = useAIStore();

  // Agent mode sessions - 根据开关选择 store
  const legacyAgentStore = useAgentStore();
  const rustAgentStore = useRustAgentStore();
  
  const agentSessions = USE_RUST_AGENT ? rustAgentStore.sessions : legacyAgentStore.sessions;
  const agentCurrentId = USE_RUST_AGENT ? rustAgentStore.currentSessionId : legacyAgentStore.currentSessionId;
  const createAgentSession = USE_RUST_AGENT ? rustAgentStore.createSession : legacyAgentStore.createSession;
  const deleteAgentSession = USE_RUST_AGENT ? rustAgentStore.deleteSession : legacyAgentStore.deleteSession;
  const switchAgentSession = USE_RUST_AGENT ? rustAgentStore.switchSession : legacyAgentStore.switchSession;

  // Deep Research sessions
  const {
    sessions: researchSessions,
    selectedSessionId: researchSelectedId,
    selectSession: selectResearchSession,
    deleteSession: deleteResearchSession,
  } = useDeepResearchStore();

  // 合并所有会话并标记类型，按更新时间排序
  const allSessions = [
    ...agentSessions.map((s) => ({ ...s, type: "agent" as const })),
    ...chatSessions.map((s) => ({ ...s, type: "chat" as const })),
    ...researchSessions.map((s) => ({ 
      ...s, 
      type: "research" as const,
      // 统一时间戳格式（Research 用 Date，其他用 number）
      updatedAt: (s.completedAt || s.startedAt).getTime(),
    })),
  ].sort((a, b) => b.updatedAt - a.updatedAt);

  const handleNewConversation = () => {
    if (chatMode === "agent") {
      // 手动新建对话时直接创建新的 Agent 会话
      createAgentSession();
    } else {
      // 手动新建对话时直接创建新的 Chat 会话
      createChatSession();
    }
  };

  const handleSwitchSession = (id: string, type: "agent" | "chat" | "research") => {
    if (type === "agent") {
      switchAgentSession(id);
      // 如果当前不是 agent 模式，切换过去
      if (chatMode !== "agent") {
        useUIStore.getState().setChatMode("agent");
      }
    } else if (type === "research") {
      // Deep Research - 选中会话后可以查看详情
      selectResearchSession(id);
      // TODO: 可以在这里触发显示研究详情的 UI
    } else {
      switchChatSession(id);
      if (chatMode !== "chat") {
        useUIStore.getState().setChatMode("chat");
      }
    }
  };

  const handleDeleteSession = (e: React.MouseEvent, id: string, type: "agent" | "chat" | "research") => {
    e.stopPropagation();
    if (type === "agent") {
      deleteAgentSession(id);
    } else if (type === "research") {
      deleteResearchSession(id);
    } else {
      deleteChatSession(id);
    }
  };

  const isCurrentSession = (id: string, type: "agent" | "chat" | "research") => {
    if (type === "agent") {
      return chatMode === "agent" && agentCurrentId === id;
    }
    if (type === "research") {
      return researchSelectedId === id;
    }
    return chatMode === "chat" && chatCurrentId === id;
  };

  return (
    <div
      className={cn(
        "flex flex-col border-r border-border bg-muted/30 transition-all duration-300 ease-in-out",
        isExpanded ? "w-48" : "w-12",
        className
      )}
    >
      {/* 顶部：折叠按钮 + 新建按钮 */}
      <div className="p-2 border-b border-border flex flex-col gap-2 items-center">
        {/* 折叠/展开按钮 */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md transition-colors w-full flex justify-center"
          title={isExpanded ? t.conversationList.collapseList : t.conversationList.expandList}
        >
          {isExpanded ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
        </button>

        {/* 新建对话按钮 */}
        <button
          onClick={handleNewConversation}
          className={cn(
            "flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-all",
            isExpanded ? "w-full py-2 px-3" : "w-8 h-8 rounded-full"
          )}
          title={t.conversationList.newConversation}
        >
          <Plus size={18} />
          {isExpanded && (
            <span className="text-xs font-medium whitespace-nowrap">{t.conversationList.newConversation}</span>
          )}
        </button>
      </div>

      {/* 对话列表 */}
      <div className="flex-1 overflow-y-auto py-2">
        {allSessions.map((session) => {
          const isActive = isCurrentSession(session.id, session.type);
          // 根据类型选择图标
          const Icon = session.type === "agent" 
            ? Bot 
            : session.type === "research" 
              ? Microscope 
              : MessageSquare;
          // 获取显示标题（research 用 topic）
          const displayTitle = session.type === "research" 
            ? (session as typeof researchSessions[0] & { type: "research" }).topic 
            : (session as { title: string }).title;
          // 图标颜色
          const iconColor = session.type === "agent" 
            ? "text-purple-500" 
            : session.type === "research"
              ? "text-emerald-500"
              : "text-slate-500";

          return (
            <div
              key={session.id}
              onClick={() => handleSwitchSession(session.id, session.type)}
              className={cn(
                "group flex items-center px-2 py-2.5 cursor-pointer transition-all border-l-2",
                isActive
                  ? "border-primary bg-background shadow-sm"
                  : "border-transparent hover:bg-background/50 hover:shadow-sm"
              )}
              title={displayTitle}
            >
              {/* 图标 */}
              <div className="min-w-[32px] flex justify-center">
                <Icon
                  size={16}
                  className={cn(
                    iconColor,
                    isActive && "text-primary"
                  )}
                />
              </div>

              {/* 标题 - 只有展开时显示 */}
              {isExpanded && (
                <>
                  <div className="flex-1 overflow-hidden ml-1">
                    <p
                      className={cn(
                        "text-xs truncate",
                        isActive ? "text-foreground font-medium" : "text-muted-foreground"
                      )}
                    >
                      {displayTitle}
                    </p>
                    {/* 类型标签 */}
                    {session.type === "agent" && (
                      <span className="text-[10px] text-purple-600 bg-purple-50 dark:bg-purple-900/30 px-1.5 rounded-full inline-block mt-0.5">
                        Agent
                      </span>
                    )}
                    {session.type === "research" && (
                      <span className="text-[10px] text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 px-1.5 rounded-full inline-block mt-0.5">
                        Research
                      </span>
                    )}
                  </div>

                  {/* 删除按钮 */}
                  <button
                    onClick={(e) => handleDeleteSession(e, session.id, session.type)}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive p-1 transition-opacity"
                    title={t.conversationList.deleteConversation}
                  >
                    <Trash2 size={12} />
                  </button>
                </>
              )}
            </div>
          );
        })}

        {allSessions.length === 0 && (
          <div className="px-2 py-4 text-center">
            {isExpanded ? (
              <p className="text-xs text-muted-foreground">{t.conversationList.noConversations}</p>
            ) : (
              <MessageSquare size={16} className="mx-auto text-muted-foreground/50" />
            )}
          </div>
        )}
      </div>

      {/* 底部：清空历史（展开时显示） */}
      {isExpanded && allSessions.length > 0 && (
        <div className="p-2 border-t border-border">
          <button
            onClick={() => {
              // 清空当前模式的所有会话，保留一个空会话
              if (chatMode === "agent") {
                agentSessions.forEach((s) => {
                  if (s.id !== agentCurrentId) deleteAgentSession(s.id);
                });
              } else {
                chatSessions.forEach((s) => {
                  if (s.id !== chatCurrentId) deleteChatSession(s.id);
                });
              }
            }}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1 w-full py-1 rounded hover:bg-accent transition-colors"
          >
            <Trash2 size={12} />
            {t.conversationList.clearHistory}
          </button>
        </div>
      )}
    </div>
  );
}
