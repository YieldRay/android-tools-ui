use tauri::AppHandle;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

/// Cross-platform `which` — resolves a command name to its full path.
/// Also checks common Android SDK locations for known SDK tools.
#[tauri::command]
pub async fn which(app: AppHandle, command: String) -> Result<String, String> {
    // First try system PATH
    let path = if cfg!(target_os = "windows") {
        let mut std_cmd = std::process::Command::new("cmd");
        std_cmd.args(["/C", &format!("where {command}")]);
        #[cfg(target_os = "windows")]
        std_cmd.creation_flags(0x08000000);
        let output = tokio::process::Command::from(std_cmd)
            .output()
            .await
            .map_err(|e| format!("failed to run `where`: {e}"))?;
        if output.status.success() {
            let p = String::from_utf8_lossy(&output.stdout)
                .lines()
                .next()
                .unwrap_or_default()
                .to_string();
            if !p.is_empty() {
                return Ok(p);
            }
        }
        String::new()
    } else {
        let output = tokio::process::Command::new("which")
            .arg(&command)
            .output()
            .await
            .map_err(|e| format!("failed to run `which`: {e}"))?;
        if output.status.success() {
            let p = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !p.is_empty() {
                return Ok(p);
            }
        }
        String::new()
    };

    if !path.is_empty() {
        return Ok(path);
    }

    // Fallback: check Android SDK locations for known tools
    if let Some(found) = find_in_sdk(&app, &command) {
        return Ok(found);
    }

    Err(format!("command `{command}` not found"))
}

/// Check common SDK paths for known Android tools
fn find_in_sdk(app: &AppHandle, command: &str) -> Option<String> {
    let home = super::config::resolve_android_home(app).ok()?;

    let candidates: Vec<std::path::PathBuf> = match command {
        "avdmanager" | "sdkmanager" | "apkanalyzer" | "lint" => {
            let mut paths = Vec::new();
            let ct_dir = home.join("cmdline-tools");
            // Prefer configured version
            if let Some(version) = super::config::cmdline_tools_version(app) {
                paths.push(ct_dir.join(&version).join("bin").join(command));
            }
            if ct_dir.is_dir() {
                if let Ok(entries) = std::fs::read_dir(&ct_dir) {
                    for entry in entries.flatten() {
                        paths.push(entry.path().join("bin").join(command));
                    }
                }
            }
            paths.push(home.join("tools/bin").join(command));
            paths
        }
        "emulator" => vec![home.join("emulator/emulator")],
        "adb" | "fastboot" => vec![home.join("platform-tools").join(command)],
        _ => return None,
    };

    let ext = if cfg!(target_os = "windows") {
        Some("exe")
    } else {
        None
    };

    for c in candidates {
        let c = if let Some(e) = ext {
            c.with_extension(e)
        } else {
            c
        };
        if c.exists() {
            return Some(c.to_string_lossy().into_owned());
        }
    }
    None
}
