"""Image processing utilities for PDF Image Extraction, Bulk Resizing, and Watermarking."""

from __future__ import annotations

import base64
import io
import math
import uuid
import zipfile
from typing import Any, Optional

from PIL import Image, ImageDraw, ImageFont
from pypdf import PdfReader


def extract_images_from_pdf(pdf_bytes: bytes) -> list[dict[str, Any]]:
    """Extract all embedded raster images from a PDF document in-memory.

    Returns a list of image metadata dicts including base64 preview thumbnails
    and raw image bytes for subsequent export.
    """
    reader = PdfReader(io.BytesIO(pdf_bytes))
    extracted: list[dict[str, Any]] = []
    seen_hashes: set[int] = set()

    for page_idx, page in enumerate(reader.pages):
        page_num = page_idx + 1
        page_images = getattr(page, "images", [])

        for img_idx, img_obj in enumerate(page_images):
            try:
                img_data = img_obj.data
                # Deduplicate identical raw streams if repeated on multiple pages
                data_hash = hash(img_data[:1000] + img_data[-1000:])
                is_duplicate = data_hash in seen_hashes
                seen_hashes.add(data_hash)

                pil_img = Image.open(io.BytesIO(img_data))
                width, height = pil_img.size

                # Convert to RGB (flatten transparency onto clean white background if needed)
                if pil_img.mode in ("RGBA", "LA") or (pil_img.mode == "P" and "transparency" in pil_img.info):
                    bg = Image.new("RGB", pil_img.size, (255, 255, 255))
                    alpha_mask = pil_img.convert("RGBA").split()[-1]
                    bg.paste(pil_img.convert("RGB"), mask=alpha_mask)
                    pil_rgb = bg
                else:
                    pil_rgb = pil_img.convert("RGB")

                # Always export extracted image in JPG format
                jpg_buf = io.BytesIO()
                pil_rgb.save(jpg_buf, format="JPEG", quality=95)
                jpg_bytes = jpg_buf.getvalue()

                filename = f"page_{page_num}_img_{img_idx + 1}.jpg"

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
                    "page": page_num,
                    "width": width,
                    "height": height,
                    "format": "JPEG",
                    "size_bytes": len(jpg_bytes),
                    "thumbnail_url": data_url,
                    "raw_bytes": jpg_bytes,
                    "is_duplicate": is_duplicate,
                })
            except Exception as e:
                # Silently skip corrupted single image stream and continue
                continue

    return extracted


def create_images_zip(image_items: list[tuple[str, bytes]]) -> io.BytesIO:
    """Package a list of (filename, file_bytes) tuples into an in-memory ZIP archive."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for fname, data in image_items:
            zip_file.writestr(fname, data)
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
    if fmt in ("JPEG", "JPG", "WEBP"):
        resized.save(out_buf, format=fmt, quality=max(1, min(100, quality)))
    else:
        resized.save(out_buf, format=fmt)

    out_buf.seek(0)
    ext = fmt.lower()
    if ext == "jpeg":
        ext = "jpg"
    return out_buf.getvalue(), ext


def apply_text_watermark(
    image_bytes: bytes,
    text: str,
    font_size: int = 36,
    opacity: float = 0.15,
    angle: float = -30.0,
    position: str = "center",
    color_hex: str = "#FFFFFF",
    is_tiled: bool = True,
    padding: int = 115,
    size_pct: Optional[int] = 10,
) -> bytes:
    """Apply a text watermark onto an image in-memory with requested preset parameters.

    Presets:
    - rotation: -30.0 degrees
    - padding: 115 px (spacing between tiles or margin from edges)
    - size: 10% relative to image dimension
    - opacity: 15% (0.15 alpha)
    """
    base_img = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
    w_width, w_height = base_img.size

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
        r, g, b = (255, 255, 255)
    alpha = int(max(0.0, min(1.0, opacity)) * 255)
    text_color = (r, g, b, alpha)

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
        # Calculate diagonal span to ensure full coverage under any rotation angle (e.g. -30°)
        diag = int(math.hypot(w_width, w_height) * 1.8)
        tiled_canvas = Image.new("RGBA", (diag, diag), (255, 255, 255, 0))
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

        combined = Image.alpha_composite(base_img, overlay)
    else:
        overlay = Image.new("RGBA", (w_width, w_height), (255, 255, 255, 0))
        pad = max(10, padding // 4)
        stamp = Image.new("RGBA", (text_w + pad * 2, text_h + pad * 2), (255, 255, 255, 0))
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

        overlay.paste(stamp, (dest_x, dest_y), mask=stamp)
        combined = Image.alpha_composite(base_img, overlay)

    out_buf = io.BytesIO()
    combined.convert("RGB").save(out_buf, format="JPEG", quality=95)
    out_buf.seek(0)
    return out_buf.getvalue()


def apply_image_watermark(
    image_bytes: bytes,
    logo_bytes: bytes,
    scale_pct: int = 10,
    opacity: float = 0.15,
    angle: float = -30.0,
    padding: int = 115,
    position: str = "center",
    is_tiled: bool = False,
) -> bytes:
    """Apply an image/logo watermark onto a base image with presets."""
    base_img = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
    w_width, w_height = base_img.size

    logo = Image.open(io.BytesIO(logo_bytes)).convert("RGBA")
    target_logo_w = max(20, int((w_width * max(1, scale_pct)) / 100))
    target_logo_h = max(20, int((target_logo_w / logo.width) * logo.height))
    logo_resized = logo.resize((target_logo_w, target_logo_h), Image.Resampling.LANCZOS)

    # Adjust opacity
    alpha_factor = max(0.0, min(1.0, opacity))
    r, g, b, a = logo_resized.split()
    a = a.point(lambda p: int(p * alpha_factor))
    logo_resized = Image.merge("RGBA", (r, g, b, a))

    if is_tiled:
        diag = int(math.hypot(w_width, w_height) * 1.8)
        tiled_canvas = Image.new("RGBA", (diag, diag), (255, 255, 255, 0))

        step_x = max(target_logo_w + 30, target_logo_w + padding)
        step_y = max(target_logo_h + 30, target_logo_h + padding)

        for y in range(0, diag, step_y):
            for x in range(0, diag, step_x):
                tiled_canvas.paste(logo_resized, (x, y), mask=logo_resized)

        if angle != 0:
            tiled_canvas = tiled_canvas.rotate(angle, resample=Image.Resampling.BICUBIC)

        crop_left = (diag - w_width) // 2
        crop_top = (diag - w_height) // 2
        overlay = tiled_canvas.crop((crop_left, crop_top, crop_left + w_width, crop_top + w_height))
        combined = Image.alpha_composite(base_img, overlay)
    else:
        overlay = Image.new("RGBA", (w_width, w_height), (255, 255, 255, 0))
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
        overlay.paste(stamp, (dest_x, dest_y), mask=stamp)
        combined = Image.alpha_composite(base_img, overlay)

    out_buf = io.BytesIO()
    combined.convert("RGB").save(out_buf, format="JPEG", quality=95)
    out_buf.seek(0)
    return out_buf.getvalue()


def process_watermark_and_resize(
    image_bytes: bytes,
    watermark_config: dict[str, Any],
    resize_config: dict[str, Any],
) -> tuple[bytes, str]:
    """Execute watermark then resize sequentially in-memory.

    Returns (processed_image_bytes, "jpg").
    """
    # 1. Apply watermark with presets
    logo_bytes = watermark_config.get("logo_bytes")
    if logo_bytes:
        wm_bytes = apply_image_watermark(
            image_bytes=image_bytes,
            logo_bytes=logo_bytes,
            scale_pct=watermark_config.get("scale_pct", 10),
            opacity=watermark_config.get("opacity", 0.15),
            angle=watermark_config.get("angle", -30.0),
            padding=watermark_config.get("padding", 115),
            position=watermark_config.get("position", "center"),
            is_tiled=watermark_config.get("is_tiled", True),
        )
    else:
        wm_bytes = apply_text_watermark(
            image_bytes=image_bytes,
            text=watermark_config.get("text", "CONFIDENTIAL"),
            opacity=watermark_config.get("opacity", 0.15),
            angle=watermark_config.get("angle", -30.0),
            padding=watermark_config.get("padding", 115),
            size_pct=watermark_config.get("size_pct", 10),
            position=watermark_config.get("position", "center"),
            color_hex=watermark_config.get("color", "#FFFFFF"),
            is_tiled=watermark_config.get("is_tiled", True),
        )

    # 2. Resize to requested preset (1000x1200 @ 100% quality)
    resized_bytes, ext = resize_single_image(
        image_bytes=wm_bytes,
        target_width=resize_config.get("width", 1000),
        target_height=resize_config.get("height", 1200),
        output_format="JPEG",
        quality=resize_config.get("quality", 100),
    )

    return resized_bytes, "jpg"
