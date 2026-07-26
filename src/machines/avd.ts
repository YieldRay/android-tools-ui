import { assign, fromPromise, setup } from "xstate";
import {
  avdCheckTools,
  avdList,
  avdListTargets,
  avdCreate,
  avdDelete,
  avdStart,
  type AvdToolsStatus,
  type AvdInfo,
  type AvdTarget,
  type AvdCreateParams,
} from "../invoke";

interface AvdContext {
  toolsStatus: AvdToolsStatus | null;
  avds: AvdInfo[];
  targets: AvdTarget[];
  error: string;
}

type AvdEvent =
  | { type: "REFRESH" }
  | { type: "CREATE"; params: AvdCreateParams }
  | { type: "DELETE"; name: string }
  | { type: "START"; name: string }
  | { type: "DISMISS_ERROR" };

const checkAndLoad = fromPromise(async () => {
  const tools = await avdCheckTools();
  if (!tools.avdmanager) {
    return { tools, avds: [] as AvdInfo[], targets: [] as AvdTarget[] };
  }
  const [avds, targets] = await Promise.all([
    avdList().catch(() => [] as AvdInfo[]),
    avdListTargets().catch(() => [] as AvdTarget[]),
  ]);
  return { tools, avds, targets };
});

const createAvd = fromPromise(async ({ input }: { input: AvdCreateParams }) => {
  return await avdCreate(input);
});

const deleteAvd = fromPromise(async ({ input }: { input: { name: string } }) => {
  return await avdDelete(input.name);
});

const startAvd = fromPromise(async ({ input }: { input: { name: string } }) => {
  return await avdStart(input.name);
});

export const avdMachine = setup({
  types: {
    context: {} as AvdContext,
    events: {} as AvdEvent,
  },
  actors: { checkAndLoad, createAvd, deleteAvd, startAvd },
}).createMachine({
  id: "avd",
  initial: "loading",
  context: {
    toolsStatus: null,
    avds: [],
    targets: [],
    error: "",
  },
  on: {
    DISMISS_ERROR: { actions: assign({ error: "" }) },
  },
  states: {
    loading: {
      invoke: {
        src: "checkAndLoad",
        onDone: {
          target: "idle",
          actions: assign(({ event }) => ({
            toolsStatus: event.output.tools,
            avds: event.output.avds,
            targets: event.output.targets,
          })),
        },
        onError: {
          target: "idle",
          actions: assign({ error: ({ event }) => `${event.error}` }),
        },
      },
    },
    idle: {
      on: {
        REFRESH: "loading",
        CREATE: "creating",
        DELETE: "deleting",
        START: {
          actions: assign({ error: "" }),
          target: "starting",
        },
      },
    },
    creating: {
      invoke: {
        src: "createAvd",
        input: ({ event }) => (event as { type: "CREATE"; params: AvdCreateParams }).params,
        onDone: "loading",
        onError: {
          target: "loading",
          actions: assign({ error: ({ event }) => `Create failed: ${event.error}` }),
        },
      },
    },
    deleting: {
      invoke: {
        src: "deleteAvd",
        input: ({ event }) => ({ name: (event as { type: "DELETE"; name: string }).name }),
        onDone: "loading",
        onError: {
          target: "loading",
          actions: assign({ error: ({ event }) => `Delete failed: ${event.error}` }),
        },
      },
    },
    starting: {
      invoke: {
        src: "startAvd",
        input: ({ event }) => ({ name: (event as { type: "START"; name: string }).name }),
        onDone: "idle",
        onError: {
          target: "idle",
          actions: assign({ error: ({ event }) => `Start failed: ${event.error}` }),
        },
      },
    },
  },
});
