"""FastAPI Application for PDF Parts Catalogue to Excel Converter

Provides endpoints for PDF upload, real-time extraction progress (SSE + polling),
and formatted Excel download.
"""

from __future__ import annotations

import asyncio
import io
import json
import logging
import os
import re
import threading
import time
import uuid
from typing import Any, Optional

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app.excel_export import generate_excel_workbook, is_valid_quantity
from app.meta_generator import (
    export_metadata_csv,
    export_metadata_excel,
    generate_catalog_metadata,
)
from app.parts_extractor import (
    ExtractionError,
    NoTextLayerError,
    extract_parts_from_pdf,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("converter")

app = FastAPI(
    title="PDF Parts Catalogue to Excel Converter",
    description="Extract parts catalogues into Excel spreadsheets",
    version="1.0.0",
)

# Enable CORS for local development and container networking
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class JobData:
    """In-memory state container for an extraction job."""

    def __init__(self, job_id: str, filename: str):
        self.job_id = job_id
        self.filename = filename
        self.status: str = "pending"  # "pending", "processing", "completed", "error"
        self.current_page: int = 0
        self.total_pages: int = 0
        self.current_fig_no: str = ""
        self.current_fig_name: str = ""
        self.rows: list[dict[str, Any]] = []
        self.model_columns: list[str] = []
        self.figures: list[dict[str, Any]] = []
        self.error: Optional[str] = None
        self.created_at: float = time.time()
        self.updated_at: float = time.time()
        self.done_event = threading.Event()

    def to_dict(self, include_rows: bool = False) -> dict[str, Any]:
        data = {
            "job_id": self.job_id,
            "filename": self.filename,
            "status": self.status,
            "current_page": self.current_page,
            "total_pages": self.total_pages,
            "current_fig_no": self.current_fig_no,
            "current_fig_name": self.current_fig_name,
            "model_columns": self.model_columns,
            "total_rows": len(self.rows),
            "figures": self.figures,
            "error": self.error,
        }
        if include_rows:
            data["rows"] = self.rows
        return data


# In-memory job repository with TTL cleanup
class JobStore:
    def __init__(self, ttl_seconds: int = 1800):
        self._jobs: dict[str, JobData] = {}
        self._lock = threading.Lock()
        self._ttl = ttl_seconds

    def create(self, filename: str) -> JobData:
        self.cleanup()
        job_id = str(uuid.uuid4())
        job = JobData(job_id, filename)
        with self._lock:
            self._jobs[job_id] = job
        return job

    def get(self, job_id: str) -> Optional[JobData]:
        with self._lock:
            return self._jobs.get(job_id)

    def cleanup(self):
        now = time.time()
        with self._lock:
            expired = [jid for jid, j in self._jobs.items() if now - j.created_at > self._ttl]
            for jid in expired:
                del self._jobs[jid]


jobs = JobStore()


def _run_extraction_job(job: JobData, pdf_bytes: bytes):
    """Worker function executed in background thread."""
    try:
        job.status = "processing"
        job.updated_at = time.time()

        def on_progress(page: int, total: int, fig_no: str, fig_name: str):
            job.current_page = page
            job.total_pages = total
            job.current_fig_no = fig_no
            job.current_fig_name = fig_name
            job.updated_at = time.time()

        result = extract_parts_from_pdf(io.BytesIO(pdf_bytes), progress_callback=on_progress)

        job.rows = result["rows"]
        job.model_columns = result["model_columns"]
        job.total_pages = result["total_pages"]
        job.current_page = result["total_pages"]
        job.figures = result["figures"]
        job.status = "completed"
        job.updated_at = time.time()
        logger.info("Job %s completed: %d rows, %d models", job.job_id, len(job.rows), len(job.model_columns))

    except NoTextLayerError as e:
        logger.warning("Job %s no text layer: %s", job.job_id, e)
        job.status = "error"
        job.error = str(e)
    except ExtractionError as e:
        logger.error("Job %s extraction error: %s", job.job_id, e)
        job.status = "error"
        job.error = str(e)
    except Exception as e:
        logger.exception("Job %s unexpected error: %s", job.job_id, e)
        job.status = "error"
        job.error = f"Failed to process PDF: {str(e)}"
    finally:
        job.done_event.set()


# API Request / Response schemas
class ExportRequest(BaseModel):
    filename: str = Field(default="Catalogue", description="Base filename without extension")
    clean_part_numbers: bool = Field(default=False, description="Whether to apply clean part number formatting")
    model_columns: list[str] = Field(default_factory=list, description="Model columns detected")
    rows: list[dict[str, Any]] = Field(default_factory=list, description="Rows to export")
    target_model: Optional[str] = Field(default=None, description="Optional specific model code to export")
    filter_model: Optional[str] = Field(default=None, description="Alias for target_model")
    job_id: Optional[str] = Field(default=None, description="Optional job ID if rows are omitted")


@app.get("/api/health")
def health():
    return {"status": "ok", "time": time.time()}


@app.post("/api/extract")
async def extract_pdf(file: UploadFile = File(...)):
    """Upload a PDF Parts Catalogue and start in-memory extraction."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    filename_lower = file.filename.lower()
    if not filename_lower.endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Invalid file format. Only PDF files (.pdf) are supported.",
        )

    # Read into memory
    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    if len(content) > 60 * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail="File size exceeds the 50MB limit.",
        )

    job = jobs.create(file.filename)

    # Launch processing in background thread (in-memory)
    thread = threading.Thread(
        target=_run_extraction_job,
        args=(job, content),
        daemon=True,
    )
    thread.start()

    return {
        "job_id": job.job_id,
        "filename": job.filename,
        "status": job.status,
    }


@app.get("/api/extract/status/{job_id}")
def get_job_status(job_id: str):
    """Poll job status and retrieve results once completed."""
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found or expired.")

    # Return full data if completed, otherwise progress metadata
    include_rows = job.status == "completed"
    return job.to_dict(include_rows=include_rows)


@app.get("/api/extract/stream/{job_id}")
async def stream_job_progress(job_id: str):
    """Server-Sent Events (SSE) stream reporting progress page-by-page."""
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found or expired.")

    async def event_generator():
        last_page = -1
        last_status = ""

        while True:
            # Send update if state changed
            if job.current_page != last_page or job.status != last_status:
                last_page = job.current_page
                last_status = job.status
                payload = job.to_dict(include_rows=(job.status == "completed"))
                yield f"data: {json.dumps(payload)}\n\n"

            if job.status in ("completed", "error"):
                break

            await asyncio.sleep(0.3)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/export")
def export_excel(req: ExportRequest):
    """Generate and download a formatted .xlsx Excel file.
    Supports exporting all models or filtering to a specific model code.
    """
    rows = req.rows
    model_columns = req.model_columns
    model_target = req.target_model or req.filter_model

    # If rows not supplied in body, check job_id
    if not rows and req.job_id:
        job = jobs.get(req.job_id)
        if not job or job.status != "completed":
            raise HTTPException(status_code=404, detail="Job data not found or not completed.")
        rows = job.rows
        model_columns = job.model_columns

    if not rows:
        raise HTTPException(status_code=400, detail="No rows to export.")

    # Sanitize base filename
    base_name = req.filename or "Parts_Catalogue"
    base_name = re.sub(r"\.pdf$", "", base_name, flags=re.IGNORECASE)
    base_name = re.sub(r'[\\/*?:"<>| ]', "_", base_name).strip("_")

    if model_target and model_target.upper() != "ALL":
        # Strictly filter to rows having a valid, non-blank quantity for this specific model code
        rows = [
            r for r in rows
            if is_valid_quantity(r.get(model_target))
        ]
        model_columns = [model_target]
        download_filename = f"{base_name}_{model_target}_Parts.xlsx"
    else:
        # If PDF contains multiple model codes and exporting all, omit rows where all model quantities are blank
        if len(model_columns) >= 2:
            rows = [
                r for r in rows
                if any(is_valid_quantity(r.get(m)) for m in model_columns)
            ]
        download_filename = f"{base_name}_Parts.xlsx"

    if not rows:
        raise HTTPException(
            status_code=400,
            detail=f"No parts found for model code '{model_target}'." if model_target else "No rows to export.",
        )

    excel_buffer = generate_excel_workbook(
        rows=rows,
        model_columns=model_columns,
        clean_parts=req.clean_part_numbers,
    )

    return StreamingResponse(
        excel_buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{download_filename}"',
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


# ---------------------------------------------------------------------------
# PDF IMAGE EXTRACTION & IMAGE TOOLS ENDPOINTS
# ---------------------------------------------------------------------------

from app.image_tools import (
    apply_text_watermark,
    create_images_zip,
    extract_images_from_pdf,
    resize_single_image,
)
from fastapi import Form, Response


class PdfImageSession:
    def __init__(self, session_id: str, filename: str, images: list[dict[str, Any]]):
        self.session_id = session_id
        self.filename = filename
        self.images = images
        self.created_at = time.time()


pdf_sessions: dict[str, PdfImageSession] = {}
pdf_sessions_lock = threading.Lock()


def cleanup_pdf_sessions():
    now = time.time()
    with pdf_sessions_lock:
        expired = [sid for sid, s in pdf_sessions.items() if now - s.created_at > 1800]
        for sid in expired:
            del pdf_sessions[sid]


class DownloadZipRequest(BaseModel):
    session_id: str
    selected_ids: Optional[list[str]] = None


@app.post("/api/pdf/extract-images")
async def extract_pdf_images_endpoint(file: UploadFile = File(...)):
    """Extract all embedded raster images from an uploaded PDF."""
    cleanup_pdf_sessions()
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files (.pdf) are supported.")

    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        model_code = ""
        if file.filename:
            m = re.search(r"\b([A-Z0-9]{3,6})\b", file.filename.upper())
            if m:
                model_code = m.group(1)
        images = extract_images_from_pdf(content, model_code=model_code or "MODEL")
    except Exception as e:
        logger.exception("PDF image extraction failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to extract images from PDF: {str(e)}")

    session_id = str(uuid.uuid4())
    with pdf_sessions_lock:
        pdf_sessions[session_id] = PdfImageSession(session_id, file.filename, images)

    # Return metadata without heavy raw_bytes
    metadata_list = [
        {
            "id": img["id"],
            "filename": img["filename"],
            "page": img["page"],
            "width": img["width"],
            "height": img["height"],
            "format": img["format"],
            "size_bytes": img["size_bytes"],
            "thumbnail_url": img["thumbnail_url"],
            "is_duplicate": img.get("is_duplicate", False),
        }
        for img in images
    ]

    return {
        "session_id": session_id,
        "filename": file.filename,
        "total_images": len(metadata_list),
        "images": metadata_list,
    }


@app.get("/api/pdf/images/{session_id}/{image_id}")
def get_single_pdf_image(session_id: str, image_id: str):
    """Retrieve full raw image by session ID and image ID."""
    with pdf_sessions_lock:
        session = pdf_sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session expired or not found.")

    target = next((img for img in session.images if img["id"] == image_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Image not found.")

    fmt = target.get("format", "JPEG").lower()
    media_type = f"image/{fmt}" if fmt in ("jpeg", "png", "webp", "gif") else "image/jpeg"
    download_fname = target["filename"]
    if not download_fname.lower().endswith(".jpeg"):
        download_fname = f"{download_fname}.jpeg"

    return Response(
        content=target["raw_bytes"],
        media_type=media_type,
        headers={
            "Content-Disposition": f'inline; filename="{download_fname}"',
        },
    )


@app.post("/api/pdf/download-images-zip")
def download_pdf_images_zip(req: DownloadZipRequest):
    """Bundle selected or all extracted PDF images into a downloadable ZIP."""
    with pdf_sessions_lock:
        session = pdf_sessions.get(req.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session expired or not found.")

    if req.selected_ids:
        targets = [img for img in session.images if img["id"] in req.selected_ids]
    else:
        targets = session.images

    if not targets:
        raise HTTPException(status_code=400, detail="No images selected to download.")

    image_items = [
        (
            f"{img['filename']}.jpeg" if not img["filename"].lower().endswith(".jpeg") else img["filename"],
            img["raw_bytes"],
        )
        for img in targets
    ]
    zip_buf = create_images_zip(image_items)

    base_name = re.sub(r"\.pdf$", "", session.filename, flags=re.IGNORECASE)
    base_name = re.sub(r'[\\/*?:"<>| ]', "_", base_name).strip("_")
    zip_filename = f"{base_name}_extracted_images.zip"

    return StreamingResponse(
        zip_buf,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{zip_filename}"',
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


@app.post("/api/images/resize-bulk")
async def bulk_resize_endpoint(
    files: list[UploadFile] = File(...),
    width: int = Form(...),
    height: int = Form(...),
    format: str = Form("ORIGINAL"),
    quality: int = Form(85),
):
    """Bulk resize uploaded images and return as an in-memory ZIP archive."""
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded.")

    resized_items: list[tuple[str, bytes]] = []

    for f in files:
        try:
            content = await f.read()
            if not content:
                continue
            base_fname = f.filename or f"image_{uuid.uuid4().hex[:6]}"
            stem = base_fname.rsplit(".", 1)[0] if "." in base_fname else base_fname

            resized_bytes, out_ext = resize_single_image(
                image_bytes=content,
                target_width=width,
                target_height=height,
                output_format=format,
                quality=quality,
            )
            out_filename = f"{stem}_resized.{out_ext}"
            resized_items.append((out_filename, resized_bytes))
        except Exception as e:
            logger.warning("Failed to resize %s: %s", f.filename, e)
            continue

    if not resized_items:
        raise HTTPException(status_code=400, detail="Could not resize any of the uploaded images.")

    zip_buf = create_images_zip(resized_items)
    return StreamingResponse(
        zip_buf,
        media_type="application/zip",
        headers={
            "Content-Disposition": 'attachment; filename="resized_images.zip"',
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


@app.post("/api/images/watermark-bulk")
async def bulk_watermark_endpoint(
    files: list[UploadFile] = File(...),
    text: str = Form("WATERMARK"),
    font_size: int = Form(36),
    opacity: float = Form(0.5),
    angle: float = Form(-30.0),
    position: str = Form("center"),
    color: str = Form("#FFFFFF"),
    is_tiled: bool = Form(False),
):
    """Bulk apply text watermark to uploaded images and return as an in-memory ZIP archive."""
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded.")

    watermarked_items: list[tuple[str, bytes]] = []

    for f in files:
        try:
            content = await f.read()
            if not content:
                continue
            base_fname = f.filename or f"image_{uuid.uuid4().hex[:6]}"
            stem = base_fname.rsplit(".", 1)[0] if "." in base_fname else base_fname

            wm_bytes = apply_text_watermark(
                image_bytes=content,
                text=text,
                font_size=font_size,
                opacity=opacity,
                angle=angle,
                position=position,
                color_hex=color,
                is_tiled=is_tiled,
            )
            out_filename = f"{stem}_watermarked.jpg"
            watermarked_items.append((out_filename, wm_bytes))
        except Exception as e:
            logger.warning("Failed to watermark %s: %s", f.filename, e)
            continue

    if not watermarked_items:
        raise HTTPException(status_code=400, detail="Could not watermark any of the uploaded images.")

    zip_buf = create_images_zip(watermarked_items)
    return StreamingResponse(
        zip_buf,
        media_type="application/zip",
        headers={
            "Content-Disposition": 'attachment; filename="watermarked_images.zip"',
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


# ---------------------------------------------------------------------------
# AUTOMATED ALL-IN-ONE PIPELINE ENDPOINTS
# ---------------------------------------------------------------------------

from app.pipeline import pipeline_manager, run_pipeline_worker


@app.post("/api/pipeline/start")
async def start_pipeline_endpoint(
    file: UploadFile = File(...),
    watermark_type: str = Form("logo"),
    watermark_text: str = Form("CONFIDENTIAL"),
    watermark_opacity: float = Form(0.15),
    watermark_angle: float = Form(-30.0),
    watermark_padding: int = Form(115),
    watermark_size_pct: int = Form(10),
    watermark_color: str = Form("#FFFFFF"),
    watermark_is_tiled: bool = Form(True),
    watermark_logo: Optional[UploadFile] = File(None),
    resize_width: int = Form(1000),
    resize_height: int = Form(1200),
    resize_quality: int = Form(100),
    clean_part_numbers: bool = Form(True),
):
    """Start the automated end-to-end studio pipeline."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files (.pdf) are supported.")

    pdf_bytes = await file.read()
    if len(pdf_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    logo_bytes = None
    if watermark_logo and watermark_logo.filename:
        logo_content = await watermark_logo.read()
        if len(logo_content) > 0:
            logo_bytes = logo_content

    wm_config = {
        "wm_type": watermark_type,
        "text": watermark_text,
        "opacity": watermark_opacity,
        "angle": watermark_angle,
        "padding": watermark_padding,
        "size_pct": watermark_size_pct,
        "color": watermark_color,
        "is_tiled": watermark_is_tiled,
        "logo_bytes": logo_bytes,
        "scale_pct": watermark_size_pct,
    }

    resize_config = {
        "width": resize_width,
        "height": resize_height,
        "quality": resize_quality,
    }

    job = pipeline_manager.create_job(file.filename)

    thread = threading.Thread(
        target=run_pipeline_worker,
        args=(job, pdf_bytes, wm_config, resize_config, clean_part_numbers),
        daemon=True,
    )
    thread.start()

    return {"job_id": job.job_id, "filename": file.filename}


@app.get("/api/pipeline/stream/{job_id}")
async def stream_pipeline_progress(job_id: str):
    """Server-Sent Events stream for real-time pipeline progress."""
    job = pipeline_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")

    async def event_generator():
        last_pct = -1
        while True:
            status_dict = job.to_dict()
            cur_pct = status_dict["progress_pct"]
            cur_status = status_dict["status"]

            if cur_pct != last_pct or cur_status in ("completed", "error"):
                last_pct = cur_pct
                yield f"data: {json.dumps(status_dict)}\n\n"

            if cur_status in ("completed", "error"):
                break
            await asyncio.sleep(0.3)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/pipeline/status/{job_id}")
def get_pipeline_status_endpoint(job_id: str):
    """Poll pipeline status."""
    job = pipeline_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    return job.to_dict()


@app.get("/api/pipeline/download/{job_id}")
def download_pipeline_bundle(job_id: str):
    """Download the complete Master ZIP bundle (Excel + processed images)."""
    job = pipeline_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    if job.status != "completed" or not job.zip_bytes:
        raise HTTPException(status_code=400, detail="Pipeline job is not ready for download.")

    return StreamingResponse(
        io.BytesIO(job.zip_bytes),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{job.zip_filename}"',
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


@app.get("/api/pipeline/download-excel/{job_id}")
def download_pipeline_excel(job_id: str):
    """Download just the generated Excel spreadsheet from the pipeline."""
    job = pipeline_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    if not job.excel_bytes:
        raise HTTPException(status_code=400, detail="Excel workbook not ready.")

    return StreamingResponse(
        io.BytesIO(job.excel_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{job.excel_filename}"',
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


@app.get("/api/pipeline/download-metadata/{job_id}")
def download_pipeline_metadata(job_id: str, format: str = "xlsx"):
    """Download generated product & parts metadata from pipeline."""
    job = pipeline_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")

    if format.lower() == "csv":
        if not job.metadata_csv_bytes:
            raise HTTPException(status_code=400, detail="Metadata CSV not ready.")
        return StreamingResponse(
            io.BytesIO(job.metadata_csv_bytes),
            media_type="text/csv",
            headers={
                "Content-Disposition": f'attachment; filename="{job.metadata_filename}.csv"',
                "Access-Control-Expose-Headers": "Content-Disposition",
            },
        )
    else:
        if not job.metadata_excel_bytes:
            raise HTTPException(status_code=400, detail="Metadata Excel not ready.")
        return StreamingResponse(
            io.BytesIO(job.metadata_excel_bytes),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f'attachment; filename="{job.metadata_filename}.xlsx"',
                "Access-Control-Expose-Headers": "Content-Disposition",
            },
        )


# ---------------------------------------------------------------------------
# METADATA & SEO GENERATOR ENDPOINTS
# ---------------------------------------------------------------------------


class MetaGenerateRequest(BaseModel):
    job_id: Optional[str] = None
    rows: Optional[list[dict[str, Any]]] = None
    figures: Optional[list[dict[str, Any]]] = None
    model_columns: list[str] = Field(default_factory=list)
    brand: str = "YAMAHA"
    model: str = ""
    series: str = "series"
    model_code: Optional[str] = None
    main_parts_only: bool = True
    style: str = "ecommerce"
    custom_templates: Optional[dict[str, str]] = None


class MetaExportRequest(BaseModel):
    items: list[dict[str, Any]]
    format: str = "xlsx"  # "xlsx" or "csv"
    filename: str = "Product_Metadata"
    brand: str = "YAMAHA"


@app.post("/api/meta/generate")
def generate_metadata_endpoint(req: MetaGenerateRequest):
    """Generate SEO titles, short descriptions, and long descriptions for parts."""
    rows = req.rows or []
    figures = req.figures or []
    model_cols = req.model_columns

    if not rows and not figures and req.job_id:
        # Check extraction jobs first
        ext_job = jobs.get(req.job_id)
        if ext_job:
            rows = ext_job.rows or []
            figures = ext_job.figures or []
            if not model_cols:
                model_cols = ext_job.model_columns
        else:
            pipe_job = pipeline_manager.get_job(req.job_id)
            if pipe_job:
                rows = pipe_job.rows or []
                figures = pipe_job.figures or []
                if not model_cols:
                    model_cols = pipe_job.model_columns

    if not rows and not figures:
        raise HTTPException(status_code=400, detail="No parts rows or figures provided, or job not found.")

    m_code = req.model_code or ("_".join(model_cols) if model_cols else "")
    items = generate_catalog_metadata(
        rows=rows,
        model_columns=model_cols,
        brand=req.brand,
        model=req.model,
        series=req.series,
        model_code=m_code,
        main_parts_only=req.main_parts_only,
        figures=figures,
        style=req.style,
        custom_templates=req.custom_templates,
    )
    return {"total": len(items), "items": items}


@app.post("/api/meta/export")
def export_metadata_endpoint(req: MetaExportRequest):
    """Export generated metadata as Excel (.xlsx) or CSV."""
    if not req.items:
        raise HTTPException(status_code=400, detail="No metadata items to export.")

    safe_name = re.sub(r'[\\/*?:"<>|]', "", req.filename).strip() or "Product_Metadata"

    if req.format.lower() == "csv":
        csv_buf = export_metadata_csv(req.items)
        return StreamingResponse(
            csv_buf,
            media_type="text/csv",
            headers={
                "Content-Disposition": f'attachment; filename="{safe_name}.csv"',
                "Access-Control-Expose-Headers": "Content-Disposition",
            },
        )
    else:
        xlsx_buf = export_metadata_excel(req.items, brand=req.brand)
        return StreamingResponse(
            xlsx_buf,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f'attachment; filename="{safe_name}.xlsx"',
                "Access-Control-Expose-Headers": "Content-Disposition",
            },
        )



# Mount built frontend static assets if present (for unified single-container cloud deployment)
static_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static")
if os.path.exists(static_dir):
    logger.info("Serving frontend static assets from %s", static_dir)
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")


