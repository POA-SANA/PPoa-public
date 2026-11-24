# routers/maps.py
from fastapi import APIRouter
from typing import Dict, Any

router = APIRouter(prefix="/api/maps", tags=["Mapping"])

# CLEANED: Strictly public civic infrastructure projects for oversight
PROJECTS_DB = [
    {
        "id": "site-001",
        "name": "Kangari Modern Market Tarmacking",
        "budget_kes": "45,000,000",
        "status": "Active",
        "coordinates": [36.9614, -0.5121]  # [Longitude, Latitude]
    },
    {
        "id": "site-002",
        "name": "Mukurwe wa Nyagathanga Heritage Borehole",
        "budget_kes": "7,200,000",
        "status": "Pending Verification",
        "coordinates": [37.0125, -0.6042]
    }
]

@router.get("/locations")
async def get_map_locations() -> Dict[str, Any]:
    """
    Formats public infrastructure database records into a standard 
    GeoJSON FeatureCollection for the public accountability map.
    """
    features = []
    for proj in PROJECTS_DB:
        feature = {
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": proj["coordinates"]
            },
            "properties": {
                "id": proj["id"],
                "name": proj["name"],
                "budget": f"KES {proj['budget_kes']}",
                "status": proj["status"]
            }
        }
        features.append(feature)
        
    return {
        "type": "FeatureCollection",
        "features": features
    }