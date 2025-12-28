import { useState } from 'react'

interface ExportButtonProps {
  onExport: () => Promise<void>
  isExporting: boolean
  progress: number
  downloadUrl: string | null
  onCancel: () => void
}

export function ExportButton({
  onExport,
  isExporting,
  progress,
  downloadUrl,
  onCancel
}: ExportButtonProps) {
  const [isHovered, setIsHovered] = useState(false)

  const percentage = Math.round(progress * 100)

  if (downloadUrl) {
    return (
      <div className="flex flex-col items-center gap-4">
        <a
          href={downloadUrl}
          download="traced-shot.mov"
          className="
            relative px-8 py-4 rounded-2xl
            bg-gradient-to-r from-[#FFD700] to-[#FF4500]
            text-black font-semibold text-lg
            flex items-center gap-3
            shadow-lg shadow-[#FFD700]/30
            hover:shadow-xl hover:shadow-[#FFD700]/40
            active:scale-95 transition-all duration-300
            touch-target
          "
          style={{ fontFamily: 'Outfit, system-ui, sans-serif' }}
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download Video
        </a>

        <p className="text-sm text-neutral-500">
          Your traced video is ready
        </p>
      </div>
    )
  }

  if (isExporting) {
    return (
      <div className="flex flex-col items-center gap-4">
        {/* Progress ring */}
        <div className="relative w-24 h-24">
          <svg className="w-full h-full -rotate-90">
            <circle
              cx="48"
              cy="48"
              r="42"
              fill="none"
              stroke="#262626"
              strokeWidth="6"
            />
            <circle
              cx="48"
              cy="48"
              r="42"
              fill="none"
              stroke="url(#exportGradient)"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 42}
              strokeDashoffset={2 * Math.PI * 42 * (1 - progress)}
              className="transition-all duration-200"
            />
            <defs>
              <linearGradient id="exportGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FFD700" />
                <stop offset="100%" stopColor="#FF4500" />
              </linearGradient>
            </defs>
          </svg>

          <div className="absolute inset-0 flex items-center justify-center">
            <span
              className="text-xl font-semibold text-white tabular-nums"
              style={{ fontFamily: 'Outfit, system-ui, sans-serif' }}
            >
              {percentage}%
            </span>
          </div>
        </div>

        <div className="text-center">
          <p
            className="text-white font-medium mb-1"
            style={{ fontFamily: 'Outfit, system-ui, sans-serif' }}
          >
            Rendering video...
          </p>
          <p className="text-sm text-neutral-500">
            This may take a moment
          </p>
        </div>

        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-lg text-sm text-neutral-400 hover:text-white hover:bg-white/10 transition-colors touch-target"
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={onExport}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="
        relative px-8 py-4 rounded-2xl
        bg-gradient-to-r from-[#FFD700] to-[#FF4500]
        text-black font-semibold text-lg
        flex items-center gap-3
        shadow-lg shadow-[#FFD700]/30
        hover:shadow-xl hover:shadow-[#FFD700]/40
        active:scale-95 transition-all duration-300
        touch-target overflow-hidden
      "
      style={{ fontFamily: 'Outfit, system-ui, sans-serif' }}
    >
      {/* Shine effect */}
      <div
        className={`
          absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent
          transition-transform duration-500
          ${isHovered ? 'translate-x-full' : '-translate-x-full'}
        `}
        style={{ transform: isHovered ? 'translateX(100%)' : 'translateX(-100%)' }}
      />

      <svg className="w-6 h-6 relative z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
      <span className="relative z-10">Export Video</span>
    </button>
  )
}
