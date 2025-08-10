import requests

# Test just the admin-certificates endpoint with a hardcoded token
print("🔍 Testing Admin Certificates Endpoint Fix")

# First login to get token
try:
    print("1. Logging in...")
    login_response = requests.post(
        "http://localhost:8001/api/v1/auth/login",
        data={"username": "admin@certificate-system.com", "password": "admin123"},
        verify=False
    )
    
    if login_response.status_code == 200:
        token = login_response.json()["access_token"]
        print("✅ Login successful")
        
        # Test admin-certificates
        print("2. Testing admin-certificates endpoint...")
        response = requests.get(
            "http://localhost:8001/api/v1/certificates/admin-certificates",
            headers={"Authorization": f"Bearer {token}"},
            verify=False
        )
        
        print(f"Status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"✅ SUCCESS! Returned {len(data)} certificates")
            print("🎉 Admin dashboard issue is FIXED!")
        else:
            print(f"❌ Failed: {response.text}")
    else:
        print(f"❌ Login failed: {login_response.text}")
        
except Exception as e:
    print(f"❌ Error: {e}")
