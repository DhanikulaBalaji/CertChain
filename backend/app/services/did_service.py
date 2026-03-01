"""
Decentralized Identity (DID) Service Module.

Provides ECDSA-based DID generation and challenge-response verification
for certificate ownership. Uses the cryptography library with ECDSA and SHA256.
"""

import uuid
from typing import Tuple, Optional

from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.backends import default_backend
from cryptography.exceptions import InvalidSignature


def generate_did() -> Tuple[str, str, str]:
    """
    Generate a new DID with ECC (ECDSA) key pair per user.

    Returns:
        Tuple of (did_id, public_key_pem, private_key_pem).
        - did_id: UUID-based identifier (e.g. did:local:uuid)
        - public_key: PEM-encoded EC public key
        - private_key: PEM-encoded EC private key (must not be stored in DB)
    """
    # Generate ECDSA key pair using SECP256R1 (P-256)
    private_key = ec.generate_private_key(ec.SECP256R1(), default_backend())
    public_key = private_key.public_key()

    # Serialize to PEM format
    private_key_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")

    public_key_pem = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("utf-8")

    # UUID-based DID identifier
    did_id = f"did:local:{uuid.uuid4().hex}"

    return did_id, public_key_pem, private_key_pem


def sign_challenge(private_key_pem: str, challenge: str) -> str:
    """
    Sign a challenge string using the holder's private key (ECDSA with SHA256).

    Args:
        private_key_pem: PEM-encoded EC private key string.
        challenge: Challenge string (e.g. UUID or random bytes as string).

    Returns:
        Hex-encoded signature string.

    Raises:
        ValueError: If private_key_pem is invalid or signing fails.
    """
    try:
        private_key = serialization.load_pem_private_key(
            private_key_pem.encode("utf-8"),
            password=None,
            backend=default_backend(),
        )
    except Exception as e:
        raise ValueError(f"Invalid private key PEM: {e}") from e

    if not isinstance(private_key, ec.EllipticCurvePrivateKey):
        raise ValueError("Key is not an EC private key")

    # Sign the challenge bytes using ECDSA with SHA256
    challenge_bytes = challenge.encode("utf-8")
    signature = private_key.sign(challenge_bytes, ec.ECDSA(hashes.SHA256()))

    # Return signature as hex for easy transport
    return signature.hex()


def verify_signature(public_key_pem: str, signature_hex: str, challenge: str) -> bool:
    """
    Verify that a signature was produced by the holder of the given public key
    for the given challenge (ECDSA with SHA256).

    Args:
        public_key_pem: PEM-encoded EC public key string.
        signature_hex: Hex-encoded signature from sign_challenge.
        challenge: Original challenge string that was signed.

    Returns:
        True if the signature is valid, False otherwise.
    """
    try:
        public_key = serialization.load_pem_public_key(
            public_key_pem.encode("utf-8"),
            backend=default_backend(),
        )
    except Exception:
        return False

    if not isinstance(public_key, ec.EllipticCurvePublicKey):
        return False

    try:
        signature_bytes = bytes.fromhex(signature_hex)
    except ValueError:
        return False

    challenge_bytes = challenge.encode("utf-8")

    try:
        public_key.verify(signature_bytes, challenge_bytes, ec.ECDSA(hashes.SHA256()))
        return True
    except InvalidSignature:
        return False
    except Exception:
        return False
