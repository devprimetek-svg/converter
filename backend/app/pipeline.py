"""Automated Studio Pipeline: PDF -> Excel + Watermark + Resize -> Master ZIP Archive.

Orchestrates all studio modules sequentially in-memory without disk persistence:
1. Extract parts data from PDF
2. Generate Yamaha-compliant Excel workbook (.xlsx)
3. Extract embedded raster images from PDF
4. Apply watermark with presets (-30° rot, 115 pad, 25% size, 10% opacity)
5. Resize images to 1000x1200 @ 100% quality (.jpg)
6. Bundle Excel and processed images into a single Master ZIP archive.
"""

from __future__ import annotations

import base64
import io
import logging
import re
import threading
import time
import uuid
import zipfile
from typing import Any, Optional

from PIL import Image

from app.excel_export import generate_excel_workbook
from app.image_tools import extract_images_from_pdf, process_watermark_and_resize
from app.meta_generator import (
    export_metadata_csv,
    export_metadata_excel,
    generate_catalog_metadata,
)
from app.parts_extractor import extract_parts_from_pdf

logger = logging.getLogger(__name__)


class PipelineJob:
    """State container for an automated end-to-end pipeline run."""

    def __init__(self, job_id: str, filename: str):
        self.job_id = job_id
        self.filename = filename
        self.status = "queued"  # queued | processing | completed | error
        self.step_index = 0
        self.total_steps = 5
        self.step_name = "Initializing pipeline..."
        self.progress_pct = 0
        self.details = "Preparing document..."

        # Parts & Excel state
        self.total_pages = 0
        self.current_page = 0
        self.total_rows = 0
        self.model_columns: list[str] = []
        self.rows: list[dict[str, Any]] = []
        self.figures: list[dict[str, str]] = []
        self.excel_bytes: Optional[bytes] = None
        self.excel_filename: str = ""

        # Metadata & SEO state
        self.metadata_items: list[dict[str, Any]] = []
        self.metadata_excel_bytes: Optional[bytes] = None
        self.metadata_csv_bytes: Optional[bytes] = None
        self.metadata_filename: str = ""

        # Image state
        self.total_images_found = 0
        self.images_processed_count = 0
        self.processed_thumbnails: list[dict[str, Any]] = []
        self.raw_processed_images: list[tuple[str, bytes]] = []

        # ZIP bundle
        self.zip_bytes: Optional[bytes] = None
        self.zip_filename: str = ""
        self.bundle_size_bytes = 0

        self.error: Optional[str] = None
        self.created_at = time.time()
        self.lock = threading.Lock()

    def to_dict(self) -> dict[str, Any]:
        """Convert job state to JSON-serializable status payload."""
        with self.lock:
            return {
                "job_id": self.job_id,
                "filename": self.filename,
                "status": self.status,
                "step_index": self.step_index,
                "total_steps": self.total_steps,
                "step_name": self.step_name,
                "progress_pct": self.progress_pct,
                "details": self.details,
                "total_pages": self.total_pages,
                "current_page": self.current_page,
                "total_rows": self.total_rows,
                "model_columns": self.model_columns,
                "figures_count": len(self.figures),
                "total_images": self.total_images_found,
                "images_processed": self.images_processed_count,
                "excel_ready": self.excel_bytes is not None,
                "metadata_ready": self.metadata_excel_bytes is not None,
                "metadata_count": len(self.metadata_items),
                "metadata_sample": self.metadata_items[:20],
                "zip_ready": self.zip_bytes is not None,
                "zip_filename": self.zip_filename,
                "bundle_size_bytes": self.bundle_size_bytes,
                "processed_thumbnails": self.processed_thumbnails[:50],  # cap for UI speed
                "rows_sample": self.rows[:10],
                "error": self.error,
            }


class PipelineManager:
    """Thread-safe manager for active pipeline jobs."""

    def __init__(self):
        self.jobs: dict[str, PipelineJob] = {}
        self.lock = threading.Lock()

    def create_job(self, filename: str) -> PipelineJob:
        self._cleanup_expired()
        job_id = f"pipe_{uuid.uuid4().hex[:12]}"
        job = PipelineJob(job_id, filename)
        with self.lock:
            self.jobs[job_id] = job
        return job

    def get_job(self, job_id: str) -> Optional[PipelineJob]:
        with self.lock:
            return self.jobs.get(job_id)

    def _cleanup_expired(self):
        now = time.time()
        with self.lock:
            expired = [jid for jid, j in self.jobs.items() if now - j.created_at > 3600]
            for jid in expired:
                del self.jobs[jid]


pipeline_manager = PipelineManager()


def run_pipeline_worker(
    job: PipelineJob,
    pdf_bytes: bytes,
    watermark_config: dict[str, Any],
    resize_config: dict[str, Any],
    clean_parts: bool = True,
):
    """Background worker executing the complete pipeline."""
    base_name = re.sub(r"\.pdf$", "", job.filename, flags=re.IGNORECASE)
    base_name = re.sub(r'[\\/*?:"<>| ]', "_", base_name).strip("_") or "Catalogue"

    try:
        with job.lock:
            job.status = "processing"
            job.step_index = 1
            job.step_name = "Extracting Parts Catalogue..."
            job.progress_pct = 10
            job.details = "Scanning pages, model codes, and part tables..."

        # Step 1: Parts extraction
        def on_page_progress(current: int, total: int, fig_no: str = "", fig_name: str = ""):
            with job.lock:
                job.current_page = current
                job.total_pages = total
                pct = 10 + int((current / max(1, total)) * 30)
                job.progress_pct = min(40, pct)
                if fig_no and fig_name:
                    job.details = f"Processing page {current} of {total} (FIG. {fig_no} - {fig_name})..."
                else:
                    job.details = f"Processing page {current} of {total}..."

        parts_result = extract_parts_from_pdf(pdf_bytes, progress_callback=on_page_progress)

        page_figure_map = parts_result.get("page_figure_map", {})

        with job.lock:
            job.total_pages = parts_result.get("total_pages", 0)
            job.model_columns = parts_result.get("model_columns", [])
            job.rows = parts_result.get("rows", [])
            job.total_rows = len(job.rows)
            job.figures = parts_result.get("figures", [])
            job.step_index = 2
            job.step_name = "Generating Excel Workbook..."
            job.progress_pct = 45
            job.details = f"Building Excel with {job.total_rows} parts..."

        # Step 2: Excel workbook generation & SEO Metadata Generation
        excel_buf = generate_excel_workbook(
            rows=job.rows,
            model_columns=job.model_columns,
            clean_parts=clean_parts,
        )
        excel_bytes = excel_buf.getvalue()
        excel_filename = f"{base_name}_Parts.xlsx"

        # Resolve model code from detected model columns or PDF filename
        pipeline_model_code = ""
        if job.model_columns:
            pipeline_model_code = "_".join(str(c).strip() for c in job.model_columns if str(c).strip())
        if not pipeline_model_code:
            m = re.search(r"\b([A-Z0-9]{3,6})\b", job.filename.upper())
            if m:
                pipeline_model_code = m.group(1)
            else:
                pipeline_model_code = "MODEL"

        # Generate SEO and E-commerce Metadata for main parts only
        meta_items = generate_catalog_metadata(
            rows=job.rows,
            model_columns=job.model_columns,
            brand="YAMAHA",
            model="",
            series="series",
            model_code=pipeline_model_code,
            main_parts_only=True,
            figures=job.figures,
        )
        meta_excel_bytes = export_metadata_excel(meta_items, brand="YAMAHA").getvalue()
        meta_csv_bytes = export_metadata_csv(meta_items).getvalue()
        meta_filename = f"{base_name}_Product_Metadata"

        with job.lock:
            job.excel_bytes = excel_bytes
            job.excel_filename = excel_filename
            job.metadata_items = meta_items
            job.metadata_excel_bytes = meta_excel_bytes
            job.metadata_csv_bytes = meta_csv_bytes
            job.metadata_filename = meta_filename
            job.step_index = 3
            job.step_name = "Extracting Parts Images (Deduplicated)..."
            job.progress_pct = 55
            job.details = "Extracting unique illustrations mapped to parts figures..."

        # Step 3: Extract PDF images strictly for parts figures with deduplication
        raw_images = extract_images_from_pdf(
            pdf_bytes=pdf_bytes,
            figure_pages=page_figure_map if page_figure_map else None,
            parts_only=bool(page_figure_map),
            model_code=pipeline_model_code,
        )

        # Fallback if no images found with figure filter but images exist in PDF
        if not raw_images and not page_figure_map:
            raw_images = extract_images_from_pdf(pdf_bytes, parts_only=False, model_code=pipeline_model_code)

        with job.lock:
            job.total_images_found = len(raw_images)
            job.step_index = 4
            job.step_name = "Applying Watermark & Resizing..."
            job.progress_pct = 65
            job.details = f"Processing {len(raw_images)} parts diagrams with presets..."

        # Step 4 & 5: Watermark & Resize each image
        processed_items: list[tuple[str, bytes]] = []
        thumbnails: list[dict[str, Any]] = []

        total_imgs = max(1, len(raw_images))
        for idx, img_info in enumerate(raw_images):
            try:
                raw_bytes = img_info["raw_bytes"]
                processed_bytes, ext = process_watermark_and_resize(
                    image_bytes=raw_bytes,
                    watermark_config=watermark_config,
                    resize_config=resize_config,
                )
                fname = img_info.get("filename") or f"YAM_{pipeline_model_code}_PART_{idx + 1:03d}"
                processed_items.append((fname, processed_bytes))

                # Generate lightweight thumbnail for UI preview
                thumb = Image.open(io.BytesIO(processed_bytes))
                thumb.thumbnail((240, 240))
                thumb_buf = io.BytesIO()
                thumb.save(thumb_buf, format="JPEG", quality=80)
                thumb_b64 = base64.b64encode(thumb_buf.getvalue()).decode("utf-8")

                thumbnails.append({
                    "id": f"proc_{idx + 1}",
                    "filename": fname,
                    "fig_no": img_info.get("fig_no", ""),
                    "fig_name": img_info.get("fig_name", ""),
                    "page": img_info["page"],
                    "width": resize_config.get("width", 1000),
                    "height": resize_config.get("height", 1200),
                    "thumbnail_url": f"data:image/jpeg;base64,{thumb_b64}",
                    "size_bytes": len(processed_bytes),
                })
            except Exception as e:
                logger.warning("Pipeline image processing failed for image %d: %s", idx, e)

            with job.lock:
                job.images_processed_count = idx + 1
                job.progress_pct = 65 + int(((idx + 1) / total_imgs) * 25)
                job.details = f"Processed {idx + 1} of {len(raw_images)} images..."

        # Step 6: Create Master ZIP Archive
        with job.lock:
            job.step_index = 5
            job.step_name = "Packaging Master ZIP Bundle..."
            job.progress_pct = 95
            job.details = "Compiling Excel workbook and processed images..."

        zip_buf = io.BytesIO()
        with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
            # 1. Add Excel spreadsheet to root
            zf.writestr(excel_filename, excel_bytes)

            # 2. Add E-Commerce & SEO Metadata files (Excel + CSV)
            if job.metadata_excel_bytes:
                zf.writestr(f"{meta_filename}.xlsx", job.metadata_excel_bytes)
            if job.metadata_csv_bytes:
                zf.writestr(f"{meta_filename}.csv", job.metadata_csv_bytes)

            # 3. Add processed images into images/ subfolder
            for img_name, img_data in processed_items:
                clean_name = img_name
                if not clean_name.lower().endswith(".jpeg"):
                    clean_name = f"{clean_name}.jpeg"
                zf.writestr(f"images/{clean_name}", img_data)

            # 4. Add a readme summary file
            summary_txt = (
                f"Document & Image Studio - Automated Processing Summary\n"
                f"====================================================\n"
                f"Original File: {job.filename}\n"
                f"Generated At: {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}\n\n"
                f"1. Excel Parts Catalogue:\n"
                f"   - File: {excel_filename}\n"
                f"   - Total Parts Extracted: {len(job.rows)}\n"
                f"   - Model Columns: {', '.join(job.model_columns) if job.model_columns else 'Single Model'}\n\n"
                f"2. E-Commerce & SEO Metadata:\n"
                f"   - Excel File: {meta_filename}.xlsx\n"
                f"   - CSV File: {meta_filename}.csv\n"
                f"   - Total Metadata Records: {len(meta_items)}\n"
                f"   - Features: Product Title, Meta Title, Structured HTML Long Description, Diagram Image Reference\n\n"
                f"3. Processed Images:\n"
                f"   - Total Images Processed: {len(processed_items)}\n"
                f"   - Resolution: {resize_config.get('width', 1000)}x{resize_config.get('height', 1200)} px\n"
                f"   - Target File Size: {resize_config.get('target_min_kb', 59)}–{resize_config.get('target_max_kb', 69)} KB (Adaptive Compression)\n"
                f"   - Quality: {resize_config.get('quality', 100)}%\n"
                f"   - Watermark: Rotation={watermark_config.get('angle', -30)}°, "
                f"Padding={watermark_config.get('padding', 115)}, "
                f"Size={watermark_config.get('scale_pct', watermark_config.get('size_pct', 25))}%, "
                f"Opacity={watermark_config.get('opacity', 0.10) * 100}%\n"
            )
            zf.writestr("PROCESSING_SUMMARY.txt", summary_txt)

        zip_bytes = zip_buf.getvalue()
        zip_filename = f"{base_name}_Complete_Bundle.zip"

        with job.lock:
            job.zip_bytes = zip_bytes
            job.zip_filename = zip_filename
            job.bundle_size_bytes = len(zip_bytes)
            job.raw_processed_images = processed_items
            job.processed_thumbnails = thumbnails
            job.step_index = 5
            job.step_name = "Complete!"
            job.progress_pct = 100
            job.status = "completed"
            job.details = f"Finished! {job.total_rows} parts & {len(processed_items)} images bundled."

    except Exception as exc:
        logger.exception("Pipeline job %s encountered fatal error: %s", job.job_id, exc)
        with job.lock:
            job.status = "error"
            job.error = str(exc)
            job.details = f"Processing failed: {str(exc)}"
