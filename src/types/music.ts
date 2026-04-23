export interface MusicTrack {
  id: string;
  file: File;
  name: string;
  /** Duration of the source audio file in seconds */
  duration: number;
  /** Where on the video timeline this clip starts (seconds) */
  timelineStart: number;
  /** Where on the video timeline this clip ends (seconds) */
  timelineEnd: number;
  /** Offset within the source audio to begin playing from (seconds) */
  clipStart: number;
  /** Volume 0-200 (%) */
  volume: number;
  /** Fade in seconds */
  fadeIn: number;
  /** Fade out seconds */
  fadeOut: number;
  /** Loop the source if timeline range is longer than (duration - clipStart) */
  loop: boolean;
}

export const createMusicTrack = (
  file: File,
  duration: number,
  videoDuration: number
): MusicTrack => ({
  id: crypto.randomUUID(),
  file,
  name: file.name,
  duration,
  timelineStart: 0,
  timelineEnd: Math.min(duration, videoDuration || duration),
  clipStart: 0,
  volume: 80,
  fadeIn: 0,
  fadeOut: 0,
  loop: true,
});
