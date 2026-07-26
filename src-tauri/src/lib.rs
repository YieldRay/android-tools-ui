mod invoke;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {}))
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            invoke::detect_java_paths,
            invoke::which,
            invoke::sdk_get_android_home,
            invoke::sdk_list_installed,
            invoke::sdk_list_available,
            invoke::sdk_install,
            invoke::sdk_uninstall,
            invoke::sdk_list_cmdline_tools_versions,
            invoke::avd_check_tools,
            invoke::avd_list,
            invoke::avd_list_targets,
            invoke::avd_create,
            invoke::avd_delete,
            invoke::avd_start,
            invoke::avd_read_config,
            invoke::avd_write_config,
            invoke::avd_config_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
