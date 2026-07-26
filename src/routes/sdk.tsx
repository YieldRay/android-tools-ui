import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SdkContext, type PkgEntry } from "../machines";
import { onSdkDownloadProgress } from "../invoke";
import {
  Button,
  Search,
  List,
  IconButton,
  CircularProgressIndicator,
  Dialog,
} from "soda-material";
import { Scrim } from "../components/Scrim";
import { IconButtonWithTooltip } from "../components/IconButtonWithTooltip";
import { StopPropagation } from "../components/StopPropagation";
import Icon from "@mdi/react";
import {
  mdiDownload,
  mdiDelete,
  mdiCheck,
  mdiRefresh,
  mdiPackageVariant,
  mdiClose,
  mdiMagnify,
} from "@mdi/js";

export const Route = createFileRoute("/sdk")({
  component: SdkPage,
});

function SdkPage() {
  const actorRef = SdkContext.useActorRef();
  const state = SdkContext.useSelector((s) => s);
  const { packages, error } = state.context;
  const loading = state.matches("loading");

  const [filter, setFilter] = useState("");
  const [confirmPkg, setConfirmPkg] = useState("");

  const filtered = filter
    ? packages.filter((p) =>
        p.path.toLowerCase().includes(filter.toLowerCase())
      )
    : packages;

  function handleInstall(pkg: string) {
    actorRef.send({ type: "INSTALL", pkg });
  }

  function handleCancelInstall(pkg: string) {
    actorRef.send({ type: "CANCEL_INSTALL", pkg });
  }

  function handleUninstallConfirm(pkg: string) {
    setConfirmPkg(pkg);
  }

  function handleUninstall() {
    const pkg = confirmPkg;
    setConfirmPkg("");
    actorRef.send({ type: "UNINSTALL", pkg });
  }

  return (
    <main className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h1 className="text-xl font-bold">SDK Manager</h1>
        <IconButtonWithTooltip
          tooltip="Refresh"
          placement="bottom"
          path={mdiRefresh}
          onClick={() => actorRef.send({ type: "REFRESH" })}
          disabled={loading}
        />
      </div>

      <div className="px-4 pb-2">
        <Search
          placeholder="Filter packages"
          value={filter}
          onChange={(v) => setFilter(v)}
          leadingIcon={<Icon path={mdiMagnify} size={1} />}
        />
      </div>

      <div className="flex-1 overflow-auto">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <CircularProgressIndicator />
          </div>
        )}
        {!loading && filtered.map((pkg) => (
          <PkgRow
            key={pkg.path}
            pkg={pkg}
            onInstall={handleInstall}
            onCancelInstall={handleCancelInstall}
            onUninstall={handleUninstallConfirm}
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

      {/* Uninstall confirm dialog */}
      <Scrim open={!!confirmPkg} center onScrimClick={() => setConfirmPkg("")}>
        <Dialog
          headline="Confirm Uninstall"
          buttons={
            <>
              <Button onClick={() => setConfirmPkg("")} variant="text">
                Cancel
              </Button>
              <Button onClick={handleUninstall} variant="text">
                Uninstall
              </Button>
            </>
          }
        >
          Are you sure you want to uninstall <strong>{confirmPkg}</strong>? This
          will delete the package from your SDK directory.
        </Dialog>
      </Scrim>
    </main>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function PkgRow({
  pkg,
  onInstall,
  onCancelInstall,
  onUninstall,
}: {
  pkg: PkgEntry;
  onInstall: (p: string) => void;
  onCancelInstall: (p: string) => void;
  onUninstall: (p: string) => void;
}) {
  const [progress, setProgress] = useState<{ downloaded: number; total: number } | null>(null);

  useEffect(() => {
    if (pkg.status !== "installing") {
      setProgress(null);
      return;
    }
    let cancelled = false;
    const unlistenPromise = onSdkDownloadProgress((p) => {
      if (!cancelled && p.package === pkg.path) {
        setProgress({ downloaded: p.downloaded, total: p.total });
      }
    });
    return () => {
      cancelled = true;
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [pkg.status, pkg.path]);

  const supportingText = (() => {
    if (pkg.status === "installing" && progress) {
      const pct = progress.total > 0
        ? `${Math.round((progress.downloaded / progress.total) * 100)}%`
        : "";
      return `Downloading... ${formatBytes(progress.downloaded)}${progress.total > 0 ? ` / ${formatBytes(progress.total)} (${pct})` : ""}`;
    }
    if (pkg.status === "installed") return pkg.location ?? "installed";
    if (pkg.status === "uninstalling") return "Uninstalling...";
    if (pkg.url) return new URL(pkg.url).pathname.split("/").pop();
    return "available";
  })();

  return (
    <List
      lines={2}
      headline={<span className="font-mono text-sm">{pkg.path}</span>}
      supportingText={supportingText}
      leadingIcon={
        pkg.status === "installed" ? (
          <Icon path={mdiCheck} size={1} className="text-green-500" />
        ) : pkg.status === "installing" || pkg.status === "uninstalling" ? (
          <CircularProgressIndicator size="24px" value={progress && progress.total > 0 ? progress.downloaded / progress.total : undefined} />
        ) : (
          <Icon path={mdiPackageVariant} size={1} />
        )
      }
      trailingIcon={
        <StopPropagation>
          {pkg.status === "installed" ? (
            <IconButton path={mdiDelete} onClick={() => onUninstall(pkg.path)} />
          ) : pkg.status === "installing" ? (
            <IconButton path={mdiClose} onClick={() => onCancelInstall(pkg.path)} />
          ) : pkg.status === "available" ? (
            <IconButton path={mdiDownload} onClick={() => onInstall(pkg.path)} />
          ) : null}
        </StopPropagation>
      }
    />
  );
}
