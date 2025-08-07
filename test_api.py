#!/usr/bin/env python3
"""Test API endpoints that the dashboard is trying to call"""

import requests
import json

BASE_URL = "http://localhost:8001/api/v1"

def test_endpoint(endpoint, description):
    """Test an API endpoint"""
    try:
        print(f"\n🔍 Testing {description}")
        print(f"GET {BASE_URL}{endpoint}")
        
        response = requests.get(f"{BASE_URL}{endpoint}", timeout=10)
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Success - Response length: {len(str(data))}")
            return True
        else:
            print(f"❌ Failed - {response.text}")
            return False
            
    except requests.exceptions.ConnectionError:
        print(f"❌ Connection Error - Backend server not running on {BASE_URL}")
        return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def main():
    print("🧪 Testing Dashboard API Endpoints")
    print("=" * 50)
    
    # Test endpoints that the dashboard calls
    endpoints = [
        ("/admin/users", "Users endpoint"),
        ("/admin/events", "Events endpoint"), 
        ("/certificates", "Certificates endpoint"),
        ("/admin/super-admin/dashboard-stats", "Dashboard stats endpoint"),
        ("/admin/activity-logs?limit=100&days=30", "Activity logs endpoint"),
        ("/admin/tamper-logs?limit=100&days=30", "Tamper logs endpoint"),
        ("/admin/notification-history?limit=100&days=30", "Notification history endpoint"),
    ]
    
    results = []
    for endpoint, description in endpoints:
        result = test_endpoint(endpoint, description)
        results.append((endpoint, result))
    
    print("\n" + "=" * 50)
    print("📊 Test Results Summary")
    print("=" * 50)
    
    passed = 0
    for endpoint, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{endpoint}: {status}")
        if result:
            passed += 1
    
    print(f"\nPassed: {passed}/{len(results)}")
    
    if passed < len(results):
        print("\n💡 Note: Some endpoints may require authentication.")
        print("   The frontend should handle authentication properly.")

if __name__ == "__main__":
    main()
