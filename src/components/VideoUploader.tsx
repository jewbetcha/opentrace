import { useCallback, useState, useRef } from 'react'

interface VideoUploaderProps {
  onUpload: (file: File) => void
  isLoading?: boolean
}

export function VideoUploader({ onUpload, isLoading = false }: VideoUploaderProps) {
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDragIn = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragOut = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = e.dataTransfer.files
    if (files?.[0]?.type.startsWith('video/')) {
      onUpload(files[0])
    }
  }, [onUpload])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      onUpload(file)
    }
  }, [onUpload])

  const handleClick = () => {
    inputRef.current?.click()
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-[#0a0a0a] overflow-hidden">
      {/* Subtle background texture */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, #FFD700 1px, transparent 0)`,
          backgroundSize: '32px 32px'
        }}
      />

      {/* Header */}
      <header className="relative z-10 px-6 pt-12 pb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FFD700] to-[#FF4500] flex items-center justify-center shadow-lg shadow-[#FFD700]/20">
            <svg className="w-5 h-5 text-black" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="12" r="8" />
              <path d="M12 4a8 8 0 0 1 0 16" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-white" style={{ fontFamily: 'Outfit, system-ui, sans-serif' }}>
              OpenTrace
            </h1>
            <p className="text-xs text-neutral-500 tracking-wide uppercase">Shot Tracer</p>
          </div>
        </div>
      </header>

      {/* Upload Zone */}
      <div className="relative flex-1 flex flex-col items-center justify-center px-6 pb-12">
        <button
          onClick={handleClick}
          onDragEnter={handleDragIn}
          onDragLeave={handleDragOut}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          disabled={isLoading}
          className={`
            relative w-full max-w-sm aspect-[4/5] rounded-3xl
            border-2 border-dashed transition-all duration-500 ease-out
            flex flex-col items-center justify-center gap-6
            touch-target cursor-pointer
            ${isDragging
              ? 'border-[#FFD700] bg-[#FFD700]/5 scale-[1.02]'
              : 'border-neutral-700 hover:border-neutral-500 bg-neutral-900/50'
            }
            ${isLoading ? 'pointer-events-none opacity-50' : ''}
          `}
        >
          {/* Animated trajectory decoration */}
          <div className="absolute inset-0 overflow-hidden rounded-3xl pointer-events-none">
            <svg
              className={`absolute w-full h-full transition-opacity duration-500 ${isDragging ? 'opacity-40' : 'opacity-20'}`}
              viewBox="0 0 200 250"
              fill="none"
            >
              {/* Trajectory arc */}
              <path
                d="M 30 220 Q 60 80 170 40"
                stroke="url(#trajectoryGradient)"
                strokeWidth="3"
                strokeLinecap="round"
                fill="none"
                className="animate-[draw_3s_ease-in-out_infinite]"
                style={{
                  strokeDasharray: 300,
                  strokeDashoffset: isDragging ? 0 : 300,
                  transition: 'stroke-dashoffset 1s ease-out'
                }}
              />
              {/* Ball at end */}
              <circle
                cx="170"
                cy="40"
                r="6"
                fill="#FFD700"
                className={`transition-all duration-700 ${isDragging ? 'opacity-100' : 'opacity-0'}`}
              >
                <animate attributeName="r" values="6;8;6" dur="1.5s" repeatCount="indefinite" />
              </circle>
              <defs>
                <linearGradient id="trajectoryGradient" x1="0%" y1="100%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#FFD700" />
                  <stop offset="100%" stopColor="#FF4500" />
                </linearGradient>
              </defs>
            </svg>
          </div>

          {/* Golf ball icon */}
          <div className={`relative transition-transform duration-500 ${isDragging ? 'scale-110' : ''}`}>
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-neutral-200 to-neutral-400 shadow-2xl flex items-center justify-center">
              {/* Dimple pattern */}
              <svg className="w-full h-full" viewBox="0 0 80 80">
                <defs>
                  <radialGradient id="ballGradient" cx="30%" cy="30%">
                    <stop offset="0%" stopColor="#fafafa" />
                    <stop offset="100%" stopColor="#d4d4d4" />
                  </radialGradient>
                </defs>
                <circle cx="40" cy="40" r="38" fill="url(#ballGradient)" />
                {/* Dimples */}
                {[
                  [25, 25], [40, 20], [55, 25],
                  [20, 40], [35, 38], [50, 35], [60, 42],
                  [25, 55], [40, 52], [55, 55],
                  [35, 65], [48, 62]
                ].map(([cx, cy], i) => (
                  <circle
                    key={i}
                    cx={cx}
                    cy={cy}
                    r="4"
                    fill="none"
                    stroke="#a3a3a3"
                    strokeWidth="0.5"
                    opacity="0.6"
                  />
                ))}
              </svg>
            </div>
            {/* Glow effect */}
            <div className={`
              absolute inset-0 rounded-full bg-[#FFD700]/30 blur-xl
              transition-opacity duration-500
              ${isDragging ? 'opacity-100' : 'opacity-0'}
            `} />
          </div>

          {/* Text */}
          <div className="text-center px-6">
            <p className="text-lg font-medium text-white mb-2" style={{ fontFamily: 'Outfit, system-ui, sans-serif' }}>
              {isDragging ? 'Drop to trace' : 'Upload your shot'}
            </p>
            <p className="text-sm text-neutral-500">
              {isDragging ? 'Release to start processing' : 'Drag & drop or tap to select video'}
            </p>
          </div>

          {/* Upload icon indicator */}
          <div className={`
            absolute bottom-8 flex items-center gap-2 px-4 py-2 rounded-full
            bg-neutral-800/80 backdrop-blur-sm border border-neutral-700
            transition-all duration-300
            ${isDragging ? 'opacity-0 translate-y-4' : 'opacity-100'}
          `}>
            <svg className="w-5 h-5 text-[#FFD700]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <span className="text-sm text-neutral-300">MP4, MOV, WebM</span>
          </div>
        </button>

        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* Footer with links */}
      <div className="relative z-10 px-6 pb-8">
        <p className="text-xs text-neutral-600 text-center mb-5">
          Best results with steady footage • Ball visible at impact
        </p>

        {/* Social Links */}
        <div className="flex items-center justify-center gap-1">
          {/* TikTok */}
          <a
            href="https://www.tiktok.com/@colemangolfs"
            target="_blank"
            rel="noopener noreferrer"
            className="group p-2.5 rounded-xl hover:bg-white/5 transition-all duration-300"
            title="@colemangolfs on TikTok"
          >
            <svg className="w-5 h-5 text-neutral-500 group-hover:text-[#FFD700] transition-colors" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
            </svg>
          </a>

          {/* GitHub Profile */}
          <a
            href="https://github.com/jewbetcha"
            target="_blank"
            rel="noopener noreferrer"
            className="group p-2.5 rounded-xl hover:bg-white/5 transition-all duration-300"
            title="@jewbetcha on GitHub"
          >
            <svg className="w-5 h-5 text-neutral-500 group-hover:text-[#FFD700] transition-colors" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
          </a>

          {/* Divider */}
          <div className="w-px h-4 bg-neutral-700 mx-1" />

          {/* GitHub Repo */}
          <a
            href="https://github.com/jewbetcha/opentrace"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-1.5 px-3 py-1.5 rounded-xl hover:bg-white/5 transition-all duration-300"
            title="View source code"
          >
            <svg className="w-4 h-4 text-neutral-500 group-hover:text-[#FFD700] transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
            <span className="text-xs text-neutral-500 group-hover:text-neutral-300 transition-colors">Source</span>
          </a>

          {/* Divider */}
          <div className="w-px h-4 bg-neutral-700 mx-1" />

          {/* Donate */}
          <a
            href="https://paypal.me/colerollins"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FFD700]/10 hover:bg-[#FFD700]/20 border border-[#FFD700]/20 hover:border-[#FFD700]/40 transition-all duration-300"
            title="Support OpenTrace"
          >
            <svg className="w-4 h-4 text-[#FFD700]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
            <span className="text-xs font-medium text-[#FFD700]">Donate</span>
          </a>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600&display=swap');

        @keyframes draw {
          0%, 100% { stroke-dashoffset: 300; }
          50% { stroke-dashoffset: 0; }
        }
      `}</style>
    </div>
  )
}
