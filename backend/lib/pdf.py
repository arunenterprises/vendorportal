"""Branded A4 PDF generation for tax invoices and work orders (reportlab)."""

from io import BytesIO
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

LOGO_PATH = Path(__file__).parent.parent.parent / "frontend" / "public" / "arun-logo.jpg"

COMPANY_NAME = "ARUN ENTERPRISES"
COMPANY_TAGLINE = "OUR QUALITY ORIENTED SERVICE'S IS FIRST PRIORITY"
COMPANY_ADDR = "209H/1F/1, Ops Nagar, Kalindipuram, Prayagraj, UP 211011"
COMPANY_CONTACT = "Toll Free: 9429694552 · Email: info@arunenterprises.online"
COMPANY_WEB = "www.arunenterprises.com.in"

NAVY = colors.HexColor("#0B132B")
COBALT = colors.HexColor("#1D4ED8")
SLATE = colors.HexColor("#475569")
LINE = colors.HexColor("#CBD5E1")


def _styles():
    ss = getSampleStyleSheet()
    return {
        "title": ParagraphStyle("t", parent=ss["Title"], fontSize=18, textColor=NAVY, alignment=0, spaceAfter=2),
        "tag": ParagraphStyle("tg", parent=ss["Normal"], fontSize=7.5, textColor=colors.HexColor("#B91C1C"),
                              leading=10, spaceAfter=3),
        "sub": ParagraphStyle("s", parent=ss["Normal"], fontSize=9, textColor=SLATE, leading=12),
        "h": ParagraphStyle("h", parent=ss["Normal"], fontSize=11, textColor=COBALT, spaceBefore=10, spaceAfter=4),
        "n": ParagraphStyle("n", parent=ss["Normal"], fontSize=9, leading=13),
    }


def _header(st, doc_label):
    brand = [
        Paragraph(COMPANY_NAME, st["title"]),
        Paragraph(f"<i>{COMPANY_TAGLINE}</i>", st["tag"]),
        Paragraph(f"{COMPANY_ADDR}<br/>{COMPANY_CONTACT}<br/>{COMPANY_WEB}", st["sub"]),
    ]
    if LOGO_PATH.exists():
        head = Table(
            [[Image(str(LOGO_PATH), width=30 * mm, height=21 * mm), brand]],
            colWidths=[34 * mm, 136 * mm],
            style=TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (0, 0), 0),
                ("LEFTPADDING", (1, 0), (1, 0), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]),
        )
    else:
        head = Table([[brand]], colWidths=[170 * mm],
                     style=TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0)]))

    return [
        head,
        Spacer(1, 8),
        Table(
            [[Paragraph(f"<b>{doc_label}</b>", ParagraphStyle("x", fontSize=13, textColor=colors.white))]],
            colWidths=[170 * mm],
            style=TableStyle([("BACKGROUND", (0, 0), (-1, -1), NAVY), ("LEFTPADDING", (0, 0), (-1, -1), 8),
                              ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]),
        ),
        Spacer(1, 10),
    ]


_CELL = ParagraphStyle("cell", fontName="Helvetica", fontSize=8.8, leading=11)
_CELL_LABEL = ParagraphStyle("cell_l", parent=_CELL, textColor=SLATE)
_CELL_R = ParagraphStyle("cell_r", parent=_CELL, alignment=2)
_CELL_HEAD = ParagraphStyle("cell_h", parent=_CELL, fontName="Helvetica-Bold", textColor=colors.white)


def _pretty(value) -> str:
    """under_review -> Under Review"""
    return str(value or "").replace("_", " ").title()


def _kv_table(rows):
    # every cell is a Paragraph so long values (bank + branch) wrap instead of
    # bleeding over the next column's label
    wrapped = [
        [
            _cell(r[0], _CELL_LABEL), _cell(r[1], _CELL),
            _cell(r[2], _CELL_LABEL), _cell(r[3], _CELL),
        ]
        for r in rows
    ]
    return Table(
        wrapped,
        colWidths=[36 * mm, 49 * mm, 36 * mm, 49 * mm],
        style=TableStyle([
            ("GRID", (0, 0), (-1, -1), 0.5, LINE),
            ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F1F5F9")),
            ("BACKGROUND", (2, 0), (2, -1), colors.HexColor("#F1F5F9")),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]),
    )


def _cell(value, style):
    # callers may pass an already-built Paragraph; re-wrapping would stringify its repr
    return value if isinstance(value, Paragraph) else Paragraph(str(value), style)


def _data_table(data, col_widths, right_from=2):
    """Header + body, every cell wrapped; columns >= right_from are right-aligned."""
    rows = [[_cell(c, _CELL_HEAD) for c in data[0]]]
    for row in data[1:]:
        rows.append([
            _cell(c, _CELL_R if i >= right_from else _CELL)
            for i, c in enumerate(row)
        ])
    return Table(
        rows,
        colWidths=col_widths,
        style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), NAVY),
            ("GRID", (0, 0), (-1, -1), 0.5, LINE),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]),
    )


def _build(elements):
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm,
                            topMargin=18 * mm, bottomMargin=18 * mm)
    doc.build(elements)
    buf.seek(0)
    return buf.read()


def _inr(v):
    return f"Rs. {float(v):,.2f}"


def invoice_pdf(bill: dict, vendor: dict) -> bytes:
    st = _styles()
    el = _header(st, "TAX INVOICE")
    el += [
        _kv_table([
            ["Invoice No.", bill.get("invoice_no", ""), "Invoice Date", bill.get("invoice_date", "")],
            ["PO Number", bill.get("po_number", ""), "Status",
             bill.get("status_label") or _pretty(bill.get("status"))],
            ["UTR / Ref", bill.get("utr") or "-", "Paid Date", bill.get("paid_date") or "-"],
        ]),
        Paragraph("Vendor / Supplier Details", st["h"]),
        _kv_table([
            ["Company", vendor.get("company_name", ""), "Vendor Code", vendor.get("code", "")],
            ["GSTIN", vendor.get("gstin", ""), "PAN", vendor.get("pan", "")],
            ["Bank", vendor.get("bank_name", "") or "-", "IFSC", vendor.get("ifsc", "") or "-"],
        ]),
        Paragraph("Particulars", st["h"]),
        _data_table(
            [["Description", "HSN/SAC", "Taxable (INR)", "GST %", "GST Amt", "Total"],
             [bill.get("description") or "Services rendered", bill.get("hsn") or "-",
              _inr(bill.get("taxable_amount", 0)), f"{bill.get('gst_rate', 0)}%",
              _inr(bill.get("gst_amount", 0)), _inr(bill.get("total_amount", 0))]],
            [48 * mm, 24 * mm, 26 * mm, 14 * mm, 26 * mm, 32 * mm],
        ),
        Spacer(1, 8),
        _kv_table([
            ["Taxable Value", _inr(bill.get("taxable_amount", 0)), "GST", _inr(bill.get("gst_amount", 0))],
            ["TDS Deducted", _inr(bill.get("tds_amount", 0)), "Invoice Total", _inr(bill.get("total_amount", 0))],
        ]),
        Spacer(1, 18),
        Paragraph(f"For {COMPANY_NAME}<br/><br/><br/>Authorised Signatory", st["n"]),
        Spacer(1, 10),
        Paragraph(f"This is a computer generated document from the {COMPANY_NAME} Vendor Portal.", st["sub"]),
    ]
    return _build(el)


def payment_advice_pdf(bill: dict, vendor: dict) -> bytes:
    """Payment advice for a released payment — PV number, UTR, mode and amount."""
    st = _styles()
    el = _header(st, "PAYMENT ADVICE")
    el += [
        _kv_table([
            ["PV No.", bill.get("pv_no") or "-", "Payment Date", bill.get("payment_date") or bill.get("paid_date") or "-"],
            ["UTR / Ref No.", bill.get("utr") or "-", "Payment Mode", bill.get("payment_mode") or "-"],
            ["Invoice No.", bill.get("invoice_no", ""), "Invoice Date", bill.get("invoice_date", "")],
            ["PO Number", bill.get("po_number", "") or "-", "Voucher Status",
             bill.get("payment_status") or _pretty(bill.get("status"))],
        ]),
        Paragraph("Paid To", st["h"]),
        _kv_table([
            ["Company", vendor.get("company_name", ""), "Vendor Code", vendor.get("code", "")],
            ["Bank", vendor.get("bank_name", "") or "-", "IFSC", vendor.get("ifsc", "") or "-"],
            ["Account No.", vendor.get("account_no", "") or "-", "GSTIN", vendor.get("gstin", "") or "-"],
        ]),
        Paragraph("Payment Summary", st["h"]),
        _data_table(
            [["Particulars", "Reference", "Amount (INR)"],
             ["Payment against invoice", bill.get("invoice_no", ""), _inr(bill.get("total_amount", 0))]],
            [80 * mm, 50 * mm, 40 * mm],
        ),
        Spacer(1, 8),
        _kv_table([
            ["Taxable Value", _inr(bill.get("taxable_amount", 0)), "GST", _inr(bill.get("gst_amount", 0))],
            ["TDS Deducted", _inr(bill.get("tds_amount", 0)), "Amount Paid", _inr(bill.get("total_amount", 0))],
        ]),
        Spacer(1, 14),
        Paragraph(
            f"Payment approved by: {bill.get('payment_approved_by') or '-'}", st["n"]
        ),
        Spacer(1, 16),
        Paragraph(f"For {COMPANY_NAME}<br/><br/><br/>Authorised Signatory", st["n"]),
        Spacer(1, 10),
        Paragraph(
            f"This payment advice is a computer generated document from the {COMPANY_NAME} Vendor Portal.",
            st["sub"],
        ),
    ]
    return _build(el)


def work_order_pdf(wo: dict, vendor: dict) -> bytes:
    st = _styles()
    el = _header(st, "PURCHASE / WORK ORDER")
    el += [
        _kv_table([
            ["PO Number", wo.get("po_number", ""), "Issued Date", wo.get("issued_date", "")],
            ["Status", _pretty(wo.get("status")), "Due Date", wo.get("due_date", "")],
            ["Order Value", _inr(wo.get("value", 0)), "Vendor Code", vendor.get("code", "")],
        ]),
        Paragraph("Vendor", st["h"]),
        _kv_table([
            ["Company", vendor.get("company_name", ""), "Contact", vendor.get("contact_person", "")],
            ["GSTIN", vendor.get("gstin", ""), "Phone", vendor.get("phone", "")],
        ]),
        Paragraph("Title & Scope of Work", st["h"]),
        Paragraph(f"<b>{wo.get('title', '')}</b><br/>{wo.get('scope', '')}", st["n"]),
    ]
    items = wo.get("items") or []
    if items:
        rows = [["Description", "HSN/SAC", "Qty", "Rate", "Amount"]]
        for it in items:
            amt = float(it.get("qty", 0)) * float(it.get("rate", 0))
            rows.append([Paragraph(it.get("description", ""), st["n"]), it.get("hsn", ""),
                         str(it.get("qty", 0)), _inr(it.get("rate", 0)), _inr(amt)])
        el += [Paragraph("Bill of Quantities", st["h"]),
               _data_table(rows, [66 * mm, 22 * mm, 16 * mm, 32 * mm, 34 * mm])]
    ms = wo.get("milestones") or []
    if ms:
        rows = [["Milestone", "Due Date", "Status"]]
        for m in ms:
            rows.append([Paragraph(m.get("title", ""), st["n"]), m.get("due_date", ""),
                         "Completed" if m.get("done") else "Pending"])
        el += [Paragraph("Milestones", st["h"]), _data_table(rows, [90 * mm, 40 * mm, 40 * mm])]
    el += [Spacer(1, 22), Paragraph(f"For {COMPANY_NAME}<br/><br/><br/>Authorised Signatory", st["n"])]
    return _build(el)
