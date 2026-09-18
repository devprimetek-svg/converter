"""API endpoint integration tests."""

import io
import time
from fastapi.testclient import TestClient

from app.main import app
from tests.test_parts_extractor import _create_synthetic_catalogue_pdf

client = TestClient(app)


def test_health_endpoint():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_extract_and_export_flow():
    # 1. Create synthetic PDF
    pdf_buf = _create_synthetic_catalogue_pdf()
    files = {"file": ("test_catalogue.pdf", pdf_buf.getvalue(), "application/pdf")}

    # 2. Upload to /api/extract
    response = client.post("/api/extract", files=files)
    assert response.status_code == 200
    data = response.json()
    assert "job_id" in data
    job_id = data["job_id"]

    # 3. Poll /api/extract/status/{job_id} until completed
    max_wait = 10
    start_time = time.time()
    status_data = None

    while time.time() - start_time < max_wait:
        status_res = client.get(f"/api/extract/status/{job_id}")
        assert status_res.status_code == 200
        status_data = status_res.json()
        if status_data["status"] in ("completed", "error"):
            break
        time.sleep(0.2)

    assert status_data is not None
    assert status_data["status"] == "completed"
    assert status_data["total_rows"] == 3
    assert "BGPK" in status_data["model_columns"]
    assert len(status_data["rows"]) == 3

    # 4. Test /api/export with clean part numbers
    export_payload = {
        "filename": "test_catalogue",
        "clean_part_numbers": True,
        "model_columns": status_data["model_columns"],
        "rows": status_data["rows"],
    }
    export_res = client.post("/api/export", json=export_payload)
    assert export_res.status_code == 200
    assert export_res.headers["content-type"] == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    assert "test_catalogue_Parts.xlsx" in export_res.headers.get("content-disposition", "")
    assert export_res.content[:4] == b"PK\x03\x04"


def test_extract_invalid_extension():
    files = {"file": ("test.txt", b"not a pdf", "text/plain")}
    response = client.post("/api/extract", files=files)
    assert response.status_code == 400
    assert "PDF files (.pdf) are supported" in response.json()["detail"]


def test_multi_model_export():
    """Verify exporting specific model code downloads filtered file."""
    rows = [
        {"page": 1, "fig_no": "1", "fig_name": "HEAD", "ref_no": "1", "part_no": "95022-06010", "description": "BOLT", "BGPJ": "1", "BGPL": "1", "remarks": ""},
        {"page": 1, "fig_no": "1", "fig_name": "HEAD", "ref_no": "2", "part_no": "90430-06817", "description": "GASKET", "BGPJ": "2", "BGPL": "", "remarks": ""},
        {"page": 1, "fig_no": "1", "fig_name": "HEAD", "ref_no": "3", "part_no": "95612-08618", "description": "STUD", "BGPJ": "", "BGPL": "1", "remarks": ""},
    ]

    # Export for BGPJ only
    res_bgpj = client.post(
        "/api/export",
        json={
            "filename": "Catalogue_2026",
            "clean_part_numbers": False,
            "model_columns": ["BGPJ", "BGPL"],
            "target_model": "BGPJ",
            "rows": rows,
        },
    )
    assert res_bgpj.status_code == 200
    assert "Catalogue_2026_BGPJ_Parts.xlsx" in res_bgpj.headers.get("content-disposition", "")

    # Export for BGPL only
    res_bgpl = client.post(
        "/api/export",
        json={
            "filename": "Catalogue_2026",
            "clean_part_numbers": False,
            "model_columns": ["BGPJ", "BGPL"],
            "target_model": "BGPL",
            "rows": rows,
        },
    )
    assert res_bgpl.status_code == 200
    assert "Catalogue_2026_BGPL_Parts.xlsx" in res_bgpl.headers.get("content-disposition", "")

