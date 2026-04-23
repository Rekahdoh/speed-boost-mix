import { useEffect, useRef } from "react";

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
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const videoGainRef = useRef<GainNode | null>(null);
  const musicGainRef = useRef<GainNode | null>(null);
  const videoSrcNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const musicSrcNodeRef = useRef<MediaElementAudioSourceNode | null>(null);

  const videoUrl = videoFile ? URL.createObjectURL(videoFile) : "";
  const audioUrl = audioFile ? URL.createObjectURL(audioFile) : "";

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [videoUrl, audioUrl]);

  // Setup Web Audio API for >100% volume boost
  useEffect(() => {
    if (!videoRef.current) return;

    const setup = () => {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
      }
      const ctx = audioCtxRef.current;

      if (videoRef.current && !videoSrcNodeRef.current) {
        try {
          videoSrcNodeRef.current = ctx.createMediaElementSource(videoRef.current);
          videoGainRef.current = ctx.createGain();
          videoSrcNodeRef.current.connect(videoGainRef.current).connect(ctx.destination);
        } catch (e) {
          // already connected
        }
      }

      if (audioRef.current && !musicSrcNodeRef.current) {
        try {
          musicSrcNodeRef.current = ctx.createMediaElementSource(audioRef.current);
          musicGainRef.current = ctx.createGain();
          musicSrcNodeRef.current.connect(musicGainRef.current).connect(ctx.destination);
        } catch (e) {
          // already connected
        }
      }
    };

    setup();
  }, [videoFile, audioFile]);

  // Apply volumes (0-200%)
  useEffect(() => {
    if (videoGainRef.current) {
      videoGainRef.current.gain.value = videoVolume / 100;
    }
  }, [videoVolume]);

  useEffect(() => {
    if (musicGainRef.current) {
      musicGainRef.current.gain.value = musicVolume / 100;
    }
  }, [musicVolume]);

  // Apply speed
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speed;
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed]);

  // Sync audio playback with video
  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video || !audio) return;

    const onPlay = () => {
      audioCtxRef.current?.resume();
      audio.play().catch(() => {});
    };
    const onPause = () => audio.pause();
    const onSeek = () => {
      audio.currentTime = video.currentTime % (audio.duration || 1);
    };
    const onTime = () => {
      // loop background music
      if (audio.duration && video.currentTime > audio.duration) {
        audio.currentTime = video.currentTime % audio.duration;
      }
    };

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("seeked", onSeek);
    video.addEventListener("timeupdate", onTime);

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("seeked", onSeek);
      video.removeEventListener("timeupdate", onTime);
    };
  }, [videoFile, audioFile]);

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
          ref={videoRef}
          src={videoUrl}
          controls
          className="w-full aspect-video"
          crossOrigin="anonymous"
        />
      </div>
      {audioFile && (
        <audio ref={audioRef} src={audioUrl} loop crossOrigin="anonymous" />
      )}
    </div>
  );
};
