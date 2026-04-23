export type ClipKind = "video" | "image";

export interface MediaClip {
  id: string;
  kind: ClipKind;
  file: File;
  name: string;
  /** For video: source duration in seconds. For image: 0 (use timeline length). */
  sourceDuration: number;
  /** For video: in-source start (after trim). For image: ignored. */
  clipStart: number;
  /** For video: in-source end. For image: ignored. */
  clipEnd: number;
  /**
   * For images: how long the image is shown (seconds). Editable.
   * For video: equals (clipEnd - clipStart) and is derived.
   */
  displayDuration: number;
  /** Cached object URL for preview (revoked on remove) */
  url: string;
}

export const createVideoClip = (file: File, duration: number): MediaClip => ({
  id: crypto.randomUUID(),
  kind: "video",
  file,
  name: file.name,
  sourceDuration: duration,
  clipStart: 0,
  clipEnd: duration,
  displayDuration: duration,
  url: URL.createObjectURL(file),
});

export const createImageClip = (file: File, defaultDuration = 3): MediaClip => ({
  id: crypto.randomUUID(),
  kind: "image",
  file,
  name: file.name,
  sourceDuration: 0,
  clipStart: 0,
  clipEnd: defaultDuration,
  displayDuration: defaultDuration,
  url: URL.createObjectURL(file),
});

/** Effective length on the timeline */
export const clipLength = (c: MediaClip): number =>
  c.kind === "video" ? Math.max(0.05, c.clipEnd - c.clipStart) : Math.max(0.1, c.displayDuration);

/** Total timeline duration of an ordered clip list */
export const totalDuration = (clips: MediaClip[]): number =>
  clips.reduce((sum, c) => sum + clipLength(c), 0);

/** Returns the clip and local time for a given timeline time */
export const resolveTime = (
  clips: MediaClip[],
  time: number
): { clip: MediaClip; index: number; localTime: number; clipStartOnTimeline: number } | null => {
  let acc = 0;
  for (let i = 0; i < clips.length; i++) {
    const len = clipLength(clips[i]);
    if (time < acc + len || i === clips.length - 1) {
      return {
        clip: clips[i],
        index: i,
        localTime: Math.max(0, Math.min(len, time - acc)),
        clipStartOnTimeline: acc,
      };
    }
    acc += len;
  }
  return null;
};
