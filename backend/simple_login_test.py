#!/usr/bin/env python3
"""
Simple test script to verify login functionality
"""

import requests
import urllib3

# Disable SSL warnings for development
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

BASE_URL = "http://localhost:8001"

def test_login():
    """Test login functionality"""
    print("=== Testing Login ===")
    
    # Test login with admin credentials
    login_data = {
        "username": "admin@example.com",
        "password": "admin123"
    }
    
    try:
        response = requests.post(f"{BASE_URL}/api/v1/auth/login", data=login_data, verify=False)
        print(f"Login response status: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print("✅ Login successful!")
            print(f"Access token received: {result.get('access_token', 'None')[:50]}...")
            return result.get('access_token')
        else:
            print(f"❌ Login failed: {response.text}")
            return None
            
    except Exception as e:
        print(f"❌ Login error: {e}")
        return None

def test_admin_certificates(token):
    """Test fetching admin certificates"""
    if not token:
        print("❌ No token available for testing certificates")
        return
    
    print("\n=== Testing Admin Certificates ===")
    headers = {"Authorization": f"Bearer {token}"}
    
    try:
        response = requests.get(f"{BASE_URL}/api/v1/certificates/admin-certificates", headers=headers, verify=False)
        print(f"Admin certificates response status: {response.status_code}")
        
        if response.status_code == 200:
            certificates = response.json()
            print(f"✅ Found {len(certificates)} certificates")
            
            if certificates:
                cert = certificates[0]
                print(f"Sample certificate: {cert.get('certificate_id', 'Unknown')}")
                print(f"Status: {cert.get('status', 'Unknown')}")
                print(f"Revoked by: {cert.get('revoked_by', 'None')}")
            else:
                print("No certificates found")
        else:
            print(f"❌ Failed to fetch certificates: {response.text}")
            
    except Exception as e:
        print(f"❌ Certificates error: {e}")

if __name__ == "__main__":
    token = test_login()
    test_admin_certificates(token)
