# Secure Blockchain Certificate System

This project is a full-stack certificate issuance and verification platform with optional blockchain anchoring.

## What It Includes

- `backend/`: FastAPI API, auth, certificate generation/verification, admin flows
- `frontend/`: React + TypeScript web application
- `contracts/`: Solidity contract, deployment script, and blockchain test utilities

## Current Stack

- Backend: FastAPI, SQLAlchemy, JWT auth, OCR/image analysis utilities
- Frontend: React 18, TypeScript, Bootstrap
- Blockchain: Ethereum (Web3.py + Solidity contract)
- Database: SQLite by default (`backend/certificate_system.db`)

## Local Setup

### 1) Backend

```powershell
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
python init_db.py
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8001
```

Backend URLs:

- API: `http://localhost:8001`
- Swagger docs: `http://localhost:8001/docs`
- ReDoc: `http://localhost:8001/redoc`

### 2) Frontend

```powershell
cd frontend
npm install
npm start
```

Frontend URL:

- App: `http://localhost:3000`

## Environment Notes

- Keep secrets in `backend/.env` (never commit this file).
- `PRIVATE_KEY` is required only when you want on-chain writes.
- App still works without blockchain connection for core certificate flows.

## Important API Routes

- Health: `GET /api/v1/health`
- Auth: `POST /api/v1/auth/login`, `POST /api/v1/auth/register`
- Certificate verification: routes under `POST /api/v1/certificates/*`
- System info: `GET /api/v1/system/info`

## Related Docs

- `RUN_AND_TEST.md`: execution and verification steps
- `contracts/README.md`: contract setup and deployment
