#!/usr/bin/env python3
"""
Test Admin Dashboard API Specifically
"""

import requests
import json

def test_admin_dashboard_specifically():
    """Test the admin dashboard endpoint with authentication"""
    
    base_url = "http://localhost:8001/api/v1"
    
    print("🔍 TESTING ADMIN DASHBOARD SPECIFICALLY")
    print("=" * 50)
    
    # Step 1: Login first
    print("🔐 Step 1: Logging in as admin...")
    
    login_data = {
        "username": "admin@certificate-system.com",
        "password": "Admin123!"
    }
    
    try:
        response = requests.post(f"{base_url}/auth/login", data=login_data)
        print(f"Login Status: {response.status_code}")
        
        if response.status_code == 200:
            login_result = response.json()
            token = login_result.get('access_token')
            print(f"✅ Login successful! Token received.")
            
            # Step 2: Test admin dashboard endpoint
            print(f"\n📊 Step 2: Testing admin dashboard endpoint...")
            
            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            }
            
            dashboard_response = requests.get(f"{base_url}/admin/dashboard-stats", headers=headers)
            print(f"Dashboard Status: {dashboard_response.status_code}")
            
            if dashboard_response.status_code == 200:
                dashboard_data = dashboard_response.json()
                print(f"✅ ADMIN DASHBOARD API WORKING!")
                print(f"📈 Dashboard Data:")
                print(json.dumps(dashboard_data, indent=2))
                
                # Step 3: Test other admin endpoints the frontend might be calling
                print(f"\n🔍 Step 3: Testing EXACT endpoints admin dashboard calls...")
                
                # Test my-events endpoint (admin dashboard calls this)
                my_events_response = requests.get(f"{base_url}/events/my-events", headers=headers)
                print(f"My Events Status: {my_events_response.status_code}")
                if my_events_response.status_code == 200:
                    events_data = my_events_response.json()
                    print(f"✅ My events working: {len(events_data)} events")
                else:
                    print(f"❌ My events failed: {my_events_response.text}")
                
                # Test admin-certificates endpoint (admin dashboard calls this)
                admin_certs_response = requests.get(f"{base_url}/certificates/admin-certificates", headers=headers)
                print(f"Admin Certificates Status: {admin_certs_response.status_code}")
                if admin_certs_response.status_code == 200:
                    certs_data = admin_certs_response.json()
                    print(f"✅ Admin certificates working: {len(certs_data)} certificates")
                else:
                    print(f"❌ Admin certificates failed: {admin_certs_response.text}")
                
                # Test blockchain status (admin dashboard calls this)
                blockchain_response = requests.get(f"{base_url}/blockchain/status", headers=headers)
                print(f"Blockchain Status: {blockchain_response.status_code}")
                if blockchain_response.status_code == 200:
                    blockchain_data = blockchain_response.json()
                    print(f"✅ Blockchain status working")
                else:
                    print(f"❌ Blockchain status failed: {blockchain_response.text}")
                
            else:
                print(f"❌ Admin dashboard failed: {dashboard_response.text}")
                
        else:
            print(f"❌ Login failed: {response.text}")
            
    except Exception as e:
        print(f"❌ Connection error: {str(e)}")
    
    print("\n✅ Admin dashboard specific test completed!")

if __name__ == "__main__":
    test_admin_dashboard_specifically()
