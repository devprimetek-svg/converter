"""Tests for 3D Photorealistic Rendering Engine and API endpoints."""

import io
from fastapi.testclient import TestClient
from PIL import Image

from app.main import app
from app.render_3d import (
    MATERIAL_PRESETS,
    extract_annotations_layer,
    process_isometric_to_photorealistic,
)

client = TestClient(app)


def _create_sample_lineart_image() -> bytes:
    """Create a minimal synthetic isometric line-art diagram in memory."""
    img = Image.new("RGB", (300, 300), color=(255, 255, 255))
    from PIL import ImageDraw
    draw = ImageDraw.Draw(img)

    # Draw simulated seat outline
    draw.polygon([(50, 80), (250, 40), (270, 140), (70, 180)], outline=(30, 30, 30), width=3)
    # Draw simulated grab bar
    draw.arc([160, 120, 260, 200], start=0, end=180, fill=(30, 30, 30), width=3)
    # Draw simulated numbers (callouts)
    draw.text((40, 70), "1", fill=(30, 30, 30))
    draw.text((150, 110), "11", fill=(30, 30, 30))
    draw.line([(45, 75), (60, 90)], fill=(30, 30, 30), width=1)

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_material_presets_exist():
    """Verify that expected material presets are configured."""
    assert "scooter-seat" in MATERIAL_PRESETS
    assert "engine" in MATERIAL_PRESETS
    assert "chassis" in MATERIAL_PRESETS
    assert "studio-clay" in MATERIAL_PRESETS


def test_extract_annotations_layer():
    """Verify callout layer extraction produces non-empty annotation mask."""
    img_bytes = _create_sample_lineart_image()
    img = Image.open(io.BytesIO(img_bytes))
    clean_parts, annotations_overlay = extract_annotations_layer(img)

    assert clean_parts.size == img.size
    assert annotations_overlay.mode == "RGBA"
    assert annotations_overlay.size == img.size


def test_process_isometric_to_photorealistic():
    """Verify end-to-end rendering pipeline succeeds and returns base64 images."""
    img_bytes = _create_sample_lineart_image()
    result = process_isometric_to_photorealistic(
        image_bytes=img_bytes,
        preset_id="scooter-seat",
        custom_accent_hex="#DC2626",
        overlay_callouts=True,
    )

    assert result["success"] is True
    assert result["elapsed_ms"] >= 0
    assert result["render_image_base64"].startswith("data:image/png;base64,")
    assert result["clean_render_base64"].startswith("data:image/png;base64,")
    assert result["annotations_mask_base64"].startswith("data:image/png;base64,")
    assert result["depth_preview_base64"].startswith("data:image/png;base64,")


def test_render3d_presets_api():
    """Verify GET /api/render3d/presets endpoint returns presets list."""
    res = client.get("/api/render3d/presets")
    assert res.status_code == 200
    data = res.json()
    assert "presets" in data
    assert len(data["presets"]) >= 4


def test_render3d_sample_image_api():
    """Verify GET /api/render3d/sample-image returns an image response."""
    res = client.get("/api/render3d/sample-image")
    assert res.status_code == 200
    assert "image" in res.headers.get("content-type", "")


def test_render3d_process_api_upload():
    """Verify POST /api/render3d/process with multipart file upload."""
    img_bytes = _create_sample_lineart_image()
    files = {"file": ("diagram.png", img_bytes, "image/png")}
    data = {"preset_id": "scooter-seat", "overlay_callouts": "true"}

    res = client.post("/api/render3d/process", files=files, data=data)
    assert res.status_code == 200
    result = res.json()
    assert result["success"] is True
    assert "render_image_base64" in result
