use std::path::PathBuf;
use tauri::{AppHandle, Runtime};
use tauri_plugin_store::StoreExt;

/// Read a string value from the app settings store.
fn store_get<R: Runtime>(app: &AppHandle<R>, key: &str) -> Option<String> {
    let store = app.store("settings.json").ok()?;
    let val = store.get(key)?;
    val.as_str().map(|s| s.to_string()).filter(|s| !s.is_empty())
}

/// Resolve ANDROID_HOME: app config override > env var > platform default.
pub fn resolve_android_home<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    // Check app config override first
    if let Some(home) = store_get(app, "androidHome") {
        return Ok(PathBuf::from(home));
    }
    if let Some(root) = store_get(app, "androidSdkRoot") {
        return Ok(PathBuf::from(root));
    }

    // Fall back to env vars
    if let Ok(home) = std::env::var("ANDROID_HOME") {
        if !home.is_empty() {
            return Ok(PathBuf::from(home));
        }
    }
    if let Ok(root) = std::env::var("ANDROID_SDK_ROOT") {
        if !root.is_empty() {
            return Ok(PathBuf::from(root));
        }
    }

    // Platform defaults
    #[cfg(target_os = "macos")]
    {
        if let Ok(home) = std::env::var("HOME") {
            let p = PathBuf::from(home).join("Library/Android/sdk");
            if p.exists() {
                return Ok(p);
            }
        }
    }
    #[cfg(target_os = "linux")]
    {
        if let Ok(home) = std::env::var("HOME") {
            let p = PathBuf::from(home).join("Android/Sdk");
            if p.exists() {
                return Ok(p);
            }
        }
    }
    #[cfg(target_os = "windows")]
    {
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            let p = PathBuf::from(local).join("Android\\Sdk");
            if p.exists() {
                return Ok(p);
            }
        }
    }
    Err("ANDROID_HOME not set and no default SDK location found".into())
}

/// Get the configured cmdline-tools version from the store.
pub fn cmdline_tools_version<R: Runtime>(app: &AppHandle<R>) -> Option<String> {
    store_get(app, "cmdlineToolsVersion")
}
