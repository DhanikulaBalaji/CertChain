"""
Wallet module: stores issued certificates per user and private key reference for DID.

Responsibilities:
- Store private key (in-memory / session for demo; do not persist in DB).
- Provide certificates list for the logged-in user (from DB by recipient_id).
- sign_challenge(challenge) using the user's private key via DID service.

Separation of concerns: wallet handles key storage and signing only;
blockchain/hash logic remains in blockchain and certificate_verification modules.
"""

from typing import Optional, List, Dict, Any

from app.services.did_service import sign_challenge as did_sign_challenge


# In-memory store: user_id -> private_key_pem (for demo; use secure session/HSM in production)
_user_private_keys: Dict[int, str] = {}


def set_private_key(user_id: int, private_key_pem: str) -> None:
    """Store the user's private key in the wallet (e.g. after registration or login with key)."""
    _user_private_keys[user_id] = private_key_pem


def get_private_key(user_id: int) -> Optional[str]:
    """Return the stored private key for the user, or None if not in wallet."""
    return _user_private_keys.get(user_id)


def has_private_key(user_id: int) -> bool:
    """Return True if the wallet has a private key for this user."""
    return user_id in _user_private_keys


def sign_challenge(user_id: int, challenge: str) -> Optional[str]:
    """
    Sign a challenge using the wallet's private key for the given user.

    Args:
        user_id: ID of the user (certificate owner).
        challenge: Challenge string to sign (e.g. UUID).

    Returns:
        Hex-encoded signature string, or None if user has no private key or signing fails.
    """
    private_key_pem = get_private_key(user_id)
    if not private_key_pem:
        return None
    try:
        return did_sign_challenge(private_key_pem, challenge)
    except Exception:
        return None


def get_certificates_for_user(db_session, user_id: int) -> List[Dict[str, Any]]:
    """
    Return list of certificates issued to this user (recipient_id = user_id).
    Keeps wallet responsibility to "store" certificates by querying DB.
    """
    from app.models.database import Certificate

    certs = (
        db_session.query(Certificate)
        .filter(Certificate.recipient_id == user_id)
        .order_by(Certificate.issued_at.desc())
        .all()
    )
    return [
        {
            "id": c.id,
            "certificate_id": c.certificate_id,
            "recipient_name": c.recipient_name,
            "event_id": c.event_id,
            "issued_at": c.issued_at.isoformat() if c.issued_at else None,
            "status": c.status.value if hasattr(c.status, "value") else str(c.status),
        }
        for c in certs
    ]
