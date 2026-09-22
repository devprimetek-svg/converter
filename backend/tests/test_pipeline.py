"""Automated End-to-End Pipeline Tests: PDF -> Excel + Watermark + Resize -> Master ZIP."""

import io
import time
import zipfile
from fastapi.testclient import TestClient
import openpyxl
from PIL import Image
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

from app.main import app
from app.pipeline import pipeline_manager, run_pipeline_worker

client = TestClient(app)


def _create_synthetic_pdf_with_image() -> io.BytesIO:
    """Generate a valid PDF containing tabular text and an embedded raster image."""
    img = Image.new("RGB", (200, 150), color=(220, 40, 40))
    img_buf = io.BytesIO()
    img.save(img_buf, format="JPEG")
    img_buf.seek(0)

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(842, 595))  # Landscape A4

    # Page 1: Cover
    c.drawString(100, 500, "PARTS CATALOGUE")
    c.showPage()

    # Page 2: Figure and Parts Table with Embedded Image
    c.drawString(50, 550, "FIG. 1 CYLINDER HEAD")
    c.drawString(50, 520, "REF.")
    c.drawString(50, 510, "NO.")
    c.drawString(120, 520, "PART NO.")
    c.drawString(240, 520, "DESCRIPTION")
    # Vertical model code: BGPK
    c.drawString(520, 540, "K")
    c.drawString(520, 533, "P")
    c.drawString(520, 526, "G")
    c.drawString(520, 519, "B")
    c.drawString(600, 520, "REMARKS")

    # Row 1
    c.drawString(50, 490, "1")
    c.drawString(120, 490, "B7J-E1102-00")
    c.drawString(240, 490, "CYLINDER HEAD ASSY")
    c.drawString(520, 490, "1")

    # Row 2
    c.drawString(50, 470, "2")
    c.drawString(120, 470, "95022-06010")
    c.drawString(240, 470, "BOLT, FLANGE")
    c.drawString(520, 470, "1")

    # Row 3
    c.drawString(50, 450, "3")
    c.drawString(120, 450, "90430-06817")
    c.drawString(240, 450, "GASKET")
    c.drawString(520, 450, "2")
    c.drawString(600, 450, "UR")

    # Draw illustration image onto the PDF
    c.drawImage(ImageReader(img_buf), 620, 300, width=150, height=120)

    c.drawString(420, 30, "1")
    c.showPage()
    c.save()
    buf.seek(0)
    return buf


def test_pipeline_worker_execution():
    """Verify that pipeline worker executes all modules and compiles the Master ZIP correctly."""
    pdf_buf = _create_synthetic_pdf_with_image()
    pdf_bytes = pdf_buf.getvalue()

    job = pipeline_manager.create_job("Synthetic_Yamaha.pdf")

    wm_config = {
        "text": "CONFIDENTIAL",
        "angle": -30.0,
        "padding": 115,
        "size_pct": 10,
        "opacity": 0.15,
        "color": "#FFFFFF",
        "is_tiled": True,
    }

    resize_config = {
        "width": 1000,
        "height": 1200,
        "quality": 100,
    }

    # Run pipeline worker synchronously for testing
    run_pipeline_worker(
        job=job,
        pdf_bytes=pdf_bytes,
        watermark_config=wm_config,
        resize_config=resize_config,
        clean_parts=True,
    )

    assert job.status == "completed", f"Job failed with: {job.error}"
    assert job.total_rows >= 3
    assert job.total_images_found >= 1
    assert job.excel_bytes is not None
    assert job.zip_bytes is not None
    assert job.zip_filename == "Synthetic_Yamaha_Complete_Bundle.zip"

    # Inspect the Master ZIP package
    zf = zipfile.ZipFile(io.BytesIO(job.zip_bytes))
    filenames = zf.namelist()

    # 1. Check Excel file exists and is valid
    assert "Synthetic_Yamaha_Parts.xlsx" in filenames
    excel_content = zf.read("Synthetic_Yamaha_Parts.xlsx")
    wb = openpyxl.load_workbook(io.BytesIO(excel_content))
    ws = wb.active
    cells = [str(c.value) for row in ws.iter_rows() for c in row if c.value is not None]
    assert any("90430" in c for c in cells)
    assert any("CYLINDER HEAD ASSY" in c for c in cells)

    # 2. Check Summary text file exists
    assert "PROCESSING_SUMMARY.txt" in filenames

    # 3. Check processed images exist inside images/ and meet 1000x1200 preset
    image_files = [f for f in filenames if f.startswith("images/") and f.endswith(".jpg")]
    assert len(image_files) >= 1

    for img_fname in image_files:
        raw_img_data = zf.read(img_fname)
        pil_img = Image.open(io.BytesIO(raw_img_data))
        assert pil_img.size == (1000, 1200), f"Expected (1000, 1200), got {pil_img.size}"
        assert pil_img.format == "JPEG"


def test_pipeline_api_flow():
    """Verify HTTP endpoints /api/pipeline/start, status, and download."""
    pdf_buf = _create_synthetic_pdf_with_image()
    files = {"file": ("Yamaha_Catalogue.pdf", pdf_buf.getvalue(), "application/pdf")}

    data = {
        "watermark_text": "OFFICIAL",
        "watermark_angle": "-30",
        "watermark_padding": "115",
        "watermark_size_pct": "10",
        "watermark_opacity": "0.15",
        "resize_width": "1000",
        "resize_height": "1200",
        "resize_quality": "100",
    }

    # 1. Start pipeline
    res = client.post("/api/pipeline/start", files=files, data=data)
    assert res.status_code == 200
    res_data = res.json()
    assert "job_id" in res_data
    job_id = res_data["job_id"]

    # 2. Poll status until completed
    start_time = time.time()
    status_data = None
    while time.time() - start_time < 15:
        st_res = client.get(f"/api/pipeline/status/{job_id}")
        assert st_res.status_code == 200
        status_data = st_res.json()
        if status_data["status"] in ("completed", "error"):
            break
        time.sleep(0.2)

    assert status_data is not None
    assert status_data["status"] == "completed", f"Status error: {status_data.get('error')}"
    assert status_data["excel_ready"] is True
    assert status_data["zip_ready"] is True

    # 3. Test Master ZIP download
    dl_res = client.get(f"/api/pipeline/download/{job_id}")
    assert dl_res.status_code == 200
    assert dl_res.headers["content-type"] == "application/zip"
    assert "attachment; filename=" in dl_res.headers.get("content-disposition", "")
    assert dl_res.content[:4] == b"PK\x03\x04"

    # 4. Test Excel-only download
    excel_res = client.get(f"/api/pipeline/download-excel/{job_id}")
    assert excel_res.status_code == 200
    assert excel_res.headers["content-type"] == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    assert excel_res.content[:4] == b"PK\x03\x04"
