#!/usr/bin/env python3
"""
Blockchain Configuration Setup Script
This script helps configure the blockchain integration for the certificate system.
"""

import os
import json
from pathlib import Path
from web3 import Web3
from eth_account import Account
import requests

def print_banner():
    print("=" * 60)
    print("🔗 BLOCKCHAIN CONFIGURATION SETUP")
    print("=" * 60)
    print("This script will help you configure blockchain integration")
    print("for the secure certificate system.\n")

def generate_account():
    """Generate a new Ethereum account"""
    print("🔐 Generating new Ethereum account...")
    account = Account.create()
    print(f"✅ Account generated:")
    print(f"   Address: {account.address}")
    print(f"   Private Key: {account.key.hex()}")
    print(f"   ⚠️  SAVE THIS PRIVATE KEY SECURELY! ⚠️")
    return account

def get_test_eth_info():
    """Provide information about getting test ETH"""
    print("\n💰 GETTING TEST ETH (Sepolia Network)")
    print("=" * 40)
    print("To use blockchain features, you need test ETH on Sepolia network:")
    print("1. Go to: https://sepoliafaucet.com/")
    print("2. Enter your account address")
    print("3. Request test ETH (you may need to login)")
    print("4. Wait for the transaction to complete")
    print("\nAlternative faucets:")
    print("- https://faucet.sepolia.dev/")
    print("- https://sepolia-faucet.pk910.de/")

def get_infura_info():
    """Provide information about Infura setup"""
    print("\n🌐 INFURA SETUP (RPC Provider)")
    print("=" * 30)
    print("For blockchain connectivity, you need an Infura project:")
    print("1. Go to: https://infura.io/")
    print("2. Sign up/Login to your account")
    print("3. Create a new project")
    print("4. Select 'Web3 API' as the product")
    print("5. Copy your Project ID")
    print("6. Your RPC URL will be: https://sepolia.infura.io/v3/YOUR_PROJECT_ID")

def create_env_file():
    """Create or update .env file with blockchain configuration"""
    print("\n📝 CREATING CONFIGURATION")
    print("=" * 25)
    
    # Get user inputs
    use_blockchain = input("Do you want to enable blockchain features? (y/n): ").lower().strip() == 'y'
    
    if not use_blockchain:
        print("Blockchain features will be disabled.")
        env_content = """# Blockchain Configuration (DISABLED)
ETHEREUM_RPC_URL=https://sepolia.infura.io/v3/your-project-id
PRIVATE_KEY=your-ethereum-private-key
CONTRACT_ADDRESS=
CHAIN_ID=11155111
"""
    else:
        print("\n1. Account Setup:")
        has_account = input("Do you already have an Ethereum account? (y/n): ").lower().strip() == 'y'
        
        if has_account:
            private_key = input("Enter your private key (64 characters, no 0x prefix): ").strip()
            if len(private_key) != 64:
                print("❌ Invalid private key length. Generating new account...")
                account = generate_account()
                private_key = account.key.hex()[2:]  # Remove 0x prefix
            else:
                try:
                    account = Account.from_key(private_key)
                    print(f"✅ Account loaded: {account.address}")
                except:
                    print("❌ Invalid private key. Generating new account...")
                    account = generate_account()
                    private_key = account.key.hex()[2:]  # Remove 0x prefix
        else:
            account = generate_account()
            private_key = account.key.hex()[2:]  # Remove 0x prefix
        
        print("\n2. RPC Provider Setup:")
        has_infura = input("Do you have an Infura project ID? (y/n): ").lower().strip() == 'y'
        
        if has_infura:
            project_id = input("Enter your Infura project ID: ").strip()
            rpc_url = f"https://sepolia.infura.io/v3/{project_id}"
        else:
            rpc_url = "https://sepolia.infura.io/v3/your-project-id"
            get_infura_info()
        
        contract_address = input("\n3. Contract Address (leave empty if not deployed): ").strip()
        
        env_content = f"""# Blockchain Configuration
ETHEREUM_RPC_URL={rpc_url}
PRIVATE_KEY={private_key}
CONTRACT_ADDRESS={contract_address}
CHAIN_ID=11155111
"""
        
        if not has_infura or not contract_address:
            print("\n⚠️  NEXT STEPS REQUIRED:")
            if not has_infura:
                print("- Set up Infura project and update ETHEREUM_RPC_URL")
            if not contract_address:
                print("- Deploy smart contract and update CONTRACT_ADDRESS")
            
        get_test_eth_info()
    
    # Write to .env file
    env_path = Path(__file__).parent / ".env"
    
    # Read existing .env if it exists
    existing_env = ""
    if env_path.exists():
        with open(env_path, 'r') as f:
            existing_env = f.read()
    
    # Update or add blockchain configuration
    lines = existing_env.split('\n')
    new_lines = []
    blockchain_keys = ['ETHEREUM_RPC_URL', 'PRIVATE_KEY', 'CONTRACT_ADDRESS', 'CHAIN_ID']
    
    for line in lines:
        if not any(line.startswith(f"{key}=") for key in blockchain_keys):
            new_lines.append(line)
    
    # Add blockchain configuration
    new_lines.extend(['', '# Blockchain Configuration'])
    new_lines.extend(env_content.strip().split('\n')[1:])  # Skip first comment line
    
    with open(env_path, 'w') as f:
        f.write('\n'.join(new_lines))
    
    print(f"\n✅ Configuration saved to: {env_path}")

def deploy_contract_info():
    """Provide information about deploying the smart contract"""
    print("\n🚀 SMART CONTRACT DEPLOYMENT")
    print("=" * 30)
    print("To deploy the CertificateRegistry smart contract:")
    print("\n1. Install Hardhat or Truffle:")
    print("   npm install -g hardhat")
    print("\n2. Initialize Hardhat project:")
    print("   cd contracts/")
    print("   npx hardhat init")
    print("\n3. Deploy to Sepolia:")
    print("   npx hardhat run scripts/deploy.js --network sepolia")
    print("\n4. Update CONTRACT_ADDRESS in .env file")
    print("\nAlternatively, use Remix IDE:")
    print("1. Go to: https://remix.ethereum.org/")
    print("2. Upload CertificateRegistry.sol")
    print("3. Compile and deploy to Sepolia")
    print("4. Copy the contract address")

def test_connection():
    """Test blockchain connection with current configuration"""
    print("\n🧪 TESTING BLOCKCHAIN CONNECTION")
    print("=" * 30)
    
    try:
        # Try importing blockchain_service from the correct path
        try:
            try:
                from services import blockchain as blockchain_service
            except ModuleNotFoundError:
                from .services import blockchain as blockchain_service
        except ModuleNotFoundError:
            print("  ❌ Error: Could not import 'app.services.blockchain'. Please check that the module exists and the path is correct.")
            return

        print("Blockchain Service Status:")
        print(f"  Enabled: {blockchain_service.enabled}")
        print(f"  Connected: {blockchain_service.is_connected()}")

        if blockchain_service.account:
            print(f"  Account: {blockchain_service.account.address}")
            balance = blockchain_service.get_balance()
            print(f"  Balance: {balance} ETH")

        if blockchain_service.contract:
            print(f"  Contract: {blockchain_service.contract_address}")
            print("  ✅ Smart contract connected")
        else:
            print("  ⚠️  Smart contract not connected")

    except Exception as e:
        print(f"  ❌ Error: {e}")

def main():
    print_banner()
    
    while True:
        print("\nSelect an option:")
        print("1. Generate new Ethereum account")
        print("2. Get Infura setup information")
        print("3. Get test ETH information")
        print("4. Create/update blockchain configuration")
        print("5. Smart contract deployment info")
        print("6. Test blockchain connection")
        print("7. Exit")
        
        choice = input("\nEnter your choice (1-7): ").strip()
        
        if choice == '1':
            generate_account()
        elif choice == '2':
            get_infura_info()
        elif choice == '3':
            get_test_eth_info()
        elif choice == '4':
            create_env_file()
        elif choice == '5':
            deploy_contract_info()
        elif choice == '6':
            test_connection()
        elif choice == '7':
            print("\n👋 Goodbye!")
            break
        else:
            print("❌ Invalid choice. Please try again.")
        
        input("\nPress Enter to continue...")

if __name__ == "__main__":
    main()
