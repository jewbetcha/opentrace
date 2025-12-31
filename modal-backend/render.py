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
    timeout=900,  # 15 minute timeout for longer videos
    memory=32768,  # 32GB RAM
    cpu=8,  # More CPU cores for faster processing
)
@modal.fastapi_endpoint(method="POST")
def render_video(data: dict):
    """
    Render a video with tracer overlay.

    OPTIMIZED VERSION: Pipes frames directly to FFmpeg to avoid disk I/O.
    """
    import base64
    from PIL import Image, ImageDraw
    import io
    import time

    total_start = time.time()
    print(f"[RENDER] Starting render job (optimized pipeline)")

    video_base64 = data["video_base64"]
    points = data["points"]
    output_fps = data.get("fps", 60)
    source_fps = data.get("source_fps", 30)
    width = data["width"]
    height = data["height"]
    duration = data["duration"]
    style = data.get("style", {
        "startColor": "#FFD700",
        "endColor": "#FF4500",
        "lineWidth": 4,
        "glowIntensity": 10
    })

    print(f"[RENDER] Video: {width}x{height}, {duration:.2f}s, source_fps={source_fps}, output_fps={output_fps}")
    print(f"[RENDER] Points: {len(points)} tracer points")
    print(f"[RENDER] Input size: {len(video_base64) / 1024 / 1024:.2f} MB (base64)")

    fps_scale = output_fps / source_fps
    total_frames = int(duration * output_fps)
    line_width = style.get("lineWidth", 4)
    glow_intensity = style.get("glowIntensity", 10)

    # Adaptive supersampling
    total_pixels = width * height
    is_high_res = total_pixels >= 1920 * 1080
    is_4k = total_pixels >= 3840 * 2160

    if is_4k or total_frames > 600:
        scale = 1
    elif is_high_res or total_frames > 300:
        scale = 2
    else:
        scale = 2

    print(f"[RENDER] Resolution: {width}x{height}, scale={scale}x, total_frames={total_frames}")

    with tempfile.TemporaryDirectory() as tmpdir:
        # Write input video
        step_start = time.time()
        input_path = os.path.join(tmpdir, "input.mp4")
        video_bytes = base64.b64decode(video_base64)
        with open(input_path, "wb") as f:
            f.write(video_bytes)
        print(f"[RENDER] Input video ready: {len(video_bytes) / 1024 / 1024:.2f} MB in {time.time() - step_start:.2f}s")

        output_path = os.path.join(tmpdir, "output.mp4")

        # Start FFmpeg process with pipe input for overlay frames
        # This avoids writing thousands of PNG files to disk
        ffmpeg_cmd = [
            "ffmpeg",
            "-y",
            # Input 1: Original video
            "-i", input_path,
            # Input 2: Raw RGBA frames piped from stdin
            "-f", "rawvideo",
            "-pix_fmt", "rgba",
            "-s", f"{width}x{height}",
            "-r", str(output_fps),
            "-i", "pipe:0",
            # Filter: overlay with alpha blending
            "-filter_complex", "[0:v][1:v]overlay=0:0:format=auto[out]",
            "-map", "[out]",
            "-map", "0:a:0?",
            # Output encoding - optimized for speed
            "-c:v", "libx264",
            "-preset", "ultrafast",  # Fastest encoding
            "-crf", "20",  # Slightly lower quality for speed (was 18)
            "-tune", "fastdecode",  # Optimize for fast playback
            "-c:a", "aac",
            "-b:a", "128k",  # Lower audio bitrate
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            "-threads", "0",  # Use all CPU cores
            "-r", str(output_fps),
            output_path
        ]

        print(f"[RENDER] Starting FFmpeg pipeline...")
        ffmpeg_start = time.time()

        proc = subprocess.Popen(
            ffmpeg_cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )

        # Generate and pipe frames directly to FFmpeg
        frame_gen_start = time.time()
        last_progress_log = 0
        frames_with_content = 0

        # Pre-create empty frame bytes for reuse
        empty_frame = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        empty_frame_bytes = empty_frame.tobytes()

        for frame_idx in range(total_frames):
            # Log progress every 10%
            progress_pct = int((frame_idx / total_frames) * 100)
            if progress_pct >= last_progress_log + 10:
                elapsed = time.time() - frame_gen_start
                fps_rate = frame_idx / elapsed if elapsed > 0 else 0
                remaining = (total_frames - frame_idx) / fps_rate if fps_rate > 0 else 0
                print(f"[RENDER] Progress: {progress_pct}% ({frame_idx}/{total_frames}) - {fps_rate:.1f} fps, ~{remaining:.1f}s remaining")
                last_progress_log = progress_pct

            source_frame_idx = frame_idx / fps_scale
            visible_points = [p for p in points if p["frameIndex"] <= source_frame_idx]

            # For frames without tracer, send pre-computed empty frame
            if len(visible_points) < 2:
                proc.stdin.write(empty_frame_bytes)
                continue

            frames_with_content += 1

            # Create frame with tracer
            if scale > 1:
                img = Image.new("RGBA", (width * scale, height * scale), (0, 0, 0, 0))
            else:
                img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
            draw = ImageDraw.Draw(img)

            # Draw glow - reduced to 2 layers for speed
            if glow_intensity > 0:
                for layer in range(2, 0, -1):  # 2 glow layers instead of 3
                    alpha = int(50 / layer)
                    glow_width = line_width + glow_intensity * layer * 0.6

                    for i in range(1, len(visible_points)):
                        p1 = visible_points[i - 1]
                        p2 = visible_points[i]
                        t = i / (len(visible_points) - 1) if len(visible_points) > 1 else 0
                        color = interpolate_color(style["startColor"], style["endColor"], t)
                        glow_color = color[:3] + (alpha,)

                        draw.line(
                            [(p1["x"] * scale, p1["y"] * scale), (p2["x"] * scale, p2["y"] * scale)],
                            fill=glow_color,
                            width=int(glow_width * scale)
                        )

            # Draw main tracer line
            for i in range(1, len(visible_points)):
                p1 = visible_points[i - 1]
                p2 = visible_points[i]
                t = i / (len(visible_points) - 1) if len(visible_points) > 1 else 0
                color = interpolate_color(style["startColor"], style["endColor"], t)
                base_width = line_width * (1 - t * 0.3) * scale

                # Core line with slight outer glow
                outer_color = color[:3] + (150,)
                draw.line(
                    [(p1["x"] * scale, p1["y"] * scale), (p2["x"] * scale, p2["y"] * scale)],
                    fill=outer_color,
                    width=int(base_width * 1.2)
                )
                draw.line(
                    [(p1["x"] * scale, p1["y"] * scale), (p2["x"] * scale, p2["y"] * scale)],
                    fill=color,
                    width=int(base_width)
                )

                # Joint circle
                radius = int(base_width * 0.4)
                draw.ellipse(
                    [p2["x"] * scale - radius, p2["y"] * scale - radius,
                     p2["x"] * scale + radius, p2["y"] * scale + radius],
                    fill=color
                )

            # Downscale if supersampled
            if scale > 1:
                img = img.resize((width, height), Image.LANCZOS)

            # Write raw RGBA bytes directly to FFmpeg pipe
            proc.stdin.write(img.tobytes())

        # Close stdin and wait for FFmpeg to finish
        proc.stdin.close()
        stdout, stderr = proc.communicate()

        frame_gen_elapsed = time.time() - frame_gen_start
        ffmpeg_elapsed = time.time() - ffmpeg_start

        if proc.returncode != 0:
            print(f"[RENDER] FFmpeg FAILED")
            print(f"[RENDER] FFmpeg stderr: {stderr.decode()}")
            return {"error": stderr.decode()}

        print(f"[RENDER] Frame generation: {total_frames} frames in {frame_gen_elapsed:.2f}s ({total_frames/frame_gen_elapsed:.1f} fps)")
        print(f"[RENDER] Frames with tracer: {frames_with_content}/{total_frames}")
        print(f"[RENDER] FFmpeg total time: {ffmpeg_elapsed:.2f}s")

        # Read output and return as base64
        encode_start = time.time()
        with open(output_path, "rb") as f:
            output_bytes = f.read()
        output_base64 = base64.b64encode(output_bytes).decode("utf-8")

        output_size_mb = len(output_bytes) / 1024 / 1024
        total_elapsed = time.time() - total_start
        print(f"[RENDER] Output: {output_size_mb:.2f} MB, total time: {total_elapsed:.2f}s")

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
