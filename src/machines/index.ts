import { createActorContext } from "@xstate/react";
import { avdMachine } from "./avd";
import { sdkMachine } from "./sdk";
import { toolsMachine } from "./tools";

export const AvdContext = createActorContext(avdMachine);
export const SdkContext = createActorContext(sdkMachine);
export const ToolsContext = createActorContext(toolsMachine);

export type { PkgEntry, PackageStatus } from "./sdk";
export type { ToolStatus, ToolGroup } from "./tools";
