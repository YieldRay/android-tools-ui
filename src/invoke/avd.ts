import { invoke } from "@tauri-apps/api/core";

export interface AvdToolsStatus {
  avdmanager: boolean;
  emulator: boolean;
  message: string | null;
}

export interface AvdInfo {
  name: string;
  device: string;
  path: string;
  target: string;
  abi: string;
}

export interface AvdTarget {
  id: string;
  label: string;
}

export interface AvdCreateParams {
  name: string;
  package: string;
  device?: string;
}

export function avdCheckTools(): Promise<AvdToolsStatus> {
  return invoke("avd_check_tools");
}

export function avdList(): Promise<AvdInfo[]> {
  return invoke("avd_list");
}

export function avdListTargets(): Promise<AvdTarget[]> {
  return invoke("avd_list_targets");
}

export function avdCreate(params: AvdCreateParams): Promise<string> {
  return invoke("avd_create", { params });
}

export function avdDelete(name: string): Promise<string> {
  return invoke("avd_delete", { name });
}

export function avdStart(name: string): Promise<string> {
  return invoke("avd_start", { name });
}

export function avdReadConfig(name: string): Promise<Record<string, string>> {
  return invoke("avd_read_config", { name });
}

export function avdWriteConfig(
  name: string,
  entries: Record<string, string>
): Promise<void> {
  return invoke("avd_write_config", { name, entries });
}

export function avdConfigPath(name: string): Promise<string> {
  return invoke("avd_config_path", { name });
}
