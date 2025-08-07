import hashlib
import qrcode
import json
import os
from datetime import datetime
from typing import List, Dict, Any, Optional
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from reportlab.lib.colors import black
from PIL import Image, ImageDraw, ImageFont
import uuid
import logging

from app.core.config import settings
from app.services.blockchain import blockchain_service

logger = logging.getLogger(__name__)

class CertificateGenerator:
    def __init__(self):
        self.templates_dir = settings.templates_dir
        self.certificates_dir = settings.certificates_dir
        
        # Ensure directories exist
        os.makedirs(self.templates_dir, exist_ok=True)
        os.makedirs(self.certificates_dir, exist_ok=True)
        
        # Default font settings
        self.default_font = "arial.ttf"  # Windows default font
        self.fallback_font = None  # Will use PIL default font
        
    def get_font(self, size: int = 32, font_path: str = None) -> ImageFont:
        """Get font for text rendering with fallback"""
        try:
            if font_path and os.path.exists(font_path):
                return ImageFont.truetype(font_path, size)
            elif os.path.exists(f"C:/Windows/Fonts/{self.default_font}"):
                return ImageFont.truetype(f"C:/Windows/Fonts/{self.default_font}", size)
            else:
                return ImageFont.load_default()
        except Exception as e:
            logger.warning(f"Font loading failed: {e}, using default")
            return ImageFont.load_default()
    
    def create_certificate_image(self, template_path: str, certificate_data: Dict[str, Any], fields_config: List[Dict]) -> str:
        """Create certificate image with custom template and dynamic fields"""
        try:
            # Open template image
            if template_path and os.path.exists(template_path):
                template = Image.open(template_path)
            else:
                # Create default template if none provided
                template = Image.new('RGB', (800, 600), color='white')
                draw = ImageDraw.Draw(template)
                # Add border
                draw.rectangle([10, 10, 790, 590], outline='black', width=3)
                # Add title
                title_font = self.get_font(36)
                draw.text((400, 50), "CERTIFICATE OF COMPLETION", font=title_font, anchor="mm", fill='black')
            
            # Make a copy to work with
            cert_image = template.copy()
            draw = ImageDraw.Draw(cert_image)
            
            # Apply dynamic fields
            for field in fields_config:
                field_name = field.get('name', '')
                x = field.get('x', 400)
                y = field.get('y', 300)
                font_size = field.get('font_size', 24)
                font_color = field.get('color', 'black')
                font_path = field.get('font_path')
                
                # Get the value for this field
                value = ""
                if field_name == "recipient_name":
                    value = certificate_data.get('recipient_name', '')
                elif field_name == "event_name":
                    value = certificate_data.get('event_name', '')
                elif field_name == "date" or field_name == "event_date":
                    value = certificate_data.get('event_date', '')
                elif field_name == "certificate_id":
                    value = certificate_data.get('certificate_id', '')
                elif field_name == "issued_date":
                    value = certificate_data.get('issued_date', '')
                
                if value:
                    font = self.get_font(font_size, font_path)
                    draw.text((x, y), value, font=font, anchor="mm", fill=font_color)
            
            # Add QR code if specified in fields
            qr_field = next((f for f in fields_config if f.get('name') == 'qr_code'), None)
            if qr_field and certificate_data.get('qr_code_data'):
                qr_x = qr_field.get('x', cert_image.width - 100)
                qr_y = qr_field.get('y', cert_image.height - 100)
                qr_size = qr_field.get('size', 80)
                
                # Create QR code image with high quality settings
                qr = qrcode.QRCode(
                    version=2,  # Increased version for more data capacity
                    error_correction=qrcode.constants.ERROR_CORRECT_M,  # Medium error correction
                    box_size=8,  # Good size for embedding in certificate
                    border=2,  # Smaller border for embedded QR
                )
                qr.add_data(certificate_data['qr_code_data'])
                qr.make(fit=True)
                qr_img = qr.make_image(fill_color="black", back_color="white")
                qr_img = qr_img.resize((qr_size, qr_size), Image.Resampling.LANCZOS)  # High quality resize
                
                # Paste QR code onto certificate
                cert_image.paste(qr_img, (qr_x - qr_size//2, qr_y - qr_size//2))
            
            # Save certificate image
            cert_filename = f"cert_{certificate_data['certificate_id']}.png"
            cert_image_path = os.path.join(self.certificates_dir, cert_filename)
            cert_image.save(cert_image_path, 'PNG', quality=95)
            
            return cert_image_path
            
        except Exception as e:
            logger.error(f"Error creating certificate image: {e}")
            return None
    
    def image_to_pdf(self, image_path: str, certificate_id: str) -> str:
        """Convert certificate image to PDF"""
        try:
            pdf_filename = f"cert_{certificate_id}.pdf"
            pdf_path = os.path.join(self.certificates_dir, pdf_filename)
            
            # Create PDF
            c = canvas.Canvas(pdf_path, pagesize=A4)
            
            # Get image dimensions and calculate scaling
            img = Image.open(image_path)
            img_width, img_height = img.size
            
            # Calculate scaling to fit A4 page with margins
            page_width, page_height = A4
            margin = 50
            max_width = page_width - 2 * margin
            max_height = page_height - 2 * margin
            
            scale_w = max_width / img_width
            scale_h = max_height / img_height
            scale = min(scale_w, scale_h)
            
            scaled_width = img_width * scale
            scaled_height = img_height * scale
            
            # Center image on page
            x = (page_width - scaled_width) / 2
            y = (page_height - scaled_height) / 2
            
            # Add image to PDF
            c.drawImage(image_path, x, y, width=scaled_width, height=scaled_height)
            c.save()
            
            return pdf_path
            
        except Exception as e:
            logger.error(f"Error converting to PDF: {e}")
            return None
        
    def generate_certificate_id(self) -> str:
        """Generate unique certificate ID"""
        return f"CERT-{uuid.uuid4().hex[:12].upper()}"
    
    def calculate_sha256(self, data: str) -> str:
        """Calculate SHA-256 hash of certificate data"""
        return hashlib.sha256(data.encode('utf-8')).hexdigest()
    
    def create_qr_code(self, data: dict, certificate_id: str) -> str:
        """Create QR code with certificate data"""
        try:
            # Create QR payload with exact format you specified
            qr_payload = {
                'blockchain_tx': data.get('blockchain_tx', f"local_{certificate_id}"),
                'certificate_id': certificate_id,
                'date': data.get('event_date'),  # Use event_date from certificate data
                'event_name': data.get('event_name'),
                'hash': data.get('hash'),
                'recipient_name': data.get('recipient_name'),
                'timestamp': datetime.now().isoformat()
            }
            
            # Convert to JSON string
            qr_data = json.dumps(qr_payload, sort_keys=True)
            
            # Generate QR code with larger settings for better scanning
            qr = qrcode.QRCode(
                version=2,  # Increased version for more data capacity
                error_correction=qrcode.constants.ERROR_CORRECT_M,  # Medium error correction
                box_size=15,  # Increased box size for larger QR code
                border=6,  # Increased border for better scanning
            )
            qr.add_data(qr_data)
            qr.make(fit=True)
            
            # Create QR code image
            img = qr.make_image(fill_color="black", back_color="white")
            
            # Save QR code
            qr_filename = f"qr_{certificate_id}.png"
            qr_path = os.path.join(self.certificates_dir, qr_filename)
            img.save(qr_path)
            
            return qr_path, qr_data
            
        except Exception as e:
            logger.error(f"Error creating QR code: {e}")
            return None, None
    
    def generate_single_certificate(self, certificate_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Generate a single certificate with custom template support"""
        try:
            # Generate certificate ID
            cert_id = self.generate_certificate_id()
            
            # Prepare certificate data
            cert_info = {
                'certificate_id': cert_id,
                'recipient_name': certificate_data['recipient_name'],
                'event_name': certificate_data['event_name'],
                'event_date': certificate_data['event_date'],
                'issued_date': datetime.now().strftime('%Y-%m-%d'),
                'event_id': certificate_data.get('event_id')
            }
            
            # Calculate certificate hash
            hash_data = f"{cert_id}{cert_info['recipient_name']}{cert_info['event_name']}{cert_info['event_date']}"
            cert_hash = self.calculate_sha256(hash_data)
            cert_info['hash'] = cert_hash
            
            # Create QR code
            qr_path, qr_data = self.create_qr_code(cert_info, cert_id)
            if qr_data:
                cert_info['qr_code_data'] = qr_data
            
            # Store hash on blockchain (with error handling)
            try:
                blockchain_result = blockchain_service.store_certificate_hash(cert_id, cert_hash)
                if blockchain_result:
                    cert_info['blockchain_tx'] = blockchain_result['transaction_hash']
                    cert_info['block_number'] = blockchain_result.get('block_number')
            except Exception as e:
                logger.warning(f"Blockchain storage failed: {e}")
                cert_info['blockchain_tx'] = None
            
            # Get template information
            template_path = certificate_data.get('template_path')
            fields_config = certificate_data.get('fields_config', [
                {"name": "recipient_name", "x": 400, "y": 250, "font_size": 32, "color": "black"},
                {"name": "event_name", "x": 400, "y": 300, "font_size": 24, "color": "black"},
                {"name": "event_date", "x": 400, "y": 350, "font_size": 18, "color": "black"},
                {"name": "certificate_id", "x": 400, "y": 400, "font_size": 14, "color": "gray"},
                {"name": "qr_code", "x": 650, "y": 450, "size": 150}  # Increased size and adjusted position
            ])
            
            # Create certificate image
            cert_image_path = self.create_certificate_image(template_path, cert_info, fields_config)
            if not cert_image_path:
                raise Exception("Failed to create certificate image")
            
            # Convert to PDF
            pdf_path = self.image_to_pdf(cert_image_path, cert_id)
            if not pdf_path:
                raise Exception("Failed to create certificate PDF")
            
            result = {
                'certificate_id': cert_id,
                'hash': cert_hash,
                'qr_code_data': qr_data,
                'qr_code_path': qr_path,
                'image_path': cert_image_path,
                'pdf_path': pdf_path,
                'blockchain_tx': cert_info.get('blockchain_tx'),
                'block_number': cert_info.get('block_number')
            }
            
            logger.info(f"Certificate {cert_id} generated successfully")
            return result
            
        except Exception as e:
            logger.error(f"Error generating certificate: {e}")
            return None

    def generate_bulk_certificates(self, recipients_data: List[Dict[str, Any]], event_info: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Generate multiple certificates from CSV data"""
        generated_certificates = []
        
        for recipient_data in recipients_data:
            try:
                # Merge recipient data with event info
                certificate_data = {
                    'recipient_name': recipient_data.get('recipient_name', ''),
                    'recipient_email': recipient_data.get('recipient_email', ''),
                    'event_name': event_info['name'],
                    'event_date': event_info['date'],
                    'event_id': event_info['id'],
                    'template_path': event_info.get('template_path'),
                    'template_id': event_info.get('template_id'),
                    'fields_config': event_info.get('fields_config')
                }
                
                # Generate certificate
                cert_result = self.generate_single_certificate(certificate_data)
                if cert_result:
                    generated_certificates.append(cert_result)
                else:
                    logger.error(f"Failed to generate certificate for {certificate_data['recipient_name']}")
            except Exception as e:
                logger.error(f"Error generating certificate for {recipient_data.get('recipient_name')}: {e}")
                continue
        
        return generated_certificates
    
    def _draw_centered_text(self, canvas_obj, x: float, y: float, text: str):
        """Helper method to draw centered text"""
        text_width = canvas_obj.stringWidth(text)
        canvas_obj.drawString(x - text_width/2, y, text)
    
    def _create_basic_certificate(self, canvas_obj, cert_info: Dict[str, Any], width: float, height: float):
        """Create basic certificate without template"""
        c = canvas_obj
        
        # Title
        c.setFont("Helvetica-Bold", 36)
        self._draw_centered_text(c, width/2, height - 100, "CERTIFICATE OF COMPLETION")
        
        # Decorative line
        c.setLineWidth(3)
        c.line(50, height - 130, width - 50, height - 130)
        
        # Certificate content
        c.setFont("Helvetica", 18)
        self._draw_centered_text(c, width/2, height - 200, "This is to certify that")
        
        # Recipient name
        c.setFont("Helvetica-Bold", 28)
        self._draw_centered_text(c, width/2, height - 250, cert_info['recipient_name'])
        
        # Event details
        c.setFont("Helvetica", 18)
        self._draw_centered_text(c, width/2, height - 320, "has successfully completed")
        
        c.setFont("Helvetica-Bold", 22)
        self._draw_centered_text(c, width/2, height - 370, cert_info['event_name'])
        
        # Dates
        c.setFont("Helvetica", 14)
        self._draw_centered_text(c, width/2, height - 420, f"Event Date: {cert_info['event_date']}")
        self._draw_centered_text(c, width/2, height - 440, f"Issued Date: {cert_info['issued_date']}")
        
        # Certificate ID and hash
        c.setFont("Helvetica", 10)
        c.drawString(50, 150, f"Certificate ID: {cert_info['certificate_id']}")
        c.drawString(50, 130, f"SHA-256 Hash: {cert_info['hash'][:50]}...")
        if cert_info.get('blockchain_tx'):
            c.drawString(50, 110, f"Blockchain TX: {cert_info['blockchain_tx'][:30]}...")
    
    def process_csv_data(self, csv_file_path: str) -> List[Dict[str, Any]]:
        """Process CSV file and extract recipient data"""
        import csv
        
        try:
            # Read CSV file
            recipients = []
            with open(csv_file_path, 'r', newline='', encoding='utf-8') as csvfile:
                csv_reader = csv.DictReader(csvfile)
                for row in csv_reader:
                    recipient_data = {
                        'recipient_name': row.get('name', '').strip(),
                        'recipient_email': row.get('email', '').strip()
                    }
                    if recipient_data['recipient_name']:
                        recipients.append(recipient_data)
            
            return recipients
            
        except Exception as e:
            logger.error(f"Error processing CSV file: {e}")
            return []

# Create global certificate generator instance
certificate_generator = CertificateGenerator()
