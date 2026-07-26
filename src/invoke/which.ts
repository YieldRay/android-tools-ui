import { invoke } from "@tauri-apps/api/core";

/**
 * Resolve a command name to its full path (cross-platform).
 * Uses `which` on Unix, `where` on Windows.
 * Rejects if the command is not found.
 */
export function which(command: string): Promise<string> {
  return invoke("which", { command });
}
