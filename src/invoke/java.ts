import { invoke } from "@tauri-apps/api/core";

/**
 * Detect Java installations on the system.
 * Returns absolute paths to `java` executables.
 */
export function detectJavaPaths(): Promise<string[]> {
  return invoke("detect_java_paths");
}
