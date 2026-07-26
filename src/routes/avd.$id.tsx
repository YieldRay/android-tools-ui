import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Button,
  CircularProgressIndicator,
  TextField,
} from "soda-material";
import { IconButtonWithTooltip } from "../components/IconButtonWithTooltip";
import { mdiArrowLeft, mdiFileEditOutline } from "@mdi/js";
import { avdReadConfig, avdWriteConfig, avdConfigPath } from "../invoke/avd";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

export const Route = createFileRoute("/avd/$id")({
  component: AvdDetailPage,
});

/** Common config keys shown in the edit UI */
const EDITABLE_FIELDS: { key: string; label: string }[] = [
  { key: "avd.ini.displayname", label: "Display Name" },
  { key: "hw.device.name", label: "Device" },
  { key: "abi.type", label: "ABI" },
  { key: "hw.cpu.arch", label: "CPU Architecture" },
  { key: "hw.cpu.ncore", label: "CPU Cores" },
  { key: "hw.ramSize", label: "RAM (MB)" },
  { key: "disk.dataPartition.size", label: "Data Partition Size" },
  { key: "sdcard.size", label: "SD Card Size" },
  { key: "hw.lcd.density", label: "LCD Density" },
  { key: "hw.lcd.width", label: "LCD Width" },
  { key: "hw.lcd.height", label: "LCD Height" },
  { key: "hw.camera.back", label: "Back Camera" },
  { key: "hw.camera.front", label: "Front Camera" },
  { key: "hw.gpu.enabled", label: "GPU Enabled" },
  { key: "hw.gpu.mode", label: "GPU Mode" },
  { key: "hw.keyboard", label: "Keyboard" },
  { key: "skin.name", label: "Skin" },
  { key: "PlayStore.enabled", label: "Play Store" },
  { key: "vm.heapSize", label: "VM Heap (MB)" },
];

function AvdDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<Record<string, string>>({});
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    avdReadConfig(id)
      .then((c) => {
        setConfig(c);
        setEdited({});
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [id]);

  const dirty = Object.keys(edited).some((k) => edited[k] !== config[k]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await avdWriteConfig(id, edited);
      // Reload to reflect saved state
      const c = await avdReadConfig(id);
      setConfig(c);
      setEdited({});
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleOpenFile = async () => {
    try {
      const path = await avdConfigPath(id);
      await revealItemInDir(path);
    } catch (e) {
      setError(String(e));
    }
  };

  const getValue = (key: string) =>
    key in edited ? edited[key] : (config[key] ?? "");

  const setValue = (key: string, value: string) => {
    setEdited((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <main className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <IconButtonWithTooltip
          tooltip="Back"
          placement="bottom"
          path={mdiArrowLeft}
          onClick={() => navigate({ to: "/avd" })}
        />
        <h1 className="text-xl font-bold flex-1">{id}</h1>
        <IconButtonWithTooltip
          tooltip="Edit config.ini"
          placement="bottom"
          path={mdiFileEditOutline}
          onClick={handleOpenFile}
        />
      </div>

      {loading && (
        <div className="flex items-center justify-center py-8">
          <CircularProgressIndicator />
        </div>
      )}

      {error && (
        <div className="px-4 py-2 text-red-600 text-sm">{error}</div>
      )}

      {!loading && (
        <div className="flex-1 overflow-auto px-4 pb-4">
          <div className="flex flex-col gap-3">
            {EDITABLE_FIELDS.filter((f) => f.key in config).map((field) => (
              <TextField
                key={field.key}
                variant="outlined"
                labelText={field.label}
                value={getValue(field.key)}
                onChange={(v) => setValue(field.key, v)}
              />
            ))}
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="text"
              disabled={!dirty || saving}
              onClick={() => setEdited({})}
            >
              Reset
            </Button>
            <Button disabled={!dirty || saving} onClick={handleSave}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
