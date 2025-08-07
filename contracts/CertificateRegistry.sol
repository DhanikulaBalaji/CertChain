// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title CertificateRegistry
 * @dev Smart contract for storing and verifying certificate hashes on blockchain
 * @notice This contract provides tamper-proof certificate validation
 */
contract CertificateRegistry is Ownable, ReentrancyGuard {
    
    // Events
    event CertificateStored(
        string indexed certificateId, 
        bytes32 indexed hashValue,
        address indexed issuer,
        uint256 timestamp
    );
    
    event CertificateRevoked(
        string indexed certificateId,
        address indexed revoker,
        string reason,
        uint256 timestamp
    );
    
    event IssuerAdded(address indexed issuer, string name);
    event IssuerRemoved(address indexed issuer);
    
    // Structs
    struct Certificate {
        bytes32 hashValue;
        address issuer;
        uint256 timestamp;
        bool isRevoked;
        string revokeReason;
        uint256 revokedAt;
    }
    
    struct Issuer {
        string name;
        bool isActive;
        uint256 addedAt;
    }
    
    // State variables
    mapping(string => Certificate) public certificates;
    mapping(address => Issuer) public authorizedIssuers;
    mapping(string => bool) public certificateExists;
    
    string[] public allCertificateIds;
    address[] public allIssuers;
    
    uint256 public totalCertificates;
    uint256 public totalRevoked;
    
    // Modifiers
    modifier onlyAuthorizedIssuer() {
        require(authorizedIssuers[msg.sender].isActive, "Not an authorized issuer");
        _;
    }
    
    modifier certificateExistsCheck(string memory certificateId) {
        require(certificateExists[certificateId], "Certificate does not exist");
        _;
    }
    
    modifier certificateNotRevoked(string memory certificateId) {
        require(!certificates[certificateId].isRevoked, "Certificate is revoked");
        _;
    }
    
    constructor() {
        // Add deployer as first authorized issuer
        authorizedIssuers[msg.sender] = Issuer({
            name: "System Admin",
            isActive: true,
            addedAt: block.timestamp
        });
        allIssuers.push(msg.sender);
    }
    
    /**
     * @dev Add a new authorized issuer
     * @param issuer Address of the issuer
     * @param name Name of the issuer organization
     */
    function addIssuer(address issuer, string memory name) external onlyOwner {
        require(issuer != address(0), "Invalid issuer address");
        require(!authorizedIssuers[issuer].isActive, "Issuer already exists");
        require(bytes(name).length > 0, "Name cannot be empty");
        
        authorizedIssuers[issuer] = Issuer({
            name: name,
            isActive: true,
            addedAt: block.timestamp
        });
        
        allIssuers.push(issuer);
        
        emit IssuerAdded(issuer, name);
    }
    
    /**
     * @dev Remove an authorized issuer
     * @param issuer Address of the issuer to remove
     */
    function removeIssuer(address issuer) external onlyOwner {
        require(authorizedIssuers[issuer].isActive, "Issuer does not exist");
        
        authorizedIssuers[issuer].isActive = false;
        
        emit IssuerRemoved(issuer);
    }
    
    /**
     * @dev Store a certificate hash on the blockchain
     * @param certificateId Unique identifier for the certificate
     * @param hashValue SHA256 hash of the certificate
     */
    function storeCertificate(
        string memory certificateId, 
        bytes32 hashValue
    ) external onlyAuthorizedIssuer nonReentrant {
        require(bytes(certificateId).length > 0, "Certificate ID cannot be empty");
        require(hashValue != bytes32(0), "Hash cannot be zero");
        require(!certificateExists[certificateId], "Certificate already exists");
        
        certificates[certificateId] = Certificate({
            hashValue: hashValue,
            issuer: msg.sender,
            timestamp: block.timestamp,
            isRevoked: false,
            revokeReason: "",
            revokedAt: 0
        });
        
        certificateExists[certificateId] = true;
        allCertificateIds.push(certificateId);
        totalCertificates++;
        
        emit CertificateStored(certificateId, hashValue, msg.sender, block.timestamp);
    }
    
    /**
     * @dev Store certificate with string hash (for compatibility)
     * @param certificateId Unique identifier for the certificate
     * @param hashString SHA256 hash as string
     */
    function storeCertificateString(
        string memory certificateId, 
        string memory hashString
    ) external onlyAuthorizedIssuer {
        bytes32 hashValue = keccak256(abi.encodePacked(hashString));
        storeCertificate(certificateId, hashValue);
    }
    
    /**
     * @dev Get certificate hash by ID
     * @param certificateId The certificate ID to lookup
     * @return The stored hash value
     */
    function getCertificateHash(string memory certificateId) 
        external 
        view 
        certificateExistsCheck(certificateId)
        returns (bytes32) 
    {
        return certificates[certificateId].hashValue;
    }
    
    /**
     * @dev Get complete certificate information
     * @param certificateId The certificate ID to lookup
     * @return Certificate struct with all details
     */
    function getCertificate(string memory certificateId) 
        external 
        view 
        certificateExistsCheck(certificateId)
        returns (Certificate memory) 
    {
        return certificates[certificateId];
    }
    
    /**
     * @dev Verify if a certificate hash matches stored value
     * @param certificateId Certificate ID to verify
     * @param providedHash Hash to verify against stored value
     * @return True if hash matches and certificate is not revoked
     */
    function verifyCertificate(
        string memory certificateId, 
        bytes32 providedHash
    ) external view returns (bool) {
        if (!certificateExists[certificateId]) {
            return false;
        }
        
        Certificate memory cert = certificates[certificateId];
        return cert.hashValue == providedHash && !cert.isRevoked;
    }
    
    /**
     * @dev Verify certificate with string hash
     * @param certificateId Certificate ID to verify
     * @param providedHashString Hash string to verify
     * @return True if hash matches and certificate is not revoked
     */
    function verifyCertificateString(
        string memory certificateId, 
        string memory providedHashString
    ) external view returns (bool) {
        bytes32 providedHash = keccak256(abi.encodePacked(providedHashString));
        return this.verifyCertificate(certificateId, providedHash);
    }
    
    /**
     * @dev Revoke a certificate
     * @param certificateId Certificate ID to revoke
     * @param reason Reason for revocation
     */
    function revokeCertificate(
        string memory certificateId, 
        string memory reason
    ) external certificateExistsCheck(certificateId) certificateNotRevoked(certificateId) {
        Certificate storage cert = certificates[certificateId];
        
        // Only owner or original issuer can revoke
        require(
            msg.sender == owner() || msg.sender == cert.issuer,
            "Not authorized to revoke this certificate"
        );
        
        cert.isRevoked = true;
        cert.revokeReason = reason;
        cert.revokedAt = block.timestamp;
        totalRevoked++;
        
        emit CertificateRevoked(certificateId, msg.sender, reason, block.timestamp);
    }
    
    /**
     * @dev Check if certificate is revoked
     * @param certificateId Certificate ID to check
     * @return True if certificate exists and is revoked
     */
    function isRevoked(string memory certificateId) 
        external 
        view 
        certificateExistsCheck(certificateId)
        returns (bool) 
    {
        return certificates[certificateId].isRevoked;
    }
    
    /**
     * @dev Get revocation details
     * @param certificateId Certificate ID to check
     * @return reason Revocation reason
     * @return revokedAt Timestamp when revoked
     * @return revoker Address who revoked the certificate
     */
    function getRevocationDetails(string memory certificateId) 
        external 
        view 
        certificateExistsCheck(certificateId)
        returns (string memory reason, uint256 revokedAt, address revoker) 
    {
        Certificate memory cert = certificates[certificateId];
        require(cert.isRevoked, "Certificate is not revoked");
        
        return (cert.revokeReason, cert.revokedAt, cert.issuer);
    }
    
    /**
     * @dev Get total number of certificates
     * @return Total certificates stored
     */
    function getTotalCertificates() external view returns (uint256) {
        return totalCertificates;
    }
    
    /**
     * @dev Get total number of revoked certificates
     * @return Total revoked certificates
     */
    function getTotalRevoked() external view returns (uint256) {
        return totalRevoked;
    }
    
    /**
     * @dev Get all certificate IDs (paginated)
     * @param offset Starting index
     * @param limit Maximum number of results
     * @return Array of certificate IDs
     */
    function getCertificateIds(uint256 offset, uint256 limit) 
        external 
        view 
        returns (string[] memory) 
    {
        require(offset < allCertificateIds.length, "Offset out of bounds");
        
        uint256 end = offset + limit;
        if (end > allCertificateIds.length) {
            end = allCertificateIds.length;
        }
        
        string[] memory result = new string[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = allCertificateIds[i];
        }
        
        return result;
    }
    
    /**
     * @dev Get contract statistics
     * @return totalCerts Total certificates
     * @return revokedCerts Total revoked certificates
     * @return activeCerts Active certificates
     * @return totalIssuersCount Total issuers
     */
    function getStatistics() 
        external 
        view 
        returns (
            uint256 totalCerts,
            uint256 revokedCerts, 
            uint256 activeCerts,
            uint256 totalIssuersCount
        ) 
    {
        return (
            totalCertificates,
            totalRevoked,
            totalCertificates - totalRevoked,
            allIssuers.length
        );
    }
    
    /**
     * @dev Check if address is authorized issuer
     * @param issuer Address to check
     * @return True if address is authorized and active
     */
    function isAuthorizedIssuer(address issuer) external view returns (bool) {
        return authorizedIssuers[issuer].isActive;
    }
    
    /**
     * @dev Emergency function to pause contract (if needed in future versions)
     */
    function emergencyStop() external onlyOwner {
        // This could be implemented with OpenZeppelin's Pausable in future versions
        // For now, this is a placeholder for emergency functionality
    }
}
