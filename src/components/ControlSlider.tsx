import { Slider } from "@/components/ui/slider";
import { LucideIcon } from "lucide-react";

interface ControlSliderProps {
  icon: LucideIcon;
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  unit: string;
  warning?: boolean;
}

export const ControlSlider = ({
  icon: Icon,
  label,
  value,
  onChange,
  min,
  max,
  step,
  unit,
  warning,
}: ControlSliderProps) => {
  return (
    <div className="gradient-card rounded-2xl p-5 shadow-soft border border-border">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          <span className="font-medium text-foreground">{label}</span>
        </div>
        <div className="flex items-baseline gap-1">
          <span
            className={`text-2xl font-bold tabular-nums ${
              warning ? "text-accent" : "gradient-text"
            }`}
          >
            {value}
          </span>
          <span className="text-sm text-muted-foreground">{unit}</span>
        </div>
      </div>
      <Slider
        value={[value]}
        onValueChange={(v) => onChange(v[0])}
        min={min}
        max={max}
        step={step}
        className="w-full"
      />
      <div className="flex justify-between mt-2 text-xs text-muted-foreground">
        <span>
          {min}
          {unit}
        </span>
        <span>
          {max}
          {unit}
        </span>
      </div>
    </div>
  );
};
