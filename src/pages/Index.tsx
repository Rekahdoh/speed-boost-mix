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
  X,
} from "lucide-react";
import { FileUpload } from "@/components/FileUpload";
import { ControlSlider } from "@/components/ControlSlider";
import { MultiTrackPreview } from "@/components/MultiTrackPreview";
import { Timeline } from "@/components/Timeline";
import { TrackEditor } from "@/components/TrackEditor";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { processVideo } from "@/lib/videoProcessor";
import { MusicTrack, createMusicTrack } from "@/types/music";
import { getMediaDuration } from "@/lib/mediaUtils";
import { toast } from "sonner";

const Index = () => {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [seekRequest, setSeekRequest] = useState<number | null>(null);

  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);

  const [speed, setSpeed] = useState(1);
  const [videoVolume, setVideoVolume] = useState(100);

  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState("");
  const [outputUrl, setOutputUrl] = useState<string | null>(null);

  const musicInputRef = useRef<HTMLInputElement>(null);

  // Reset when video changes
  useEffect(() => {
    if (!videoFile) {
      setTracks([]);
      setSelectedTrackId(null);
      setVideoDuration(0);
      setCurrentTime(0);
      setOutputUrl(null);
    }
  }, [videoFile]);

  const handleAddMusic = async (files: FileList | null) => {
    if (!files || !videoFile) {
      if (!videoFile) toast.error("Upload a video first");
      return;
    }
    const newTracks: MusicTrack[] = [];
    for (const file of Array.from(files)) {
      try {
        const dur = await getMediaDuration(file, "audio");
        newTracks.push(createMusicTrack(file, dur, videoDuration));
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

  const updateTrack = useCallback((id: string, patch: Partial<MusicTrack>) => {
    setTracks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const removeTrack = useCallback((id: string) => {
    setTracks((prev) => prev.filter((t) => t.id !== id));
    setSelectedTrackId((cur) => (cur === id ? null : cur));
  }, []);

  const handleSeek = useCallback((time: number) => {
    setSeekRequest(time);
    // clear shortly after to allow re-seeking same value
    setTimeout(() => setSeekRequest(null), 50);
  }, []);

  const selectedTrack = tracks.find((t) => t.id === selectedTrackId) ?? null;

  const handleProcess = async () => {
    if (!videoFile) {
      toast.error("Please upload a video first");
      return;
    }
    setProcessing(true);
    setProgress(0);
    setStatusMsg("Loading FFmpeg engine...");
    setOutputUrl(null);

    try {
      const blob = await processVideo({
        videoFile,
        tracks,
        speed,
        videoVolume,
        videoDuration,
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
      console.error(err);
      toast.error("Processing failed. Try a smaller file or different format.");
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

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/50 backdrop-blur-sm bg-background/80 sticky top-0 z-20">
        <div className="container max-w-7xl py-4 flex items-center justify-between">
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

      <main className="container max-w-7xl py-6 md:py-10 space-y-6">
        {!videoFile ? (
          <>
            <div className="text-center mb-8 space-y-3">
              <h2 className="text-3xl md:text-5xl font-bold tracking-tight">
                Multi-track video <span className="gradient-text">editor</span>
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Add multiple music layers, place them anywhere on the timeline,
                trim, fade, and boost — just like InShot, but in your browser.
              </p>
            </div>
            <div className="max-w-xl mx-auto">
              <FileUpload type="video" file={videoFile} onFileSelect={setVideoFile} />
            </div>
          </>
        ) : (
          <div className="grid lg:grid-cols-[1fr_360px] gap-6">
            {/* LEFT: Preview + Timeline */}
            <div className="space-y-4 min-w-0">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg gradient-primary flex items-center justify-center shrink-0">
                  <Film className="h-4 w-4 text-primary-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{videoFile.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(videoFile.size / 1024 / 1024).toFixed(1)} MB
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setVideoFile(null)}
                >
                  <X className="h-4 w-4 mr-1" />
                  Change
                </Button>
              </div>

              <MultiTrackPreview
                videoFile={videoFile}
                tracks={tracks}
                speed={speed}
                videoVolume={videoVolume}
                onTimeUpdate={setCurrentTime}
                onDurationChange={setVideoDuration}
                seekRequest={seekRequest}
              />

              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <Music className="h-4 w-4" />
                  Timeline
                </h3>
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
                <Button
                  size="sm"
                  onClick={() => musicInputRef.current?.click()}
                  className="gradient-primary text-primary-foreground border-0 hover:opacity-90"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Music
                </Button>
              </div>

              <Timeline
                videoDuration={videoDuration}
                currentTime={currentTime}
                tracks={tracks}
                selectedId={selectedTrackId}
                onSelect={setSelectedTrackId}
                onUpdate={updateTrack}
                onRemove={removeTrack}
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
                  disabled={!videoFile || processing}
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
