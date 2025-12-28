#!/usr/bin/env python3
"""
Convert YOLO PyTorch model to ONNX format for browser inference.

Usage:
    python scripts/convert_model.py

Requirements:
    pip install ultralytics onnx onnxsim
"""

import shutil
from pathlib import Path


def main():
    # Paths
    project_root = Path(__file__).parent.parent
    input_model = project_root / "models" / "golf_ball_yolo11n.pt"
    output_dir = project_root / "public" / "models"

    # Ensure output directory exists
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Loading model from: {input_model}")

    if not input_model.exists():
        print(f"Error: Model not found at {input_model}")
        return 1

    try:
        from ultralytics import YOLO

        # Load the model
        model = YOLO(str(input_model))

        # Export to ONNX
        print("Exporting to ONNX format...")
        export_path = model.export(
            format="onnx",
            imgsz=640,
            simplify=True,
            opset=12,
            dynamic=False,
        )

        print(f"Model exported to: {export_path}")

        # Move to public directory
        output_path = output_dir / "golf_ball_yolo11n.onnx"
        shutil.move(export_path, output_path)

        print(f"Model moved to: {output_path}")
        print("\nConversion complete!")
        print(f"Model size: {output_path.stat().st_size / 1024 / 1024:.2f} MB")

        return 0

    except ImportError:
        print("Error: ultralytics package not found.")
        print("Install with: pip install ultralytics")
        return 1
    except Exception as e:
        print(f"Error during conversion: {e}")
        return 1


if __name__ == "__main__":
    exit(main())
