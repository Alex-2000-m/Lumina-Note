/**
 * 工具 JSON Schema 定义
 * 用于原生 Function Calling 模式
 * 支持多语言国际化
 */

import { getCurrentTranslations } from "@/stores/useLocaleStore";

export interface FunctionSchema {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, {
        type: string;
        description: string;
        enum?: string[];
        items?: { type: string };
      }>;
      required?: string[];
    };
  };
}

// 工具参数的基础结构（不含描述）
interface ParamDef {
  type: string;
  enum?: string[];
  items?: { type: string };
}

interface ToolDef {
  name: string;
  params: Record<string, ParamDef>;
  required?: string[];
}

// 工具基础定义
const TOOL_DEFS: ToolDef[] = [
  { name: "read_note", params: { path: { type: "string" } }, required: ["path"] },
  { name: "edit_note", params: { path: { type: "string" }, edits: { type: "array", items: { type: "object" } }, new_name: { type: "string" } }, required: ["path", "edits"] },
  { name: "create_note", params: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] },
  { name: "list_notes", params: { directory: { type: "string" }, recursive: { type: "boolean" } } },
  { name: "create_folder", params: { path: { type: "string" } }, required: ["path"] },
  { name: "move_file", params: { from: { type: "string" }, to: { type: "string" } }, required: ["from", "to"] },
  { name: "rename_file", params: { path: { type: "string" }, new_name: { type: "string" } }, required: ["path", "new_name"] },
  { name: "delete_note", params: { path: { type: "string" } }, required: ["path"] },
  { name: "search_notes", params: { query: { type: "string" }, directory: { type: "string" }, limit: { type: "number" } }, required: ["query"] },
  { name: "grep_search", params: { query: { type: "string" }, directory: { type: "string" }, regex: { type: "boolean" }, case_sensitive: { type: "boolean" }, limit: { type: "number" } }, required: ["query"] },
  { name: "semantic_search", params: { query: { type: "string" }, directory: { type: "string" }, limit: { type: "number" }, min_score: { type: "number" } }, required: ["query"] },
  { name: "deep_search", params: { query: { type: "string" }, limit: { type: "number" }, include_content: { type: "boolean" } }, required: ["query"] },
  { name: "query_database", params: { database_id: { type: "string" }, filter_column: { type: "string" }, filter_value: { type: "string" }, limit: { type: "number" } }, required: ["database_id"] },
  { name: "add_database_row", params: { database_id: { type: "string" }, cells: { type: "object" } }, required: ["database_id"] },
  { name: "get_backlinks", params: { note_name: { type: "string" }, include_context: { type: "boolean" } }, required: ["note_name"] },
  { name: "generate_flashcards", params: { content: { type: "string" }, source_note: { type: "string" }, deck: { type: "string" }, types: { type: "array", items: { type: "string" } }, count: { type: "number" }, language: { type: "string" } }, required: ["content"] },
  { name: "create_flashcard", params: { type: { type: "string", enum: ["basic", "cloze", "basic-reversed", "mcq", "list"] }, deck: { type: "string" }, source: { type: "string" }, front: { type: "string" }, back: { type: "string" }, text: { type: "string" }, question: { type: "string" }, options: { type: "array", items: { type: "string" } }, answer: { type: "number" }, items: { type: "array", items: { type: "string" } }, ordered: { type: "boolean" }, explanation: { type: "string" } }, required: ["type"] },
  { name: "read_cached_output", params: { id: { type: "string" } }, required: ["id"] },
];

/**
 * 动态生成本地化的工具 Schema
 */
function buildLocalizedSchemas(): FunctionSchema[] {
  const t = getCurrentTranslations().prompts.fcSchemas;
  
  return TOOL_DEFS.map(tool => {
    const toolT = t[tool.name as keyof typeof t] as { desc: string; params: Record<string, string> } | undefined;
    
    const properties: Record<string, { type: string; description: string; enum?: string[]; items?: { type: string } }> = {};
    
    for (const [paramName, paramDef] of Object.entries(tool.params)) {
      properties[paramName] = {
        type: paramDef.type,
        description: toolT?.params?.[paramName] || paramName,
        ...(paramDef.enum && { enum: paramDef.enum }),
        ...(paramDef.items && { items: paramDef.items }),
      };
    }
    
    return {
      type: "function" as const,
      function: {
        name: tool.name,
        description: toolT?.desc || tool.name,
        parameters: {
          type: "object" as const,
          properties,
          ...(tool.required && { required: tool.required }),
        },
      },
    };
  });
}

/**
 * 根据模式过滤工具并返回本地化的 Schema
 */
export function getToolSchemas(toolNames: string[]): FunctionSchema[] {
  const allSchemas = buildLocalizedSchemas();
  return allSchemas.filter((schema) =>
    toolNames.includes(schema.function.name)
  );
}

/**
 * 获取所有工具的本地化 Schema
 */
export function getAllToolSchemas(): FunctionSchema[] {
  return buildLocalizedSchemas();
}
