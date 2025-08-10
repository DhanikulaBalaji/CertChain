#!/usr/bin/env python3
"""
Test network connectivity and API endpoints
"""
import requests
import json

def test_backend_health():
    """Test if backend is responding"""
    try:
        response = requests.get("http://localhost:8001/health", timeout=5)
        print(f"Backend health check: {response.status_code}")
        if response.status_code == 200:
            print("✓ Backend is running")
            return True
        else:
            print(f"✗ Backend returned: {response.status_code}")
            return False
    except Exception as e:
        print(f"✗ Backend connection failed: {e}")
        return False

def test_login():
    """Test login endpoint"""
    try:
        login_data = {
            "username": "admin", 
            "password": "admin123"
        }
        response = requests.post(
            "http://localhost:8001/api/v1/auth/login", 
            json=login_data,
            timeout=5
        )
        print(f"Login test: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print("✓ Login successful")
            return data.get("access_token")
        else:
            print(f"✗ Login failed: {response.text}")
            return None
    except Exception as e:
        print(f"✗ Login request failed: {e}")
        return None

def test_certificate_generation(token):
    """Test certificate generation endpoint"""
    if not token:
        print("Skipping certificate test - no token")
        return
        
    try:
        headers = {"Authorization": f"Bearer {token}"}
        cert_data = {
            "recipient_name": "Test User",
            "recipient_email": "test@example.com",
            "event_name": "Test Event",
            "event_date": "2024-01-01",
            "issuer_name": "Test Issuer"
        }
        response = requests.post(
            "http://localhost:8001/api/v1/certificates/generate", 
            json=cert_data,
            headers=headers,
            timeout=10
        )
        print(f"Certificate generation: {response.status_code}")
        if response.status_code == 200:
            print("✓ Certificate generation successful")
        else:
            print(f"✗ Certificate generation failed: {response.text}")
    except Exception as e:
        print(f"✗ Certificate generation request failed: {e}")

if __name__ == "__main__":
    print("Testing network connectivity and API endpoints...")
    print("=" * 50)
    
    # Test backend health
    if test_backend_health():
        # Test login
        token = test_login()
        
        # Test certificate generation
        test_certificate_generation(token)
    
    print("=" * 50)
    print("Test complete")
