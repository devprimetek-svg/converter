# PDF Parts Catalogue to Excel Converter

A high-accuracy, full-stack web application that parses Yamaha-style motorcycle and power-equipment PDF Parts Catalogues, extracts parts tables using word-level coordinate clustering, detects rotated vertical model-code columns, reconstructs continuation rows, and exports structured, professionally formatted Microsoft Excel (`.xlsx`) workbooks.

---

## Features

- **Millimeter-Precision Coordinate Extraction**: Uses `pdfplumber` word coordinates (`x0`, `x1`, `top`, `bottom`) to cluster words into physical lines with ~2pt tolerance, avoiding text flow and ordering artifacts.
- **Vertical Model Code Detection & Reversal**: Identifies single uppercase letters stacked vertically above quantity columns between `DESCRIPTION` and `REMARKS`, groups them by horizontal proximity (~6pt tolerance), sorts by vertical order, and reverses the string to extract true model codes (e.g. `J` `P` `G` `B` top-to-bottom &rarr; `JPGB` &rarr; reversed &rarr; `BGPJ`).
- **Dynamic Multi-Model Export Buttons**: When two or more model codes are detected in a single catalogue (e.g. `BGPJ` and `BGPL`):
  - Automatically enables dedicated export buttons for each model (`Export BGPJ`, `Export BGPL`) with real-time part counts alongside the master `Export All Models` button.
  - Model-specific exports filter the Excel file to only include parts applicable to that model (rows with non-empty quantity) and only that model's quantity column, saved as `<filename>_<MODEL>_Parts.xlsx`.
  - Also adds a model filter in the table toolbar allowing instant on-screen isolation of parts for any model.
- **Continuation Row Reconstruction**: Detects multi-row variants (e.g. color options or superseded part numbers) that omit the reference number and automatically assigns them the preceding `REF NO.`.
- **Catalogue Navigation & Section Filtering**: Automatically detects figure headings (`FIG. <NO> <NAME>`), tracks continuation pages across page breaks, and skips front matter, contents, and the terminal `NUMERICAL INDEX`.
- **Smart "Clean Part No." Engine**:
  - Live preview toggle and Excel option.
  - Strips hyphens, en-dashes (`–`), em-dashes (`—`), and spaces.
  - Automatically appends `'00'` only if the cleaned number is exactly 10 characters long.
  - Leaves 12-character (painted/colored) or non-standard part numbers untouched.
- **Enterprise-Grade Excel Output (`.xlsx`)**:
  - Yamaha Deep Navy (`#1B365D`) bold white header.
  - Thin borders on all cells.
  - Frozen top header row (`A2`).
  - Autofilter enabled across all columns.
  - Auto-fitted column widths with padding.
  - True text formatting for part numbers and reference numbers to prevent leading zero loss.
- **100% In-Memory Privacy**: Uploaded PDFs and extracted rows are processed entirely in memory via `io.BytesIO` buffers. No files or catalogues are ever written to disk or databases.
- **Friendly Scanned PDF Handling**: Detects PDFs without extractable text layers and displays a clear message that OCR is not supported.

---

## Project Structure

```text
/backend
  app/
    __init__.py
    main.py               # FastAPI application, streaming SSE, and REST endpoints
    parts_extractor.py    # Core coordinate clustering & extraction engine
    excel_export.py       # openpyxl workbook generator with corporate styling
  tests/
    test_parts_extractor.py  # Unit tests for clustering, reversal, rows, and synthetic PDF
    test_api.py              # Integration tests for FastAPI endpoints
  requirements.txt
  Dockerfile
  pytest.ini

/frontend
  src/
    components/
      Navbar.tsx             # Header with theme toggle (Dark / Light mode)
      FileUploadZone.tsx     # Drag-and-drop zone with validation (<50MB)
      ProgressBar.tsx        # Real-time extraction progress (page X of Y)
      ResultsDashboard.tsx   # KPI cards, search, figure dropdown, clean toggle
      PartsTable.tsx         # Sortable, paginated data table
      ErrorAlert.tsx         # Scanned PDF & error alerts
    utils/
      cleanPartNo.ts         # Client-side part cleaning utility
    types.ts                 # TypeScript type declarations
    App.tsx                  # Root state machine and controller
    main.tsx
    index.css                # Tailwind CSS layers
  package.json
  vite.config.ts             # Vite configuration with API reverse proxy
  tailwind.config.js
  postcss.config.js
  Dockerfile
  nginx.conf

/scripts
  generate_sample_catalogue.py  # Generates test Yamaha PDF catalogue
  verify_sample.py              # CLI verification script

docker-compose.yml
README.md
```

---

## Quick Start (Local Development)

### 1. Backend Setup

Prerequisites: Python 3.11+

```bash
cd backend
python -m venv venv

# Windows (Command Prompt / PowerShell):
venv\Scripts\activate
# Linux / macOS:
# source venv/bin/activate

pip install -r requirements.txt
```

Run backend server:
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
The backend API will be available at `http://127.0.0.1:8000` (docs at `http://127.0.0.1:8000/docs`).

Run tests:
```bash
pytest -v tests
```

### 2. Frontend Setup

Prerequisites: Node.js 18+ and npm

```bash
cd frontend
npm install
npm run dev
```
The frontend application will be available at `http://localhost:5173`.

---

## One-Command Run with Docker Compose

To launch the full stack with Docker:

```bash
docker-compose up --build
```

- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:8000`

---

## Generating Sample Test PDF

You can generate a test Yamaha parts catalogue PDF containing figure headings, vertical model codes, continuation rows, and a numerical index:

```bash
python scripts/generate_sample_catalogue.py
```
This produces `sample_yamaha_catalogue.pdf` in the project root, which you can drag and drop directly into the web UI.

---

## API Reference

### `POST /api/extract`
Uploads a PDF Parts Catalogue and initializes an asynchronous in-memory parsing job.
- **Request**: `multipart/form-data` with `file: UploadFile` (PDF only, max 50MB)
- **Response**: `{"job_id": "<uuid>", "filename": "...", "status": "processing"}`

### `GET /api/extract/stream/{job_id}`
Server-Sent Events (SSE) endpoint providing real-time progress events:
```json
{
  "job_id": "...",
  "status": "processing",
  "current_page": 14,
  "total_pages": 50,
  "current_fig_no": "7",
  "current_fig_name": "INTAKE",
  "total_rows": 320
}
```
When complete, sends `status: "completed"` along with the full `rows`, `model_columns`, and `figures`.

### `GET /api/extract/status/{job_id}`
Polling alternative to SSE returning the current job status and rows upon completion.

### `POST /api/export`
Generates and streams the formatted `.xlsx` workbook download.
- **Request Body**:
  ```json
  {
    "filename": "LCX125_BGPK",
    "clean_part_numbers": true,
    "model_columns": ["BGPK"],
    "rows": [...]
  }
  ```
- **Response**: Binary `.xlsx` stream with header `Content-Disposition: attachment; filename="<filename>_Parts.xlsx"`.
