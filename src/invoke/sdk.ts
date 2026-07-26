import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface SdkHome {
  path: string;
  exists: boolean;
}

export interface InstalledPackage {
  path: string;
  location: string;
}

export interface AvailablePackage {
  path: string;
  url: string;
}

export interface SdkDownloadProgress {
  package: string;
  downloaded: number;
  total: number;
}

export function sdkGetAndroidHome(): Promise<SdkHome> {
  return invoke("sdk_get_android_home");
}

export function sdkListInstalled(): Promise<InstalledPackage[]> {
  return invoke("sdk_list_installed");
}

export function sdkListAvailable(): Promise<AvailablePackage[]> {
  return invoke("sdk_list_available");
}

export function sdkInstall(pkg: string): Promise<string> {
  return invoke("sdk_install", { package: pkg });
}

export function sdkUninstall(pkg: string): Promise<string> {
  return invoke("sdk_uninstall", { package: pkg });
}

export function onSdkDownloadProgress(
  callback: (progress: SdkDownloadProgress) => void
): Promise<UnlistenFn> {
  return listen<SdkDownloadProgress>("sdk:download-progress", (event) => {
    callback(event.payload);
  });
}

export interface CmdlineToolsVersion {
  version: string;
  path: string;
}

export function sdkListCmdlineToolsVersions(): Promise<CmdlineToolsVersion[]> {
  return invoke("sdk_list_cmdline_tools_versions");
}
