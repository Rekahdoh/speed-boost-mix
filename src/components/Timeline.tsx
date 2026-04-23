import { useRef, useState, useCallback } from "react";
import { Music, X, Film, Image as ImageIcon, Scissors, Magnet } from "lucide-react";
import { MusicTrack } from "@/types/music";
import { MediaClip, clipLength, totalDuration } from "@/types/clip";
import { formatTime } from "@/lib/mediaUtils";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/** Snap distance in pixels — converted to seconds at runtime via pxPerSec */
const SNAP_PX = 8;
/** Coarse grid interval (seconds) used as fallback snap targets */
const GRID_INTERVAL = 0.5;

interface TimelineProps {
  clips: MediaClip[];
  selectedClipId: string | null;
  onSelectClip: (id: string) => void;
  onUpdateClip: (id: string, patch: Partial<MediaClip>) => void;
  onRemoveClip: (id: string) => void;
  onSplitClip: (id: string, atLocalTime: number) => void;

  currentTime: number;
  tracks: MusicTrack[];
  selectedTrackId: string | null;
  onSelectTrack: (id: string) => void;
  onUpdateTrack: (id: string, patch: Partial<MusicTrack>) => void;
  onRemoveTrack: (id: string) => void;
  onSeek: (time: number) => void;
}

type DragMode = "move" | "resize-left" | "resize-right";
type ClipDragMode = "resize-left" | "resize-right";

const TRACK_COLORS = [
  "from-violet-500 to-fuchsia-500",
  "from-sky-500 to-cyan-500",
  "from-amber-500 to-orange-500",
  "from-emerald-500 to-teal-500",
  "from-pink-500 to-rose-500",
];

export const Timeline = ({
  clips,
  selectedClipId,
  onSelectClip,
  onUpdateClip,
  onRemoveClip,
  onSplitClip,
  currentTime,
  tracks,
  selectedTrackId,
  onSelectTrack,
  onUpdateTrack,
  onRemoveTrack,
  onSeek,
}: TimelineProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const videoDuration = totalDuration(clips);

  const [dragState, setDragState] = useState<{
    id: string;
    mode: DragMode;
    startX: number;
    initial: MusicTrack;
  } | null>(null);

  const [clipDrag, setClipDrag] = useState<{
    id: string;
    mode: ClipDragMode;
    startX: number;
    initial: MediaClip;
  } | null>(null);

  const [snapEnabled, setSnapEnabled] = useState(true);
  const [snapLine, setSnapLine] = useState<number | null>(null);

  const pxPerSec = (() => {
    const w = containerRef.current?.clientWidth ?? 600;
    return videoDuration > 0 ? w / videoDuration : 0;
  })();

  /**
   * Try to snap `value` (in seconds) to one of the provided targets.
   * Returns the snapped value, or the original if nothing is close enough.
   * Also reports the snapped target via setSnapLine so we can render a guide.
   */
  const snap = useCallback(
    (value: number, targets: number[], active: boolean): number => {
      if (!active || pxPerSec === 0) {
        setSnapLine(null);
        return value;
      }
      const thresholdSec = SNAP_PX / pxPerSec;
      let best: number | null = null;
      let bestDist = Infinity;
      for (const t of targets) {
        const d = Math.abs(t - value);
        if (d < bestDist && d <= thresholdSec) {
          best = t;
          bestDist = d;
        }
      }
      if (best !== null) {
        setSnapLine(best);
        return best;
      }
      setSnapLine(null);
      return value;
    },
    [pxPerSec]
  );

  /** Build the list of snap targets relevant for music drags */
  const buildMusicSnapTargets = useCallback(
    (excludeTrackId: string): number[] => {
      const targets: number[] = [0, videoDuration, currentTime];
      // Clip boundaries (start/end of each video/image clip)
      let acc = 0;
      for (const c of clips) {
        targets.push(acc);
        acc += clipLength(c);
      }
      targets.push(acc);
      // Other music track edges
      for (const t of tracks) {
        if (t.id === excludeTrackId) continue;
        targets.push(t.timelineStart, t.timelineEnd);
      }
      // Coarse grid
      for (let g = 0; g <= videoDuration + 0.001; g += GRID_INTERVAL) {
        targets.push(Math.round(g * 1000) / 1000);
      }
      return targets;
    },
    [clips, tracks, videoDuration, currentTime]
  );

  const beginDrag = useCallback(
    (e: React.MouseEvent, track: MusicTrack, mode: DragMode) => {
      e.stopPropagation();
      e.preventDefault();
      onSelectTrack(track.id);
      setDragState({ id: track.id, mode, startX: e.clientX, initial: { ...track } });
    },
    [onSelectTrack]
  );

  const beginClipDrag = useCallback(
    (e: React.MouseEvent, clip: MediaClip, mode: ClipDragMode) => {
      e.stopPropagation();
      e.preventDefault();
      onSelectClip(clip.id);
      setClipDrag({ id: clip.id, mode, startX: e.clientX, initial: { ...clip } });
    },
    [onSelectClip]
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (pxPerSec === 0) return;

      if (clipDrag) {
        const dx = e.clientX - clipDrag.startX;
        const dt = dx / pxPerSec;
        const c = clipDrag.initial;
        if (c.kind === "video") {
          if (clipDrag.mode === "resize-left") {
            const newStart = Math.max(0, Math.min(c.clipEnd - 0.1, c.clipStart + dt));
            onUpdateClip(c.id, {
              clipStart: newStart,
              displayDuration: c.clipEnd - newStart,
            });
          } else {
            const newEnd = Math.max(c.clipStart + 0.1, Math.min(c.sourceDuration, c.clipEnd + dt));
            onUpdateClip(c.id, {
              clipEnd: newEnd,
              displayDuration: newEnd - c.clipStart,
            });
          }
        } else {
          // image: only displayDuration is meaningful
          if (clipDrag.mode === "resize-left") {
            // shrink/grow from left = keep right edge fixed; we just shorten duration
            const newDur = Math.max(0.2, c.displayDuration - dt);
            onUpdateClip(c.id, { displayDuration: newDur, clipEnd: newDur });
          } else {
            const newDur = Math.max(0.2, c.displayDuration + dt);
            onUpdateClip(c.id, { displayDuration: newDur, clipEnd: newDur });
          }
        }
        return;
      }

      if (!dragState) return;
      const dx = e.clientX - dragState.startX;
      const dt = dx / pxPerSec;
      const t = dragState.initial;
      const len = t.timelineEnd - t.timelineStart;
      const sourceMax = Math.max(0, t.duration - t.clipStart);
      // Hold Alt to temporarily disable snapping (InShot-style)
      const snapActive = snapEnabled && !e.altKey;
      const targets = buildMusicSnapTargets(t.id);

      if (dragState.mode === "move") {
        let newStart = t.timelineStart + dt;
        newStart = Math.max(0, Math.min(videoDuration - len, newStart));
        // Try snapping the start edge first; if it doesn't snap, try the end edge
        const snappedStart = snap(newStart, targets, snapActive);
        if (snappedStart !== newStart) {
          newStart = Math.max(0, Math.min(videoDuration - len, snappedStart));
        } else {
          const snappedEnd = snap(newStart + len, targets, snapActive);
          if (snappedEnd !== newStart + len) {
            newStart = Math.max(0, Math.min(videoDuration - len, snappedEnd - len));
          }
        }
        onUpdateTrack(t.id, { timelineStart: newStart, timelineEnd: newStart + len });
      } else if (dragState.mode === "resize-left") {
        let newStart = t.timelineStart + dt;
        newStart = snap(newStart, targets, snapActive);
        newStart = Math.max(0, Math.min(t.timelineEnd - 0.2, newStart));
        const shift = newStart - t.timelineStart;
        const newClipStart = Math.max(0, Math.min(t.duration - 0.1, t.clipStart + shift));
        onUpdateTrack(t.id, { timelineStart: newStart, clipStart: newClipStart });
      } else if (dragState.mode === "resize-right") {
        let newEnd = t.timelineEnd + dt;
        newEnd = snap(newEnd, targets, snapActive);
        const maxEnd = t.loop ? videoDuration : Math.min(videoDuration, t.timelineStart + sourceMax);
        newEnd = Math.max(t.timelineStart + 0.2, Math.min(maxEnd, newEnd));
        onUpdateTrack(t.id, { timelineEnd: newEnd });
      }
    },
    [dragState, clipDrag, pxPerSec, videoDuration, onUpdateTrack, onUpdateClip, snapEnabled, snap, buildMusicSnapTargets]
  );

  const endDrag = useCallback(() => {
    setDragState(null);
    setClipDrag(null);
    setSnapLine(null);
  }, []);

  const handleRulerClick = (e: React.MouseEvent) => {
    if (!containerRef.current || pxPerSec === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    onSeek(x / pxPerSec);
  };

  // Find which clip the playhead is inside
  const playheadInClip = (() => {
    let acc = 0;
    for (let i = 0; i < clips.length; i++) {
      const len = clipLength(clips[i]);
      if (currentTime >= acc && currentTime < acc + len) {
        return { clip: clips[i], localTime: currentTime - acc };
      }
      acc += len;
    }
    return null;
  })();

  const handleSplit = () => {
    if (!playheadInClip) return;
    onSplitClip(playheadInClip.clip.id, playheadInClip.localTime);
  };

  const tickInterval = videoDuration > 60 ? 10 : videoDuration > 20 ? 5 : 1;
  const ticks: number[] = [];
  for (let t = 0; t <= videoDuration; t += tickInterval) ticks.push(t);

  if (videoDuration === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Add a video or image clip to see the timeline
      </div>
    );
  }

  return (
    <div
      className="gradient-card rounded-2xl border border-border shadow-soft p-4 select-none"
      onMouseMove={onMouseMove}
      onMouseUp={endDrag}
      onMouseLeave={endDrag}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-3">
        <Button
          size="sm"
          variant="outline"
          onClick={handleSplit}
          disabled={!playheadInClip}
          className="h-7 text-xs"
        >
          <Scissors className="h-3.5 w-3.5 mr-1" />
          Split at playhead
        </Button>
        <Button
          size="sm"
          variant={snapEnabled ? "default" : "outline"}
          onClick={() => setSnapEnabled((s) => !s)}
          className={cn(
            "h-7 text-xs",
            snapEnabled && "gradient-primary text-primary-foreground border-0 hover:opacity-90"
          )}
          title="Snap to grid, clip edges, and playhead (hold Alt to disable while dragging)"
        >
          <Magnet className="h-3.5 w-3.5 mr-1" />
          Snap {snapEnabled ? "On" : "Off"}
        </Button>
      </div>

      {/* Ruler */}
      <div
        ref={containerRef}
        className="relative h-7 border-b border-border cursor-pointer mb-2"
        onClick={handleRulerClick}
      >
        {ticks.map((t) => (
          <div
            key={t}
            className="absolute top-0 h-full flex flex-col items-start"
            style={{ left: `${(t / videoDuration) * 100}%` }}
          >
            <div className="w-px h-2 bg-border" />
            <span className="text-[10px] text-muted-foreground ml-1 tabular-nums">
              {formatTime(t)}
            </span>
          </div>
        ))}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-primary z-20 pointer-events-none"
          style={{ left: `${Math.min(100, (currentTime / videoDuration) * 100)}%` }}
        >
          <div className="absolute -top-1 -left-1.5 w-3 h-3 rounded-full bg-primary shadow-glow" />
        </div>
      </div>

      {/* Video clip row */}
      <div className="relative h-12 mb-2 rounded-md bg-secondary/40 border border-border overflow-hidden">
        {(() => {
          let acc = 0;
          return clips.map((c) => {
            const len = clipLength(c);
            const leftPct = (acc / videoDuration) * 100;
            const widthPct = (len / videoDuration) * 100;
            acc += len;
            const isSelected = c.id === selectedClipId;
            const Icon = c.kind === "video" ? Film : ImageIcon;
            return (
              <div
                key={c.id}
                onClick={() => onSelectClip(c.id)}
                className={cn(
                  "absolute top-0 bottom-0 flex items-center px-2 gap-1.5 overflow-hidden",
                  "bg-gradient-to-r from-primary/60 to-primary/40 cursor-pointer",
                  "border-r border-background/30",
                  isSelected && "ring-2 ring-primary ring-inset"
                )}
                style={{ left: `${leftPct}%`, width: `${Math.max(1, widthPct)}%` }}
              >
                <div
                  onMouseDown={(e) => beginClipDrag(e, c, "resize-left")}
                  className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-white/40 hover:bg-white/70 z-10"
                />
                <Icon className="h-3.5 w-3.5 text-primary-foreground shrink-0" />
                <span className="text-xs font-medium text-primary-foreground truncate">
                  {c.name}
                </span>
                <button
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveClip(c.id);
                  }}
                  className="ml-auto h-5 w-5 rounded hover:bg-black/20 flex items-center justify-center shrink-0 z-10"
                  aria-label="Remove clip"
                >
                  <X className="h-3 w-3 text-primary-foreground" />
                </button>
                <div
                  onMouseDown={(e) => beginClipDrag(e, c, "resize-right")}
                  className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-white/40 hover:bg-white/70 z-10"
                />
              </div>
            );
          });
        })()}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-primary z-20 pointer-events-none"
          style={{ left: `${Math.min(100, (currentTime / videoDuration) * 100)}%` }}
        />
      </div>

      {/* Music tracks */}
      <div className="space-y-2 relative">
        {snapLine !== null && dragState && (
          <div
            className="absolute -top-1 -bottom-1 w-px bg-accent z-30 pointer-events-none shadow-[0_0_6px_hsl(var(--accent))]"
            style={{ left: `${(snapLine / videoDuration) * 100}%` }}
          >
            <div className="absolute -top-1 -left-[3px] w-[7px] h-[7px] rounded-full bg-accent" />
            <div className="absolute -bottom-1 -left-[3px] w-[7px] h-[7px] rounded-full bg-accent" />
          </div>
        )}
        {tracks.length === 0 && (
          <div className="h-12 rounded-md border border-dashed border-border flex items-center justify-center text-xs text-muted-foreground">
            Add a music track to begin
          </div>
        )}
        {tracks.map((track, idx) => {
          const leftPct = (track.timelineStart / videoDuration) * 100;
          const widthPct = ((track.timelineEnd - track.timelineStart) / videoDuration) * 100;
          const isSelected = track.id === selectedTrackId;
          const color = TRACK_COLORS[idx % TRACK_COLORS.length];
          return (
            <div
              key={track.id}
              className="relative h-12 rounded-md bg-secondary/50 border border-border"
            >
              <div
                onMouseDown={(e) => beginDrag(e, track, "move")}
                onClick={() => onSelectTrack(track.id)}
                className={cn(
                  "absolute top-0 bottom-0 rounded-md cursor-grab active:cursor-grabbing",
                  "bg-gradient-to-r shadow-md flex items-center px-2 gap-1.5 overflow-hidden",
                  color,
                  isSelected && "ring-2 ring-primary ring-offset-1 ring-offset-background"
                )}
                style={{ left: `${leftPct}%`, width: `${Math.max(2, widthPct)}%` }}
              >
                <div
                  onMouseDown={(e) => beginDrag(e, track, "resize-left")}
                  className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-white/40 hover:bg-white/70 rounded-l-md"
                />
                <Music className="h-3.5 w-3.5 text-white shrink-0" />
                <span className="text-xs font-medium text-white truncate">{track.name}</span>
                <button
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveTrack(track.id);
                  }}
                  className="ml-auto h-5 w-5 rounded hover:bg-black/20 flex items-center justify-center shrink-0 z-10"
                  aria-label="Remove track"
                >
                  <X className="h-3 w-3 text-white" />
                </button>
                <div
                  onMouseDown={(e) => beginDrag(e, track, "resize-right")}
                  className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-white/40 hover:bg-white/70 rounded-r-md"
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span className="tabular-nums">{formatTime(currentTime)}</span>
        <span className="tabular-nums">{formatTime(videoDuration)}</span>
      </div>
    </div>
  );
};
