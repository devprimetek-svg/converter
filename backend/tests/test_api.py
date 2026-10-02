"""API endpoint integration tests."""

import io
import time
import openpyxl
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


def test_blank_quantity_row_and_remarks_omitted():
    """Verify that when a model code quantity is blank, the entire row and remarks are excluded from Excel."""
    import openpyxl

    rows = [
        {
            "page": 1,
            "fig_no": "1",
            "fig_name": "CYLINDER",
            "ref_no": "1",
            "part_no": "95022-06010",
            "description": "BOLT, FLANGE",
            "BGPK": "2",
            "BGPL": "-",
            "remarks": "UR FOR BGPK ONLY",
        },
        {
            "page": 1,
            "fig_no": "1",
            "fig_name": "CYLINDER",
            "ref_no": "2",
            "part_no": "90430-06817",
            "description": "GASKET",
            "BGPK": "",
            "BGPL": "1",
            "remarks": "UR FOR BGPL ONLY",
        },
        {
            "page": 1,
            "fig_no": "1",
            "fig_name": "CYLINDER",
            "ref_no": "3",
            "part_no": "99999-00000",
            "description": "UNASSIGNED PART",
            "BGPK": "",
            "BGPL": "",
            "remarks": "NEITHER MODEL",
        },
    ]

    # 1. Export BGPK only
    res_bgpk = client.post(
        "/api/export",
        json={
            "filename": "Test_MultiModel",
            "clean_part_numbers": False,
            "model_columns": ["BGPK", "BGPL"],
            "target_model": "BGPK",
            "rows": rows,
        },
    )
    assert res_bgpk.status_code == 200
    wb_bgpk = openpyxl.load_workbook(io.BytesIO(res_bgpk.content))
    ws_bgpk = wb_bgpk.active
    # Collect all cell text across all rows
    all_bgpk_texts = [cell.value for r in ws_bgpk.iter_rows() for cell in r if cell.value is not None]

    # Row 1 must be present (BGPK has qty 2)
    assert "95022-06010" in all_bgpk_texts
    assert "UR FOR BGPK ONLY" in all_bgpk_texts

    # Row 2 (BGPK is blank) must NOT be present (part no and remarks excluded)
    assert "90430-06817" not in all_bgpk_texts
    assert "UR FOR BGPL ONLY" not in all_bgpk_texts

    # Row 3 (both blank) must NOT be present
    assert "99999-00000" not in all_bgpk_texts
    assert "NEITHER MODEL" not in all_bgpk_texts

    # 2. Export BGPL only
    res_bgpl = client.post(
        "/api/export",
        json={
            "filename": "Test_MultiModel",
            "clean_part_numbers": False,
            "model_columns": ["BGPK", "BGPL"],
            "target_model": "BGPL",
            "rows": rows,
        },
    )
    assert res_bgpl.status_code == 200
    wb_bgpl = openpyxl.load_workbook(io.BytesIO(res_bgpl.content))
    ws_bgpl = wb_bgpl.active
    all_bgpl_texts = [cell.value for r in ws_bgpl.iter_rows() for cell in r if cell.value is not None]

    # Row 2 must be present (BGPL has qty 1)
    assert "90430-06817" in all_bgpl_texts
    assert "UR FOR BGPL ONLY" in all_bgpl_texts

    # Row 1 (BGPL is "-") must NOT be present
    assert "95022-06010" not in all_bgpl_texts
    assert "UR FOR BGPK ONLY" not in all_bgpl_texts

    # 3. Export ALL models
    res_all = client.post(
        "/api/export",
        json={
            "filename": "Test_MultiModel",
            "clean_part_numbers": False,
            "model_columns": ["BGPK", "BGPL"],
            "rows": rows,
        },
    )
    assert res_all.status_code == 200
    wb_all = openpyxl.load_workbook(io.BytesIO(res_all.content))
    ws_all = wb_all.active
    all_texts = [cell.value for r in ws_all.iter_rows() for cell in r if cell.value is not None]

    # Row 1 and Row 2 have at least one valid qty, so present
    assert "95022-06010" in all_texts
    assert "90430-06817" in all_texts
    # Row 3 has NO valid qty in either model, so it MUST be omitted
    assert "99999-00000" not in all_texts
    assert "NEITHER MODEL" not in all_texts


def test_erp_connection_and_sync_api():
    """Verify Simplify ERP connection, data synchronization, and history tracking."""
    # 1. Test ERP Connection
    res_conn = client.post(
        "/api/erp/test-connection",
        json={
            "endpoint_url": "https://api.simplifyerp.com/v1",
            "api_key": "live_test_key_123",
            "tenant_id": "indiaspare_parts",
        },
    )
    assert res_conn.status_code == 200
    conn_data = res_conn.json()
    assert conn_data["status"] == "connected"
    assert conn_data["auth_valid"] is True
    assert "Item Master Auto-Upsert" in conn_data["features_enabled"]

    # 2. Test ERP Sync with ERP fields (HSN, GST, MRP, Rack/Bin)
    test_rows = [
        {
            "fig_no": "1",
            "fig_name": "CYLINDER",
            "ref_no": "1",
            "part_no": "54B-E1193-00",
            "description": "GASKET, CYLINDER",
            "QTY": "1",
            "hsn_code": "8714",
            "gst_rate": 28,
            "mrp": 145.0,
            "cost_price": 95.0,
            "dealer_price": 116.0,
            "rack_bin": "A01-B12",
        },
    ]

    res_sync = client.post(
        "/api/erp/sync",
        json={
            "catalog_name": "Yamaha Fascino 125",
            "model_code": "BJPK",
            "rows": test_rows,
            "figures": [{"fig_no": "1", "fig_name": "CYLINDER"}],
            "images_meta": [{"id": "proc_1", "filename": "YAM_BJPK_CYLINDER.jpeg"}],
        },
    )
    assert res_sync.status_code == 200
    sync_data = res_sync.json()
    assert sync_data["success"] is True
    assert sync_data["sync_id"].startswith("SYNC-ERP-")
    assert sync_data["details"]["valid_skus"] == 1
    assert sync_data["details"]["hsn_mapped_count"] == 1

    # 3. Test ERP History
    res_hist = client.get("/api/erp/history")
    assert res_hist.status_code == 200
    hist_data = res_hist.json()
    assert len(hist_data["history"]) >= 1
    assert hist_data["history"][0]["sync_id"] == sync_data["sync_id"]

    # 4. Test Export with ERP columns
    res_export = client.post(
        "/api/export",
        json={
            "filename": "ERP_Export_Test",
            "clean_part_numbers": False,
            "model_columns": ["QTY"],
            "rows": test_rows,
        },
    )
    assert res_export.status_code == 200
    wb_erp = openpyxl.load_workbook(io.BytesIO(res_export.content))
    ws_erp = wb_erp.active
    header_vals = [cell.value for cell in ws_erp[1]]
    assert "HSN Code" in header_vals
    assert "MRP (INR)" in header_vals
    assert "Rack / Bin" in header_vals






