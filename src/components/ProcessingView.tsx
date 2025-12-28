import { useMemo } from 'react'

type ProcessingStage = 'loading' | 'extracting' | 'detecting' | 'tracking' | 'complete'

interface ProcessingViewProps {
  stage: ProcessingStage
  progress: number
  total: number
  message?: string
}

const STAGES: { key: ProcessingStage; label: string; icon: string }[] = [
  { key: 'loading', label: 'Loading Model', icon: '⚡' },
  { key: 'extracting', label: 'Extracting Frames', icon: '🎬' },
  { key: 'detecting', label: 'Detecting Ball', icon: '🔍' },
  { key: 'tracking', label: 'Building Trajectory', icon: '📈' },
  { key: 'complete', label: 'Complete', icon: '✓' }
]

export function ProcessingView({ stage, progress, total, message }: ProcessingViewProps) {
  const percentage = total > 0 ? Math.round((progress / total) * 100) : 0
  const currentStageIndex = STAGES.findIndex(s => s.key === stage)

  const circumference = 2 * Math.PI * 54
  const strokeDashoffset = circumference - (percentage / 100) * circumference

  const displayMessage = useMemo(() => {
    if (message) return message
    const stageInfo = STAGES.find(s => s.key === stage)
    return stageInfo?.label || 'Processing...'
  }, [message, stage])

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#0a0a0a] px-6">
      {/* Ambient glow */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full opacity-20 blur-3xl pointer-events-none"
        style={{
          background: `radial-gradient(circle, #FFD700 0%, transparent 70%)`
        }}
      />

      {/* Circular progress */}
      <div className="relative w-36 h-36 mb-8">
        {/* Background track */}
        <svg className="absolute inset-0 w-full h-full -rotate-90">
          <circle
            cx="72"
            cy="72"
            r="54"
            fill="none"
            stroke="#262626"
            strokeWidth="8"
          />
          {/* Progress arc */}
          <circle
            cx="72"
            cy="72"
            r="54"
            fill="none"
            stroke="url(#progressGradient)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-300 ease-out"
          />
          <defs>
            <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FFD700" />
              <stop offset="100%" stopColor="#FF4500" />
            </linearGradient>
          </defs>
        </svg>

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="text-3xl font-semibold text-white tabular-nums"
            style={{ fontFamily: 'Outfit, system-ui, sans-serif' }}
          >
            {percentage}%
          </span>
          {total > 0 && stage !== 'loading' && (
            <span className="text-xs text-neutral-500 mt-1">
              {progress} / {total}
            </span>
          )}
        </div>

        {/* Orbiting dot */}
        <div
          className="absolute w-3 h-3 rounded-full bg-[#FFD700] shadow-lg shadow-[#FFD700]/50"
          style={{
            top: '50%',
            left: '50%',
            transform: `rotate(${(percentage / 100) * 360 - 90}deg) translateX(54px) translateY(-50%)`,
            transition: 'transform 0.3s ease-out'
          }}
        />
      </div>

      {/* Stage label */}
      <div className="text-center mb-8">
        <h2
          className="text-xl font-medium text-white mb-2"
          style={{ fontFamily: 'Outfit, system-ui, sans-serif' }}
        >
          {displayMessage}
        </h2>
        <p className="text-sm text-neutral-500">
          {stage === 'loading' && 'Initializing AI detection model...'}
          {stage === 'extracting' && 'Splitting video into frames...'}
          {stage === 'detecting' && 'Finding the golf ball in each frame...'}
          {stage === 'tracking' && 'Connecting detected positions...'}
          {stage === 'complete' && 'Ready to edit your tracer!'}
        </p>
      </div>

      {/* Stage indicators */}
      <div className="flex items-center gap-2">
        {STAGES.slice(0, -1).map((s, i) => {
          const isComplete = i < currentStageIndex
          const isCurrent = i === currentStageIndex
          const isPending = i > currentStageIndex

          return (
            <div key={s.key} className="flex items-center gap-2">
              <div
                className={`
                  w-8 h-8 rounded-full flex items-center justify-center text-sm
                  transition-all duration-500
                  ${isComplete ? 'bg-[#FFD700] text-black' : ''}
                  ${isCurrent ? 'bg-[#FFD700]/20 text-[#FFD700] ring-2 ring-[#FFD700]/50' : ''}
                  ${isPending ? 'bg-neutral-800 text-neutral-600' : ''}
                `}
              >
                {isComplete ? '✓' : i + 1}
              </div>
              {i < STAGES.length - 2 && (
                <div
                  className={`
                    w-6 h-0.5 rounded-full transition-colors duration-500
                    ${isComplete ? 'bg-[#FFD700]' : 'bg-neutral-800'}
                  `}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Animated trajectory preview */}
      <div className="absolute bottom-12 left-0 right-0 h-24 overflow-hidden opacity-20 pointer-events-none">
        <svg className="w-full h-full" viewBox="0 0 400 100" preserveAspectRatio="none">
          <path
            d="M 0 80 Q 100 20 200 40 T 400 30"
            stroke="url(#trajGradient)"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            className="animate-pulse"
          />
          <defs>
            <linearGradient id="trajGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#FFD700" stopOpacity="0" />
              <stop offset="50%" stopColor="#FFD700" />
              <stop offset="100%" stopColor="#FF4500" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600&display=swap');
      `}</style>
    </div>
  )
}
