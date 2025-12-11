import React, { useMemo } from 'react';
import { FileEntry } from '@/lib/tauri';
import { Folder, Hash } from 'lucide-react';
import { getFileName } from '@/lib/utils';

interface NoteCardProps {
  entry: FileEntry;
  content: string;
  onClick: () => void;
}

// 简单 hash 函数，用于生成伪随机变化
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

// 卡片尺寸类型
type CardSize = 'compact' | 'normal' | 'tall' | 'featured';

export const NoteCard = React.memo(function NoteCard({ entry, content, onClick }: NoteCardProps) {
  const { title, summary, image, tags, folder, cardSize, summaryLines, imageRatio } = useMemo(() => {
    const lines = content.split('\n');
    let title = getFileName(entry.name).replace('.md', '');
    let summary = '';
    let image = '';
    let tags: string[] = [];
    
    // 尝试从 frontmatter 获取 title 和 tags
    let bodyStartIndex = 0;

    // 简单的 frontmatter 解析
    if (lines[0]?.trim() === '---') {
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line === '---') {
          bodyStartIndex = i + 1;
          break;
        }
        if (line.startsWith('title:')) {
          title = line.replace('title:', '').trim().replace(/^['"]|['"]$/g, '');
        }
        if (line.startsWith('cover:')) {
          // 支持 frontmatter 中的封面图
          image = line.replace('cover:', '').trim().replace(/^['"]|['"]$/g, '');
        }
        if (line.startsWith('tags:')) {
            // 简单处理 [tag1, tag2]
            const tagsStr = line.replace('tags:', '').trim();
            if (tagsStr.startsWith('[') && tagsStr.endsWith(']')) {
                tags = tagsStr.slice(1, -1).split(',').map(t => t.trim());
            } 
        }
      }
    }

    // 提取正文和图片
    let bodyContent = lines.slice(bodyStartIndex).join('\n');
    
    // 如果 frontmatter 没有指定 cover，则从正文提取第一张图片
    if (!image) {
      // 1. 标准 Markdown 格式: ![alt](path)
      const imgMatch = bodyContent.match(/!\[.*?\]\((.*?)\)/);
      if (imgMatch) {
        image = imgMatch[1];
      } else {
        // 2. Obsidian wiki 链接格式: ![[image.png]]
        const wikiImgMatch = bodyContent.match(/!\[\[([^\]]+\.(png|jpg|jpeg|gif|webp|bmp|svg))\]\]/i);
        if (wikiImgMatch) {
          image = wikiImgMatch[1];
        } else {
          // 3. HTML 图片标签: <img src="...">
          const htmlImgMatch = bodyContent.match(/<img[^>]+src="([^">]+)"/);
          if (htmlImgMatch) {
            image = htmlImgMatch[1];
          }
        }
      }
    }

    // 只保留网络图片（本地图片暂不支持）
    if (image && !image.startsWith('http://') && !image.startsWith('https://') && !image.startsWith('data:')) {
      image = ''; // 清空本地图片路径
    }

    // 提取摘要（去除 Markdown 符号）
    const plainText = bodyContent
      .replace(/!\[.*?\]\(.*?\)/g, '') // 去除图片
      .replace(/\[.*?\]\(.*?\)/g, '$1') // 去除链接
      .replace(/#{1,6}\s/g, '') // 去除标题
      .replace(/(\*\*|__)(.*?)\1/g, '$2') // 去除加粗
      .replace(/(\*|_)(.*?)\1/g, '$2') // 去除斜体
      .replace(/`{3}[\s\S]*?`{3}/g, '') // 去除代码块
      .replace(/`(.+?)`/g, '$1') // 去除行内代码
      .replace(/>\s/g, '') // 去除引用
      .replace(/<[^>]*>/g, '') // 去除HTML标签
      .replace(/\s+/g, ' ')
      .trim();

    // 获取文件夹名
    const pathParts = entry.path.replace(/\\/g, '/').split('/');
    const folder = pathParts.length > 1 ? pathParts[pathParts.length - 2] : 'Root';

    // 基于路径的伪随机数（保证同一卡片始终一致）
    const hash = hashCode(entry.path);
    const variation = hash % 10;

    // 根据内容特征和随机变化决定卡片尺寸
    let cardSize: CardSize = 'normal';
    let summaryLines = 3;
    let imageRatio = 'aspect-video'; // 16:9
    
    const contentLength = plainText.length;
    const hasImage = !!image;

    if (hasImage && contentLength > 300 && variation < 2) {
      // 10% 几率成为特色卡片（有图+长内容）
      cardSize = 'featured';
      summaryLines = 6;
      imageRatio = 'aspect-[4/3]'; // 更高的图片
    } else if (hasImage && variation < 4) {
      // 20% 几率高卡片
      cardSize = 'tall';
      summaryLines = 5;
      imageRatio = 'aspect-square'; // 1:1
    } else if (!hasImage && contentLength < 100 && variation < 6) {
      // 紧凑卡片（无图+短内容）
      cardSize = 'compact';
      summaryLines = 2;
    } else if (hasImage && variation >= 7) {
      // 宽图片
      imageRatio = 'aspect-[21/9]';
      summaryLines = 2;
    } else {
      // 正常卡片，但也有些变化
      summaryLines = 2 + (hash % 3); // 2-4 行
    }

    // 根据摘要行数截取内容
    const maxChars = summaryLines * 40;
    summary = plainText.slice(0, maxChars);

    return { title, summary, image, tags, folder, cardSize, summaryLines, imageRatio };
  }, [entry, content]);

  // 根据卡片类型应用不同样式
  const cardClasses = {
    compact: 'bg-card',
    normal: 'bg-card',
    tall: 'bg-card',
    featured: 'bg-gradient-to-br from-primary/5 to-transparent border-primary/20',
  };

  const lineClampClass = {
    2: 'line-clamp-2',
    3: 'line-clamp-3',
    4: 'line-clamp-4',
    5: 'line-clamp-5',
    6: 'line-clamp-6',
  }[summaryLines] || 'line-clamp-3';

  return (
    <div 
      onClick={onClick}
      style={{ contentVisibility: 'auto', containIntrinsicSize: '0 250px' }}
      className={`group w-full rounded-xl border border-border text-card-foreground shadow-sm hover:shadow-lg hover:border-primary/50 hover:-translate-y-1 transition-all duration-300 cursor-pointer overflow-hidden flex flex-col ${cardClasses[cardSize]}`}
    >
      {/* 封面图 */}
      {image && (
        <div className={`w-full ${imageRatio} overflow-hidden bg-muted relative`}>
           <img 
             src={image} 
             alt={title} 
             className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" 
             onError={(e) => {
                 e.currentTarget.parentElement!.style.display = 'none';
             }} 
           />
        </div>
      )}

      <div className={`p-4 flex flex-col gap-2 ${cardSize === 'featured' ? 'p-5' : ''}`}>
        {/* 标题 */}
        <h3 className={`font-semibold leading-tight group-hover:text-primary transition-colors ${cardSize === 'featured' ? 'text-xl' : 'text-base'}`}>
          {title}
        </h3>

        {/* 文件夹 */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Folder size={12} />
          <span>{folder}</span>
        </div>

        {/* 摘要 */}
        {summary && (
          <p className={`text-sm text-muted-foreground ${lineClampClass} leading-relaxed`}>
            {summary}
          </p>
        )}

        {/* 底部信息：标签 */}
        {tags.length > 0 && (
            <div className="mt-2 pt-2 border-t border-border/50 flex flex-wrap items-center gap-1.5">
            {tags.slice(0, cardSize === 'featured' ? 5 : 3).map(tag => (
                <span key={tag} className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] bg-primary/10 text-primary">
                <Hash size={10} className="mr-0.5" />
                {tag}
                </span>
            ))}
            {tags.length > (cardSize === 'featured' ? 5 : 3) && (
              <span className="text-[10px] text-muted-foreground">+{tags.length - (cardSize === 'featured' ? 5 : 3)}</span>
            )}
            </div>
        )}
      </div>
    </div>
  );
}, (prev, next) => prev.entry.path === next.entry.path && prev.content === next.content);
