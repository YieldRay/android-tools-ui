import { assign, fromPromise, setup } from "xstate";
import {
  sdkGetAndroidHome,
  sdkListInstalled,
  sdkListAvailable,
  sdkInstall,
  sdkUninstall,
  type SdkHome,
  type InstalledPackage,
  type AvailablePackage,
} from "../invoke";

export type PackageStatus = "installed" | "available" | "installing" | "uninstalling";

export interface PkgEntry {
  path: string;
  url?: string;
  location?: string;
  status: PackageStatus;
}

interface SdkContext {
  home: SdkHome | null;
  homeError: string;
  packages: PkgEntry[];
  error: string;
}

type SdkEvent =
  | { type: "REFRESH" }
  | { type: "INSTALL"; pkg: string }
  | { type: "CANCEL_INSTALL"; pkg: string }
  | { type: "UNINSTALL"; pkg: string }
  | { type: "DISMISS_ERROR" };

function mergePackages(installed: InstalledPackage[], available: AvailablePackage[]): PkgEntry[] {
  const merged = new Map<string, PkgEntry>();
  for (const p of installed) {
    merged.set(p.path, { path: p.path, location: p.location, status: "installed" });
  }
  for (const p of available) {
    if (!merged.has(p.path)) {
      merged.set(p.path, { path: p.path, url: p.url, status: "available" });
    } else {
      merged.get(p.path)!.url = p.url;
    }
  }
  return Array.from(merged.values()).sort((a, b) => b.path.localeCompare(a.path, undefined, { numeric: true }));
}

const fetchData = fromPromise(async () => {
  const [home, installed, available] = await Promise.all([
    sdkGetAndroidHome().catch(() => null),
    sdkListInstalled().catch(() => [] as InstalledPackage[]),
    sdkListAvailable().catch(() => [] as AvailablePackage[]),
  ]);
  return { home, installed, available };
});

const installPkg = fromPromise(async ({ input }: { input: { pkg: string } }) => {
  return await sdkInstall(input.pkg);
});

const uninstallPkg = fromPromise(async ({ input }: { input: { pkg: string } }) => {
  return await sdkUninstall(input.pkg);
});

export const sdkMachine = setup({
  types: {
    context: {} as SdkContext,
    events: {} as SdkEvent,
  },
  actors: {
    fetchData,
    installPkg,
    uninstallPkg,
  },
}).createMachine({
  id: "sdk",
  initial: "loading",
  context: {
    home: null,
    homeError: "",
    packages: [],
    error: "",
  },
  on: {
    DISMISS_ERROR: {
      actions: assign({ error: "" }),
    },
  },
  states: {
    loading: {
      invoke: {
        src: "fetchData",
        onDone: {
          target: "idle",
          actions: assign(({ event }) => {
            const { home, installed, available } = event.output;
            return {
              home,
              homeError: home ? "" : "ANDROID_HOME not set",
              packages: mergePackages(installed, available),
            };
          }),
        },
        onError: {
          target: "idle",
          actions: assign({ homeError: "Failed to load SDK data" }),
        },
      },
    },
    idle: {
      on: {
        REFRESH: "loading",
        INSTALL: {
          actions: assign(({ context, event }) => ({
            packages: context.packages.map((p) =>
              p.path === event.pkg ? { ...p, status: "installing" as const } : p
            ),
          })),
          target: "installing",
        },
        UNINSTALL: {
          actions: assign(({ context, event }) => ({
            packages: context.packages.map((p) =>
              p.path === event.pkg ? { ...p, status: "uninstalling" as const } : p
            ),
          })),
          target: "uninstalling",
        },
      },
    },
    installing: {
      invoke: {
        src: "installPkg",
        input: ({ event }) => ({ pkg: (event as { type: "INSTALL"; pkg: string }).pkg }),
        onDone: {
          target: "idle",
          actions: assign(({ context }) => ({
            packages: context.packages.map((p) =>
              p.status === "installing" ? { ...p, status: "installed" as const } : p
            ),
          })),
        },
        onError: {
          target: "idle",
          actions: assign(({ context, event }) => ({
            error: `Install failed: ${event.error}`,
            packages: context.packages.map((p) =>
              p.status === "installing" ? { ...p, status: "available" as const } : p
            ),
          })),
        },
      },
      on: {
        CANCEL_INSTALL: {
          target: "idle",
          actions: assign(({ context, event }) => ({
            packages: context.packages.map((p) =>
              p.path === event.pkg ? { ...p, status: "available" as const } : p
            ),
          })),
        },
      },
    },
    uninstalling: {
      invoke: {
        src: "uninstallPkg",
        input: ({ event }) => ({ pkg: (event as { type: "UNINSTALL"; pkg: string }).pkg }),
        onDone: {
          target: "idle",
          actions: assign(({ context }) => ({
            packages: context.packages.map((p) =>
              p.status === "uninstalling" ? { ...p, status: "available" as const } : p
            ),
          })),
        },
        onError: {
          target: "idle",
          actions: assign(({ context, event }) => ({
            error: `Uninstall failed: ${event.error}`,
            packages: context.packages.map((p) =>
              p.status === "uninstalling" ? { ...p, status: "installed" as const } : p
            ),
          })),
        },
      },
    },
  },
});
