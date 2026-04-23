import { useRef, useState, useCallback } from "react";
import { Music, X } from "lucide-react";
import { MusicTrack } from "@/types/music";
import { formatTime } from "@/lib/mediaUtils";
import { cn } from "@/lib/utils";

interface TimelineProps {
  videoDuration: number;
  currentTime: number;
  tracks: MusicTrack[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onUpdate: (id: string, patch: Partial<MusicTrack>) => void;
  onRemove: (id: string) => void;
  onSeek: (time: number) => void;
}

type DragMode = "move" | "resize-left" | "resize-right";

const TRACK_COLORS = [
  "from-violet-500 to-fuchsia-500",
  "from-sky-500 to-cyan-500",
  "from-amber-500 to-orange-500",
  "from-emerald-500 to-teal-500",
  "from-pink-500 to-rose-500",
];

export const Timeline = ({
  videoDuration,
  currentTime,
  tracks,
  selectedId,
  onSelect,
  onUpdate,
  onRemove,
  onSeek,
}: TimelineProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<{
    id: string;
    mode: DragMode;
    startX: number;
    initial: MusicTrack;
  } | null>(null);

  const pxPerSec = (() => {
    const w = containerRef.current?.clientWidth ?? 600;
    return videoDuration > 0 ? w / videoDuration : 0;
  })();

  const beginDrag = useCallback(
    (e: React.MouseEvent, track: MusicTrack, mode: DragMode) => {
      e.stopPropagation();
      e.preventDefault();
      onSelect(track.id);
      setDragState({
        id: track.id,
        mode,
        startX: e.clientX,
        initial: { ...track },
      });
    },
    [onSelect]
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragState || pxPerSec === 0) return;
      const dx = e.clientX - dragState.startX;
      const dt = dx / pxPerSec;
      const t = dragState.initial;
      const len = t.timelineEnd - t.timelineStart;
      const sourceMax = Math.max(0, t.duration - t.clipStart);

      if (dragState.mode === "move") {
        let newStart = t.timelineStart + dt;
        newStart = Math.max(0, Math.min(videoDuration - len, newStart));
        onUpdate(t.id, {
          timelineStart: newStart,
          timelineEnd: newStart + len,
        });
      } else if (dragState.mode === "resize-left") {
        let newStart = t.timelineStart + dt;
        newStart = Math.max(0, Math.min(t.timelineEnd - 0.2, newStart));
        // shift clipStart so audio content stays anchored to original timeline
        const shift = newStart - t.timelineStart;
        const newClipStart = Math.max(0, Math.min(t.duration - 0.1, t.clipStart + shift));
        onUpdate(t.id, { timelineStart: newStart, clipStart: newClipStart });
      } else if (dragState.mode === "resize-right") {
        let newEnd = t.timelineEnd + dt;
        const maxEnd = t.loop
          ? videoDuration
          : Math.min(videoDuration, t.timelineStart + sourceMax);
        newEnd = Math.max(t.timelineStart + 0.2, Math.min(maxEnd, newEnd));
        onUpdate(t.id, { timelineEnd: newEnd });
      }
    },
    [dragState, pxPerSec, videoDuration, onUpdate]
  );

  const endDrag = useCallback(() => setDragState(null), []);

  const handleRulerClick = (e: React.MouseEvent) => {
    if (!containerRef.current || pxPerSec === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    onSeek(x / pxPerSec);
  };

  // Build ruler ticks
  const tickInterval = videoDuration > 60 ? 10 : videoDuration > 20 ? 5 : 1;
  const ticks: number[] = [];
  for (let t = 0; t <= videoDuration; t += tickInterval) ticks.push(t);

  if (videoDuration === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Upload a video to see the timeline
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
        {/* Playhead */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-primary z-20 pointer-events-none"
          style={{
            left: `${Math.min(100, (currentTime / videoDuration) * 100)}%`,
          }}
        >
          <div className="absolute -top-1 -left-1.5 w-3 h-3 rounded-full bg-primary shadow-glow" />
        </div>
      </div>

      {/* Video track row */}
      <div className="relative h-8 mb-2 rounded-md gradient-primary/20 bg-primary/10 border border-primary/20 flex items-center px-3">
        <span className="text-xs font-medium text-primary">Video</span>
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-primary z-10 pointer-events-none"
          style={{
            left: `${Math.min(100, (currentTime / videoDuration) * 100)}%`,
          }}
        />
      </div>

      {/* Music tracks */}
      <div className="space-y-2">
        {tracks.length === 0 && (
          <div className="h-12 rounded-md border border-dashed border-border flex items-center justify-center text-xs text-muted-foreground">
            Add a music track to begin
          </div>
        )}
        {tracks.map((track, idx) => {
          const leftPct = (track.timelineStart / videoDuration) * 100;
          const widthPct =
            ((track.timelineEnd - track.timelineStart) / videoDuration) * 100;
          const isSelected = track.id === selectedId;
          const color = TRACK_COLORS[idx % TRACK_COLORS.length];
          return (
            <div
              key={track.id}
              className="relative h-12 rounded-md bg-secondary/50 border border-border"
            >
              <div
                onMouseDown={(e) => beginDrag(e, track, "move")}
                onClick={() => onSelect(track.id)}
                className={cn(
                  "absolute top-0 bottom-0 rounded-md cursor-grab active:cursor-grabbing",
                  "bg-gradient-to-r shadow-md flex items-center px-2 gap-1.5 overflow-hidden",
                  color,
                  isSelected && "ring-2 ring-primary ring-offset-1 ring-offset-background"
                )}
                style={{
                  left: `${leftPct}%`,
                  width: `${Math.max(2, widthPct)}%`,
                }}
              >
                {/* Resize handle left */}
                <div
                  onMouseDown={(e) => beginDrag(e, track, "resize-left")}
                  className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-white/40 hover:bg-white/70 rounded-l-md"
                />
                <Music className="h-3.5 w-3.5 text-white shrink-0" />
                <span className="text-xs font-medium text-white truncate">
                  {track.name}
                </span>
                <button
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(track.id);
                  }}
                  className="ml-auto h-5 w-5 rounded hover:bg-black/20 flex items-center justify-center shrink-0 z-10"
                  aria-label="Remove track"
                >
                  <X className="h-3 w-3 text-white" />
                </button>
                {/* Resize handle right */}
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
