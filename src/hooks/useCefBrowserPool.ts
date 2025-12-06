/**
 * CEF Browser Instance Pool Manager
 * Manages multiple CEF browser instances for multi-tab support
 */

import { useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { type as osType } from '@tauri-apps/api/os';
import { WebviewWindow } from '@tauri-apps/api/window';

export interface CefBrowserInstance {
  tabId: string;
  isVisible: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  windowHandle?: WebviewWindow;
}

export interface UseCefBrowserPoolOptions {
  onInstanceCreated?: (tabId: string) => void;
  onInstanceDestroyed?: (tabId: string) => void;
  onTabSwitched?: (tabId: string) => void;
}

/**
 * CEF Browser Instance Pool Manager Class
 * Can be used standalone or within React hooks
 */
export class CefBrowserPoolManager {
  private instances: Map<string, CefBrowserInstance> = new Map();
  private activeTab: string | null = null;
  private options?: UseCefBrowserPoolOptions;
  private isMacPromise = osType().then((t) => t === 'Darwin').catch(() => false);

  constructor(options?: UseCefBrowserPoolOptions) {
    this.options = options;
  }

  /**
   * Create a new CEF browser instance
   */
  async createInstance(
    tabId: string,
    url: string,
    x: number,
    y: number,
    width: number,
    height: number
  ): Promise<void> {
    try {
      const isMac = await this.isMacPromise;
      // Validate inputs
      if (!tabId) throw new Error('tabId cannot be empty');
      if (!url) throw new Error('url cannot be empty');
      if (width <= 0 || height <= 0) throw new Error('Width and height must be positive');

      if (isMac) {
        // Hide all existing instances
        for (const instance of this.instances.values()) {
          instance.isVisible = false;
          await instance.windowHandle?.hide();
        }

        const win = new WebviewWindow(tabId, {
          url,
          x,
          y,
          width,
          height,
          visible: true,
        });

        this.instances.set(tabId, {
          tabId,
          isVisible: true,
          x,
          y,
          width,
          height,
          windowHandle: win,
        });

        this.activeTab = tabId;
        this.options?.onInstanceCreated?.(tabId);
        console.log('[CEF Pool] Webview instance created (macOS fallback):', tabId);
        return;
      }

      // Create CEF browser instance (non-macOS)
      await invoke('create_cef_browser', {
        tabId,
        url,
        x,
        y,
        width,
        height,
      });

      // Hide all existing instances
      for (const instance of this.instances.values()) {
        instance.isVisible = false;
      }

      // Track instance
      this.instances.set(tabId, {
        tabId,
        isVisible: true,
        x,
        y,
        width,
        height,
      });

      this.activeTab = tabId;
      this.options?.onInstanceCreated?.(tabId);

      console.log('[CEF Pool] Instance created:', tabId);
    } catch (error) {
      console.error('[CEF Pool] Failed to create instance:', error);
      throw error;
    }
  }

  /**
   * Destroy a CEF browser instance
   */
  async destroyInstance(tabId: string): Promise<void> {
    try {
      const isMac = await this.isMacPromise;
      if (!tabId) throw new Error('tabId cannot be empty');

      if (isMac) {
        const instance = this.instances.get(tabId);
        await instance?.windowHandle?.close();

        this.instances.delete(tabId);

        if (this.activeTab === tabId) {
          this.activeTab = null;
        }

        this.options?.onInstanceDestroyed?.(tabId);
        console.log('[CEF Pool] Webview instance destroyed (macOS fallback):', tabId);
        return;
      }

      // Close CEF browser (non-macOS)
      await invoke('close_cef_browser', { tabId });

      // Remove from tracking
      this.instances.delete(tabId);

      if (this.activeTab === tabId) {
        this.activeTab = null;
      }

      this.options?.onInstanceDestroyed?.(tabId);

      console.log('[CEF Pool] Instance destroyed:', tabId);
    } catch (error) {
      console.error('[CEF Pool] Failed to destroy instance:', error);
      throw error;
    }
  }

  /**
   * Switch to a different tab (show/hide instances)
   */
  async switchTab(tabId: string): Promise<void> {
    try {
      const isMac = await this.isMacPromise;
      if (!tabId) throw new Error('tabId cannot be empty');

      if (isMac) {
        // Hide all instances
        for (const [id, instance] of this.instances.entries()) {
          if (id !== tabId && instance.isVisible) {
            instance.isVisible = false;
            await instance.windowHandle?.hide();
          }
        }

        // Show target instance
        const targetInstance = this.instances.get(tabId);
        if (targetInstance) {
          targetInstance.isVisible = true;
          await targetInstance.windowHandle?.show();
          await targetInstance.windowHandle?.setFocus();
        }

        this.activeTab = tabId;
        this.options?.onTabSwitched?.(tabId);
        console.log('[CEF Pool] Webview tab switched (macOS fallback):', tabId);
        return;
      }

      // Hide all instances
      for (const [id, instance] of this.instances.entries()) {
        if (id !== tabId && instance.isVisible) {
          instance.isVisible = false;
        }
      }

      // Show target instance
      const targetInstance = this.instances.get(tabId);
      if (targetInstance) {
        targetInstance.isVisible = true;
      }

      // Notify backend (non-macOS)
      await invoke('cef_switch_tab', { tabId });

      this.activeTab = tabId;
      this.options?.onTabSwitched?.(tabId);

      console.log('[CEF Pool] Tab switched:', tabId);
    } catch (error) {
      console.error('[CEF Pool] Failed to switch tab:', error);
      throw error;
    }
  }

  /**
   * Update instance bounds
   */
  async updateBounds(
    tabId: string,
    x: number,
    y: number,
    width: number,
    height: number
  ): Promise<void> {
    try {
      const isMac = await this.isMacPromise;
      if (!tabId) throw new Error('tabId cannot be empty');
      if (width <= 0 || height <= 0) throw new Error('Width and height must be positive');

      // Update local tracking
      const instance = this.instances.get(tabId);
      if (instance) {
        instance.x = x;
        instance.y = y;
        instance.width = width;
        instance.height = height;
      }

      if (isMac) {
        const win = this.instances.get(tabId)?.windowHandle;
        if (win) {
          await win.setPosition({ x, y });
          await win.setSize({ width, height });
        }
        console.log('[CEF Pool] Webview bounds updated (macOS fallback):', tabId, {
          x,
          y,
          width,
          height,
        });
        return;
      }

      // Notify backend (non-macOS)
      await invoke('cef_update_bounds', {
        tabId,
        x,
        y,
        width,
        height,
      });

      console.log('[CEF Pool] Bounds updated:', tabId, { x, y, width, height });
    } catch (error) {
      console.error('[CEF Pool] Failed to update bounds:', error);
      throw error;
    }
  }

  /**
   * Get all instances
   */
  getAllInstances(): CefBrowserInstance[] {
    return Array.from(this.instances.values());
  }

  /**
   * Get active tab ID
   */
  getActiveTab(): string | null {
    return this.activeTab;
  }

  /**
   * Get instance count
   */
  getInstanceCount(): number {
    return this.instances.size;
  }

  /**
   * Get visible instance count
   */
  getVisibleInstanceCount(): number {
    return Array.from(this.instances.values()).filter((i) => i.isVisible).length;
  }

  /**
   * Check if instance exists
   */
  hasInstance(tabId: string): boolean {
    return this.instances.has(tabId);
  }

  /**
   * Get instance by tab ID
   */
  getInstance(tabId: string): CefBrowserInstance | undefined {
    return this.instances.get(tabId);
  }

  /**
   * Clear all instances
   */
  async clearAll(): Promise<void> {
    try {
      const instances = Array.from(this.instances.keys());
      for (const tabId of instances) {
        await this.destroyInstance(tabId);
      }
      this.activeTab = null;
      console.log('[CEF Pool] All instances cleared');
    } catch (error) {
      console.error('[CEF Pool] Failed to clear all instances:', error);
      throw error;
    }
  }
}

/**
 * React Hook for managing CEF browser instances
 * Handles creation, destruction, and visibility management of multiple browser tabs
 */
export function useCefBrowserPool(options?: UseCefBrowserPoolOptions) {
  const poolRef = useRef<CefBrowserPoolManager | null>(null);

  if (!poolRef.current) {
    poolRef.current = new CefBrowserPoolManager(options);
  }

  return poolRef.current;
}
