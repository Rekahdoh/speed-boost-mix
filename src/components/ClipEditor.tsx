import { Film, Image as ImageIcon, Scissors } from "lucide-react";
import { MediaClip, clipLength } from "@/types/clip";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatTime } from "@/lib/mediaUtils";

interface ClipEditorProps {
  clip: MediaClip | null;
  onUpdate: (patch: Partial<MediaClip>) => void;
  onSplit?: () => void;
  canSplit?: boolean;
}

export const ClipEditor = ({ clip, onUpdate, onSplit, canSplit }: ClipEditorProps) => {
  if (!clip) {
    return (
      <div className="gradient-card rounded-2xl p-6 shadow-soft border border-border text-center">
        <Film className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
        <p className="text-sm text-muted-foreground">
          Select a clip on the timeline to edit it
        </p>
      </div>
    );
  }

  const Icon = clip.kind === "video" ? Film : ImageIcon;
  const len = clipLength(clip);

  return (
    <div className="gradient-card rounded-2xl p-5 shadow-soft border border-border space-y-5">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl gradient-primary flex items-center justify-center shrink-0 shadow-glow">
          <Icon className="h-5 w-5 text-primary-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground truncate text-sm">{clip.name}</p>
          <p className="text-xs text-muted-foreground">
            {clip.kind === "video"
              ? `Source: ${formatTime(clip.sourceDuration)} • Clip: ${formatTime(len)}`
              : `Image • Duration: ${formatTime(len)}`}
          </p>
        </div>
      </div>

      {clip.kind === "video" ? (
        <>
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs">Trim start</Label>
              <span className="text-xs tabular-nums text-muted-foreground">
                {formatTime(clip.clipStart)}
              </span>
            </div>
            <Slider
              value={[clip.clipStart]}
              onValueChange={(v) => {
                const newStart = Math.min(clip.clipEnd - 0.1, v[0]);
                onUpdate({ clipStart: newStart, displayDuration: clip.clipEnd - newStart });
              }}
              min={0}
              max={Math.max(0.1, clip.sourceDuration - 0.1)}
              step={0.1}
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs">Trim end</Label>
              <span className="text-xs tabular-nums text-muted-foreground">
                {formatTime(clip.clipEnd)}
              </span>
            </div>
            <Slider
              value={[clip.clipEnd]}
              onValueChange={(v) => {
                const newEnd = Math.max(clip.clipStart + 0.1, v[0]);
                onUpdate({ clipEnd: newEnd, displayDuration: newEnd - clip.clipStart });
              }}
              min={0.1}
              max={clip.sourceDuration}
              step={0.1}
            />
          </div>
        </>
      ) : (
        <div>
          <Label className="text-xs">Show duration (s)</Label>
          <Input
            type="number"
            step={0.1}
            min={0.2}
            max={60}
            value={clip.displayDuration.toFixed(1)}
            onChange={(e) => {
              const v = Math.max(0.2, parseFloat(e.target.value) || 0.2);
              onUpdate({ displayDuration: v, clipEnd: v });
            }}
            className="h-9 mt-1 text-sm tabular-nums"
          />
        </div>
      )}

      {onSplit && (
        <Button
          onClick={onSplit}
          disabled={!canSplit}
          variant="outline"
          size="sm"
          className="w-full"
        >
          <Scissors className="h-4 w-4 mr-1.5" />
          Split at playhead
        </Button>
      )}
    </div>
  );
};
