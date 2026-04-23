import { useRef, useState } from "react";
import { Upload, X, FileVideo, FileAudio } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileUploadProps {
  type: "video" | "audio";
  file: File | null;
  onFileSelect: (file: File | null) => void;
}

export const FileUpload = ({ type, file, onFileSelect }: FileUploadProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const accept = type === "video" ? "video/*" : "audio/*";
  const Icon = type === "video" ? FileVideo : FileAudio;
  const label = type === "video" ? "Video File" : "Background Music";
  const hint = type === "video" ? "MP4, WebM, MOV up to ~500MB" : "MP3, WAV, M4A";

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFileSelect(f);
  };

  if (file) {
    return (
      <div className="gradient-card rounded-2xl p-5 shadow-soft border border-border flex items-center gap-4 transition-smooth">
        <div className="h-12 w-12 rounded-xl gradient-primary flex items-center justify-center shrink-0 shadow-glow">
          <Icon className="h-6 w-6 text-primary-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-foreground truncate">{file.name}</p>
          <p className="text-sm text-muted-foreground">
            {(file.size / 1024 / 1024).toFixed(2)} MB
          </p>
        </div>
        <button
          onClick={() => onFileSelect(null)}
          className="h-9 w-9 rounded-lg hover:bg-secondary flex items-center justify-center transition-smooth"
          aria-label="Remove file"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
    );
  }

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={cn(
        "relative rounded-2xl border-2 border-dashed p-8 cursor-pointer transition-smooth",
        "flex flex-col items-center justify-center text-center gap-3 min-h-[180px]",
        dragOver
          ? "border-primary bg-primary/5 scale-[1.02]"
          : "border-border hover:border-primary/50 hover:bg-secondary/50"
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFileSelect(f);
        }}
      />
      <div className="h-14 w-14 rounded-2xl gradient-primary flex items-center justify-center shadow-glow">
        <Upload className="h-7 w-7 text-primary-foreground" />
      </div>
      <div>
        <p className="font-semibold text-foreground">{label}</p>
        <p className="text-sm text-muted-foreground mt-1">
          Drag & drop or click to browse
        </p>
        <p className="text-xs text-muted-foreground mt-1">{hint}</p>
      </div>
    </div>
  );
};
