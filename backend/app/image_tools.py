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
                img_format = pil_img.format or "PNG"

                # Standardize file extension
                ext = img_format.lower()
                if ext == "jpeg":
                    ext = "jpg"

                filename = f"page_{page_num}_img_{img_idx + 1}.{ext}"

                # Generate compact base64 thumbnail for fast frontend display
                thumb = pil_img.copy()
                thumb.thumbnail((260, 260))
                thumb_io = io.BytesIO()
                # Save thumbnail as JPEG for speed/compression unless transparent
                if thumb.mode in ("RGBA", "LA") or (thumb.mode == "P" and "transparency" in thumb.info):
                    thumb.save(thumb_io, format="PNG")
                    mime_type = "image/png"
                else:
                    thumb = thumb.convert("RGB")
                    thumb.save(thumb_io, format="JPEG", quality=75)
                    mime_type = "image/jpeg"

                thumb_base64 = base64.b64encode(thumb_io.getvalue()).decode("utf-8")
                data_url = f"data:{mime_type};base64,{thumb_base64}"

                image_id = f"img_{uuid.uuid4().hex[:8]}"

                extracted.append({
                    "id": image_id,
                    "filename": filename,
                    "page": page_num,
                    "width": width,
                    "height": height,
                    "format": img_format,
                    "size_bytes": len(img_data),
                    "thumbnail_url": data_url,
                    "raw_bytes": img_data,
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
    opacity: float = 0.5,
    angle: float = -30.0,
    position: str = "center",
    color_hex: str = "#FFFFFF",
    is_tiled: bool = False,
) -> bytes:
    """Apply a text watermark onto an image in-memory."""
    base_img = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
    w_width, w_height = base_img.size

    # Parse hex color
    hex_clean = color_hex.lstrip("#")
    if len(hex_clean) == 6:
        r, g, b = tuple(int(hex_clean[i:i+2], 16) for i in (0, 2, 4))
    else:
        r, g, b = (255, 255, 255)
    alpha = int(max(0.0, min(1.0, opacity)) * 255)
    text_color = (r, g, b, alpha)

    # Load default font
    try:
        font = ImageFont.load_default(size=font_size)
    except TypeError:
        font = ImageFont.load_default()

    if is_tiled:
        # Create transparent overlay for tiled text
        overlay = Image.new("RGBA", (w_width, w_height), (255, 255, 255, 0))
        draw = ImageDraw.Draw(overlay)

        # Create single rotated watermark tile
        step_x = max(180, font_size * 6)
        step_y = max(100, font_size * 3)

        for y in range(-w_height // 2, w_height * 2, step_y):
            for x in range(-w_width // 2, w_width * 2, step_x):
                # Render rotated text tile
                tile = Image.new("RGBA", (step_x, step_y), (255, 255, 255, 0))
                tdraw = ImageDraw.Draw(tile)
                tdraw.text((10, step_y // 2 - font_size // 2), text, font=font, fill=text_color)
                if angle != 0:
                    tile = tile.rotate(angle, expand=False, resample=Image.Resampling.BICUBIC)
                overlay.paste(tile, (x, y), mask=tile)

        combined = Image.alpha_composite(base_img, overlay)
    else:
        # Single position watermark
        overlay = Image.new("RGBA", (w_width, w_height), (255, 255, 255, 0))

        # Measure text
        temp_img = Image.new("RGBA", (1, 1))
        temp_draw = ImageDraw.Draw(temp_img)
        bbox = temp_draw.textbbox((0, 0), text, font=font)
        text_w = bbox[2] - bbox[0]
        text_h = bbox[3] - bbox[1]

        # Render text onto isolated canvas to rotate
        pad = 20
        stamp = Image.new("RGBA", (text_w + pad * 2, text_h + pad * 2), (255, 255, 255, 0))
        sdraw = ImageDraw.Draw(stamp)
        sdraw.text((pad, pad), text, font=font, fill=text_color)

        if angle != 0:
            stamp = stamp.rotate(angle, expand=True, resample=Image.Resampling.BICUBIC)

        sw, sh = stamp.size

        # Determine target coordinates based on position
        pos_map = {
            "top-left": (20, 20),
            "top-center": ((w_width - sw) // 2, 20),
            "top-right": (w_width - sw - 20, 20),
            "center-left": (20, (w_height - sh) // 2),
            "center": ((w_width - sw) // 2, (w_height - sh) // 2),
            "center-right": (w_width - sw - 20, (w_height - sh) // 2),
            "bottom-left": (20, w_height - sh - 20),
            "bottom-center": ((w_width - sw) // 2, w_height - sh - 20),
            "bottom-right": (w_width - sw - 20, w_height - sh - 20),
        }
        dest_x, dest_y = pos_map.get(position.lower(), ((w_width - sw) // 2, (w_height - sh) // 2))

        overlay.paste(stamp, (dest_x, dest_y), mask=stamp)
        combined = Image.alpha_composite(base_img, overlay)

    out_buf = io.BytesIO()
    combined.convert("RGB").save(out_buf, format="JPEG", quality=90)
    out_buf.seek(0)
    return out_buf.getvalue()
