import sys
import os

sys.path.insert(0, os.path.abspath("backend"))

from app.parts_extractor import extract_parts_from_pdf

pdf_path = "sample_yamaha_catalogue.pdf"
result = extract_parts_from_pdf(pdf_path)

print(f"Total pages: {result['total_pages']}")
print(f"Detected Model Columns: {result['model_columns']}")
print(f"Total parts rows: {len(result['rows'])}")
print(f"Figures detected: {[f['fig_no'] + ' ' + f['fig_name'] for f in result['figures']]}")

print("\n--- SAMPLE EXTRACTED ROWS ---")
for r in result["rows"][:5]:
    print(r)

print("\n--- CONTINUATION ROWS IN FIG 14 (Ref 1 and Ref 3) ---")
fig14_rows = [r for r in result["rows"] if r["fig_no"] == "14"]
for r in fig14_rows:
    print(f"Fig {r['fig_no']} | Ref {r['ref_no']} | Part {r['part_no']} | Desc: {r['description']} | BGPK: {r.get('BGPK', '')} | Remarks: {r['remarks']}")
