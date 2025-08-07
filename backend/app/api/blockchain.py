from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import Dict, Any, Optional
import logging

from app.core.database import get_db
from app.core.auth import get_current_approved_user, require_admin
from app.models.database import User as UserModel
from app.services.blockchain import blockchain_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/blockchain", tags=["Blockchain"])

@router.get("/status")
async def get_blockchain_status():
    """Get blockchain connection status and network information"""
    try:
        status_info = {
            "connected": blockchain_service.is_connected(),
            "enabled": blockchain_service.enabled,
            "network": "sepolia" if blockchain_service.enabled else "disabled",
            "account_address": blockchain_service.account.address if blockchain_service.account else None,
            "balance": blockchain_service.get_balance() if blockchain_service.enabled else 0.0,
            "contract_address": blockchain_service.contract_address if blockchain_service.enabled else None,
            "contract_deployed": bool(blockchain_service.contract) if blockchain_service.enabled else False
        }
        
        return {
            "success": True,
            "data": status_info,
            "message": "Blockchain status retrieved successfully"
        }
        
    except Exception as e:
        logger.error(f"Error getting blockchain status: {e}")
        return {
            "success": False,
            "data": {
                "connected": False,
                "enabled": False,
                "error": str(e)
            },
            "message": "Failed to get blockchain status"
        }

@router.get("/network-info")
async def get_network_info():
    """Get detailed network information"""
    try:
        if not blockchain_service.enabled:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Blockchain service is not enabled"
            )
        
        if not blockchain_service.is_connected():
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Not connected to blockchain network"
            )
        
        # Get network information
        latest_block = blockchain_service.w3.eth.block_number
        network_id = blockchain_service.w3.eth.chain_id
        gas_price = blockchain_service.w3.eth.gas_price
        
        return {
            "success": True,
            "data": {
                "network_id": network_id,
                "latest_block": latest_block,
                "gas_price_wei": gas_price,
                "gas_price_gwei": blockchain_service.w3.from_wei(gas_price, 'gwei'),
                "node_version": blockchain_service.w3.client_version
            },
            "message": "Network information retrieved successfully"
        }
        
    except Exception as e:
        logger.error(f"Error getting network info: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get network information: {str(e)}"
        )

@router.post("/verify/{certificate_id}")
async def verify_certificate_on_blockchain(
    certificate_id: str,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_approved_user)
):
    """Verify a certificate hash on the blockchain"""
    try:
        if not blockchain_service.enabled or not blockchain_service.contract:
            return {
                "success": False,
                "verified": False,
                "message": "Blockchain verification not available - service disabled",
                "details": {
                    "certificate_id": certificate_id,
                    "blockchain_enabled": False
                }
            }
        
        # Get certificate from database
        from app.models.database import Certificate as CertificateModel
        certificate = db.query(CertificateModel).filter(
            CertificateModel.certificate_id == certificate_id
        ).first()
        
        if not certificate:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Certificate not found"
            )
        
        # Verify on blockchain
        try:
            # Check if certificate exists on blockchain
            blockchain_cert = blockchain_service.contract.functions.getCertificate(certificate_id).call()
            
            if blockchain_cert and blockchain_cert[0] != b'\x00' * 32:  # Check if hash is not empty
                # Verify hash matches
                stored_hash = blockchain_cert[0].hex()
                db_hash = certificate.sha256_hash
                
                hash_matches = stored_hash.lower() == db_hash.lower() if db_hash else False
                is_revoked = blockchain_cert[3]  # isRevoked field
                
                return {
                    "success": True,
                    "verified": hash_matches and not is_revoked,
                    "message": "Certificate verified on blockchain" if hash_matches and not is_revoked else "Certificate verification failed",
                    "details": {
                        "certificate_id": certificate_id,
                        "blockchain_hash": stored_hash,
                        "database_hash": db_hash,
                        "hash_matches": hash_matches,
                        "is_revoked": is_revoked,
                        "issuer": blockchain_cert[1],
                        "timestamp": blockchain_cert[2]
                    }
                }
            else:
                return {
                    "success": False,
                    "verified": False,
                    "message": "Certificate not found on blockchain",
                    "details": {
                        "certificate_id": certificate_id,
                        "blockchain_enabled": True
                    }
                }
                
        except Exception as contract_error:
            logger.warning(f"Contract call failed: {contract_error}")
            return {
                "success": False,
                "verified": False,
                "message": "Blockchain contract call failed",
                "details": {
                    "certificate_id": certificate_id,
                    "error": str(contract_error)
                }
            }
        
    except Exception as e:
        logger.error(f"Error verifying certificate on blockchain: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Blockchain verification failed: {str(e)}"
        )

@router.get("/contract/statistics")
async def get_contract_statistics(
    current_user: UserModel = Depends(require_admin)
):
    """Get smart contract statistics (Admin only)"""
    try:
        if not blockchain_service.enabled or not blockchain_service.contract:
            return {
                "success": False,
                "message": "Blockchain service not available",
                "data": {
                    "total_certificates": 0,
                    "total_revoked": 0,
                    "active_certificates": 0,
                    "total_issuers": 0,
                    "contract_enabled": False
                }
            }
        
        # Get statistics from smart contract
        stats = blockchain_service.contract.functions.getStatistics().call()
        
        return {
            "success": True,
            "message": "Contract statistics retrieved successfully",
            "data": {
                "total_certificates": stats[0],
                "total_revoked": stats[1], 
                "active_certificates": stats[2],
                "total_issuers": stats[3],
                "contract_enabled": True,
                "contract_address": blockchain_service.contract_address
            }
        }
        
    except Exception as e:
        logger.error(f"Error getting contract statistics: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get contract statistics: {str(e)}"
        )

@router.post("/store-hash")
async def store_certificate_hash(
    certificate_id: str,
    hash_value: str,
    current_user: UserModel = Depends(require_admin)
):
    """Manually store a certificate hash on blockchain (Admin only)"""
    try:
        if not blockchain_service.enabled:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Blockchain service is not enabled"
            )
        
        # Store hash on blockchain
        result = blockchain_service.store_certificate_hash(certificate_id, hash_value)
        
        if result:
            return {
                "success": True,
                "message": "Certificate hash stored on blockchain successfully",
                "data": result
            }
        else:
            return {
                "success": False,
                "message": "Failed to store certificate hash on blockchain",
                "data": None
            }
        
    except Exception as e:
        logger.error(f"Error storing certificate hash: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to store certificate hash: {str(e)}"
        )

@router.get("/transactions/{certificate_id}")
async def get_certificate_transactions(
    certificate_id: str,
    current_user: UserModel = Depends(get_current_approved_user)
):
    """Get blockchain transactions for a specific certificate"""
    try:
        if not blockchain_service.enabled or not blockchain_service.contract:
            return {
                "success": False,
                "message": "Blockchain service not available",
                "transactions": []
            }
        
        # This would typically query blockchain events/logs
        # For now, return basic transaction info if available
        transactions = []
        
        try:
            # Get certificate from blockchain
            blockchain_cert = blockchain_service.contract.functions.getCertificate(certificate_id).call()
            
            if blockchain_cert and blockchain_cert[0] != b'\x00' * 32:
                transactions.append({
                    "type": "store",
                    "certificate_id": certificate_id,
                    "hash": blockchain_cert[0].hex(),
                    "issuer": blockchain_cert[1],
                    "timestamp": blockchain_cert[2],
                    "is_revoked": blockchain_cert[3]
                })
        except Exception as e:
            logger.warning(f"Could not retrieve certificate transactions: {e}")
        
        return {
            "success": True,
            "message": "Certificate transactions retrieved",
            "transactions": transactions
        }
        
    except Exception as e:
        logger.error(f"Error getting certificate transactions: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get certificate transactions: {str(e)}"
        )
