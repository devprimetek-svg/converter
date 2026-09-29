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
    quality: int = 95,
    preserve_aspect_ratio: bool = True,
) -> tuple[bytes, str]:
    """Resize an image in-memory with high-quality Lanczos filtering and anti-aliasing.

    If preserve_aspect_ratio is True:
    - Maintains the original aspect ratio without distortion or stretching.
    - Proportionally scales image using high-quality Lanczos filter.
    - Centers the scaled image onto a clean white canvas of exact (target_width, target_height).
    If preserve_aspect_ratio is False:
    - Stretches directly to (target_width, target_height).
    If target_width <= 0 or target_height <= 0:
    - Retains original dimensions without downscaling.
    """
    img = Image.open(io.BytesIO(image_bytes))
    orig_format = img.format or "PNG"

    if target_width <= 0 or target_height <= 0:
        resized = img
    elif preserve_aspect_ratio:
        src_w, src_h = img.size
        scale = min(target_width / max(1, src_w), target_height / max(1, src_h))
        new_w = max(1, int(round(src_w * scale)))
        new_h = max(1, int(round(src_h * scale)))

        scaled = img.resize((new_w, new_h), Image.Resampling.LANCZOS)

        canvas = Image.new("RGB", (target_width, target_height), (255, 255, 255))
        paste_x = (target_width - new_w) // 2
        paste_y = (target_height - new_h) // 2

        if scaled.mode in ("RGBA", "LA") or (scaled.mode == "P" and "transparency" in scaled.info):
            alpha = scaled.convert("RGBA").split()[-1]
            canvas.paste(scaled.convert("RGB"), (paste_x, paste_y), mask=alpha)
        else:
            canvas.paste(scaled.convert("RGB"), (paste_x, paste_y))
        resized = canvas
    else:
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
        resized.save(
            out_buf,
            format=fmt,
            quality=max(1, min(100, quality)),
            subsampling=0,
            optimize=True,
        )
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
        pil_angle = -angle
        diag = int(math.hypot(w_width, w_height))
        step_x = max(160, int(eff_font_size * 6), text_w + padding)
        step_y = max(90, int(eff_font_size * 3.5), text_h + padding)

        canvas_size = int(diag * 2 + max(text_w, text_h) * 2)
        tiled_canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
        tdraw = ImageDraw.Draw(tiled_canvas)
        cx = canvas_size // 2
        cy = canvas_size // 2

        y = -diag
        while y <= diag:
            x = -diag
            while x <= diag:
                px = cx + x - text_w // 2
                py = cy + y - text_h // 2
                tdraw.text((px, py), text, font=font, fill=text_color)
                x += step_x
            y += step_y

        if pil_angle != 0:
            tiled_canvas = tiled_canvas.rotate(pil_angle, resample=Image.Resampling.BICUBIC)

        crop_x = cx - w_width // 2
        crop_y = cy - w_height // 2
        overlay = tiled_canvas.crop((crop_x, crop_y, crop_x + w_width, crop_y + w_height))
    else:
        overlay = Image.new("RGBA", (w_width, w_height), (0, 0, 0, 0))
        pad = max(10, padding // 4)
        stamp = Image.new("RGBA", (text_w + pad * 2, text_h + pad * 2), (0, 0, 0, 0))
        sdraw = ImageDraw.Draw(stamp)
        sdraw.text((pad, pad), text, font=font, fill=text_color)

        if angle != 0:
            stamp = stamp.rotate(-angle, expand=True, resample=Image.Resampling.BICUBIC)

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
        # In HTML5 Canvas, negative angle (-30) rotates counter-clockwise (upwards-right tilt).
        # In PIL, positive angle rotates counter-clockwise.
        # Negate angle for PIL to match HTML5 Canvas orientation identically.
        pil_angle = -angle

        diag = int(math.hypot(w_width, w_height))
        # Spacing matches WatermarkTool.tsx: stepX = targetLogoW * 2.2, stepY = targetLogoH * 2.2
        step_x = max(int(target_logo_w * 2.2), target_logo_w + padding)
        step_y = max(int(target_logo_h * 2.2), target_logo_h + padding)

        canvas_size = int(diag * 2 + max(target_logo_w, target_logo_h) * 2)
        tiled_canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
        cx = canvas_size // 2
        cy = canvas_size // 2

        # Centered loop matching WatermarkTool.tsx exactly
        y = -diag
        while y <= diag:
            x = -diag
            while x <= diag:
                px = cx + x - target_logo_w // 2
                py = cy + y - target_logo_h // 2
                tiled_canvas.alpha_composite(logo_resized, (px, py))
                x += step_x
            y += step_y

        if pil_angle != 0:
            tiled_canvas = tiled_canvas.rotate(pil_angle, resample=Image.Resampling.BICUBIC)

        crop_x = cx - w_width // 2
        crop_y = cy - w_height // 2
        overlay = tiled_canvas.crop((crop_x, crop_y, crop_x + w_width, crop_y + w_height))
    else:
        overlay = Image.new("RGBA", (w_width, w_height), (0, 0, 0, 0))
        stamp = logo_resized
        if angle != 0:
            # For single stamps, match canvas coordinate rotation
            stamp = stamp.rotate(-angle, expand=True, resample=Image.Resampling.BICUBIC)

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



def pad_jpeg_com(data: bytes, target_bytes: int) -> bytes:
    """Pad a JPEG using standard COM (0xFF 0xFE) marker payloads without altering a single pixel."""
    needed = target_bytes - len(data)
    if needed < 4 or data[:2] != b"\xFF\xD8":
        return data

    padding_chunks = bytearray()
    remaining = needed
    while remaining >= 4:
        payload_len = min(65533, remaining - 4)
        chunk = b"\xFF\xFE" + (payload_len + 2).to_bytes(2, "big") + (b"\x00" * payload_len)
        padding_chunks.extend(chunk)
        remaining -= len(chunk)

    return data[:2] + bytes(padding_chunks) + data[2:]


def compress_to_target_kb(
    image_bytes_or_pil: bytes | Image.Image,
    min_kb: int = 59,
    max_kb: int = 69,
    min_quality: int = 15,
    allow_downscale: bool = False,
) -> bytes:
    """Compress or package an image so its JPEG file size is strictly within target size constraints.

    Clarity & Anti-Pixelation Guarantees:
    1. NEVER downscales image dimensions when allow_downscale=False (default).
       The image strictly retains its full target resolution (e.g. 1000x1200) so zooming in
       reveals sharp lines and text without pixelation.
    2. Adaptive Noise Elimination: If background scan paper noise inflates file size, clean near-white
       pixels (>= 236) to pure white (#FFFFFF), preserving black lines/text with razor-sharp contrast.
    3. Uses progressive and optimized JPEG encoding with 4:4:4 chroma (subsampling=0).
    4. If the image is smaller than min_kb: injects standard JPEG COM marker padding to reach midpoint (~64 KB).
    """
    if isinstance(image_bytes_or_pil, Image.Image):
        pil_img = image_bytes_or_pil
    else:
        pil_img = Image.open(io.BytesIO(image_bytes_or_pil))

    if pil_img.mode != "RGB":
        pil_img = pil_img.convert("RGB")

    if min_kb <= 0 or max_kb <= 0 or min_kb > max_kb:
        buf = io.BytesIO()
        pil_img.save(buf, format="JPEG", quality=98, subsampling=0, optimize=True)
        return buf.getvalue()

    min_bytes = int(min_kb * 1024)
    max_bytes = int(max_kb * 1024)
    target_bytes = (min_bytes + max_bytes) // 2

    def _encode(img: Image.Image, q: int) -> bytes:
        b = io.BytesIO()
        img.save(b, format="JPEG", quality=q, optimize=True, progressive=True)
        return b.getvalue()

    # Step 1: Check highest quality (95)
    d95 = _encode(pil_img, 95)
    sz95 = len(d95)
    if sz95 < min_bytes:
        return pad_jpeg_com(d95, target_bytes)
    if min_bytes <= sz95 <= max_bytes:
        return d95

    # Step 2: Check if background scan grain/noise is present at low quality
    curr_img = pil_img
    d_check = _encode(pil_img, 15)
    if len(d_check) > max_bytes:
        lut = [i if i < 236 else 255 for i in range(256)]
        curr_img = pil_img.point(lut * 3)

    # Step 3: Binary search on JPEG quality [min_quality..95]
    low, high = max(5, min_quality), 95
    best_candidate: Optional[bytes] = None
    best_diff = float("inf")

    for _ in range(10):
        mid = (low + high) // 2
        data = _encode(curr_img, mid)
        sz = len(data)

        if min_bytes <= sz <= max_bytes:
            return data

        diff = abs(sz - target_bytes)
        if diff < best_diff:
            best_diff = diff
            best_candidate = data

        if sz < min_bytes:
            low = mid + 1
        else:
            high = mid - 1

    if best_candidate is not None:
        if min_bytes <= len(best_candidate) <= max_bytes:
            return best_candidate
        if len(best_candidate) < min_bytes:
            return pad_jpeg_com(best_candidate, target_bytes)

    # Step 4: If still > max_bytes, apply stronger background whitening (>= 220)
    if best_candidate is not None and len(best_candidate) > max_bytes:
        lut2 = [i if i < 220 else 255 for i in range(256)]
        cleaner_img = pil_img.point(lut2 * 3)
        low, high = 5, 90
        for _ in range(8):
            mid = (low + high) // 2
            data = _encode(cleaner_img, mid)
            sz = len(data)
            if min_bytes <= sz <= max_bytes:
                return data
            if sz < min_bytes:
                low = mid + 1
            else:
                high = mid - 1
            diff = abs(sz - target_bytes)
            if diff < best_diff:
                best_diff = diff
                best_candidate = data

        if best_candidate is not None:
            if min_bytes <= len(best_candidate) <= max_bytes:
                return best_candidate
            if len(best_candidate) < min_bytes:
                return pad_jpeg_com(best_candidate, target_bytes)

    # Step 5: Only downscale if explicitly allowed by caller (never for 1000x1200 preset)
    if allow_downscale and best_candidate is not None and len(best_candidate) > max_bytes:
        scaled_img = curr_img
        while len(best_candidate) > max_bytes and scaled_img.width > 400:
            new_w = max(300, int(scaled_img.width * 0.90))
            new_h = max(300, int(scaled_img.height * 0.90))
            scaled_img = scaled_img.resize((new_w, new_h), Image.Resampling.LANCZOS)
            low, high = 5, 95
            for _ in range(8):
                mid = (low + high) // 2
                data = _encode(scaled_img, mid)
                sz = len(data)
                if min_bytes <= sz <= max_bytes:
                    return data
                if sz < min_bytes:
                    low = mid + 1
                else:
                    high = mid - 1
                diff = abs(sz - target_bytes)
                if diff < best_diff:
                    best_diff = diff
                    best_candidate = data

    return best_candidate if best_candidate is not None else d95


def process_watermark_and_resize(
    image_bytes: bytes,
    watermark_config: dict[str, Any],
    resize_config: dict[str, Any],
) -> tuple[bytes, str]:
    """Execute resize to target preset followed by watermarking in-memory.

    Clarity & Sharpness Guarantees:
    - Maintains exact aspect ratio with centered placement on clean canvas (zero distortion).
    - Watermark logos and text rendered with high-res alpha composite.
    - If high_clarity mode is active (or target_min_kb == 0), preserves 100% crisp resolution.
    - If target_min_kb/max_kb requested, packages cleanly without downscaling resolution.

    Returns (processed_image_bytes, "jpeg").
    """
    target_width = resize_config.get("width", 1000)
    target_height = resize_config.get("height", 1200)
    quality = resize_config.get("quality", 100)
    target_min_kb = resize_config.get("target_min_kb", 59)
    target_max_kb = resize_config.get("target_max_kb", 69)
    preserve_aspect = resize_config.get("preserve_aspect_ratio", True)
    high_clarity = resize_config.get("high_clarity", False)

    # 1. Resize single image with Lanczos and aspect ratio preservation
    resized_bytes, _ = resize_single_image(
        image_bytes=image_bytes,
        target_width=target_width,
        target_height=target_height,
        output_format="JPEG",
        quality=quality,
        preserve_aspect_ratio=preserve_aspect,
    )

    # 2. Apply watermark with presets directly onto resized image
    logo_bytes = watermark_config.get("logo_bytes")
    if not logo_bytes and watermark_config.get("wm_type") != "text":
        logo_bytes = get_default_logo_bytes()

    if logo_bytes:
        watermarked_bytes = apply_image_watermark(
            image_bytes=resized_bytes,
            logo_bytes=logo_bytes,
            scale_pct=watermark_config.get("scale_pct", watermark_config.get("size_pct", 25)),
            opacity=watermark_config.get("opacity", 0.10),
            angle=watermark_config.get("angle", -30.0),
            padding=watermark_config.get("padding", 115),
            position=watermark_config.get("position", "center"),
            is_tiled=watermark_config.get("is_tiled", True),
        )
    else:
        watermarked_bytes = apply_text_watermark(
            image_bytes=resized_bytes,
            text=watermark_config.get("text", "IndiaSpare"),
            opacity=watermark_config.get("opacity", 0.10),
            angle=watermark_config.get("angle", -30.0),
            padding=watermark_config.get("padding", 115),
            size_pct=watermark_config.get("size_pct", 25),
            position=watermark_config.get("position", "center"),
            color_hex=watermark_config.get("color", "#1E3A8A"),
            is_tiled=watermark_config.get("is_tiled", True),
        )

    # 3. Size packaging
    if high_clarity and (target_min_kb <= 0 or target_max_kb <= 0):
        final_bytes = watermarked_bytes
    elif target_min_kb and target_max_kb and target_min_kb > 0 and target_max_kb >= target_min_kb:
        final_bytes = compress_to_target_kb(
            watermarked_bytes,
            min_kb=target_min_kb,
            max_kb=target_max_kb,
            min_quality=15,
            allow_downscale=False,
        )
    else:
        final_bytes = watermarked_bytes

    return final_bytes, "jpeg"
