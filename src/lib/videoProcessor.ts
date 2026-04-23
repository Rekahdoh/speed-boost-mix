import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { MusicTrack } from "@/types/music";

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

interface ProcessOptions {
  videoFile: File;
  tracks: MusicTrack[];
  speed: number;
  videoVolume: number;
  videoDuration: number;
  onProgress?: (ratio: number) => void;
  onLog?: (msg: string) => void;
}

const buildAtempo = (s: number): string => {
  if (s === 1) return "atempo=1.0";
  const parts: number[] = [];
  let remaining = s;
  while (remaining > 2.0) {
    parts.push(2.0);
    remaining /= 2.0;
  }
  while (remaining < 0.5) {
    parts.push(0.5);
    remaining /= 0.5;
  }
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
  videoFile,
  tracks,
  speed,
  videoVolume,
  videoDuration,
  onProgress,
  onLog,
}: ProcessOptions): Promise<Blob> => {
  const ffmpeg = await getFFmpeg(onLog);

  if (onProgress) {
    ffmpeg.on("progress", ({ progress }) => {
      onProgress(Math.min(Math.max(progress, 0), 1));
    });
  }

  const videoExt = videoFile.name.split(".").pop() || "mp4";
  const inputVideo = `input.${videoExt}`;
  const outputVideo = "output.mp4";

  await ffmpeg.writeFile(inputVideo, await fetchFile(videoFile));

  // Write all music files
  const writtenTracks: { track: MusicTrack; filename: string; index: number }[] = [];
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    const ext = t.file.name.split(".").pop() || "mp3";
    const filename = `music_${i}.${ext}`;
    await ffmpeg.writeFile(filename, await fetchFile(t.file));
    writtenTracks.push({ track: t, filename, index: i + 1 }); // input index (0 = video)
  }

  const atempo = buildAtempo(speed);
  const setpts = `setpts=${(1 / speed).toFixed(4)}*PTS`;

  // Build filter graph
  const filters: string[] = [];

  // Video stream — apply speed
  filters.push(`[0:v]${setpts}[v]`);

  // Original video audio — apply speed + volume
  filters.push(`[0:a]${atempo},${volumeFilter(videoVolume)}[a_video]`);

  const audioMixInputs: string[] = ["[a_video]"];

  // Per track: trim source, optionally loop via aloop, delay to timelineStart, apply fades+volume,
  // then apply the same atempo so it stays in sync with the sped-up video.
  writtenTracks.forEach(({ track, index }) => {
    const clipDur = track.timelineEnd - track.timelineStart;
    const sourceAvail = Math.max(0.01, track.duration - track.clipStart);
    const needsLoop = track.loop && clipDur > sourceAvail;

    const parts: string[] = [];
    // Trim from clipStart
    parts.push(`atrim=start=${track.clipStart.toFixed(3)}`);
    parts.push(`asetpts=PTS-STARTPTS`);

    if (needsLoop) {
      // aloop with -1 loops infinitely; size in samples (assume 44100 Hz, ~10min cap)
      parts.push(`aloop=loop=-1:size=2e9`);
    }

    // Limit to clip duration
    parts.push(`atrim=duration=${clipDur.toFixed(3)}`);
    parts.push(`asetpts=PTS-STARTPTS`);

    // Fades
    if (track.fadeIn > 0) {
      parts.push(`afade=t=in:st=0:d=${track.fadeIn.toFixed(3)}`);
    }
    if (track.fadeOut > 0) {
      const fadeStart = Math.max(0, clipDur - track.fadeOut);
      parts.push(`afade=t=out:st=${fadeStart.toFixed(3)}:d=${track.fadeOut.toFixed(3)}`);
    }

    // Volume
    parts.push(volumeFilter(track.volume));

    // Delay to timelineStart (in ms). Use both channels.
    const delayMs = Math.round(track.timelineStart * 1000);
    if (delayMs > 0) {
      parts.push(`adelay=${delayMs}|${delayMs}`);
    }

    // Apply playback speed so it lines up with sped-up video
    parts.push(atempo);

    // Pad or trim to full (sped-up) video duration so all inputs align
    const finalDur = videoDuration / speed;
    parts.push(`apad`, `atrim=duration=${finalDur.toFixed(3)}`);

    const label = `a_t${index}`;
    filters.push(`[${index}:a]${parts.join(",")}[${label}]`);
    audioMixInputs.push(`[${label}]`);
  });

  // Mix all audio sources
  const mixCount = audioMixInputs.length;
  filters.push(
    `${audioMixInputs.join("")}amix=inputs=${mixCount}:duration=first:dropout_transition=0:normalize=0[a]`
  );

  const filterComplex = filters.join(";");

  await ffmpeg.exec([
    "-i", inputVideo,
    ...writtenTracks.flatMap(({ filename }) => ["-i", filename]),
    "-filter_complex", filterComplex,
    "-map", "[v]",
    "-map", "[a]",
    "-c:v", "libx264",
    "-preset", "ultrafast",
    "-c:a", "aac",
    "-b:a", "192k",
    "-shortest",
    "-y",
    outputVideo,
  ]);

  const data = (await ffmpeg.readFile(outputVideo)) as Uint8Array;
  const buffer = new ArrayBuffer(data.byteLength);
  new Uint8Array(buffer).set(data);
  const blob = new Blob([buffer], { type: "video/mp4" });

  // cleanup
  try {
    await ffmpeg.deleteFile(inputVideo);
    await ffmpeg.deleteFile(outputVideo);
    for (const { filename } of writtenTracks) {
      await ffmpeg.deleteFile(filename);
    }
  } catch {}

  return blob;
};
