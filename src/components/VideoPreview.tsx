import { useEffect, useRef, useState } from "react";

interface VideoPreviewProps {
  videoFile: File | null;
  audioFile: File | null;
  speed: number;
  videoVolume: number;
  musicVolume: number;
}

export const VideoPreview = ({
  videoFile,
  audioFile,
  speed,
  videoVolume,
  musicVolume,
}: VideoPreviewProps) => {
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const videoGainRef = useRef<GainNode | null>(null);
  const musicGainRef = useRef<GainNode | null>(null);
  const videoSrcNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const musicSrcNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const connectedVideoElRef = useRef<HTMLVideoElement | null>(null);
  const connectedAudioElRef = useRef<HTMLAudioElement | null>(null);

  const [videoUrl, setVideoUrl] = useState<string>("");
  const [audioUrl, setAudioUrl] = useState<string>("");

  // Manage object URLs
  useEffect(() => {
    if (!videoFile) {
      setVideoUrl("");
      return;
    }
    const url = URL.createObjectURL(videoFile);
    setVideoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [videoFile]);

  useEffect(() => {
    if (!audioFile) {
      setAudioUrl("");
      return;
    }
    const url = URL.createObjectURL(audioFile);
    setAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [audioFile]);

  // Connect video element to Web Audio graph
  useEffect(() => {
    if (!videoEl) return;
    if (connectedVideoElRef.current === videoEl) return;

    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    const ctx = audioCtxRef.current;

    try {
      const src = ctx.createMediaElementSource(videoEl);
      const gain = ctx.createGain();
      gain.gain.value = videoVolume / 100;
      src.connect(gain).connect(ctx.destination);
      videoSrcNodeRef.current = src;
      videoGainRef.current = gain;
      connectedVideoElRef.current = videoEl;
    } catch (e) {
      console.warn("Video audio graph already connected", e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoEl]);

  // Connect audio element to Web Audio graph
  useEffect(() => {
    if (!audioEl) {
      // audio element unmounted — drop refs so a future remount reconnects
      musicSrcNodeRef.current = null;
      musicGainRef.current = null;
      connectedAudioElRef.current = null;
      return;
    }
    if (connectedAudioElRef.current === audioEl) return;

    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    const ctx = audioCtxRef.current;

    try {
      const src = ctx.createMediaElementSource(audioEl);
      const gain = ctx.createGain();
      gain.gain.value = musicVolume / 100;
      src.connect(gain).connect(ctx.destination);
      musicSrcNodeRef.current = src;
      musicGainRef.current = gain;
      connectedAudioElRef.current = audioEl;
    } catch (e) {
      console.warn("Music audio graph already connected", e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioEl]);

  // Apply video volume (0-200%) — also mute the element directly as belt-and-suspenders
  useEffect(() => {
    if (videoGainRef.current) {
      videoGainRef.current.gain.value = videoVolume / 100;
    }
  }, [videoVolume]);

  // Apply music volume (0-200%)
  useEffect(() => {
    if (musicGainRef.current) {
      musicGainRef.current.gain.value = musicVolume / 100;
    }
    // Also set element volume directly as a fallback (capped at 1.0)
    if (audioEl) {
      audioEl.volume = Math.min(1, musicVolume / 100);
      audioEl.muted = musicVolume === 0;
    }
  }, [musicVolume, audioEl]);

  // Apply speed
  useEffect(() => {
    if (videoEl) videoEl.playbackRate = speed;
    if (audioEl) audioEl.playbackRate = speed;
  }, [speed, videoEl, audioEl]);

  // Sync audio playback with video
  useEffect(() => {
    if (!videoEl || !audioEl) return;

    const onPlay = () => {
      audioCtxRef.current?.resume();
      audioEl.play().catch(() => {});
    };
    const onPause = () => audioEl.pause();
    const onSeek = () => {
      audioEl.currentTime = videoEl.currentTime % (audioEl.duration || 1);
    };
    const onTime = () => {
      if (audioEl.duration && videoEl.currentTime > audioEl.duration) {
        audioEl.currentTime = videoEl.currentTime % audioEl.duration;
      }
    };

    videoEl.addEventListener("play", onPlay);
    videoEl.addEventListener("pause", onPause);
    videoEl.addEventListener("seeked", onSeek);
    videoEl.addEventListener("timeupdate", onTime);

    return () => {
      videoEl.removeEventListener("play", onPlay);
      videoEl.removeEventListener("pause", onPause);
      videoEl.removeEventListener("seeked", onSeek);
      videoEl.removeEventListener("timeupdate", onTime);
    };
  }, [videoEl, audioEl]);

  if (!videoFile) {
    return (
      <div className="aspect-video w-full rounded-2xl bg-secondary/50 border-2 border-dashed border-border flex items-center justify-center">
        <p className="text-muted-foreground text-center px-4">
          Upload a video to see the preview
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl overflow-hidden shadow-elevated bg-black">
        <video
          ref={setVideoEl}
          src={videoUrl}
          controls
          className="w-full aspect-video"
          crossOrigin="anonymous"
        />
      </div>
      {audioFile && audioUrl && (
        <audio
          ref={setAudioEl}
          src={audioUrl}
          loop
          crossOrigin="anonymous"
        />
      )}
    </div>
  );
};
