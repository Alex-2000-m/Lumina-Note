use crate::error::AppError;
use crate::fs::{self, FileEntry};

/// Read file content
#[tauri::command]
pub async fn read_file(path: String) -> Result<String, AppError> {
    fs::read_file_content(&path)
}

/// Save file content
#[tauri::command]
pub async fn save_file(path: String, content: String) -> Result<(), AppError> {
    fs::write_file_content(&path, &content)
}

/// List directory with file tree
#[tauri::command]
pub async fn list_directory(path: String) -> Result<Vec<FileEntry>, AppError> {
    fs::list_dir_recursive(&path)
}

/// Create a new file
#[tauri::command]
pub async fn create_file(path: String) -> Result<(), AppError> {
    fs::create_new_file(&path)
}

/// Create a new directory
#[tauri::command]
pub async fn create_dir(path: String) -> Result<(), AppError> {
    fs::create_new_dir(&path)
}

/// Delete a file or directory
#[tauri::command]
pub async fn delete_file(path: String) -> Result<(), AppError> {
    fs::delete_entry(&path)
}

/// Rename/move a file
#[tauri::command]
pub async fn rename_file(old_path: String, new_path: String) -> Result<(), AppError> {
    fs::rename_entry(&old_path, &new_path)
}

/// Show file/folder in system file explorer
#[tauri::command]
pub async fn show_in_explorer(path: String) -> Result<(), AppError> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .args(["/select,", &path])
            .spawn()?;
    }
    
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-R", &path])
            .spawn()?;
    }
    
    #[cfg(target_os = "linux")]
    {
        // Try xdg-open for the parent directory
        let parent = std::path::Path::new(&path)
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or(path);
        std::process::Command::new("xdg-open")
            .arg(&parent)
            .spawn()?;
    }
    
    Ok(())
}
