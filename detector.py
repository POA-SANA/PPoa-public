import math
import exifread
import psycopg2
from geopy.distance import geodesic
from shapely.geometry import Point, Polygon
from shapely.ops import nearest_points

# Optional: Try loading Ultralytics for YOLO visual verification
try:
    from ultralytics import YOLO
except ImportError:
    YOLO = None

# Import database configuration from environment
from db_config import get_database_config

# ==========================================
# 1. DATABASE COORDINATE INGESTION
# ==========================================

def get_project_coordinates(project_id):
    """Fetches target project coordinates and metadata securely from PostgreSQL."""
    conn = None
    cursor = None
    try:
        config = get_database_config()
        conn = psycopg2.connect(**config)
        cursor = conn.cursor()
        
        # Query for the baseline metrics
        cursor.execute("SELECT target_lat, target_lng, project_name FROM projects WHERE project_id = %s;", (project_id,))
        row = cursor.fetchone()
        
        if row:
            return float(row[0]), float(row[1]), row[2]
        else:
            print(f"⚠️ Project ID {project_id} not found in database.")
            return None
            
    except Exception as e:
        print(f"❌ Database error: {e}")
        return None
    finally:
        if cursor is not None:
            cursor.close()
        if conn is not None:
            conn.close()

# ==========================================
# 2. METADATA TELEMETRY EXTRACTION
# ==========================================

def get_exif_gps(image_path):
    """Extracts Latitude and Longitude from image metadata fields."""
    with open(image_path, 'rb') as f:
        tags = exifread.process_file(f)
        
        if 'GPS GPSLatitude' not in tags or 'GPS GPSLongitude' not in tags:
            return None
            
        def to_decimal(coords, reference):
            if not coords or len(coords.values) < 3:
                return None
                
            d_den = float(coords.values[0].den)
            m_den = float(coords.values[1].den)
            s_den = float(coords.values[2].den)
            
            if d_den == 0 or m_den == 0 or s_den == 0:
                return None

            degrees = float(coords.values[0].num) / d_den
            minutes = float(coords.values[1].num) / m_den
            seconds = float(coords.values[2].num) / s_den

            decimal = degrees + (minutes / 60.0) + (seconds / 3600.0)
            if reference and reference.values in ['S', 'W']:
                decimal = -decimal
            return decimal

        lat = to_decimal(tags['GPS GPSLatitude'], tags['GPS GPSLatitudeRef'])
        lng = to_decimal(tags['GPS GPSLongitude'], tags['GPS GPSLongitudeRef'])
        return (lat, lng)

# ==========================================
# 3. GEOSPATIAL VERIFICATION ENGINES
# ==========================================

def verify_photo_location(project_lat, project_lng, photo_path, max_radius_meters=200):
    """Verifies proximity using a point-radius method via geodesic math."""
    photo_coords = get_exif_gps(photo_path)    
    
    if photo_coords is None or photo_coords[0] is None or photo_coords[1] is None:
        return {"status": "REJECTED", "reason": "No GPS metadata found. Ensure location settings were enabled on the camera."}
    
    project_coords = (project_lat, project_lng)
    distance = geodesic(project_coords, photo_coords).meters
    
    if distance <= max_radius_meters:
        return {
            "status": "VERIFIED",
            "distance_meters": round(distance, 2),
            "photo_coordinates": photo_coords
        }
    else:
        return {
            "status": "FRAUD_DETECTED",
            "reason": f"Photo was taken {round(distance, 2)} meters away from the actual project site.",
            "photo_coordinates": photo_coords
        }

def verify_geospatial_polygon(citizen_lat: float, citizen_lon: float, boundary_coordinates: list) -> dict:
    """
    Advanced verification checking if coordinates fall inside an explicit site bounding shape.
    Used when projects have complex boundary layouts instead of basic point centers.
    """
    if not boundary_coordinates or len(boundary_coordinates) < 3:
        return {"status": "ERROR", "distance_meters": 0, "reason": "Invalid perimeter boundary configuration."}

    citizen_point = Point(citizen_lon, citizen_lat)
    polygon_points = [(coord[1], coord[0]) for coord in boundary_coordinates]
    project_polygon = Polygon(polygon_points)

    if citizen_point.within(project_polygon) or citizen_point.touches(project_polygon):
        return {"status": "VERIFIED", "distance_meters": 0, "reason": "Telemetry aligns perfectly inside layout bounds."}
    
    nearest_geom = nearest_points(project_polygon, citizen_point)[0]
    variance_meters = geodesic((citizen_lat, citizen_lon), (nearest_geom.y, nearest_geom.x)).meters

    return {
        "status": "VARIANCE_OBSERVED",
        "distance_meters": round(variance_meters, 2),
        "reason": f"Telemetry captured {round(variance_meters, 2)} meters outside designated polygon bounds."
    }

# ==========================================
# 4. COMPUTER VISION OBJECT RECOGNITION
# ==========================================

def analyze_image_objects(image_path: str, log_type: str) -> dict:
    """Uses YOLOv8 to verify that physical features match auditing requirements."""
    if YOLO is None:
        return {"status": "SKIPPED", "detected_objects": [], "message": "Ultralytics package not installed."}

    try:
        model = YOLO("yolov8n.pt")
        results = model(image_path)
        
        detected_labels = []
        for r in results:
            for c in r.boxes.cls:
                detected_labels.append(model.names[int(c)])

        if log_type == "workforce" and "person" not in detected_labels:
            return {
                "status": "FLAGGED",
                "detected_objects": detected_labels,
                "message": "Labor presence context selected, but no personnel recognized visually."
            }
            
        if log_type == "delivery" and not any(obj in detected_labels for obj in ["truck", "car", "bench"]):
            return {
                "status": "FLAGGED",
                "detected_objects": detected_labels,
                "message": "Materials infrastructure audit selected, but no supply vehicle structures detected."
            }

        return {
            "status": "PASSED",
            "detected_objects": detected_labels,
            "message": "Visual indicators pass contextual consistency checks."
        }

    except Exception as e:
        return {"status": "ERROR", "detected_objects": [], "message": f"Object classification failure: {str(e)}"}

# ==========================================
# INTEGRATION TESTING CHECK
# ==========================================

if __name__ == "__main__":
    target_project_id = 2
    db_result = get_project_coordinates(target_project_id)
    
    if db_result:
        target_lat, target_lng, project_name = db_result
        print(f"\n--- Running Anti-Fraud Metadata Scan for: {project_name} ---")
        
        photo_path = "test_progress_photo.png" 
        
        # Perform classic point proximity validation
        point_result = verify_photo_location(target_lat, target_lng, photo_path)
        print("📍 Proximity Audit Result:", point_result)
        
        # Perform visual context evaluation
        visual_result = analyze_image_objects(photo_path, log_type="workforce")
        print("👁️ Visual Content Audit Result:", visual_result)