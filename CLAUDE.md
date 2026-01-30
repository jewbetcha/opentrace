# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

OpenTrace is a mobile-first web app for adding golf ball tracer overlays to swing videos. Users upload a video, manually draw a ball flight trajectory using Bezier curves, preview the tracer overlay on a canvas, then export the final video via a serverless backend.

## Architecture

**Frontend:** React 18 + TypeScript + Vite + Tailwind CSS. Canvas API for real-time tracer rendering.

**Backend:** Python on Modal (serverless). Renders tracer frames with Pillow and composites with FFmpeg. Located in `modal-backend/`.

**Flow:** Upload video → extract frames (`useVideoFrames`) → create tracer points (`ManualTracerCreator`) → preview on canvas (`VideoPlayer`) → export via Modal backend (`useVideoExport`) → download rendered video.

**State machine in App.tsx:** `idle` → `loading` → `creating` → `editing` → `exporting` → `complete`

**Key directories:**
- `src/components/` — React components
- `src/hooks/` — Custom hooks (video frames, export, ball tracking, YOLO detection)
- `src/lib/` — Core logic: tracer drawing, trajectory physics, video utils, tracking algorithms
- `src/types/` — Shared TypeScript types
- `modal-backend/` — Python Modal functions for server-side video rendering

## Commands

```bash
# Frontend dev server (localhost:5173, includes CORS headers for SharedArrayBuffer)
npm run dev

# Production build (output: dist/)
npm run build

# Backend local dev
cd modal-backend && uv run modal serve render.py

# Backend deploy
cd modal-backend && uv run modal deploy render.py
```

No test or lint commands are configured.

## Environment

Requires `VITE_MODAL_ENDPOINT` in `.env` pointing to the deployed Modal endpoint. See `.env.example`.

## Key Technical Details

- Vite config adds `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` headers (required for FFmpeg.wasm/SharedArrayBuffer)
- Trajectory uses cubic Bezier curves with gravity simulation (Trackman-style physics) in `src/lib/trajectory.ts`
- Backend pipes frames directly to FFmpeg stdin to avoid disk I/O
- Custom Tailwind colors: `tracer.start` (#FFD700), `tracer.end` (#FF4500)
- Mobile: iOS video init workaround (play/pause for first frame), 48px touch targets, dark theme
- ONNX runtime included for future ML-based ball detection
- Python backend requires `uv` package manager and Python >=3.13
