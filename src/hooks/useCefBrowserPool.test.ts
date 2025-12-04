/**
 * Tests for CefBrowserPoolManager
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';

// Mock tauri invoke before importing
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { CefBrowserPoolManager } from './useCefBrowserPool';
import { invoke } from '@tauri-apps/api/core';

describe('CefBrowserPoolManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a new instance', async () => {
    const pool = new CefBrowserPoolManager();

    await pool.createInstance('tab-1', 'https://example.com', 0, 0, 800, 600);

    expect(invoke).toHaveBeenCalledWith('create_cef_browser', {
      tabId: 'tab-1',
      url: 'https://example.com',
      x: 0,
      y: 0,
      width: 800,
      height: 600,
    });

    expect(pool.hasInstance('tab-1')).toBe(true);
    expect(pool.getInstanceCount()).toBe(1);
  });

  it('should destroy an instance', async () => {
    const pool = new CefBrowserPoolManager();

    await pool.createInstance('tab-1', 'https://example.com', 0, 0, 800, 600);

    expect(pool.hasInstance('tab-1')).toBe(true);

    await pool.destroyInstance('tab-1');

    expect(invoke).toHaveBeenCalledWith('close_cef_browser', { tabId: 'tab-1' });
    expect(pool.hasInstance('tab-1')).toBe(false);
    expect(pool.getInstanceCount()).toBe(0);
  });

  it('should switch tabs', async () => {
    const pool = new CefBrowserPoolManager();

    await pool.createInstance('tab-1', 'https://example.com', 0, 0, 800, 600);
    await pool.createInstance('tab-2', 'https://google.com', 0, 0, 800, 600);

    expect(pool.getActiveTab()).toBe('tab-2');

    await pool.switchTab('tab-1');

    expect(invoke).toHaveBeenCalledWith('cef_switch_tab', { tabId: 'tab-1' });
    expect(pool.getActiveTab()).toBe('tab-1');

    // Check visibility
    const tab1 = pool.getInstance('tab-1');
    const tab2 = pool.getInstance('tab-2');

    expect(tab1?.isVisible).toBe(true);
    expect(tab2?.isVisible).toBe(false);
  });

  it('should update bounds', async () => {
    const pool = new CefBrowserPoolManager();

    await pool.createInstance('tab-1', 'https://example.com', 0, 0, 800, 600);

    await pool.updateBounds('tab-1', 100, 100, 1024, 768);

    expect(invoke).toHaveBeenCalledWith('cef_update_bounds', {
      tabId: 'tab-1',
      x: 100,
      y: 100,
      width: 1024,
      height: 768,
    });

    const instance = pool.getInstance('tab-1');
    expect(instance?.x).toBe(100);
    expect(instance?.y).toBe(100);
    expect(instance?.width).toBe(1024);
    expect(instance?.height).toBe(768);
  });

  it('should get all instances', async () => {
    const pool = new CefBrowserPoolManager();

    await pool.createInstance('tab-1', 'https://example.com', 0, 0, 800, 600);
    await pool.createInstance('tab-2', 'https://google.com', 0, 0, 800, 600);

    const instances = pool.getAllInstances();
    expect(instances).toHaveLength(2);
    expect(instances.map((i) => i.tabId)).toContain('tab-1');
    expect(instances.map((i) => i.tabId)).toContain('tab-2');
  });

  it('should get visible instance count', async () => {
    const pool = new CefBrowserPoolManager();

    await pool.createInstance('tab-1', 'https://example.com', 0, 0, 800, 600);
    expect(pool.getVisibleInstanceCount()).toBe(1); // tab-1 is visible

    await pool.createInstance('tab-2', 'https://google.com', 0, 0, 800, 600);
    expect(pool.getVisibleInstanceCount()).toBe(1); // Only tab-2 is visible (tab-1 is hidden)

    await pool.switchTab('tab-1');

    expect(pool.getVisibleInstanceCount()).toBe(1); // Only tab-1 is visible (tab-2 is hidden)
  });

  it('should call callbacks', async () => {
    const onInstanceCreated = vi.fn();
    const onInstanceDestroyed = vi.fn();
    const onTabSwitched = vi.fn();

    const pool = new CefBrowserPoolManager({
      onInstanceCreated,
      onInstanceDestroyed,
      onTabSwitched,
    });

    await pool.createInstance('tab-1', 'https://example.com', 0, 0, 800, 600);

    expect(onInstanceCreated).toHaveBeenCalledWith('tab-1');

    await pool.switchTab('tab-1');

    expect(onTabSwitched).toHaveBeenCalledWith('tab-1');

    await pool.destroyInstance('tab-1');

    expect(onInstanceDestroyed).toHaveBeenCalledWith('tab-1');
  });

  it('should clear all instances', async () => {
    const pool = new CefBrowserPoolManager();

    await pool.createInstance('tab-1', 'https://example.com', 0, 0, 800, 600);
    await pool.createInstance('tab-2', 'https://google.com', 0, 0, 800, 600);

    expect(pool.getInstanceCount()).toBe(2);

    await pool.clearAll();

    expect(pool.getInstanceCount()).toBe(0);
    expect(pool.getActiveTab()).toBeNull();
  });

  it('should validate input parameters', async () => {
    const pool = new CefBrowserPoolManager();

    // Test empty tabId
    await expect(pool.createInstance('', 'https://example.com', 0, 0, 800, 600)).rejects.toThrow(
      'tabId cannot be empty'
    );

    // Test empty URL
    await expect(pool.createInstance('tab-1', '', 0, 0, 800, 600)).rejects.toThrow(
      'url cannot be empty'
    );

    // Test invalid dimensions
    await expect(pool.createInstance('tab-1', 'https://example.com', 0, 0, 0, 600)).rejects.toThrow(
      'Width and height must be positive'
    );
  });

  it('should handle tab independence', async () => {
    // Property 2: Tab Independence
    // For any set of browser tabs, navigating in one tab should not affect the URL or state of other tabs.

    const pool = new CefBrowserPoolManager();

    await pool.createInstance('tab-1', 'https://example.com', 0, 0, 800, 600);
    await pool.createInstance('tab-2', 'https://google.com', 0, 0, 800, 600);

    const tab1Before = pool.getInstance('tab-1');
    const tab2Before = pool.getInstance('tab-2');

    expect(tab1Before?.tabId).toBe('tab-1');
    expect(tab2Before?.tabId).toBe('tab-2');

    // Switch to tab-1
    await pool.switchTab('tab-1');

    const tab1After = pool.getInstance('tab-1');
    const tab2After = pool.getInstance('tab-2');

    // Tab 1 should be visible, tab 2 should be hidden
    expect(tab1After?.isVisible).toBe(true);
    expect(tab2After?.isVisible).toBe(false);

    // But their other properties should remain unchanged
    expect(tab1After?.tabId).toBe(tab1Before?.tabId);
    expect(tab2After?.tabId).toBe(tab2Before?.tabId);
  });

  it('Property 2: Tab Independence - Multiple tabs maintain independent state', async () => {
    // **Feature: ai-browser, Property 2: Tab Independence**
    // For any set of browser tabs, navigating in one tab should not affect the URL or state of other tabs.
    // Validates: Requirements 1.5

    await fc.assert(
      fc.asyncProperty(
        fc.tuple(
          fc.webUrl(),
          fc.webUrl(),
          fc.webUrl()
        ).filter(([url1, url2, url3]) => url1 !== url2 && url2 !== url3 && url1 !== url3),
        async ([url1, url2, url3]) => {
          const pool = new CefBrowserPoolManager();

          // Create three tabs with different URLs
          await pool.createInstance('tab-1', url1, 0, 0, 800, 600);
          const tab1Initial = pool.getInstance('tab-1');

          await pool.createInstance('tab-2', url2, 0, 0, 800, 600);
          const tab2Initial = pool.getInstance('tab-2');

          await pool.createInstance('tab-3', url3, 0, 0, 800, 600);
          const tab3Initial = pool.getInstance('tab-3');

          // Verify all tabs exist
          expect(pool.getInstanceCount()).toBe(3);

          // Switch to tab-1
          await pool.switchTab('tab-1');

          // Get state after switch
          const tab1After = pool.getInstance('tab-1');
          const tab2After = pool.getInstance('tab-2');
          const tab3After = pool.getInstance('tab-3');

          // Verify tab independence:
          // 1. Tab IDs should remain unchanged
          expect(tab1After?.tabId).toBe(tab1Initial?.tabId);
          expect(tab2After?.tabId).toBe(tab2Initial?.tabId);
          expect(tab3After?.tabId).toBe(tab3Initial?.tabId);

          // 2. Dimensions should remain unchanged
          expect(tab1After?.x).toBe(tab1Initial?.x);
          expect(tab1After?.y).toBe(tab1Initial?.y);
          expect(tab1After?.width).toBe(tab1Initial?.width);
          expect(tab1After?.height).toBe(tab1Initial?.height);

          expect(tab2After?.x).toBe(tab2Initial?.x);
          expect(tab2After?.y).toBe(tab2Initial?.y);
          expect(tab2After?.width).toBe(tab2Initial?.width);
          expect(tab2After?.height).toBe(tab2Initial?.height);

          expect(tab3After?.x).toBe(tab3Initial?.x);
          expect(tab3After?.y).toBe(tab3Initial?.y);
          expect(tab3After?.width).toBe(tab3Initial?.width);
          expect(tab3After?.height).toBe(tab3Initial?.height);

          // 3. Only the active tab should be visible
          expect(tab1After?.isVisible).toBe(true);
          expect(tab2After?.isVisible).toBe(false);
          expect(tab3After?.isVisible).toBe(false);

          // 4. Active tab should be correctly tracked
          expect(pool.getActiveTab()).toBe('tab-1');

          // 5. Visible instance count should be exactly 1
          expect(pool.getVisibleInstanceCount()).toBe(1);

          // Switch to tab-2 and verify tab-1 is not affected
          await pool.switchTab('tab-2');

          const tab1Final = pool.getInstance('tab-1');
          const tab2Final = pool.getInstance('tab-2');

          // Tab-1 should still exist with same properties
          expect(tab1Final?.tabId).toBe('tab-1');
          expect(tab1Final?.x).toBe(tab1Initial?.x);
          expect(tab1Final?.y).toBe(tab1Initial?.y);
          expect(tab1Final?.width).toBe(tab1Initial?.width);
          expect(tab1Final?.height).toBe(tab1Initial?.height);

          // But visibility should change
          expect(tab1Final?.isVisible).toBe(false);
          expect(tab2Final?.isVisible).toBe(true);

          // Cleanup
          await pool.clearAll();

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 2: Tab Independence - Bounds updates do not affect other tabs', async () => {
    // **Feature: ai-browser, Property 2: Tab Independence**
    // Validates: Requirements 1.5

    await fc.assert(
      fc.asyncProperty(
        fc.tuple(
          fc.integer({ min: 0, max: 1920 }),
          fc.integer({ min: 0, max: 1080 }),
          fc.integer({ min: 100, max: 1920 }),
          fc.integer({ min: 100, max: 1080 })
        ),
        async ([x, y, width, height]) => {
          const pool = new CefBrowserPoolManager();

          // Create two tabs
          await pool.createInstance('tab-1', 'https://example.com', 0, 0, 800, 600);
          await pool.createInstance('tab-2', 'https://google.com', 100, 100, 900, 700);

          const tab2Before = pool.getInstance('tab-2');

          // Update bounds of tab-1
          await pool.updateBounds('tab-1', x, y, width, height);

          // Verify tab-1 bounds changed
          const tab1After = pool.getInstance('tab-1');
          expect(tab1After?.x).toBe(x);
          expect(tab1After?.y).toBe(y);
          expect(tab1After?.width).toBe(width);
          expect(tab1After?.height).toBe(height);

          // Verify tab-2 bounds unchanged
          const tab2After = pool.getInstance('tab-2');
          expect(tab2After?.x).toBe(tab2Before?.x);
          expect(tab2After?.y).toBe(tab2Before?.y);
          expect(tab2After?.width).toBe(tab2Before?.width);
          expect(tab2After?.height).toBe(tab2Before?.height);

          // Cleanup
          await pool.clearAll();

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
