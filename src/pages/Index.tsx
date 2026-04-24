import { useCallback, useEffect, useRef, useState } from "react";
import {
  Music,
  Gauge,
  Volume2,
  Sparkles,
  Download,
  Loader2,
  Wand2,
  Plus,
  Film,
  Image as ImageIcon,
} from "lucide-react";
import { ControlSlider } from "@/components/ControlSlider";
import { MultiClipPreview } from "@/components/MultiClipPreview";
import { Timeline } from "@/components/Timeline";
import { TrackEditor } from "@/components/TrackEditor";
import { ClipEditor } from "@/components/ClipEditor";
import { ExportSettings } from "@/components/ExportSettings";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  processVideo,
  extractAudioFromVideo,
  QualityPreset,
  QualitySettings,
  QUALITY_PRESETS,
  resetFFmpeg,
} from "@/lib/videoProcessor";
import { MusicTrack, createMusicTrack } from "@/types/music";
import {
  MediaClip,
  clipLength,
  createImageClip,
  createVideoClip,
  totalDuration,
} from "@/types/clip";
import { getMediaDuration } from "@/lib/mediaUtils";
import { toast } from "sonner";

const Index = () => {
  const [clips, setClips] = useState<MediaClip[]>([]);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);

  const [videoDuration, setVideoDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [seekRequest, setSeekRequest] = useState<number | null>(null);

  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);

  const [speed, setSpeed] = useState(1);
  const [videoVolume, setVideoVolume] = useState(100);

  const [processing, setProcessing] = useState(false);
  const [extractingClipId, setExtractingClipId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState("");
  const [outputUrl, setOutputUrl] = useState<string | null>(null);

  const [qualityPreset, setQualityPreset] = useState<QualityPreset>("medium");
  const [customQuality, setCustomQuality] = useState<QualitySettings>({
    height: 540,
    videoBitrateKbps: 1200,
    audioBitrateKbps: 128,
    fps: 30,
  });

  const musicInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);

  // Cleanup clip URLs on unmount
  useEffect(() => {
    return () => {
      clips.forEach((c) => URL.revokeObjectURL(c.url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAddMedia = async (files: FileList | null) => {
    if (!files) return;
    const newClips: MediaClip[] = [];
    for (const file of Array.from(files)) {
      try {
        if (file.type.startsWith("video/")) {
          const dur = await getMediaDuration(file, "video");
          newClips.push(createVideoClip(file, dur));
        } else if (file.type.startsWith("image/")) {
          newClips.push(createImageClip(file, 3));
        } else {
          toast.error(`Unsupported file: ${file.name}`);
        }
      } catch {
        toast.error(`Could not read ${file.name}`);
      }
    }
    if (newClips.length) {
      setClips((prev) => [...prev, ...newClips]);
      setSelectedClipId(newClips[0].id);
      toast.success(`Added ${newClips.length} clip${newClips.length > 1 ? "s" : ""}`);
    }
  };

  const handleAddMusic = async (files: FileList | null) => {
    if (!files) return;
    if (clips.length === 0) {
      toast.error("Add a video or image first");
      return;
    }
    const newTracks: MusicTrack[] = [];
    const dur = totalDuration(clips);
    for (const file of Array.from(files)) {
      try {
        const d = await getMediaDuration(file, "audio");
        newTracks.push(createMusicTrack(file, d, dur));
      } catch {
        toast.error(`Could not read ${file.name}`);
      }
    }
    if (newTracks.length) {
      setTracks((prev) => [...prev, ...newTracks]);
      setSelectedTrackId(newTracks[0].id);
      toast.success(`Added ${newTracks.length} track${newTracks.length > 1 ? "s" : ""}`);
    }
  };

  const updateClip = useCallback((id: string, patch: Partial<MediaClip>) => {
    setClips((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);

  const removeClip = useCallback((id: string) => {
    setClips((prev) => {
      const found = prev.find((c) => c.id === id);
      if (found) URL.revokeObjectURL(found.url);
      return prev.filter((c) => c.id !== id);
    });
    setSelectedClipId((cur) => (cur === id ? null : cur));
  }, []);

  const splitClip = useCallback((id: string, atLocalTime: number) => {
    setClips((prev) => {
      const idx = prev.findIndex((c) => c.id === id);
      if (idx === -1) return prev;
      const c = prev[idx];
      const len = clipLength(c);
      if (atLocalTime <= 0.05 || atLocalTime >= len - 0.05) {
        toast.error("Move the playhead inside the clip to split");
        return prev;
      }
      let left: MediaClip;
      let right: MediaClip;
      if (c.kind === "video") {
        const splitAtSource = c.clipStart + atLocalTime;
        left = {
          ...c,
          id: crypto.randomUUID(),
          clipEnd: splitAtSource,
          displayDuration: splitAtSource - c.clipStart,
        };
        right = {
          ...c,
          id: crypto.randomUUID(),
          clipStart: splitAtSource,
          displayDuration: c.clipEnd - splitAtSource,
        };
      } else {
        left = {
          ...c,
          id: crypto.randomUUID(),
          displayDuration: atLocalTime,
          clipEnd: atLocalTime,
        };
        right = {
          ...c,
          id: crypto.randomUUID(),
          displayDuration: len - atLocalTime,
          clipEnd: len - atLocalTime,
        };
      }
      const next = [...prev];
      next.splice(idx, 1, left, right);
      return next;
    });
    toast.success("Clip split");
  }, []);

  const handleExtractAudio = useCallback(
    async (clip: MediaClip) => {
      if (clip.kind !== "video") return;
      setExtractingClipId(clip.id);
      try {
        toast.info("Extracting audio... this may take a moment");
        const audioFile = await extractAudioFromVideo(clip.file);
        const dur = await getMediaDuration(audioFile, "audio");
        const total = totalDuration(clips);
        // Place the new track aligned with the clip's position on the timeline
        let acc = 0;
        for (const c of clips) {
          if (c.id === clip.id) break;
          acc += clipLength(c);
        }
        const start = acc;
        const end = Math.min(total, start + Math.min(dur, clipLength(clip)));
        const track = createMusicTrack(audioFile, dur, total);
        track.timelineStart = start;
        track.timelineEnd = end;
        track.volume = 100;
        track.loop = false;
        setTracks((prev) => [...prev, track]);
        setSelectedTrackId(track.id);
        toast.success("Audio extracted and added as track");
      } catch (err) {
        console.error(err);
        toast.error("Could not extract audio (clip may have no audio)");
      } finally {
        setExtractingClipId(null);
      }
    },
    [clips]
  );

  const updateTrack = useCallback((id: string, patch: Partial<MusicTrack>) => {
    setTracks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const removeTrack = useCallback((id: string) => {
    setTracks((prev) => prev.filter((t) => t.id !== id));
    setSelectedTrackId((cur) => (cur === id ? null : cur));
  }, []);

  const handleSeek = useCallback((time: number) => {
    setSeekRequest(time);
    setTimeout(() => setSeekRequest(null), 50);
  }, []);

  const selectedTrack = tracks.find((t) => t.id === selectedTrackId) ?? null;
  const selectedClip = clips.find((c) => c.id === selectedClipId) ?? null;

  // Determine if playhead is inside selected clip (for split button)
  const playheadInfo = (() => {
    let acc = 0;
    for (let i = 0; i < clips.length; i++) {
      const len = clipLength(clips[i]);
      if (currentTime >= acc && currentTime < acc + len) {
        return { clip: clips[i], localTime: currentTime - acc };
      }
      acc += len;
    }
    return null;
  })();

  const canSplitSelected =
    !!selectedClip && playheadInfo?.clip.id === selectedClip.id;

  const handleProcess = async () => {
    if (clips.length === 0) {
      toast.error("Add at least one video or image clip");
      return;
    }
    setProcessing(true);
    setProgress(0);
    setStatusMsg("Loading FFmpeg engine...");
    setOutputUrl(null);

    try {
      const activeQuality =
        qualityPreset === "original" ? customQuality : QUALITY_PRESETS[qualityPreset];
      const blob = await processVideo({
        clips,
        tracks,
        speed,
        videoVolume,
        quality: activeQuality,
        onProgress: (r) => {
          setProgress(Math.round(r * 100));
          setStatusMsg("Encoding video...");
        },
      });
      const url = URL.createObjectURL(blob);
      setOutputUrl(url);
      setProgress(100);
      setStatusMsg("Done!");
      toast.success("Video processed successfully");
    } catch (err) {
      console.error("Export failed:", err);
      const raw = err instanceof Error ? err.message : String(err);
      const isMemory =
        /memory|allocation|out of memory|abort|killed|RangeError|maximum/i.test(raw);
      const isUnsupported = /Invalid data|moov atom|codec|unsupported/i.test(raw);

      // Reset FFmpeg so the next try starts fresh (memory may be poisoned)
      resetFFmpeg();

      if (isMemory) {
        toast.error(
          "Out of memory. Lower the export quality (try Low/360p), trim clips, or split into smaller exports."
        );
      } else if (isUnsupported) {
        toast.error(
          `Unsupported source media. ${raw.slice(0, 140)}`
        );
      } else {
        toast.error(`Export failed: ${raw.slice(0, 200)}`);
      }
    } finally {
      setProcessing(false);
    }
  };

  const handleDownload = () => {
    if (!outputUrl) return;
    const a = document.createElement("a");
    a.href = outputUrl;
    a.download = `edited-${Date.now()}.mp4`;
    a.click();
  };

  const empty = clips.length === 0;

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/50 backdrop-blur-sm bg-background/80 sticky top-0 z-20">
        <div className="container py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
              <Wand2 className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold gradient-text">VideoForge</h1>
              <p className="text-xs text-muted-foreground hidden sm:block">
                Multi-track video editor in your browser
              </p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            FFmpeg WebAssembly
          </div>
        </div>
      </header>

      <input
        ref={mediaInputRef}
        type="file"
        accept="video/*,image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          handleAddMedia(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={musicInputRef}
        type="file"
        accept="audio/*"
        multiple
        className="hidden"
        onChange={(e) => {
          handleAddMusic(e.target.files);
          e.target.value = "";
        }}
      />

      <main className="container py-6 md:py-10 space-y-6">
        {empty ? (
          <>
            <div className="text-center mb-8 space-y-3">
              <h2 className="text-3xl md:text-5xl font-bold tracking-tight">
                Multi-track video <span className="gradient-text">editor</span>
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Add videos, images, and music. Trim, split, and arrange clips on
                a timeline — just like InShot, but in your browser.
              </p>
            </div>
            <div className="max-w-xl mx-auto">
              <button
                onClick={() => mediaInputRef.current?.click()}
                className="w-full rounded-2xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-secondary/50 p-10 flex flex-col items-center gap-3 transition-smooth"
              >
                <div className="h-14 w-14 rounded-2xl gradient-primary flex items-center justify-center shadow-glow">
                  <Plus className="h-7 w-7 text-primary-foreground" />
                </div>
                <div>
                  <p className="font-semibold">Add videos or images</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    MP4, WebM, MOV, JPG, PNG, WebP
                  </p>
                </div>
              </button>
            </div>
          </>
        ) : (
          <div className="grid lg:grid-cols-[1fr_360px] gap-6">
            {/* LEFT: Preview + Timeline */}
            <div className="space-y-4 min-w-0">
              <MultiClipPreview
                clips={clips}
                musicTracks={tracks}
                speed={speed}
                videoVolume={videoVolume}
                onTimeUpdate={setCurrentTime}
                onDurationChange={setVideoDuration}
                seekRequest={seekRequest}
              />

              <div className="flex items-center justify-between gap-3 flex-wrap">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <Film className="h-4 w-4" />
                  Timeline
                </h3>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => mediaInputRef.current?.click()}
                  >
                    <ImageIcon className="h-4 w-4 mr-1" />
                    Add Media
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => musicInputRef.current?.click()}
                    className="gradient-primary text-primary-foreground border-0 hover:opacity-90"
                  >
                    <Music className="h-4 w-4 mr-1" />
                    Add Music
                  </Button>
                </div>
              </div>

              <Timeline
                clips={clips}
                selectedClipId={selectedClipId}
                onSelectClip={setSelectedClipId}
                onUpdateClip={updateClip}
                onRemoveClip={removeClip}
                onSplitClip={splitClip}
                currentTime={currentTime}
                tracks={tracks}
                selectedTrackId={selectedTrackId}
                onSelectTrack={setSelectedTrackId}
                onUpdateTrack={updateTrack}
                onRemoveTrack={removeTrack}
                onSeek={handleSeek}
              />
            </div>

            {/* RIGHT: Controls */}
            <aside className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                Global
              </h3>

              <ControlSlider
                icon={Gauge}
                label="Playback Speed"
                value={speed}
                onChange={setSpeed}
                min={0.25}
                max={3}
                step={0.05}
                unit="x"
              />

              <ControlSlider
                icon={Volume2}
                label="Original Audio"
                value={videoVolume}
                onChange={setVideoVolume}
                min={0}
                max={200}
                step={1}
                unit="%"
                warning={videoVolume > 100}
              />

              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2 pt-2">
                <Film className="h-4 w-4" />
                Selected Clip
              </h3>

              <ClipEditor
                clip={selectedClip}
                onUpdate={(patch) =>
                  selectedClip && updateClip(selectedClip.id, patch)
                }
                onSplit={() => {
                  if (selectedClip && playheadInfo?.clip.id === selectedClip.id) {
                    splitClip(selectedClip.id, playheadInfo.localTime);
                  }
                }}
                canSplit={canSplitSelected}
                onExtractAudio={
                  selectedClip ? () => handleExtractAudio(selectedClip) : undefined
                }
                extracting={extractingClipId === selectedClip?.id}
              />

              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2 pt-2">
                <Music className="h-4 w-4" />
                Selected Track
              </h3>

              <TrackEditor
                track={selectedTrack}
                videoDuration={videoDuration}
                onUpdate={(patch) =>
                  selectedTrack && updateTrack(selectedTrack.id, patch)
                }
              />

              <ExportSettings
                preset={qualityPreset}
                custom={customQuality}
                onPresetChange={setQualityPreset}
                onCustomChange={setCustomQuality}
                durationSec={totalDuration(clips) / Math.max(0.01, speed)}
                hasAudio={tracks.length > 0 || videoVolume > 0}
              />

              <div className="gradient-card rounded-2xl p-5 shadow-soft border border-border space-y-4">
                {processing && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        {statusMsg}
                      </span>
                      <span className="font-medium tabular-nums">{progress}%</span>
                    </div>
                    <Progress value={progress} />
                  </div>
                )}

                <Button
                  onClick={handleProcess}
                  disabled={empty || processing}
                  size="lg"
                  className="w-full gradient-primary text-primary-foreground hover:opacity-90 shadow-glow border-0 h-12 text-base font-semibold"
                >
                  {processing ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Wand2 className="mr-2 h-5 w-5" />
                      Export Video
                    </>
                  )}
                </Button>

                {outputUrl && (
                  <div className="space-y-3 pt-2 border-t border-border">
                    <video
                      src={outputUrl}
                      controls
                      className="w-full rounded-xl bg-black"
                    />
                    <Button
                      onClick={handleDownload}
                      variant="outline"
                      size="lg"
                      className="w-full h-12 border-primary/30 hover:bg-primary/5"
                    >
                      <Download className="mr-2 h-5 w-5" />
                      Download MP4
                    </Button>
                  </div>
                )}
              </div>
            </aside>
          </div>
        )}

        <footer className="text-center text-xs text-muted-foreground pt-4">
          All processing happens in your browser. Files never leave your device.
        </footer>
      </main>
    </div>
  );
};

export default Index;
