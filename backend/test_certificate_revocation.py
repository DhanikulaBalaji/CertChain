#!/usr/bin/env python3
"""
Test script to verify certificate revocation functionality
"""

import requests
import json

BASE_URL = "http://localhost:8001"

def login_admin():
    """Login as admin to get access token"""
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    
    login_data = {
        "username": "admin@example.com",
        "password": "admin123"
    }
    
    try:
        response = requests.post(f"{BASE_URL}/api/v1/auth/login", data=login_data, verify=False)
        print(f"Login response status: {response.status_code}")
        print(f"Login response: {response.text}")
        
        if response.status_code == 200:
            return response.json()["access_token"]
        else:
            print(f"Login failed: {response.text}")
            return None
    except Exception as e:
        print(f"Login error: {e}")
        return None

def test_certificate_operations():
    """Test certificate revocation and re-issue functionality"""
    token = login_admin()
    if not token:
        return
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # 1. Get all certificates for admin
    print("=== Fetching admin certificates ===")
    response = requests.get(f"{BASE_URL}/api/v1/certificates/admin-certificates", headers=headers)
    if response.status_code == 200:
        certificates = response.json()
        print(f"Found {len(certificates)} certificates")
        
        if certificates:
            cert = certificates[0]
            cert_id = cert["certificate_id"]
            print(f"Testing with certificate: {cert_id}")
            print(f"Current status: {cert.get('status', 'unknown')}")
            print(f"Revoked by: {cert.get('revoked_by', 'None')}")
            
            # 2. Test certificate revocation
            print(f"\n=== Testing revocation for {cert_id} ===")
            revoke_data = {"reason": "Testing revocation functionality"}
            response = requests.post(f"{BASE_URL}/api/v1/certificates/{cert_id}/revoke", data=revoke_data, headers=headers)
            
            if response.status_code == 200:
                print("✅ Certificate revoked successfully")
                
                # 3. Check updated certificate details
                response = requests.get(f"{BASE_URL}/api/v1/certificates/admin-certificates", headers=headers)
                if response.status_code == 200:
                    updated_certs = response.json()
                    updated_cert = next((c for c in updated_certs if c["certificate_id"] == cert_id), None)
                    if updated_cert:
                        print(f"Updated status: {updated_cert.get('status', 'unknown')}")
                        print(f"Revoked by: {updated_cert.get('revoked_by', 'None')}")
                        print(f"Revocation reason: {updated_cert.get('revocation_reason', 'None')}")
                        print(f"Revoked at: {updated_cert.get('revoked_at', 'None')}")
            else:
                print(f"❌ Revocation failed: {response.text}")
            
            # 4. Test certificate re-issue
            print(f"\n=== Testing re-issue for {cert_id} ===")
            response = requests.post(f"{BASE_URL}/api/v1/certificates/{cert_id}/reissue", headers=headers)
            
            if response.status_code == 200:
                print("✅ Certificate re-issued successfully")
                result = response.json()
                new_cert_id = result.get("data", {}).get("new_certificate_id")
                if new_cert_id:
                    print(f"New certificate ID: {new_cert_id}")
            else:
                print(f"❌ Re-issue failed: {response.text}")
            
            # 5. Test certificate download
            print(f"\n=== Testing download for {cert_id} ===")
            response = requests.get(f"{BASE_URL}/api/v1/certificates/{cert_id}/download", headers=headers)
            
            if response.status_code == 200:
                print("✅ Certificate download successful")
                print(f"Content-Type: {response.headers.get('content-type')}")
                print(f"Content-Length: {len(response.content)} bytes")
            else:
                print(f"❌ Download failed: {response.text}")
                
        else:
            print("No certificates found for testing")
    else:
        print(f"Failed to fetch certificates: {response.text}")

if __name__ == "__main__":
    test_certificate_operations()
