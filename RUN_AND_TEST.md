# Run and Test Guide

This file contains only the current run/test steps for local development.

## Prerequisites

- Python 3.10+ recommended
- Node.js 16+ recommended
- `pip` and `npm`

## 1) Backend Setup

```powershell
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
python init_db.py
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8001
```

Check backend:

- `http://localhost:8001/health`
- `http://localhost:8001/docs`

## 2) Frontend Setup

```powershell
cd frontend
npm install
npm start
```

Check frontend:

- `http://localhost:3000`

## 3) Basic Functional Test Flow

1. Register a user (`POST /api/v1/auth/register`).
2. Login and copy JWT token (`POST /api/v1/auth/login`).
3. As admin, create event/certificate from admin endpoints.
4. Verify certificate from `/api/v1/certificates/*` endpoints.

## 4) Optional Blockchain Validation

- Configure `PRIVATE_KEY`, `ETHEREUM_RPC_URL`, and `CONTRACT_ADDRESS` in `backend/.env`.
- From `contracts/`, install dependencies and run deployment/testing scripts.
- If blockchain is not configured, API still runs for non-chain features.
