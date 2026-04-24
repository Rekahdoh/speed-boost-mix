import { Settings2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import {
  QualityPreset,
  QualitySettings,
  QUALITY_PRESETS,
  formatBytes,
  estimateFileSize,
} from "@/lib/videoProcessor";

interface ExportSettingsProps {
  preset: QualityPreset;
  custom: QualitySettings;
  onPresetChange: (p: QualityPreset) => void;
  onCustomChange: (q: QualitySettings) => void;
  durationSec: number;
  hasAudio: boolean;
}

const PRESETS: { id: QualityPreset; label: string; sub: string }[] = [
  { id: "low",    label: "Low",    sub: "360p · small file" },
  { id: "medium", label: "Medium", sub: "540p · balanced" },
  { id: "high",   label: "High",   sub: "720p · best quality" },
  { id: "original", label: "Custom", sub: "Tune manually" },
];

export const ExportSettings = ({
  preset,
  custom,
  onPresetChange,
  onCustomChange,
  durationSec,
  hasAudio,
}: ExportSettingsProps) => {
  const active: QualitySettings =
    preset === "original" ? custom : QUALITY_PRESETS[preset];
  const estBytes = estimateFileSize(durationSec, active, hasAudio);

  return (
    <div className="gradient-card rounded-2xl p-5 shadow-soft border border-border space-y-4">
      <div className="flex items-center gap-2">
        <Settings2 className="h-4 w-4 text-primary" />
        <h4 className="text-sm font-semibold">Export Quality</h4>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {PRESETS.map((p) => (
          <Button
            key={p.id}
            type="button"
            variant={preset === p.id ? "default" : "outline"}
            size="sm"
            onClick={() => onPresetChange(p.id)}
            className="h-auto py-2 flex flex-col items-start gap-0.5"
          >
            <span className="text-xs font-semibold">{p.label}</span>
            <span className="text-[10px] opacity-80 font-normal">{p.sub}</span>
          </Button>
        ))}
      </div>

      {preset === "original" && (
        <div className="space-y-4 pt-2 border-t border-border">
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs">Resolution height</Label>
              <span className="text-xs tabular-nums text-muted-foreground">
                {custom.height}p
              </span>
            </div>
            <Slider
              value={[custom.height]}
              onValueChange={(v) => onCustomChange({ ...custom, height: v[0] })}
              min={240}
              max={1080}
              step={60}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs">Video bitrate</Label>
              <span className="text-xs tabular-nums text-muted-foreground">
                {custom.videoBitrateKbps} kbps
              </span>
            </div>
            <Slider
              value={[custom.videoBitrateKbps]}
              onValueChange={(v) =>
                onCustomChange({ ...custom, videoBitrateKbps: v[0] })
              }
              min={200}
              max={6000}
              step={100}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs">Audio bitrate</Label>
              <span className="text-xs tabular-nums text-muted-foreground">
                {custom.audioBitrateKbps} kbps
              </span>
            </div>
            <Slider
              value={[custom.audioBitrateKbps]}
              onValueChange={(v) =>
                onCustomChange({ ...custom, audioBitrateKbps: v[0] })
              }
              min={64}
              max={320}
              step={16}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs">Frame rate</Label>
              <span className="text-xs tabular-nums text-muted-foreground">
                {custom.fps} fps
              </span>
            </div>
            <Slider
              value={[custom.fps]}
              onValueChange={(v) => onCustomChange({ ...custom, fps: v[0] })}
              min={15}
              max={60}
              step={1}
            />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between rounded-xl bg-secondary/50 px-3 py-2.5 border border-border">
        <span className="text-xs text-muted-foreground">Estimated size</span>
        <span className="text-sm font-semibold tabular-nums">
          {formatBytes(estBytes)}
        </span>
      </div>
      <p className="text-[10px] text-muted-foreground -mt-2 leading-relaxed">
        Estimate based on bitrate × duration. Actual size may vary slightly.
        Lower the resolution or bitrate if export keeps failing.
      </p>
    </div>
  );
};
