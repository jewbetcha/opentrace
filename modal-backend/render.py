import modal
import subprocess
import tempfile
import os
from PIL import Image, ImageDraw

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
    import time

    total_start = time.time()
    print(f"[RENDER] Starting render job (optimized pipeline)")

    required_fields = {"video_base64", "points", "width", "height", "duration"}
    missing_fields = sorted(required_fields - data.keys())
    if missing_fields:
        return {"error": f"Missing required fields: {', '.join(missing_fields)}"}

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

    if not points or len(points) < 2:
        return {"error": "At least two tracer points are required"}

    if source_fps <= 0 or output_fps <= 0:
        return {"error": "FPS values must be greater than zero"}

    total_frames = int(duration * output_fps)
    line_width = style.get("lineWidth", 4)
    glow_intensity = style.get("glowIntensity", 10)
    start_color = style.get("startColor", "#FFD700")
    end_color = style.get("endColor", "#FF4500")
    sorted_points = sorted(points, key=lambda p: p["frameIndex"])
    tracer_start_time = sorted_points[0]["frameIndex"] / source_fps
    tracer_end_time = sorted_points[-1]["frameIndex"] / source_fps
    reveal_duration = max(0.1, tracer_end_time - tracer_start_time)

    if total_frames <= 0:
        return {"error": "Video duration must be greater than zero"}

    total_pixels = width * height
    scale = 1 if total_pixels >= 1280 * 720 else 2

    print(f"[RENDER] Resolution: {width}x{height}, scale={scale}x, total_frames={total_frames}")
    print(f"[RENDER] Tracer window: {tracer_start_time:.2f}s to {tracer_end_time:.2f}s")

    with tempfile.TemporaryDirectory() as tmpdir:
        # Write input video
        step_start = time.time()
        input_path = os.path.join(tmpdir, "input.mp4")
        try:
            video_bytes = base64.b64decode(video_base64)
        except Exception as exc:
            return {"error": f"Invalid base64 video payload: {exc}"}

        with open(input_path, "wb") as f:
            f.write(video_bytes)
        print(f"[RENDER] Input video ready: {len(video_bytes) / 1024 / 1024:.2f} MB in {time.time() - step_start:.2f}s")

        output_path = os.path.join(tmpdir, "output.mp4")
        overlay_dir = os.path.join(tmpdir, "overlay")
        os.makedirs(overlay_dir, exist_ok=True)
        render_overlay_frames(
            overlay_dir,
            sorted_points,
            width,
            height,
            duration,
            output_fps,
            source_fps,
            scale,
            line_width,
            glow_intensity,
            start_color,
            end_color
        )

        ffmpeg_cmd = [
            "ffmpeg",
            "-y",
            "-i", input_path,
            "-framerate", str(output_fps),
            "-i", os.path.join(overlay_dir, "overlay_%05d.png"),
            "-filter_complex",
            "[0:v][1:v]overlay=0:0:format=auto:shortest=1[out]",
            "-map", "[out]",
            "-map", "0:a:0?",
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-crf", "22",
            "-tune", "fastdecode",
            "-c:a", "aac",
            "-b:a", "128k",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            "-threads", "0",
            "-r", str(output_fps),
            output_path
        ]

        print(f"[RENDER] Starting FFmpeg overlay render...")
        ffmpeg_start = time.time()
        proc = subprocess.run(ffmpeg_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        ffmpeg_elapsed = time.time() - ffmpeg_start

        if proc.returncode != 0:
            print(f"[RENDER] FFmpeg FAILED")
            print(f"[RENDER] FFmpeg stderr: {proc.stderr.decode()}")
            return {"error": proc.stderr.decode()}

        print(f"[RENDER] FFmpeg total time: {ffmpeg_elapsed:.2f}s")

        # Read output and return as base64
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


def hex_to_rgba(hex_color: str, alpha: int) -> tuple:
    return hex_to_rgb(hex_color) + (alpha,)


def interpolate_color(color1: str, color2: str, t: float) -> tuple:
    """Interpolate between two hex colors."""
    r1, g1, b1 = hex_to_rgb(color1)
    r2, g2, b2 = hex_to_rgb(color2)

    r = int(r1 + (r2 - r1) * t)
    g = int(g1 + (g2 - g1) * t)
    b = int(b1 + (b2 - b1) * t)

    return (r, g, b, 255)


def smooth_path(points: list, scale: int) -> list:
    if len(points) < 3:
        return [(p["x"] * scale, p["y"] * scale) for p in points]

    smoothed = []
    samples_per_segment = 4

    for i in range(len(points) - 1):
        p0 = points[max(0, i - 1)]
        p1 = points[i]
        p2 = points[i + 1]
        p3 = points[min(len(points) - 1, i + 2)]

        for sample in range(samples_per_segment):
            t = sample / samples_per_segment
            smoothed.append((
                catmull_rom(p0["x"], p1["x"], p2["x"], p3["x"], t) * scale,
                catmull_rom(p0["y"], p1["y"], p2["y"], p3["y"], t) * scale
            ))

    last = points[-1]
    smoothed.append((last["x"] * scale, last["y"] * scale))
    return smoothed


def render_overlay_frames(
    output_dir: str,
    points: list,
    width: int,
    height: int,
    duration: float,
    output_fps: int,
    source_fps: float,
    scale: int,
    line_width: int,
    glow_intensity: int,
    start_color: str,
    end_color: str,
) -> None:
    total_frames = max(1, int(duration * output_fps))
    img_size = (width * scale, height * scale) if scale > 1 else (width, height)
    img = Image.new("RGBA", img_size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    scaled_points = smooth_path(points, scale)
    last_visible_count = 0

    for frame_idx in range(total_frames):
        source_frame = (frame_idx / output_fps) * source_fps
        visible_count = count_visible_points(points, source_frame)

        if visible_count > last_visible_count:
            draw_tracer_segments(
                draw,
                scaled_points,
                max(0, last_visible_count * 4 - 1),
                min(len(scaled_points) - 1, visible_count * 4),
                line_width,
                glow_intensity,
                start_color,
                end_color,
                scale
            )
            last_visible_count = visible_count

        frame = img.resize((width, height), Image.LANCZOS) if scale > 1 else img
        frame.save(os.path.join(output_dir, f"overlay_{frame_idx + 1:05d}.png"))


def draw_tracer_segments(
    draw,
    scaled_points: list,
    start_index: int,
    end_index: int,
    line_width: int,
    glow_intensity: int,
    start_color: str,
    end_color: str,
    scale: int,
) -> None:
    if end_index <= start_index:
        return

    if glow_intensity > 0:
        for layer in range(2, 0, -1):
            alpha = int(50 / layer)
            glow_width = line_width + glow_intensity * layer * 0.6
            draw.line(
                scaled_points[start_index:end_index + 1],
                fill=hex_to_rgba(start_color, alpha),
                width=max(1, int(glow_width * scale)),
                joint="curve"
            )

    total_segments = max(1, len(scaled_points) - 1)
    for i in range(max(1, start_index + 1), end_index + 1):
        p1 = scaled_points[i - 1]
        p2 = scaled_points[i]
        t = i / total_segments
        color = interpolate_color(start_color, end_color, t)
        base_width = line_width * (1 - t * 0.3) * scale

        draw.line([p1, p2], fill=color[:3] + (150,), width=max(1, int(base_width * 1.2)))
        draw.line([p1, p2], fill=color, width=max(1, int(base_width)))

        radius = max(1, int(base_width * 0.4))
        draw.ellipse(
            [p2[0] - radius, p2[1] - radius, p2[0] + radius, p2[1] + radius],
            fill=color
        )


def count_visible_points(points: list, source_frame: float) -> int:
    count = 0
    for point in points:
        if point["frameIndex"] <= source_frame:
            count += 1
        else:
            break
    return count


def catmull_rom(p0: float, p1: float, p2: float, p3: float, t: float) -> float:
    t2 = t * t
    t3 = t2 * t
    return 0.5 * (
        (2 * p1)
        + (-p0 + p2) * t
        + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
        + (-p0 + 3 * p1 - 3 * p2 + p3) * t3
    )


# Local entrypoint for testing
@app.local_entrypoint()
def main():
    print("Modal app ready. Deploy with: modal deploy render.py")
    print("Test locally with: modal serve render.py")
