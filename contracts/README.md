# Blockchain Integration for Certificate System

This directory contains the smart contract implementation and deployment scripts for the certificate system's blockchain integration.

## Overview

The blockchain integration provides:
- **Tamper-proof certificate storage** - Certificate hashes are stored on Ethereum blockchain
- **Immutable verification** - Certificates can be verified against blockchain records
- **Decentralized trust** - No single point of failure for certificate validation
- **Transparency** - All certificate operations are recorded on public blockchain

## Files

### Smart Contracts
- `CertificateRegistry.sol` - Main smart contract for certificate management
- `CertificateRegistry.json` - Compiled contract ABI and deployment info

### Deployment & Testing
- `deploy_contract.py` - Script to deploy the smart contract
- `test_blockchain.py` - Integration tests for blockchain functionality
- `requirements.txt` - Python dependencies for blockchain features

## Prerequisites

1. **Python 3.8+** with pip
2. **Ethereum Account** with some ETH for gas fees
3. **Infura Account** (for Ethereum RPC access)
4. **Solidity Compiler** (installed automatically)

## Setup Instructions

### 1. Install Dependencies

```bash
# Install Python dependencies
pip install -r requirements.txt

# Or install individual packages
pip install web3>=6.0.0 py-solc-x>=1.12.0 eth-account>=0.8.0
```

### 2. Configure Environment

Update your `.env` file in the backend directory:

```env
# Ethereum Configuration
ETHEREUM_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_PROJECT_ID
PRIVATE_KEY=your_ethereum_private_key_without_0x_prefix
CONTRACT_ADDRESS=deployed_contract_address_after_deployment
```

**Security Notes:**
- Never commit your private key to version control
- Use testnet (Sepolia) for testing
- Keep your private key secure and backed up

### 3. Get Testnet ETH

For Sepolia testnet:
1. Get your account address from your private key
2. Use a Sepolia faucet to get test ETH:
   - https://sepoliafaucet.com/
   - https://faucet.sepolia.dev/

### 4. Deploy Smart Contract

```bash
# Navigate to contracts directory
cd contracts

# Deploy the contract
python deploy_contract.py
```

The deployment script will:
- Connect to Ethereum network
- Compile the smart contract
- Deploy to the specified network
- Save deployment information
- Update the CONTRACT_ADDRESS in your configuration

### 5. Test Integration

```bash
# Run blockchain integration tests
python test_blockchain.py
```

## Smart Contract Features

### CertificateRegistry Contract

The main contract provides these functions:

#### Certificate Management
- `storeCertificate(certificateId, hashValue)` - Store certificate hash
- `getCertificateHash(certificateId)` - Retrieve stored hash
- `verifyCertificate(certificateId, providedHash)` - Verify certificate
- `revokeCertificate(certificateId, reason)` - Revoke certificate

#### Access Control
- `addIssuer(address, name)` - Add authorized issuer
- `removeIssuer(address)` - Remove issuer authorization
- `isAuthorizedIssuer(address)` - Check authorization status

#### Statistics
- `getTotalCertificates()` - Get total certificate count
- `getTotalRevoked()` - Get revoked certificate count
- `getStatistics()` - Get comprehensive statistics

### Events

The contract emits these events:
- `CertificateStored` - When a certificate is stored
- `CertificateRevoked` - When a certificate is revoked
- `IssuerAdded` - When an issuer is added
- `IssuerRemoved` - When an issuer is removed

## Gas Costs

Estimated gas costs on Sepolia testnet:

| Operation | Gas Used | Cost (ETH @ 20 gwei) |
|-----------|----------|---------------------|
| Deploy Contract | ~2,500,000 | 0.05 ETH |
| Store Certificate | ~100,000 | 0.002 ETH |
| Verify Certificate | ~30,000 | 0.0006 ETH |
| Revoke Certificate | ~80,000 | 0.0016 ETH |

## Network Configuration

### Supported Networks

The system supports these Ethereum networks:

#### Mainnet (Production)
```env
ETHEREUM_RPC_URL=https://mainnet.infura.io/v3/YOUR_PROJECT_ID
```

#### Sepolia Testnet (Recommended for Testing)
```env
ETHEREUM_RPC_URL=https://sepolia.infura.io/v3/YOUR_PROJECT_ID
```

#### Goerli Testnet
```env
ETHEREUM_RPC_URL=https://goerli.infura.io/v3/YOUR_PROJECT_ID
```

#### Local Development (Ganache)
```env
ETHEREUM_RPC_URL=http://127.0.0.1:8545
```

## Troubleshooting

### Common Issues

#### 1. "Insufficient funds for gas"
- Check your account balance
- Get more ETH from a testnet faucet
- Reduce gas price in deployment script

#### 2. "Transaction failed"
- Check network congestion
- Increase gas limit
- Verify contract parameters

#### 3. "Connection failed"
- Check RPC URL
- Verify Infura project ID
- Check network connectivity

#### 4. "Invalid private key"
- Ensure private key is 64 characters (no 0x prefix)
- Verify key format and validity
- Check environment variable loading

### Debug Mode

Enable debug logging:

```python
import logging
logging.basicConfig(level=logging.DEBUG)
```

### Manual Testing

Test blockchain connection manually:

```python
from web3 import Web3
w3 = Web3(Web3.HTTPProvider('https://sepolia.infura.io/v3/YOUR_PROJECT_ID'))
print(f"Connected: {w3.is_connected()}")
print(f"Latest block: {w3.eth.block_number}")
```

## Development

### Contract Development

To modify the smart contract:

1. Edit `CertificateRegistry.sol`
2. Test changes locally
3. Redeploy to testnet
4. Update tests
5. Deploy to production

### Adding New Features

Example: Adding batch certificate storage

```solidity
function storeCertificatesBatch(
    string[] memory certificateIds,
    bytes32[] memory hashes
) external onlyAuthorizedIssuer {
    require(certificateIds.length == hashes.length, "Array length mismatch");
    
    for (uint i = 0; i < certificateIds.length; i++) {
        storeCertificate(certificateIds[i], hashes[i]);
    }
}
```

## Security Considerations

1. **Private Key Management**
   - Never share or commit private keys
   - Use hardware wallets for production
   - Consider multi-sig wallets

2. **Smart Contract Security**
   - All external calls use checks-effects-interactions pattern
   - Reentrancy protection implemented
   - Access control properly implemented

3. **Gas Limit Attacks**
   - All loops have reasonable bounds
   - Gas estimation prevents out-of-gas errors

## Integration with Backend

The blockchain service integrates with the backend through:

```python
from app.services.blockchain import blockchain_service

# Store certificate hash
result = blockchain_service.store_certificate_hash(cert_id, hash_value)

# Verify certificate
is_valid = blockchain_service.verify_certificate_hash(cert_id, hash_value)
```

## Monitoring

Monitor your deployed contract:

1. **Etherscan** - View transactions and contract state
2. **Infura Dashboard** - Monitor API usage
3. **Backend Logs** - Check integration status

## Future Enhancements

Planned improvements:
- [ ] IPFS integration for certificate metadata
- [ ] Multi-chain support (Polygon, BSC)
- [ ] Batch operations for gas optimization
- [ ] Oracle integration for external data
- [ ] NFT-based certificates

## Support

For blockchain-related issues:
1. Check the troubleshooting section
2. Review contract deployment logs
3. Test on Sepolia testnet first
4. Verify gas prices and limits

## License

This smart contract implementation is licensed under MIT License.
