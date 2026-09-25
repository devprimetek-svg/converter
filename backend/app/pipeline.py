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

from app.excel_export import generate_excel_workbook, is_valid_quantity
from app.image_tools import extract_images_from_pdf, process_watermark_and_resize
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

        # Multi-model separated data
        self.model_data: dict[str, dict[str, Any]] = {}

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
            base_name = re.sub(r"\.pdf$", "", self.filename, flags=re.IGNORECASE)
            base_name = re.sub(r'[\\/*?:"<>| ]', "_", base_name).strip("_") or "Catalogue"
            payload = {
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
                "zip_ready": self.zip_bytes is not None,
                "zip_filename": self.zip_filename,
                "bundle_size_bytes": self.bundle_size_bytes,
                "processed_thumbnails": self.processed_thumbnails[:50],  # cap for UI speed
                "rows_sample": self.rows[:10],
                "error": self.error,
                "model_folders": [
                    {
                        "model_code": m,
                        "parts_count": len([r for r in self.rows if is_valid_quantity(r.get(m))]),
                        "excel_filename": self.model_data.get(m, {}).get("excel_filename", f"{base_name}_{m}_Parts.xlsx"),
                        "zip_filename": self.model_data.get(m, {}).get("zip_filename", f"{base_name}_{m}_Bundle.zip"),
                        "images_count": self.model_data.get(m, {}).get("images_count", 0),
                    }
                    for m in self.model_columns
                ] if len(self.model_columns) >= 1 else [],
            }
            if self.status == "completed" or self.step_index >= 2:
                payload["rows"] = self.rows
                payload["figures"] = self.figures
            return payload


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

        # Step 2: Excel workbook generation
        excel_buf = generate_excel_workbook(
            rows=job.rows,
            model_columns=job.model_columns,
            clean_parts=clean_parts,
        )
        excel_bytes = excel_buf.getvalue()
        excel_filename = f"{base_name}_Parts.xlsx"

        # Resolve all applicable model codes
        # 1. From detected model columns in table headers
        model_codes = [str(c).strip() for c in job.model_columns if str(c).strip()]

        # 2. If no model columns were detected from table headers, check filename
        if not model_codes:
            m_list = re.findall(r"\b([A-Z0-9]{3,6})\b", job.filename.upper())
            generic = {"PARTS", "CATALOGUE", "CATALOG", "YAMAHA", "INDIA", "MODEL"}
            filtered_m = [x for x in m_list if x not in generic]
            if filtered_m:
                model_codes = list(dict.fromkeys(filtered_m))

        has_multiple_models = len(model_codes) >= 2

        # Pre-generate individual Excel workbooks for each model code
        model_excel_data: dict[str, dict[str, Any]] = {}
        if model_codes:
            for m in model_codes:
                if m in job.model_columns and has_multiple_models:
                    m_rows = [r for r in job.rows if is_valid_quantity(r.get(m))]
                else:
                    m_rows = job.rows
                m_excel_buf = generate_excel_workbook(
                    rows=m_rows,
                    model_columns=[m] if m in job.model_columns else (job.model_columns or [m]),
                    clean_parts=clean_parts,
                    sheet_title=f"Parts_{m}"[:31],
                )
                m_excel_bytes = m_excel_buf.getvalue()
                m_excel_fname = f"{base_name}_{m}_Parts.xlsx"
                model_excel_data[m] = {
                    "excel_bytes": m_excel_bytes,
                    "excel_filename": m_excel_fname,
                    "rows": m_rows,
                    "parts_count": len(m_rows),
                }

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

        with job.lock:
            job.excel_bytes = excel_bytes
            job.excel_filename = excel_filename
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
        processed_items: list[tuple[str, bytes, dict[str, Any]]] = []
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
                processed_items.append((fname, processed_bytes, img_info))

                # Generate lightweight thumbnail for UI preview
                thumb = Image.open(io.BytesIO(processed_bytes))
                thumb.thumbnail((240, 240))
                thumb_buf = io.BytesIO()
                thumb.save(thumb_buf, format="JPEG", quality=80)
                thumb_b64 = base64.b64encode(thumb_buf.getvalue()).decode("utf-8")

                # Find which models this diagram applies to
                img_fig_no = str(img_info.get("fig_no", "")).strip()
                img_fig_name = str(img_info.get("fig_name", "")).strip().upper()
                applicable_models = []
                if has_multiple_models:
                    for m in model_codes:
                        m_rows = model_excel_data[m]["rows"]
                        m_fig_nos = {str(r.get("fig_no", "")).strip() for r in m_rows if r.get("fig_no")}
                        m_fig_names = {str(r.get("fig_name", "")).strip().upper() for r in m_rows if r.get("fig_name")}
                        if not m_fig_nos and not m_fig_names:
                            applicable_models.append(m)
                        elif img_fig_no in m_fig_nos or img_fig_name in m_fig_names:
                            applicable_models.append(m)
                else:
                    applicable_models = [pipeline_model_code]

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
                    "models": applicable_models,
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
            job.details = "Compiling Excel workbooks and processed images..."

        zip_buf = io.BytesIO()
        with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
            if has_multiple_models:
                summary_models_lines = []
                for m in model_codes:
                    m_info = model_excel_data[m]
                    m_rows = m_info["rows"]
                    m_fig_nos = {str(r.get("fig_no", "")).strip() for r in m_rows if r.get("fig_no")}
                    m_fig_names = {str(r.get("fig_name", "")).strip().upper() for r in m_rows if r.get("fig_name")}

                    # 1. Add model-specific Excel sheet into its dedicated folder: {m}/
                    zf.writestr(f"{m}/{m_info['excel_filename']}", m_info["excel_bytes"])

                    # 2. Add diagrams specifically named for this model into {m}/images/
                    m_fig_counter: dict[str, int] = {}
                    m_image_items: list[tuple[str, bytes]] = []
                    for _, proc_bytes, img_info in processed_items:
                        img_fig_no = str(img_info.get("fig_no", "")).strip()
                        img_fig_name = str(img_info.get("fig_name", "")).strip()

                        # Check applicability
                        if m_fig_nos or m_fig_names:
                            if img_fig_no not in m_fig_nos and img_fig_name.upper() not in m_fig_names:
                                continue

                        clean_part_name = re.sub(r'[\/:*?"<>|\r\n\t]', " ", img_fig_name)
                        clean_part_name = re.sub(r"\s+", " ", clean_part_name).strip()
                        if not clean_part_name:
                            padded_no = img_fig_no.zfill(2) if img_fig_no.isdigit() else img_fig_no
                            clean_part_name = f"FIG_{padded_no}" if padded_no else f"PAGE_{img_info['page']}"

                        counter_key = f"{img_fig_no}_{clean_part_name}"
                        count = m_fig_counter.get(counter_key, 0) + 1
                        m_fig_counter[counter_key] = count
                        suffix = f"_{count}" if count > 1 else ""
                        m_img_name = f"YAM_{m}_{clean_part_name}{suffix}.jpeg"

                        # Write to model folder in master zip
                        zf.writestr(f"{m}/images/{m_img_name}", proc_bytes)
                        m_image_items.append((m_img_name, proc_bytes))

                    # 3. Create standalone individual ZIP bundle for this model code
                    m_zip_buf = io.BytesIO()
                    with zipfile.ZipFile(m_zip_buf, "w", zipfile.ZIP_DEFLATED) as m_zf:
                        m_zf.writestr(m_info["excel_filename"], m_info["excel_bytes"])
                        for m_img_name, m_bytes in m_image_items:
                            m_zf.writestr(f"images/{m_img_name}", m_bytes)
                        m_zf.writestr(
                            "README.txt",
                            f"Model: {m}\n"
                            f"Catalogue: {job.filename}\n"
                            f"Total Parts: {len(m_rows)}\n"
                            f"Total Diagrams: {len(m_image_items)}\n"
                            f"Generated At: {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}\n"
                        )

                    job.model_data[m] = {
                        "excel_bytes": m_info["excel_bytes"],
                        "excel_filename": m_info["excel_filename"],
                        "parts_count": len(m_rows),
                        "images_count": len(m_image_items),
                        "zip_bytes": m_zip_buf.getvalue(),
                        "zip_filename": f"{base_name}_{m}_Bundle.zip",
                    }
                    summary_models_lines.append(
                        f"   - Folder '{m}/': {len(m_rows)} parts, {len(m_image_items)} diagrams ({m_info['excel_filename']})"
                    )

                # Write Master All-Models combined Excel to root
                master_excel_filename = f"{base_name}_All_Models_Parts.xlsx"
                zf.writestr(master_excel_filename, excel_bytes)

                # Write Summary text
                summary_txt = (
                    f"Document & Image Studio - Automated Processing Summary\n"
                    f"====================================================\n"
                    f"Original File: {job.filename}\n"
                    f"Generated At: {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}\n"
                    f"Detected Model Codes ({len(model_codes)}): {', '.join(model_codes)}\n\n"
                    f"INDIVIDUAL MODEL FOLDERS IN ARCHIVE:\n"
                    + "\n".join(summary_models_lines)
                    + f"\n\nMASTER WORKBOOK:\n"
                    f"   - Root File: {master_excel_filename} (Combined with all model columns)\n\n"
                    f"IMAGE SPECIFICATIONS:\n"
                    f"   - Resolution: {resize_config.get('width', 1000)}x{resize_config.get('height', 1200)} px\n"
                    f"   - Target File Size: {resize_config.get('target_min_kb', 59)}–{resize_config.get('target_max_kb', 69)} KB (Adaptive Compression)\n"
                    f"   - Quality: {resize_config.get('quality', 100)}%\n"
                    f"   - Watermark: Rotation={watermark_config.get('angle', -30)}°, "
                    f"Padding={watermark_config.get('padding', 115)}, "
                    f"Size={watermark_config.get('scale_pct', watermark_config.get('size_pct', 25))}%, "
                    f"Opacity={watermark_config.get('opacity', 0.10) * 100}%\n"
                )
                zf.writestr("PROCESSING_SUMMARY.txt", summary_txt)

            else:
                # Single model: maintain root Excel and images/, plus dedicated {m}/ folder if model code known
                zf.writestr(excel_filename, excel_bytes)
                for fname, proc_bytes, _ in processed_items:
                    clean_name = fname if fname.lower().endswith(".jpeg") else f"{fname}.jpeg"
                    zf.writestr(f"images/{clean_name}", proc_bytes)

                # If a model code was identified (e.g. BGPK), also package into {m}/ and create standalone bundle
                m_single = model_codes[0] if model_codes else ""
                if m_single and m_single in model_excel_data:
                    m_info = model_excel_data[m_single]
                    zf.writestr(f"{m_single}/{m_info['excel_filename']}", m_info["excel_bytes"])

                    m_image_items: list[tuple[str, bytes]] = []
                    for fname, proc_bytes, _ in processed_items:
                        clean_name = fname if fname.lower().endswith(".jpeg") else f"{fname}.jpeg"
                        zf.writestr(f"{m_single}/images/{clean_name}", proc_bytes)
                        m_image_items.append((clean_name, proc_bytes))

                    # Standalone individual ZIP bundle for this model code
                    m_zip_buf = io.BytesIO()
                    with zipfile.ZipFile(m_zip_buf, "w", zipfile.ZIP_DEFLATED) as m_zf:
                        m_zf.writestr(m_info["excel_filename"], m_info["excel_bytes"])
                        for m_img_name, m_bytes in m_image_items:
                            m_zf.writestr(f"images/{m_img_name}", m_bytes)
                        m_zf.writestr(
                            "README.txt",
                            f"Model: {m_single}\n"
                            f"Catalogue: {job.filename}\n"
                            f"Total Parts: {len(m_info['rows'])}\n"
                            f"Total Diagrams: {len(m_image_items)}\n"
                            f"Generated At: {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}\n"
                        )

                    job.model_data[m_single] = {
                        "excel_bytes": m_info["excel_bytes"],
                        "excel_filename": m_info["excel_filename"],
                        "parts_count": len(m_info["rows"]),
                        "images_count": len(m_image_items),
                        "zip_bytes": m_zip_buf.getvalue(),
                        "zip_filename": f"{base_name}_{m_single}_Bundle.zip",
                    }

                summary_models_str = f"Folder '{m_single}/' & Root Files" if m_single else "Single Model (Flat Structure)"
                summary_txt = (
                    f"Document & Image Studio - Automated Processing Summary\n"
                    f"====================================================\n"
                    f"Original File: {job.filename}\n"
                    f"Generated At: {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}\n\n"
                    f"1. Excel Parts Catalogue:\n"
                    f"   - File: {excel_filename}\n"
                    f"   - Total Parts Extracted: {len(job.rows)}\n"
                    f"   - Model Code: {m_single or 'Single Model'}\n"
                    f"   - Packaging: {summary_models_str}\n\n"
                    f"2. Processed Images:\n"
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
            job.raw_processed_images = [(f, b) for f, b, _ in processed_items]
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
