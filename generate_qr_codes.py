#!/usr/bin/env python3
"""
QR Code Generator for Certificate IDs
Generates QR codes for testing the certificate verification system
"""
import qrcode
import os

def generate_certificate_qr(certificate_id, output_dir="qr_codes"):
    """Generate a QR code for a certificate ID"""
    
    # Create output directory if it doesn't exist
    os.makedirs(output_dir, exist_ok=True)
    
    # Create QR code instance
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=4,
    )
    
    # Add certificate ID to QR code
    qr.add_data(certificate_id)
    qr.make(fit=True)
    
    # Create QR code image
    img = qr.make_image(fill_color="black", back_color="white")
    
    # Save the image
    filename = f"{certificate_id}.png"
    filepath = os.path.join(output_dir, filename)
    img.save(filepath)
    
    print(f"✅ QR code generated: {filepath}")
    return filepath

def main():
    """Generate QR codes for known certificate IDs"""
    
    # Known certificate IDs from the database
    certificate_ids = [
        "CERT-0F2A92DFA52A",  # Alice Johnson
        "CERT-087EF428246A",  # Ethan Hunt (revoked)
        "CERT-465183BA9C4B",  # Another certificate
        "CERT-5999A5DDDC28",  # Another certificate
        "CERT-5F0B2C17146A",  # Another certificate
    ]
    
    print("Generating QR codes for certificate verification testing...")
    
    for cert_id in certificate_ids:
        try:
            generate_certificate_qr(cert_id)
        except Exception as e:
            print(f"❌ Error generating QR code for {cert_id}: {e}")
    
    print(f"\n🎉 Generated {len(certificate_ids)} QR codes in 'qr_codes' directory")
    print("You can now use these QR codes to test the scanner functionality!")

if __name__ == "__main__":
    main()
