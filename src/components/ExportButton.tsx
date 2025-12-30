import { useState, useEffect } from 'react'

interface ExportButtonProps {
  onExport: () => Promise<void>
  isExporting: boolean
  progress: number
  onCancel: () => void
}

export function ExportButton({
  onExport,
  isExporting,
  progress,
  onCancel
}: ExportButtonProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [dots, setDots] = useState('')

  // Animate dots while waiting for server
  useEffect(() => {
    if (!isExporting) return
    const interval = setInterval(() => {
      setDots(d => d.length >= 3 ? '' : d + '.')
    }, 500)
    return () => clearInterval(interval)
  }, [isExporting])

  const percentage = Math.round(progress * 100)

  // Determine status message based on progress
  const getStatusMessage = () => {
    if (progress < 0.15) return 'Preparing video'
    if (progress < 0.25) return 'Uploading to server'
    if (progress < 0.85) return 'Rendering on server'
    if (progress < 1) return 'Downloading result'
    return 'Complete!'
  }

  if (isExporting) {
    const isWaitingForServer = progress >= 0.25 && progress < 0.85

    return (
      <div className="flex items-center gap-3">
        {/* Compact progress indicator */}
        <div className="relative w-10 h-10 flex-shrink-0">
          {isWaitingForServer ? (
            <div className="w-full h-full rounded-full border-2 border-[#FFD700]/30 border-t-[#FFD700] animate-spin" />
          ) : (
            <svg className="w-full h-full -rotate-90">
              <circle cx="20" cy="20" r="16" fill="none" stroke="#262626" strokeWidth="3" />
              <circle
                cx="20" cy="20" r="16" fill="none"
                stroke="#FFD700" strokeWidth="3" strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 16}
                strokeDashoffset={2 * Math.PI * 16 * (1 - progress)}
                className="transition-all duration-200"
              />
            </svg>
          )}
          {!isWaitingForServer && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[10px] font-semibold text-white tabular-nums">{percentage}%</span>
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-xs text-white font-medium truncate" style={{ fontFamily: 'Outfit, system-ui, sans-serif' }}>
            {getStatusMessage()}{isWaitingForServer ? dots : ''}
          </p>
          <p className="text-[10px] text-neutral-500 truncate">
            {isWaitingForServer ? '~30-60s' : 'Please wait'}
          </p>
        </div>

        <button
          onClick={onCancel}
          className="px-2 py-1 rounded text-[10px] text-neutral-500 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
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
        relative px-5 py-2.5 rounded-xl
        bg-gradient-to-r from-[#FFD700] to-[#FF4500]
        text-black font-semibold text-sm
        flex items-center gap-2
        shadow-md shadow-[#FFD700]/20
        hover:shadow-lg hover:shadow-[#FFD700]/30
        active:scale-[0.98] transition-all duration-200
        overflow-hidden
      "
      style={{ fontFamily: 'Outfit, system-ui, sans-serif' }}
    >
      {/* Shine effect */}
      <div
        className={`
          absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent
          transition-transform duration-500
          ${isHovered ? 'translate-x-full' : '-translate-x-full'}
        `}
        style={{ transform: isHovered ? 'translateX(100%)' : 'translateX(-100%)' }}
      />

      <svg className="w-4 h-4 relative z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
      <span className="relative z-10">Export</span>
    </button>
  )
}
