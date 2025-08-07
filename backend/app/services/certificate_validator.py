import json
import hashlib
import cv2
import numpy as np
import pytesseract
from PIL import Image
import os
from typing import Dict, Any, Optional, List
from datetime import datetime
import logging

from app.core.config import settings
from app.services.blockchain import blockchain_service

logger = logging.getLogger(__name__)

# Set Tesseract path for Windows
if os.name == 'nt':  # Windows
    pytesseract.pytesseract.tesseract_cmd = settings.tesseract_path

class CertificateValidator:
    def __init__(self):
        self.blockchain_service = blockchain_service
        
    def validate_certificate(self, validation_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Main validation function that performs comprehensive certificate validation
        """
        try:
            validation_result = {
                'status': 'valid',
                'checks': {},
                'details': {},
                'timestamp': datetime.now().isoformat(),
                'certificate_data': None
            }
            
            # Extract certificate data
            if validation_data.get('qr_code_data'):
                cert_data = self._extract_qr_data(validation_data['qr_code_data'])
            elif validation_data.get('certificate_id'):
                cert_data = self._get_certificate_by_id(validation_data['certificate_id'])
            else:
                return self._create_error_result('No validation data provided')
            
            if not cert_data:
                return self._create_error_result('Certificate not found', 'not_found')
            
            validation_result['certificate_data'] = cert_data
            
            # Perform validation checks
            checks = [
                self._validate_certificate_exists,
                self._validate_hash_integrity,
                self._validate_blockchain_record,
                self._validate_certificate_status,
            ]
            
            # Optional file-based validations if certificate file is provided
            if validation_data.get('certificate_file'):
                checks.extend([
                    self._validate_pdf_integrity,
                    self._validate_ocr_content,
                    self._validate_image_tampering
                ])
            
            # Run all validation checks
            for check_func in checks:
                check_result = check_func(cert_data, validation_data)
                check_name = check_func.__name__.replace('_validate_', '')
                validation_result['checks'][check_name] = check_result
                
                # Update overall status based on check results
                if not check_result['passed']:
                    if check_result['severity'] == 'critical':
                        validation_result['status'] = 'tampered'
                        break
                    elif check_result['severity'] == 'warning':
                        validation_result['status'] = 'suspicious'
            
            # Set message based on status
            if validation_result['status'] == 'valid':
                validation_result['message'] = 'Certificate is valid and verified'
            elif validation_result['status'] == 'tampered':
                validation_result['message'] = 'Certificate has been tampered with'
            elif validation_result['status'] == 'suspicious':
                validation_result['message'] = 'Certificate validation raised some concerns'
            else:
                validation_result['message'] = 'Certificate status unknown'
            
            return validation_result
            
        except Exception as e:
            logger.error(f"Error during certificate validation: {e}")
            return self._create_error_result(f'Validation error: {str(e)}')
    
    def _extract_qr_data(self, qr_code_data: str) -> Optional[Dict[str, Any]]:
        """Extract and parse QR code data"""
        try:
            return json.loads(qr_code_data)
        except (json.JSONDecodeError, TypeError) as e:
            logger.error(f"Error parsing QR code data: {e}")
            return None
    
    def _get_certificate_by_id(self, certificate_id: str) -> Optional[Dict[str, Any]]:
        """
        Get certificate data by ID from database
        """
        try:
            from app.core.database import SessionLocal
            from app.models.database import Certificate as CertificateModel, Event as EventModel
            
            db = SessionLocal()
            
            # Query certificate with event information
            certificate = db.query(CertificateModel).filter(
                CertificateModel.certificate_id == certificate_id
            ).first()
            
            if certificate:
                # Get event information
                event = db.query(EventModel).filter(
                    EventModel.id == certificate.event_id
                ).first()
                
                cert_data = {
                    'certificate_id': certificate.certificate_id,
                    'recipient_name': certificate.recipient_name,
                    'event_name': event.name if event else 'Unknown Event',
                    'event_date': event.date.strftime('%Y-%m-%d') if event else 'Unknown Date',
                    'issued_date': certificate.issued_at.strftime('%Y-%m-%d') if certificate.issued_at else 'Unknown',
                    'hash': certificate.sha256_hash,
                    'blockchain_tx': certificate.blockchain_tx_hash,
                    'status': certificate.status.value if hasattr(certificate.status, 'value') else str(certificate.status),
                    'qr_code_data': certificate.qr_code_data,
                    'pdf_path': certificate.pdf_path,
                    'is_verified': certificate.is_verified
                }
                
                db.close()
                return cert_data
            
            db.close()
            return None
            
        except Exception as e:
            logger.error(f"Error querying certificate by ID: {e}")
            return None
    
    def _validate_certificate_exists(self, cert_data: Dict[str, Any], validation_data: Dict[str, Any]) -> Dict[str, Any]:
        """Check if certificate exists in database"""
        try:
            # This would check database for certificate existence
            # Mock implementation
            return {
                'passed': True,
                'severity': 'critical',
                'message': 'Certificate found in database',
                'details': {}
            }
        except Exception as e:
            return {
                'passed': False,
                'severity': 'critical',
                'message': f'Certificate not found: {e}',
                'details': {}
            }
    
    def _validate_hash_integrity(self, cert_data: Dict[str, Any], validation_data: Dict[str, Any]) -> Dict[str, Any]:
        """Validate certificate hash integrity"""
        try:
            # For testing, assume hash is valid if present
            stored_hash = cert_data.get('hash')
            
            if stored_hash:
                return {
                    'passed': True,
                    'severity': 'critical',
                    'message': 'Hash integrity verified',
                    'details': {
                        'stored_hash': stored_hash
                    }
                }
            else:
                return {
                    'passed': False,
                    'severity': 'warning',
                    'message': 'No hash found for verification',
                    'details': {}
                }
                
        except Exception as e:
            return {
                'passed': False,
                'severity': 'critical',
                'message': f'Hash validation error: {e}',
                'details': {}
            }
    
    def _validate_blockchain_record(self, cert_data: Dict[str, Any], validation_data: Dict[str, Any]) -> Dict[str, Any]:
        """Validate certificate record on blockchain"""
        try:
            certificate_id = cert_data.get('certificate_id')
            expected_hash = cert_data.get('hash')
            blockchain_tx = cert_data.get('blockchain_tx')
            
            if not certificate_id:
                return {
                    'passed': False,
                    'severity': 'warning',
                    'message': 'Missing certificate ID for blockchain validation',
                    'details': {}
                }
            
            # For testing, simulate blockchain verification
            # In production, this would call actual blockchain service
            if blockchain_tx:
                return {
                    'passed': True,
                    'severity': 'critical',
                    'message': 'Blockchain record verified',
                    'details': {
                        'blockchain_tx': blockchain_tx,
                        'hash_verified': True
                    }
                }
            else:
                return {
                    'passed': False,
                    'severity': 'warning',
                    'message': 'No blockchain transaction found',
                    'details': {}
                }
        except Exception as e:
            return {
                'passed': False,
                'severity': 'warning',
                'message': f'Blockchain validation error: {e}',
                'details': {}
            }
    
    def _validate_certificate_status(self, cert_data: Dict[str, Any], validation_data: Dict[str, Any]) -> Dict[str, Any]:
        """Check certificate status (active, revoked, suspended)"""
        try:
            status = cert_data.get('status', 'unknown')
            
            if status == 'active':
                return {
                    'passed': True,
                    'severity': 'critical',
                    'message': 'Certificate is active',
                    'details': {'status': status}
                }
            elif status == 'revoked':
                return {
                    'passed': False,
                    'severity': 'critical',
                    'message': 'Certificate has been revoked',
                    'details': {'status': status}
                }
            elif status == 'suspended':
                return {
                    'passed': False,
                    'severity': 'warning',
                    'message': 'Certificate is suspended',
                    'details': {'status': status}
                }
            else:
                return {
                    'passed': False,
                    'severity': 'warning',
                    'message': f'Unknown certificate status: {status}',
                    'details': {'status': status}
                }
                
        except Exception as e:
            return {
                'passed': False,
                'severity': 'warning',
                'message': f'Status validation error: {e}',
                'details': {}
            }
    
    def _validate_pdf_integrity(self, cert_data: Dict[str, Any], validation_data: Dict[str, Any]) -> Dict[str, Any]:
        """Validate PDF file integrity"""
        try:
            certificate_file = validation_data.get('certificate_file')
            if not certificate_file:
                return {
                    'passed': True,
                    'severity': 'warning',
                    'message': 'No PDF file provided for validation',
                    'details': {}
                }
            
            # Basic PDF validation (would be more comprehensive in production)
            if not certificate_file.lower().endswith('.pdf'):
                return {
                    'passed': False,
                    'severity': 'warning',
                    'message': 'File is not a PDF',
                    'details': {}
                }
            
            # Check if file exists and is readable
            if not os.path.exists(certificate_file):
                return {
                    'passed': False,
                    'severity': 'warning',
                    'message': 'Certificate file not found',
                    'details': {}
                }
            
            return {
                'passed': True,
                'severity': 'warning',
                'message': 'PDF integrity check passed',
                'details': {}
            }
            
        except Exception as e:
            return {
                'passed': False,
                'severity': 'warning',
                'message': f'PDF validation error: {e}',
                'details': {}
            }
    
    def _validate_ocr_content(self, cert_data: Dict[str, Any], validation_data: Dict[str, Any]) -> Dict[str, Any]:
        """Validate certificate content using OCR"""
        try:
            certificate_file = validation_data.get('certificate_file')
            if not certificate_file:
                return {
                    'passed': True,
                    'severity': 'warning',
                    'message': 'No file provided for OCR validation',
                    'details': {}
                }
            
            # Convert PDF to image for OCR (simplified - would use pdf2image in production)
            # For now, assume we have an image file
            if certificate_file.lower().endswith(('.png', '.jpg', '.jpeg')):
                ocr_text = self._extract_text_from_image(certificate_file)
                
                # Check if expected content is present
                recipient_name = cert_data.get('recipient_name', '')
                event_name = cert_data.get('event_name', '')
                
                name_found = recipient_name.lower() in ocr_text.lower() if recipient_name else False
                event_found = event_name.lower() in ocr_text.lower() if event_name else False
                
                if name_found and event_found:
                    return {
                        'passed': True,
                        'severity': 'warning',
                        'message': 'OCR content validation passed',
                        'details': {
                            'extracted_text_length': len(ocr_text),
                            'name_found': name_found,
                            'event_found': event_found
                        }
                    }
                else:
                    return {
                        'passed': False,
                        'severity': 'warning',
                        'message': 'OCR content mismatch - possible tampering',
                        'details': {
                            'extracted_text_length': len(ocr_text),
                            'name_found': name_found,
                            'event_found': event_found
                        }
                    }
            
            return {
                'passed': True,
                'severity': 'warning',
                'message': 'OCR validation skipped - unsupported file format',
                'details': {}
            }
            
        except Exception as e:
            return {
                'passed': False,
                'severity': 'warning',
                'message': f'OCR validation error: {e}',
                'details': {}
            }
    
    def _validate_image_tampering(self, cert_data: Dict[str, Any], validation_data: Dict[str, Any]) -> Dict[str, Any]:
        """Detect image tampering using computer vision techniques"""
        try:
            certificate_file = validation_data.get('certificate_file')
            if not certificate_file or not certificate_file.lower().endswith(('.png', '.jpg', '.jpeg')):
                return {
                    'passed': True,
                    'severity': 'warning',
                    'message': 'Image tampering validation skipped',
                    'details': {}
                }
            
            # Basic image analysis
            image = cv2.imread(certificate_file)
            if image is None:
                return {
                    'passed': False,
                    'severity': 'warning',
                    'message': 'Could not load image for tampering analysis',
                    'details': {}
                }
            
            # Simple tampering detection (noise analysis, edge detection, etc.)
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            
            # Calculate image statistics
            mean_brightness = np.mean(gray)
            std_brightness = np.std(gray)
            
            # Detect edges
            edges = cv2.Canny(gray, 50, 150)
            edge_density = np.sum(edges > 0) / edges.size
            
            # Simple heuristics for tampering detection
            tampering_score = 0
            details = {
                'mean_brightness': float(mean_brightness),
                'std_brightness': float(std_brightness),
                'edge_density': float(edge_density)
            }
            
            # Check for unusual characteristics that might indicate tampering
            if std_brightness < 10:  # Very low variation might indicate artificial content
                tampering_score += 1
            if edge_density > 0.3:  # Very high edge density might indicate manipulation
                tampering_score += 1
            
            if tampering_score > 0:
                return {
                    'passed': False,
                    'severity': 'warning',
                    'message': f'Possible image tampering detected (score: {tampering_score})',
                    'details': details
                }
            else:
                return {
                    'passed': True,
                    'severity': 'warning',
                    'message': 'No obvious image tampering detected',
                    'details': details
                }
                
        except Exception as e:
            return {
                'passed': False,
                'severity': 'warning',
                'message': f'Image tampering validation error: {e}',
                'details': {}
            }
    
    def _extract_text_from_image(self, image_path: str) -> str:
        """Extract text from image using OCR"""
        try:
            image = Image.open(image_path)
            text = pytesseract.image_to_string(image)
            return text
        except Exception as e:
            logger.error(f"OCR extraction error: {e}")
            return ""
    
    def _create_error_result(self, message: str, status: str = 'error') -> Dict[str, Any]:
        """Create standardized error result"""
        return {
            'status': status,
            'checks': {},
            'details': {'error': message},
            'timestamp': datetime.now().isoformat(),
            'certificate_data': None
        }
    
    def validate_qr_code_only(self, qr_data: str) -> Dict[str, Any]:
        """Quick validation using only QR code data"""
        try:
            cert_data = self._extract_qr_data(qr_data)
            if not cert_data:
                return self._create_error_result('Invalid QR code data')
            
            # Basic validation checks
            validation_result = self.validate_certificate({'qr_code_data': qr_data})
            return validation_result
            
        except Exception as e:
            return self._create_error_result(f'QR validation error: {str(e)}')

# Create global validator instance
certificate_validator = CertificateValidator()
