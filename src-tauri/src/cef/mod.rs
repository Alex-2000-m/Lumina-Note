/// CEF (Chromium Embedded Framework) Integration Module
/// 
/// This module provides CEF browser instance management and commands
/// for the AI Browser feature.

use crate::error::AppError;
use std::collections::HashMap;
use std::sync::Mutex;
use serde::{Serialize, Deserialize};

pub mod commands;

/// CEF Instance Pool Manager
/// Manages multiple CEF browser instances for multi-tab support
pub struct CefInstancePool {
    instances: Mutex<HashMap<String, CefInstance>>,
}

/// CEF Browser Instance
#[derive(Debug, Clone)]
pub struct CefInstance {
    pub tab_id: String,
    pub is_visible: bool,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl CefInstancePool {
    /// Create a new CEF Instance Pool
    pub fn new() -> Self {
        CefInstancePool {
            instances: Mutex::new(HashMap::new()),
        }
    }

    /// Register a new CEF instance
    pub fn register_instance(
        &self,
        tab_id: String,
        x: f64,
        y: f64,
        width: f64,
        height: f64,
    ) -> Result<(), AppError> {
        let mut instances = self.instances.lock()
            .map_err(|_| AppError::InvalidPath("Failed to lock instance pool".into()))?;
        
        instances.insert(tab_id.clone(), CefInstance {
            tab_id,
            is_visible: true,
            x,
            y,
            width,
            height,
        });
        
        Ok(())
    }

    /// Unregister a CEF instance
    pub fn unregister_instance(&self, tab_id: &str) -> Result<(), AppError> {
        let mut instances = self.instances.lock()
            .map_err(|_| AppError::InvalidPath("Failed to lock instance pool".into()))?;
        
        instances.remove(tab_id);
        Ok(())
    }

    /// Get a CEF instance
    pub fn get_instance(&self, tab_id: &str) -> Result<Option<CefInstance>, AppError> {
        let instances = self.instances.lock()
            .map_err(|_| AppError::InvalidPath("Failed to lock instance pool".into()))?;
        
        Ok(instances.get(tab_id).cloned())
    }

    /// Show a CEF instance (hide all others)
    pub fn show_instance(&self, tab_id: &str) -> Result<(), AppError> {
        let mut instances = self.instances.lock()
            .map_err(|_| AppError::InvalidPath("Failed to lock instance pool".into()))?;
        
        // Hide all instances
        for instance in instances.values_mut() {
            instance.is_visible = false;
        }
        
        // Show the target instance
        if let Some(instance) = instances.get_mut(tab_id) {
            instance.is_visible = true;
        }
        
        Ok(())
    }

    /// Hide a CEF instance
    pub fn hide_instance(&self, tab_id: &str) -> Result<(), AppError> {
        let mut instances = self.instances.lock()
            .map_err(|_| AppError::InvalidPath("Failed to lock instance pool".into()))?;
        
        if let Some(instance) = instances.get_mut(tab_id) {
            instance.is_visible = false;
        }
        
        Ok(())
    }

    /// Update instance bounds
    pub fn update_instance_bounds(
        &self,
        tab_id: &str,
        x: f64,
        y: f64,
        width: f64,
        height: f64,
    ) -> Result<(), AppError> {
        let mut instances = self.instances.lock()
            .map_err(|_| AppError::InvalidPath("Failed to lock instance pool".into()))?;
        
        if let Some(instance) = instances.get_mut(tab_id) {
            instance.x = x;
            instance.y = y;
            instance.width = width;
            instance.height = height;
        }
        
        Ok(())
    }

    /// Get all instances
    pub fn get_all_instances(&self) -> Result<Vec<CefInstance>, AppError> {
        let instances = self.instances.lock()
            .map_err(|_| AppError::InvalidPath("Failed to lock instance pool".into()))?;
        
        Ok(instances.values().cloned().collect())
    }

    /// Get visible instance count
    pub fn get_visible_instance_count(&self) -> Result<usize, AppError> {
        let instances = self.instances.lock()
            .map_err(|_| AppError::InvalidPath("Failed to lock instance pool".into()))?;
        
        Ok(instances.values().filter(|i| i.is_visible).count())
    }

    /// Get instance count
    pub fn get_instance_count(&self) -> Result<usize, AppError> {
        let instances = self.instances.lock()
            .map_err(|_| AppError::InvalidPath("Failed to lock instance pool".into()))?;
        
        Ok(instances.len())
    }
}

impl Default for CefInstancePool {
    fn default() -> Self {
        Self::new()
    }
}

/// Navigation history entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NavigationHistoryEntry {
    pub url: String,
    pub title: String,
    pub timestamp: u64,
}

/// CEF Browser Instance Information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CefBrowserInfo {
    pub tab_id: String,
    pub url: String,
    pub title: String,
    pub is_loading: bool,
    pub can_go_back: bool,
    pub can_go_forward: bool,
    pub history: Vec<NavigationHistoryEntry>,
    pub history_index: usize,
}

/// CEF Browser Manager
/// Manages multiple CEF browser instances for multi-tab support
pub struct CefBrowserManager {
    browsers: Mutex<HashMap<String, CefBrowserInfo>>,
}

impl CefBrowserManager {
    /// Create a new CEF Browser Manager
    pub fn new() -> Self {
        CefBrowserManager {
            browsers: Mutex::new(HashMap::new()),
        }
    }

    /// Register a new browser instance
    pub fn register_browser(&self, tab_id: String, url: String) -> Result<(), AppError> {
        let mut browsers = self.browsers.lock()
            .map_err(|_| AppError::InvalidPath("Failed to lock browser manager".into()))?;
        
        let history = vec![NavigationHistoryEntry {
            url: url.clone(),
            title: String::new(),
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64,
        }];
        
        browsers.insert(tab_id.clone(), CefBrowserInfo {
            tab_id,
            url,
            title: String::new(),
            is_loading: true,
            can_go_back: false,
            can_go_forward: false,
            history,
            history_index: 0,
        });
        
        Ok(())
    }

    /// Unregister a browser instance
    pub fn unregister_browser(&self, tab_id: &str) -> Result<(), AppError> {
        let mut browsers = self.browsers.lock()
            .map_err(|_| AppError::InvalidPath("Failed to lock browser manager".into()))?;
        
        browsers.remove(tab_id);
        Ok(())
    }

    /// Get browser info
    pub fn get_browser(&self, tab_id: &str) -> Result<Option<CefBrowserInfo>, AppError> {
        let browsers = self.browsers.lock()
            .map_err(|_| AppError::InvalidPath("Failed to lock browser manager".into()))?;
        
        Ok(browsers.get(tab_id).cloned())
    }

    /// Update browser info
    #[allow(dead_code)]
    pub fn update_browser(&self, tab_id: &str, info: CefBrowserInfo) -> Result<(), AppError> {
        let mut browsers = self.browsers.lock()
            .map_err(|_| AppError::InvalidPath("Failed to lock browser manager".into()))?;
        
        browsers.insert(tab_id.to_string(), info);
        Ok(())
    }

    /// Get all browsers
    #[allow(dead_code)]
    pub fn get_all_browsers(&self) -> Result<Vec<CefBrowserInfo>, AppError> {
        let browsers = self.browsers.lock()
            .map_err(|_| AppError::InvalidPath("Failed to lock browser manager".into()))?;
        
        Ok(browsers.values().cloned().collect())
    }

    /// Handle URL change event
    pub fn on_url_change(&self, tab_id: &str, url: String) -> Result<(), AppError> {
        let mut browsers = self.browsers.lock()
            .map_err(|_| AppError::InvalidPath("Failed to lock browser manager".into()))?;
        
        if let Some(browser) = browsers.get_mut(tab_id) {
            // If we're not at the end of history, truncate forward history
            if browser.history_index < browser.history.len() - 1 {
                browser.history.truncate(browser.history_index + 1);
            }
            
            // Add new entry to history
            browser.history.push(NavigationHistoryEntry {
                url: url.clone(),
                title: String::new(),
                timestamp: std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as u64,
            });
            
            browser.url = url;
            browser.history_index = browser.history.len() - 1;
            browser.can_go_back = browser.history_index > 0;
            browser.can_go_forward = false;
        }
        
        Ok(())
    }

    /// Handle title change event
    pub fn on_title_change(&self, tab_id: &str, title: String) -> Result<(), AppError> {
        let mut browsers = self.browsers.lock()
            .map_err(|_| AppError::InvalidPath("Failed to lock browser manager".into()))?;
        
        if let Some(browser) = browsers.get_mut(tab_id) {
            browser.title = title.clone();
            
            // Update title in current history entry
            if let Some(entry) = browser.history.get_mut(browser.history_index) {
                entry.title = title;
            }
        }
        
        Ok(())
    }

    /// Handle loading state change event
    pub fn on_loading_state_change(&self, tab_id: &str, is_loading: bool) -> Result<(), AppError> {
        let mut browsers = self.browsers.lock()
            .map_err(|_| AppError::InvalidPath("Failed to lock browser manager".into()))?;
        
        if let Some(browser) = browsers.get_mut(tab_id) {
            browser.is_loading = is_loading;
        }
        
        Ok(())
    }

    /// Handle back navigation
    pub fn on_go_back(&self, tab_id: &str) -> Result<Option<String>, AppError> {
        let mut browsers = self.browsers.lock()
            .map_err(|_| AppError::InvalidPath("Failed to lock browser manager".into()))?;
        
        if let Some(browser) = browsers.get_mut(tab_id) {
            if browser.history_index > 0 {
                browser.history_index -= 1;
                browser.can_go_back = browser.history_index > 0;
                browser.can_go_forward = true;
                
                if let Some(entry) = browser.history.get(browser.history_index) {
                    browser.url = entry.url.clone();
                    return Ok(Some(entry.url.clone()));
                }
            }
        }
        
        Ok(None)
    }

    /// Handle forward navigation
    pub fn on_go_forward(&self, tab_id: &str) -> Result<Option<String>, AppError> {
        let mut browsers = self.browsers.lock()
            .map_err(|_| AppError::InvalidPath("Failed to lock browser manager".into()))?;
        
        if let Some(browser) = browsers.get_mut(tab_id) {
            if browser.history_index < browser.history.len() - 1 {
                browser.history_index += 1;
                browser.can_go_forward = browser.history_index < browser.history.len() - 1;
                browser.can_go_back = true;
                
                if let Some(entry) = browser.history.get(browser.history_index) {
                    browser.url = entry.url.clone();
                    return Ok(Some(entry.url.clone()));
                }
            }
        }
        
        Ok(None)
    }
}

impl Default for CefBrowserManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_register_browser() {
        let manager = CefBrowserManager::new();
        let result = manager.register_browser(
            "tab-1".to_string(),
            "https://example.com".to_string(),
        );
        assert!(result.is_ok());
    }

    #[test]
    fn test_get_browser() {
        let manager = CefBrowserManager::new();
        manager.register_browser(
            "tab-1".to_string(),
            "https://example.com".to_string(),
        ).unwrap();
        
        let browser = manager.get_browser("tab-1").unwrap();
        assert!(browser.is_some());
        assert_eq!(browser.unwrap().tab_id, "tab-1");
    }

    #[test]
    fn test_unregister_browser() {
        let manager = CefBrowserManager::new();
        manager.register_browser(
            "tab-1".to_string(),
            "https://example.com".to_string(),
        ).unwrap();
        
        let result = manager.unregister_browser("tab-1");
        assert!(result.is_ok());
        
        let browser = manager.get_browser("tab-1").unwrap();
        assert!(browser.is_none());
    }

    #[test]
    fn test_on_url_change() {
        let manager = CefBrowserManager::new();
        manager.register_browser(
            "tab-1".to_string(),
            "https://example.com".to_string(),
        ).unwrap();
        
        let result = manager.on_url_change("tab-1", "https://google.com".to_string());
        assert!(result.is_ok());
        
        let browser = manager.get_browser("tab-1").unwrap().unwrap();
        assert_eq!(browser.url, "https://google.com");
        assert_eq!(browser.history.len(), 2);
        assert!(browser.can_go_back);
        assert!(!browser.can_go_forward);
    }

    #[test]
    fn test_on_title_change() {
        let manager = CefBrowserManager::new();
        manager.register_browser(
            "tab-1".to_string(),
            "https://example.com".to_string(),
        ).unwrap();
        
        let result = manager.on_title_change("tab-1", "Example Page".to_string());
        assert!(result.is_ok());
        
        let browser = manager.get_browser("tab-1").unwrap().unwrap();
        assert_eq!(browser.title, "Example Page");
    }

    #[test]
    fn test_on_loading_state_change() {
        let manager = CefBrowserManager::new();
        manager.register_browser(
            "tab-1".to_string(),
            "https://example.com".to_string(),
        ).unwrap();
        
        let result = manager.on_loading_state_change("tab-1", false);
        assert!(result.is_ok());
        
        let browser = manager.get_browser("tab-1").unwrap().unwrap();
        assert!(!browser.is_loading);
    }

    #[test]
    fn test_on_go_back() {
        let manager = CefBrowserManager::new();
        manager.register_browser(
            "tab-1".to_string(),
            "https://example.com".to_string(),
        ).unwrap();
        
        // Navigate to a new URL
        manager.on_url_change("tab-1", "https://google.com".to_string()).unwrap();
        
        // Go back
        let result = manager.on_go_back("tab-1").unwrap();
        assert!(result.is_some());
        assert_eq!(result.unwrap(), "https://example.com");
        
        let browser = manager.get_browser("tab-1").unwrap().unwrap();
        assert_eq!(browser.url, "https://example.com");
        assert!(!browser.can_go_back);
        assert!(browser.can_go_forward);
    }

    #[test]
    fn test_on_go_forward() {
        let manager = CefBrowserManager::new();
        manager.register_browser(
            "tab-1".to_string(),
            "https://example.com".to_string(),
        ).unwrap();
        
        // Navigate to a new URL
        manager.on_url_change("tab-1", "https://google.com".to_string()).unwrap();
        
        // Go back
        manager.on_go_back("tab-1").unwrap();
        
        // Go forward
        let result = manager.on_go_forward("tab-1").unwrap();
        assert!(result.is_some());
        assert_eq!(result.unwrap(), "https://google.com");
        
        let browser = manager.get_browser("tab-1").unwrap().unwrap();
        assert_eq!(browser.url, "https://google.com");
        assert!(browser.can_go_back);
        assert!(!browser.can_go_forward);
    }

    #[test]
    fn test_navigation_history_consistency() {
        // Property 1: Navigation History Back/Forward Consistency
        // For any sequence of URL navigations, clicking back should return to the previous URL,
        // and clicking forward after back should return to the URL we came from.
        
        let manager = CefBrowserManager::new();
        manager.register_browser(
            "tab-1".to_string(),
            "https://example.com".to_string(),
        ).unwrap();
        
        // Navigate through multiple URLs
        manager.on_url_change("tab-1", "https://google.com".to_string()).unwrap();
        manager.on_url_change("tab-1", "https://github.com".to_string()).unwrap();
        
        let browser = manager.get_browser("tab-1").unwrap().unwrap();
        assert_eq!(browser.url, "https://github.com");
        assert_eq!(browser.history.len(), 3);
        
        // Go back twice
        let back1 = manager.on_go_back("tab-1").unwrap();
        assert_eq!(back1, Some("https://google.com".to_string()));
        
        let back2 = manager.on_go_back("tab-1").unwrap();
        assert_eq!(back2, Some("https://example.com".to_string()));
        
        // Go forward twice
        let forward1 = manager.on_go_forward("tab-1").unwrap();
        assert_eq!(forward1, Some("https://google.com".to_string()));
        
        let forward2 = manager.on_go_forward("tab-1").unwrap();
        assert_eq!(forward2, Some("https://github.com".to_string()));
    }

    #[test]
    fn test_cef_instance_pool_register() {
        let pool = CefInstancePool::new();
        let result = pool.register_instance(
            "tab-1".to_string(),
            0.0,
            0.0,
            800.0,
            600.0,
        );
        assert!(result.is_ok());
    }

    #[test]
    fn test_cef_instance_pool_get() {
        let pool = CefInstancePool::new();
        pool.register_instance(
            "tab-1".to_string(),
            0.0,
            0.0,
            800.0,
            600.0,
        ).unwrap();
        
        let instance = pool.get_instance("tab-1").unwrap();
        assert!(instance.is_some());
        assert_eq!(instance.unwrap().tab_id, "tab-1");
    }

    #[test]
    fn test_cef_instance_pool_unregister() {
        let pool = CefInstancePool::new();
        pool.register_instance(
            "tab-1".to_string(),
            0.0,
            0.0,
            800.0,
            600.0,
        ).unwrap();
        
        let result = pool.unregister_instance("tab-1");
        assert!(result.is_ok());
        
        let instance = pool.get_instance("tab-1").unwrap();
        assert!(instance.is_none());
    }

    #[test]
    fn test_cef_instance_pool_show_instance() {
        let pool = CefInstancePool::new();
        pool.register_instance("tab-1".to_string(), 0.0, 0.0, 800.0, 600.0).unwrap();
        pool.register_instance("tab-2".to_string(), 0.0, 0.0, 800.0, 600.0).unwrap();
        
        // Show tab-2 (should hide tab-1)
        pool.show_instance("tab-2").unwrap();
        
        let tab1 = pool.get_instance("tab-1").unwrap().unwrap();
        let tab2 = pool.get_instance("tab-2").unwrap().unwrap();
        
        assert!(!tab1.is_visible);
        assert!(tab2.is_visible);
    }

    #[test]
    fn test_cef_instance_pool_hide_instance() {
        let pool = CefInstancePool::new();
        pool.register_instance("tab-1".to_string(), 0.0, 0.0, 800.0, 600.0).unwrap();
        
        pool.hide_instance("tab-1").unwrap();
        
        let instance = pool.get_instance("tab-1").unwrap().unwrap();
        assert!(!instance.is_visible);
    }

    #[test]
    fn test_cef_instance_pool_update_bounds() {
        let pool = CefInstancePool::new();
        pool.register_instance("tab-1".to_string(), 0.0, 0.0, 800.0, 600.0).unwrap();
        
        pool.update_instance_bounds("tab-1", 100.0, 100.0, 1024.0, 768.0).unwrap();
        
        let instance = pool.get_instance("tab-1").unwrap().unwrap();
        assert_eq!(instance.x, 100.0);
        assert_eq!(instance.y, 100.0);
        assert_eq!(instance.width, 1024.0);
        assert_eq!(instance.height, 768.0);
    }

    #[test]
    fn test_cef_instance_pool_get_all_instances() {
        let pool = CefInstancePool::new();
        pool.register_instance("tab-1".to_string(), 0.0, 0.0, 800.0, 600.0).unwrap();
        pool.register_instance("tab-2".to_string(), 0.0, 0.0, 800.0, 600.0).unwrap();
        
        let instances = pool.get_all_instances().unwrap();
        assert_eq!(instances.len(), 2);
    }

    #[test]
    fn test_cef_instance_pool_get_visible_count() {
        let pool = CefInstancePool::new();
        pool.register_instance("tab-1".to_string(), 0.0, 0.0, 800.0, 600.0).unwrap();
        pool.register_instance("tab-2".to_string(), 0.0, 0.0, 800.0, 600.0).unwrap();
        
        // Initially both are visible
        assert_eq!(pool.get_visible_instance_count().unwrap(), 2);
        
        // Show tab-1 (hides tab-2)
        pool.show_instance("tab-1").unwrap();
        assert_eq!(pool.get_visible_instance_count().unwrap(), 1);
    }

    #[test]
    fn test_cef_instance_pool_get_count() {
        let pool = CefInstancePool::new();
        pool.register_instance("tab-1".to_string(), 0.0, 0.0, 800.0, 600.0).unwrap();
        pool.register_instance("tab-2".to_string(), 0.0, 0.0, 800.0, 600.0).unwrap();
        
        assert_eq!(pool.get_instance_count().unwrap(), 2);
    }

    #[test]
    fn test_tab_independence() {
        // Property 2: Tab Independence
        // For any set of browser tabs, navigating in one tab should not affect the URL or state of other tabs.
        
        let manager = CefBrowserManager::new();
        
        // Create two tabs
        manager.register_browser("tab-1".to_string(), "https://example.com".to_string()).unwrap();
        manager.register_browser("tab-2".to_string(), "https://google.com".to_string()).unwrap();
        
        // Navigate in tab-1
        manager.on_url_change("tab-1", "https://github.com".to_string()).unwrap();
        
        // Check that tab-2 is unaffected
        let tab1 = manager.get_browser("tab-1").unwrap().unwrap();
        let tab2 = manager.get_browser("tab-2").unwrap().unwrap();
        
        assert_eq!(tab1.url, "https://github.com");
        assert_eq!(tab2.url, "https://google.com");
    }
}
