use std::collections::BTreeSet;
use std::path::Path;
#[cfg(target_os = "windows")]
use std::path::PathBuf;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

/// Detect Java installations on the system.
///
/// Returns absolute paths to `java` executables (or JAVA_HOME roots on macOS
/// via `java_home -V`). Uses fixed, well-known commands and directories only —
/// no arbitrary command execution — so it is not an RCE surface.
#[tauri::command]
pub async fn detect_java_paths() -> Result<Vec<String>, String> {
    let mut found: BTreeSet<String> = BTreeSet::new();

    // JAVA_HOME env var
    if let Ok(java_home) = std::env::var("JAVA_HOME") {
        if !java_home.is_empty() {
            push_java_bin(&mut found, Path::new(&java_home));
        }
    }

    // `which`/`where java` on PATH
    if let Some(p) = which_java().await {
        found.insert(p);
    }

    // Platform-specific well-known locations
    #[cfg(target_os = "macos")]
    {
        // /usr/libexec/java_home -V lists all installed JVMs (paths on stderr)
        if let Ok(output) = tokio::process::Command::new("/usr/libexec/java_home")
            .arg("-V")
            .output()
            .await
        {
            let text = String::from_utf8_lossy(&output.stderr);
            for line in text.lines() {
                // Lines look like: "    17.0.1 (arm64) "Oracle" ... /Library/Java/.../Home"
                if let Some(idx) = line.find(" /") {
                    let path = line[idx + 1..].trim();
                    if !path.is_empty() {
                        push_java_bin(&mut found, Path::new(path));
                    }
                }
            }
        }
        scan_dir_for_java_homes(&mut found, Path::new("/Library/Java/JavaVirtualMachines"));
    }

    #[cfg(target_os = "linux")]
    {
        for base in ["/usr/lib/jvm", "/usr/java", "/opt/java"] {
            scan_dir_for_java_homes(&mut found, Path::new(base));
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Ok(program_files) = std::env::var("ProgramFiles") {
            for vendor in ["Java", "Eclipse Adoptium", "Amazon Corretto", "Microsoft"] {
                scan_dir_for_java_homes(
                    &mut found,
                    &PathBuf::from(&program_files).join(vendor),
                );
            }
        }
    }

    Ok(found.into_iter().collect())
}

/// Resolve `java` on PATH to its executable path.
async fn which_java() -> Option<String> {
    if cfg!(target_os = "windows") {
        let mut std_cmd = std::process::Command::new("cmd");
        std_cmd.args(["/C", "where java"]);
        #[cfg(target_os = "windows")]
        std_cmd.creation_flags(0x08000000);
        let output = tokio::process::Command::from(std_cmd)
            .output()
            .await
            .ok()?;
        if output.status.success() {
            let p = String::from_utf8_lossy(&output.stdout)
                .lines()
                .next()
                .unwrap_or_default()
                .trim()
                .to_string();
            if !p.is_empty() {
                return Some(p);
            }
        }
    } else {
        let output = tokio::process::Command::new("which")
            .arg("java")
            .output()
            .await
            .ok()?;
        if output.status.success() {
            let p = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !p.is_empty() {
                return Some(p);
            }
        }
    }
    None
}

/// Given a JAVA_HOME-style root, add its `bin/java` executable if it exists.
fn push_java_bin(found: &mut BTreeSet<String>, home: &Path) {
    let bin = if cfg!(target_os = "windows") {
        home.join("bin").join("java.exe")
    } else {
        home.join("bin").join("java")
    };
    if bin.exists() {
        found.insert(bin.to_string_lossy().into_owned());
        return;
    }
    // The path may itself already be a java executable.
    if home.is_file() {
        found.insert(home.to_string_lossy().into_owned());
    }
}

/// Scan a directory whose immediate children are JVM homes (or */Contents/Home on macOS).
fn scan_dir_for_java_homes(found: &mut BTreeSet<String>, dir: &Path) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        push_java_bin(found, &path);
        // macOS bundles: <jdk>/Contents/Home
        push_java_bin(found, &path.join("Contents").join("Home"));
    }
}
