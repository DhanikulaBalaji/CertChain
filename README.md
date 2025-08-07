# 🎓 Secure Blockchain-Based Certificate Generation and Validation Framework

[![GitHub](https://img.shields.io/badge/GitHub-Repository-blue)](https://github.com/pinnamanenipraneeth08/certificate-system)
[![Python](https://img.shields.io/badge/Python-3.8+-green)](https://python.org)
[![React](https://img.shields.io/badge/React-18+-blue)](https://reactjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-4.9+-blue)](https://typescriptlang.org)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

## 🌟 Project Overview
A comprehensive digital certificate management system that leverages blockchain technology for tamper-proof certificate generation, validation, and management with enterprise-grade security and role-based access control.

## ✨ Key Features
- 🔐 **Blockchain-anchored certificates** using Ethereum smart contracts
- 👥 **Role-based access control** (Super-Admin, Admin, User)
- 📄 **PDF certificate generation** with QR codes and digital signatures
- ✅ **Multi-layer validation system** with OCR tamper detection
- 🔍 **Advanced forgery detection** using image analysis
- 📱 **Responsive web interface** with Bootstrap UI
- 📧 **Email notifications** for all certificate operations
- 🔒 **Comprehensive security features** and audit logging
- ⚡ **Real-time updates** and notifications
- 🌐 **RESTful API** with OpenAPI documentation
- 🎯 **Bulk certificate generation** from CSV files
- 📊 **Analytics dashboard** with comprehensive reporting

## 🛠️ Tech Stack
- **Backend**: Python FastAPI with SQLAlchemy ORM
- **Frontend**: React.js with TypeScript and Bootstrap
- **Blockchain**: Ethereum with Web3.py and Solidity smart contracts
- **Database**: SQLite (development) / PostgreSQL (production)
- **PDF Generation**: ReportLab with custom templates
- **OCR & Analysis**: Tesseract + OpenCV for tamper detection
- **QR Codes**: qrcode library with custom validation
- **Authentication**: JWT tokens with role-based permissions

## 🚀 Quick Start

### ⚡ One-Command Setup

```powershell
# Clone and setup everything
git clone https://github.com/yourusername/certificate-system.git
cd certificate-system
python setup.py
```

### 🏃‍♂️ Quick Run

```powershell
# Start the complete system
QUICK_START.bat
```

**Access Points:**
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8001
- **API Documentation**: http://localhost:8001/docs

**Default Admin Credentials:**
- Email: `admin@certificate-system.com`
- Password: `admin123`

### 🐳 Docker Deployment (Production)

```powershell
# Build and start all services
docker-compose build
docker-compose up -d

# Check service status
docker-compose ps

# View logs
docker-compose logs -f
```

## System Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │    │    Backend       │    │   Database      │
│   (React)       │◄──►│   (FastAPI)      │◄──►│   (SQLite)      │
│   Port: 3000    │    │   Port: 8001     │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         │                       ▼                       │
         ▼              ┌──────────────────┐              ▼
┌─────────────────┐    │   Blockchain     │    ┌─────────────────┐
│   File Storage  │    │   (Ethereum)     │    │   Email Service │
│   & Templates   │    │   Smart Contract │    │   (SMTP)        │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Blockchain Integration

### Smart Contract Features
- **Certificate Hash Storage**: Immutable storage of certificate hashes
- **Verification System**: Blockchain-based certificate validation
- **Revocation Management**: Decentralized certificate revocation
- **Multi-Issuer Support**: Role-based issuer authorization
- **Event Logging**: Comprehensive audit trail on blockchain

### Deployment
```powershell
# Deploy to Ethereum testnet
cd contracts
python deploy_contract.py

# Test blockchain integration
python test_blockchain.py
```

## User Roles & Permissions

### Super-Admin
- **Full system control**: All administrative functions
- **User management**: Approve/reject user registrations
- **Certificate revocation**: Revoke any certificate
- **System configuration**: Modify system settings

### Admin
- **Event management**: Create and manage events
- **Certificate generation**: Issue certificates for events
- **Template management**: Create and modify certificate templates
- **Participant management**: Manage event participants

### User
- **Certificate validation**: Validate any certificate
- **Personal dashboard**: View own certificates
- **Event participation**: Register for approved events
- **Certificate download**: Access own certificates

## Security Features

### Implemented Security Measures
- ✅ **JWT Authentication** with role-based access control
- ✅ **Input validation** and SQL injection prevention
- ✅ **XSS protection** with content security policies
- ✅ **Rate limiting** to prevent abuse
- ✅ **CORS policy** configuration
- ✅ **Security headers** implementation
- ✅ **Comprehensive audit logging** for all operations
- ✅ **Password policy** enforcement
- ✅ **Account lockout** protection
- ✅ **Certificate tamper detection** using OCR
- ✅ **Blockchain verification** for certificate integrity

### Audit & Monitoring
- **Real-time security monitoring**
- **Failed authentication tracking**
- **Certificate access logging**
- **Suspicious activity detection**
- **Comprehensive audit trails**

## Development Setup

### Backend Setup
```powershell
cd backend
python -m venv venv
venv\Scripts\activate  # Windows
pip install -r requirements.txt

# Initialize database
python init_db.py

# Start development server
uvicorn main:app --reload --host 0.0.0.0 --port 8001
```

### Frontend Setup
```powershell
cd frontend
npm install
npm start
```

### Blockchain Setup
```powershell
cd contracts
pip install -r requirements.txt

# Configure .env with your Ethereum credentials
# Deploy smart contract
python deploy_contract.py
```

## Project Structure

```
certificate-system/
├── backend/                    # FastAPI backend
│   ├── app/
│   │   ├── api/               # API routes and endpoints
│   │   ├── core/              # Core functionality & config
│   │   ├── models/            # Database models & schemas
│   │   └── services/          # Business logic & services
│   ├── certificates/          # Generated certificate files
│   ├── templates/             # Certificate templates
│   └── uploads/               # File upload storage
├── frontend/                   # React.js frontend
│   ├── src/
│   │   ├── components/        # Reusable React components
│   │   ├── pages/             # Page components
│   │   └── services/          # API services & utilities
│   └── public/                # Static assets
├── contracts/                  # Blockchain smart contracts
│   ├── CertificateRegistry.sol # Main smart contract
│   ├── deploy_contract.py     # Deployment script
│   └── test_blockchain.py     # Integration tests
├── docs/                      # Documentation
├── setup.py                   # Complete system setup
└── start.py                   # Quick start script
```

## Configuration

### Environment Variables (.env)
```env
# Database
DATABASE_URL=sqlite:///./certificate_system.db

# Security
SECRET_KEY=your-super-secret-key-here
ACCESS_TOKEN_EXPIRE_MINUTES=30

# Blockchain (Ethereum Sepolia Testnet)
ETHEREUM_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_PROJECT_ID
PRIVATE_KEY=your_ethereum_private_key_without_0x
CONTRACT_ADDRESS=deployed_contract_address

# Email (Optional)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
MAIL_USERNAME=your-email@gmail.com
MAIL_PASSWORD=your-app-password

# File Storage
CERTIFICATES_DIR=./certificates
TEMPLATES_DIR=./templates
UPLOADS_DIR=./uploads
```

## API Documentation

The system provides comprehensive API documentation:
- **Interactive API docs**: http://localhost:8001/docs
- **ReDoc format**: http://localhost:8001/redoc
- **OpenAPI JSON**: http://localhost:8001/openapi.json

### Key API Endpoints

#### Authentication
- `POST /auth/login` - User login
- `POST /auth/register` - User registration
- `GET /auth/me` - Get current user info

#### Certificates
- `POST /admin/certificates/generate-single` - Generate single certificate
- `POST /admin/certificates/generate-bulk` - Bulk certificate generation
- `POST /certificates/validate` - Validate certificate
- `GET /certificates/download/{id}/pdf` - Download certificate PDF

#### Events
- `POST /events/` - Create new event
- `GET /events/` - List events
- `PUT /events/{id}/approve` - Approve event (admin)

#### Blockchain
- `GET /blockchain/status` - Blockchain connection status
- `POST /blockchain/verify/{certificate_id}` - Blockchain verification

## Production Deployment

### Docker Production Setup
```powershell
# Production build
docker-compose -f docker-compose.prod.yml build

# Deploy with SSL
docker-compose -f docker-compose.prod.yml up -d

# Setup reverse proxy (Nginx)
# Configure SSL certificates
# Setup domain routing
```

### Manual Production Setup
1. **Setup production database** (PostgreSQL recommended)
2. **Configure environment variables** for production
3. **Deploy smart contract** to Ethereum mainnet
4. **Setup SSL certificates** and domain
5. **Configure reverse proxy** (Nginx/Apache)
6. **Setup monitoring** and logging
7. **Configure backup** procedures

## Troubleshooting

### Common Issues

#### Backend won't start
```powershell
# Check Python version
python --version

# Reinstall dependencies
pip install -r requirements.txt

# Check database
python init_db.py
```

#### Frontend build fails
```powershell
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install

# Check Node.js version
node --version
```

#### Blockchain connection fails
```powershell
# Test connection
cd contracts
python test_blockchain.py

# Check configuration
# Verify Infura project ID
# Check private key format
```

## Contributing

### Development Workflow
1. **Fork the repository**
2. **Create feature branch** (`git checkout -b feature/amazing-feature`)
3. **Make changes** and add tests
4. **Run test suite** (`python -m pytest`)
5. **Commit changes** (`git commit -m 'Add amazing feature'`)
6. **Push to branch** (`git push origin feature/amazing-feature`)
7. **Open Pull Request**

### Code Standards
- **Python**: Follow PEP 8 style guide
- **TypeScript**: Use ESLint and Prettier
- **Solidity**: Follow Solidity style guide
- **Git**: Use conventional commit messages

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- **OpenZeppelin** for smart contract libraries
- **FastAPI** for the excellent Python web framework
- **React.js** community for frontend components
- **Ethereum** community for blockchain infrastructure

---

**Made with ❤️ for secure, verifiable digital certificates**
