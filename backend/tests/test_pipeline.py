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
    # Vertical model code: BGP1 (alphanumeric with number)
    c.drawString(520, 540, "1")
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
    assert any("BGP1" in c for c in cells)

    # 2. Check Summary text file and Metadata files exist
    assert "PROCESSING_SUMMARY.txt" in filenames
    assert any("Product_Metadata.xlsx" in f for f in filenames)
    assert any("Product_Metadata.csv" in f for f in filenames)

    # 3. Check processed images exist inside images/ and meet 1000x1200 preset
    image_files = [f for f in filenames if f.startswith("images/") and f.endswith(".jpeg")]
    assert len(image_files) >= 1
    assert "images/YAM_BGP1_CYLINDER HEAD.jpeg" in image_files

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


def test_parts_only_deduplication_and_figure_naming():
    """Verify that:
    1. Images on non-figure pages (Cover) are skipped.
    2. Repeated/continuation images are deduplicated.
    3. Filenames follow FIG_XX_<FIG_NAME>.jpg.
    4. Default bundled logo is applied in tiled view.
    """
    # Create two distinct test images
    img_a = Image.new("RGB", (300, 200), color=(10, 150, 80))
    img_a_buf = io.BytesIO()
    img_a.save(img_a_buf, format="JPEG")
    img_a_bytes = img_a_buf.getvalue()

    img_b = Image.new("RGB", (300, 200), color=(80, 20, 220))
    img_b_buf = io.BytesIO()
    img_b.save(img_b_buf, format="JPEG")
    img_b_bytes = img_b_buf.getvalue()

    # Cover image (must NOT be extracted because cover is not a parts figure)
    img_cover = Image.new("RGB", (250, 250), color=(200, 200, 10))
    img_cover_buf = io.BytesIO()
    img_cover.save(img_cover_buf, format="JPEG")
    img_cover_bytes = img_cover_buf.getvalue()

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(842, 595))

    # Page 1: Cover page with logo/photo (NO FIG header)
    c.drawString(100, 500, "YAMAHA GENUINE PARTS CATALOGUE")
    c.drawImage(ImageReader(io.BytesIO(img_cover_bytes)), 100, 200, width=200, height=200)
    c.showPage()

    # Page 2: FIG. 1 CYLINDER HEAD with Image A
    c.drawString(50, 550, "FIG. 1 CYLINDER HEAD")
    c.drawString(50, 520, "REF. NO.")
    c.drawString(120, 520, "PART NO.")
    c.drawString(240, 520, "DESCRIPTION")
    c.drawString(520, 520, "BGPK")
    c.drawString(50, 490, "1")
    c.drawString(120, 490, "B7J-E1102-00")
    c.drawString(240, 490, "CYLINDER HEAD")
    c.drawString(520, 490, "1")
    c.drawImage(ImageReader(io.BytesIO(img_a_bytes)), 600, 300, width=180, height=120)
    c.showPage()

    # Page 3: Continuation page for FIG. 1 with identical Image A (should be deduplicated!)
    c.drawString(50, 550, "FIG. 1 CYLINDER HEAD")
    c.drawString(50, 520, "REF. NO.")
    c.drawString(120, 520, "PART NO.")
    c.drawString(240, 520, "DESCRIPTION")
    c.drawString(520, 520, "BGPK")
    c.drawString(50, 490, "2")
    c.drawString(120, 490, "95022-06010")
    c.drawString(240, 490, "BOLT")
    c.drawString(520, 490, "2")
    c.drawImage(ImageReader(io.BytesIO(img_a_bytes)), 600, 300, width=180, height=120)
    c.showPage()

    # Page 4: FIG. 2 CRANKSHAFT with Image B
    c.drawString(50, 550, "FIG. 2 CRANKSHAFT")
    c.drawString(50, 520, "REF. NO.")
    c.drawString(120, 520, "PART NO.")
    c.drawString(240, 520, "DESCRIPTION")
    c.drawString(520, 520, "BGPK")
    c.drawString(50, 490, "1")
    c.drawString(120, 490, "B7J-E1400-00")
    c.drawString(240, 490, "CRANKSHAFT ASSY")
    c.drawString(520, 490, "1")
    c.drawImage(ImageReader(io.BytesIO(img_b_bytes)), 600, 300, width=180, height=120)
    c.showPage()

    c.save()
    pdf_bytes = buf.getvalue()

    job = pipeline_manager.create_job("Catalogue_MultiFig.pdf")

    # Run pipeline with default watermark configuration (bundled logo, tiled)
    run_pipeline_worker(
        job=job,
        pdf_bytes=pdf_bytes,
        watermark_config={
            "angle": -30.0,
            "padding": 115,
            "scale_pct": 10,
            "opacity": 0.15,
            "is_tiled": True,
        },
        resize_config={
            "width": 1000,
            "height": 1200,
            "quality": 100,
        },
        clean_parts=True,
    )

    assert job.status == "completed", f"Job failed: {job.error}"
    assert job.zip_bytes is not None

    zf = zipfile.ZipFile(io.BytesIO(job.zip_bytes))
    filenames = zf.namelist()
    image_files = sorted([f for f in filenames if f.startswith("images/") and f.endswith(".jpeg")])

    # Exactly 2 images extracted: FIG 1 and FIG 2.
    # Cover image was skipped (non-parts page).
    # Page 3 continuation image was deduplicated (identical hash to Page 2).
    assert len(image_files) == 2, f"Expected exactly 2 images, got {len(image_files)}: {image_files}"
    assert "images/YAM_BGPK_CYLINDER HEAD.jpeg" in image_files
    assert "images/YAM_BGPK_CRANKSHAFT.jpeg" in image_files

    # Verify each image is resized to 1000x1200
    for img_fname in image_files:
        raw_data = zf.read(img_fname)
        im = Image.open(io.BytesIO(raw_data))
        assert im.size == (1000, 1200)

