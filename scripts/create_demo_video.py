from pathlib import Path
import subprocess
import textwrap

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
DEMO = ROOT / "demo"
TMP = ROOT / "tmp" / "demo_frames"
OUT = DEMO / "datainsight-demo.mp4"
WIDTH = 1280
HEIGHT = 720


def font(size, bold=False):
    candidates = [
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
    ]
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size=size)
    return ImageFont.load_default()


def draw_wrapped(draw, text, xy, width, font_obj, fill, line_gap=8):
    x, y = xy
    for paragraph in text.split("\n"):
        lines = textwrap.wrap(paragraph, width=width) or [""]
        for line in lines:
            draw.text((x, y), line, font=font_obj, fill=fill)
            y += font_obj.size + line_gap
    return y


def paste_image(canvas, path, box):
    img = Image.open(path).convert("RGB")
    target_w = box[2] - box[0]
    target_h = box[3] - box[1]
    img.thumbnail((target_w, target_h), Image.Resampling.LANCZOS)
    x = box[0] + (target_w - img.width) // 2
    y = box[1] + (target_h - img.height) // 2
    canvas.paste(img, (x, y))


def make_frame(index, title, caption, screenshot=None):
    canvas = Image.new("RGB", (WIDTH, HEIGHT), "#f4f7f8")
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((34, 34, WIDTH - 34, HEIGHT - 34), radius=18, fill="#ffffff", outline="#dbe3e8", width=2)
    draw.text((64, 58), "DataInsight Agent Demo", font=font(24, True), fill="#14766d")
    draw.text((64, 98), title, font=font(42, True), fill="#17212b")
    draw_wrapped(draw, caption, (64, 154), 50, font(24), "#526271")

    image = screenshot or ASSETS / "system-design.png"
    draw.rounded_rectangle((505, 88, 1215, 630), radius=14, fill="#fbfcfd", outline="#dbe3e8", width=2)
    paste_image(canvas, image, (526, 110, 1194, 608))
    draw.text((64, HEIGHT - 82), f"{index}/6", font=font(22, True), fill="#344c9a")
    path = TMP / f"frame_{index:02}.png"
    canvas.save(path)
    return path


def main():
    TMP.mkdir(parents=True, exist_ok=True)
    DEMO.mkdir(parents=True, exist_ok=True)
    frames = [
        make_frame(1, "Agent goal", "Turn a raw CSV into cleaned data, charts, and short findings without external APIs."),
        make_frame(2, "Perception", "The agent profiles rows, columns, missing values, duplicates, category inconsistencies, and outliers.", ASSETS / "screenshot-balanced.png"),
        make_frame(3, "Decision", "Balanced mode chooses low-risk cleaning: remove duplicates, fill missing values, standardize categories, and flag outliers.", ASSETS / "screenshot-balanced.png"),
        make_frame(4, "Action", "The agent applies the plan, lifts data quality, creates charts, and previews the cleaned dataset.", ASSETS / "screenshot-results.png"),
        make_frame(5, "Alternative strategy", "Aggressive mode changes the decision: numeric missing values use means and revenue outliers are capped.", ASSETS / "screenshot-aggressive.png"),
        make_frame(6, "Reproduce", "Run npm test, then python -m http.server 8765. Open localhost:8765 and click Load Sample, then Run Agent.", ASSETS / "screenshot-results.png"),
    ]
    durations = [10, 20, 25, 25, 25, 15]
    concat = TMP / "concat.txt"
    with concat.open("w", encoding="utf-8") as handle:
        for frame_path, duration in zip(frames, durations):
            handle.write(f"file '{frame_path.as_posix()}'\n")
            handle.write(f"duration {duration}\n")
        handle.write(f"file '{frames[-1].as_posix()}'\n")

    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(concat),
            "-vf",
            "fps=24,format=yuv420p",
            "-movflags",
            "+faststart",
            str(OUT),
        ],
        check=True,
        cwd=ROOT,
    )
    print(OUT)


if __name__ == "__main__":
    main()
