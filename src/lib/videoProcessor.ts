import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

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
  audioFile: File | null;
  speed: number; // 0.25 - 3
  videoVolume: number; // 0 - 200 (%)
  musicVolume: number; // 0 - 200 (%)
  onProgress?: (ratio: number) => void;
  onLog?: (msg: string) => void;
}

export const processVideo = async ({
  videoFile,
  audioFile,
  speed,
  videoVolume,
  musicVolume,
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

  // Build atempo chain (each atempo accepts 0.5-2.0)
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

  const atempo = buildAtempo(speed);
  const setpts = `setpts=${(1 / speed).toFixed(4)}*PTS`;

  // Volume boost above 1.0 with dynaudnorm to limit clipping
  const videoVolFilter = (vol: number) => {
    const v = vol / 100;
    if (v === 0) return "volume=0";
    if (v <= 1) return `volume=${v.toFixed(3)}`;
    return `volume=${v.toFixed(3)},dynaudnorm=f=150:g=15:p=0.95`;
  };

  if (audioFile) {
    const audioExt = audioFile.name.split(".").pop() || "mp3";
    const inputAudio = `music.${audioExt}`;
    await ffmpeg.writeFile(inputAudio, await fetchFile(audioFile));

    // -stream_loop -1 loops; -shortest trims to video length after speed adjust
    const filterComplex = [
      `[0:v]${setpts}[v]`,
      `[0:a]${atempo},${videoVolFilter(videoVolume)}[a0]`,
      `[1:a]${videoVolFilter(musicVolume)}[a1]`,
      `[a0][a1]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a]`,
    ].join(";");

    await ffmpeg.exec([
      "-i", inputVideo,
      "-stream_loop", "-1",
      "-i", `music.${audioExt}`,
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
  } else {
    // No background music — speed + video volume only
    const filterComplex = [
      `[0:v]${setpts}[v]`,
      `[0:a]${atempo},${videoVolFilter(videoVolume)}[a]`,
    ].join(";");

    await ffmpeg.exec([
      "-i", inputVideo,
      "-filter_complex", filterComplex,
      "-map", "[v]",
      "-map", "[a]",
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-c:a", "aac",
      "-b:a", "192k",
      "-y",
      outputVideo,
    ]);
  }

  const data = await ffmpeg.readFile(outputVideo);
  const blob = new Blob([data as Uint8Array], { type: "video/mp4" });

  // cleanup
  try {
    await ffmpeg.deleteFile(inputVideo);
    await ffmpeg.deleteFile(outputVideo);
    if (audioFile) {
      const audioExt = audioFile.name.split(".").pop() || "mp3";
      await ffmpeg.deleteFile(`music.${audioExt}`);
    }
  } catch {}

  return blob;
};
