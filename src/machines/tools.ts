import { assign, fromPromise, setup } from "xstate";
import { which, sdkGetAndroidHome, sdkListCmdlineToolsVersions, detectJavaPaths } from "../invoke";
import { loadConfig, saveConfigField, type AppConfig } from "../store";

export interface ToolStatus {
  name: string;
  description: string;
  path: string | null;
  status: "pending" | "found" | "not_found";
}

export interface ToolGroup {
  label: string;
  tools: ToolStatus[];
  /** For groups with version selection (e.g. cmdline-tools) */
  versions?: string[];
  selectedVersion?: string;
}

const SDK_TOOLS = [
  { name: "sdkmanager", description: "SDK Manager CLI" },
  { name: "avdmanager", description: "AVD Manager CLI" },
];

const PLATFORM_TOOLS = [
  { name: "adb", description: "Android Debug Bridge" },
  { name: "fastboot", description: "Fastboot flashing utility" },
];

const EMULATOR_TOOLS = [
  { name: "emulator", description: "Android Emulator" },
];

const JAVA_TOOLS = [
  { name: "java", description: "Java runtime" },
];

const ALL_TOOLS = [...SDK_TOOLS, ...PLATFORM_TOOLS, ...EMULATOR_TOOLS, ...JAVA_TOOLS];

interface ToolsContext {
  config: AppConfig;
  /** The actual resolved ANDROID_HOME (from system or override) */
  resolvedHome: string;
  /** All java installations found on PATH */
  javaPaths: string[];
  groups: ToolGroup[];
  error: string;
}

type ToolsEvent =
  | { type: "DETECT" }
  | { type: "SET_CONFIG"; key: keyof AppConfig; value: string }
  | { type: "DISMISS_ERROR" };

async function detectAll() {
  const config = await loadConfig();
  const home = await sdkGetAndroidHome().catch(() => null);
  const resolvedHome = home?.path ?? "";

  const results = await Promise.allSettled(ALL_TOOLS.map((t) => which(t.name)));
  const tools = ALL_TOOLS.map((t, i) => {
    const r = results[i];
    if (r.status === "fulfilled") {
      return { ...t, path: r.value, status: "found" as const };
    }
    return { ...t, path: null, status: "not_found" as const };
  });

  // Get installed cmdline-tools versions from SDK
  const ctVersions = await sdkListCmdlineToolsVersions().catch(() => []);
  const versions = ctVersions.map((v) => v.version);

  // Detect all java installations
  const javaPaths = await detectJavaPaths().catch(() => []);

  return { tools, versions, config, resolvedHome, javaPaths };
}

function buildGroups(tools: ToolStatus[], versions: string[], config: AppConfig, javaPaths: string[]): ToolGroup[] {
  const findTools = (names: string[]) =>
    names.map((n) => tools.find((t) => t.name === n)!).filter(Boolean);

  return [
    {
      label: "Command-line Tools",
      tools: findTools(SDK_TOOLS.map((t) => t.name)),
      versions,
      selectedVersion: config.cmdlineToolsVersion || versions[0] || "",
    },
    {
      label: "Platform Tools",
      tools: findTools(PLATFORM_TOOLS.map((t) => t.name)),
    },
    {
      label: "Emulator",
      tools: findTools(EMULATOR_TOOLS.map((t) => t.name)),
    },
    {
      label: "Java",
      tools: findTools(JAVA_TOOLS.map((t) => t.name)),
      versions: javaPaths,
      selectedVersion: config.javaHome || javaPaths[0] || "",
    },
  ];
}

const detect = fromPromise(async () => {
  return await detectAll();
});

const persistConfig = fromPromise(async ({ input }: { input: { key: keyof AppConfig; value: string } }) => {
  await saveConfigField(input.key, input.value);
  return input;
});

export const toolsMachine = setup({
  types: {
    context: {} as ToolsContext,
    events: {} as ToolsEvent,
  },
  actors: { detect, persistConfig },
}).createMachine({
  id: "tools",
  initial: "detecting",
  context: {
    config: { androidHome: "", androidSdkRoot: "", cmdlineToolsVersion: "", javaHome: "" },
    resolvedHome: "",
    javaPaths: [],
    groups: [],
    error: "",
  },
  on: {
    DISMISS_ERROR: { actions: assign({ error: "" }) },
  },
  states: {
    detecting: {
      invoke: {
        src: "detect",
        onDone: {
          target: "idle",
          actions: assign(({ event }) => {
            const { tools, versions, config, resolvedHome, javaPaths } = event.output;
            return {
              config,
              resolvedHome,
              javaPaths,
              groups: buildGroups(tools, versions, config, javaPaths),
            };
          }),
        },
        onError: {
          target: "idle",
          actions: assign({ error: "Failed to detect tools" }),
        },
      },
    },
    idle: {
      on: {
        DETECT: "detecting",
        SET_CONFIG: "savingConfig",
      },
    },
    savingConfig: {
      invoke: {
        src: "persistConfig",
        input: ({ event }) => ({
          key: (event as { type: "SET_CONFIG"; key: keyof AppConfig; value: string }).key,
          value: (event as { type: "SET_CONFIG"; key: keyof AppConfig; value: string }).value,
        }),
        onDone: {
          target: "detecting",
          actions: assign(({ context, event }) => ({
            config: { ...context.config, [event.output.key]: event.output.value },
          })),
        },
        onError: {
          target: "idle",
          actions: assign({ error: "Failed to save setting" }),
        },
      },
    },
  },
});
