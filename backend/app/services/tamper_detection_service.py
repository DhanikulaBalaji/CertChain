import cv2
import numpy as np
import hashlib
import json
import os
import logging
from datetime import datetime
from typing import Dict, Any, Optional, List, Tuple
from dataclasses import dataclass
from sqlalchemy.orm import Session
from PIL import Image, ImageChops
from app.models.database import TamperLog, Certificate as CertificateModel
from app.core.database import get_db
# Email notification temporarily disabled
import pytesseract

@dataclass
class TamperResult:
    """Result of tamper detection analysis"""
    is_tampered: bool
    confidence_score: float
    tamper_type: str
    details: Dict[str, Any]
    evidence: Optional[List[str]] = None

logger = logging.getLogger(__name__)

class TamperDetectionService:
    def __init__(self):
        """Initialize tamper detection service with OCR and image processing"""
        self.confidence_threshold = 0.8
        self.pixel_difference_threshold = 0.05
        self.hash_similarity_threshold = 0.95
        
    def detect_tampering(
        self,
        certificate_id: str,
        file_path: str,
        db: Session,
        original_hash: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Comprehensive tamper detection using multiple validation methods
        """
        tamper_results = {
            "certificate_id": certificate_id,
            "file_path": file_path,
            "tamper_detected": False,
            "confidence_score": 1.0,
            "detection_methods": {},
            "suspicious_areas": [],
            "report_summary": "",
            "timestamp": datetime.utcnow().isoformat()
        }
        
        try:
            # Method 1: Hash Integrity Check
            hash_result = self._verify_hash_integrity(file_path, original_hash)
            tamper_results["detection_methods"]["hash_verification"] = hash_result
            
            # Method 2: PDF Structure Analysis
            if file_path.endswith('.pdf'):
                pdf_result = self._analyze_pdf_structure(file_path)
                tamper_results["detection_methods"]["pdf_structure"] = pdf_result
            
            # Method 3: OCR Font Consistency Check
            ocr_result = self._verify_ocr_consistency(file_path)
            tamper_results["detection_methods"]["ocr_verification"] = ocr_result
            
            # Method 4: Image Forensics (if image content exists)
            forensics_result = self._perform_image_forensics(file_path)
            tamper_results["detection_methods"]["image_forensics"] = forensics_result
            
            # Method 5: Template Comparison (if original template available)
            template_result = self._compare_with_template(certificate_id, file_path, db)
            tamper_results["detection_methods"]["template_comparison"] = template_result
            
            # Aggregate Results and Calculate Confidence
            tamper_detected, confidence, summary = self._aggregate_tamper_results(tamper_results["detection_methods"])
            
            tamper_results["tamper_detected"] = tamper_detected
            tamper_results["confidence_score"] = confidence
            tamper_results["report_summary"] = summary
            
            # Log results to database
            self._log_tamper_detection(tamper_results, db)
            
            # Send alert if tampering detected
            if tamper_detected and confidence > 0.7:
                self._send_tamper_alert(tamper_results, db)
            
            return tamper_results
            
        except Exception as e:
            logger.error(f"Tamper detection failed for {certificate_id}: {e}")
            tamper_results["error"] = str(e)
            return tamper_results
    
    def _verify_hash_integrity(self, file_path: str, original_hash: Optional[str]) -> Dict[str, Any]:
        """Verify file hash integrity"""
        try:
            with open(file_path, 'rb') as file:
                current_hash = hashlib.sha256(file.read()).hexdigest()
            
            result = {
                "method": "hash_verification",
                "current_hash": current_hash,
                "original_hash": original_hash,
                "tamper_detected": False,
                "confidence": 1.0,
                "details": "Hash verification passed"
            }
            
            if original_hash and current_hash != original_hash:
                result["tamper_detected"] = True
                result["confidence"] = 0.0
                result["details"] = "Hash mismatch detected - file has been modified"
            elif not original_hash:
                result["confidence"] = 0.5
                result["details"] = "No original hash available for comparison"
                
            return result
            
        except Exception as e:
            return {
                "method": "hash_verification",
                "tamper_detected": True,
                "confidence": 0.0,
                "error": str(e),
                "details": "Hash verification failed"
            }
    
    def _analyze_pdf_structure(self, file_path: str) -> Dict[str, Any]:
        """Analyze PDF structure for signs of tampering"""
        try:
            import PyPDF2
            
            result = {
                "method": "pdf_structure",
                "tamper_detected": False,
                "confidence": 0.8,
                "details": "PDF structure appears normal",
                "warnings": []
            }
            
            with open(file_path, 'rb') as file:
                pdf_reader = PyPDF2.PdfReader(file)
                
                # Check for multiple revisions
                if hasattr(pdf_reader, 'xref') and len(pdf_reader.xref) > 1:
                    result["warnings"].append("Multiple PDF revisions detected")
                    result["confidence"] -= 0.2
                
                # Check metadata for modification dates
                metadata = pdf_reader.metadata
                if metadata:
                    if '/ModDate' in metadata and '/CreationDate' in metadata:
                        if metadata['/ModDate'] != metadata['/CreationDate']:
                            result["warnings"].append("PDF modification date differs from creation date")
                            result["confidence"] -= 0.1
                
                # Check for form fields (unusual in certificates)
                for page in pdf_reader.pages:
                    if '/Annots' in page:
                        result["warnings"].append("Interactive elements detected")
                        result["confidence"] -= 0.1
            
            if result["confidence"] < 0.6:
                result["tamper_detected"] = True
                result["details"] = "PDF structure analysis detected suspicious modifications"
            
            return result
            
        except Exception as e:
            return {
                "method": "pdf_structure",
                "tamper_detected": False,
                "confidence": 0.5,
                "error": str(e),
                "details": "PDF structure analysis failed"
            }
    
    def _verify_ocr_consistency(self, file_path: str) -> Dict[str, Any]:
        """Verify OCR font and text consistency"""
        try:
            result = {
                "method": "ocr_verification",
                "tamper_detected": False,
                "confidence": 0.8,
                "details": "OCR verification passed",
                "text_regions": [],
                "font_inconsistencies": []
            }
            
            # Convert PDF to image if needed
            if file_path.endswith('.pdf'):
                # Use pdf2image library for conversion
                images = self._pdf_to_images(file_path)
            else:
                images = [Image.open(file_path)]
            
            for i, image in enumerate(images):
                # Perform OCR with detailed data
                ocr_data = pytesseract.image_to_data(
                    image, 
                    output_type=pytesseract.Output.DICT,
                    config='--psm 6'
                )
                
                # Analyze font consistency
                font_sizes = []
                confidence_scores = []
                
                for j, conf in enumerate(ocr_data['conf']):
                    if int(conf) > 30:  # Filter out low confidence detections
                        height = ocr_data['height'][j]
                        if height > 0:
                            font_sizes.append(height)
                            confidence_scores.append(conf)
                
                if font_sizes:
                    # Check for unusual font size variations
                    font_variation = np.std(font_sizes) / np.mean(font_sizes) if font_sizes else 0
                    avg_confidence = np.mean(confidence_scores)
                    
                    if font_variation > 0.5:  # High variation indicates potential tampering
                        result["font_inconsistencies"].append(f"Page {i+1}: High font variation ({font_variation:.2f})")
                        result["confidence"] -= 0.2
                    
                    if avg_confidence < 60:  # Low OCR confidence
                        result["font_inconsistencies"].append(f"Page {i+1}: Low OCR confidence ({avg_confidence:.1f}%)")
                        result["confidence"] -= 0.1
            
            if result["font_inconsistencies"]:
                result["tamper_detected"] = len(result["font_inconsistencies"]) > 2
                result["details"] = f"Font inconsistencies detected: {', '.join(result['font_inconsistencies'])}"
            
            return result
            
        except Exception as e:
            return {
                "method": "ocr_verification",
                "tamper_detected": False,
                "confidence": 0.5,
                "error": str(e),
                "details": "OCR verification failed"
            }
    
    def _perform_image_forensics(self, file_path: str) -> Dict[str, Any]:
        """Perform image forensics analysis"""
        try:
            result = {
                "method": "image_forensics",
                "tamper_detected": False,
                "confidence": 0.7,
                "details": "Image forensics analysis completed",
                "suspicious_regions": [],
                "compression_artifacts": False
            }
            
            # Convert to image if PDF
            if file_path.endswith('.pdf'):
                images = self._pdf_to_images(file_path)
                if not images:
                    raise Exception("Could not convert PDF to image")
                image = images[0]  # Analyze first page
            else:
                image = Image.open(file_path)
            
            # Convert to OpenCV format
            opencv_image = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
            
            # Method 1: JPEG compression analysis
            if hasattr(image, 'format') and image.format == 'JPEG':
                # Analyze JPEG compression artifacts
                gray = cv2.cvtColor(opencv_image, cv2.COLOR_BGR2GRAY)
                
                # Detect compression artifacts using Laplacian
                laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
                
                if laplacian_var < 100:  # Low variance suggests heavy compression
                    result["compression_artifacts"] = True
                    result["confidence"] -= 0.1
            
            # Method 2: Noise analysis
            gray = cv2.cvtColor(opencv_image, cv2.COLOR_BGR2GRAY)
            noise_level = np.std(gray)
            
            # Method 3: Edge consistency analysis
            edges = cv2.Canny(gray, 50, 150)
            edge_density = np.sum(edges > 0) / edges.size
            
            # Unusual patterns may indicate tampering
            if noise_level > 50:  # High noise
                result["suspicious_regions"].append(f"High noise level: {noise_level:.2f}")
                result["confidence"] -= 0.1
                
            if edge_density < 0.01:  # Very few edges (unusual for certificates)
                result["suspicious_regions"].append(f"Low edge density: {edge_density:.4f}")
                result["confidence"] -= 0.1
            
            if result["suspicious_regions"]:
                result["tamper_detected"] = len(result["suspicious_regions"]) > 1
                result["details"] = f"Suspicious patterns: {', '.join(result['suspicious_regions'])}"
            
            return result
            
        except Exception as e:
            return {
                "method": "image_forensics",
                "tamper_detected": False,
                "confidence": 0.5,
                "error": str(e),
                "details": "Image forensics analysis failed"
            }
    
    def _compare_with_template(self, certificate_id: str, file_path: str, db: Session) -> Dict[str, Any]:
        """Compare certificate with original template"""
        try:
            result = {
                "method": "template_comparison",
                "tamper_detected": False,
                "confidence": 0.6,
                "details": "Template comparison completed",
                "template_found": False,
                "similarity_score": 0.0
            }
            
            # Get certificate record
            certificate = db.query(CertificateModel).filter(
                CertificateModel.certificate_id == certificate_id
            ).first()
            
            if not certificate or not certificate.event:
                result["details"] = "No template available for comparison"
                return result
            
            template_path = getattr(certificate.event, 'template_path', None)
            if not template_path or not os.path.exists(template_path):
                result["details"] = "Template file not found"
                return result
            
            result["template_found"] = True
            
            # Load both images
            current_image = self._load_image(file_path)
            template_image = self._load_image(template_path)
            
            if current_image is None or template_image is None:
                result["details"] = "Failed to load images for comparison"
                return result
            
            # Resize images to same size for comparison
            height, width = template_image.shape[:2]
            current_resized = cv2.resize(current_image, (width, height))
            
            # Calculate structural similarity
            similarity = self._calculate_image_similarity(current_resized, template_image)
            result["similarity_score"] = similarity
            
            if similarity < 0.7:  # Low similarity suggests tampering
                result["tamper_detected"] = True
                result["confidence"] = 0.9
                result["details"] = f"Low template similarity: {similarity:.2f}"
            else:
                result["confidence"] = 0.8
                result["details"] = f"Template similarity: {similarity:.2f}"
            
            return result
            
        except Exception as e:
            return {
                "method": "template_comparison",
                "tamper_detected": False,
                "confidence": 0.5,
                "error": str(e),
                "details": "Template comparison failed"
            }
    
    def _aggregate_tamper_results(self, detection_methods: Dict[str, Dict[str, Any]]) -> Tuple[bool, float, str]:
        """Aggregate results from all detection methods"""
        total_confidence = 0.0
        total_weight = 0.0
        tamper_votes = 0
        total_methods = len(detection_methods)
        
        method_weights = {
            "hash_verification": 0.4,
            "pdf_structure": 0.15,
            "ocr_verification": 0.2,
            "image_forensics": 0.15,
            "template_comparison": 0.1
        }
        
        summary_parts = []
        
        for method, result in detection_methods.items():
            weight = method_weights.get(method, 0.1)
            confidence = result.get("confidence", 0.5)
            tamper_detected = result.get("tamper_detected", False)
            
            total_confidence += confidence * weight
            total_weight += weight
            
            if tamper_detected:
                tamper_votes += 1
            
            summary_parts.append(f"{method}: {'TAMPERED' if tamper_detected else 'OK'} ({confidence:.2f})")
        
        # Calculate overall confidence
        overall_confidence = total_confidence / total_weight if total_weight > 0 else 0.5
        
        # Determine if tampering is detected
        tamper_detected = (tamper_votes >= 2) or (tamper_votes >= 1 and overall_confidence < 0.6)
        
        summary = "; ".join(summary_parts)
        
        return tamper_detected, overall_confidence, summary
    
    def _log_tamper_detection(self, results: Dict[str, Any], db: Session):
        """Log tamper detection results to database"""
        try:
            tamper_log = TamperLog(
                certificate_id=results["certificate_id"],
                tamper_detected=results["tamper_detected"],
                confidence_score=results["confidence_score"],
                detection_methods=json.dumps(results["detection_methods"]),
                report_summary=results["report_summary"],
                file_path=results["file_path"]
            )
            
            db.add(tamper_log)
            db.commit()
            
        except Exception as e:
            logger.error(f"Failed to log tamper detection: {e}")
    
    def _send_tamper_alert(self, results: Dict[str, Any], db: Session):
        """Send tamper detection alert to administrators"""
        try:
            # Email notification disabled for production
            logger.info(f"Tamper attempt detected: {results.get('certificate_id', 'Unknown')}")
            logger.info(f"Detection details: {results.get('report_summary', 'No details available')}")
            
        except Exception as e:
            logger.error(f"Failed to send tamper alert: {e}")
    
    def _pdf_to_images(self, pdf_path: str) -> List[Image.Image]:
        """Convert PDF pages to images"""
        try:
            from pdf2image import convert_from_path
            return convert_from_path(pdf_path, dpi=150)
        except ImportError:
            logger.warning("pdf2image not available - PDF conversion skipped")
            return []
        except Exception as e:
            logger.error(f"PDF to image conversion failed: {e}")
            return []
    
    def _load_image(self, file_path: str) -> Optional[np.ndarray]:
        """Load image file and convert to OpenCV format"""
        try:
            if file_path.endswith('.pdf'):
                images = self._pdf_to_images(file_path)
                if images:
                    return cv2.cvtColor(np.array(images[0]), cv2.COLOR_RGB2BGR)
                return None
            else:
                image = cv2.imread(file_path)
                return image
        except Exception as e:
            logger.error(f"Failed to load image {file_path}: {e}")
            return None
    
    def _calculate_image_similarity(self, img1: np.ndarray, img2: np.ndarray) -> float:
        """Calculate similarity between two images"""
        try:
            from skimage.metrics import structural_similarity as ssim
            
            # Convert to grayscale
            gray1 = cv2.cvtColor(img1, cv2.COLOR_BGR2GRAY)
            gray2 = cv2.cvtColor(img2, cv2.COLOR_BGR2GRAY)
            
            # Calculate SSIM
            similarity = ssim(gray1, gray2)
            return similarity
            
        except ImportError:
            # Fallback to simple correlation
            gray1 = cv2.cvtColor(img1, cv2.COLOR_BGR2GRAY)
            gray2 = cv2.cvtColor(img2, cv2.COLOR_BGR2GRAY)
            
            correlation = cv2.matchTemplate(gray1, gray2, cv2.TM_CCOEFF_NORMED)[0][0]
            return max(0, correlation)
        except Exception as e:
            logger.error(f"Image similarity calculation failed: {e}")
            return 0.5

# Global tamper detection service instance
tamper_detection_service = TamperDetectionService()
