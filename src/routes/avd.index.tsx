import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AvdContext } from "../machines";
import {
  Button,
  CircularProgressIndicator,
  Dialog,
  IconButton,
  List,
  Select,
  TextField,
} from "soda-material";
import { Scrim } from "../components/Scrim";
import { IconButtonWithTooltip } from "../components/IconButtonWithTooltip";
import { StopPropagation } from "../components/StopPropagation";
import Icon from "@mdi/react";
import {
  mdiCellphone,
  mdiDelete,
  mdiPlay,
  mdiPlus,
  mdiRefresh,
  mdiAlertCircleOutline,
} from "@mdi/js";
import type { AvdCreateParams } from "../invoke";

export const Route = createFileRoute("/avd/")({
  component: AvdPage,
});

function AvdPage() {
  const actorRef = AvdContext.useActorRef();
  const state = AvdContext.useSelector((s) => s);
  const { toolsStatus, avds, targets, error } = state.context;
  const loading = state.matches("loading");
  const busy =
    state.matches("creating") ||
    state.matches("deleting") ||
    state.matches("starting");

  const [showCreate, setShowCreate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState("");

  const navigate = useNavigate();

  // Tools not installed - guide to SDK page
  if (!loading && toolsStatus && (!toolsStatus.avdmanager || !toolsStatus.emulator)) {
    return (
      <main className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h1 className="text-xl font-bold">AVD Manager</h1>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6">
          <Icon path={mdiAlertCircleOutline} size={2}  />
          <p className="text-center max-w-md">
            {toolsStatus.message}
          </p>
          <p className="text-center text-sm max-w-md">
            Go to the SDK page to install the missing packages, then come back here.
          </p>
          <Button onClick={() => navigate({ to: "/sdk" })}>
            Go to SDK Manager
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h1 className="text-xl font-bold">AVD Manager</h1>
        <div className="flex gap-1">
          <IconButtonWithTooltip
            tooltip="Create AVD"
            placement="bottom"
            path={mdiPlus}
            onClick={() => setShowCreate(true)}
            disabled={loading || busy || targets.length === 0}
          />
          <IconButtonWithTooltip
            tooltip="Refresh"
            placement="bottom"
            path={mdiRefresh}
            onClick={() => actorRef.send({ type: "REFRESH" })}
            disabled={loading || busy}
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <CircularProgressIndicator />
          </div>
        )}

        {!loading && avds.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <Icon path={mdiCellphone} size={2} />
            <p>No AVDs found</p>
            {targets.length > 0 && (
              <Button variant="text" onClick={() => setShowCreate(true)}>
                Create one
              </Button>
            )}
            {targets.length === 0 && (
              <p className="text-sm max-w-xs text-center">
                Install a system image from the SDK page first, then create an AVD.
              </p>
            )}
          </div>
        )}

        {avds.map((avd) => (
          <List onClick={() => navigate({ to: "/avd/$id", params: { id: avd.name } })}
            className="cursor-pointer"
            key={avd.name}
            lines={2}
            headline={<span className="font-mono text-sm">{avd.name}</span>}
            supportingText={
              [avd.device, avd.target, avd.abi].filter(Boolean).join(" \u2022 ") ||
              avd.path
            }
            leadingIcon={<Icon path={mdiCellphone} size={1} />}
            trailingIcon={
              <StopPropagation className="flex">
                <IconButton
                  path={mdiPlay}
                  onClick={() => actorRef.send({ type: "START", name: avd.name })}
                  disabled={busy}
                />
                <IconButton
                  path={mdiDelete}
                  onClick={() => setConfirmDelete(avd.name)}
                  disabled={busy}
                />
              </StopPropagation>
            }
          />
        ))}
      </div>

      {/* Create AVD dialog */}
      <Scrim open={showCreate} center onScrimClick={() => setShowCreate(false)}>
        <CreateAvdDialog
          targets={targets}
          onClose={() => setShowCreate(false)}
          onCreate={(params) => {
            setShowCreate(false);
            actorRef.send({ type: "CREATE", params });
          }}
        />
      </Scrim>

      {/* Delete confirmation dialog */}
      <Scrim open={!!confirmDelete} center onScrimClick={() => setConfirmDelete("")}>
        <Dialog
          headline="Confirm Delete"
          buttons={
            <>
              <Button onClick={() => setConfirmDelete("")} variant="text">
                Cancel
              </Button>
              <Button
                onClick={() => {
                  actorRef.send({ type: "DELETE", name: confirmDelete });
                  setConfirmDelete("");
                }}
                variant="text"
              >
                Delete
              </Button>
            </>
          }
        >
          Are you sure you want to delete AVD <strong>{confirmDelete}</strong>?
          This will remove all associated data.
        </Dialog>
      </Scrim>

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

function CreateAvdDialog({
  targets,
  onClose,
  onCreate,
}: {
  targets: { id: string; label: string }[];
  onClose: () => void;
  onCreate: (params: AvdCreateParams) => void;
}) {
  const [name, setName] = useState("");
  const [selectedTarget, setSelectedTarget] = useState(targets[0]?.id ?? "");
  const [device, setDevice] = useState("");

  const valid = name.trim().length > 0 && selectedTarget.length > 0;

  return (
    <Dialog
      headline="Create AVD"
      buttons={
        <>
          <Button onClick={onClose} variant="text">
            Cancel
          </Button>
          <Button
            onClick={() =>
              onCreate({
                name: name.trim(),
                package: selectedTarget,
                device: device.trim() || undefined,
              })
            }
            variant="text"
            disabled={!valid}
          >
            Create
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 min-w-[300px]">
        <TextField
          variant="outlined"
          labelText="AVD Name"
          placeholder="my_avd"
          value={name}
          onChange={(v) => setName(v)}
        />
        <Select
          full
          value={selectedTarget}
          onChange={(v) => setSelectedTarget(v)}
          options={targets.map((t) => ({ value: t.id, label: t.label }))}
        />
        <TextField
          variant="outlined"
          labelText="Device (optional)"
          placeholder="pixel_6"
          value={device}
          onChange={(v) => setDevice(v)}
        />
      </div>
    </Dialog>
  );
}
