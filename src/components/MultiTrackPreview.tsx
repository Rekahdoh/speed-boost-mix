import { useEffect, useRef, useState } from "react";
import { MusicTrack } from "@/types/music";

interface MultiTrackPreviewProps {
  videoFile: File;
  tracks: MusicTrack[];
  speed: number;
  videoVolume: number;
  onTimeUpdate: (currentTime: number) => void;
  onDurationChange: (duration: number) => void;
  /** Imperative seek requests from parent */
  seekRequest: number | null;
}

interface TrackAudio {
  id: string;
  el: HTMLAudioElement;
  url: string;
  src: MediaElementAudioSourceNode;
  gain: GainNode;
}

export const MultiTrackPreview = ({
  videoFile,
  tracks,
  speed,
  videoVolume,
  onTimeUpdate,
  onDurationChange,
  seekRequest,
}: MultiTrackPreviewProps) => {
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const [videoUrl, setVideoUrl] = useState("");

  const audioCtxRef = useRef<AudioContext | null>(null);
  const videoGainRef = useRef<GainNode | null>(null);
  const videoConnectedRef = useRef<HTMLVideoElement | null>(null);
  const trackAudioMapRef = useRef<Map<string, TrackAudio>>(new Map());

  // Manage video URL
  useEffect(() => {
    const url = URL.createObjectURL(videoFile);
    setVideoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [videoFile]);

  // Connect video to Web Audio
  useEffect(() => {
    if (!videoEl) return;
    if (videoConnectedRef.current === videoEl) return;
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
    const ctx = audioCtxRef.current;
    try {
      const src = ctx.createMediaElementSource(videoEl);
      const gain = ctx.createGain();
      gain.gain.value = videoVolume / 100;
      src.connect(gain).connect(ctx.destination);
      videoGainRef.current = gain;
      videoConnectedRef.current = videoEl;
    } catch (e) {
      console.warn("Video graph already connected", e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoEl]);

  // Sync video volume
  useEffect(() => {
    if (videoGainRef.current) videoGainRef.current.gain.value = videoVolume / 100;
  }, [videoVolume]);

  // Sync playback rate
  useEffect(() => {
    if (videoEl) videoEl.playbackRate = speed;
    trackAudioMapRef.current.forEach((t) => (t.el.playbackRate = speed));
  }, [speed, videoEl]);

  // Manage track audio elements (create/remove based on tracks list)
  useEffect(() => {
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
    const ctx = audioCtxRef.current;
    const map = trackAudioMapRef.current;

    const currentIds = new Set(tracks.map((t) => t.id));

    // Remove audio for deleted tracks
    map.forEach((ta, id) => {
      if (!currentIds.has(id)) {
        ta.el.pause();
        try {
          ta.src.disconnect();
          ta.gain.disconnect();
        } catch {}
        URL.revokeObjectURL(ta.url);
        map.delete(id);
      }
    });

    // Add audio for new tracks
    tracks.forEach((t) => {
      if (map.has(t.id)) return;
      const url = URL.createObjectURL(t.file);
      const el = new Audio(url);
      el.crossOrigin = "anonymous";
      el.preload = "auto";
      el.playbackRate = speed;
      try {
        const src = ctx.createMediaElementSource(el);
        const gain = ctx.createGain();
        gain.gain.value = 0;
        src.connect(gain).connect(ctx.destination);
        map.set(t.id, { id: t.id, el, url, src, gain });
      } catch (e) {
        console.warn("Track graph connect failed", e);
        URL.revokeObjectURL(url);
      }
    });

    return () => {
      // No-op: cleanup handled per-track above; full unmount cleanup below
    };
  }, [tracks, speed]);

  // Cleanup all audio on unmount
  useEffect(() => {
    return () => {
      trackAudioMapRef.current.forEach((ta) => {
        ta.el.pause();
        try {
          ta.src.disconnect();
          ta.gain.disconnect();
        } catch {}
        URL.revokeObjectURL(ta.url);
      });
      trackAudioMapRef.current.clear();
    };
  }, []);

  // Drive track playback from video timeupdate
  useEffect(() => {
    if (!videoEl) return;

    const updateTracks = () => {
      const t = videoEl.currentTime;
      const playing = !videoEl.paused;
      onTimeUpdate(t);

      tracks.forEach((track) => {
        const ta = trackAudioMapRef.current.get(track.id);
        if (!ta) return;
        const inRange = t >= track.timelineStart && t < track.timelineEnd;

        if (!inRange) {
          if (!ta.el.paused) ta.el.pause();
          ta.gain.gain.value = 0;
          return;
        }

        // Compute desired position within source audio
        const elapsed = t - track.timelineStart;
        const sourceLen = Math.max(0.01, track.duration - track.clipStart);
        const desired = track.loop
          ? track.clipStart + (elapsed % sourceLen)
          : track.clipStart + Math.min(elapsed, sourceLen);

        // Resync if drift > 150ms
        if (Math.abs(ta.el.currentTime - desired) > 0.15) {
          try {
            ta.el.currentTime = desired;
          } catch {}
        }

        // Compute volume with fades
        let vol = track.volume / 100;
        if (track.fadeIn > 0 && elapsed < track.fadeIn) {
          vol *= elapsed / track.fadeIn;
        }
        const remaining = track.timelineEnd - t;
        if (track.fadeOut > 0 && remaining < track.fadeOut) {
          vol *= Math.max(0, remaining / track.fadeOut);
        }
        ta.gain.gain.value = vol;

        if (playing && ta.el.paused) {
          audioCtxRef.current?.resume();
          ta.el.play().catch(() => {});
        }
      });
    };

    const onPlay = () => {
      audioCtxRef.current?.resume();
      updateTracks();
    };
    const onPause = () => {
      trackAudioMapRef.current.forEach((ta) => ta.el.pause());
    };
    const onSeek = () => updateTracks();
    const onLoaded = () => onDurationChange(videoEl.duration || 0);

    videoEl.addEventListener("play", onPlay);
    videoEl.addEventListener("pause", onPause);
    videoEl.addEventListener("seeked", onSeek);
    videoEl.addEventListener("timeupdate", updateTracks);
    videoEl.addEventListener("loadedmetadata", onLoaded);

    return () => {
      videoEl.removeEventListener("play", onPlay);
      videoEl.removeEventListener("pause", onPause);
      videoEl.removeEventListener("seeked", onSeek);
      videoEl.removeEventListener("timeupdate", updateTracks);
      videoEl.removeEventListener("loadedmetadata", onLoaded);
    };
  }, [videoEl, tracks, onTimeUpdate, onDurationChange]);

  // Handle external seek requests
  useEffect(() => {
    if (seekRequest === null || !videoEl) return;
    try {
      videoEl.currentTime = Math.max(0, Math.min(videoEl.duration || 0, seekRequest));
    } catch {}
  }, [seekRequest, videoEl]);

  return (
    <div className="rounded-2xl overflow-hidden shadow-elevated bg-black">
      <video
        ref={setVideoEl}
        src={videoUrl}
        controls
        className="w-full aspect-video"
        crossOrigin="anonymous"
      />
    </div>
  );
};
