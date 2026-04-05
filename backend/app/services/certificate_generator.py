import hashlib
import qrcode
import json
import os
import io
import math
from datetime import datetime
from typing import List, Dict, Any, Optional

from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.lib.colors import HexColor, white, black, Color
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from PIL import Image
import uuid
import logging

from app.core.config import settings
from app.services.blockchain import blockchain_service

logger = logging.getLogger(__name__)

# ── Design tokens ──────────────────────────────────────────────────────────────
NAVY       = HexColor('#0d2137')
NAVY_MID   = HexColor('#1a3a5c')
NAVY_LIGHT = HexColor('#2a5298')
GOLD       = HexColor('#C9A843')
GOLD_LIGHT = HexColor('#E8D07A')
CREAM      = HexColor('#FEFCF3')
OFFWHITE   = HexColor('#F7F5EE')
GREY_DARK  = HexColor('#444444')
GREY_MID   = HexColor('#888888')
GREY_LIGHT = HexColor('#CCCCCC')


class CertificateGenerator:
    def __init__(self):
        self.templates_dir = settings.templates_dir
        self.certificates_dir = settings.certificates_dir
        os.makedirs(self.templates_dir, exist_ok=True)
        os.makedirs(self.certificates_dir, exist_ok=True)

    # ── Utilities ──────────────────────────────────────────────────────────────

    def generate_certificate_id(self) -> str:
        return f"CERT-{uuid.uuid4().hex[:12].upper()}"

    def calculate_sha256(self, data: str) -> str:
        return hashlib.sha256(data.encode('utf-8')).hexdigest()

    def create_qr_code(self, data: dict, certificate_id: str):
        """Return (qr_path, qr_json_string) for the certificate.

        The QR image encodes a plain verify URL so any phone camera / QR app
        opens it directly in the browser.  The full JSON payload is kept as
        qr_data for database storage and the frontend scanner fallback.
        """
        try:
            base_url = getattr(settings, 'base_url', 'http://localhost:3000').rstrip('/')
            verify_url = f"{base_url}/verify/{certificate_id}"

            # Full JSON payload stored in the database / returned in API responses
            payload = {
                'verify_url':     verify_url,
                'certificate_id': certificate_id,
                'recipient_name': data.get('recipient_name'),
                'event_name':     data.get('event_name'),
                'date':           data.get('event_date'),
                'hash':           data.get('hash'),
                'blockchain_tx':  data.get('blockchain_tx', f"local_{certificate_id}"),
                'timestamp':      datetime.now().isoformat(),
            }
            qr_data = json.dumps(payload, sort_keys=True)

            # ── QR image encodes ONLY the plain URL ──────────────────────────
            # Plain URL → every phone camera / QR scanner opens it in browser.
            qr = qrcode.QRCode(
                version=2,
                error_correction=qrcode.constants.ERROR_CORRECT_M,
                box_size=10,
                border=3,
            )
            qr.add_data(verify_url)   # <-- plain URL, not JSON
            qr.make(fit=True)
            img = qr.make_image(fill_color="black", back_color="white")

            qr_path = os.path.join(self.certificates_dir, f"qr_{certificate_id}.png")
            img.save(qr_path)
            return qr_path, qr_data   # qr_data (JSON) kept for DB / API use
        except Exception as e:
            logger.error(f"QR code error: {e}")
            return None, None

    # ── Corner chevron accent (all 4 corners) ─────────────────────────────────

    def _draw_corner_chevron(self, c, corner: str, W: float, H: float, size: float = 90):
        """
        Draw a large navy right-angle triangle with a gold diagonal stripe
        at the specified corner ('tl', 'tr', 'bl', 'br').
        """
        gold_w = size * 0.17   # width of the gold stripe

        if corner == 'tl':
            ox, oy = 0, H
            pts_navy  = [(ox, oy), (ox + size, oy), (ox, oy - size)]
            # gold stripe: thin band along hypotenuse
            pts_gold  = [
                (ox + size - gold_w, oy),
                (ox + size,          oy),
                (ox,                 oy - size),
                (ox,                 oy - size + gold_w),
            ]
        elif corner == 'tr':
            ox, oy = W, H
            pts_navy  = [(ox, oy), (ox - size, oy), (ox, oy - size)]
            pts_gold  = [
                (ox - size + gold_w, oy),
                (ox - size,          oy),
                (ox,                 oy - size),
                (ox,                 oy - size + gold_w),
            ]
        elif corner == 'bl':
            ox, oy = 0, 0
            pts_navy  = [(ox, oy), (ox + size, oy), (ox, oy + size)]
            pts_gold  = [
                (ox + size - gold_w, oy),
                (ox + size,          oy),
                (ox,                 oy + size),
                (ox,                 oy + size - gold_w),
            ]
        else:  # 'br'
            ox, oy = W, 0
            pts_navy  = [(ox, oy), (ox - size, oy), (ox, oy + size)]
            pts_gold  = [
                (ox - size + gold_w, oy),
                (ox - size,          oy),
                (ox,                 oy + size),
                (ox,                 oy + size - gold_w),
            ]

        def _poly(pts, color):
            c.setFillColor(color)
            p = c.beginPath()
            p.moveTo(pts[0][0], pts[0][1])
            for x, y in pts[1:]:
                p.lineTo(x, y)
            p.close()
            c.drawPath(p, fill=1, stroke=0)

        _poly(pts_navy, NAVY)
        _poly(pts_gold, GOLD)

    # ── Signature block ────────────────────────────────────────────────────────

    def _draw_sig_block(self, c, cx: float, label: str, role: str, y_base: float):
        """Signature line + name + role."""
        line_w = 52 * mm
        c.setStrokeColor(GREY_DARK)
        c.setLineWidth(0.7)
        c.line(cx - line_w / 2, y_base, cx + line_w / 2, y_base)

        c.setFillColor(NAVY_MID)
        c.setFont("Helvetica-Bold", 9)
        c.drawCentredString(cx, y_base - 4.5 * mm, label)

        c.setFillColor(GREY_MID)
        c.setFont("Helvetica", 8)
        c.drawCentredString(cx, y_base - 8.5 * mm, role)

    # ── Template-background overlay ────────────────────────────────────────────

    def _generate_with_template(self, cert_info: Dict[str, Any],
                                 template_path: str,
                                 qr_path: Optional[str] = None) -> Optional[str]:
        """
        When an admin has uploaded a custom background image for an event,
        use that image as the full-page background and overlay ALL certificate
        fields (name, event, registration number, date, QR, cert-ID) on top.
        """
        try:
            cert_id      = cert_info['certificate_id']
            name         = cert_info.get('recipient_name', '')
            event        = cert_info.get('event_name', '')
            event_date   = cert_info.get('event_date', '')
            participant  = cert_info.get('participant_id', '')
            issuer       = cert_info.get('issuer_name', 'Administrator')
            issuer_desig = cert_info.get('issuer_designation', 'Issuing Authority')
            club         = cert_info.get('club_name', '')
            department   = cert_info.get('department', '')
            org          = cert_info.get('organization', 'KARE')
            cert_hash    = cert_info.get('hash', '')

            def fmt_date(d):
                if not d:
                    return ''
                try:
                    return datetime.strptime(str(d).split('T')[0], '%Y-%m-%d').strftime('%d %B %Y')
                except Exception:
                    return str(d)

            event_date_fmt  = fmt_date(event_date)
            issued_date_fmt = datetime.now().strftime('%d-%m-%Y')

            pdf_path = os.path.join(self.certificates_dir, f"cert_{cert_id}.pdf")
            W, H = landscape(A4)
            c = rl_canvas.Canvas(pdf_path, pagesize=(W, H))
            c.setTitle(f"Certificate – {name}")

            # ── Full-page template background ──
            c.drawImage(ImageReader(template_path), 0, 0, W, H,
                        preserveAspectRatio=False, mask='auto')

            # ── Helper: draw text with a subtle white halo so it's readable
            #    on any background colour ──
            def draw_with_halo(text, x, y, font, size, fill_color, centered=True):
                c.setFont(font, size)
                c.setFillColor(white)
                offsets = [(-1, -1), (1, -1), (-1, 1), (1, 1)]
                for ox, oy in offsets:
                    if centered:
                        c.drawCentredString(x + ox, y + oy, text)
                    else:
                        c.drawString(x + ox, y + oy, text)
                c.setFillColor(fill_color)
                if centered:
                    c.drawCentredString(x, y, text)
                else:
                    c.drawString(x, y, text)

            # ── Recipient name — large, centred, ~54 % up the page ──
            name_y    = H * 0.54
            name_font = "Helvetica-Bold"
            name_size = 36
            while c.stringWidth(name, name_font, name_size) > W * 0.62 and name_size > 18:
                name_size -= 2
            draw_with_halo(name, W / 2, name_y, name_font, name_size, NAVY)

            # Underline
            name_w = c.stringWidth(name, name_font, name_size)
            c.setStrokeColor(NAVY)
            c.setLineWidth(1)
            c.line(W / 2 - name_w / 2 - 12, name_y - 2.5 * mm,
                   W / 2 + name_w / 2 + 12, name_y - 2.5 * mm)

            # ── Registration number ──
            reg_y = name_y - 9 * mm
            if participant:
                draw_with_halo(f"Registration No: {participant}",
                               W / 2, reg_y, "Helvetica", 11, GREY_DARK)
            else:
                reg_y = name_y - 2 * mm   # collapse gap

            # ── Event name ──
            event_y    = reg_y - 12 * mm
            event_font = "Helvetica-Bold"
            event_size = 18
            while c.stringWidth(event, event_font, event_size) > W * 0.58 and event_size > 10:
                event_size -= 1
            draw_with_halo(event, W / 2, event_y, event_font, event_size, NAVY_MID)

            # ── Date line ──
            date_y = event_y - 8 * mm
            if event_date_fmt:
                date_str = f"Event Date: {event_date_fmt}   ·   Certificate Issued: {issued_date_fmt}"
            else:
                date_str = f"Certificate Issued: {issued_date_fmt}"
            draw_with_halo(date_str, W / 2, date_y, "Helvetica", 10, GREY_DARK)

            # ── Description line ──
            desc_y    = date_y - 7 * mm
            reg_part  = f" (Reg. No: {participant})" if participant else ""
            org_parts = [p for p in [club, department, org] if p]
            organiser = ", ".join(org_parts) if org_parts else org
            desc      = f"for his/her active participation in {event} organized by {organiser}{reg_part}."
            c.setFont("Helvetica", 9.5)
            if c.stringWidth(desc, "Helvetica", 9.5) <= W * 0.70:
                draw_with_halo(desc, W / 2, desc_y, "Helvetica", 9.5, GREY_DARK)

            # ── QR code — bottom-right ──
            qr_size = 58
            qr_x    = W - 18 * mm - qr_size
            qr_y    = 8 * mm
            if qr_path and os.path.exists(qr_path):
                c.drawImage(ImageReader(qr_path), qr_x, qr_y,
                            width=qr_size, height=qr_size,
                            preserveAspectRatio=True, mask='auto')
                c.setFillColor(GREY_DARK)
                c.setFont("Helvetica", 6)
                c.drawCentredString(qr_x + qr_size / 2, qr_y - 3 * mm, "Scan to Verify")

            # ── Certificate ID + SHA-256 — bottom-left ──
            c.setFillColor(GREY_DARK)
            c.setFont("Helvetica", 6.5)
            c.drawString(14 * mm, 12 * mm, f"ID: {cert_id}")
            if cert_hash:
                c.drawString(14 * mm, 8 * mm, f"SHA-256: {cert_hash[:32]}…")

            c.save()
            logger.info(f"Template-based certificate generated: {pdf_path}")
            return pdf_path

        except Exception as e:
            logger.error(f"Template-based PDF generation error: {e}", exc_info=True)
            return None

    # ── Main PDF Generator ─────────────────────────────────────────────────────

    def generate_pdf_certificate(self, cert_info: Dict[str, Any], qr_path: Optional[str] = None) -> Optional[str]:
        """Generate a professional certificate in GEEKFEST/academic style.
        If a custom template background has been uploaded for the event, it is
        used as the full-page background and all fields are overlaid on top.
        """
        # ── If admin uploaded a custom template background, use it ──
        template_path = cert_info.get('template_path', '')
        if template_path and os.path.exists(str(template_path)):
            return self._generate_with_template(cert_info, str(template_path), qr_path)

        try:
            cert_id      = cert_info['certificate_id']
            name         = cert_info.get('recipient_name', 'Recipient Name')
            event        = cert_info.get('event_name', 'Event Name')
            event_date   = cert_info.get('event_date', '')
            participant  = cert_info.get('participant_id', '')
            cert_hash    = cert_info.get('hash', '')
            issuer       = cert_info.get('issuer_name', 'Administrator')
            issuer_desig = cert_info.get('issuer_designation', 'Issuing Authority')
            club         = cert_info.get('club_name', '')
            department   = cert_info.get('department', '')
            org          = cert_info.get('organization', 'KARE')

            def fmt_date(d):
                if not d:
                    return ''
                try:
                    return datetime.strptime(str(d).split('T')[0], '%Y-%m-%d').strftime('%d %B %Y')
                except Exception:
                    return str(d)

            event_date_fmt  = fmt_date(event_date) or ''
            issued_date_fmt = datetime.now().strftime('%d-%m-%Y')

            pdf_path = os.path.join(self.certificates_dir, f"cert_{cert_id}.pdf")

            W, H = landscape(A4)   # 841.89 x 595.28 pts
            c = rl_canvas.Canvas(pdf_path, pagesize=(W, H))
            c.setTitle(f"Certificate – {name}")

            # ── 1. White background ──
            c.setFillColor(white)
            c.rect(0, 0, W, H, fill=1, stroke=0)

            # ── 2. Corner chevrons ──
            chevron = 95
            self._draw_corner_chevron(c, 'tl', W, H, chevron)
            self._draw_corner_chevron(c, 'tr', W, H, chevron)
            self._draw_corner_chevron(c, 'bl', W, H, chevron)
            self._draw_corner_chevron(c, 'br', W, H, chevron)

            # ── 3. Outer thin navy border ──
            c.setStrokeColor(NAVY)
            c.setLineWidth(1.2)
            c.rect(9 * mm, 7 * mm, W - 18 * mm, H - 14 * mm, fill=0, stroke=1)

            # ── 4. TOP HEADER — three columns ──────────────────────────────────
            header_top = H - 9 * mm        # top of safe area
            header_h   = 26 * mm
            header_bot = header_top - header_h

            # Vertical separator lines between columns
            c.setStrokeColor(GREY_LIGHT)
            c.setLineWidth(0.5)
            c.line(W * 0.35, header_bot + 2 * mm, W * 0.35, header_top - 2 * mm)
            c.line(W * 0.65, header_bot + 2 * mm, W * 0.65, header_top - 2 * mm)

            # Left column — Club / Organisation
            left_label = club if club else org
            c.setFillColor(NAVY)
            c.setFont("Helvetica-Bold", 11)
            # Auto-scale if too long
            while c.stringWidth(left_label, "Helvetica-Bold", 11) > W * 0.28 and 11 > 7:
                c.setFont("Helvetica-Bold", c._fontsize - 1)
            c.drawCentredString(W * 0.175, header_bot + 15 * mm, left_label)
            c.setFont("Helvetica", 8)
            c.setFillColor(GREY_DARK)
            sub_left = department if department else "Certificate Issuing Authority"
            c.drawCentredString(W * 0.175, header_bot + 9 * mm, sub_left)

            # Centre column — CertChain branding
            c.setFillColor(NAVY)
            c.setFont("Helvetica-Bold", 11)
            c.drawCentredString(W / 2, header_bot + 18 * mm, "CERTCHAIN")
            c.setFont("Helvetica-Bold", 8.5)
            c.drawCentredString(W / 2, header_bot + 12 * mm, "BLOCKCHAIN CERTIFICATE VERIFICATION SYSTEM")
            c.setFillColor(GOLD)
            c.setFont("Helvetica", 7.5)
            c.drawCentredString(W / 2, header_bot + 7 * mm, "Tamper-Proof  ·  Blockchain-Anchored  ·  DID-Verified")

            # Right column — Issuing person + designation
            c.setFillColor(NAVY)
            c.setFont("Helvetica-Bold", 11)
            c.drawCentredString(W * 0.825, header_bot + 15 * mm, issuer)
            c.setFont("Helvetica", 8)
            c.setFillColor(GREY_DARK)
            c.drawCentredString(W * 0.825, header_bot + 9 * mm, issuer_desig)

            # Horizontal divider below header
            c.setStrokeColor(GREY_LIGHT)
            c.setLineWidth(0.6)
            c.line(20 * mm, header_bot, W - 20 * mm, header_bot)

            # ── 5. LARGE EVENT NAME ─────────────────────────────────────────────
            event_y = header_bot - 16 * mm

            # Auto-scale font to fit
            event_font_size = 42
            while c.stringWidth(event, "Helvetica-Bold", event_font_size) > W * 0.68 and event_font_size > 20:
                event_font_size -= 2

            c.setFillColor(NAVY)
            c.setFont("Helvetica-Bold", event_font_size)
            c.drawCentredString(W / 2, event_y, event)

            # ── 6. "Certificate of Achievement" italic subtitle ─────────────────
            sub_y = event_y - 9 * mm
            c.setFillColor(GREY_DARK)
            c.setFont("Times-Italic", 15)
            c.drawCentredString(W / 2, sub_y, "Certificate of Achievement")

            # ── 7. GOLD RIBBON BANNER ───────────────────────────────────────────
            banner_w   = W * 0.58
            banner_h   = 9 * mm
            banner_x   = (W - banner_w) / 2
            banner_y   = sub_y - 13 * mm

            c.setFillColor(GOLD)
            c.roundRect(banner_x, banner_y, banner_w, banner_h, 3, fill=1, stroke=0)

            c.setFillColor(NAVY)
            c.setFont("Helvetica-Bold", 8.5)
            c.drawCentredString(W / 2, banner_y + 3 * mm, "THIS CERTIFICATE IS PROUDLY PRESENTED TO")

            # Three dots on each side of banner
            dot_r  = 3
            dot_y  = banner_y + banner_h / 2
            for i, dx in enumerate([banner_x - 9, banner_x - 17, banner_x - 25]):
                c.setFillColor(NAVY)
                c.circle(dx, dot_y, dot_r, fill=1, stroke=0)
            for i, dx in enumerate([banner_x + banner_w + 9, banner_x + banner_w + 17, banner_x + banner_w + 25]):
                c.setFillColor(NAVY)
                c.circle(dx, dot_y, dot_r, fill=1, stroke=0)

            # ── 8. RECIPIENT NAME ───────────────────────────────────────────────
            name_y = banner_y - 14 * mm

            name_font = "Helvetica-Bold"
            name_size = 32
            while c.stringWidth(name, name_font, name_size) > W * 0.65 and name_size > 18:
                name_size -= 2

            c.setFillColor(NAVY_LIGHT)
            c.setFont(name_font, name_size)
            c.drawCentredString(W / 2, name_y, name)

            # Underline beneath name
            name_w_px = c.stringWidth(name, name_font, name_size)
            ul_y = name_y - 2.5 * mm
            c.setStrokeColor(GREY_DARK)
            c.setLineWidth(0.8)
            c.line(W / 2 - name_w_px / 2 - 12, ul_y, W / 2 + name_w_px / 2 + 12, ul_y)

            # ── 9. DESCRIPTION PARAGRAPH ────────────────────────────────────────
            desc_y = ul_y - 6 * mm

            reg_text  = f" (Reg. No: {participant})" if participant else ""
            date_text = f" on {event_date_fmt}" if event_date_fmt else ""

            # Build organiser string from club + department + org
            org_parts = [p for p in [club, department, org] if p]
            organiser = ", ".join(org_parts) if org_parts else org

            line1 = f"for his/her active participation in {event} organized by {organiser}{reg_text}{date_text}."

            c.setFont("Helvetica", 10)
            max_w = W * 0.72
            c.setFillColor(GREY_DARK)
            if c.stringWidth(line1, "Helvetica", 10) <= max_w:
                c.drawCentredString(W / 2, desc_y, line1)
            else:
                part1 = f"for his/her active participation in {event}"
                part2 = f"organized by {organiser}{reg_text}{date_text}."
                c.drawCentredString(W / 2, desc_y,          part1)
                c.drawCentredString(W / 2, desc_y - 5 * mm, part2)
                desc_y -= 5 * mm

            # ── 10. SIGNATURE BLOCKS ────────────────────────────────────────────
            # Show: issuer name + their designation | Head of Department / dept | Dean / org
            sig_y = desc_y - 22 * mm

            sig_configs = [
                (W * 0.22, issuer,                  issuer_desig),
                (W * 0.50, "Head of Department",    department if department else org),
                (W * 0.78, "Dean / Principal",      org),
            ]
            for sx, lbl, role in sig_configs:
                self._draw_sig_block(c, sx, lbl, role, sig_y)

            # ── 11. ISSUED ON — bottom centre ───────────────────────────────────
            footer_y = 7 * mm + 4 * mm
            issued_str = f"Issued On: {issued_date_fmt}"
            c.setFillColor(GREY_DARK)
            c.setFont("Helvetica-Bold", 9)
            c.drawCentredString(W / 2, footer_y, issued_str)

            # ── 12. QR code — bottom right ──────────────────────────────────────
            qr_size = 58
            qr_x    = W - 14 * mm - qr_size
            qr_y    = 7 * mm + 2 * mm
            if qr_path and os.path.exists(qr_path):
                c.drawImage(
                    ImageReader(qr_path),
                    qr_x, qr_y,
                    width=qr_size, height=qr_size,
                    preserveAspectRatio=True, mask='auto',
                )
                c.setFillColor(GREY_MID)
                c.setFont("Helvetica", 6)
                c.drawCentredString(qr_x + qr_size / 2, qr_y - 3 * mm, "Scan to Verify")

            # ── 13. Cert ID — bottom left ────────────────────────────────────────
            c.setFillColor(GREY_MID)
            c.setFont("Helvetica", 6.5)
            c.drawString(14 * mm, footer_y, f"ID: {cert_id}")
            if cert_hash:
                c.drawString(14 * mm, footer_y - 3.5 * mm,
                             f"SHA-256: {cert_hash[:32]}…")

            c.save()
            logger.info(f"Certificate PDF generated: {pdf_path}")
            return pdf_path

        except Exception as e:
            logger.error(f"PDF generation error: {e}", exc_info=True)
            return None

    # ── Public entry-point ─────────────────────────────────────────────────────

    def generate_single_certificate(self, certificate_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Generate a single professional certificate (PDF only)."""
        try:
            cert_id = self.generate_certificate_id()

            cert_info = {
                'certificate_id':    cert_id,
                'recipient_name':    certificate_data.get('recipient_name', ''),
                'event_name':        certificate_data.get('event_name', ''),
                'event_date':        certificate_data.get('event_date', ''),
                'participant_id':    certificate_data.get('participant_id', ''),
                'event_id':          certificate_data.get('event_id'),
                'issuer_name':       certificate_data.get('issuer_name', 'Administrator'),
                'issuer_designation': certificate_data.get('issuer_designation', 'Issuing Authority'),
                'club_name':         certificate_data.get('club_name', ''),
                'department':        certificate_data.get('department', ''),
                'organization':      certificate_data.get('organization', 'KARE'),
                'template_path':     certificate_data.get('template_path', ''),
            }

            # Certificate hash
            hash_src = f"{cert_id}{cert_info['recipient_name']}{cert_info['event_name']}{cert_info['event_date']}"
            cert_hash = self.calculate_sha256(hash_src)
            cert_info['hash'] = cert_hash

            # QR code
            qr_path, qr_data = self.create_qr_code(cert_info, cert_id)
            cert_info['qr_code_data'] = qr_data

            # Blockchain (optional)
            blockchain_tx = None
            block_number  = None
            try:
                bc = blockchain_service.store_certificate_hash(cert_id, cert_hash)
                if bc:
                    blockchain_tx = bc.get('transaction_hash')
                    block_number  = bc.get('block_number')
            except Exception as e:
                logger.warning(f"Blockchain storage skipped: {e}")
            cert_info['blockchain_tx'] = blockchain_tx

            # Generate professional PDF
            pdf_path = self.generate_pdf_certificate(cert_info, qr_path)
            if not pdf_path:
                raise RuntimeError("PDF generation failed")

            return {
                'certificate_id': cert_id,
                'hash':           cert_hash,
                'qr_code_data':   qr_data,
                'qr_code_path':   qr_path,
                'image_path':     pdf_path,
                'pdf_path':       pdf_path,
                'blockchain_tx':  blockchain_tx,
                'block_number':   block_number,
            }

        except Exception as e:
            logger.error(f"Certificate generation failed: {e}", exc_info=True)
            return None

    def generate_bulk_certificates(self, recipients_data: List[Dict[str, Any]],
                                   event_info: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Generate multiple certificates from a list of recipient dicts."""
        results = []
        for r in recipients_data:
            try:
                data = {
                    'recipient_name':  r.get('recipient_name', ''),
                    'recipient_email': r.get('recipient_email', ''),
                    'event_name':      event_info['name'],
                    'event_date':      event_info['date'],
                    'event_id':        event_info['id'],
                    'participant_id':  r.get('participant_id', ''),
                    'issuer_name':     event_info.get('issuer_name', 'Administrator'),
                    'organization':    event_info.get('organization', 'KARE'),
                    'template_path':   event_info.get('template_path', ''),
                }
                result = self.generate_single_certificate(data)
                if result:
                    results.append(result)
                else:
                    logger.error(f"Failed for {r.get('recipient_name')}")
            except Exception as e:
                logger.error(f"Bulk cert error for {r.get('recipient_name')}: {e}")
        return results

    def process_csv_data(self, csv_file_path: str) -> List[Dict[str, Any]]:
        """Read a CSV and return list of recipient dicts."""
        import csv
        recipients = []
        try:
            with open(csv_file_path, 'r', newline='', encoding='utf-8') as f:
                for row in csv.DictReader(f):
                    name = row.get('name', '').strip()
                    if name:
                        recipients.append({
                            'recipient_name':  name,
                            'recipient_email': row.get('email', '').strip(),
                            'participant_id':  row.get('participant_id', '').strip(),
                        })
        except Exception as e:
            logger.error(f"CSV parse error: {e}")
        return recipients

    # ── Legacy stubs (kept so nothing breaks) ─────────────────────────────────

    def create_certificate_image(self, template_path, certificate_data, fields_config):
        return self.generate_pdf_certificate(certificate_data)

    def image_to_pdf(self, image_path, certificate_id):
        return image_path


# Global instance
certificate_generator = CertificateGenerator()
