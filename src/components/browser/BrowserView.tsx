/**
 * 浏览器视图组件
 * 使用 Tauri WebView 显示网页内容
 * 
 * 技术方案：
 * - 使用 Tauri 的 add_child WebView 创建独立的浏览器实例
 * - 不受 X-Frame-Options 限制（因为不是 iframe）
 * - 支持访问 Google、GitHub 等所有网站
 * - 在 Windows 上使用 WebView2（基于 Chromium）
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Globe, Bookmark, Share2, AlertCircle } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
// import { listen, UnlistenFn } from '@tauri-apps/api/event'; // 暂时未使用，后续添加事件监听时启用
import { AddressBar } from './AddressBar';
import { useFileStore } from '@/stores/useFileStore';
import { cn } from '@/lib/utils';

interface BrowserViewProps {
  tabId: string;
  initialUrl?: string;
  isActive?: boolean;
  onTitleChange?: (title: string) => void;
}

// 默认首页
const DEFAULT_HOME_URL = 'https://www.bing.com';

export function BrowserView({
  tabId,
  initialUrl = '',
  isActive = true,
  onTitleChange,
}: BrowserViewProps) {
  const { updateWebpageTab } = useFileStore();
  
  // 状态
  const [currentUrl, setCurrentUrl] = useState(initialUrl || '');
  const [isLoading, setIsLoading] = useState(false);
  const [webviewCreated, setWebviewCreated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // 注意：导航历史由 WebView 自己管理，我们不再维护本地历史
  
  // 容器引用
  const containerRef = useRef<HTMLDivElement>(null);
  
  // 创建浏览器视图（使用 Tauri WebView，不是 iframe）
  const createWebview = useCallback(async (url: string) => {
    if (!url) return;
    
    // 确保容器已渲染
    if (!containerRef.current) {
      console.warn('[Browser] 容器未准备好，延迟创建 WebView');
      // 延迟重试
      setTimeout(() => createWebview(url), 100);
      return;
    }
    
    try {
      setIsLoading(true);
      setError(null);
      
      const rect = containerRef.current.getBoundingClientRect();
      
      // 确保容器有有效尺寸
      if (rect.width <= 0 || rect.height <= 0) {
        console.warn('[Browser] 容器尺寸无效，延迟创建 WebView');
        setTimeout(() => createWebview(url), 100);
        return;
      }
      
      try {
        // 使用 create_browser_webview 创建独立的 WebView
        // 这个 WebView 不受 X-Frame-Options 限制
        await invoke('create_browser_webview', {
          tabId,
          url,
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
        });
        console.log('[Browser] WebView 创建成功:', tabId, url);
        setWebviewCreated(true);
        setCurrentUrl(url);
        
        // 更新标签页信息
        try {
          const urlObj = new URL(url);
          const title = urlObj.hostname;
          updateWebpageTab(tabId, url, title);
          onTitleChange?.(title);
        } catch {
          // URL 解析失败
        }
      } catch (err) {
        console.error('[Browser] WebView 创建失败:', err);
        setError(String(err));
      }
    } catch (err) {
      console.error('[Browser] 浏览器创建失败:', err);
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  }, [tabId, updateWebpageTab, onTitleChange]);
  
  // 更新 WebView 浏览器位置大小
  const updateWebviewBounds = useCallback(async () => {
    if (!webviewCreated || !containerRef.current) return;
    
    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    
    try {
      // 调用后端更新 WebView 位置和大小
      await invoke('update_browser_webview_bounds', {
        tabId,
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      });
      console.log('[Browser] WebView 位置更新:', {
        tabId,
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      });
    } catch (err) {
      console.error('[Browser] 更新 WebView 位置失败:', err);
    }
  }, [tabId, webviewCreated]);
  
  // 导航到新 URL
  const handleNavigate = useCallback(async (url: string) => {
    if (!url) return;
    
    setCurrentUrl(url);
    setIsLoading(true);
    
    try {
      if (webviewCreated) {
        // WebView 已存在，直接导航
        await invoke('navigate_browser_webview', { tabId, url });
      } else {
        // 创建新 WebView
        await createWebview(url);
      }
      
      // 更新标签页信息
      try {
        const urlObj = new URL(url);
        const title = urlObj.hostname;
        updateWebpageTab(tabId, url, title);
        onTitleChange?.(title);
      } catch {
        // URL 解析失败
      }
    } catch (err) {
      console.error('[Browser] 导航失败:', err);
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  }, [tabId, webviewCreated, createWebview, updateWebpageTab, onTitleChange]);
  
  // 后退 - WebView 自己管理历史，我们只需要调用命令
  const handleBack = useCallback(async () => {
    if (!webviewCreated) return;
    
    try {
      await invoke('browser_webview_go_back', { tabId });
      console.log('[Browser] 后退命令已发送');
    } catch (err) {
      console.error('[Browser] 后退失败:', err);
    }
  }, [tabId, webviewCreated]);
  
  // 前进 - WebView 自己管理历史，我们只需要调用命令
  const handleForward = useCallback(async () => {
    if (!webviewCreated) return;
    
    try {
      await invoke('browser_webview_go_forward', { tabId });
      console.log('[Browser] 前进命令已发送');
    } catch (err) {
      console.error('[Browser] 前进失败:', err);
    }
  }, [tabId, webviewCreated]);
  
  // 刷新
  const handleRefresh = useCallback(async () => {
    try {
      setIsLoading(true);
      await invoke('browser_webview_reload', { tabId });
    } catch (err) {
      console.error('[Browser] 刷新失败:', err);
    } finally {
      setTimeout(() => setIsLoading(false), 500);
    }
  }, [tabId]);
  
  // 主页
  const handleHome = useCallback(() => {
    handleNavigate(DEFAULT_HOME_URL);
  }, [handleNavigate]);
  
  // 使用 ref 来跟踪当前 tabId，当 tabId 变化时重置状态
  const currentTabIdRef = useRef<string | null>(null);
  
  // 当 tabId 变化时，重置组件状态（组件被复用于不同标签页）
  useEffect(() => {
    if (currentTabIdRef.current !== null && currentTabIdRef.current !== tabId) {
      console.log('[Browser] Tab ID 变化，重置状态:', currentTabIdRef.current, '->', tabId);
      // 重置状态，准备为新标签页创建 WebView
      setWebviewCreated(false);
      setCurrentUrl(initialUrl || '');
      setError(null);
      setIsLoading(false);
    }
    currentTabIdRef.current = tabId;
  }, [tabId, initialUrl]);
  
  // 初始化：如果有初始 URL，创建 WebView
  useEffect(() => {
    // 如果有初始 URL 且 WebView 未创建，创建 WebView
    if (initialUrl && !webviewCreated && isActive) {
      console.log('[Browser] 初始化 WebView:', tabId, initialUrl);
      createWebview(initialUrl);
    }
  }, [tabId, initialUrl, webviewCreated, isActive, createWebview]);
  
  // 监听窗口大小变化
  useEffect(() => {
    if (!webviewCreated) return;
    
    const handleResize = () => updateWebviewBounds();
    window.addEventListener('resize', handleResize);
    
    const observer = new ResizeObserver(handleResize);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    
    return () => {
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
    };
  }, [webviewCreated, updateWebviewBounds]);
  
  // 根据 isActive 控制 WebView 浏览器可见性
  useEffect(() => {
    if (!webviewCreated) return;
    
    if (isActive) {
      // 激活时显示并更新位置
      invoke('set_browser_webview_visible', { tabId, visible: true }).catch(() => {});
      updateWebviewBounds();
      console.log('[Browser] WebView 浏览器激活:', tabId);
    } else {
      // 非激活时隐藏
      invoke('set_browser_webview_visible', { tabId, visible: false }).catch(() => {});
      console.log('[Browser] WebView 浏览器隐藏:', tabId);
    }
  }, [isActive, webviewCreated, tabId, updateWebviewBounds]);
  
  // 组件卸载时关闭 WebView 浏览器
  useEffect(() => {
    return () => {
      invoke('close_browser_webview', { tabId }).catch(() => {});
    };
  }, [tabId]);

  return (
    <div className="h-full flex flex-col bg-background">
      {/* 地址栏 */}
      <AddressBar
        url={currentUrl}
        onNavigate={handleNavigate}
        onBack={handleBack}
        onForward={handleForward}
        onRefresh={handleRefresh}
        onHome={handleHome}
        canGoBack={webviewCreated}
        canGoForward={webviewCreated}
        isLoading={isLoading}
      />
      
      {/* 工具栏 */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-muted/30">
        <button
          className="p-1.5 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          title="添加书签"
        >
          <Bookmark size={14} />
        </button>
        <button
          className="p-1.5 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          title="分享"
        >
          <Share2 size={14} />
        </button>
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground">
          {isLoading ? '加载中...' : ''}
        </span>
      </div>
      
      {/* WebView 容器 */}
      <div 
        ref={containerRef}
        className="flex-1 relative bg-white overflow-hidden"
      >
        {/* 错误提示 */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
            <div className="text-center p-8">
              <AlertCircle className="w-16 h-16 mx-auto text-red-500 mb-4" />
              <h3 className="text-lg font-medium mb-2">加载出错</h3>
              <p className="text-sm text-muted-foreground mb-4">{error}</p>
              <button
                onClick={() => handleNavigate(currentUrl)}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg"
              >
                重试
              </button>
            </div>
          </div>
        )}
        
        {/* 空状态（未输入 URL） */}
        {!currentUrl && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-background to-muted/20 z-5">
            <div className="text-center p-8 max-w-md">
              <Globe className="w-20 h-20 mx-auto text-muted-foreground/50 mb-6" />
              <h2 className="text-xl font-medium mb-2">开始浏览</h2>
              <p className="text-sm text-muted-foreground mb-6">
                在地址栏输入网址或搜索关键词
              </p>
              
              {/* 快捷入口 */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { name: '必应', url: 'https://www.bing.com', color: 'bg-blue-500' },
                  { name: 'Wikipedia', url: 'https://www.wikipedia.org', color: 'bg-orange-500' },
                  { name: 'MDN', url: 'https://developer.mozilla.org', color: 'bg-black' },
                ].map(site => (
                  <button
                    key={site.url}
                    onClick={() => handleNavigate(site.url)}
                    className="p-3 rounded-lg border border-border hover:bg-accent transition-colors"
                  >
                    <div className={cn(
                      "w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center text-white",
                      site.color
                    )}>
                      <Globe size={20} />
                    </div>
                    <span className="text-sm">{site.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        
        {/* WebView 由 Tauri 后端创建，这里只是占位容器 */}
        {/* WebView 会覆盖在这个容器上方，由后端控制位置和大小 */}
        {currentUrl && !error && webviewCreated && (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            {/* WebView 正在显示内容，这个 div 只是占位 */}
          </div>
        )}
        
        {/* 加载指示器 */}
        {isLoading && currentUrl && (
          <div className="absolute top-0 left-0 right-0 h-1 bg-primary/20 z-20">
            <div className="h-full bg-primary animate-pulse" style={{ width: '60%' }} />
          </div>
        )}
        
        {/* 状态指示 */}
        {webviewCreated && !error && currentUrl && (
          <div className="absolute bottom-2 right-2 px-2 py-1 bg-green-500/20 text-green-600 text-xs rounded opacity-0 hover:opacity-100 transition-opacity z-10">
            ✓ 已加载
          </div>
        )}
      </div>
    </div>
  );
}
