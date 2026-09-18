"""Tests for PDF image extraction, image resizing, watermarking, and ZIP utilities."""

import io
from PIL import Image
from reportlab.pdfgen import canvas
from fastapi.testclient import TestClient

from app.main import app
from app.image_tools import (
    apply_text_watermark,
    create_images_zip,
    extract_images_from_pdf,
    resize_single_image,
)

client = TestClient(app)


def _create_pdf_with_image() -> io.BytesIO:
    """Create an in-memory PDF containing an embedded PNG image using ReportLab."""
    # 1. Create a dummy image
    img = Image.new("RGB", (100, 80), color=(255, 0, 0))
    img_buf = io.BytesIO()
    img.save(img_buf, format="PNG")
    img_buf.seek(0)

    # 2. Draw image into PDF
    pdf_buf = io.BytesIO()
    c = canvas.Canvas(pdf_buf, pagesize=(400, 400))
    from reportlab.lib.utils import ImageReader
    reader = ImageReader(img_buf)
    c.drawImage(reader, 50, 50, width=100, height=80)
    c.showPage()
    c.save()
    pdf_buf.seek(0)
    return pdf_buf


def test_extract_images_from_pdf():
    pdf_buf = _create_pdf_with_image()
    extracted = extract_images_from_pdf(pdf_buf.getvalue())
    assert len(extracted) >= 1
    first = extracted[0]
    assert first["width"] == 100
    assert first["height"] == 80
    assert first["filename"].endswith(".jpg")
    assert first["format"] == "JPEG"
    assert "data:image/jpeg;base64," in first["thumbnail_url"]
    assert len(first["raw_bytes"]) > 0


def test_resize_single_image():
    img = Image.new("RGB", (200, 100), color=(0, 255, 0))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")

    resized_bytes, ext = resize_single_image(
        image_bytes=buf.getvalue(),
        target_width=50,
        target_height=25,
        output_format="JPEG",
        quality=80,
    )
    assert ext == "jpg"
    out_img = Image.open(io.BytesIO(resized_bytes))
    assert out_img.size == (50, 25)


def test_apply_text_watermark():
    img = Image.new("RGB", (300, 200), color=(50, 100, 150))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")

    wm_bytes = apply_text_watermark(
        image_bytes=buf.getvalue(),
        text="COPYRIGHT",
        font_size=24,
        opacity=0.6,
        position="center",
    )
    assert len(wm_bytes) > 0
    wm_img = Image.open(io.BytesIO(wm_bytes))
    assert wm_img.size == (300, 200)


def test_apply_tiled_30deg_watermark():
    img = Image.new("RGB", (400, 300), color=(100, 150, 200))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")

    wm_bytes = apply_text_watermark(
        image_bytes=buf.getvalue(),
        text="TILED_30DEG",
        font_size=20,
        opacity=0.4,
        angle=30.0,
        is_tiled=True,
    )
    assert len(wm_bytes) > 0
    wm_img = Image.open(io.BytesIO(wm_bytes))
    assert wm_img.size == (400, 300)


def test_create_images_zip():
    items = [
        ("test1.txt", b"Hello 1"),
        ("test2.txt", b"Hello 2"),
    ]
    zip_buf = create_images_zip(items)
    assert zip_buf.getvalue()[:4] == b"PK\x03\x04"


def test_pdf_extract_images_api():
    pdf_buf = _create_pdf_with_image()
    files = {"file": ("document_with_images.pdf", pdf_buf.getvalue(), "application/pdf")}

    response = client.post("/api/pdf/extract-images", files=files)
    assert response.status_code == 200
    data = response.json()
    assert "session_id" in data
    assert data["total_images"] >= 1
    session_id = data["session_id"]
    image_id = data["images"][0]["id"]

    # Test single image fetch
    img_res = client.get(f"/api/pdf/images/{session_id}/{image_id}")
    assert img_res.status_code == 200

    # Test download ZIP
    zip_res = client.post("/api/pdf/download-images-zip", json={"session_id": session_id})
    assert zip_res.status_code == 200
    assert zip_res.content[:4] == b"PK\x03\x04"
