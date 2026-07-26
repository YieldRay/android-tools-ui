# AGENTS.md

## Stack

- **Frontend**: React 19, TypeScript, Vite, TailwindCSS v4, TanStack Router (file-based), xstate v5
- **Backend**: Tauri v2 (Rust), tokio
- **UI library**: `soda-material` (Material Design 3). Use its components (`Button`, `IconButton`, `List`, `Search`, `Dialog`, `TooltipHolder`, `PlainTooltip`, `CircularProgressIndicator`, etc.) — never raw HTML elements.
- **Icons**: `@mdi/js` + `@mdi/react` for SVG paths; `IconButton` accepts `path` prop directly.
- **Package manager**: bun (used in tauri.conf.json `beforeDevCommand`/`beforeBuildCommand`)

## Commands

```sh
bun run dev          # Vite dev server only (port 1420)
bun tauri dev        # Full Tauri app with hot-reload
bun tauri build      # Production build
npx tsc --noEmit     # Typecheck frontend
cargo check          # Typecheck Rust (run from src-tauri/)
```

## Architecture

### Frontend (`src/`)

- `src/routes/` — TanStack Router file-based routes. Route tree auto-generated to `src/routeTree.gen.ts` by `@tanstack/router-plugin/vite`. For nested routes use `foo.tsx` (layout with `<Outlet />`) + `foo.index.tsx` (index page) + `foo.$param.tsx` (dynamic child).
- `src/invoke/` — Typed TS bindings for Tauri IPC commands. Each file mirrors a Rust module: `process.ts`, `which.ts`, `sdk.ts`, `avd.ts`.
- `src/machines/` — xstate v5 machines (`sdk.ts`, `tools.ts`, `avd.ts`) with `createActorContext`. Actors are provided at app root (`main.tsx`) so state persists across route switches.
- `src/components/` — Shared components: `Scrim.tsx` (custom overlay), `SelectDialog.tsx` (reusable picker dialog).
- `src/main.tsx` — App entry: wraps `RouterProvider` with xstate context providers.

### Backend (`src-tauri/src/`)

- `lib.rs` — Plugin init + `invoke_handler` registration.
- `invoke/mod.rs` — Re-exports all command modules via `pub use module::*;`.
- `invoke/process.rs` — Cross-platform process exec (`x`, `x_spawn`, `x_write`, `x_close_stdin`, `x_kill`). Manages spawned process handles with `ProcessManager` state.
- `invoke/which.rs` — Cross-platform command path resolution with SDK fallback paths.
- `invoke/sdk.rs` — Android SDK management: list available/installed packages, install (download+unzip), uninstall. Fetches F-Droid's `checksums.json` transparency log. Filters packages by current OS.
- `invoke/avd.rs` — AVD management: list (via ini file parsing), create, delete, start, read/write config.ini. Uses `ini` crate.

### Adding a new IPC command

1. Create `src-tauri/src/invoke/foo.rs` with `#[tauri::command] pub async fn foo_bar(...) -> Result<T, String>`.
2. Add `mod foo; pub use foo::*;` to `invoke/mod.rs`.
3. Add `invoke::foo_bar` to `generate_handler![]` in `lib.rs`.
4. Create `src/invoke/foo.ts` with typed `invoke("foo_bar", {...})` wrapper.
5. Export from `src/invoke/index.ts`.

## Conventions

- **Do NOT use `Scrim` from soda-material.** It delays unmount until exit animation ends, causing stale state bugs. Use `src/components/Scrim.tsx` instead (immediate unmount, enter animation only).
- Use `tauri_plugin_http::reqwest` for HTTP in Rust (not a separate `reqwest` dep). The `.json()` method is unavailable — use `.text()` + `serde_json::from_str`.
- Tauri capabilities are in `src-tauri/capabilities/default.json`. If a new opener/shell/etc permission is needed, add it there explicitly.
- Responsive layout: `NavigationRail` on wide screens, `NavigationBar` on compact. Detected via `useWindowSizeType()` from `soda-material/dist/hooks/use-media-query`.
- Destructive actions (uninstall/delete) must show a confirmation `Dialog` + custom `Scrim`.
- Long tasks (downloads) must be cancellable from the UI.
- `List` items don't need the `full` prop when parent is a flex container.
- Use `CircularProgressIndicator` for loading states, not icon spinners.
- For an `IconButton` with a label, use `src/components/IconButtonWithTooltip.tsx` (not raw `TooltipHolder`). It drops the tooltip when `disabled`, because soda-material's `TooltipHolder` wraps the trigger in a div whose hover listeners still fire on a disabled button.
- Use `SelectDialog` component for picker dialogs (version select, path select, etc).
- When a `List` item has trailing action buttons, wrap them in `src/components/StopPropagation.tsx`. The List ripple binds a NATIVE `addEventListener("pointerdown")` on the List element, so React's synthetic `onPointerDown` + `stopPropagation` (dispatched from the root) runs too late to stop it — a native listener is required. `StopPropagation` also stops `click` to prevent row navigation.
- INI file parsing in Rust: use the `ini` crate. AVD ini files have no section headers; keys land under the `"default"` section.
- App config stored via `@tauri-apps/plugin-store` (`LazyStore("settings.json")`) in `src/store.ts`.
