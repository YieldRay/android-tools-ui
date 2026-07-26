use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tauri_plugin_http::reqwest;
use tokio::io::AsyncWriteExt;

use std::cmp::Ordering;

/// Natural sort: splits strings into text/numeric segments and compares numbers numerically.
fn nat_cmp(a: &str, b: &str) -> Ordering {
    let mut ai = a.chars().peekable();
    let mut bi = b.chars().peekable();
    loop {
        match (ai.peek(), bi.peek()) {
            (None, None) => return Ordering::Equal,
            (None, Some(_)) => return Ordering::Less,
            (Some(_), None) => return Ordering::Greater,
            (Some(ac), Some(bc)) => {
                if ac.is_ascii_digit() && bc.is_ascii_digit() {
                    let mut an = 0u64;
                    while let Some(c) = ai.peek() {
                        if c.is_ascii_digit() {
                            an = an * 10 + (*c as u64 - '0' as u64);
                            ai.next();
                        } else {
                            break;
                        }
                    }
                    let mut bn = 0u64;
                    while let Some(c) = bi.peek() {
                        if c.is_ascii_digit() {
                            bn = bn * 10 + (*c as u64 - '0' as u64);
                            bi.next();
                        } else {
                            break;
                        }
                    }
                    match an.cmp(&bn) {
                        Ordering::Equal => continue,
                        other => return other,
                    }
                } else {
                    let ac = ai.next().unwrap();
                    let bc = bi.next().unwrap();
                    match ac.cmp(&bc) {
                        Ordering::Equal => continue,
                        other => return other,
                    }
                }
            }
        }
    }
}

const CHECKSUMS_URLS: &[&str] = &[
    "https://f-droid.github.io/android-sdk-transparency-log/signed/checksums.json",
    "https://raw.githubusercontent.com/f-droid/android-sdk-transparency-log/master/signed/checksums.json",
];



#[derive(Serialize)]
pub struct SdkHome {
    pub path: String,
    pub exists: bool,
}

#[tauri::command]
pub async fn sdk_get_android_home(app: AppHandle) -> Result<SdkHome, String> {
    let path = super::config::resolve_android_home(&app)?;
    let exists = path.exists();
    Ok(SdkHome {
        path: path.to_string_lossy().into_owned(),
        exists,
    })
}

#[derive(Serialize, Clone)]
pub struct InstalledPackage {
    pub path: String,
    pub location: String,
}

#[tauri::command]
pub async fn sdk_list_installed(app: AppHandle) -> Result<Vec<InstalledPackage>, String> {
    let android_home = super::config::resolve_android_home(&app)?;
    if !android_home.exists() {
        return Ok(vec![]);
    }

    let mut installed = Vec::new();
    for entry in walkdir::WalkDir::new(&android_home)
        .max_depth(10)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if entry.file_name() == "package.xml" {
            let rel = entry
                .path()
                .parent()
                .unwrap_or(entry.path())
                .strip_prefix(&android_home)
                .unwrap_or(Path::new(""))
                .to_string_lossy()
                .replace('/', ";")
                .replace('\\', ";");
            installed.push(InstalledPackage {
                path: rel.clone(),
                location: rel.replace(';', "/"),
            });
        }
    }
    installed.sort_by(|a, b| nat_cmp(&b.path, &a.path));
    Ok(installed)
}

#[derive(Serialize, Clone)]
pub struct AvailablePackage {
    pub path: String,
    pub url: String,
}

async fn fetch_checksums(
    client: &reqwest::Client,
) -> Result<HashMap<String, serde_json::Value>, String> {
    for url in CHECKSUMS_URLS {
        if let Ok(resp) = client.get(*url).send().await {
            if resp.status().is_success() {
                if let Ok(text) = resp.text().await {
                    if let Ok(json) = serde_json::from_str(&text) {
                        return Ok(json);
                    }
                }
            }
        }
    }
    Err("failed to fetch checksums.json from any source".into())
}

#[tauri::command]
pub async fn sdk_list_available() -> Result<Vec<AvailablePackage>, String> {
    let client = reqwest::Client::builder()
        .user_agent("F-Droid")
        .build()
        .map_err(|e| format!("http client error: {e}"))?;

    let checksums = fetch_checksums(&client).await?;
    let packages = parse_checksums(&checksums);

    let mut result: Vec<AvailablePackage> = packages
        .into_iter()
        .map(|(path, url)| AvailablePackage { path, url })
        .collect();
    result.sort_by(|a, b| nat_cmp(&b.path, &a.path));
    Ok(result)
}

fn parse_source_properties(content: &str) -> HashMap<String, String> {
    let mut map = HashMap::new();
    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if let Some((key, value)) = line.split_once('=') {
            map.insert(key.trim().to_lowercase(), value.trim().to_string());
        }
    }
    map
}

fn current_os_tag() -> &'static str {
    if cfg!(target_os = "macos") {
        "macosx"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else {
        "linux"
    }
}

/// Check if a URL is for the current OS (or OS-agnostic)
fn is_url_for_current_os(url: &str) -> bool {
    let basename = url.rsplit('/').next().unwrap_or("");
    // cmdline-tools are Java-based and work cross-platform despite OS in filename
    if basename.starts_with("commandlinetools") || basename.starts_with("cmdline-tools") {
        return true;
    }
    let os_tag = current_os_tag();
    let all_os_tags = ["linux", "macosx", "mac", "windows", "win"];
    // If the filename contains any OS tag, it must match ours
    if all_os_tags.iter().any(|tag| basename.contains(tag)) {
        if os_tag == "macosx" {
            basename.contains("macosx") || basename.contains("mac")
        } else {
            basename.contains(os_tag)
        }
    } else {
        true // OS-agnostic package
    }
}

fn parse_checksums(checksums: &HashMap<String, serde_json::Value>) -> HashMap<String, String> {
    let mut packages: HashMap<String, String> = HashMap::new();

    for (url, entries) in checksums {
        if !url.ends_with(".zip") {
            continue;
        }
        if !is_url_for_current_os(url) {
            continue;
        }
        let basename = url.rsplit('/').next().unwrap_or("");
        let entries_arr = match entries.as_array() {
            Some(a) => a,
            None => continue,
        };

        for entry in entries_arr {
            let obj = match entry.as_object() {
                Some(o) => o,
                None => continue,
            };
            let source_props = match obj.get("source.properties").and_then(|v| v.as_str()) {
                Some(s) => parse_source_properties(s),
                None => continue,
            };

            let pkg_path = source_props.get("pkg.path");
            let pkg_revision = source_props.get("pkg.revision");

            if basename.starts_with("build-tools") {
                if let Some(rev) = pkg_revision {
                    let key = format!("build-tools;{}", rev.replace(' ', "-"));
                    packages.entry(key).or_insert_with(|| url.clone());
                }
            } else if basename.starts_with("platform-tools") {
                if let Some(rev) = pkg_revision {
                    packages
                        .entry(format!("platform-tools;{rev}"))
                        .or_insert_with(|| url.clone());
                    packages
                        .entry("platform-tools".into())
                        .or_insert_with(|| url.clone());
                }
            } else if basename.starts_with("cmdline-tools")
                || basename.starts_with("commandlinetools")
            {
                if let Some(path) = pkg_path {
                    packages.entry(path.clone()).or_insert_with(|| url.clone());
                }
            } else if basename.starts_with("emulator") {
                if let Some(path) = pkg_path {
                    packages.entry(path.clone()).or_insert_with(|| url.clone());
                }
            } else if url.contains("ndk") {
                if let Some(rev) = source_props.get("pkg.baserevision").or(pkg_revision) {
                    let key = format!("ndk;{rev}");
                    packages.entry(key).or_insert_with(|| url.clone());
                }
            } else if basename.starts_with("android-") || basename.starts_with("platform-") {
                if let Some(api) = source_props.get("androidversion.apilevel") {
                    let key = format!("platforms;android-{api}");
                    packages.insert(key, url.clone());
                }
            } else if basename.starts_with("cmake") {
                if let Some(path) = pkg_path {
                    packages.entry(path.clone()).or_insert_with(|| url.clone());
                }
            } else if basename.starts_with("tools") || basename.starts_with("sdk-tools-") {
                if let Some(rev) = pkg_revision {
                    packages
                        .entry(format!("tools;{rev}"))
                        .or_insert_with(|| url.clone());
                }
            } else if url.contains("sys-img") {
                if let Some(api) = source_props.get("androidversion.apilevel") {
                    let abi = source_props
                        .get("systemimage.abi")
                        .map(|s| s.as_str())
                        .unwrap_or("x86_64");
                    let tag = source_props
                        .get("systemimage.tagid")
                        .map(|s| s.as_str())
                        .unwrap_or("default");
                    let key = format!("system-images;android-{api};{tag};{abi}");
                    packages.insert(key, url.clone());
                }
            }
        }
    }
    packages
}

#[derive(Serialize, Clone)]
struct SdkDownloadProgress {
    package: String,
    downloaded: u64,
    total: u64,
}

#[tauri::command]
pub async fn sdk_install(app: AppHandle, package: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .user_agent("F-Droid")
        .build()
        .map_err(|e| format!("http client error: {e}"))?;

    let checksums = fetch_checksums(&client).await?;
    let packages = parse_checksums(&checksums);

    let url = packages
        .get(&package)
        .ok_or(format!(
            "package `{package}` not found in available packages"
        ))?
        .clone();

    let android_home = super::config::resolve_android_home(&app)?;
    let install_dir = android_home.join(package_to_install_dir(&package));

    if install_dir.exists() {
        return Ok(format!(
            "package `{package}` already installed at {}",
            install_dir.display()
        ));
    }

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("download error: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("download failed: HTTP {}", resp.status()));
    }

    let total = resp.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;
    let mut bytes_buf = Vec::with_capacity(if total > 0 {
        total as usize
    } else {
        1024 * 1024
    });

    // Stream download with progress events
    let mut stream = resp;
    while let Some(chunk) = stream
        .chunk()
        .await
        .map_err(|e| format!("download read error: {e}"))?
    {
        downloaded += chunk.len() as u64;
        bytes_buf.extend_from_slice(&chunk);
        let _ = app.emit(
            "sdk:download-progress",
            SdkDownloadProgress {
                package: package.clone(),
                downloaded,
                total,
            },
        );
    }

    let tmp = tempfile::NamedTempFile::new().map_err(|e| format!("temp file error: {e}"))?;
    let tmp_path = tmp.path().to_path_buf();
    {
        let mut file = tokio::fs::File::create(&tmp_path)
            .await
            .map_err(|e| format!("write error: {e}"))?;
        file.write_all(&bytes_buf)
            .await
            .map_err(|e| format!("write error: {e}"))?;
    }

    let install_dir_clone = install_dir.clone();
    tokio::task::spawn_blocking(move || extract_zip(&tmp_path, &install_dir_clone))
        .await
        .map_err(|e| format!("join error: {e}"))??;

    Ok(format!(
        "installed `{package}` to {}",
        install_dir.display()
    ))
}

#[tauri::command]
pub async fn sdk_uninstall(app: AppHandle, package: String) -> Result<String, String> {
    let android_home = super::config::resolve_android_home(&app)?;
    let install_dir = android_home.join(package_to_install_dir(&package));

    if !install_dir.exists() {
        return Err(format!("package `{package}` is not installed"));
    }

    std::fs::remove_dir_all(&install_dir)
        .map_err(|e| format!("failed to remove {}: {e}", install_dir.display()))?;

    Ok(format!("uninstalled `{package}`"))
}

fn package_to_install_dir(package: &str) -> PathBuf {
    let parts: Vec<&str> = package.split(';').collect();
    match parts.first().copied() {
        Some("build-tools") if parts.len() > 1 => PathBuf::from("build-tools").join(parts[1]),
        Some("cmake") if parts.len() > 1 => PathBuf::from("cmake").join(parts[1]),
        Some("cmdline-tools") if parts.len() > 1 => PathBuf::from("cmdline-tools").join(parts[1]),
        Some("ndk") if parts.len() > 1 => PathBuf::from("ndk").join(parts[1]),
        Some("platforms") if parts.len() > 1 => PathBuf::from("platforms").join(parts[1]),
        Some("platform-tools") => PathBuf::from("platform-tools"),
        Some("emulator") => PathBuf::from("emulator"),
        Some("tools") => PathBuf::from("tools"),
        Some("system-images") if parts.len() >= 4 => PathBuf::from("system-images")
            .join(parts[1])
            .join(parts[2])
            .join(parts[3]),
        _ => PathBuf::from(package.replace(';', "/")),
    }
}

fn extract_zip(zip_path: &Path, install_dir: &Path) -> Result<(), String> {
    let file = std::fs::File::open(zip_path).map_err(|e| format!("open zip: {e}"))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("read zip: {e}"))?;

    let mut toplevels: std::collections::HashSet<String> = std::collections::HashSet::new();
    for i in 0..archive.len() {
        let entry = archive.by_index(i).map_err(|e| format!("zip entry: {e}"))?;
        if let Some(top) = entry.name().split('/').next() {
            if !top.is_empty() {
                toplevels.insert(top.to_string());
            }
        }
    }

    let temp_extract = tempfile::tempdir().map_err(|e| format!("tempdir: {e}"))?;
    let temp_path = temp_extract.path();

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| format!("zip entry: {e}"))?;
        let name = entry.name().to_string();
        let out_path = temp_path.join(&name);

        if entry.is_dir() {
            std::fs::create_dir_all(&out_path).map_err(|e| format!("mkdir: {e}"))?;
        } else {
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent).map_err(|e| format!("mkdir: {e}"))?;
            }
            let mut outfile =
                std::fs::File::create(&out_path).map_err(|e| format!("create: {e}"))?;
            std::io::copy(&mut entry, &mut outfile).map_err(|e| format!("copy: {e}"))?;

            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                if let Some(mode) = entry.unix_mode() {
                    std::fs::set_permissions(&out_path, std::fs::Permissions::from_mode(mode)).ok();
                }
            }
        }
    }

    if let Some(parent) = install_dir.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("mkdir parent: {e}"))?;
    }

    if toplevels.len() == 1 {
        let top = toplevels.into_iter().next().unwrap();
        let extracted = temp_path.join(&top);
        std::fs::rename(&extracted, install_dir)
            .or_else(|_| copy_dir_all(&extracted, install_dir))
            .map_err(|e| format!("move to install dir: {e}"))?;
    } else {
        std::fs::create_dir_all(install_dir).map_err(|e| format!("mkdir: {e}"))?;
        for entry in std::fs::read_dir(temp_path).map_err(|e| format!("readdir: {e}"))? {
            let entry = entry.map_err(|e| format!("readdir: {e}"))?;
            let dest = install_dir.join(entry.file_name());
            std::fs::rename(entry.path(), &dest)
                .or_else(|_| copy_dir_all(&entry.path(), &dest))
                .map_err(|e| format!("move: {e}"))?;
        }
    }

    Ok(())
}

fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let dest = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_all(&entry.path(), &dest)?;
        } else {
            std::fs::copy(entry.path(), &dest)?;
        }
    }
    Ok(())
}

#[derive(Serialize, Clone)]
pub struct CmdlineToolsVersion {
    pub version: String,
    pub path: String,
}

/// List installed cmdline-tools versions
#[tauri::command]
pub async fn sdk_list_cmdline_tools_versions(app: AppHandle) -> Result<Vec<CmdlineToolsVersion>, String> {
    let home = super::config::resolve_android_home(&app)?;
    let ct_dir = home.join("cmdline-tools");
    if !ct_dir.is_dir() {
        return Ok(vec![]);
    }
    let mut versions = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&ct_dir) {
        for entry in entries.flatten() {
            if entry.path().is_dir() {
                let name = entry.file_name().to_string_lossy().to_string();
                let bin = entry.path().join("bin");
                if bin.is_dir() {
                    versions.push(CmdlineToolsVersion {
                        version: name,
                        path: entry.path().to_string_lossy().into_owned(),
                    });
                }
            }
        }
    }
    versions.sort_by(|a, b| b.version.cmp(&a.version));
    Ok(versions)
}
