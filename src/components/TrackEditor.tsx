import { Music, Volume2, Repeat, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { MusicTrack } from "@/types/music";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { formatTime } from "@/lib/mediaUtils";

interface TrackEditorProps {
  track: MusicTrack | null;
  videoDuration: number;
  onUpdate: (patch: Partial<MusicTrack>) => void;
}

export const TrackEditor = ({ track, videoDuration, onUpdate }: TrackEditorProps) => {
  if (!track) {
    return (
      <div className="gradient-card rounded-2xl p-6 shadow-soft border border-border text-center">
        <Music className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
        <p className="text-sm text-muted-foreground">
          Select a music track on the timeline to edit it
        </p>
      </div>
    );
  }

  const clipLength = track.timelineEnd - track.timelineStart;

  return (
    <div className="gradient-card rounded-2xl p-5 shadow-soft border border-border space-y-5">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl gradient-primary flex items-center justify-center shrink-0 shadow-glow">
          <Music className="h-5 w-5 text-primary-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground truncate text-sm">{track.name}</p>
          <p className="text-xs text-muted-foreground">
            Source: {formatTime(track.duration)} • Clip: {formatTime(clipLength)}
          </p>
        </div>
      </div>

      {/* Volume */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-xs flex items-center gap-1.5">
            <Volume2 className="h-3.5 w-3.5" />
            Volume
          </Label>
          <span
            className={`text-sm font-semibold tabular-nums ${
              track.volume > 100 ? "text-accent" : "text-foreground"
            }`}
          >
            {track.volume}%
          </span>
        </div>
        <Slider
          value={[track.volume]}
          onValueChange={(v) => onUpdate({ volume: v[0] })}
          min={0}
          max={200}
          step={1}
        />
      </div>

      {/* Timeline placement */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">Start on video</Label>
          <Input
            type="number"
            step={0.1}
            min={0}
            max={Math.max(0, videoDuration - 0.2)}
            value={track.timelineStart.toFixed(2)}
            onChange={(e) => {
              const v = Math.max(0, Math.min(videoDuration - 0.2, parseFloat(e.target.value) || 0));
              const len = clipLength;
              onUpdate({
                timelineStart: v,
                timelineEnd: Math.min(videoDuration, v + len),
              });
            }}
            className="h-9 mt-1 text-sm tabular-nums"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">End on video</Label>
          <Input
            type="number"
            step={0.1}
            min={track.timelineStart + 0.2}
            max={videoDuration}
            value={track.timelineEnd.toFixed(2)}
            onChange={(e) => {
              const v = Math.max(
                track.timelineStart + 0.2,
                Math.min(videoDuration, parseFloat(e.target.value) || 0)
              );
              onUpdate({ timelineEnd: v });
            }}
            className="h-9 mt-1 text-sm tabular-nums"
          />
        </div>
      </div>

      {/* In-clip trim */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-xs">Trim source start</Label>
          <span className="text-xs tabular-nums text-muted-foreground">
            {formatTime(track.clipStart)}
          </span>
        </div>
        <Slider
          value={[track.clipStart]}
          onValueChange={(v) =>
            onUpdate({ clipStart: Math.min(track.duration - 0.1, v[0]) })
          }
          min={0}
          max={Math.max(0.1, track.duration - 0.1)}
          step={0.1}
        />
      </div>

      {/* Fades */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs flex items-center gap-1.5">
            <ArrowUpFromLine className="h-3.5 w-3.5" />
            Fade in (s)
          </Label>
          <Input
            type="number"
            step={0.1}
            min={0}
            max={Math.min(10, clipLength / 2)}
            value={track.fadeIn.toFixed(1)}
            onChange={(e) =>
              onUpdate({ fadeIn: Math.max(0, parseFloat(e.target.value) || 0) })
            }
            className="h-9 mt-1 text-sm tabular-nums"
          />
        </div>
        <div>
          <Label className="text-xs flex items-center gap-1.5">
            <ArrowDownToLine className="h-3.5 w-3.5" />
            Fade out (s)
          </Label>
          <Input
            type="number"
            step={0.1}
            min={0}
            max={Math.min(10, clipLength / 2)}
            value={track.fadeOut.toFixed(1)}
            onChange={(e) =>
              onUpdate({ fadeOut: Math.max(0, parseFloat(e.target.value) || 0) })
            }
            className="h-9 mt-1 text-sm tabular-nums"
          />
        </div>
      </div>

      {/* Loop */}
      <div className="flex items-center justify-between rounded-lg bg-secondary/50 p-3">
        <Label className="text-sm flex items-center gap-2 cursor-pointer">
          <Repeat className="h-4 w-4 text-primary" />
          Loop if shorter than clip
        </Label>
        <Switch
          checked={track.loop}
          onCheckedChange={(c) => onUpdate({ loop: c })}
        />
      </div>
    </div>
  );
};
