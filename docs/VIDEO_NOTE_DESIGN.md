# 视频学习笔记功能设计

## 一、功能概述

在应用内边看 B 站视频边做笔记，支持：
- 嵌入播放 B 站视频
- 暂停时添加批注（手动 / AI 辅助）
- 截图当前画面
- 记录时间戳，点击可跳转
- 导出为 Markdown 文件

## 二、技术架构

```
┌─────────────────────────────────────────────────────────────┐
│                      VideoNoteView                          │
├─────────────────────────────┬───────────────────────────────┤
│                             │                               │
│     VideoPlayer (iframe)    │       NoteTimeline            │
│                             │                               │
│   ┌─────────────────────┐   │   ┌─────────────────────┐     │
│   │                     │   │   │ 03:24 笔记内容...   │     │
│   │   B站播放器          │   │   │ [截图缩略图]        │     │
│   │                     │   │   ├─────────────────────┤     │
│   │                     │   │   │ 07:15 笔记内容...   │     │
│   └─────────────────────┘   │   │ [截图缩略图]        │     │
│                             │   └─────────────────────┘     │
├─────────────────────────────┴───────────────────────────────┤
│  [⏸ 暂停] [📷 截图] [✏️ 添加笔记] [🤖 AI总结] [💾 导出MD]   │
└─────────────────────────────────────────────────────────────┘
```

## 三、核心模块设计

### 3.1 B站视频嵌入

**嵌入方式**：使用 B 站官方 iframe 播放器

```typescript
// 从 B站链接提取 BV 号
function extractBvid(url: string): string | null {
  const match = url.match(/BV[a-zA-Z0-9]+/);
  return match ? match[0] : null;
}

// 生成嵌入 URL
function getEmbedUrl(bvid: string): string {
  return `https://player.bilibili.com/player.html?bvid=${bvid}&autoplay=0&danmaku=0`;
}
```

**CSP 配置** (`tauri.conf.json`)：
```json
{
  "app": {
    "security": {
      "csp": "default-src 'self'; frame-src https://player.bilibili.com https://*.bilibili.com; img-src 'self' data: https://*.hdslb.com"
    }
  }
}
```

### 3.2 播放器通信

B 站播放器支持 postMessage API：

```typescript
interface BilibiliPlayerMessage {
  type: 'getCurrentTime' | 'seekTo' | 'pause' | 'play';
  data?: number;
}

class BilibiliPlayerController {
  private iframe: HTMLIFrameElement;
  private currentTime: number = 0;
  
  constructor(iframe: HTMLIFrameElement) {
    this.iframe = iframe;
    this.setupMessageListener();
  }
  
  private setupMessageListener() {
    window.addEventListener('message', (event) => {
      if (event.origin.includes('bilibili.com')) {
        // 处理播放器消息
        if (event.data.event === 'timeupdate') {
          this.currentTime = event.data.time;
        }
      }
    });
  }
  
  getCurrentTime(): number {
    return this.currentTime;
  }
  
  seekTo(seconds: number) {
    this.iframe.contentWindow?.postMessage({
      type: 'seekTo',
      data: seconds
    }, '*');
  }
  
  pause() {
    this.iframe.contentWindow?.postMessage({ type: 'pause' }, '*');
  }
}
```

### 3.3 截图方案

**方案选择**：由于 iframe 跨域限制，采用 **Tauri 系统级截图**

```rust
// src-tauri/src/commands/mod.rs

use screenshots::Screen;

#[tauri::command]
pub async fn capture_screen_region(
    x: i32, 
    y: i32, 
    width: u32, 
    height: u32,
    save_path: String
) -> Result<String, AppError> {
    let screens = Screen::all()?;
    let screen = screens.first().ok_or(AppError::InvalidPath("No screen found".into()))?;
    
    let image = screen.capture_area(x, y, width, height)?;
    image.save(&save_path)?;
    
    Ok(save_path)
}
```

**前端调用**：
```typescript
async function captureVideoFrame(
  videoRect: DOMRect, 
  timestamp: number,
  vaultPath: string
): Promise<string> {
  const fileName = `video-note-${formatTimestamp(timestamp)}.png`;
  const savePath = `${vaultPath}/attachments/${fileName}`;
  
  await invoke('capture_screen_region', {
    x: Math.round(videoRect.x),
    y: Math.round(videoRect.y),
    width: Math.round(videoRect.width),
    height: Math.round(videoRect.height),
    savePath
  });
  
  return savePath;
}
```

### 3.4 数据结构

```typescript
// 视频笔记文件结构
interface VideoNoteFile {
  version: 1;
  video: {
    url: string;           // 原始 B站链接
    bvid: string;          // BV 号
    title: string;         // 视频标题（可从 API 获取）
    duration?: number;     // 视频时长（秒）
  };
  createdAt: string;       // ISO 日期
  updatedAt: string;
  notes: VideoNoteEntry[];
}

interface VideoNoteEntry {
  id: string;              // UUID
  timestamp: number;       // 秒
  content: string;         // 用户笔记内容
  screenshot?: string;     // 截图相对路径
  aiSummary?: string;      // AI 生成的总结
  createdAt: string;
}
```

### 3.5 存储方案

```
vault/
├── 视频笔记/
│   ├── [视频标题].md           # 导出的 Markdown
│   └── [视频标题].videonote    # JSON 格式的原始数据
└── attachments/
    └── video-notes/
        ├── 03-24.png
        └── 07-15.png
```

### 3.6 Markdown 导出格式

```markdown
# 视频笔记：[视频标题]

> 🎬 来源: https://www.bilibili.com/video/BVxxx
> 📅 创建时间: 2025-11-30 14:30
> ⏱️ 视频时长: 15:30

---

## [03:24](bilibili://BVxxx?t=204) - 核心概念

![截图](../attachments/video-notes/03-24.png)

**我的笔记：**
这里讲的是 XXX 概念，关键点是...

**AI 总结：**
> 本段介绍了 XXX 的基本概念，包括三个要点：1. ... 2. ... 3. ...

---

## [07:15](bilibili://BVxxx?t=435) - 代码示例

![截图](../attachments/video-notes/07-15.png)

**我的笔记：**
注意边界条件的处理...

---

*由 Lumina Note 生成*
```

## 四、UI 组件设计

### 4.1 组件树

```
VideoNoteView/
├── VideoNoteHeader          # 视频标题、链接、操作按钮
├── VideoNoteContent/
│   ├── VideoPlayer          # iframe 播放器容器
│   └── NoteTimeline/        # 笔记时间线
│       └── NoteCard[]       # 单条笔记卡片
├── VideoNoteToolbar         # 底部工具栏
└── NoteEditor (Modal)       # 笔记编辑弹窗
```

### 4.2 入口

在右侧面板添加「视频笔记」Tab，或通过命令面板 `Ctrl+Shift+V` 打开。

## 五、AI 辅助功能

### 5.1 功能点

1. **智能总结当前片段** - 根据时间戳上下文生成总结
2. **截图内容识别** - OCR 识别截图中的文字/代码
3. **自动提取关键点** - 分析视频字幕生成要点

### 5.2 Prompt 模板

```typescript
const VIDEO_NOTE_PROMPT = `
你是一个视频学习助手。用户正在观看教学视频并做笔记。

视频信息：
- 标题：{title}
- 当前时间戳：{timestamp}

用户的笔记：
{userNote}

请帮助用户：
1. 总结这个时间点的关键内容（2-3句话）
2. 提炼要点（如有代码/公式，保留格式）
3. 建议相关的延伸学习方向

请用简洁的中文回复。
`;
```

## 六、实现计划

### Phase 1：基础框架（MVP）
- [ ] VideoNoteView 组件骨架
- [ ] B站视频嵌入 + CSP 配置
- [ ] 手动添加笔记（无截图）
- [ ] 时间戳记录与跳转
- [ ] 导出为 Markdown

### Phase 2：截图功能
- [ ] Rust 截图命令
- [ ] 截图保存到 attachments
- [ ] 截图预览与管理

### Phase 3：AI 增强
- [ ] AI 总结集成
- [ ] 截图 OCR（可选）

### Phase 4：体验优化
- [ ] 快捷键支持（空格暂停、N 新建笔记）
- [ ] 视频信息自动获取（标题、封面）
- [ ] 笔记搜索与过滤

## 七、依赖项

### Rust
```toml
screenshots = "0.8"  # 系统截图
image = "0.25"       # 图片处理
```

### 前端
无额外依赖，使用现有 UI 组件

## 八、风险与备选方案

| 风险 | 影响 | 备选方案 |
|-----|------|---------|
| B站播放器 API 变动 | 通信失败 | 手动输入时间戳 |
| 截图权限问题 | 无法截图 | 提示用户使用系统截图工具 |
| CSP 限制太严 | iframe 无法加载 | 使用外部浏览器 + 同步 |

---

**下一步**：确认方案后开始 Phase 1 实现。
