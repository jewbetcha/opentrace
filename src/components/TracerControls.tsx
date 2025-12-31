/**
 * Shared UI components for tracer controls
 * Used by ManualTracerCreator and TraceEditor
 */

// === SHARED CONSTANTS ===

export const TRACER_COLORS = [
  { name: 'Blue', value: '#3B82F6' },
  { name: 'Red', value: '#EF4444' },
  { name: 'Green', value: '#22C55E' },
  { name: 'Yellow', value: '#EAB308' },
  { name: 'Purple', value: '#A855F7' },
  { name: 'Orange', value: '#F97316' },
  { name: 'White', value: '#FFFFFF' },
]

// === SHARED INTERFACES ===

export interface TracerParams {
  peakHeight: number   // 0-1
  curve: number        // -1 to 1
  ballSpeed: number    // 0.5-10
  hangtime: number     // 0-1
}

// === SLIDER COMPONENT ===

interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  formatValue?: (value: number) => string
}

export function TracerSlider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  formatValue
}: SliderProps) {
  const displayValue = formatValue ? formatValue(value) : String(value)

  return (
    <>
      <span className="text-white/50 font-medium">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1 bg-neutral-800 rounded-full appearance-none cursor-pointer"
      />
      <span className="text-white/70 tabular-nums w-8 text-right">{displayValue}</span>
    </>
  )
}

// === SLIDER GRID COMPONENT ===

interface SliderGridProps {
  params: TracerParams
  onParamChange: (key: keyof TracerParams, value: number) => void
}

export function TracerSliderGrid({ params, onParamChange }: SliderGridProps) {
  return (
    <div className="grid grid-cols-[auto_1fr_auto] gap-x-2 gap-y-1.5 items-center text-[11px]">
      <TracerSlider
        label="Height"
        value={params.peakHeight * 100}
        min={0}
        max={80}
        onChange={(v) => onParamChange('peakHeight', v / 100)}
        formatValue={(v) => `${Math.round(v)}%`}
      />
      <TracerSlider
        label="Curve"
        value={params.curve * 100}
        min={-100}
        max={100}
        onChange={(v) => onParamChange('curve', v / 100)}
        formatValue={(v) => {
          const rounded = Math.round(v)
          if (rounded > 0) return `+${rounded}`
          if (rounded < 0) return String(rounded)
          return '0'
        }}
      />
      <TracerSlider
        label="Speed"
        value={params.ballSpeed}
        min={0.5}
        max={10}
        step={0.5}
        onChange={(v) => onParamChange('ballSpeed', v)}
        formatValue={(v) => `${v.toFixed(1)}x`}
      />
      <TracerSlider
        label="Hang"
        value={params.hangtime * 100}
        min={0}
        max={100}
        onChange={(v) => onParamChange('hangtime', v / 100)}
        formatValue={(v) => `${Math.round(v)}%`}
      />
    </div>
  )
}

// === COLOR PICKER COMPONENT ===

interface ColorPickerProps {
  selectedColor: string
  onColorChange: (color: string) => void
}

export function ColorPicker({ selectedColor, onColorChange }: ColorPickerProps) {
  return (
    <div className="flex items-center gap-2 pt-0.5">
      <span className="text-[11px] text-white/50 font-medium">Color</span>
      <div className="flex gap-1.5 flex-1">
        {TRACER_COLORS.map((c) => (
          <button
            key={c.value}
            onClick={() => onColorChange(c.value)}
            className={`w-5 h-5 rounded-full transition-transform ${
              selectedColor === c.value
                ? 'ring-2 ring-white ring-offset-1 ring-offset-black scale-110'
                : 'opacity-50 hover:opacity-80'
            }`}
            style={{ backgroundColor: c.value }}
            title={c.name}
          />
        ))}
      </div>
    </div>
  )
}

// === ACTION BUTTONS COMPONENT ===

interface ActionButtonsProps {
  onReset: () => void
  onConfirm: () => void
  resetLabel?: string
  confirmLabel?: string
}

export function ActionButtons({
  onReset,
  onConfirm,
  resetLabel = 'Reset',
  confirmLabel = 'Done'
}: ActionButtonsProps) {
  return (
    <div className="flex gap-2 pt-1">
      <button
        onClick={onReset}
        className="flex-1 py-1.5 rounded-lg bg-white/5 text-white/70 text-[11px] font-medium hover:bg-white/10 transition-colors"
        style={{ fontFamily: 'Outfit, system-ui, sans-serif' }}
      >
        {resetLabel}
      </button>
      <button
        onClick={onConfirm}
        className="flex-1 py-1.5 rounded-lg bg-[#FFD700] text-black text-[11px] font-semibold hover:bg-[#FFD700]/90 transition-colors"
        style={{ fontFamily: 'Outfit, system-ui, sans-serif' }}
      >
        {confirmLabel}
      </button>
    </div>
  )
}

// === CONTROL PANEL WRAPPER ===

interface ControlPanelProps {
  children: React.ReactNode
}

export function ControlPanel({ children }: ControlPanelProps) {
  return (
    <div className="absolute bottom-0 left-0 right-0 z-30 bg-black/95 backdrop-blur-sm py-3 px-3 border-t border-white/5">
      <div className="max-w-sm mx-auto space-y-2">
        {children}
      </div>
    </div>
  )
}

// === SHARED SLIDER STYLES ===

export function SliderStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap');

      input[type="range"] {
        -webkit-appearance: none;
        appearance: none;
        background: #1a1a1a;
        border-radius: 9999px;
        height: 4px;
      }

      input[type="range"]::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: #FFD700;
        cursor: pointer;
        border: none;
        box-shadow: 0 1px 4px rgba(0,0,0,0.4);
      }

      input[type="range"]::-moz-range-thumb {
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: #FFD700;
        cursor: pointer;
        border: none;
        box-shadow: 0 1px 4px rgba(0,0,0,0.4);
      }
    `}</style>
  )
}
