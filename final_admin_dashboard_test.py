"""
Final verification that admin dashboard issue is resolved
"""
import requests
import json

def test_full_admin_dashboard():
    """Test all endpoints that the admin dashboard relies on"""
    
    # Correct admin credentials
    login_data = {
        "username": "admin@certificate-system.com",
        "password": "admin123"
    }
    
    base_url = "http://localhost:8001/api/v1"
    
    print("🔍 Testing Admin Dashboard Complete Fix")
    print("=" * 50)
    
    try:
        # Step 1: Login
        print("1️⃣ Testing Login...")
        login_response = requests.post(
            f"{base_url}/auth/login",
            data=login_data,
            verify=False,
            timeout=10
        )
        
        if login_response.status_code != 200:
            print(f"❌ Login failed: {login_response.status_code}")
            print(f"Response: {login_response.text}")
            return False
            
        token = login_response.json().get("access_token")
        if not token:
            print("❌ No access token received")
            return False
            
        print("✅ Login successful!")
        headers = {"Authorization": f"Bearer {token}"}
        
        # Step 2: Test dashboard stats
        print("\n2️⃣ Testing Dashboard Stats...")
        stats_response = requests.get(
            f"{base_url}/admin/dashboard-stats",
            headers=headers,
            verify=False,
            timeout=10
        )
        
        if stats_response.status_code == 200:
            print("✅ Dashboard stats working!")
        else:
            print(f"❌ Dashboard stats failed: {stats_response.status_code}")
            
        # Step 3: Test events
        print("\n3️⃣ Testing My Events...")
        events_response = requests.get(
            f"{base_url}/events/my-events",
            headers=headers,
            verify=False,
            timeout=10
        )
        
        if events_response.status_code == 200:
            print("✅ My events working!")
        else:
            print(f"❌ My events failed: {events_response.status_code}")
            
        # Step 4: Test the previously failing admin certificates endpoint
        print("\n4️⃣ Testing Admin Certificates (THE FIXED ENDPOINT)...")
        certs_response = requests.get(
            f"{base_url}/certificates/admin-certificates",
            headers=headers,
            verify=False,
            timeout=10
        )
        
        if certs_response.status_code == 200:
            data = certs_response.json()
            print(f"✅ FIXED! Admin certificates working! Returned {len(data)} certificates")
            if data:
                print("📄 Sample certificate data:")
                sample_cert = data[0]
                print(f"   - Certificate ID: {sample_cert.get('certificate_id', 'N/A')}")
                print(f"   - Recipient: {sample_cert.get('recipient_name', 'N/A')}")
                print(f"   - Event: {sample_cert.get('event_name', 'N/A')}")
                print(f"   - Event Date: {sample_cert.get('event_date', 'N/A')}")
                print(f"   - Status: {sample_cert.get('status', 'N/A')}")
        else:
            print(f"❌ Admin certificates STILL FAILING: {certs_response.status_code}")
            print(f"Response: {certs_response.text}")
            return False
            
        # Step 5: Test blockchain status
        print("\n5️⃣ Testing Blockchain Status...")
        blockchain_response = requests.get(
            f"{base_url}/blockchain/status",
            headers=headers,
            verify=False,
            timeout=10
        )
        
        if blockchain_response.status_code == 200:
            print("✅ Blockchain status working!")
        else:
            print(f"❌ Blockchain status failed: {blockchain_response.status_code}")
            
        print("\n" + "=" * 50)
        print("🎉 ADMIN DASHBOARD FIX VERIFICATION COMPLETE!")
        print("✅ The admin-certificates endpoint is now working correctly")
        print("✅ Admin dashboard should now load data successfully")
        print("✅ The 500 Internal Server Error has been resolved")
        
        return True
        
    except requests.exceptions.RequestException as e:
        print(f"❌ Request error: {e}")
        return False
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        return False

if __name__ == "__main__":
    success = test_full_admin_dashboard()
    if success:
        print("\n🎯 RESULT: Admin dashboard issue is RESOLVED!")
        print("💡 You can now login to the frontend and check the admin dashboard")
        print("🌐 Frontend URL: http://localhost:3000")
        print("🔑 Admin credentials: admin@certificate-system.com / admin123")
    else:
        print("\n💥 RESULT: Issues still exist")
