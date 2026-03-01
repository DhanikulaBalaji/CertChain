from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import Optional, Dict, Any, List
import json
import hashlib
import uuid
import time
from datetime import datetime
import os
import tempfile
import PyPDF2
import re
from PIL import Image
import pytesseract

from app.core.database import get_db
from app.models.database import Certificate, Event, ActivityLog, User as UserModel, CertificateStatus
from app.core.auth import get_current_user
from app.models.schemas import User
from app.services.did_service import verify_signature as did_verify_signature
from app.services.wallet_service import sign_challenge as wallet_sign_challenge

router = APIRouter()

# Challenge cache for DID ownership verification: challenge_uid -> { certificate_id, recipient_id, created_at }
# TTL 300 seconds (5 minutes)
_CHALLENGE_CACHE: Dict[str, Dict[str, Any]] = {}
_CHALLENGE_TTL_SEC = 300


def _store_challenge(challenge_uid: str, certificate_id: str, recipient_id: int) -> None:
    _CHALLENGE_CACHE[challenge_uid] = {
        "certificate_id": certificate_id,
        "recipient_id": recipient_id,
        "created_at": time.time(),
    }


def _get_and_consume_challenge(challenge_uid: str) -> Optional[Dict[str, Any]]:
    """Return challenge payload if valid and not expired; remove from cache (one-time use)."""
    entry = _CHALLENGE_CACHE.pop(challenge_uid, None)
    if not entry:
        return None
    if time.time() - entry["created_at"] > _CHALLENGE_TTL_SEC:
        return None
    return entry

class CertificateVerificationService:
    def __init__(self, db: Session):
        self.db = db

    def verify_by_id(self, certificate_id: str) -> Dict[str, Any]:
        """Verify certificate by ID lookup"""
        cert = self.db.query(Certificate).filter(
            Certificate.certificate_id == certificate_id
        ).first()
        
        if not cert:
            return {
                "success": False,
                "message": "Certificate not found in database",
                "fraud_detected": False,
                "verification_score": 0,
                "verification_details": {
                    "metadata_integrity": False,
                    "hash_verification": False,
                    "database_match": False,  # Certificate not found
                    "blockchain_verification": False
                }
            }
        
        # Check if certificate is revoked
        is_revoked = cert.status == "revoked"
        
        # Verify hash integrity (try both methods for backwards compatibility)
        hash_valid = self._verify_hash(cert)
        if not hash_valid:
            hash_valid = self._verify_hash_alternative(cert)
        
        # Check for fraud indicators
        fraud_indicators = self._check_fraud_indicators(cert)
        
        # Calculate verification score
        score = self._calculate_verification_score(cert)
        
        # Determine overall success
        success = not is_revoked and hash_valid and not fraud_indicators["is_fraud"]
        
        result = {
            "success": success,
            "certificate": {
                "certificate_id": cert.certificate_id,
                "recipient_name": cert.recipient_name,
                "recipient_email": cert.recipient_email,
                "event_id": cert.event_id,
                "event_name": cert.event.name if cert.event else "Unknown Event",
                "event_creator": cert.event.admin.full_name if cert.event and cert.event.admin else "Unknown Creator",
                "event_date": cert.event.date.isoformat() if cert.event and cert.event.date else None,
                "issued_date": cert.issued_at.isoformat() if cert.issued_at else None,
                "issued_at": cert.issued_at.isoformat() if cert.issued_at else None,
                "status": cert.status,
                "verification_score": score,
                "certificate_pdf_url": f"/static/certificates/cert_{cert.certificate_id}.pdf",
            },
            "verification_score": score,
            "fraud_detected": fraud_indicators["is_fraud"],
            "fraud_indicators": list(fraud_indicators.get("indicators", [])),
            "verification_details": {
                "metadata_integrity": True,  # Certificate exists in database with valid metadata
                "hash_verification": hash_valid,
                "database_match": True,  # Certificate found in database
                "blockchain_verification": cert.blockchain_tx_hash is not None
            }
        }
        
        # Add appropriate message
        if is_revoked:
            result["message"] = "Certificate has been revoked"
        elif not hash_valid:
            result["message"] = "Certificate hash verification failed - possible tampering"
        elif fraud_indicators["is_fraud"]:
            result["message"] = f"Fraud indicators detected: {', '.join(fraud_indicators['indicators'])}"
        else:
            result["message"] = "Certificate is valid and verified"

        # DID ownership verification layer: after successful hash/blockchain validation,
        # require challenge-response if certificate has a recipient with DID.
        result["verification_status"] = result.get("message", "")
        result["ownership_verified"] = False
        if success and cert.recipient_id and cert.recipient:
            recipient = cert.recipient
            if getattr(recipient, "did_id", None) and getattr(recipient, "public_key", None):
                challenge_uid = str(uuid.uuid4())
                _store_challenge(challenge_uid, cert.certificate_id, recipient.id)
                result["ownership_pending"] = True
                result["challenge"] = challenge_uid
                result["verification_status"] = "Authentic"
            else:
                result["ownership_pending"] = False
        else:
            result["ownership_pending"] = False

        return result

    def verify_qr_data(self, certificate_id: str, qr_metadata: Dict[str, Any]) -> Dict[str, Any]:
        """Verify certificate using QR code metadata"""
        base_result = self.verify_by_id(certificate_id)
        
        if not base_result["success"]:
            return base_result
        
        # Additional QR-specific validation
        qr_fraud_indicators = []
        
        # Check if QR metadata matches database
        cert = self.db.query(Certificate).filter(
            Certificate.certificate_id == certificate_id
        ).first()
        
        if qr_metadata.get("recipient_name") != cert.recipient_name:
            qr_fraud_indicators.append("QR code recipient name doesn't match database")
        
        if qr_metadata.get("event_name") != cert.event.name:
            qr_fraud_indicators.append("QR code event name doesn't match database")
        
        # Update fraud indicators
        base_result["fraud_indicators"].extend(qr_fraud_indicators)
        base_result["fraud_detected"] = len(base_result["fraud_indicators"]) > 0
        
        return base_result

    def verify_uploaded_file(self, file: UploadFile) -> Dict[str, Any]:
        """Verify certificate from uploaded file"""
        try:
            # Save uploaded file temporarily
            with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename)[1]) as tmp_file:
                content = file.file.read()
                tmp_file.write(content)
                tmp_file_path = tmp_file.name
            
            try:
                # Determine file type from filename if content_type is None
                file_extension = os.path.splitext(file.filename)[1].lower() if file.filename else ""
                content_type = file.content_type
                
                # Fallback content type detection
                if not content_type:
                    if file_extension == ".pdf":
                        content_type = "application/pdf"
                    elif file_extension in [".jpg", ".jpeg"]:
                        content_type = "image/jpeg"
                    elif file_extension == ".png":
                        content_type = "image/png"
                    else:
                        content_type = "unknown"
                
                # Extract metadata based on file type
                if content_type == "application/pdf" or file_extension == ".pdf":
                    metadata = self._extract_pdf_metadata(tmp_file_path, file.filename)
                elif (content_type and content_type.startswith("image/")) or file_extension in [".jpg", ".jpeg", ".png"]:
                    metadata = self._extract_image_metadata(tmp_file_path)
                else:
                    return {
                        "success": False,
                        "message": f"Unsupported file format: {content_type or file_extension}",
                        "fraud_detected": False,
                        "verification_details": {
                            "metadata_integrity": False,
                            "hash_verification": False,
                            "database_match": False,
                            "blockchain_verification": False
                        }
                    }
                
                # Try to find certificate by extracted ID
                if metadata.get("certificate_id"):
                    result = self.verify_by_id(metadata["certificate_id"])
                    
                    # Additional file-based fraud checks (less aggressive)
                    file_fraud_indicators = self._check_file_fraud_indicators(metadata, result)
                    if result.get("fraud_indicators"):
                        result["fraud_indicators"].extend(file_fraud_indicators)
                    else:
                        result["fraud_indicators"] = file_fraud_indicators
                    
                    # Only flag as fraud if there are MULTIPLE strong indicators
                    result["fraud_detected"] = len(result["fraud_indicators"]) >= 2

                    if result.get("success"):
                        if len(result["fraud_indicators"]) == 0:
                            # Clean — no issues at all
                            result["message"] = "Certificate is valid and authentic"
                            result["fraud_detected"] = False
                        elif len(result["fraud_indicators"]) == 1:
                            # Verified but one soft warning (e.g. text extraction artefact)
                            result["message"] = "Certificate verified with one minor note"
                            result["fraud_detected"] = False

                    return result
                else:
                    # More helpful error message
                    return {
                        "success": False,
                        "message": "Could not extract certificate ID from file. Please ensure the certificate is clear and readable.",
                        "fraud_detected": False,  # Not fraud, just unreadable
                        "fraud_indicators": ["Certificate ID not found in uploaded file - may be image-based or unclear"],
                        "verification_details": {
                            "metadata_integrity": False,  # Couldn't extract metadata
                            "hash_verification": False,
                            "database_match": False,  # No ID to check
                            "blockchain_verification": False
                        }
                    }
                    
            finally:
                # Clean up temporary file
                os.unlink(tmp_file_path)
                
        except Exception as e:
            return {
                "success": False,
                "message": f"File processing error: {str(e)}",
                "fraud_detected": False,
                "verification_details": {
                    "metadata_integrity": False,
                    "hash_verification": False,
                    "database_match": False,
                    "blockchain_verification": False
                }
            }

    def _calculate_verification_score(self, cert: Certificate) -> int:
        """Calculate verification score based on various factors"""
        score = 0
        
        # Base score for existing certificate
        score += 40
        
        # Hash verification
        if cert.sha256_hash and self._verify_hash(cert):
            score += 20
        
        # Blockchain verification
        if cert.blockchain_tx_hash:
            score += 20
        
        # Certificate status
        if cert.status == "active":
            score += 10
        elif cert.status == "revoked":
            score -= 30
        
        # Verification status
        if cert.is_verified:
            score += 10
        
        return max(0, min(100, score))

    def _check_fraud_indicators(self, cert: Certificate) -> Dict[str, Any]:
        """Check for fraud indicators - only flag actual fraud, not administrative issues"""
        indicators = []
        
        # Note: Revoked/suspended certificates are NOT fraud - they are administrative actions
        # Only add status as INFO, not as fraud indicator
        
        # Check for suspicious duplicate certificates (only if we have valid email)
        if cert.recipient_email and cert.recipient_email.strip():
            duplicate_count = self.db.query(Certificate).filter(
                Certificate.recipient_email == cert.recipient_email,
                Certificate.event_id == cert.event_id,
                Certificate.id != cert.id,
                Certificate.status == "ACTIVE"  # Only count active duplicates as suspicious
            ).count()
            
            # Only flag as fraud if there are multiple ACTIVE certificates for same person/event
            if duplicate_count > 2:  # Allow up to 2 active certificates (original + 1 reissue)
                indicators.append(f"Suspicious: Multiple active certificates for same recipient and event ({duplicate_count + 1} total)")
        
        # More lenient hash verification - only flag if hash exists but is completely wrong
        if cert.sha256_hash:
            hash_valid = self._verify_hash(cert)
            if not hash_valid:
                # Try alternative hash calculation methods before flagging as fraud
                if not self._verify_hash_alternative(cert):
                    # Only flag as potential fraud, not definitive
                    indicators.append("Certificate hash integrity warning - may indicate tampering")
        
        # Additional fraud checks
        # Check for impossible dates
        if cert.issued_at and cert.issued_at.year < 2020:
            indicators.append("Suspicious issue date - certificate predates system")
        
        if cert.issued_at and cert.issued_at.year > 2030:
            indicators.append("Suspicious issue date - certificate from future")
        
        return {
            "is_fraud": len(indicators) > 0,
            "indicators": indicators,
            "risk_level": "high" if len(indicators) > 2 else "medium" if len(indicators) > 0 else "low"
        }

    def _verify_hash(self, cert: Certificate) -> bool:
        """Verify certificate hash integrity"""
        if not cert.sha256_hash:
            return False
        
        # Get event name for hash calculation
        event_name = "Unknown Event"
        event_date = cert.issued_at.strftime('%Y-%m-%d') if cert.issued_at else ""
        
        if cert.event:
            event_name = cert.event.name
            if cert.event.date:
                event_date = cert.event.date.strftime('%Y-%m-%d')
        
        # Create expected hash using the same format as certificate generation
        hash_data = f"{cert.certificate_id}{cert.recipient_name}{event_name}{event_date}"
        expected_hash = hashlib.sha256(hash_data.encode('utf-8')).hexdigest()
        
        return cert.sha256_hash == expected_hash

    def _verify_hash_alternative(self, cert: Certificate) -> bool:
        """Try alternative hash calculation methods for backwards compatibility"""
        if not cert.sha256_hash:
            return False
        
        # Method 1: Original format with issued date
        issued_date_str = cert.issued_at.isoformat() if cert.issued_at else ""
        hash_data_1 = f"{cert.certificate_id}{cert.recipient_name}{cert.recipient_email}{cert.event_id}{issued_date_str}"
        expected_hash_1 = hashlib.sha256(hash_data_1.encode()).hexdigest()
        
        if cert.sha256_hash == expected_hash_1:
            return True
        
        # Method 2: Without email
        hash_data_2 = f"{cert.certificate_id}{cert.recipient_name}{cert.event_id}{issued_date_str}"
        expected_hash_2 = hashlib.sha256(hash_data_2.encode()).hexdigest()
        
        if cert.sha256_hash == expected_hash_2:
            return True
        
        # Method 3: Just certificate ID and name
        hash_data_3 = f"{cert.certificate_id}{cert.recipient_name}"
        expected_hash_3 = hashlib.sha256(hash_data_3.encode()).hexdigest()
        
        if cert.sha256_hash == expected_hash_3:
            return True
        
        # Method 4: Try with different date formats
        if cert.issued_at:
            # Try YYYY-MM-DD format
            date_str = cert.issued_at.strftime('%Y-%m-%d')
            hash_data_4 = f"{cert.certificate_id}{cert.recipient_name}Unknown Event{date_str}"
            expected_hash_4 = hashlib.sha256(hash_data_4.encode('utf-8')).hexdigest()
            
            if cert.sha256_hash == expected_hash_4:
                return True
        
        return False

    def _extract_pdf_metadata(self, file_path: str, original_filename: str = None) -> Dict[str, Any]:
        """Extract metadata from PDF certificate with enhanced parsing"""
        metadata = {}
        
        try:
            with open(file_path, 'rb') as file:
                reader = PyPDF2.PdfReader(file)
                
                # Extract text from all pages
                text = ""
                for page in reader.pages:
                    page_text = page.extract_text()
                    text += page_text + "\n"
                
                # Try to extract certificate ID from text first
                cert_id_found = False
                
                # Multiple certificate ID patterns to try
                cert_id_patterns = [
                    r'CERT-[A-Z0-9]{12}',  # Exact 12 characters
                    r'CERT-[A-Z0-9]{10,15}',  # 10-15 characters (flexible)
                    r'Certificate\s*ID[:\s]*([A-Z0-9-]+)',  # "Certificate ID: xxx"
                    r'ID[:\s]*([A-Z0-9-]+)',  # "ID: xxx"
                    r'CERT[A-Z0-9-]+',  # Any CERT followed by alphanumeric
                ]
                
                for pattern in cert_id_patterns:
                    cert_id_match = re.search(pattern, text, re.IGNORECASE)
                    if cert_id_match:
                        if len(cert_id_match.groups()) > 0:
                            metadata["certificate_id"] = cert_id_match.group(1).upper()
                        else:
                            metadata["certificate_id"] = cert_id_match.group().upper()
                        print(f"Found certificate ID with pattern '{pattern}': {metadata['certificate_id']}")
                        cert_id_found = True
                        break
                
                # If no text extracted or no ID found in text, try filename extraction
                if not cert_id_found or not text.strip():
                    print(f"No text extracted from PDF or no ID found, trying filename analysis")
                    # Use original filename if provided, otherwise use file path
                    filename = original_filename if original_filename else os.path.basename(file_path)
                    print(f"Analyzing filename: {filename}")
                    # Extract ID from filename pattern: cert_CERT-xxxxx.pdf
                    filename_match = re.search(r'cert_(CERT-[A-Z0-9]+)', filename)
                    if filename_match:
                        metadata["certificate_id"] = filename_match.group(1)
                        print(f"Extracted ID from filename: {metadata['certificate_id']}")
                        cert_id_found = True
                    else:
                        print(f"Could not match filename pattern in: {filename}")
                        # Try alternative pattern for uploaded files
                        alt_match = re.search(r'(CERT-[A-Z0-9]+)', filename)
                        if alt_match:
                            metadata["certificate_id"] = alt_match.group(1)
                            print(f"Extracted ID with alternative pattern: {metadata['certificate_id']}")
                            cert_id_found = True
                
                # Enhanced recipient name patterns
                name_patterns = [
                    r'(?:Recipient|Name|Awarded to|This certifies that)[:\s]*([A-Za-z\s]{2,50})',
                    r'(?:Mr\.|Ms\.|Mrs\.|Dr\.)\s*([A-Za-z\s]{2,50})',
                    r'presented to[:\s]*([A-Za-z\s]{2,50})',
                ]
                
                for pattern in name_patterns:
                    name_match = re.search(pattern, text, re.IGNORECASE)
                    if name_match:
                        metadata["recipient_name"] = name_match.group(1).strip()
                        break
                
                # Enhanced event name patterns
                event_patterns = [
                    r'(?:Event|Course|Program|Workshop|Training)[:\s]*([A-Za-z\s]{2,100})',
                    r'completion of[:\s]*([A-Za-z\s]{2,100})',
                    r'successfully completed[:\s]*([A-Za-z\s]{2,100})',
                ]
                
                for pattern in event_patterns:
                    event_match = re.search(pattern, text, re.IGNORECASE)
                    if event_match:
                        metadata["event_name"] = event_match.group(1).strip()
                        break
                
                print(f"Extracted metadata: {metadata}")
                
        except Exception as e:
            print(f"Error extracting PDF metadata: {e}")
            
            # Fallback: try to extract from filename if available
            try:
                filename = os.path.basename(file_path)
                filename_match = re.search(r'cert_(CERT-[A-Z0-9]+)', filename)
                if filename_match:
                    metadata["certificate_id"] = filename_match.group(1)
                    print(f"Fallback: extracted ID from filename: {metadata['certificate_id']}")
            except Exception as fallback_e:
                print(f"Fallback extraction also failed: {fallback_e}")
        
        return metadata

    def _extract_image_metadata(self, file_path: str) -> Dict[str, Any]:
        """Extract metadata from image certificate using enhanced OCR"""
        metadata = {}
        
        try:
            # Use OCR to extract text from image
            image = Image.open(file_path)
            
            # Apply image preprocessing for better OCR results
            image = image.convert('RGB')
            
            # Extract text using OCR
            text = pytesseract.image_to_string(image, config='--psm 6')
            
            print(f"OCR extracted text preview: {text[:200]}")
            
            # Multiple certificate ID patterns to try
            cert_id_patterns = [
                r'CERT-[A-Z0-9]{12}',  # Exact 12 characters
                r'CERT-[A-Z0-9]{10,15}',  # 10-15 characters (flexible)
                r'Certificate\s*ID[:\s]*([A-Z0-9-]+)',  # "Certificate ID: xxx"
                r'ID[:\s]*([A-Z0-9-]+)',  # "ID: xxx"
                r'CERT[A-Z0-9-]+',  # Any CERT followed by alphanumeric
            ]
            
            for pattern in cert_id_patterns:
                cert_id_match = re.search(pattern, text, re.IGNORECASE)
                if cert_id_match:
                    if len(cert_id_match.groups()) > 0:
                        metadata["certificate_id"] = cert_id_match.group(1).upper()
                    else:
                        metadata["certificate_id"] = cert_id_match.group().upper()
                    print(f"Found certificate ID with pattern '{pattern}': {metadata['certificate_id']}")
                    break
            
            # If no ID found in text, try to extract from filename
            if not metadata.get("certificate_id"):
                filename = os.path.basename(file_path)
                filename_match = re.search(r'cert_(CERT-[A-Z0-9]+)', filename)
                if filename_match:
                    metadata["certificate_id"] = filename_match.group(1)
                    print(f"Extracted ID from filename: {metadata['certificate_id']}")
            
            # Enhanced recipient name patterns
            name_patterns = [
                r'(?:Recipient|Name|Awarded to|This certifies that)[:\s]*([A-Za-z\s]{2,50})',
                r'(?:Mr\.|Ms\.|Mrs\.|Dr\.)\s*([A-Za-z\s]{2,50})',
                r'presented to[:\s]*([A-Za-z\s]{2,50})',
            ]
            
            for pattern in name_patterns:
                name_match = re.search(pattern, text, re.IGNORECASE)
                if name_match:
                    metadata["recipient_name"] = name_match.group(1).strip()
                    break
            
            print(f"Image metadata extracted: {metadata}")
            
        except Exception as e:
            print(f"Error extracting image metadata: {e}")
            
            # Fallback: try to extract from filename if available
            try:
                filename = os.path.basename(file_path)
                filename_match = re.search(r'cert_(CERT-[A-Z0-9]+)', filename)
                if filename_match:
                    metadata["certificate_id"] = filename_match.group(1)
                    print(f"Fallback: extracted ID from filename: {metadata['certificate_id']}")
            except Exception as fallback_e:
                print(f"Fallback extraction also failed: {fallback_e}")
        
        return metadata

    def _check_file_fraud_indicators(self, file_metadata: Dict[str, Any], db_result: Dict[str, Any]) -> List[str]:
        """Check for fraud indicators by comparing file metadata with database.
        Uses lenient fuzzy matching to avoid false positives from PDF text extraction."""
        indicators = []

        if not db_result.get("success"):
            return indicators

        db_cert = db_result.get("certificate", {})

        def normalize(s: str) -> str:
            """Lower-case, strip whitespace and punctuation for comparison."""
            import re
            return re.sub(r'[\s\-_.,]+', ' ', (s or '').lower()).strip()

        def names_match(extracted: str, expected: str) -> bool:
            """True if extracted name is a reasonable match for expected name."""
            if not extracted or not expected:
                return True   # can't compare → don't raise indicator
            n_ext = normalize(extracted)
            n_exp = normalize(expected)
            # Exact match
            if n_ext == n_exp:
                return True
            # One is a substring of the other (handles truncation by text extractor)
            if n_ext in n_exp or n_exp in n_ext:
                return True
            # At least 60% of words match (handles partial OCR noise)
            words_ext = set(n_ext.split())
            words_exp = set(n_exp.split())
            if not words_exp:
                return True
            overlap = len(words_ext & words_exp) / len(words_exp)
            return overlap >= 0.6

        # Only flag if BOTH extracted and db values are non-empty AND clearly differ
        if file_metadata.get("recipient_name") and db_cert.get("recipient_name"):
            if not names_match(file_metadata["recipient_name"], db_cert["recipient_name"]):
                indicators.append("Recipient name in file doesn't match database record")

        if file_metadata.get("event_name") and db_cert.get("event_name"):
            if not names_match(file_metadata["event_name"], db_cert["event_name"]):
                indicators.append("Event name in file doesn't match database record")

        return indicators

@router.post("/verify-comprehensive")
async def verify_certificate_comprehensive(
    request_data: dict,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Comprehensive certificate verification (authenticated).
    Flow: QR Scan -> Fetch certificate -> Hash compare -> If valid, return challenge for DID ownership.
    """
    service = CertificateVerificationService(db)

    certificate_id = request_data.get("certificate_id")
    verification_type = request_data.get("verification_type", "id_lookup")

    if not certificate_id:
        raise HTTPException(status_code=400, detail="Certificate ID is required")

    if verification_type == "qr_scan":
        qr_metadata = request_data.get("qr_metadata", {})
        result = service.verify_qr_data(certificate_id, qr_metadata)
    else:
        result = service.verify_by_id(certificate_id)

    # Log verification attempt
    activity_log = ActivityLog(
        user_id=current_user.id,
        action="certificate_verification",
        details=f"Verified certificate {certificate_id} via {verification_type}",
        timestamp=datetime.utcnow(),
    )
    db.add(activity_log)
    db.commit()

    # Auto-claim: if verification succeeded and cert not yet linked, link to current user when they match
    if result.get("success") and result.get("certificate"):
        cert = db.query(Certificate).filter(Certificate.certificate_id == certificate_id).first()
        if cert and cert.status != CertificateStatus.REVOKED:
            email_match = cert.recipient_email and current_user.email and cert.recipient_email.strip().lower() == current_user.email.strip().lower()
            name_match = cert.recipient_name and current_user.full_name and cert.recipient_name.strip().lower() == current_user.full_name.strip().lower()
            if (email_match or name_match) and (cert.recipient_id is None or cert.recipient_id == current_user.id):
                cert.recipient_id = current_user.id
                cert.recipient_email = current_user.email or cert.recipient_email
                db.commit()
                result["claimed_to_wallet"] = True

    return result


@router.post("/claim")
async def claim_certificate(
    request_data: dict,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Link a certificate to the current user so it appears in their wallet.
    Call after successful verification (e.g. QR scan). Certificate must be valid and
    recipient must match current user (email or name).
    """
    certificate_id = request_data.get("certificate_id")
    if not certificate_id:
        raise HTTPException(status_code=400, detail="certificate_id is required")

    cert = db.query(Certificate).filter(Certificate.certificate_id == certificate_id).first()
    if not cert:
        raise HTTPException(status_code=404, detail="Certificate not found")
    if cert.status == CertificateStatus.REVOKED:
        raise HTTPException(status_code=400, detail="Certificate has been revoked")

    email_match = cert.recipient_email and current_user.email and cert.recipient_email.strip().lower() == current_user.email.strip().lower()
    name_match = cert.recipient_name and current_user.full_name and cert.recipient_name.strip().lower() == current_user.full_name.strip().lower()
    if not (email_match or name_match):
        raise HTTPException(
            status_code=403,
            detail="This certificate is not issued to you. Recipient email or name must match your account.",
        )

    if cert.recipient_id is not None and cert.recipient_id != current_user.id:
        raise HTTPException(status_code=400, detail="Certificate is already linked to another user.")

    cert.recipient_id = current_user.id
    cert.recipient_email = current_user.email or cert.recipient_email
    db.commit()

    return {
        "success": True,
        "message": "Certificate added to your wallet.",
        "certificate_id": certificate_id,
    }


@router.post("/verify-public")
async def verify_certificate_public(
    request_data: dict,
    db: Session = Depends(get_db),
):
    """Public certificate verification endpoint for user dashboard (same flow, no auth)."""
    service = CertificateVerificationService(db)

    certificate_id = request_data.get("certificate_id")
    verification_type = request_data.get("verification_type", "id_lookup")

    if not certificate_id:
        raise HTTPException(status_code=400, detail="Certificate ID is required")

    if verification_type == "qr_scan":
        qr_metadata = request_data.get("qr_metadata", {})
        result = service.verify_qr_data(certificate_id, qr_metadata)
    else:
        result = service.verify_by_id(certificate_id)

    return result


@router.get("/public/{certificate_id}")
async def get_public_certificate(
    certificate_id: str,
    db: Session = Depends(get_db),
):
    """
    Public GET endpoint called when a QR code is scanned without login.
    Returns certificate details, validity status, and PDF URL.
    Does NOT expose blockchain tx hash, SHA-256 hash, or DID internals.
    """
    cert = db.query(Certificate).filter(Certificate.certificate_id == certificate_id).first()
    if not cert:
        raise HTTPException(status_code=404, detail="Certificate not found")

    service = CertificateVerificationService(db)
    result = service.verify_by_id(certificate_id)

    c = result.get("certificate", {})
    return {
        "certificate_id": certificate_id,
        "recipient_name": c.get("recipient_name", cert.recipient_name),
        "recipient_email": cert.recipient_email,
        "event_name": c.get("event_name", ""),
        "event_description": cert.event.description if cert.event else None,
        "event_date": c.get("event_date"),
        "event_creator": c.get("event_creator", ""),
        "issued_date": c.get("issued_date"),
        "status": cert.status if isinstance(cert.status, str) else cert.status.value,
        "is_verified": result.get("success", False),
        "certificate_pdf_url": f"/static/certificates/cert_{certificate_id}.pdf",
        "certificate_image_url": None,
        "participant_id": cert.participant_id if hasattr(cert, "participant_id") else None,
        "verification_result": {
            "success": result.get("success", False),
            "message": result.get("message", ""),
            "fraud_detected": result.get("fraud_detected", False),
            "verification_score": result.get("verification_score", 0),
            "verification_details": result.get("verification_details", {}),
        },
    }


@router.post("/complete-ownership-verification")
async def complete_ownership_verification(
    request_data: dict,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    After successful blockchain/hash validation, complete DID ownership verification.
    Wallet signs the challenge (server-side wallet); backend verifies signature.
    Caller must be the certificate recipient. Returns final verification_status.
    """
    certificate_id = request_data.get("certificate_id")
    challenge = request_data.get("challenge")
    if not certificate_id or not challenge:
        raise HTTPException(
            status_code=400,
            detail="certificate_id and challenge are required",
        )

    payload = _get_and_consume_challenge(challenge)
    if not payload or payload["certificate_id"] != certificate_id:
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired challenge",
        )
    if payload["recipient_id"] != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Only the certificate recipient can complete ownership verification",
        )

    cert = (
        db.query(Certificate)
        .filter(Certificate.certificate_id == certificate_id)
        .first()
    )
    if not cert or not cert.recipient or not cert.recipient.public_key:
        raise HTTPException(
            status_code=400,
            detail="Certificate or recipient DID not found",
        )

    signature = wallet_sign_challenge(current_user.id, challenge)
    if not signature:
        return {
            "success": False,
            "verification_status": "Authentic but Ownership Failed",
            "message": "Wallet could not sign (no private key or signing failed)",
        }

    valid = did_verify_signature(
        cert.recipient.public_key,
        signature,
        challenge,
    )
    if valid:
        return {
            "success": True,
            "verification_status": "Authentic and Ownership Verified",
            "message": "Certificate is valid and ownership verified via DID.",
        }
    return {
        "success": False,
        "verification_status": "Authentic but Ownership Failed",
        "message": "Signature verification failed.",
    }


@router.post("/verify-ownership")
async def verify_ownership(
    request_data: dict,
    db: Session = Depends(get_db),
):
    """
    Verify ownership when client holds the private key (client-side wallet).
    Request body: certificate_id, challenge, signature (hex).
    """
    certificate_id = request_data.get("certificate_id")
    challenge = request_data.get("challenge")
    signature = request_data.get("signature")
    if not certificate_id or not challenge or not signature:
        raise HTTPException(
            status_code=400,
            detail="certificate_id, challenge, and signature are required",
        )

    payload = _get_and_consume_challenge(challenge)
    if not payload or payload["certificate_id"] != certificate_id:
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired challenge",
        )

    cert = (
        db.query(Certificate)
        .filter(Certificate.certificate_id == certificate_id)
        .first()
    )
    if not cert or not cert.recipient_id or not cert.recipient or not cert.recipient.public_key:
        raise HTTPException(
            status_code=400,
            detail="Certificate or recipient DID not found",
        )

    valid = did_verify_signature(
        cert.recipient.public_key,
        signature,
        challenge,
    )
    if valid:
        return {
            "success": True,
            "verification_status": "Authentic and Ownership Verified",
            "message": "Certificate is valid and ownership verified via DID.",
        }
    return {
        "success": False,
        "verification_status": "Authentic but Ownership Failed",
        "message": "Signature verification failed.",
    }


@router.post("/verify-file")
async def verify_certificate_file(
    file: UploadFile = File(...),
    verification_type: str = Form("file_upload"),
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Verify certificate from uploaded file (authenticated)"""
    service = CertificateVerificationService(db)
    
    result = service.verify_uploaded_file(file)
    
    # Log verification attempt
    activity_log = ActivityLog(
        user_id=current_user.id,
        action="file_certificate_verification",
        details=f"Verified certificate from file {file.filename}",
        timestamp=datetime.utcnow()
    )
    db.add(activity_log)
    db.commit()
    
    return result

@router.post("/verify-file-public")
async def verify_certificate_file_public(
    file: UploadFile = File(...),
    verification_type: str = Form("file_upload"),
    db: Session = Depends(get_db),
):
    """Verify certificate from uploaded file (public endpoint for user dashboard)"""
    service = CertificateVerificationService(db)
    result = service.verify_uploaded_file(file)
    return result

@router.get("/{certificate_id}/download")
async def download_certificate(
    certificate_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Download certificate file"""
    try:
        cert = db.query(Certificate).filter(
            Certificate.certificate_id == certificate_id
        ).first()
        
        if not cert:
            raise HTTPException(status_code=404, detail="Certificate not found")
        
        # Try multiple possible file paths and formats
        file_path = None
        filename = None
        media_type = None
        
        # Try PDF first (preferred format)
        possible_pdf_paths = [
            f"certificates/cert_{certificate_id}.pdf",
            f"backend/certificates/cert_{certificate_id}.pdf",
            f"./certificates/cert_{certificate_id}.pdf",
            f"../certificates/cert_{certificate_id}.pdf"
        ]
        
        for path in possible_pdf_paths:
            if os.path.exists(path):
                file_path = path
                filename = f"certificate_{certificate_id}.pdf"
                media_type = "application/pdf"
                break
        
        # If PDF not found, try PNG as fallback
        if not file_path:
            possible_png_paths = [
                f"certificates/cert_{certificate_id}.png",
                f"backend/certificates/cert_{certificate_id}.png",
                f"./certificates/cert_{certificate_id}.png",
                f"../certificates/cert_{certificate_id}.png"
            ]
            
            for path in possible_png_paths:
                if os.path.exists(path):
                    file_path = path
                    filename = f"certificate_{certificate_id}.png"
                    media_type = "image/png"
                    break
        
        if not file_path:
            raise HTTPException(status_code=404, detail=f"Certificate file not found for ID: {certificate_id}. Checked both PDF and PNG formats.")
        
        # Log download
        activity_log = ActivityLog(
            user_id=current_user.id,
            action="certificate_download",
            details=f"Downloaded certificate {certificate_id}",
            timestamp=datetime.utcnow()
        )
        db.add(activity_log)
        db.commit()
        
        from fastapi.responses import FileResponse
        return FileResponse(
            path=file_path,
            filename=filename,
            media_type=media_type
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Download error: {str(e)}")

@router.get("/public/{certificate_id}")
async def get_public_certificate_view(
    certificate_id: str,
    db: Session = Depends(get_db),
):
    """
    Public certificate view endpoint - used when QR code is scanned.
    Returns full certificate details + verification status without authentication.
    """
    service = CertificateVerificationService(db)
    result = service.verify_by_id(certificate_id)

    # Get full certificate data
    cert = db.query(Certificate).filter(
        Certificate.certificate_id == certificate_id
    ).first()

    if not cert:
        raise HTTPException(status_code=404, detail="Certificate not found")

    # Build certificate image URL
    import os
    cert_image_url = None
    pdf_url = None
    possible_pdf = [
        f"./certificates/cert_{certificate_id}.pdf",
        f"certificates/cert_{certificate_id}.pdf",
    ]
    possible_img = [
        f"./certificates/cert_{certificate_id}.png",
        f"certificates/cert_{certificate_id}.png",
    ]
    for p in possible_pdf:
        if os.path.exists(p):
            pdf_url = f"/static/certificates/cert_{certificate_id}.pdf"
            break
    for p in possible_img:
        if os.path.exists(p):
            cert_image_url = f"/static/certificates/cert_{certificate_id}.png"
            break

    return {
        "certificate_id": cert.certificate_id,
        "recipient_name": cert.recipient_name,
        "recipient_email": cert.recipient_email,
        "event_name": cert.event.name if cert.event else "Unknown Event",
        "event_description": cert.event.description if cert.event else None,
        "event_date": cert.event.date.strftime('%Y-%m-%d') if cert.event and cert.event.date else None,
        "event_creator": cert.event.admin.full_name if cert.event and cert.event.admin else "Unknown",
        "issued_date": cert.issued_at.strftime('%Y-%m-%d') if cert.issued_at else None,
        "status": cert.status.value if hasattr(cert.status, 'value') else str(cert.status),
        "sha256_hash": cert.sha256_hash,
        "blockchain_tx_hash": cert.blockchain_tx_hash,
        "is_verified": cert.is_verified,
        "verification_result": result,
        "certificate_image_url": cert_image_url,
        "certificate_pdf_url": pdf_url,
        "participant_id": cert.participant_id,
    }


@router.post("/fraud-alert")
async def create_fraud_alert(
    alert_data: dict,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create fraud alert for SuperAdmin"""
    # Log fraud detection
    activity_log = ActivityLog(
        user_id=current_user.id,
        action="fraud_detection",
        details=json.dumps({
            "certificate_id": alert_data.get("certificate_id"),
            "fraud_indicators": alert_data.get("fraud_indicators", []),
            "detection_method": alert_data.get("detection_method"),
            "detected_by": alert_data.get("detected_by")
        }),
        timestamp=datetime.utcnow()
    )
    db.add(activity_log)
    db.commit()
    
    return {"message": "Fraud alert created successfully"}

# Test endpoint without authentication
@router.get("/test/verify/{certificate_id}")
async def test_verify_certificate(certificate_id: str, db: Session = Depends(get_db)):
    """Test certificate verification without authentication"""
    service = CertificateVerificationService(db)
    
    try:
        result = service.verify_by_id(certificate_id)
        return result
    except Exception as e:
        return {
            "success": False,
            "message": f"Verification error: {str(e)}",
            "fraud_detected": False
        }
