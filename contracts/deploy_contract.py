#!/usr/bin/env python3
"""
Blockchain Smart Contract Deployment Script
Deploys the CertificateRegistry smart contract to Ethereum network
"""

import asyncio
import json
import os
import sys
from pathlib import Path
from web3 import Web3
from eth_account import Account
from solcx import compile_source, install_solc
import logging

# Add backend to path for imports
backend_path = Path(__file__).parent.parent / "backend"
sys.path.insert(0, str(backend_path))

try:
    from app.core.config import settings
except ImportError:
    # Try importing directly if running as a script
    import importlib.util
    config_path = backend_path / "app" / "core" / "config.py"
    spec = importlib.util.spec_from_file_location("settings", config_path)
    config_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(config_module)
    settings = config_module.settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ContractDeployer:
    def __init__(self):
        """Initialize Web3 connection and deployment configuration"""
        self.w3 = None
        self.account = None
        self.contract_source = None
        self.compiled_contract = None
        
        self.setup_web3()
        self.setup_account()
    
    def setup_web3(self):
        """Setup Web3 connection"""
        try:
            # Use RPC URL from settings
            rpc_url = settings.ethereum_rpc_url
            logger.info(f"Connecting to Ethereum network: {rpc_url}")
            
            self.w3 = Web3(Web3.HTTPProvider(rpc_url))
            
            if self.w3.is_connected():
                logger.info("✅ Successfully connected to Ethereum network")
                chain_id = self.w3.eth.chain_id
                logger.info(f"Chain ID: {chain_id}")
                
                # Get latest block to verify connection
                latest_block = self.w3.eth.get_block('latest')
                logger.info(f"Latest block: {latest_block.number}")
            else:
                raise Exception("Failed to connect to Ethereum network")
                
        except Exception as e:
            logger.error(f"❌ Web3 connection failed: {e}")
            raise
    
    def setup_account(self):
        """Setup deployment account"""
        try:
            private_key = settings.private_key
            
            # Validate private key
            if not private_key or private_key == "your-ethereum-private-key":
                logger.error("❌ Invalid private key in settings")
                logger.info("Please set a valid Ethereum private key in your .env file")
                raise Exception("Invalid private key")
            
            # Remove 0x prefix if present
            if private_key.startswith('0x'):
                private_key = private_key[2:]
            
            # Validate key length
            if len(private_key) != 64:
                raise Exception(f"Invalid private key length: {len(private_key)} (expected 64)")
            
            self.account = Account.from_key(private_key)
            logger.info(f"✅ Deployment account: {self.account.address}")
            
            # Check account balance
            balance = self.w3.eth.get_balance(self.account.address)
            balance_eth = self.w3.from_wei(balance, 'ether')
            logger.info(f"Account balance: {balance_eth:.6f} ETH")
            
            if balance_eth < 0.001:  # Minimum for deployment
                logger.warning("⚠️  Low account balance. Deployment may fail.")
            
        except Exception as e:
            logger.error(f"❌ Account setup failed: {e}")
            raise
    
    def load_contract_source(self):
        """Load and compile Solidity contract"""
        try:
            contracts_dir = Path(__file__).parent
            contract_path = contracts_dir / "CertificateRegistry.sol"
            
            if not contract_path.exists():
                raise Exception(f"Contract file not found: {contract_path}")
            
            logger.info("📄 Loading contract source...")
            with open(contract_path, 'r') as f:
                self.contract_source = f.read()
            
            logger.info("✅ Contract source loaded successfully")
            
        except Exception as e:
            logger.error(f"❌ Failed to load contract source: {e}")
            raise
    
    def compile_contract(self):
        """Compile Solidity contract"""
        try:
            logger.info("🔧 Compiling contract...")
            
            # Install solc if needed
            try:
                install_solc('0.8.19')
            except Exception:
                pass  # May already be installed
            
            # Compile contract
            compiled_sol = compile_source(
                self.contract_source,
                output_values=['abi', 'bin'],
                solc_version='0.8.19'
            )
            
            # Get contract interface
            self.compiled_contract = compiled_sol['<stdin>:CertificateRegistry']
            
            logger.info("✅ Contract compiled successfully")
            
        except Exception as e:
            logger.error(f"❌ Contract compilation failed: {e}")
            logger.info("Make sure you have solc installed: pip install py-solc-x")
            raise
    
    def estimate_gas(self):
        """Estimate gas for contract deployment"""
        try:
            logger.info("⛽ Estimating gas for deployment...")
            
            # Create contract instance
            contract = self.w3.eth.contract(
                abi=self.compiled_contract['abi'],
                bytecode=self.compiled_contract['bin']
            )
            
            # Estimate gas
            constructor = contract.constructor()
            gas_estimate = constructor.estimate_gas()
            
            # Get current gas price
            gas_price = self.w3.eth.gas_price
            
            # Calculate cost
            deployment_cost = gas_estimate * gas_price
            cost_eth = self.w3.from_wei(deployment_cost, 'ether')
            
            logger.info(f"Estimated gas: {gas_estimate:,}")
            logger.info(f"Gas price: {self.w3.from_wei(gas_price, 'gwei'):.2f} Gwei")
            logger.info(f"Estimated cost: {cost_eth:.6f} ETH")
            
            return gas_estimate, gas_price
            
        except Exception as e:
            logger.error(f"❌ Gas estimation failed: {e}")
            raise
    
    def deploy_contract(self):
        """Deploy the smart contract"""
        try:
            logger.info("🚀 Deploying contract...")
            
            # Get gas estimates
            gas_limit, gas_price = self.estimate_gas()
            
            # Add 20% buffer to gas limit
            gas_limit = int(gas_limit * 1.2)
            
            # Create contract instance
            contract = self.w3.eth.contract(
                abi=self.compiled_contract['abi'],
                bytecode=self.compiled_contract['bin']
            )
            
            # Build constructor transaction
            constructor = contract.constructor()
            
            # Get nonce
            nonce = self.w3.eth.get_transaction_count(self.account.address)
            
            # Build transaction
            transaction = constructor.build_transaction({
                'from': self.account.address,
                'nonce': nonce,
                'gas': gas_limit,
                'gasPrice': gas_price,
                'chainId': self.w3.eth.chain_id
            })
            
            # Sign transaction
            signed_txn = self.account.sign_transaction(transaction)
            
            # Send transaction
            logger.info("📤 Sending deployment transaction...")
            tx_hash = self.w3.eth.send_raw_transaction(signed_txn.rawTransaction)
            
            logger.info(f"Transaction hash: {tx_hash.hex()}")
            logger.info("⏳ Waiting for transaction confirmation...")
            
            # Wait for transaction receipt
            tx_receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=300)
            
            if tx_receipt.status == 1:
                logger.info("✅ Contract deployed successfully!")
                logger.info(f"Contract address: {tx_receipt.contractAddress}")
                logger.info(f"Gas used: {tx_receipt.gasUsed:,}")
                logger.info(f"Block number: {tx_receipt.blockNumber}")
                
                return tx_receipt.contractAddress, tx_receipt
            else:
                raise Exception("Transaction failed")
                
        except Exception as e:
            logger.error(f"❌ Contract deployment failed: {e}")
            raise
    
    def save_deployment_info(self, contract_address, tx_receipt):
        """Save deployment information"""
        try:
            logger.info("💾 Saving deployment information...")
            
            deployment_info = {
                "contract_address": contract_address,
                "deployer_address": self.account.address,
                "transaction_hash": tx_receipt.transactionHash.hex(),
                "block_number": tx_receipt.blockNumber,
                "gas_used": tx_receipt.gasUsed,
                "network": {
                    "chain_id": self.w3.eth.chain_id,
                    "rpc_url": settings.ethereum_rpc_url
                },
                "deployment_timestamp": self.w3.eth.get_block(tx_receipt.blockNumber).timestamp,
                "abi": self.compiled_contract['abi']
            }
            
            # Save to contracts directory
            contracts_dir = Path(__file__).parent
            
            # Update JSON file with deployment info
            json_file = contracts_dir / "CertificateRegistry.json"
            with open(json_file, 'r') as f:
                contract_data = json.load(f)
            
            contract_data.update(deployment_info)
            
            with open(json_file, 'w') as f:
                json.dump(contract_data, f, indent=2)
            
            # Save deployment receipt
            receipt_file = contracts_dir / "deployment_receipt.json"
            with open(receipt_file, 'w') as f:
                json.dump(deployment_info, f, indent=2)
            
            logger.info(f"✅ Deployment info saved to {json_file}")
            logger.info(f"✅ Deployment receipt saved to {receipt_file}")
            
        except Exception as e:
            logger.error(f"❌ Failed to save deployment info: {e}")
            raise
    
    def verify_deployment(self, contract_address):
        """Verify the deployed contract"""
        try:
            logger.info("🔍 Verifying deployed contract...")
            
            # Create contract instance
            contract = self.w3.eth.contract(
                address=contract_address,
                abi=self.compiled_contract['abi']
            )
            
            # Test basic functions
            owner = contract.functions.owner().call()
            total_certs = contract.functions.getTotalCertificates().call()
            is_authorized = contract.functions.isAuthorizedIssuer(self.account.address).call()
            
            logger.info(f"Contract owner: {owner}")
            logger.info(f"Total certificates: {total_certs}")
            logger.info(f"Deployer is authorized issuer: {is_authorized}")
            
            if owner.lower() == self.account.address.lower():
                logger.info("✅ Contract verification successful!")
                return True
            else:
                logger.error("❌ Contract verification failed!")
                return False
                
        except Exception as e:
            logger.error(f"❌ Contract verification failed: {e}")
            return False
    
    async def deploy(self):
        """Main deployment process"""
        try:
            logger.info("🏗️  Starting contract deployment process...")
            
            # Load and compile contract
            self.load_contract_source()
            self.compile_contract()
            
            # Deploy contract
            contract_address, tx_receipt = self.deploy_contract()
            
            # Save deployment info
            self.save_deployment_info(contract_address, tx_receipt)
            
            # Verify deployment
            if self.verify_deployment(contract_address):
                logger.info("🎉 Deployment completed successfully!")
                logger.info(f"📋 Contract Address: {contract_address}")
                logger.info(f"🔗 View on Etherscan: https://sepolia.etherscan.io/address/{contract_address}")
                
                # Update environment variable suggestion
                logger.info("📝 Add this to your .env file:")
                logger.info(f"CONTRACT_ADDRESS={contract_address}")
                
                return contract_address
            else:
                raise Exception("Deployment verification failed")
                
        except Exception as e:
            logger.error(f"❌ Deployment failed: {e}")
            raise

def main():
    """Main function"""
    try:
        logger.info("🚀 Certificate Registry Smart Contract Deployment")
        logger.info("=" * 60)
        
        # Create deployer
        deployer = ContractDeployer()
        
        # Run deployment
        contract_address = asyncio.run(deployer.deploy())
        
        logger.info("=" * 60)
        logger.info("🎉 DEPLOYMENT SUCCESSFUL!")
        logger.info(f"Contract Address: {contract_address}")
        logger.info("=" * 60)
        
    except Exception as e:
        logger.error("=" * 60)
        logger.error("❌ DEPLOYMENT FAILED!")
        logger.error(f"Error: {e}")
        logger.error("=" * 60)
        sys.exit(1)

if __name__ == "__main__":
    main()
