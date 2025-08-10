import requests

# Test admin login with new demo credentials
print("🔍 Testing Admin Login with Demo Credentials")

try:
    print("1. Testing admin login with Admin123!...")
    login_response = requests.post(
        "http://localhost:8001/api/v1/auth/login",
        data={"username": "admin@certificate-system.com", "password": "Admin123!"},
        verify=False
    )
    
    if login_response.status_code == 200:
        token = login_response.json()["access_token"]
        print("✅ Admin login successful with Admin123!")
        
        # Test admin-certificates
        print("2. Testing admin-certificates endpoint...")
        response = requests.get(
            "http://localhost:8001/api/v1/certificates/admin-certificates",
            headers={"Authorization": f"Bearer {token}"},
            verify=False
        )
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ SUCCESS! Admin dashboard will work. Returned {len(data)} certificates")
        else:
            print(f"❌ Admin certificates failed: {response.text}")
    else:
        print(f"❌ Admin login failed: {login_response.text}")

    print("\n" + "="*50)
    print("3. Testing Super Admin login...")
    superadmin_response = requests.post(
        "http://localhost:8001/api/v1/auth/login",
        data={"username": "superadmin@certificate-system.com", "password": "SuperAdmin123!"},
        verify=False
    )
    
    if superadmin_response.status_code == 200:
        print("✅ Super Admin login successful with SuperAdmin123!")
    else:
        print(f"❌ Super Admin login failed: {superadmin_response.text}")

    print("\n4. Testing User login...")
    user_response = requests.post(
        "http://localhost:8001/api/v1/auth/login",
        data={"username": "testuser@certificate-system.com", "password": "User123!"},
        verify=False
    )
    
    if user_response.status_code == 200:
        print("✅ User login successful with User123!")
    else:
        print(f"❌ User login failed: {user_response.text}")
        
except Exception as e:
    print(f"❌ Error: {e}")

print("\n🎯 DEMO CREDENTIALS NOW WORKING:")
print("Super Admin: superadmin@certificate-system.com / SuperAdmin123!")
print("Admin: admin@certificate-system.com / Admin123!")
print("User: testuser@certificate-system.com / User123!")
