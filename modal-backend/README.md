# OpenTrace Modal Backend

Server-side video rendering using Modal.

## Setup

1. Install dependencies:
```bash
uv sync
```

2. Authenticate with Modal:
```bash
uv run modal token new
```

3. Test locally:
```bash
uv run modal serve render.py
```

4. Deploy to production:
```bash
uv run modal deploy render.py
```

After deploying, you'll get a URL like:
`https://YOUR_USERNAME--opentrace-render-render-video.modal.run`

Set this as your `VITE_MODAL_ENDPOINT` environment variable in Netlify.
