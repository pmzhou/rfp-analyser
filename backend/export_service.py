"""Export merged proposal as PDF (reportlab) or Excel (openpyxl)."""
import io
from typing import Dict, Any, List

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
)
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side


def _style():
    s = getSampleStyleSheet()
    s.add(ParagraphStyle(name="H", fontName="Helvetica-Bold", fontSize=22, leading=26, spaceAfter=8))
    s.add(ParagraphStyle(name="Sub", fontName="Helvetica", fontSize=10, leading=12, textColor=colors.grey, spaceAfter=14))
    s.add(ParagraphStyle(name="Section", fontName="Helvetica-Bold", fontSize=11, leading=14, spaceBefore=14, spaceAfter=6, textColor=colors.HexColor("#0055FF")))
    s.add(ParagraphStyle(name="Body", fontName="Helvetica", fontSize=9, leading=12))
    return s


def _table(data, col_widths=None, header=True):
    t = Table(data, colWidths=col_widths)
    style = [
        ("FONTNAME", (0,0), (-1,-1), "Helvetica"),
        ("FONTSIZE", (0,0), (-1,-1), 8),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("LINEBELOW", (0,0), (-1,-1), 0.25, colors.HexColor("#E4E4E7")),
        ("LEFTPADDING", (0,0), (-1,-1), 4),
        ("RIGHTPADDING", (0,0), (-1,-1), 4),
        ("TOPPADDING", (0,0), (-1,-1), 4),
        ("BOTTOMPADDING", (0,0), (-1,-1), 4),
    ]
    if header:
        style += [
            ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
            ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#0A0A0B")),
            ("TEXTCOLOR", (0,0), (-1,0), colors.white),
        ]
    t.setStyle(TableStyle(style))
    return t


def export_pdf(project: Dict[str, Any], invites: List[Dict[str, Any]]) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18*mm, rightMargin=18*mm, topMargin=18*mm, bottomMargin=18*mm)
    s = _style()
    flow = []
    flow.append(Paragraph(project.get("title", "Untitled RFP"), s["H"]))
    flow.append(Paragraph(f"Client: {project.get('client_name') or '—'} · Status: {project.get('status', '—')}", s["Sub"]))

    a = project.get("analysis") or {}
    if a.get("summary"):
        flow.append(Paragraph("Executive Summary", s["Section"]))
        flow.append(Paragraph(a["summary"], s["Body"]))

    # Submitted fees
    submitted = [i for i in invites if i.get("status") == "submitted" and i.get("fee") is not None]
    flow.append(Paragraph("Merged Fee Proposal", s["Section"]))
    if submitted:
        rows = [["Discipline", "Consultant", "Fee", "Currency", "Timeline"]]
        for i in submitted:
            rows.append([
                i.get("discipline", ""),
                f"{i.get('consultant_name','')}\n{i.get('consultant_company','')}",
                f"{float(i['fee']):,.2f}",
                i.get("currency", ""),
                i.get("response_timeline", ""),
            ])
        flow.append(_table(rows, col_widths=[35*mm, 50*mm, 25*mm, 20*mm, 30*mm]))
        # Totals
        totals: Dict[str, float] = {}
        for i in submitted:
            cur = i.get("currency") or "USD"
            totals[cur] = totals.get(cur, 0.0) + float(i["fee"])
        flow.append(Spacer(1, 8))
        for cur, tot in totals.items():
            flow.append(Paragraph(f"<b>Total {cur}: {tot:,.2f}</b>", s["Body"]))
    else:
        flow.append(Paragraph("<i>No fees submitted yet.</i>", s["Body"]))

    if a.get("key_dates"):
        flow.append(PageBreak())
        flow.append(Paragraph("Key Dates", s["Section"]))
        rows = [["Date", "Label", "Type"]]
        for d in a["key_dates"]:
            rows.append([d.get("date",""), d.get("label",""), d.get("type","")])
        flow.append(_table(rows, col_widths=[30*mm, 90*mm, 30*mm]))

    if a.get("requirements"):
        flow.append(Paragraph("Requirements", s["Section"]))
        rows = [["ID", "Category", "Requirement", "Mandatory"]]
        for r in a["requirements"]:
            rows.append([r.get("id",""), r.get("category",""),
                         Paragraph(r.get("requirement",""), s["Body"]),
                         "Yes" if r.get("mandatory") else "No"])
        flow.append(_table(rows, col_widths=[18*mm, 30*mm, 105*mm, 18*mm]))

    if a.get("disciplines"):
        flow.append(Paragraph("Disciplines", s["Section"]))
        rows = [["Name", "Scope"]]
        for d in a["disciplines"]:
            rows.append([d.get("name",""), Paragraph(d.get("scope_summary",""), s["Body"])])
        flow.append(_table(rows, col_widths=[40*mm, 130*mm]))

    doc.build(flow)
    return buf.getvalue()


def export_xlsx(project: Dict[str, Any], invites: List[Dict[str, Any]]) -> bytes:
    wb = Workbook()
    head_fill = PatternFill("solid", fgColor="0A0A0B")
    head_font = Font(bold=True, color="FFFFFF", name="Calibri")
    border = Border(*[Side(style="thin", color="E4E4E7")]*4)

    def write_table(ws, headers, rows, widths=None):
        for ci, h in enumerate(headers, 1):
            c = ws.cell(row=1, column=ci, value=h)
            c.fill = head_fill; c.font = head_font; c.alignment = Alignment(vertical="center")
            if widths and ci-1 < len(widths): ws.column_dimensions[c.column_letter].width = widths[ci-1]
        for ri, row in enumerate(rows, 2):
            for ci, val in enumerate(row, 1):
                c = ws.cell(row=ri, column=ci, value=val)
                c.border = border; c.alignment = Alignment(vertical="top", wrap_text=True)

    # Sheet 1: Summary
    ws = wb.active
    ws.title = "Summary"
    a = project.get("analysis") or {}
    ws["A1"] = "RFP Analyser — Merged Proposal"; ws["A1"].font = Font(bold=True, size=16)
    ws["A3"] = "Title"; ws["B3"] = project.get("title", "")
    ws["A4"] = "Client"; ws["B4"] = project.get("client_name", "")
    ws["A5"] = "Status"; ws["B5"] = project.get("status", "")
    ws["A6"] = "Summary"; ws["B6"] = a.get("summary", "")
    for col in ["A", "B"]: ws.column_dimensions[col].width = 30 if col == "A" else 80

    # Sheet 2: Fees
    ws2 = wb.create_sheet("Fees")
    submitted = [i for i in invites if i.get("status") == "submitted" and i.get("fee") is not None]
    rows = [[i.get("discipline",""), i.get("consultant_name",""), i.get("consultant_company",""),
             float(i["fee"]), i.get("currency",""), i.get("response_timeline",""), i.get("response_notes","")]
            for i in submitted]
    write_table(ws2, ["Discipline","Consultant","Company","Fee","Currency","Timeline","Notes"], rows, [22, 22, 22, 14, 10, 18, 40])

    # Totals
    totals: Dict[str, float] = {}
    for i in submitted:
        cur = i.get("currency") or "USD"
        totals[cur] = totals.get(cur, 0.0) + float(i["fee"])
    last = len(rows) + 3
    ws2.cell(row=last, column=1, value="TOTALS").font = Font(bold=True)
    for j, (cur, tot) in enumerate(totals.items(), 1):
        ws2.cell(row=last+j, column=1, value=cur).font = Font(bold=True)
        ws2.cell(row=last+j, column=4, value=tot).font = Font(bold=True)

    # Sheet 3: Requirements
    ws3 = wb.create_sheet("Requirements")
    rows = [[r.get("id",""), r.get("category",""), r.get("requirement",""),
             "Yes" if r.get("mandatory") else "No", r.get("source","")]
            for r in (a.get("requirements") or [])]
    write_table(ws3, ["ID","Category","Requirement","Mandatory","Source"], rows, [10, 22, 60, 12, 22])

    # Sheet 4: Key dates
    ws4 = wb.create_sheet("Key Dates")
    rows = [[d.get("date",""), d.get("label",""), d.get("type","")] for d in (a.get("key_dates") or [])]
    write_table(ws4, ["Date","Label","Type"], rows, [16, 60, 16])

    # Sheet 5: Disciplines
    ws5 = wb.create_sheet("Disciplines")
    rows = [[d.get("name",""), d.get("description",""), d.get("scope_summary","")] for d in (a.get("disciplines") or [])]
    write_table(ws5, ["Name","Description","Scope summary"], rows, [22, 40, 60])

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
