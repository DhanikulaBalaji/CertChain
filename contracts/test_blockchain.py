#!/usr/bin/env python3
"""
Blockchain Integration Test Script
Tests the blockchain service functionality with the deployed smart contract
"""

import asyncio
import sys
from pathlib import Path
import logging

# Add backend to path
backend_path = Path(__file__).parent.parent / "backend"
sys.path.append(str(backend_path))

# Ensure the backend path exists and contains the expected modules
if not backend_path.exists():
    raise ImportError(f"Backend path does not exist: {backend_path}")

try:
    from app.services.blockchain import blockchain_service
    from app.core.config import settings
except ModuleNotFoundError:
    # Try importing as a relative import if running as a script
    import importlib.util
    blockchain_spec = importlib.util.spec_from_file_location(
        "blockchain_service",
        backend_path / "app" / "services" / "blockchain.py"
    )
    blockchain_module = importlib.util.module_from_spec(blockchain_spec)
    blockchain_spec.loader.exec_module(blockchain_module)
    blockchain_service = blockchain_module.blockchain_service

    config_spec = importlib.util.spec_from_file_location(
        "settings",
        backend_path / "app" / "core" / "config.py"
    )
    config_module = importlib.util.module_from_spec(config_spec)
    config_spec.loader.exec_module(config_module)
    settings = config_module.settings

import hashlib
import json

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class BlockchainTester:
    def __init__(self):
        self.service = blockchain_service
        self.test_certificate_id = "TEST-CERT-001"
        self.test_hash = hashlib.sha256("Test Certificate Content".encode()).hexdigest()
    
    def test_connection(self):
        """Test blockchain connection"""
        logger.info("🔗 Testing blockchain connection...")
        
        connected = self.service.is_connected()
        if connected:
            logger.info("✅ Blockchain connection successful")
            balance = self.service.get_balance()
            logger.info(f"Account balance: {balance:.6f} ETH")
            return True
        else:
            logger.error("❌ Blockchain connection failed")
            return False
    
    def test_certificate_storage(self):
        """Test certificate hash storage"""
        logger.info("📄 Testing certificate storage...")
        
        try:
            result = self.service.store_certificate_hash(
                self.test_certificate_id,
                self.test_hash
            )
            
            if result:
                logger.info("✅ Certificate stored successfully")
                logger.info(f"Transaction hash: {result.get('transaction_hash')}")
                logger.info(f"Block number: {result.get('block_number')}")
                logger.info(f"Gas used: {result.get('gas_used')}")
                return result
            else:
                logger.error("❌ Certificate storage failed")
                return None
                
        except Exception as e:
            logger.error(f"❌ Certificate storage error: {e}")
            return None
    
    def test_certificate_verification(self):
        """Test certificate hash verification"""
        logger.info("🔍 Testing certificate verification...")
        
        try:
            # Test with correct hash
            is_valid = self.service.verify_certificate_hash(
                self.test_certificate_id,
                self.test_hash
            )
            
            if is_valid:
                logger.info("✅ Certificate verification successful")
            else:
                logger.warning("⚠️  Certificate verification returned False")
            
            # Test with incorrect hash
            wrong_hash = hashlib.sha256("Wrong Content".encode()).hexdigest()
            is_invalid = self.service.verify_certificate_hash(
                self.test_certificate_id,
                wrong_hash
            )
            
            if not is_invalid:
                logger.info("✅ Invalid certificate correctly rejected")
            else:
                logger.error("❌ Invalid certificate incorrectly validated")
            
            return is_valid and not is_invalid
            
        except Exception as e:
            logger.error(f"❌ Certificate verification error: {e}")
            return False
    
    def test_gas_estimation(self):
        """Test gas fee estimation"""
        logger.info("⛽ Testing gas estimation...")
        
        try:
            gas_info = self.service.estimate_gas_fee()
            
            logger.info(f"Gas price: {gas_info['gas_price_gwei']:.2f} Gwei")
            logger.info(f"Estimated cost: {gas_info['estimated_cost_eth']:.6f} ETH")
            
            return True
            
        except Exception as e:
            logger.error(f"❌ Gas estimation error: {e}")
            return False
    
    def test_transaction_details(self, tx_hash):
        """Test transaction details retrieval"""
        if not tx_hash or tx_hash.startswith('local_'):
            logger.info("⏭️  Skipping transaction details test (local storage)")
            return True
        
        logger.info("📊 Testing transaction details retrieval...")
        
        try:
            details = self.service.get_transaction_details(tx_hash)
            
            if details:
                logger.info("✅ Transaction details retrieved successfully")
                logger.info(f"Block number: {details.get('block_number')}")
                logger.info(f"Gas used: {details.get('gas_used')}")
                logger.info(f"Status: {details.get('status')}")
                return True
            else:
                logger.error("❌ Failed to retrieve transaction details")
                return False
                
        except Exception as e:
            logger.error(f"❌ Transaction details error: {e}")
            return False
    
    def display_service_status(self):
        """Display blockchain service status"""
        logger.info("📋 Blockchain Service Status:")
        logger.info(f"  Enabled: {self.service.enabled}")
        logger.info(f"  Connected: {self.service.is_connected()}")
        
        if self.service.account:
            logger.info(f"  Account: {self.service.account.address}")
        
        if self.service.contract_address:
            logger.info(f"  Contract: {self.service.contract_address}")
        else:
            logger.warning("  Contract: Not configured")
        
        logger.info(f"  RPC URL: {settings.ethereum_rpc_url}")
    
    async def run_tests(self):
        """Run all blockchain tests"""
        logger.info("🧪 Starting Blockchain Integration Tests")
        logger.info("=" * 60)
        
        # Display service status
        self.display_service_status()
        logger.info("=" * 60)
        
        test_results = {}
        
        # Test 1: Connection
        test_results['connection'] = self.test_connection()
        
        # Test 2: Gas estimation
        test_results['gas_estimation'] = self.test_gas_estimation()
        
        # Test 3: Certificate storage
        storage_result = self.test_certificate_storage()
        test_results['storage'] = storage_result is not None
        
        # Test 4: Certificate verification
        test_results['verification'] = self.test_certificate_verification()
        
        # Test 5: Transaction details (if we have a real tx hash)
        tx_hash = storage_result.get('transaction_hash') if storage_result else None
        test_results['transaction_details'] = self.test_transaction_details(tx_hash)
        
        # Summary
        logger.info("=" * 60)
        logger.info("📊 TEST RESULTS SUMMARY")
        logger.info("=" * 60)
        
        passed = 0
        total = len(test_results)
        
        for test_name, result in test_results.items():
            status = "✅ PASS" if result else "❌ FAIL"
            logger.info(f"{test_name.replace('_', ' ').title()}: {status}")
            if result:
                passed += 1
        
        logger.info("=" * 60)
        logger.info(f"Tests Passed: {passed}/{total}")
        
        if passed == total:
            logger.info("🎉 All tests passed! Blockchain integration is working correctly.")
        else:
            logger.warning("⚠️  Some tests failed. Check the logs above for details.")
        
        return passed == total

def main():
    """Main function"""
    try:
        logger.info("🔗 Certificate System - Blockchain Integration Test")
        
        # Create tester
        tester = BlockchainTester()
        
        # Run tests
        success = asyncio.run(tester.run_tests())
        
        if success:
            logger.info("✅ All blockchain tests completed successfully!")
            sys.exit(0)
        else:
            logger.error("❌ Some blockchain tests failed!")
            sys.exit(1)
            
    except Exception as e:
        logger.error(f"❌ Test execution failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
