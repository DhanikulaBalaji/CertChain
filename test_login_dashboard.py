#!/usr/bin/env python3
"""
Test Login and Dashboard Access
"""

import requests
import json

def test_login_and_dashboard():
    """Test login and then access dashboard"""
    
    base_url = "http://localhost:8001/api/v1"
    
    print("🔐 TESTING LOGIN AND DASHBOARD ACCESS")
    print("=" * 50)
    
    # Actual correct passwords provided by user
    credentials_to_try = [
        ("admin@certificate-system.com", "Admin123!"),
        ("testuser@certificate-system.com", "User123!"),
        ("superadmin@certificate-system.com", "SuperAdmin123!"),
    ]
    
    token = None
    successful_creds = None
    
    for email, password in credentials_to_try:
        print(f"\n🔍 Trying: {email} / {password}")
        
        try:
            # Try to login
            login_data = {
                "username": email,  # FastAPI typically uses 'username' field
                "password": password
            }
            
            response = requests.post(f"{base_url}/auth/login", data=login_data)
            
            print(f"Login Status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                if 'access_token' in data:
                    token = data['access_token']
                    successful_creds = (email, password)
                    print(f"✅ LOGIN SUCCESS! Token received.")
                    break
                else:
                    print(f"❌ No token in response: {data}")
            else:
                print(f"❌ Login failed: {response.text}")
                
        except Exception as e:
            print(f"❌ Connection error: {str(e)}")
    
    if token:
        print(f"\n🎉 SUCCESSFUL LOGIN: {successful_creds[0]} / {successful_creds[1]}")
        print(f"🔑 Token: {token[:50]}...")
        
        # Now test dashboard access with token
        print(f"\n📊 Testing dashboard access with auth token...")
        
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        
        try:
            response = requests.get(f"{base_url}/admin/dashboard-stats", headers=headers)
            print(f"Dashboard Status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                print(f"✅ DASHBOARD SUCCESS!")
                print(f"📈 Dashboard Data: {json.dumps(data, indent=2)}")
            else:
                print(f"❌ Dashboard failed: {response.text}")
                
        except Exception as e:
            print(f"❌ Dashboard error: {str(e)}")
    else:
        print(f"\n❌ NO SUCCESSFUL LOGIN FOUND")
        print(f"Need to check password hash method or reset passwords")
    
    print("\n✅ Login and dashboard test completed!")

if __name__ == "__main__":
    test_login_and_dashboard()
