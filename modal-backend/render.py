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
    .pip_install("Pillow", "fastapi", "aggdraw")
)


@app.function(
    image=image,
    timeout=900,  # 15 minute timeout for longer videos
    memory=16384,  # 16GB RAM for large videos
    cpu=8,  # More CPU cores for faster processing
)
@modal.fastapi_endpoint(method="POST")
def render_video(data: dict):
    """
    Render a video with tracer overlay.

    Expects JSON body with:
    - video_base64: base64 encoded video file
    - points: array of {frameIndex, x, y} tracer points
    - fps: output framerate
    - source_fps: original video framerate (for frame index scaling)
    - width: video width
    - height: video height
    - duration: video duration in seconds
    - style: {startColor, endColor, lineWidth, glowIntensity}
    """
    import base64
    from PIL import Image, ImageDraw, ImageFilter
    import io
    import time

    total_start = time.time()
    print(f"[RENDER] Starting render job")

    video_base64 = data["video_base64"]
    points = data["points"]
    output_fps = data.get("fps", 60)
    source_fps = data.get("source_fps", 30)  # FPS the frameIndex values are based on
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

    # Calculate frame scaling factor
    fps_scale = output_fps / source_fps

    with tempfile.TemporaryDirectory() as tmpdir:
        # Write input video
        step_start = time.time()
        input_path = os.path.join(tmpdir, "input.mp4")
        video_bytes = base64.b64decode(video_base64)
        with open(input_path, "wb") as f:
            f.write(video_bytes)
        print(f"[RENDER] Decoded and wrote input video: {len(video_bytes) / 1024 / 1024:.2f} MB in {time.time() - step_start:.2f}s")

        # Generate tracer overlay frames as transparent PNGs
        overlay_dir = os.path.join(tmpdir, "overlays")
        os.makedirs(overlay_dir)

        total_frames = int(duration * output_fps)
        line_width = style.get("lineWidth", 4)
        glow_intensity = style.get("glowIntensity", 10)

        # Adaptive supersampling - consider BOTH resolution and duration
        # High-res videos (1080p+) don't need as much supersampling
        total_pixels = width * height
        is_high_res = total_pixels >= 1920 * 1080  # >= 1080p (includes portrait 1080x1920)
        is_4k = total_pixels >= 3840 * 2160

        if is_4k or total_frames > 600:
            scale = 1  # No supersampling for 4K
        elif is_high_res or total_frames > 300:
            scale = 2  # 2x for 1080p
        else:
            scale = 2  # 2x max - 3x is too slow with glow effects

        # Find first and last frame with tracer for optimization
        first_tracer_frame = min(p["frameIndex"] for p in points) if points else 0
        last_tracer_frame = max(p["frameIndex"] for p in points) if points else total_frames
        first_output_frame = int(first_tracer_frame * fps_scale)

        print(f"[RENDER] Resolution: {width}x{height} ({total_pixels/1e6:.1f}MP), high_res={is_high_res}, is_4k={is_4k}")
        print(f"[RENDER] Tracer spans frames {first_tracer_frame}-{last_tracer_frame} (source), starting output at frame {first_output_frame}")
        print(f"[RENDER] Generating {total_frames} overlay frames at {scale}x supersampling")
        frame_gen_start = time.time()
        last_progress_log = 0
        frames_with_content = 0

        for frame_idx in range(total_frames):
            # Log progress every 10%
            progress_pct = int((frame_idx / total_frames) * 100)
            if progress_pct >= last_progress_log + 10:
                elapsed = time.time() - frame_gen_start
                fps_rate = frame_idx / elapsed if elapsed > 0 else 0
                remaining = (total_frames - frame_idx) / fps_rate if fps_rate > 0 else 0
                print(f"[RENDER] Frame generation: {progress_pct}% ({frame_idx}/{total_frames}) - {fps_rate:.1f} frames/sec, ~{remaining:.1f}s remaining")
                last_progress_log = progress_pct

            # Scale frame index back to source fps for comparison
            source_frame_idx = frame_idx / fps_scale

            # Get visible points up to this frame (using scaled frame index)
            visible_points = [p for p in points if p["frameIndex"] <= source_frame_idx]

            # For frames before tracer or with < 2 points, create empty overlay quickly
            if len(visible_points) < 2:
                img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
                frame_path = os.path.join(overlay_dir, f"overlay{frame_idx:06d}.png")
                img.save(frame_path, "PNG")
                continue

            frames_with_content += 1

            # Create transparent image (higher res for anti-aliasing)
            img = Image.new("RGBA", (width * scale, height * scale), (0, 0, 0, 0))
            draw = ImageDraw.Draw(img)

            # Draw tracer - optimized version without expensive blur
            # Draw glow as multiple semi-transparent thick lines (much faster than blur)
            if glow_intensity > 0:
                for layer in range(3, 0, -1):  # 3 glow layers, outer to inner
                    alpha = int(40 / layer)  # Decreasing opacity
                    glow_width = line_width + glow_intensity * layer * 0.5

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

            # Draw main tracer line with simple soft edge (2 passes instead of 3)
            for i in range(1, len(visible_points)):
                p1 = visible_points[i - 1]
                p2 = visible_points[i]
                t = i / (len(visible_points) - 1) if len(visible_points) > 1 else 0
                color = interpolate_color(style["startColor"], style["endColor"], t)
                base_width = line_width * (1 - t * 0.3) * scale

                # Soft outer edge
                outer_color = color[:3] + (120,)
                draw.line(
                    [(p1["x"] * scale, p1["y"] * scale), (p2["x"] * scale, p2["y"] * scale)],
                    fill=outer_color,
                    width=int(base_width * 1.3)
                )

                # Core line
                draw.line(
                    [(p1["x"] * scale, p1["y"] * scale), (p2["x"] * scale, p2["y"] * scale)],
                    fill=color,
                    width=int(base_width)
                )

                # Joint circle for smooth connections
                radius = int(base_width * 0.5)
                draw.ellipse(
                    [p2["x"] * scale - radius, p2["y"] * scale - radius,
                     p2["x"] * scale + radius, p2["y"] * scale + radius],
                    fill=color
                )

            # Downscale for anti-aliasing effect
            img = img.resize((width, height), Image.LANCZOS)

            # Save frame
            frame_path = os.path.join(overlay_dir, f"overlay{frame_idx:06d}.png")
            img.save(frame_path, "PNG")

        frame_gen_elapsed = time.time() - frame_gen_start
        print(f"[RENDER] Frame generation complete: {total_frames} frames in {frame_gen_elapsed:.2f}s ({total_frames/frame_gen_elapsed:.1f} fps)")
        print(f"[RENDER] Frames with tracer content: {frames_with_content}/{total_frames} ({100*frames_with_content/total_frames:.1f}%)")

        # Use FFmpeg to composite overlay onto original video
        output_path = os.path.join(tmpdir, "output.mp4")
        print(f"[RENDER] Starting FFmpeg compositing...")

        cmd = [
            "ffmpeg",
            "-i", input_path,
            "-framerate", str(output_fps),
            "-i", os.path.join(overlay_dir, "overlay%06d.png"),
            "-filter_complex", "[0:v][1:v]overlay=0:0:format=auto[out]",
            "-map", "[out]",
            "-map", "0:a:0?",  # Only first audio stream, if present
            "-c:v", "libx264",
            "-c:a", "aac",  # Re-encode audio to avoid codec issues
            "-b:a", "192k",
            "-preset", "fast",
            "-crf", "18",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            "-r", str(output_fps),
            "-y",
            output_path
        ]

        ffmpeg_start = time.time()
        result = subprocess.run(cmd, capture_output=True, text=True)
        ffmpeg_elapsed = time.time() - ffmpeg_start

        if result.returncode != 0:
            print(f"[RENDER] FFmpeg FAILED after {ffmpeg_elapsed:.2f}s")
            print(f"[RENDER] FFmpeg stderr: {result.stderr}")
            return {"error": result.stderr}

        print(f"[RENDER] FFmpeg complete in {ffmpeg_elapsed:.2f}s")

        # Read output and return as base64
        encode_start = time.time()
        with open(output_path, "rb") as f:
            output_bytes = f.read()
        output_base64 = base64.b64encode(output_bytes).decode("utf-8")
        encode_elapsed = time.time() - encode_start

        output_size_mb = len(output_bytes) / 1024 / 1024
        print(f"[RENDER] Output video: {output_size_mb:.2f} MB, encoded to base64 in {encode_elapsed:.2f}s")

        total_elapsed = time.time() - total_start
        print(f"[RENDER] COMPLETE - Total time: {total_elapsed:.2f}s")

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
