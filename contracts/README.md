# Contracts Module

This folder contains blockchain-related files used by the certificate platform.

## Files

- `CertificateRegistry.sol`: smart contract source
- `CertificateRegistry.json`: ABI/deployment metadata (if generated)
- `deploy_contract.py`: deploy contract script
- `test_blockchain.py`: blockchain integration test script
- `requirements.txt`: Python dependencies for contract scripts

## Setup

```powershell
cd contracts
pip install -r requirements.txt
```

Configure blockchain values in `backend/.env`:

```env
ETHEREUM_RPC_URL=https://sepolia.infura.io/v3/YOUR_PROJECT_ID
PRIVATE_KEY=your_64_char_hex_private_key
CONTRACT_ADDRESS=0xYourContractAddress
```

## Deploy

```powershell
cd contracts
python deploy_contract.py
```

## Test

```powershell
cd contracts
python test_blockchain.py
```

## Notes

- Keep private keys out of git.
- Use testnets for development.
- Backend works without blockchain, but on-chain verification requires proper env values.
