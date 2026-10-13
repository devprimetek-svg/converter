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
import httpx
import subprocess
import sys
import threading
import time
import uuid
from typing import Any, Optional

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app.excel_export import (
    generate_excel_workbook,
    is_valid_quantity,
    format_parent_model_name,
    extract_raw_model_name,
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
    version="1.0.1",
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
        # In single model export, only rows with valid quantity for the specified model (plus custom sections) are retained
        valid_model_rows = [r for r in rows if not r.get("is_custom_section") and is_valid_quantity(r.get(model_target))]
        if not valid_model_rows:
            raise HTTPException(
                status_code=400,
                detail=f"No parts found for model code '{model_target}'.",
            )
        rows = [r for r in rows if r.get("is_custom_section") or is_valid_quantity(r.get(model_target))]
        model_columns = [model_target]
        download_filename = f"{base_name}_{model_target}_Parts.xlsx"
    else:
        # If PDF contains multiple model codes and exporting all, omit rows where all model quantities are blank
        if len(model_columns) >= 2:
            rows = [
                r for r in rows
                if r.get("is_custom_section") or any(is_valid_quantity(r.get(m)) for m in model_columns)
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
        model_code=model_target if (model_target and model_target.upper() != "ALL") else None,
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
            "is_bike_image": img.get("is_bike_image", False),
            "color_name": img.get("color_name", ""),
            "color_code": img.get("color_code", ""),
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
    quality: int = Form(95),
    preserve_aspect: bool = Form(True),
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
                preserve_aspect_ratio=preserve_aspect,
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
    skip_bike_images: bool = Form(True),
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

            # If this is a bike image (filename indicates bike), preserve clean without watermark
            is_bike = bool(re.search(r"\bbike\b", base_fname, re.IGNORECASE) or "_bike" in base_fname.lower())
            if skip_bike_images and is_bike:
                out_filename = f"{stem}.jpg" if not stem.lower().endswith(".jpg") else stem
                watermarked_items.append((out_filename, content))
                continue

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

from app.pipeline import PipelineJob, pipeline_manager, run_pipeline_worker


@app.post("/api/pipeline/start")
async def start_pipeline_endpoint(
    file: UploadFile = File(...),
    watermark_type: str = Form("logo"),
    watermark_text: str = Form("CONFIDENTIAL"),
    watermark_opacity: float = Form(0.10),
    watermark_angle: float = Form(-30.0),
    watermark_padding: int = Form(115),
    watermark_size_pct: int = Form(25),
    watermark_color: str = Form("#1E3A8A"),
    watermark_is_tiled: bool = Form(True),
    watermark_logo: Optional[UploadFile] = File(None),
    resize_width: int = Form(1000),
    resize_height: int = Form(1200),
    resize_quality: int = Form(100),
    target_min_kb: int = Form(59),
    target_max_kb: int = Form(69),
    clean_part_numbers: bool = Form(True),
    default_model_name: Optional[str] = Form(None),
    high_clarity: bool = Form(False),
    preserve_aspect_ratio: bool = Form(True),
    auto_proceed: bool = Form(False),
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

    # Normalize presets: if watermark_size_pct was passed as <= 10 or 20 (e.g. from cached browser client state),
    # ensure it defaults to the 25% preset unless user explicitly gave a non-default custom size.
    effective_size_pct = watermark_size_pct
    if effective_size_pct <= 10 or effective_size_pct == 20:
        effective_size_pct = 25

    effective_opacity = watermark_opacity
    if 0.14 <= effective_opacity <= 0.16:  # Old 15% default from stale browser cache
        effective_opacity = 0.10

    wm_config = {
        "wm_type": watermark_type,
        "text": watermark_text,
        "opacity": effective_opacity,
        "angle": watermark_angle,
        "padding": watermark_padding,
        "size_pct": effective_size_pct,
        "color": watermark_color,
        "is_tiled": watermark_is_tiled,
        "logo_bytes": logo_bytes,
        "scale_pct": effective_size_pct,
    }

    resize_config = {
        "width": resize_width,
        "height": resize_height,
        "quality": resize_quality,
        "target_min_kb": 0 if high_clarity else target_min_kb,
        "target_max_kb": 0 if high_clarity else target_max_kb,
        "high_clarity": high_clarity,
        "preserve_aspect_ratio": preserve_aspect_ratio,
    }

    job = pipeline_manager.create_job(file.filename)
    if default_model_name and default_model_name.strip():
        job.default_model_name = default_model_name.strip()

    thread = threading.Thread(
        target=run_pipeline_worker,
        args=(job, pdf_bytes, wm_config, resize_config, clean_part_numbers, auto_proceed),
        daemon=True,
    )
    thread.start()

    return {"job_id": job.job_id, "filename": file.filename}


class PipelineImageProceedRequest(BaseModel):
    selected_image_ids: Optional[list[str]] = None


class PipelineProceedRequest(BaseModel):
    edited_model_names: Optional[dict[str, str]] = None
    global_model_name: Optional[str] = None
    rows: Optional[list[dict[str, Any]]] = None
    selected_image_ids: Optional[list[str]] = None


@app.post("/api/pipeline/proceed-images/{job_id}")
def proceed_pipeline_images_endpoint(job_id: str, payload: Optional[PipelineImageProceedRequest] = None):
    """Submit selected image IDs and resume the automated pipeline to Edit Model step."""
    job = pipeline_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found or expired.")

    with job.lock:
        if payload and payload.selected_image_ids is not None:
            job.selected_image_ids = payload.selected_image_ids
        elif job.selected_image_ids is None:
            job.selected_image_ids = [item["id"] for item in job.extracted_images_to_select]

        job.status = "processing"
        job.step_index = 5
        job.step_name = "Edit Model Name"
        job.progress_pct = 80
        job.details = f"Selected {len(job.selected_image_ids)} images. Preparing Model review..."
        job.image_proceed_event.set()

    return {
        "status": "resumed",
        "job_id": job.job_id,
        "selected_count": len(job.selected_image_ids),
    }


@app.post("/api/pipeline/proceed/{job_id}")
def proceed_pipeline_endpoint(job_id: str, payload: Optional[PipelineProceedRequest] = None):
    """Submit edited model names or selected images and resume the automated pipeline."""
    job = pipeline_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found or expired.")

    with job.lock:
        if job.status == "awaiting_image_selection":
            if payload and payload.selected_image_ids is not None:
                job.selected_image_ids = payload.selected_image_ids
            elif job.selected_image_ids is None:
                job.selected_image_ids = [item["id"] for item in job.extracted_images_to_select]
            job.status = "processing"
            job.step_index = 5
            job.step_name = "Edit Model Name"
            job.progress_pct = 80
            job.details = f"Selected {len(job.selected_image_ids)} images. Preparing Model review..."
            job.image_proceed_event.set()
            return {"status": "resumed", "job_id": job.job_id, "selected_count": len(job.selected_image_ids)}

        if payload:
            if payload.rows and len(payload.rows) > 0:
                job.rows = payload.rows
                job.total_rows = len(job.rows)

            global_raw = extract_raw_model_name(payload.global_model_name or "")
            if global_raw:
                job.default_model_name = global_raw

            if payload.edited_model_names:
                job.edited_model_names.update(payload.edited_model_names)

            for r in job.rows:
                fig_key = f"{r.get('parent_fig_no') or r.get('fig_no')}__{r.get('parent_fig_name') or r.get('fig_name')}"
                is_parent = r.get("is_parent", False) or str(r.get("ref_no", "")).strip() in ("1", "01")
                mc = r.get("model_code") or (job.model_columns[0] if job.model_columns else "MODEL")
                fn = r.get("parent_fig_name") or r.get("fig_name") or ""
                if is_parent:
                    if payload.edited_model_names and fig_key in payload.edited_model_names:
                        r["model_name"] = format_parent_model_name(payload.edited_model_names[fig_key], mc, fn)
                    elif global_raw:
                        r["model_name"] = format_parent_model_name(global_raw, mc, fn)
                    elif r.get("model_name"):
                        r["model_name"] = format_parent_model_name(r.get("model_name"), mc, fn)
                    else:
                        r["model_name"] = format_parent_model_name("", mc, fn)
                else:
                    r["model_name"] = ""

        job.status = "processing"
        job.step_index = 6
        job.step_name = "Packaging Master ZIP Bundle..."
        job.progress_pct = 88
        job.details = "Model names applied. Generating Excel and compiling Master ZIP bundle..."
        job.proceed_event.set()

    return {"status": "resumed", "job_id": job.job_id}


@app.get("/api/pipeline/stream/{job_id}")
async def stream_pipeline_progress(job_id: str):
    """Server-Sent Events stream for real-time pipeline progress."""
    job = pipeline_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")

    async def event_generator():
        last_pct = -1
        last_status = ""
        while True:
            status_dict = job.to_dict()
            cur_pct = status_dict["progress_pct"]
            cur_status = status_dict["status"]

            if cur_pct != last_pct or cur_status != last_status or cur_status in ("completed", "error"):
                last_pct = cur_pct
                last_status = cur_status
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
def download_pipeline_bundle(job_id: str, model: Optional[str] = None):
    """Download the complete Master ZIP bundle (Excel + processed images) or a specific model bundle."""
    job = pipeline_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    if job.status != "completed" or not job.zip_bytes:
        raise HTTPException(status_code=400, detail="Pipeline job is not ready for download.")

    if model and model.strip().upper() in job.model_data:
        m_data = job.model_data[model.strip().upper()]
        return StreamingResponse(
            io.BytesIO(m_data["zip_bytes"]),
            media_type="application/zip",
            headers={
                "Content-Disposition": f'attachment; filename="{m_data["zip_filename"]}"',
                "Access-Control-Expose-Headers": "Content-Disposition",
            },
        )

    return StreamingResponse(
        io.BytesIO(job.zip_bytes),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{job.zip_filename}"',
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


@app.get("/api/pipeline/download-excel/{job_id}")
def download_pipeline_excel(job_id: str, model: Optional[str] = None):
    """Download just the generated Excel spreadsheet from the pipeline (all models or specific model)."""
    job = pipeline_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    if not job.excel_bytes:
        raise HTTPException(status_code=400, detail="Excel workbook not ready.")

    if model and model.strip().upper() in job.model_data:
        m_data = job.model_data[model.strip().upper()]
        return StreamingResponse(
            io.BytesIO(m_data["excel_bytes"]),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f'attachment; filename="{m_data["excel_filename"]}"',
                "Access-Control-Expose-Headers": "Content-Disposition",
            },
        )

    return StreamingResponse(
        io.BytesIO(job.excel_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{job.excel_filename}"',
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


class PipelineDownloadImagesZipRequest(BaseModel):
    selected_image_ids: Optional[list[str]] = None


def _build_pipeline_images_zip_response(job: PipelineJob, selected_ids: Optional[list[str]] = None):
    with job.lock:
        sel_set = set(selected_ids) if selected_ids else None
        image_items: list[tuple[str, bytes]] = []

        if job.extracted_images_to_select:
            for item in job.extracted_images_to_select:
                item_id = str(item.get("id"))
                fname = str(item.get("filename") or f"image_{item_id}")
                if not fname.lower().endswith((".jpeg", ".jpg", ".png", ".webp")):
                    fname = f"{fname}.jpeg"

                if sel_set is not None and item_id not in sel_set and fname not in sel_set:
                    continue

                img_bytes = job.processed_images_dict.get(item_id) or job.processed_images_dict.get(item.get("filename"))
                if not img_bytes:
                    for f, b in job.raw_processed_images:
                        if f == item.get("filename") or f == item_id:
                            img_bytes = b
                            break

                if img_bytes:
                    image_items.append((fname, img_bytes))

        # Fallback to raw_processed_images if extracted_images_to_select was empty or no match
        if not image_items and job.raw_processed_images:
            for fname, b in job.raw_processed_images:
                f_ext = fname if fname.lower().endswith((".jpeg", ".jpg", ".png", ".webp")) else f"{fname}.jpeg"
                if sel_set is None or fname in sel_set or f_ext in sel_set:
                    image_items.append((f_ext, b))

        # If user passed selected_ids that didn't match anything, fallback to all processed images
        if not image_items and job.raw_processed_images:
            for fname, b in job.raw_processed_images:
                f_ext = fname if fname.lower().endswith((".jpeg", ".jpg", ".png", ".webp")) else f"{fname}.jpeg"
                image_items.append((f_ext, b))

    if not image_items:
        raise HTTPException(status_code=400, detail="No extracted images available to download.")

    # Deduplicate filenames to avoid collision inside the ZIP
    unique_items: list[tuple[str, bytes]] = []
    seen_names: set[str] = set()
    for fname, b in image_items:
        clean_name = fname
        if not clean_name.lower().endswith(".jpeg"):
            clean_name = f"{clean_name}.jpeg"
        base, ext = os.path.splitext(clean_name)
        counter = 1
        final_name = clean_name
        while final_name.lower() in seen_names:
            final_name = f"{base}_{counter}{ext}"
            counter += 1
        seen_names.add(final_name.lower())
        unique_items.append((final_name, b))

    zip_buf = create_images_zip(unique_items)

    base_name = re.sub(r"\.pdf$", "", job.filename, flags=re.IGNORECASE)
    base_name = re.sub(r'[\\/*?:"<>| ]', "_", base_name).strip("_") or "Catalogue"
    zip_filename = f"{base_name}_diagrams_images.zip"

    return StreamingResponse(
        zip_buf,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{zip_filename}"',
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


@app.post("/api/pipeline/download-images-zip/{job_id}")
def download_pipeline_images_zip_post(
    job_id: str,
    payload: Optional[PipelineDownloadImagesZipRequest] = None,
):
    """Download selected or all extracted diagrams as a ZIP archive (POST with selected IDs)."""
    job = pipeline_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Pipeline job not found or expired.")
    selected_ids = payload.selected_image_ids if payload else None
    return _build_pipeline_images_zip_response(job, selected_ids)


@app.get("/api/pipeline/download-images-zip/{job_id}")
def download_pipeline_images_zip_get(job_id: str):
    """Download all extracted diagrams as a ZIP archive (GET direct link)."""
    job = pipeline_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Pipeline job not found or expired.")
    return _build_pipeline_images_zip_response(job, None)


@app.get("/api/pipeline/images/{job_id}/{image_id}")
def get_pipeline_image_endpoint(job_id: str, image_id: str):
    """Retrieve full-resolution processed image by job ID and image ID/filename for crisp zoom and preview."""
    job = pipeline_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Pipeline job not found or expired.")

    with job.lock:
        image_bytes = job.processed_images_dict.get(image_id)
        if not image_bytes:
            for fname, b in job.raw_processed_images:
                if fname == image_id or fname.startswith(image_id):
                    image_bytes = b
                    break

    if not image_bytes:
        raise HTTPException(status_code=404, detail="Processed image not found.")

    return Response(
        content=image_bytes,
        media_type="image/jpeg",
        headers={
            "Content-Disposition": f'inline; filename="{image_id}.jpeg"',
            "Cache-Control": "public, max-age=3600",
        },
    )




@app.post("/api/desktop/shutdown")
async def desktop_shutdown():
    """Cleanly exit desktop app process."""
    def _delayed_exit():
        time.sleep(0.4)
        os._exit(0)
    threading.Thread(target=_delayed_exit, daemon=True).start()
def get_current_app_version() -> str:
    """Read local version from version.json or fallback to 2.6.0."""
    candidates = [
        os.path.join(os.path.dirname(__file__), "version.json"),
        os.path.join(getattr(sys, "_MEIPASS", ""), "version.json"),
        os.path.join(os.path.dirname(os.path.abspath(sys.executable)), "version.json")
        if getattr(sys, "frozen", False)
        else "",
        os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "version.json"),
    ]
    for p in candidates:
        if p and os.path.exists(p):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    return data.get("version", "2.6.0")
            except Exception:
                pass
    return "2.6.0"


def parse_version_tuple(v: str) -> tuple[int, ...]:
    cleaned = re.sub(r"[^\d.]", "", v)
    parts = [int(p) for p in cleaned.split(".") if p.isdigit()]
    return tuple(parts) if parts else (0, 0, 0)


def is_version_newer(latest: str, current: str) -> bool:
    try:
        return parse_version_tuple(latest) > parse_version_tuple(current)
    except Exception:
        return False


@app.get("/api/app/version")
async def get_app_version():
    """Return local app version and execution mode."""
    return {
        "version": get_current_app_version(),
        "is_frozen": getattr(sys, "frozen", False),
    }


@app.get("/api/app/check-update")
async def check_github_update():
    """Check GitHub Releases for newer Converter Studio binary."""
    current_ver = get_current_app_version()
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(
                "https://api.github.com/repos/devprimetek-svg/converter/releases/latest",
                headers={"User-Agent": "ConverterStudio-Updater"},
            )
            if resp.status_code == 200:
                data = resp.json()
                tag = data.get("tag_name", "").lstrip("v")
                body = data.get("body", "")
                download_url = None
                exe_size = 0
                for asset in data.get("assets", []):
                    if asset.get("name") == "ConverterStudio.exe":
                        download_url = asset.get("browser_download_url")
                        exe_size = asset.get("size", 0)
                        break

                has_update = is_version_newer(tag, current_ver) and (download_url is not None)
                return {
                    "current_version": current_ver,
                    "latest_version": tag,
                    "has_update": has_update,
                    "download_url": download_url,
                    "download_size": exe_size,
                    "release_notes": body,
                }
    except Exception as e:
        logger.warning("Failed to check for updates: %s", e)

    return {
        "current_version": current_ver,
        "latest_version": current_ver,
        "has_update": False,
        "download_url": None,
        "download_size": 0,
        "release_notes": "",
    }


@app.post("/api/app/perform-update")
async def perform_github_update():
    """Download latest release and hot-swap ConverterStudio.exe, then restart."""
    current_ver = get_current_app_version()

    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.get(
            "https://api.github.com/repos/devprimetek-svg/converter/releases/latest",
            headers={"User-Agent": "ConverterStudio-Updater"},
        )
        if resp.status_code != 200:
            raise HTTPException(500, "Could not fetch release information from GitHub.")

        data = resp.json()
        tag = data.get("tag_name", "").lstrip("v")
        download_url = None
        for asset in data.get("assets", []):
            if asset.get("name") == "ConverterStudio.exe":
                download_url = asset.get("browser_download_url")
                break

        if not download_url:
            raise HTTPException(404, "ConverterStudio.exe asset was not found in latest release.")

        if getattr(sys, "frozen", False):
            exe_path = os.path.abspath(sys.executable)
            exe_dir = os.path.dirname(exe_path)
            temp_new_exe = os.path.join(exe_dir, "ConverterStudio_downloading.exe")
            temp_old_exe = os.path.join(exe_dir, "ConverterStudio_previous.old")

            # Stream download latest .exe
            async with client.stream("GET", download_url, follow_redirects=True) as stream_resp:
                if stream_resp.status_code != 200:
                    raise HTTPException(500, f"Download failed with status {stream_resp.status_code}")
                with open(temp_new_exe, "wb") as f:
                    async for chunk in stream_resp.aiter_bytes(chunk_size=65536):
                        f.write(chunk)

            # Perform atomic hot-swap and restart
            def _swap_and_restart():
                time.sleep(1.2)
                try:
                    if os.path.exists(temp_old_exe):
                        try:
                            os.remove(temp_old_exe)
                        except Exception:
                            pass
                    os.rename(exe_path, temp_old_exe)
                    os.rename(temp_new_exe, exe_path)
                    subprocess.Popen([exe_path])
                    time.sleep(0.5)
                    os._exit(0)
                except Exception as ex:
                    logger.error("Hot-swap update error: %s", ex)

            threading.Thread(target=_swap_and_restart, daemon=True).start()
            return {"status": "ok", "message": f"Updated to v{tag}. Restarting Converter Studio..."}
        else:
            # Running in dev environment - pull latest git changes
            def _git_pull():
                time.sleep(1.0)
                try:
                    subprocess.run(["git", "pull", "origin", "main"], check=False)
                except Exception:
                    pass

            threading.Thread(target=_git_pull, daemon=True).start()
            return {"status": "ok", "message": "Source repository pulling latest changes from GitHub."}


# Mount built frontend static assets if present (prioritize live frontend/dist on disk so .exe auto-updates)
import sys as _sys

_backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_project_root = (
    os.path.dirname(os.path.abspath(_sys.executable))
    if getattr(_sys, "frozen", False)
    else os.path.dirname(_backend_dir)
)
_candidates = [
    os.path.join(_project_root, "frontend", "dist"),
    os.path.join(_project_root, "backend", "static"),
    os.path.join(_project_root, "static"),
    os.path.join(_backend_dir, "static"),
    os.path.join(os.getcwd(), "static"),
    os.path.join("/app", "static"),
    os.path.join(getattr(_sys, "_MEIPASS", ""), "static") if hasattr(_sys, "_MEIPASS") else "",
]
static_dir = next((p for p in _candidates if p and os.path.exists(os.path.join(p, "index.html"))), "")

if os.path.exists(static_dir):
    logger.info("Serving frontend static assets from %s", static_dir)

    @app.get("/")
    @app.get("/index.html")
    async def serve_index():
        index_path = os.path.join(static_dir, "index.html")
        if os.path.exists(index_path):
            return FileResponse(
                index_path,
                media_type="text/html",
                headers={
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                    "Pragma": "no-cache",
                    "Expires": "0",
                },
            )
        return {"message": "Converter Studio API"}

    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")


