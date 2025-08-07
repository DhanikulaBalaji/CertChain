"""
Security Bypass Module for Development Environment

This module provides utilities to bypass certain security restrictions in development mode.
IMPORTANT: These functions should NEVER be used in production environments!
"""

import os
import ssl
import warnings
import certifi

def enable_insecure_ssl_for_development():
    """
    Disable SSL certificate verification for development environment.
    WARNING: This is extremely insecure and should NEVER be used in production!
    """
    if os.environ.get("ENV") != "production":
        # Create an unverified SSL context for development
        ssl._create_default_https_context = ssl._create_unverified_context
        warnings.warn(
            "SSL certificate verification disabled for development. "
            "DO NOT use this in production!"
        )
        return True
    return False

def get_ssl_context(verify=True):
    """
    Get an SSL context that either verifies certificates (for production)
    or bypasses verification (for development).
    """
    if not verify and os.environ.get("ENV") != "production":
        return ssl._create_unverified_context()
    else:
        return ssl.create_default_context(cafile=certifi.where())
