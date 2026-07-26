import { LazyStore } from "@tauri-apps/plugin-store";

const store = new LazyStore("settings.json");

export interface AppConfig {
  /** Override for ANDROID_HOME (empty = use system env) */
  androidHome: string;
  /** Override for ANDROID_SDK_ROOT (empty = use system env) */
  androidSdkRoot: string;
  /** Selected cmdline-tools version (directory name, e.g. "20.0") */
  cmdlineToolsVersion: string;
  /** Selected java path (empty = first found on PATH) */
  javaHome: string;
}

const DEFAULTS: AppConfig = {
  androidHome: "",
  androidSdkRoot: "",
  cmdlineToolsVersion: "",
  javaHome: "",
};

export async function loadConfig(): Promise<AppConfig> {
  const config = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS) as (keyof AppConfig)[]) {
    const val = await store.get<string>(key);
    if (val !== undefined) {
      config[key] = val;
    }
  }
  return config;
}

export async function saveConfigField<K extends keyof AppConfig>(
  key: K,
  value: AppConfig[K]
): Promise<void> {
  await store.set(key, value);
  await store.save();
}
