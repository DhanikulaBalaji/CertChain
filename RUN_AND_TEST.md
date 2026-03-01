# How to Run and Test the Project (including DID features)

## Prerequisites

- **Python 3.8+** (for backend)
- **Node.js 16+** (for frontend, optional if you only test API)
- **pip** and **npm**

---

## How to keep your private key (Blockchain)

- **Where to keep it:** In a **`.env`** file in the **`backend`** folder. The repo already ignores `backend/.env` (see `.gitignore`), so it will not be committed to git.
- **Steps:**
  1. Copy `backend/.env.example` to `backend/.env`.
  2. Set `PRIVATE_KEY` to your **64-character hexadecimal** Ethereum private key (no spaces; `0x` prefix is optional).
     - Example format: `PRIVATE_KEY=ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`
  3. Do **not** commit `backend/.env` or share it. Use it only on your machine or on the server where the app runs.
- **Getting a key:** For development you can use the built-in dev key (leave `PRIVATE_KEY` out of `.env` or leave it invalid and the app will use a default). For a real wallet, generate one with MetaMask or:  
  `python -c "from eth_account import Account; print(Account.create().key.hex())"`
- **Production:** Prefer environment variables set by your host (e.g. Azure Key Vault, AWS Secrets Manager, or your server’s env) instead of a `.env` file on disk.

---

## 1. One-time setup

### 1.1 Backend dependencies

```powershell
cd "Project 1\d-c-g-a-v (4)\d-c-g-a-v\backend"
pip install -r requirements.txt
```

### 1.2 Database: new install vs existing DB

- **New install (no existing database):**  
  Run init_db; it will create all tables (including the new `did_id` and `public_key` columns):

```powershell
cd backend
python init_db.py
```

- **Existing database (you already have certificate_system.db):**  
  Add the new DID columns with the standalone migration:

```powershell
cd backend
python -m migrations.add_user_did_columns_standalone
```

If that fails (e.g. path), run from `backend`:

```powershell
python migrations\add_user_did_columns_standalone.py
```

---

## 2. Run the backend

From the **backend** directory:

```powershell
cd "c:\Users\User\Downloads\Project 1\Project 1\d-c-g-a-v (4)\d-c-g-a-v\backend"
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8001
```

- API: **http://localhost:8001**
- Interactive docs: **http://localhost:8001/docs**
- ReDoc: **http://localhost:8001/redoc**

---

## 3. Run the frontend (optional)

From the project root (folder that contains `frontend` and `backend`):

```powershell
cd "c:\Users\User\Downloads\Project 1\Project 1\d-c-g-a-v (4)\d-c-g-a-v\frontend"
npm install
npm start
```

- App: **http://localhost:3000**

Or use **QUICK_START.bat** from the `d-c-g-a-v (4)\d-c-g-a-v` folder to start both backend and frontend (it runs init_db and then both servers).

---

## 4. Test the updated DID features

### 4.1 Using Swagger UI (easiest)

1. Open **http://localhost:8001/docs**.
2. Follow the steps below in order.

**Step A – Register a new user (gets DID automatically)**

- **POST /auth/register**
- Body (JSON):

```json
{
  "email": "owner@test.com",
  "full_name": "Certificate Owner",
  "password": "TestPass123!",
  "role": "user"
}
```

- Then have an admin/superadmin **approve** this user (e.g. via Admin → User management in the frontend, or your existing approve endpoint).

**Step B – Login as that user**

- **POST /auth/login** (OAuth2 form in Swagger):
  - username: `owner@test.com`
  - password: `TestPass123!`
- Copy the **access_token** from the response.

**Step C – Authorize in Swagger**

- Click **Authorize**, paste: `Bearer <your_access_token>`, then Authorize.

**Step D – Create an event and issue a certificate (as admin)**

- Login as admin (e.g. `admin@certificate-system.com` / `Admin123!`), get token, Authorize.
- Create an event (if needed) and generate a certificate for **owner@test.com** (or the user you registered), making sure the certificate’s **recipient** is that user (so `recipient_id` is set to the new user’s ID).
- Note the **certificate_id** (e.g. `CERT-XXXXXXXXXXXX`).

**Step E – Verify certificate (hash + DID challenge)**

- As the **certificate owner** (owner@test.com), call:
  - **POST /api/v1/certificates/verify-comprehensive**
  - Body:

```json
{
  "certificate_id": "CERT-XXXXXXXXXXXX",
  "verification_type": "id_lookup"
}
```

- Replace `CERT-XXXXXXXXXXXX` with the real certificate_id.
- In the response you should see:
  - `"success": true`
  - `"verification_status": "Authentic"`
  - `"ownership_pending": true`
  - `"challenge": "<some-uuid>"`
- Copy the **challenge** value.

**Step F – Complete ownership verification (server-side wallet)**

- Still as the certificate owner, call:
  - **POST /api/v1/certificates/complete-ownership-verification**
  - Body:

```json
{
  "certificate_id": "CERT-XXXXXXXXXXXX",
  "challenge": "<paste-challenge-from-step-E>"
}
```

- Expected:
  - `"success": true`
  - `"verification_status": "Authentic and Ownership Verified"`

If you use a **client-side wallet** (client holds private key and signs the challenge), use instead:

- **POST /api/v1/certificates/verify-ownership** (no auth)
- Body: `certificate_id`, `challenge`, and `signature` (hex from client).

---

### 4.2 Using curl (backend only)

With backend running:

```powershell
# 1) Register
curl -X POST "http://localhost:8001/auth/register" -H "Content-Type: application/json" -d "{\"email\":\"owner2@test.com\",\"full_name\":\"Owner Two\",\"password\":\"TestPass123!\",\"role\":\"user\"}"

# 2) Login
curl -X POST "http://localhost:8001/auth/login" -H "Content-Type: application/x-www-form-urlencoded" -d "username=owner2@test.com&password=TestPass123!"

# Use the access_token from response as TOKEN below.

# 3) Verify certificate (use a real certificate_id and ensure its recipient is this user)
curl -X POST "http://localhost:8001/api/v1/certificates/verify-comprehensive" -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" -d "{\"certificate_id\":\"CERT-XXXXXXXXXXXX\",\"verification_type\":\"id_lookup\"}"

# 4) Complete ownership (use challenge from step 3 response)
curl -X POST "http://localhost:8001/api/v1/certificates/complete-ownership-verification" -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" -d "{\"certificate_id\":\"CERT-XXXXXXXXXXXX\",\"challenge\":\"CHALLENGE-UUID\"}"
```

---

## 5. Quick test script (Python)

From the **backend** directory you can run:

```powershell
cd backend
python test_did_flow.py
```

(See `test_did_flow.py` for a minimal automated test: register → login → verify → complete ownership.)

---

## 6. Summary of what to check

| Feature | How to check |
|--------|----------------|
| **Backend running** | Open http://localhost:8001/health → `{"status":"healthy"}` |
| **API docs** | Open http://localhost:8001/docs |
| **New user gets DID** | Register user → in DB or `/auth/me` (after login) see `did_id` set |
| **Verify returns challenge** | Verify a cert whose recipient has DID → response has `ownership_pending: true` and `challenge` |
| **Ownership verified** | Call complete-ownership-verification with that cert + challenge → `verification_status": "Authentic and Ownership Verified"` |
| **Ownership failed** | Use wrong user or wrong/expired challenge → `"Authentic but Ownership Failed"` or 400/403 |

---

## 7. Default login credentials (from init_db)

After `python init_db.py`:

| Role        | Email                              | Password      |
|------------|-------------------------------------|---------------|
| Super Admin | superadmin@certificate-system.com   | SuperAdmin123! |
| Admin       | admin@certificate-system.com       | Admin123!      |
| User        | testuser@certificate-system.com    | User123!      |

Note: These seed users do **not** have DID keys unless you run a backfill. For DID tests, use a **newly registered** user (they get DID at registration).

---

## 8. Where to see DID verification

**You can use DID verification even when the blockchain private key is not set.** DID (ownership challenge–response) does not depend on Ethereum or `PRIVATE_KEY` in `.env`. It uses per-user keys created at registration.

- **In the UI (User Dashboard)**  
  1. Log in as a **user** (e.g. a **newly registered** user – they get DID automatically; seed users from init_db do not have DID).  
  2. Go to **Dashboard** (or **User Dashboard** / **/user-dashboard**).  
  3. Verify a certificate (ID, QR scan, or file upload) that **belongs to that user** (certificate’s recipient must be this user so they have `did_id`).  
  4. In the **Verification Results** modal you’ll see:  
     - **Verification status** (e.g. “Authentic”) and, if the cert recipient has DID, an **“Ownership pending”** badge.  
     - A **“DID Ownership Verification”** card with a **“Verify ownership (DID)”** button.  
  5. Click **“Verify ownership (DID)”**.  
  6. The result will show **“Authentic and Ownership Verified”** (or “Authentic but Ownership Failed” if the wallet has no key or verification fails).

- **When the DID section does not appear**  
  - The certificate’s **recipient** must be a **registered user with DID** (registered after DID was added).  
  - The certificate must have been issued with that user’s **email** so `recipient_id` is set.  
  - Seed users (e.g. testuser@certificate-system.com) do not have DID; register a new user and issue a cert to them to test DID.

- **Via API (Swagger)**  
  - **http://localhost:8001/docs** → `POST /api/v1/certificates/verify-comprehensive` (get `challenge` from response) → `POST /api/v1/certificates/complete-ownership-verification` (send `certificate_id` + `challenge`).  
  - Or use `POST /api/v1/certificates/verify-ownership` with `certificate_id`, `challenge`, and `signature` (client-side wallet).
