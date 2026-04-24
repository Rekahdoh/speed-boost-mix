import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { MusicTrack } from "@/types/music";
import { MediaClip, clipLength, totalDuration } from "@/types/clip";

let ffmpegInstance: FFmpeg | null = null;

export const getFFmpeg = async (
  onLog?: (msg: string) => void
): Promise<FFmpeg> => {
  if (ffmpegInstance && ffmpegInstance.loaded) return ffmpegInstance;

  const ffmpeg = new FFmpeg();
  if (onLog) ffmpeg.on("log", ({ message }) => onLog(message));

  const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
  });

  ffmpegInstance = ffmpeg;
  return ffmpeg;
};

/**
 * Extract the audio track from a video file as an MP3 File.
 * Returns null if the source has no audio.
 */
export const extractAudioFromVideo = async (
  videoFile: File,
  onLog?: (msg: string) => void
): Promise<File> => {
  const ffmpeg = await getFFmpeg(onLog);
  const ext = videoFile.name.split(".").pop() || "mp4";
  const inputName = `extract_in.${ext}`;
  const outputName = "extract_out.mp3";

  await ffmpeg.writeFile(inputName, await fetchFile(videoFile));

  await ffmpeg.exec([
    "-i", inputName,
    "-vn",
    "-acodec", "libmp3lame",
    "-q:a", "2",
    "-y",
    outputName,
  ]);

  const data = (await ffmpeg.readFile(outputName)) as Uint8Array;
  const buffer = new ArrayBuffer(data.byteLength);
  new Uint8Array(buffer).set(data);

  try {
    await ffmpeg.deleteFile(inputName);
    await ffmpeg.deleteFile(outputName);
  } catch {}

  const baseName = videoFile.name.replace(/\.[^.]+$/, "");
  return new File([buffer], `${baseName} - audio.mp3`, { type: "audio/mpeg" });
};

export type QualityPreset = "low" | "medium" | "high" | "original";

export interface QualitySettings {
  /** Output height in pixels (width is computed to keep 16:9). */
  height: number;
  /** Video bitrate in kbps */
  videoBitrateKbps: number;
  /** Audio bitrate in kbps */
  audioBitrateKbps: number;
  /** Frame rate */
  fps: number;
}

export const QUALITY_PRESETS: Record<Exclude<QualityPreset, "original">, QualitySettings> = {
  low:    { height: 360,  videoBitrateKbps: 500,  audioBitrateKbps: 96,  fps: 24 },
  medium: { height: 540,  videoBitrateKbps: 1200, audioBitrateKbps: 128, fps: 30 },
  high:   { height: 720,  videoBitrateKbps: 2500, audioBitrateKbps: 160, fps: 30 },
};

/**
 * Estimate output file size in bytes given duration (seconds) and quality.
 * Uses bitrate * duration / 8.
 */
export const estimateFileSize = (
  durationSec: number,
  quality: QualitySettings,
  hasAudio: boolean
): number => {
  const totalKbps = quality.videoBitrateKbps + (hasAudio ? quality.audioBitrateKbps : 0);
  // kbps -> bits/sec -> bytes
  return Math.round((totalKbps * 1000 * durationSec) / 8);
};

export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

interface ProcessOptions {
  clips: MediaClip[];
  tracks: MusicTrack[];
  speed: number;
  videoVolume: number;
  quality?: QualitySettings;
  onProgress?: (ratio: number) => void;
  onLog?: (msg: string) => void;
}

const buildAtempo = (s: number): string => {
  if (s === 1) return "atempo=1.0";
  const parts: number[] = [];
  let remaining = s;
  while (remaining > 2.0) { parts.push(2.0); remaining /= 2.0; }
  while (remaining < 0.5) { parts.push(0.5); remaining /= 0.5; }
  parts.push(remaining);
  return parts.map((p) => `atempo=${p.toFixed(4)}`).join(",");
};

const volumeFilter = (vol: number): string => {
  const v = vol / 100;
  if (v === 0) return "volume=0";
  if (v <= 1) return `volume=${v.toFixed(3)}`;
  return `volume=${v.toFixed(3)},dynaudnorm=f=150:g=15:p=0.95`;
};

export const processVideo = async ({
  clips,
  tracks,
  speed,
  videoVolume,
  quality = QUALITY_PRESETS.high,
  onProgress,
  onLog,
}: ProcessOptions): Promise<Blob> => {
  if (clips.length === 0) throw new Error("No clips to process");

  // Compute width from height keeping 16:9, force even numbers (libx264 requirement)
  const height = Math.max(2, Math.round(quality.height / 2) * 2);
  const width = Math.max(2, Math.round((height * 16) / 9 / 2) * 2);
  const fps = quality.fps;
  const vBitrate = `${quality.videoBitrateKbps}k`;
  const aBitrate = `${quality.audioBitrateKbps}k`;

  const ffmpeg = await getFFmpeg(onLog);

  if (onProgress) {
    ffmpeg.on("progress", ({ progress }) => {
      onProgress(Math.min(Math.max(progress, 0), 1));
    });
  }

  // Step 1: write each clip to FFmpeg FS and pre-process to a uniform mp4 segment
  const segmentFiles: string[] = [];
  for (let i = 0; i < clips.length; i++) {
    const c = clips[i];
    const ext = c.file.name.split(".").pop() || (c.kind === "video" ? "mp4" : "jpg");
    const inputName = `clip_in_${i}.${ext}`;
    const segName = `seg_${i}.mp4`;
    await ffmpeg.writeFile(inputName, await fetchFile(c.file));

    const len = clipLength(c);

    if (c.kind === "video") {
      // Trim and re-encode to uniform format. Add silent audio if missing.
      await ffmpeg.exec([
        "-ss", c.clipStart.toFixed(3),
        "-i", inputName,
        "-t", len.toFixed(3),
        "-f", "lavfi",
        "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
        "-vf", `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=${fps}`,
        "-map", "0:v:0",
        "-map", "1:a:0",
        "-shortest",
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", aBitrate,
        "-r", String(fps),
        "-y",
        segName,
      ]);
    } else {
      // Image -> video segment of `len` seconds with silent audio
      await ffmpeg.exec([
        "-loop", "1",
        "-t", len.toFixed(3),
        "-i", inputName,
        "-f", "lavfi",
        "-t", len.toFixed(3),
        "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
        "-vf", `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=${fps}`,
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", aBitrate,
        "-r", String(fps),
        "-y",
        segName,
      ]);
    }

    await ffmpeg.deleteFile(inputName);
    segmentFiles.push(segName);
  }

  // Step 2: concat segments via concat demuxer
  const concatList = segmentFiles.map((f) => `file '${f}'`).join("\n");
  await ffmpeg.writeFile("concat.txt", new TextEncoder().encode(concatList));

  await ffmpeg.exec([
    "-f", "concat",
    "-safe", "0",
    "-i", "concat.txt",
    "-c", "copy",
    "-y",
    "concat.mp4",
  ]);

  // Step 3: write music files
  const writtenTracks: { track: MusicTrack; filename: string; index: number }[] = [];
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    const ext = t.file.name.split(".").pop() || "mp3";
    const filename = `music_${i}.${ext}`;
    await ffmpeg.writeFile(filename, await fetchFile(t.file));
    writtenTracks.push({ track: t, filename, index: i + 1 });
  }

  // Step 4: apply speed + mix audio
  const videoDuration = totalDuration(clips);
  const atempo = buildAtempo(speed);
  const setpts = `setpts=${(1 / speed).toFixed(4)}*PTS`;

  const filters: string[] = [];
  filters.push(`[0:v]${setpts}[v]`);
  filters.push(`[0:a]${atempo},${volumeFilter(videoVolume)}[a_video]`);

  const audioMixInputs: string[] = ["[a_video]"];
  const finalDur = videoDuration / speed;

  writtenTracks.forEach(({ track, index }) => {
    // Editor-time range
    const editorClipDur = track.timelineEnd - track.timelineStart;
    // Output-time range (music is NOT sped up — it plays at 1x in real time,
    // so we need fewer real seconds of audio when speed > 1).
    const outClipDur = editorClipDur / speed;
    const outDelay = track.timelineStart / speed;

    const sourceAvail = Math.max(0.01, track.duration - track.clipStart);
    const needsLoop = track.loop && outClipDur > sourceAvail;

    const parts: string[] = [];
    parts.push(`atrim=start=${track.clipStart.toFixed(3)}`);
    parts.push(`asetpts=PTS-STARTPTS`);
    if (needsLoop) parts.push(`aloop=loop=-1:size=2e9`);
    parts.push(`atrim=duration=${outClipDur.toFixed(3)}`);
    parts.push(`asetpts=PTS-STARTPTS`);
    if (track.fadeIn > 0) {
      const fIn = Math.min(track.fadeIn, outClipDur / 2);
      parts.push(`afade=t=in:st=0:d=${fIn.toFixed(3)}`);
    }
    if (track.fadeOut > 0) {
      const fOut = Math.min(track.fadeOut, outClipDur / 2);
      const fadeStart = Math.max(0, outClipDur - fOut);
      parts.push(`afade=t=out:st=${fadeStart.toFixed(3)}:d=${fOut.toFixed(3)}`);
    }
    parts.push(volumeFilter(track.volume));
    const delayMs = Math.round(outDelay * 1000);
    if (delayMs > 0) parts.push(`adelay=${delayMs}|${delayMs}`);
    // No atempo on music — it stays at 1x regardless of video speed.
    parts.push(`apad`, `atrim=duration=${finalDur.toFixed(3)}`);

    const label = `a_t${index}`;
    filters.push(`[${index}:a]${parts.join(",")}[${label}]`);
    audioMixInputs.push(`[${label}]`);
  });

  const mixCount = audioMixInputs.length;
  filters.push(
    `${audioMixInputs.join("")}amix=inputs=${mixCount}:duration=first:dropout_transition=0:normalize=0[a]`
  );

  const filterComplex = filters.join(";");

  await ffmpeg.exec([
    "-i", "concat.mp4",
    ...writtenTracks.flatMap(({ filename }) => ["-i", filename]),
    "-filter_complex", filterComplex,
    "-map", "[v]",
    "-map", "[a]",
    "-c:v", "libx264",
    "-preset", "ultrafast",
    "-pix_fmt", "yuv420p",
    "-b:v", vBitrate,
    "-maxrate", vBitrate,
    "-bufsize", `${quality.videoBitrateKbps * 2}k`,
    "-c:a", "aac",
    "-b:a", aBitrate,
    "-r", String(fps),
    "-shortest",
    "-y",
    "output.mp4",
  ]);

  const data = (await ffmpeg.readFile("output.mp4")) as Uint8Array;
  const buffer = new ArrayBuffer(data.byteLength);
  new Uint8Array(buffer).set(data);
  const blob = new Blob([buffer], { type: "video/mp4" });

  // Cleanup
  try {
    for (const f of segmentFiles) await ffmpeg.deleteFile(f);
    await ffmpeg.deleteFile("concat.txt");
    await ffmpeg.deleteFile("concat.mp4");
    await ffmpeg.deleteFile("output.mp4");
    for (const { filename } of writtenTracks) await ffmpeg.deleteFile(filename);
  } catch {}

  return blob;
};
