import requests
import json

def test_admin_certificates():
    """Test the specific admin-certificates endpoint that was failing"""
    
    # Login first
    login_data = {
        "username": "admin@certificate-system.com",
        "password": "admin123"
    }
    
    try:
        # Login to get token (using form data)
        login_response = requests.post(
            "http://localhost:8001/api/v1/auth/login",
            data=login_data,  # Using data instead of json for form submission
            verify=False,
            timeout=10
        )
        
        if login_response.status_code != 200:
            print(f"❌ Login failed: {login_response.status_code}")
            print(f"Response: {login_response.text}")
            return
            
        token = login_response.json().get("access_token")
        if not token:
            print("❌ No access token received")
            return
            
        print("✅ Login successful")
        
        # Test the admin-certificates endpoint
        headers = {"Authorization": f"Bearer {token}"}
        
        response = requests.get(
            "http://localhost:8001/api/v1/certificates/admin-certificates",
            headers=headers,
            verify=False,
            timeout=10
        )
        
        print(f"\n📊 Admin Certificates Endpoint Test:")
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            print("✅ SUCCESS: Admin certificates endpoint working!")
            data = response.json()
            print(f"Returned {len(data)} certificates")
            if data:
                print("Sample certificate:")
                print(json.dumps(data[0], indent=2))
        else:
            print(f"❌ FAILED: {response.text}")
            
    except requests.exceptions.RequestException as e:
        print(f"❌ Request error: {e}")
    except Exception as e:
        print(f"❌ Unexpected error: {e}")

if __name__ == "__main__":
    test_admin_certificates()
