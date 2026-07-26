import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ToolsContext, type ToolStatus, type ToolGroup } from "../machines";
import type { AppConfig } from "../store";
import {
  Button,
  CircularProgressIndicator,
  Dialog,
  List,
  TextField,
} from "soda-material";
import { Scrim } from "../components/Scrim";
import { SelectDialog } from "../components/SelectDialog";
import { IconButtonWithTooltip } from "../components/IconButtonWithTooltip";
import Icon from "@mdi/react";
import { mdiCheck, mdiClose, mdiRefresh, mdiContentSave } from "@mdi/js";

export const Route = createFileRoute("/tools")({
  component: ToolsPage,
});

function ToolsPage() {
  const actorRef = ToolsContext.useActorRef();
  const state = ToolsContext.useSelector((s) => s);
  const { config, resolvedHome, groups, error } = state.context;
  const detecting = state.matches("detecting");
  const saving = state.matches("savingConfig");

  return (
    <main className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h1 className="text-xl font-bold">Dev Tools</h1>
        <IconButtonWithTooltip
          tooltip="Re-detect"
          placement="bottom"
          path={mdiRefresh}
          onClick={() => actorRef.send({ type: "DETECT" })}
          disabled={detecting || saving}
        />
      </div>

      <div className="flex-1 overflow-auto">
        {detecting && groups.length === 0 && (
          <div className="flex items-center justify-center py-8">
            <CircularProgressIndicator />
          </div>
        )}

        {/* Environment Variables */}
        <EnvSection config={config} resolvedHome={resolvedHome} disabled={detecting || saving} />

        {/* Tool Groups */}
        {groups.map((group) => (
          <ToolGroupSection
            key={group.label}
            group={group}
            configKey={
              group.label === "Command-line Tools" ? "cmdlineToolsVersion" :
              group.label === "Java" ? "javaHome" :
              undefined
            }
          />
        ))}
      </div>

      {/* Error dialog */}
      <Scrim
        open={!!error}
        center
        onScrimClick={() => actorRef.send({ type: "DISMISS_ERROR" })}
      >
        <Dialog
          headline="Error"
          buttons={
            <Button
              onClick={() => actorRef.send({ type: "DISMISS_ERROR" })}
              variant="text"
            >
              Close
            </Button>
          }
        >
          {error}
        </Dialog>
      </Scrim>
    </main>
  );
}

function EnvSection({ config, resolvedHome, disabled }: { config: AppConfig; resolvedHome: string; disabled: boolean }) {
  const actorRef = ToolsContext.useActorRef();
  const [androidHome, setAndroidHome] = useState(config.androidHome || resolvedHome);
  const [androidSdkRoot, setAndroidSdkRoot] = useState(config.androidSdkRoot || resolvedHome);

  const homeChanged = androidHome !== (config.androidHome || resolvedHome);
  const rootChanged = androidSdkRoot !== (config.androidSdkRoot || resolvedHome);

  return (
    <section className="px-4 py-3 w-full">
      <h2 className="text-sm font-semibold mb-3">Environment Variables</h2>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <TextField
              variant="outlined"
              labelText="ANDROID_HOME"
              placeholder="System default"
              value={androidHome}
              onChange={(v) => setAndroidHome(v)}
              disabled={disabled}
              className="w-full"
            />
          </div>
          {homeChanged && (
            <IconButtonWithTooltip
              tooltip="Save"
              placement="left"
              path={mdiContentSave}
              onClick={() =>
                actorRef.send({ type: "SET_CONFIG", key: "androidHome", value: androidHome })
              }
              disabled={disabled}
            />
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <TextField
              variant="outlined"
              labelText="ANDROID_SDK_ROOT"
              placeholder="System default"
              value={androidSdkRoot}
              onChange={(v) => setAndroidSdkRoot(v)}
              disabled={disabled}
              className="w-full"
            />
          </div>
          {rootChanged && (
            <IconButtonWithTooltip
              tooltip="Save"
              placement="left"
              path={mdiContentSave}
              onClick={() =>
                actorRef.send({ type: "SET_CONFIG", key: "androidSdkRoot", value: androidSdkRoot })
              }
              disabled={disabled}
            />
          )}
        </div>
      </div>
    </section>
  );
}

function ToolGroupSection({ group, configKey }: { group: ToolGroup; configKey?: keyof AppConfig }) {
  const actorRef = ToolsContext.useActorRef();
  const [javaPath, setJavaPath] = useState(group.selectedVersion ?? "");

  const hasVersions = group.versions && group.versions.length > 0;
  const isJava = configKey === "javaHome";
  const isCmdlineTools = configKey === "cmdlineToolsVersion";
  const javaChanged = isJava && javaPath !== (group.selectedVersion ?? "");

  return (
    <section className="py-2">
      <div className="flex items-center justify-between px-4 pb-1">
        <h2 className="text-sm font-semibold">{group.label}</h2>
        {hasVersions && isCmdlineTools && (
          <SelectDialog
            headline="Command-line Tools Version"
            options={group.versions!}
            value={group.selectedVersion ?? group.versions![0]}
            onChange={(v) =>
              actorRef.send({ type: "SET_CONFIG", key: configKey!, value: v })
            }
            formatLabel={(v) => `v${v}`}
            tooltip="Select version"
          />
        )}
      </div>
      {isJava && (
        <div className="px-4 pb-2">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <TextField
                variant="outlined"
                labelText="Java path"
                placeholder="/usr/bin/java"
                value={javaPath}
                onChange={(v) => setJavaPath(v)}
                className="w-full"
              />
            </div>
            {hasVersions && (
              <SelectDialog
                headline="Select Java"
                options={group.versions!}
                value={javaPath}
                onChange={(v) => {
                  setJavaPath(v);
                  actorRef.send({ type: "SET_CONFIG", key: "javaHome", value: v });
                }}
                tooltip="Pick from detected"
              />
            )}
            {javaChanged && (
              <IconButtonWithTooltip
                tooltip="Save"
                placement="left"
                path={mdiContentSave}
                onClick={() =>
                  actorRef.send({ type: "SET_CONFIG", key: "javaHome", value: javaPath })
                }
                disabled={!javaPath.trim()}
              />
            )}
          </div>
        </div>
      )}
      {group.tools.map((tool) => (
        <List
          key={tool.name}
          lines={tool.status === "found" ? 3 : 2}
          headline={<span className="font-mono">{tool.name}</span>}
          supportingText={
            <>
              <div>{tool.description}</div>
              {tool.path && (
                <div className="font-mono text-xs">{tool.path}</div>
              )}
            </>
          }
          leadingIcon={<StatusIcon status={tool.status} />}
          trailingSupportingText={
            tool.status === "found"
              ? "installed"
              : tool.status === "not_found"
                ? "missing"
                : ""
          }
        />
      ))}
    </section>
  );
}

function StatusIcon({ status }: { status: ToolStatus["status"] }) {
  switch (status) {
    case "pending":
      return <CircularProgressIndicator size="24px" />;
    case "found":
      return <Icon path={mdiCheck} size={1} className="text-green-500" />;
    case "not_found":
      return <Icon path={mdiClose} size={1} className="text-red-400" />;
  }
}
