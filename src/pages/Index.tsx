import { useState } from "react";
import {
  Film,
  Music,
  Gauge,
  Volume2,
  Sparkles,
  Download,
  Loader2,
  Wand2,
} from "lucide-react";
import { FileUpload } from "@/components/FileUpload";
import { ControlSlider } from "@/components/ControlSlider";
import { VideoPreview } from "@/components/VideoPreview";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { processVideo } from "@/lib/videoProcessor";
import { toast } from "sonner";

const Index = () => {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [speed, setSpeed] = useState(1);
  const [videoVolume, setVideoVolume] = useState(100);
  const [musicVolume, setMusicVolume] = useState(80);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState("");
  const [outputUrl, setOutputUrl] = useState<string | null>(null);

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
        audioFile,
        speed,
        videoVolume,
        musicVolume,
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
      <header className="border-b border-border/50 backdrop-blur-sm bg-background/80 sticky top-0 z-10">
        <div className="container max-w-7xl py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
              <Wand2 className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold gradient-text">VideoForge</h1>
              <p className="text-xs text-muted-foreground">
                Edit videos right in your browser
              </p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Powered by FFmpeg WebAssembly
          </div>
        </div>
      </header>

      <main className="container max-w-7xl py-8 md:py-12">
        <div className="text-center mb-10 md:mb-14 space-y-3">
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight">
            Speed up & remix your <span className="gradient-text">videos</span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Adjust playback speed, layer background music, and boost volume up to
            200% — all processed locally in your browser. No uploads required.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6 lg:gap-8">
          {/* Left: Uploads + Preview */}
          <section className="space-y-5">
            <div className="grid sm:grid-cols-2 gap-4">
              <FileUpload
                type="video"
                file={videoFile}
                onFileSelect={setVideoFile}
              />
              <FileUpload
                type="audio"
                file={audioFile}
                onFileSelect={setAudioFile}
              />
            </div>

            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                <Film className="h-4 w-4" />
                Live Preview
              </h3>
              <VideoPreview
                videoFile={videoFile}
                audioFile={audioFile}
                speed={speed}
                videoVolume={videoVolume}
                musicVolume={musicVolume}
              />
            </div>
          </section>

          {/* Right: Controls */}
          <section className="space-y-5">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Editing Controls
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
              label="Original Video Audio"
              value={videoVolume}
              onChange={setVideoVolume}
              min={0}
              max={200}
              step={1}
              unit="%"
              warning={videoVolume > 100}
            />

            <ControlSlider
              icon={Music}
              label="Background Music"
              value={musicVolume}
              onChange={setMusicVolume}
              min={0}
              max={200}
              step={1}
              unit="%"
              warning={musicVolume > 100}
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
                    Process Video
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

              {(videoVolume > 100 || musicVolume > 100) && !outputUrl && (
                <p className="text-xs text-muted-foreground flex items-start gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-accent shrink-0 mt-0.5" />
                  Boosted volume will be normalized during export to prevent
                  clipping.
                </p>
              )}
            </div>
          </section>
        </div>

        <footer className="mt-16 text-center text-xs text-muted-foreground">
          All processing happens in your browser. Files never leave your device.
        </footer>
      </main>
    </div>
  );
};

export default Index;
