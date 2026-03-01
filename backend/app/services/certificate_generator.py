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
        """Return (qr_path, qr_json_string) for the certificate."""
        try:
            base_url = getattr(settings, 'base_url', 'http://localhost:3000').rstrip('/')
            verify_url = f"{base_url}/verify/{certificate_id}"
            payload = {
                'verify_url': verify_url,
                'certificate_id': certificate_id,
                'recipient_name': data.get('recipient_name'),
                'event_name': data.get('event_name'),
                'date': data.get('event_date'),
                'hash': data.get('hash'),
                'blockchain_tx': data.get('blockchain_tx', f"local_{certificate_id}"),
                'timestamp': datetime.now().isoformat(),
            }
            qr_data = json.dumps(payload, sort_keys=True)

            qr = qrcode.QRCode(
                version=2,
                error_correction=qrcode.constants.ERROR_CORRECT_M,
                box_size=10,
                border=3,
            )
            qr.add_data(qr_data)
            qr.make(fit=True)
            img = qr.make_image(fill_color="black", back_color="white")

            qr_path = os.path.join(self.certificates_dir, f"qr_{certificate_id}.png")
            img.save(qr_path)
            return qr_path, qr_data
        except Exception as e:
            logger.error(f"QR code error: {e}")
            return None, None

    # ── PDF Drawing Helpers ────────────────────────────────────────────────────

    def _draw_background_and_borders(self, c, W, H):
        """Full background, outer/inner borders, and overall page frame."""
        # Cream background
        c.setFillColor(CREAM)
        c.rect(0, 0, W, H, fill=1, stroke=0)

        # Subtle off-white inner field
        c.setFillColor(OFFWHITE)
        c.rect(18*mm, 12*mm, W - 36*mm, H - 24*mm, fill=1, stroke=0)

        # Outer gold border
        c.setStrokeColor(GOLD)
        c.setLineWidth(2.5)
        c.rect(14*mm, 10*mm, W - 28*mm, H - 20*mm, fill=0, stroke=1)

        # Inner thin navy border
        c.setStrokeColor(NAVY)
        c.setLineWidth(0.8)
        c.rect(17*mm, 13*mm, W - 34*mm, H - 26*mm, fill=0, stroke=1)

    def _draw_corner_accent_topleft(self, c, W, H):
        """Navy triangle + gold stripe — top-left corner."""
        size = 105
        ox, oy = 14*mm, H - 10*mm   # outer corner (top-left of border)

        # Navy filled triangle
        c.setFillColor(NAVY)
        p = c.beginPath()
        p.moveTo(ox, oy)
        p.lineTo(ox + size, oy)
        p.lineTo(ox, oy - size)
        p.close()
        c.drawPath(p, fill=1, stroke=0)

        # Gold diagonal stripe inside the triangle
        c.setFillColor(GOLD)
        offset = 14
        p = c.beginPath()
        p.moveTo(ox + size - offset, oy)
        p.lineTo(ox + size, oy)
        p.lineTo(ox, oy - size)
        p.lineTo(ox, oy - size + offset)
        p.close()
        c.drawPath(p, fill=1, stroke=0)

    def _draw_corner_accent_bottomright(self, c, W, H):
        """Navy triangle + gold stripe — bottom-right corner."""
        size = 105
        ox, oy = W - 14*mm, 10*mm   # outer corner (bottom-right of border)

        c.setFillColor(NAVY)
        p = c.beginPath()
        p.moveTo(ox, oy)
        p.lineTo(ox - size, oy)
        p.lineTo(ox, oy + size)
        p.close()
        c.drawPath(p, fill=1, stroke=0)

        c.setFillColor(GOLD)
        offset = 14
        p = c.beginPath()
        p.moveTo(ox - size + offset, oy)
        p.lineTo(ox - size, oy)
        p.lineTo(ox, oy + size)
        p.lineTo(ox, oy + size - offset)
        p.close()
        c.drawPath(p, fill=1, stroke=0)

    def _draw_corner_accent_topright(self, c, W, H):
        """Thin gold diagonal accent strip — top-right."""
        size = 65
        ox, oy = W - 14*mm, H - 10*mm

        c.setFillColor(GOLD)
        offset = 10
        p = c.beginPath()
        p.moveTo(ox - size, oy)
        p.lineTo(ox - size + offset, oy)
        p.lineTo(ox, oy - size + offset)
        p.lineTo(ox, oy - size)
        p.close()
        c.drawPath(p, fill=1, stroke=0)

    def _draw_corner_accent_bottomleft(self, c, W, H):
        """Thin gold diagonal accent strip — bottom-left."""
        size = 65
        ox, oy = 14*mm, 10*mm

        c.setFillColor(GOLD)
        offset = 10
        p = c.beginPath()
        p.moveTo(ox + size, oy)
        p.lineTo(ox + size - offset, oy)
        p.lineTo(ox, oy + size - offset)
        p.lineTo(ox, oy + size)
        p.close()
        c.drawPath(p, fill=1, stroke=0)

    def _draw_top_header_bar(self, c, W, H):
        """Thin navy band across the top inside the border (contains org name)."""
        bar_y = H - 10*mm - 18*mm
        bar_h = 10*mm
        bar_x = 14*mm
        bar_w = W - 28*mm

        c.setFillColor(NAVY)
        c.rect(bar_x, bar_y, bar_w, bar_h, fill=1, stroke=0)

        c.setFillColor(GOLD)
        c.setFont("Helvetica-Bold", 8)
        label = "CERTCHAIN  ·  BLOCKCHAIN CERTIFICATE VERIFICATION SYSTEM"
        c.drawCentredString(W / 2, bar_y + 3.2*mm, label)

    def _draw_gold_seal(self, c, cx, cy, r=22):
        """Decorative multi-ring gold medallion at given centre."""
        # Outer ring
        c.setFillColor(GOLD)
        c.circle(cx, cy, r, fill=1, stroke=0)

        c.setFillColor(CREAM)
        c.circle(cx, cy, r - 4, fill=1, stroke=0)

        c.setFillColor(GOLD)
        c.circle(cx, cy, r - 7, fill=1, stroke=0)

        c.setFillColor(NAVY)
        c.circle(cx, cy, r - 11, fill=1, stroke=0)

        # Star / tick symbol
        c.setFillColor(GOLD)
        c.setFont("Helvetica-Bold", 10)
        c.drawCentredString(cx, cy - 3.5, "✓")

    def _draw_decorative_divider(self, c, W, y_pos, width_ratio=0.55):
        """Gold ornamental divider line with diamond at centre."""
        line_w = W * width_ratio
        x1 = (W - line_w) / 2
        x2 = x1 + line_w
        cx = W / 2

        c.setStrokeColor(GOLD)
        c.setLineWidth(1)
        c.line(x1, y_pos, cx - 6, y_pos)
        c.line(cx + 6, y_pos, x2, y_pos)

        # Diamond
        c.setFillColor(GOLD)
        d = 4
        p = c.beginPath()
        p.moveTo(cx, y_pos + d)
        p.lineTo(cx + d, y_pos)
        p.lineTo(cx, y_pos - d)
        p.lineTo(cx - d, y_pos)
        p.close()
        c.drawPath(p, fill=1, stroke=0)

    def _center_text(self, c, text, x, y, font, size, color):
        c.setFillColor(color)
        c.setFont(font, size)
        c.drawCentredString(x, y, text)

    def _draw_signature_block(self, c, x, label, role, y_base):
        """Single signature block: line + name + role."""
        line_w = 55*mm
        c.setStrokeColor(GREY_DARK)
        c.setLineWidth(0.8)
        c.line(x - line_w / 2, y_base, x + line_w / 2, y_base)

        c.setFillColor(GREY_DARK)
        c.setFont("Helvetica-Bold", 9)
        c.drawCentredString(x, y_base - 4.5*mm, label)

        c.setFillColor(GREY_MID)
        c.setFont("Helvetica", 8)
        c.drawCentredString(x, y_base - 7.5*mm, role)

    # ── Main PDF Generator ─────────────────────────────────────────────────────

    def generate_pdf_certificate(self, cert_info: Dict[str, Any], qr_path: Optional[str] = None) -> Optional[str]:
        """Generate a beautiful A4 landscape PDF certificate."""
        try:
            cert_id    = cert_info['certificate_id']
            name       = cert_info.get('recipient_name', 'Recipient Name')
            event      = cert_info.get('event_name', 'Event Name')
            event_date = cert_info.get('event_date', '')
            issued     = cert_info.get('issued_date', datetime.now().strftime('%B %d, %Y'))
            cert_hash  = cert_info.get('hash', '')
            issuer     = cert_info.get('issuer_name', 'Administrator')
            org        = cert_info.get('organization', 'KL University')

            # Format dates nicely
            def fmt_date(d):
                try:
                    return datetime.strptime(str(d), '%Y-%m-%d').strftime('%B %d, %Y')
                except Exception:
                    return str(d)

            event_date_fmt  = fmt_date(event_date)
            issued_date_fmt = fmt_date(issued) if issued else datetime.now().strftime('%B %d, %Y')

            pdf_path = os.path.join(self.certificates_dir, f"cert_{cert_id}.pdf")

            W, H = landscape(A4)   # 841.89 x 595.28 pts

            c = rl_canvas.Canvas(pdf_path, pagesize=(W, H))
            c.setTitle(f"Certificate – {name}")

            # ── Background & frame ──
            self._draw_background_and_borders(c, W, H)

            # ── Corner geometric accents ──
            self._draw_corner_accent_topleft(c, W, H)
            self._draw_corner_accent_bottomright(c, W, H)
            self._draw_corner_accent_topright(c, W, H)
            self._draw_corner_accent_bottomleft(c, W, H)

            # ── Top org bar ──
            self._draw_top_header_bar(c, W, H)

            # ── CERTIFICATE title ──
            title_y = H - 10*mm - 18*mm - 14*mm
            self._center_text(c, "CERTIFICATE", W/2, title_y, "Helvetica-Bold", 46, NAVY)

            subtitle_y = title_y - 12*mm
            # Letter-spaced "OF ACHIEVEMENT" — simulate with spacing
            c.setFillColor(GOLD)
            c.setFont("Helvetica", 14)
            subtitle = "O F   A C H I E V E M E N T"
            c.drawCentredString(W/2, subtitle_y, subtitle)

            # ── Gold divider below subtitle ──
            div1_y = subtitle_y - 6*mm
            self._draw_decorative_divider(c, W, div1_y, 0.45)

            # ── "This certificate is proudly presented to" ──
            pres_y = div1_y - 9*mm
            self._center_text(c, "This certificate is proudly presented to", W/2, pres_y,
                               "Helvetica-Oblique", 11, GREY_DARK)

            # ── Recipient name ──
            name_y = pres_y - 16*mm
            self._center_text(c, name, W/2, name_y, "Times-BoldItalic", 38, NAVY)

            # Gold underline beneath name
            name_ul_y = name_y - 3*mm
            name_w = c.stringWidth(name, "Times-BoldItalic", 38)
            ul_x1 = W/2 - name_w/2 - 10
            ul_x2 = W/2 + name_w/2 + 10
            c.setStrokeColor(GOLD)
            c.setLineWidth(1.2)
            c.line(ul_x1, name_ul_y, ul_x2, name_ul_y)

            # ── "For successfully participating in" ──
            for_y = name_ul_y - 8*mm
            self._center_text(c, "For successfully participating in", W/2, for_y,
                               "Helvetica", 11, GREY_DARK)

            # ── Event name ──
            event_y = for_y - 9*mm
            self._center_text(c, event, W/2, event_y, "Helvetica-Bold", 18, NAVY_MID)

            # ── Date line ──
            date_y = event_y - 7*mm
            date_str = f"Held on {event_date_fmt}  ·  Issued on {issued_date_fmt}"
            self._center_text(c, date_str, W/2, date_y, "Helvetica", 10, GREY_MID)

            # ── Gold divider above signatures ──
            div2_y = date_y - 10*mm
            self._draw_decorative_divider(c, W, div2_y, 0.6)

            # ── Signature blocks ──
            sig_y   = div2_y - 12*mm
            sig_lx  = W * 0.25   # left signature x
            sig_rx  = W * 0.75   # right signature x

            self._draw_signature_block(c, sig_lx, issuer, "Issuing Authority", sig_y)
            self._draw_signature_block(c, sig_rx, org,    "Institution",       sig_y)

            # ── Gold seal / medallion ──
            seal_x = W / 2
            seal_y = div2_y - 11*mm
            self._draw_gold_seal(c, seal_x, seal_y, r=18)

            # ── QR code (bottom-right, inside border) ──
            qr_size  = 60
            qr_right = W - 22*mm
            qr_bot   = 12*mm + 2*mm
            if qr_path and os.path.exists(qr_path):
                c.drawImage(
                    ImageReader(qr_path),
                    qr_right - qr_size, qr_bot,
                    width=qr_size, height=qr_size,
                    preserveAspectRatio=True, mask='auto'
                )
                c.setFillColor(GREY_MID)
                c.setFont("Helvetica", 6)
                c.drawCentredString(qr_right - qr_size/2, qr_bot - 3*mm, "Scan to Verify")

            # ── Certificate ID and hash (bottom centre) ──
            footer_y = 12*mm + 3.5*mm
            c.setFillColor(GREY_MID)
            c.setFont("Helvetica", 7)
            c.drawCentredString(W/2, footer_y + 4*mm,
                                f"Certificate ID: {cert_id}")
            if cert_hash:
                c.drawCentredString(W/2, footer_y,
                                    f"SHA-256: {cert_hash[:48]}…")

            c.save()
            logger.info(f"Professional PDF generated: {pdf_path}")
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
                'certificate_id': cert_id,
                'recipient_name': certificate_data.get('recipient_name', ''),
                'event_name':     certificate_data.get('event_name', ''),
                'event_date':     certificate_data.get('event_date', ''),
                'issued_date':    datetime.now().strftime('%Y-%m-%d'),
                'event_id':       certificate_data.get('event_id'),
                'issuer_name':    certificate_data.get('issuer_name', 'Administrator'),
                'organization':   certificate_data.get('organization', 'KL University'),
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
                'image_path':     pdf_path,   # kept for DB compat
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
                    'recipient_name': r.get('recipient_name', ''),
                    'recipient_email': r.get('recipient_email', ''),
                    'event_name':  event_info['name'],
                    'event_date':  event_info['date'],
                    'event_id':    event_info['id'],
                    'issuer_name': event_info.get('issuer_name', 'Administrator'),
                    'organization': event_info.get('organization', 'KL University'),
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
                        })
        except Exception as e:
            logger.error(f"CSV parse error: {e}")
        return recipients

    # ── Legacy image helpers (kept so nothing breaks) ─────────────────────────

    def create_certificate_image(self, template_path, certificate_data, fields_config):
        """Legacy stub — returns the PDF path for backwards compatibility."""
        return self.generate_pdf_certificate(certificate_data)

    def image_to_pdf(self, image_path, certificate_id):
        """Legacy stub — image IS the PDF now, just return the path."""
        return image_path


# Global instance
certificate_generator = CertificateGenerator()
