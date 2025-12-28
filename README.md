# OpenTrace

A mobile-first web app for adding golf ball tracer overlays to swing videos.

## Features

- Upload golf swing videos
- Manually create ball flight trajectories
- Adjust trajectory shape, timing, and color
- Export videos as .mov with tracer overlay

## Getting Started

```bash
npm install
npm run dev
```

## Tech Stack

- React + TypeScript
- Vite
- Tailwind CSS
- Canvas API for rendering
- FFmpeg.wasm for video export

## Deployment

This app uses FFmpeg.wasm which requires specific HTTP headers for SharedArrayBuffer support:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Make sure your hosting provider supports these headers.

## License

MIT
