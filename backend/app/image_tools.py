"""Image processing utilities for PDF Image Extraction, Bulk Resizing, and Watermarking."""

from __future__ import annotations

import base64
import hashlib
import io
import math
import os
import re
import uuid
import zipfile
from typing import Any, Optional

from PIL import Image, ImageDraw, ImageFont
from pypdf import PdfReader

DEFAULT_LOGO_PATH = os.path.join(os.path.dirname(__file__), "assets", "default_watermark_logo.png")


def get_default_logo_bytes() -> Optional[bytes]:
    """Retrieve bundled company logo image bytes if available."""
    if os.path.exists(DEFAULT_LOGO_PATH):
        try:
            with open(DEFAULT_LOGO_PATH, "rb") as f:
                return f.read()
        except Exception:
            pass
    return None


def extract_images_from_pdf(
    pdf_bytes: bytes,
    figure_pages: Optional[dict[int, dict[str, str]]] = None,
    parts_only: bool = False,
    min_dimension: int = 150,
    model_code: Optional[str] = None,
) -> list[dict[str, Any]]:
    """Extract embedded raster images from a PDF document in-memory.

    If parts_only is True or figure_pages is provided:
    - Filters out non-figure pages (Cover, Foreword, Index, etc.)
    - Excludes small icons, banners, and noise (< min_dimension px)
    - Strictly deduplicates repeated/identical image streams across pages
    - Names files according to: YAM_{MODEL_CODE}_{PART_NAME}.jpg (e.g. YAM_BGPK_CYLINDER HEAD.jpg)
    """
    reader = PdfReader(io.BytesIO(pdf_bytes))
    extracted: list[dict[str, Any]] = []
    seen_hashes: set[str] = set()
    fig_counter: dict[str, int] = {}

    clean_model_code = ""
    if model_code:
        clean_model_code = re.sub(r"[^A-Za-z0-9_-]+", "", model_code.strip()).strip("_")
    if not clean_model_code:
        clean_model_code = "MODEL"

    effective_parts_only = parts_only or (figure_pages is not None and len(figure_pages) > 0)
    effective_min_dim = min_dimension if effective_parts_only else 10

    for page_idx, page in enumerate(reader.pages):
        page_num = page_idx + 1

        # If parts_only mode and figure_pages mapping is provided, only inspect figure pages
        fig_info = figure_pages.get(page_num) if figure_pages else None
        if effective_parts_only and figure_pages is not None and not fig_info:
            continue

        page_images = getattr(page, "images", [])

        for img_idx, img_obj in enumerate(page_images):
            try:
                img_data = img_obj.data

                # Check dimensions before processing
                pil_img = Image.open(io.BytesIO(img_data))
                width, height = pil_img.size

                if width < effective_min_dim or height < effective_min_dim:
                    continue

                # Strict SHA-256 deduplication to eliminate repeated images
                img_hash = hashlib.sha256(img_data).hexdigest()
                if img_hash in seen_hashes:
                    # Do not extract duplicate/repeated images
                    continue
                seen_hashes.add(img_hash)

                # Preserve 100% exact original quality from PDF:
                # If image is already in standard JPEG format without alpha/transparency,
                # use exact raw bytes directly from the PDF stream to guarantee zero recompression loss.
                if pil_img.format == "JPEG" and pil_img.mode == "RGB":
                    jpg_bytes = img_data
                    pil_rgb = pil_img
                elif pil_img.mode in ("RGBA", "LA") or (pil_img.mode == "P" and "transparency" in pil_img.info):
                    bg = Image.new("RGB", pil_img.size, (255, 255, 255))
                    alpha_mask = pil_img.convert("RGBA").split()[-1]
                    bg.paste(pil_img.convert("RGB"), mask=alpha_mask)
                    pil_rgb = bg
                    jpg_buf = io.BytesIO()
                    pil_rgb.save(jpg_buf, format="JPEG", quality=100, subsampling=0)
                    jpg_bytes = jpg_buf.getvalue()
                else:
                    pil_rgb = pil_img.convert("RGB")
                    jpg_buf = io.BytesIO()
                    pil_rgb.save(jpg_buf, format="JPEG", quality=100, subsampling=0)
                    jpg_bytes = jpg_buf.getvalue()

                # Generate descriptive filename without .jpg extension:
                # e.g. YAM_D001_CYLINDER or YAM_BGPK_CYLINDER HEAD
                if fig_info:
                    fig_no = str(fig_info.get("fig_no", "")).strip()
                    fig_name = str(fig_info.get("fig_name", "")).strip()
                    # Clean filename invalid characters but preserve spaces (e.g. CYLINDER HEAD)
                    clean_part_name = re.sub(r'[\/:*?"<>|\r\n\t]', " ", fig_name)
                    clean_part_name = re.sub(r"\s+", " ", clean_part_name).strip()
                    if not clean_part_name:
                        padded_no = fig_no.zfill(2) if fig_no.isdigit() else fig_no
                        clean_part_name = f"FIG_{padded_no}" if padded_no else f"PAGE_{page_num}"

                    counter_key = f"{fig_no}_{clean_part_name}"
                    count = fig_counter.get(counter_key, 0) + 1
                    fig_counter[counter_key] = count

                    if count == 1:
                        filename = f"YAM_{clean_model_code}_{clean_part_name}"
                    else:
                        filename = f"YAM_{clean_model_code}_{clean_part_name}_{count}"
                else:
                    clean_part_name = f"PAGE_{page_num}_IMG_{img_idx + 1}"
                    counter_key = clean_part_name
                    count = fig_counter.get(counter_key, 0) + 1
                    fig_counter[counter_key] = count
                    if count == 1:
                        filename = f"YAM_{clean_model_code}_{clean_part_name}"
                    else:
                        filename = f"YAM_{clean_model_code}_{clean_part_name}_{count}"

                # Generate compact base64 thumbnail for fast frontend display
                thumb = pil_rgb.copy()
                thumb.thumbnail((260, 260))
                thumb_io = io.BytesIO()
                thumb.save(thumb_io, format="JPEG", quality=80)
                thumb_base64 = base64.b64encode(thumb_io.getvalue()).decode("utf-8")
                data_url = f"data:image/jpeg;base64,{thumb_base64}"

                image_id = f"img_{uuid.uuid4().hex[:8]}"

                extracted.append({
                    "id": image_id,
                    "filename": filename,
                    "fig_no": fig_info.get("fig_no", "") if fig_info else "",
                    "fig_name": fig_info.get("fig_name", "") if fig_info else "",
                    "page": page_num,
                    "width": width,
                    "height": height,
                    "format": "JPEG",
                    "size_bytes": len(jpg_bytes),
                    "thumbnail_url": data_url,
                    "raw_bytes": jpg_bytes,
                    "is_duplicate": False,
                })
            except Exception:
                continue

    return extracted


def create_images_zip(image_items: list[tuple[str, bytes]]) -> io.BytesIO:
    """Package a list of (filename, file_bytes) tuples into an in-memory ZIP archive."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for fname, data in image_items:
            clean_name = fname
            if not clean_name.lower().endswith(".jpeg"):
                clean_name = f"{clean_name}.jpeg"
            zip_file.writestr(clean_name, data)
    buf.seek(0)
    return buf


def resize_single_image(
    image_bytes: bytes,
    target_width: int,
    target_height: int,
    output_format: str = "ORIGINAL",
    quality: int = 85,
) -> tuple[bytes, str]:
    """Resize an image in-memory to exact dimensions with specified output format and quality."""
    img = Image.open(io.BytesIO(image_bytes))
    orig_format = img.format or "PNG"

    # Resize using high quality Lanczos filter
    resized = img.resize((target_width, target_height), Image.Resampling.LANCZOS)

    fmt = orig_format if output_format == "ORIGINAL" else output_format.upper()
    if fmt == "JPG":
        fmt = "JPEG"

    # Convert mode if saving as JPEG (cannot have alpha channel)
    if fmt == "JPEG" and resized.mode in ("RGBA", "P", "LA"):
        background = Image.new("RGB", resized.size, (255, 255, 255))
        background.paste(resized, mask=resized.split()[-1] if resized.mode == "RGBA" else None)
        resized = background

    out_buf = io.BytesIO()
    if fmt in ("JPEG", "JPG"):
        resized.save(out_buf, format=fmt, quality=max(1, min(100, quality)), subsampling=0)
    elif fmt == "WEBP":
        resized.save(out_buf, format=fmt, quality=max(1, min(100, quality)))
    else:
        resized.save(out_buf, format=fmt)

    out_buf.seek(0)
    ext = fmt.lower()
    if ext == "jpg":
        ext = "jpeg"
    return out_buf.getvalue(), ext


def apply_text_watermark(
    image_bytes: bytes,
    text: str,
    font_size: int = 36,
    opacity: float = 0.10,
    angle: float = -30.0,
    position: str = "center",
    color_hex: str = "#FFFFFF",
    is_tiled: bool = True,
    padding: int = 115,
    size_pct: Optional[int] = 20,
) -> bytes:
    """Apply a text watermark onto an image in-memory with requested preset parameters.

    Presets:
    - rotation: -30.0 degrees
    - padding: 115 px (spacing between tiles or margin from edges)
    - size: 20% relative to image dimension
    - opacity: 10% (0.10 alpha)
    """
    base_img = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
    w_width, w_height = base_img.size

    eff_opacity = opacity / 100.0 if opacity > 1.0 else opacity
    eff_opacity = max(0.01, min(1.0, eff_opacity))

    # Calculate font size relative to image size if size_pct provided
    if size_pct is not None and size_pct > 0:
        eff_font_size = max(12, int(min(w_width, w_height) * (size_pct / 100.0)))
    else:
        eff_font_size = font_size

    # Parse hex color
    hex_clean = color_hex.lstrip("#")
    if len(hex_clean) == 6:
        r, g, b = tuple(int(hex_clean[i:i+2], 16) for i in (0, 2, 4))
    else:
        r, g, b = (30, 58, 138)  # default navy blue

    # If white (#FFFFFF), adjust to visible navy blue on white diagrams
    if (r, g, b) == (255, 255, 255):
        r, g, b = (30, 58, 138)

    text_color = (r, g, b, 255)

    # Load font
    try:
        font = ImageFont.load_default(size=eff_font_size)
    except TypeError:
        font = ImageFont.load_default()

    # Measure text
    temp_img = Image.new("RGBA", (1, 1))
    temp_draw = ImageDraw.Draw(temp_img)
    bbox = temp_draw.textbbox((0, 0), text, font=font)
    text_w = max(1, bbox[2] - bbox[0])
    text_h = max(1, bbox[3] - bbox[1])

    if is_tiled:
        diag = int(math.hypot(w_width, w_height) * 1.8)
        tiled_canvas = Image.new("RGBA", (diag, diag), (0, 0, 0, 0))
        tdraw = ImageDraw.Draw(tiled_canvas)

        step_x = max(text_w + 30, text_w + padding)
        step_y = max(text_h + 30, text_h + padding)

        for y in range(0, diag, step_y):
            for x in range(0, diag, step_x):
                tdraw.text((x, y), text, font=font, fill=text_color)

        if angle != 0:
            tiled_canvas = tiled_canvas.rotate(angle, resample=Image.Resampling.BICUBIC)

        crop_left = (diag - w_width) // 2
        crop_top = (diag - w_height) // 2
        overlay = tiled_canvas.crop((crop_left, crop_top, crop_left + w_width, crop_top + w_height))
    else:
        overlay = Image.new("RGBA", (w_width, w_height), (0, 0, 0, 0))
        pad = max(10, padding // 4)
        stamp = Image.new("RGBA", (text_w + pad * 2, text_h + pad * 2), (0, 0, 0, 0))
        sdraw = ImageDraw.Draw(stamp)
        sdraw.text((pad, pad), text, font=font, fill=text_color)

        if angle != 0:
            stamp = stamp.rotate(angle, expand=True, resample=Image.Resampling.BICUBIC)

        sw, sh = stamp.size
        m = padding
        pos_map = {
            "top-left": (m, m),
            "top-center": ((w_width - sw) // 2, m),
            "top-right": (w_width - sw - m, m),
            "center-left": (m, (w_height - sh) // 2),
            "center": ((w_width - sw) // 2, (w_height - sh) // 2),
            "center-right": (w_width - sw - m, (w_height - sh) // 2),
            "bottom-left": (m, w_height - sh - m),
            "bottom-center": ((w_width - sw) // 2, w_height - sh - m),
            "bottom-right": (w_width - sw - m, w_height - sh - m),
        }
        dest_x, dest_y = pos_map.get(position.lower(), ((w_width - sw) // 2, (w_height - sh) // 2))
        overlay.alpha_composite(stamp, (max(0, min(w_width - sw, dest_x)), max(0, min(w_height - sh, dest_y))))

    # Apply opacity cleanly to the composited overlay
    ro, go, bo, ao = overlay.split()
    ao = ao.point(lambda p: int(p * eff_opacity))
    overlay = Image.merge("RGBA", (ro, go, bo, ao))

    combined = Image.alpha_composite(base_img, overlay)

    out_buf = io.BytesIO()
    combined.convert("RGB").save(out_buf, format="JPEG", quality=100, subsampling=0)
    out_buf.seek(0)
    return out_buf.getvalue()


def apply_image_watermark(
    image_bytes: bytes,
    logo_bytes: bytes,
    scale_pct: int = 20,
    opacity: float = 0.10,
    angle: float = -30.0,
    padding: int = 115,
    position: str = "center",
    is_tiled: bool = False,
) -> bytes:
    """Apply an image/logo watermark onto a base image with presets."""
    base_img = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
    w_width, w_height = base_img.size

    eff_opacity = opacity / 100.0 if opacity > 1.0 else opacity
    eff_opacity = max(0.01, min(1.0, eff_opacity))

    logo = Image.open(io.BytesIO(logo_bytes)).convert("RGBA")
    target_logo_w = max(40, int((w_width * max(1, scale_pct)) / 100))
    target_logo_h = max(20, int((target_logo_w / logo.width) * logo.height))
    logo_resized = logo.resize((target_logo_w, target_logo_h), Image.Resampling.LANCZOS)

    if is_tiled:
        diag = int(math.hypot(w_width, w_height) * 1.8)
        tiled_canvas = Image.new("RGBA", (diag, diag), (0, 0, 0, 0))

        step_x = max(target_logo_w + 30, target_logo_w + padding)
        step_y = max(target_logo_h + 30, target_logo_h + padding)

        for y in range(0, diag - target_logo_h, step_y):
            for x in range(0, diag - target_logo_w, step_x):
                tiled_canvas.alpha_composite(logo_resized, (x, y))

        if angle != 0:
            tiled_canvas = tiled_canvas.rotate(angle, resample=Image.Resampling.BICUBIC)

        crop_left = (diag - w_width) // 2
        crop_top = (diag - w_height) // 2
        overlay = tiled_canvas.crop((crop_left, crop_top, crop_left + w_width, crop_top + w_height))
    else:
        overlay = Image.new("RGBA", (w_width, w_height), (0, 0, 0, 0))
        stamp = logo_resized
        if angle != 0:
            stamp = stamp.rotate(angle, expand=True, resample=Image.Resampling.BICUBIC)

        sw, sh = stamp.size
        m = padding
        pos_map = {
            "top-left": (m, m),
            "top-center": ((w_width - sw) // 2, m),
            "top-right": (w_width - sw - m, m),
            "center-left": (m, (w_height - sh) // 2),
            "center": ((w_width - sw) // 2, (w_height - sh) // 2),
            "center-right": (w_width - sw - m, (w_height - sh) // 2),
            "bottom-left": (m, w_height - sh - m),
            "bottom-center": ((w_width - sw) // 2, w_height - sh - m),
            "bottom-right": (w_width - sw - m, w_height - sh - m),
        }
        dest_x, dest_y = pos_map.get(position.lower(), ((w_width - sw) // 2, (w_height - sh) // 2))
        overlay.alpha_composite(stamp, (max(0, min(w_width - sw, dest_x)), max(0, min(w_height - sh, dest_y))))

    # Apply opacity cleanly to the composite overlay
    r, g, b, a = overlay.split()
    a = a.point(lambda p: int(p * eff_opacity))
    overlay = Image.merge("RGBA", (r, g, b, a))

    combined = Image.alpha_composite(base_img, overlay)

    out_buf = io.BytesIO()
    combined.convert("RGB").save(out_buf, format="JPEG", quality=100, subsampling=0)
    out_buf.seek(0)
    return out_buf.getvalue()


def process_watermark_and_resize(
    image_bytes: bytes,
    watermark_config: dict[str, Any],
    resize_config: dict[str, Any],
) -> tuple[bytes, str]:
    """Execute resize to target preset followed by watermarking in-memory.

    Resizing to target preset first guarantees:
    - Watermark logos and text are rendered razor-sharp without downscale blur.
    - Watermark size and padding match exact requested pixel presets.
    - Blazing fast execution across high-resolution catalogue scans.

    Returns (processed_image_bytes, "jpg").
    """
    target_width = resize_config.get("width", 1000)
    target_height = resize_config.get("height", 1200)
    quality = resize_config.get("quality", 100)

    # 1. Resize single image to target preset (1000x1200 @ 100% quality)
    resized_bytes, _ = resize_single_image(
        image_bytes=image_bytes,
        target_width=target_width,
        target_height=target_height,
        output_format="JPEG",
        quality=quality,
    )

    # 2. Apply watermark with presets directly onto resized image
    logo_bytes = watermark_config.get("logo_bytes")
    if not logo_bytes and watermark_config.get("wm_type") != "text":
        logo_bytes = get_default_logo_bytes()

    if logo_bytes:
        final_bytes = apply_image_watermark(
            image_bytes=resized_bytes,
            logo_bytes=logo_bytes,
            scale_pct=watermark_config.get("scale_pct", watermark_config.get("size_pct", 20)),
            opacity=watermark_config.get("opacity", 0.10),
            angle=watermark_config.get("angle", -30.0),
            padding=watermark_config.get("padding", 115),
            position=watermark_config.get("position", "center"),
            is_tiled=watermark_config.get("is_tiled", True),
        )
    else:
        final_bytes = apply_text_watermark(
            image_bytes=resized_bytes,
            text=watermark_config.get("text", "INDIA SPARE"),
            opacity=watermark_config.get("opacity", 0.10),
            angle=watermark_config.get("angle", -30.0),
            padding=watermark_config.get("padding", 115),
            size_pct=watermark_config.get("size_pct", 20),
            position=watermark_config.get("position", "center"),
            color_hex=watermark_config.get("color", "#1E3A8A"),
            is_tiled=watermark_config.get("is_tiled", True),
        )

    return final_bytes, "jpeg"
