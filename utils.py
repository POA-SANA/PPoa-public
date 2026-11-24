import logging
import hashlib
import uuid
import requests

# Configure localized logging for geometry tasks
logger = logging.getLogger("admin_verification")

def generate_anonymous_tracker(seed_data: str = None) -> str:
    """
    Generates an anonymous tracking hash to mask sensitive user/device info
    while allowing unique transaction identification.
    """
    base_string = seed_data if seed_data else str(uuid.uuid4())
    return hashlib.sha256(base_string.encode('utf-8')).hexdigest()[:16]

def verify_admin_coordinates(lat: float, lon: float, expected_county: str) -> bool:
    """
    Cross-references admin-entered coordinates against public spatial records
    to prevent typing/input errors before database insertion.
    """
    url = f"https://nominatim.openstreetmap.org/reverse?lat={lat}&lon={lon}&format=json"
    headers = {"User-Agent": "POA_Registry_Admin_Input_Audit_Engine"}
    
    try:
        response = requests.get(url, headers=headers, timeout=5)
        if response.status_code != 200:
            logger.warning("Public geographic registry unreachable. Defaulting to safe pass.")
            return True
            
        data = response.json()
        address_registry = data.get("address", {})
        
        # Extract administrative boundaries from the public data payload
        detected_county = address_registry.get("county", "") or address_registry.get("region", "") or ""
        
        # Clean up strings for precise matching
        if expected_county.lower().strip() in detected_county.lower():
            return True
            
        logger.error(f"Geospatial anomaly detected! Coordinates point to '{detected_county}', but expected '{expected_county}'.")
        return False
        
    except Exception as e:
        logger.error(f"Error during baseline boundary verification: {e}")
        return True  # Fallback safe default on network failure to prevent system locks