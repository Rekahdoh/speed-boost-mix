import { useEffect, useMemo, useRef, useState } from "react";
import { MediaClip, clipLength, totalDuration, resolveTime } from "@/types/clip";
import { MusicTrack } from "@/types/music";

interface MultiClipPreviewProps {
  clips: MediaClip[];
  musicTracks: MusicTrack[];
  speed: number;
  videoVolume: number;
  onTimeUpdate: (currentTime: number) => void;
  onDurationChange: (duration: number) => void;
  seekRequest: number | null;
}

interface TrackAudio {
  id: string;
  el: HTMLAudioElement;
  url: string;
  src: MediaElementAudioSourceNode;
  gain: GainNode;
}

export const MultiClipPreview = ({
  clips,
  musicTracks,
  speed,
  videoVolume,
  onTimeUpdate,
  onDurationChange,
  seekRequest,
}: MultiClipPreviewProps) => {
  const totalDur = useMemo(() => totalDuration(clips), [clips]);

  const [activeIndex, setActiveIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [timelineTime, setTimelineTime] = useState(0);

  // Two video elements for video clips (only the active one is shown)
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const videoGainRef = useRef<GainNode | null>(null);
  const videoConnectedRef = useRef<HTMLVideoElement | null>(null);
  const trackAudioMapRef = useRef<Map<string, TrackAudio>>(new Map());
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);

  // Notify parent about duration
  useEffect(() => {
    onDurationChange(totalDur);
  }, [totalDur, onDurationChange]);

  // Init audio context lazily
  const ensureCtx = () => {
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
    return audioCtxRef.current;
  };

  // Connect video element to gain node
  useEffect(() => {
    if (!videoEl) return;
    if (videoConnectedRef.current === videoEl) return;
    const ctx = ensureCtx();
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

  useEffect(() => {
    if (videoGainRef.current) videoGainRef.current.gain.value = videoVolume / 100;
  }, [videoVolume]);

  useEffect(() => {
    if (videoEl) videoEl.playbackRate = speed;
    // Music tracks always play at 1x — speed only affects the video.
    trackAudioMapRef.current.forEach((t) => (t.el.playbackRate = 1));
  }, [speed, videoEl]);

  // Manage music audio elements
  useEffect(() => {
    const ctx = ensureCtx();
    const map = trackAudioMapRef.current;
    const currentIds = new Set(musicTracks.map((t) => t.id));
    map.forEach((ta, id) => {
      if (!currentIds.has(id)) {
        ta.el.pause();
        try { ta.src.disconnect(); ta.gain.disconnect(); } catch {}
        URL.revokeObjectURL(ta.url);
        map.delete(id);
      }
    });
    musicTracks.forEach((t) => {
      if (map.has(t.id)) return;
      const url = URL.createObjectURL(t.file);
      const el = new Audio(url);
      el.crossOrigin = "anonymous";
      el.preload = "auto";
      el.playbackRate = 1; // music never affected by speed
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
  }, [musicTracks, speed]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      trackAudioMapRef.current.forEach((ta) => {
        ta.el.pause();
        try { ta.src.disconnect(); ta.gain.disconnect(); } catch {}
        URL.revokeObjectURL(ta.url);
      });
      trackAudioMapRef.current.clear();
    };
  }, []);

  // The active clip & video element src management
  const activeClip = clips[activeIndex];

  useEffect(() => {
    if (!videoEl || !activeClip) return;
    if (activeClip.kind !== "video") {
      videoEl.pause();
      return;
    }
    if (videoEl.src !== activeClip.url) {
      videoEl.src = activeClip.url;
      videoEl.load();
    }
  }, [activeClip, videoEl]);

  // Update music gains based on timeline time
  const applyMusic = (t: number) => {
    musicTracks.forEach((track) => {
      const ta = trackAudioMapRef.current.get(track.id);
      if (!ta) return;
      const inRange = t >= track.timelineStart && t < track.timelineEnd;
      if (!inRange) {
        if (!ta.el.paused) ta.el.pause();
        ta.gain.gain.value = 0;
        return;
      }
      const elapsed = t - track.timelineStart;
      const sourceLen = Math.max(0.01, track.duration - track.clipStart);
      const desired = track.loop
        ? track.clipStart + (elapsed % sourceLen)
        : track.clipStart + Math.min(elapsed, sourceLen);
      if (Math.abs(ta.el.currentTime - desired) > 0.15) {
        try { ta.el.currentTime = desired; } catch {}
      }
      let vol = track.volume / 100;
      if (track.fadeIn > 0 && elapsed < track.fadeIn) vol *= elapsed / track.fadeIn;
      const remaining = track.timelineEnd - t;
      if (track.fadeOut > 0 && remaining < track.fadeOut) {
        vol *= Math.max(0, remaining / track.fadeOut);
      }
      ta.gain.gain.value = vol;
      if (playing && ta.el.paused) {
        audioCtxRef.current?.resume();
        ta.el.play().catch(() => {});
      } else if (!playing && !ta.el.paused) {
        ta.el.pause();
      }
    });
  };

  // Seek to a specific timeline time
  const seekTo = (t: number) => {
    const clamped = Math.max(0, Math.min(totalDur, t));
    setTimelineTime(clamped);
    const r = resolveTime(clips, clamped);
    if (!r) return;
    setActiveIndex(r.index);
    if (videoEl && r.clip.kind === "video") {
      const target = r.clip.clipStart + r.localTime;
      try { videoEl.currentTime = target; } catch {}
    }
    applyMusic(clamped);
    onTimeUpdate(clamped);
  };

  // External seek requests
  useEffect(() => {
    if (seekRequest === null) return;
    seekTo(seekRequest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekRequest]);

  // RAF playback loop
  useEffect(() => {
    if (!playing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      videoEl?.pause();
      trackAudioMapRef.current.forEach((ta) => ta.el.pause());
      return;
    }
    audioCtxRef.current?.resume();
    lastTickRef.current = performance.now();
    const tick = () => {
      const now = performance.now();
      const dt = ((now - lastTickRef.current) / 1000) * speed;
      lastTickRef.current = now;
      let nextT = timelineTimeRef.current + dt;
      if (nextT >= totalDur) {
        nextT = totalDur;
        setTimelineTime(nextT);
        setPlaying(false);
        onTimeUpdate(nextT);
        return;
      }
      const r = resolveTime(clips, nextT);
      if (r) {
        if (r.index !== activeIndexRef.current) {
          setActiveIndex(r.index);
          // when clip changes, set video element to start of new clip
          if (videoEl && r.clip.kind === "video") {
            videoEl.src = r.clip.url;
            videoEl.load();
            const onCanPlay = () => {
              try { videoEl.currentTime = r.clip.clipStart + r.localTime; } catch {}
              videoEl.play().catch(() => {});
              videoEl.removeEventListener("canplay", onCanPlay);
            };
            videoEl.addEventListener("canplay", onCanPlay);
          }
        } else if (videoEl && r.clip.kind === "video") {
          // ensure video is playing
          if (videoEl.paused) videoEl.play().catch(() => {});
          // drift correction
          const target = r.clip.clipStart + r.localTime;
          if (Math.abs(videoEl.currentTime - target) > 0.3) {
            try { videoEl.currentTime = target; } catch {}
          }
        } else if (r.clip.kind === "image") {
          if (videoEl && !videoEl.paused) videoEl.pause();
        }
      }
      timelineTimeRef.current = nextT;
      setTimelineTime(nextT);
      onTimeUpdate(nextT);
      applyMusic(nextT);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, speed, clips, totalDur]);

  // refs for current values inside RAF
  const timelineTimeRef = useRef(timelineTime);
  const activeIndexRef = useRef(activeIndex);
  useEffect(() => { timelineTimeRef.current = timelineTime; }, [timelineTime]);
  useEffect(() => { activeIndexRef.current = activeIndex; }, [activeIndex]);

  const togglePlay = () => {
    if (!clips.length) return;
    if (timelineTime >= totalDur - 0.05) seekTo(0);
    setPlaying((p) => !p);
  };

  if (!clips.length) {
    return (
      <div className="aspect-video rounded-2xl border border-dashed border-border flex items-center justify-center text-sm text-muted-foreground bg-secondary/30">
        Add a video or image clip to begin
      </div>
    );
  }

  const showImage = activeClip?.kind === "image";

  return (
    <div className="space-y-2">
      <div className="rounded-2xl overflow-hidden shadow-elevated bg-black aspect-video relative">
        <video
          ref={setVideoEl}
          className="w-full h-full object-contain"
          crossOrigin="anonymous"
          style={{ display: showImage ? "none" : "block" }}
          playsInline
        />
        {showImage && activeClip && (
          <img
            src={activeClip.url}
            alt={activeClip.name}
            className="w-full h-full object-contain"
          />
        )}
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={togglePlay}
          className="px-4 py-2 rounded-lg gradient-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-smooth"
        >
          {playing ? "Pause" : "Play"}
        </button>
        <span className="text-xs text-muted-foreground tabular-nums">
          {timelineTime.toFixed(2)}s / {totalDur.toFixed(2)}s
        </span>
      </div>
    </div>
  );
};
