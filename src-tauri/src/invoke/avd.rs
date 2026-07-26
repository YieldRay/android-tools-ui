use std::collections::HashMap;
use std::path::PathBuf;

use ini::ini;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

type IniMap = HashMap<String, HashMap<String, Option<String>>>;

/// Read a flat key=value INI file via the `ini!` macro.
/// Returns None if the file cannot be loaded.
fn read_ini(path: &std::path::Path) -> Option<IniMap> {
    let p = path.to_str()?;
    ini!(safe p).ok()
}

/// Get a value from an ini map (section-less keys are under "default")
fn ini_get(map: &IniMap, section: &str, key: &str) -> String {
    map.get(section)
        .and_then(|s| s.get(key))
        .and_then(|v| v.clone())
        .unwrap_or_default()
}



/// Find avdmanager binary in the SDK
fn find_avdmanager(app: &AppHandle) -> Result<PathBuf, String> {
    let home = super::config::resolve_android_home(app)?;
    let cmdline_tools_dir = home.join("cmdline-tools");

    // Prefer the user-configured version if set
    if let Some(version) = super::config::cmdline_tools_version(app) {
        let candidate = cmdline_tools_dir.join(&version).join("bin/avdmanager");
        let candidate = if cfg!(target_os = "windows") {
            candidate.with_extension("bat")
        } else {
            candidate
        };
        if candidate.exists() {
            return Ok(candidate);
        }
    }

    // Scan versioned subdirs (e.g. cmdline-tools/20.0/bin/avdmanager)
    if cmdline_tools_dir.is_dir() {
        if let Ok(entries) = std::fs::read_dir(&cmdline_tools_dir) {
            for entry in entries.flatten() {
                let candidate = entry.path().join("bin/avdmanager");
                let candidate = if cfg!(target_os = "windows") {
                    candidate.with_extension("bat")
                } else {
                    candidate
                };
                if candidate.exists() {
                    return Ok(candidate);
                }
            }
        }
    }
    // Fallback: older SDK layout
    let fallback = home.join("tools/bin/avdmanager");
    let fallback = if cfg!(target_os = "windows") {
        fallback.with_extension("bat")
    } else {
        fallback
    };
    if fallback.exists() {
        return Ok(fallback);
    }
    Err("avdmanager not found. Install \"cmdline-tools\" from the SDK page.".into())
}

/// Find emulator binary in the SDK
fn find_emulator(app: &AppHandle) -> Result<PathBuf, String> {
    let home = super::config::resolve_android_home(app)?;
    let path = home.join("emulator/emulator");
    let path = if cfg!(target_os = "windows") {
        path.with_extension("exe")
    } else {
        path
    };
    if path.exists() {
        Ok(path)
    } else {
        Err("emulator not found. Install \"emulator\" from the SDK page.".into())
    }
}

#[derive(Serialize)]
pub struct AvdToolsStatus {
    pub avdmanager: bool,
    pub emulator: bool,
    /// Human-readable message if something is missing
    pub message: Option<String>,
}

/// Check if avdmanager and emulator are available in the SDK
#[tauri::command]
pub async fn avd_check_tools(app: AppHandle) -> Result<AvdToolsStatus, String> {
    let has_avdmanager = find_avdmanager(&app).is_ok();
    let has_emulator = find_emulator(&app).is_ok();

    let message = if !has_avdmanager && !has_emulator {
        Some("Both \"cmdline-tools\" and \"emulator\" are not installed.".into())
    } else if !has_avdmanager {
        Some("\"cmdline-tools\" (contains avdmanager) is not installed.".into())
    } else if !has_emulator {
        Some("\"emulator\" is not installed.".into())
    } else {
        None
    };

    Ok(AvdToolsStatus {
        avdmanager: has_avdmanager,
        emulator: has_emulator,
        message,
    })
}

#[derive(Serialize, Clone)]
pub struct AvdInfo {
    pub name: String,
    pub device: String,
    pub path: String,
    pub target: String,
    pub abi: String,
}

/// List all AVDs using avdmanager
#[tauri::command]
pub async fn avd_list() -> Result<Vec<AvdInfo>, String> {
    let avd_dir = avd_home_dir();
    if !avd_dir.exists() {
        return Ok(vec![]);
    }

    let mut avds = Vec::new();

    let entries = std::fs::read_dir(&avd_dir).map_err(|e| format!("cannot read avd dir: {e}"))?;
    for entry in entries.flatten() {
        let file_name = entry.file_name();
        let name_os = file_name.to_string_lossy();
        // Only look at <name>.ini files (skip .avd directories)
        let Some(name) = name_os.strip_suffix(".ini") else {
            continue;
        };

        let Some(ini) = read_ini(&entry.path()) else {
            continue;
        };

        let path = ini_get(&ini, "default", "path");
        let mut target = ini_get(&ini, "default", "target");

        let config_path = avd_dir.join(format!("{name}.avd/config.ini"));
        let (device, abi) = if let Some(cfg) = read_ini(&config_path) {
            let device = ini_get(&cfg, "default", "hw.device.name");
            let abi = ini_get(&cfg, "default", "abi.type");
            if target.is_empty() {
                target = ini_get(&cfg, "default", "tag.id");
            }
            (device, abi)
        } else {
            (String::new(), String::new())
        };

        avds.push(AvdInfo {
            name: name.to_string(),
            device,
            path,
            target,
            abi,
        });
    }

    Ok(avds)
}

/// Returns the directory where AVD .ini and .avd folders live
fn avd_home_dir() -> PathBuf {
    if let Ok(avd_home) = std::env::var("ANDROID_AVD_HOME") {
        return PathBuf::from(avd_home);
    }
    if let Ok(home) = std::env::var("HOME") {
        return PathBuf::from(home).join(".android/avd");
    }
    #[cfg(target_os = "windows")]
    {
        if let Ok(profile) = std::env::var("USERPROFILE") {
            return PathBuf::from(profile).join(".android\\avd");
        }
    }
    PathBuf::from(".android/avd")
}

#[derive(Serialize, Clone)]
pub struct AvdTarget {
    pub id: String,
    pub label: String,
}

/// List available system image targets that can be used to create AVDs
#[tauri::command]
pub async fn avd_list_targets(app: AppHandle) -> Result<Vec<AvdTarget>, String> {
    let home = super::config::resolve_android_home(&app)?;
    let sys_img_dir = home.join("system-images");
    if !sys_img_dir.exists() {
        return Ok(vec![]);
    }

    let mut targets = Vec::new();

    // Walk system-images/<api>/<tag>/<abi>/
    if let Ok(apis) = std::fs::read_dir(&sys_img_dir) {
        for api_entry in apis.flatten() {
            let api_name = api_entry.file_name().to_string_lossy().to_string();
            if let Ok(tags) = std::fs::read_dir(api_entry.path()) {
                for tag_entry in tags.flatten() {
                    let tag_name = tag_entry.file_name().to_string_lossy().to_string();
                    if let Ok(abis) = std::fs::read_dir(tag_entry.path()) {
                        for abi_entry in abis.flatten() {
                            let abi_name = abi_entry.file_name().to_string_lossy().to_string();
                            let id = format!("system-images;{api_name};{tag_name};{abi_name}");
                            let label = format!("{api_name} ({tag_name}, {abi_name})");
                            targets.push(AvdTarget { id, label });
                        }
                    }
                }
            }
        }
    }

    targets.sort_by(|a, b| a.label.cmp(&b.label));
    Ok(targets)
}

#[derive(Deserialize)]
pub struct AvdCreateParams {
    pub name: String,
    /// system-images;android-XX;tag;abi
    pub package: String,
    /// Optional device definition (e.g. "pixel_6")
    pub device: Option<String>,
}

/// Create a new AVD
#[tauri::command]
pub async fn avd_create(app: AppHandle, params: AvdCreateParams) -> Result<String, String> {
    let avdmanager = find_avdmanager(&app)?;

    let mut args = vec![
        "create".to_string(),
        "avd".to_string(),
        "-n".to_string(),
        params.name.clone(),
        "-k".to_string(),
        params.package,
        "--force".to_string(),
    ];

    if let Some(device) = params.device {
        if !device.is_empty() {
            args.push("-d".to_string());
            args.push(device);
        }
    }

    let mut std_cmd = std::process::Command::new(&avdmanager);
    std_cmd
        .args(&args)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    #[cfg(target_os = "windows")]
    std_cmd.creation_flags(0x08000000);
    let mut child = tokio::process::Command::from(std_cmd)
        .spawn()
        .map_err(|e| format!("failed to spawn avdmanager: {e}"))?;

    // Answer "no" to the custom hardware profile prompt
    if let Some(mut stdin) = child.stdin.take() {
        use tokio::io::AsyncWriteExt;
        let _ = stdin.write_all(b"no\n").await;
        drop(stdin);
    }

    let output = child
        .wait_with_output()
        .await
        .map_err(|e| format!("avdmanager error: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!("Create AVD failed:\n{stdout}\n{stderr}"));
    }

    Ok(format!("Created AVD \"{}\"", params.name))
}

/// Delete an AVD by name
#[tauri::command]
pub async fn avd_delete(app: AppHandle, name: String) -> Result<String, String> {
    let avdmanager = find_avdmanager(&app)?;

    let mut std_cmd = std::process::Command::new(&avdmanager);
    std_cmd.args(["delete", "avd", "-n", &name]);
    #[cfg(target_os = "windows")]
    std_cmd.creation_flags(0x08000000);
    let output = tokio::process::Command::from(std_cmd)
        .output()
        .await
        .map_err(|e| format!("failed to run avdmanager: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Delete AVD failed: {stderr}"));
    }

    Ok(format!("Deleted AVD \"{name}\""))
}

/// Start an AVD in the emulator. Resolves once the emulator window is up
/// (snapshot loaded or boot completed), or errors if it exits early.
///
/// Note: the `emulator` CLI `exec`s into qemu in-place, so the spawned handle
/// stays valid for the emulator's lifetime. We read stdout until a readiness
/// marker appears, then detach and leave it running.
#[tauri::command]
pub async fn avd_start(app: AppHandle, name: String) -> Result<String, String> {
    use tokio::io::{AsyncBufReadExt, BufReader};

    let emulator = find_emulator(&app)?;

    let mut std_cmd = std::process::Command::new(&emulator);
    std_cmd
        .args(["-avd", &name])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    #[cfg(target_os = "windows")]
    std_cmd.creation_flags(0x08000000);

    let mut child = tokio::process::Command::from(std_cmd)
        .spawn()
        .map_err(|e| format!("failed to start emulator: {e}"))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    // Merge stdout + stderr lines into one stream
    let (tx, mut rx) = tokio::sync::mpsc::channel::<String>(64);
    if let Some(out) = stdout {
        let tx = tx.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(out).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if tx.send(line).await.is_err() {
                    break;
                }
            }
        });
    }
    if let Some(err) = stderr {
        let tx = tx.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(err).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if tx.send(line).await.is_err() {
                    break;
                }
            }
        });
    }
    drop(tx); // so rx closes once both readers finish (i.e. process exited)

    // Readiness markers: snapshot boot or cold boot completion.
    let is_ready = |line: &str| {
        line.contains("Successfully loaded snapshot")
            || line.contains("Boot completed")
            || line.contains("boot completed")
    };

    // Wait for readiness, early exit, or timeout (emulator can take a while).
    let timeout = tokio::time::sleep(std::time::Duration::from_secs(90));
    tokio::pin!(timeout);

    loop {
        tokio::select! {
            maybe_line = rx.recv() => {
                match maybe_line {
                    Some(line) => {
                        if is_ready(&line) {
                            // Emulator window is up; detach and leave running.
                            tokio::spawn(async move {
                                let _ = child.wait().await;
                            });
                            return Ok(format!("Started emulator for AVD \"{name}\""));
                        }
                    }
                    None => {
                        // Streams closed = process exited before becoming ready.
                        let status = child.wait().await.ok();
                        let code = status.and_then(|s| s.code()).unwrap_or(-1);
                        return Err(format!(
                            "emulator for AVD \"{name}\" exited before starting (code {code})"
                        ));
                    }
                }
            }
            _ = &mut timeout => {
                // Took too long to report readiness; assume it's still coming up
                // and leave it running rather than killing a working emulator.
                tokio::spawn(async move {
                    let _ = child.wait().await;
                });
                return Ok(format!("Started emulator for AVD \"{name}\""));
            }
        }
    }
}

/// Read all config.ini key-value pairs for an AVD
#[tauri::command]
pub async fn avd_read_config(name: String) -> Result<HashMap<String, String>, String> {
    let avd_dir = avd_home_dir();
    let config_path = avd_dir.join(format!("{name}.avd/config.ini"));
    if !config_path.exists() {
        return Err(format!("config.ini not found for AVD \"{name}\""));
    }
    let p = config_path
        .to_str()
        .ok_or_else(|| "invalid path".to_string())?;
    let map = ini!(safe p).map_err(|e| format!("failed to parse config.ini: {e}"))?;
    // Flatten: section-less keys are in "default"
    let mut result = HashMap::new();
    for (_section, entries) in map {
        for (key, value) in entries {
            if let Some(v) = value {
                result.insert(key, v);
            }
        }
    }
    Ok(result)
}

/// Write specific key-value pairs to an AVD's config.ini (preserves other keys)
#[tauri::command]
pub async fn avd_write_config(
    name: String,
    entries: HashMap<String, String>,
) -> Result<(), String> {
    let avd_dir = avd_home_dir();
    let config_path = avd_dir.join(format!("{name}.avd/config.ini"));
    if !config_path.exists() {
        return Err(format!("config.ini not found for AVD \"{name}\""));
    }

    let content =
        std::fs::read_to_string(&config_path).map_err(|e| format!("read error: {e}"))?;

    // Update existing keys in-place, append new ones
    let mut lines: Vec<String> = Vec::new();
    let mut written_keys: std::collections::HashSet<String> = std::collections::HashSet::new();

    for line in content.lines() {
        if let Some((key, _)) = line.split_once('=') {
            let key_trimmed = key.trim().to_string();
            if let Some(new_val) = entries.get(&key_trimmed) {
                lines.push(format!("{key_trimmed}={new_val}"));
                written_keys.insert(key_trimmed);
                continue;
            }
        }
        lines.push(line.to_string());
    }

    // Append any new keys not already in the file
    for (key, val) in &entries {
        if !written_keys.contains(key) {
            lines.push(format!("{key}={val}"));
        }
    }

    let output = lines.join("\n") + "\n";
    std::fs::write(&config_path, output).map_err(|e| format!("write error: {e}"))?;
    Ok(())
}

/// Get the path to the config.ini file for an AVD
#[tauri::command]
pub async fn avd_config_path(name: String) -> Result<String, String> {
    let avd_dir = avd_home_dir();
    let config_path = avd_dir.join(format!("{name}.avd/config.ini"));
    if !config_path.exists() {
        return Err(format!("config.ini not found for AVD \"{name}\""));
    }
    config_path
        .to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "invalid path".to_string())
}
