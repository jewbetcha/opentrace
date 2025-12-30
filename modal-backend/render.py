import modal
import subprocess
import tempfile
import os
import json
from pathlib import Path

app = modal.App("opentrace-render")

# Docker image with FFmpeg, Pillow, and FastAPI installed
image = (
    modal.Image.debian_slim()
    .apt_install("ffmpeg")
    .pip_install("Pillow", "fastapi")
)


@app.function(
    image=image,
    timeout=600,  # 10 minute timeout for longer videos
)
@modal.web_endpoint(method="POST")
def render_video(data: dict):
    """
    Render a video with tracer overlay.

    Expects JSON body with:
    - video_base64: base64 encoded video file
    - points: array of {frameIndex, x, y} tracer points
    - fps: output framerate
    - width: video width
    - height: video height
    - duration: video duration in seconds
    - style: {startColor, endColor, lineWidth, glowIntensity}
    """
    import base64
    from PIL import Image, ImageDraw
    import io

    video_base64 = data["video_base64"]
    points = data["points"]
    fps = data.get("fps", 60)
    width = data["width"]
    height = data["height"]
    duration = data["duration"]
    style = data.get("style", {
        "startColor": "#FFD700",
        "endColor": "#FF4500",
        "lineWidth": 4,
        "glowIntensity": 10
    })

    with tempfile.TemporaryDirectory() as tmpdir:
        # Write input video
        input_path = os.path.join(tmpdir, "input.mp4")
        with open(input_path, "wb") as f:
            f.write(base64.b64decode(video_base64))

        # Generate tracer overlay frames as transparent PNGs
        overlay_dir = os.path.join(tmpdir, "overlays")
        os.makedirs(overlay_dir)

        total_frames = int(duration * fps)

        for frame_idx in range(total_frames):
            # Create transparent image
            img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
            draw = ImageDraw.Draw(img)

            # Get visible points up to this frame
            visible_points = [p for p in points if p["frameIndex"] <= frame_idx]

            if len(visible_points) >= 2:
                # Draw tracer line segments
                for i in range(1, len(visible_points)):
                    p1 = visible_points[i - 1]
                    p2 = visible_points[i]

                    # Interpolate color
                    t = i / (len(visible_points) - 1) if len(visible_points) > 1 else 0
                    color = interpolate_color(style["startColor"], style["endColor"], t)

                    # Line width tapers
                    line_width = int(style["lineWidth"] * (1 - t * 0.5))
                    line_width = max(2, line_width)

                    # Draw line
                    draw.line(
                        [(p1["x"], p1["y"]), (p2["x"], p2["y"])],
                        fill=color,
                        width=line_width
                    )

            # Save frame
            frame_path = os.path.join(overlay_dir, f"overlay{frame_idx:06d}.png")
            img.save(frame_path, "PNG")

        # Use FFmpeg to composite overlay onto original video
        output_path = os.path.join(tmpdir, "output.mp4")

        cmd = [
            "ffmpeg",
            "-i", input_path,
            "-framerate", str(fps),
            "-i", os.path.join(overlay_dir, "overlay%06d.png"),
            "-filter_complex", "[0:v][1:v]overlay=0:0:format=auto[out]",
            "-map", "[out]",
            "-map", "0:a?",
            "-c:a", "copy",
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "18",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            "-r", str(fps),
            "-y",
            output_path
        ]

        result = subprocess.run(cmd, capture_output=True, text=True)

        if result.returncode != 0:
            return {"error": result.stderr}

        # Read output and return as base64
        with open(output_path, "rb") as f:
            output_base64 = base64.b64encode(f.read()).decode("utf-8")

        return {
            "success": True,
            "video_base64": output_base64
        }


def hex_to_rgb(hex_color: str) -> tuple:
    """Convert hex color to RGB tuple."""
    hex_color = hex_color.lstrip("#")
    return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))


def interpolate_color(color1: str, color2: str, t: float) -> tuple:
    """Interpolate between two hex colors."""
    r1, g1, b1 = hex_to_rgb(color1)
    r2, g2, b2 = hex_to_rgb(color2)

    r = int(r1 + (r2 - r1) * t)
    g = int(g1 + (g2 - g1) * t)
    b = int(b1 + (b2 - b1) * t)

    return (r, g, b, 255)


# Local entrypoint for testing
@app.local_entrypoint()
def main():
    print("Modal app ready. Deploy with: modal deploy render.py")
    print("Test locally with: modal serve render.py")
