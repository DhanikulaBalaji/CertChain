from web3 import Web3
from eth_account import Account
import json
import os
from typing import Optional, Dict, Any
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)

class BlockchainService:
    def __init__(self):
        """Initialize Web3 connection and account"""
        self.enabled = False
        self.w3 = None
        self.account = None
        self.contract = None
        
        try:
            self.w3 = Web3(Web3.HTTPProvider(settings.ethereum_rpc_url))
            
            # Check if private key is valid (not the default placeholder)
            if settings.private_key and settings.private_key != "your-ethereum-private-key":
                try:
                    # Handle private key with or without 0x prefix
                    private_key = settings.private_key
                    if private_key.startswith('0x'):
                        private_key = private_key[2:]
                    
                    if len(private_key) == 64:
                        self.account = Account.from_key(private_key)
                        self.enabled = True
                        logger.info("Blockchain service initialized with provided private key")
                    else:
                        raise ValueError(f"Invalid private key length: {len(private_key)}")
                except Exception as e:
                    logger.warning(f"Invalid private key provided: {e}")
                    self.account = Account.create()
                    logger.warning("Using generated account for development. Set valid PRIVATE_KEY in production.")
            else:
                # Create a new account for development
                self.account = Account.create()
                logger.warning("Using generated account for development. Set PRIVATE_KEY in production.")
            
            self.contract_address = settings.contract_address
            self.contract_abi = self._load_contract_abi()
            
            if self.contract_address and self.contract_address != "0x0000000000000000000000000000000000000000" and self.contract_abi:
                self.contract = self.w3.eth.contract(
                    address=self.contract_address,
                    abi=self.contract_abi
                )
                logger.info("Smart contract initialized")
            else:
                logger.warning("Smart contract not configured. Blockchain enabled for development without contract.")
                self.contract = None
            
            # Enable blockchain service if we have a valid account and web3 connection
            if self.account and self.w3:
                self.enabled = True
                logger.info("Blockchain service enabled")
                
        except Exception as e:
            logger.error(f"Failed to initialize blockchain service: {e}")
            logger.warning("Blockchain features disabled. System will work without blockchain integration.")

    def _load_contract_abi(self) -> Optional[list]:
        """Load contract ABI from file"""
        try:
            abi_path = os.path.join("contracts", "CertificateRegistry.json")
            if os.path.exists(abi_path):
                with open(abi_path, 'r') as f:
                    contract_data = json.load(f)
                    return contract_data.get('abi')
            return None
        except Exception as e:
            logger.error(f"Error loading contract ABI: {e}")
            return None

    def is_connected(self) -> bool:
        """Check if connected to Ethereum network"""
        try:
            return self.enabled and self.w3 and self.w3.is_connected()
        except Exception as e:
            logger.error(f"Connection check failed: {e}")
            return False

    def get_balance(self) -> float:
        """Get account balance in ETH"""
        try:
            if not self.enabled or not self.account:
                return 0.0
            balance_wei = self.w3.eth.get_balance(self.account.address)
            return self.w3.from_wei(balance_wei, 'ether')
        except Exception as e:
            logger.error(f"Error getting balance: {e}")
            return 0.0

    def store_certificate_hash(self, certificate_id: str, sha256_hash: str) -> Optional[Dict[str, Any]]:
        """Store certificate hash on blockchain"""
        try:
            if not self.enabled or not self.contract:
                logger.warning("Blockchain disabled - certificate stored locally only")
                return {
                    "transaction_hash": f"local_{certificate_id}",
                    "block_number": 0,
                    "gas_used": 0,
                    "certificate_id": certificate_id,
                    "hash": sha256_hash
                }
            
            # Use smart contract method
            nonce = self.w3.eth.get_transaction_count(self.account.address)
            
            # Build transaction
            transaction = self.contract.functions.storeCertificate(
                certificate_id, 
                sha256_hash
            ).build_transaction({
                'from': self.account.address,
                'nonce': nonce,
                'gas': 200000,
                'gasPrice': self.w3.to_wei('20', 'gwei')
            })
            
            # Sign and send transaction
            signed_txn = self.account.sign_transaction(transaction)
            tx_hash = self.w3.eth.send_raw_transaction(signed_txn.rawTransaction)
            
            # Wait for transaction receipt
            receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash)
            
            return {
                'transaction_hash': receipt['transactionHash'].hex(),
                'block_number': receipt['blockNumber'],
                'gas_used': receipt['gasUsed'],
                'status': 'confirmed' if receipt['status'] == 1 else 'failed'
            }
            
        except Exception as e:
            logger.error(f"Error storing certificate hash: {e}")
            return None

    def _store_hash_as_transaction(self, certificate_id: str, sha256_hash: str) -> Optional[Dict[str, Any]]:
        """Fallback method: store hash as transaction data"""
        try:
            nonce = self.w3.eth.get_transaction_count(self.account.address)
            
            # Create transaction data with certificate info
            data = f"CERT:{certificate_id}:HASH:{sha256_hash}"
            
            transaction = {
                'to': self.account.address,  # Send to self
                'value': 0,  # No ETH transfer
                'gas': 21000,
                'gasPrice': self.w3.to_wei('20', 'gwei'),
                'nonce': nonce,
                'data': data.encode().hex()
            }
            
            signed_txn = self.account.sign_transaction(transaction)
            tx_hash = self.w3.eth.send_raw_transaction(signed_txn.rawTransaction)
            receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash)
            
            return {
                'transaction_hash': receipt['transactionHash'].hex(),
                'block_number': receipt['blockNumber'],
                'gas_used': receipt['gasUsed'],
                'status': 'confirmed' if receipt['status'] == 1 else 'failed'
            }
            
        except Exception as e:
            logger.error(f"Error in fallback transaction: {e}")
            return None

    def verify_certificate_hash(self, certificate_id: str, expected_hash: str) -> bool:
        """Verify certificate hash from blockchain"""
        try:
            if not self.contract:
                logger.warning("Contract not available for verification")
                return False
            
            stored_hash = self.contract.functions.getCertificateHash(certificate_id).call()
            return stored_hash.lower() == expected_hash.lower()
            
        except Exception as e:
            logger.error(f"Error verifying certificate hash: {e}")
            return False

    def get_transaction_details(self, tx_hash: str) -> Optional[Dict[str, Any]]:
        """Get transaction details by hash"""
        try:
            transaction = self.w3.eth.get_transaction(tx_hash)
            receipt = self.w3.eth.get_transaction_receipt(tx_hash)
            
            return {
                'hash': transaction['hash'].hex(),
                'block_number': receipt['blockNumber'],
                'gas_used': receipt['gasUsed'],
                'gas_price': transaction['gasPrice'],
                'value': transaction['value'],
                'status': 'confirmed' if receipt['status'] == 1 else 'failed',
                'timestamp': self.w3.eth.get_block(receipt['blockNumber'])['timestamp']
            }
            
        except Exception as e:
            logger.error(f"Error getting transaction details: {e}")
            return None

    def estimate_gas_fee(self) -> Dict[str, Any]:
        """Estimate current gas fees"""
        try:
            gas_price = self.w3.eth.gas_price
            return {
                'gas_price_gwei': self.w3.from_wei(gas_price, 'gwei'),
                'estimated_cost_eth': self.w3.from_wei(gas_price * 200000, 'ether'),  # 200k gas limit
                'estimated_cost_usd': 0  # Would need price oracle
            }
        except Exception as e:
            logger.error(f"Error estimating gas: {e}")
            return {'gas_price_gwei': 20, 'estimated_cost_eth': 0.004, 'estimated_cost_usd': 0}

# Create global blockchain service instance
blockchain_service = BlockchainService()
