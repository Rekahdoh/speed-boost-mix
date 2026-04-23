/**
 * Read the duration (in seconds) of an audio or video file in the browser.
 */
export const getMediaDuration = (
  file: File,
  kind: "audio" | "video" = "audio"
): Promise<number> => {
  return new Promise((resolve, reject) => {
    const el = document.createElement(kind);
    el.preload = "metadata";
    const url = URL.createObjectURL(file);
    el.src = url;
    el.onloadedmetadata = () => {
      const d = el.duration;
      URL.revokeObjectURL(url);
      resolve(isFinite(d) ? d : 0);
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to read media metadata"));
    };
  });
};

export const formatTime = (sec: number): string => {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec - Math.floor(sec)) * 10);
  return `${m}:${s.toString().padStart(2, "0")}.${ms}`;
};
