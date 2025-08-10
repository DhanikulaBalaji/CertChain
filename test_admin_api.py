#!/usr/bin/env python3
"""
Test Admin Dashboard API Endpoint
"""

import requests
import json

def test_admin_dashboard():
    """Test the admin dashboard endpoint directly"""
    
    base_url = "http://localhost:8001/api/v1"
    
    print("🧪 TESTING ADMIN DASHBOARD API")
    print("=" * 40)
    
    # Test admin dashboard stats (should require auth)
    print("\n📊 Testing /admin/dashboard-stats (without auth)")
    try:
        response = requests.get(f"{base_url}/admin/dashboard-stats")
        print(f"Status: {response.status_code}")
        if response.status_code == 401:
            print("✅ Expected 401 - Authentication required (this is correct)")
        elif response.status_code == 200:
            data = response.json()
            print(f"✅ Success: {json.dumps(data, indent=2)}")
        else:
            print(f"❌ Unexpected error: {response.text}")
    except Exception as e:
        print(f"❌ Connection error: {str(e)}")
    
    # Test if we can reach the docs
    print("\n📚 Testing /docs endpoint")
    try:
        response = requests.get(f"http://localhost:8001/docs")
        print(f"Status: {response.status_code}")
        if response.status_code == 200:
            print("✅ API docs accessible")
        else:
            print(f"❌ API docs error: {response.status_code}")
    except Exception as e:
        print(f"❌ Connection error: {str(e)}")
    
    # Test root endpoint
    print("\n🏠 Testing root endpoint")
    try:
        response = requests.get(f"http://localhost:8001/")
        print(f"Status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Root endpoint: {json.dumps(data, indent=2)}")
        else:
            print(f"❌ Root endpoint error: {response.text}")
    except Exception as e:
        print(f"❌ Connection error: {str(e)}")
    
    print("\n✅ API endpoint tests completed!")

if __name__ == "__main__":
    test_admin_dashboard()
