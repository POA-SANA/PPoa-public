from fastapi import FastAPI, Form, UploadFile, File, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from typing import List
import psycopg2
import shutil
import os

# Import your core metadata scanner and computer vision functions
from detector import verify_photo_location, get_project_coordinates, analyze_image_objects
from privacy_shield import blur_sensitive_data

# Import your modular utilities for geospatial validation and security tracking
from utils import verify_admin_coordinates, generate_anonymous_tracker

# Import database configuration from environment
from db_config import get_database_config

# 1. Import your modular maps router
from routers.maps import router as maps_router

app = FastAPI(title="Project Oversight API")

# Configure CORS so your React frontend can talk to it safely
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. Include the maps router into the central app instance
app.include_router(maps_router)


def get_db_connection():
    config = get_database_config()
    return psycopg2.connect(**config)


def log_verification_result(project_id, log_type, status, distance_meters):
    """Saves the scan result directly into the audit_logs table."""
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        insert_query = """
        INSERT INTO audit_logs (project_id, log_type, status, distance_meters)
        VALUES (%s, %s, %s, %s);
        """
        
        cursor.execute(insert_query, (project_id, log_type, status, distance_meters))
        conn.commit()
        print("-> Verification result safely logged to database.")

    except Exception as error:
        print(f"Failed to write audit log: {error}")
    finally:
        if cursor is not None:
            cursor.close()
        if conn is not None:
            conn.close()


@app.get("/")
def home():
    return {"status": "API is running", "platform": "Geospatial Integrity"}


@app.get("/api/counties")
def get_all_counties():
    """Fetches unique counties sorted alphabetically from the projects database table."""
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT DISTINCT county FROM projects WHERE county IS NOT NULL ORDER BY county ASC;")
        counties = [row[0] for row in cursor.fetchall()]
        return {"counties": counties}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor is not None:
            cursor.close()
        if conn is not None:
            conn.close()


@app.get("/api/projects/{county_name}")
def get_county_projects_with_contractor(county_name: str):
    """Fetches projects with exact database names coupled with contractor profile records."""
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        query = """
            SELECT p.project_id, p.project_name, p.county, p.constituency, p.ward,
                   c.firm_name, c.license_number, c.id
            FROM projects p
            LEFT JOIN contractors c ON p.contractor_id = c.id
            WHERE p.county = %s;
        """
        cursor.execute(query, (county_name,))
        project_rows = cursor.fetchall()
        
        projects_list = []
        for row in project_rows:
            p_id, p_name, county, constituency, ward, firm_name, license_no, contractor_id = row
            
            past_projects = []
            if contractor_id:
                cursor.execute(
                    "SELECT past_project_name, status, completion_year FROM contractor_history WHERE contractor_id = %s;",
                    (contractor_id,)
                )
                past_rows = cursor.fetchall()
                past_projects = [
                    {"name": p[0], "status": p[1], "year": p[2]} for p in past_rows
                ]

            projects_list.append({
                "id": p_id,
                "name": p_name,
                "county": county,
                "constituency": constituency or "Not Specified",
                "ward": ward or "Not Specified",
                "contractor": {
                    "firm_name": firm_name or "Tender details pending publication",
                    "license": license_no or "N/A",
                    "past_portfolio": past_projects
                }
            })
            
        return {"projects": projects_list}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor is not None:
            cursor.close()
        if conn is not None:
            conn.close()


@app.post("/api/admin/projects")
async def create_new_project(
    title: str = Form(...),
    county: str = Form(...),
    latitude: float = Form(...),
    longitude: float = Form(...)
):
    """
    Admin registration endpoint. Intercepts proposed coordinate mappings and runs 
    a validation check against public registries before system record insertion.
    """
    if not verify_admin_coordinates(latitude, longitude, county):
        raise HTTPException(
            status_code=400,
            detail=f"Geospatial discrepancy: The coordinates provided do not map within {county} County boundaries."
        )
    
    # Database save operations would be appended here
    return {"status": "SUCCESS", "detail": "Administrative project registry completed clean."}


@app.post("/api/verify")
async def verify_upload(
    request: Request,
    project_id: int = Form(...),
    log_type: str = Form(...),  # 'public_project', 'workforce', or 'delivery'
    files: List[UploadFile] = File(...) 
):
    """
    Selective Ingestion Pipeline endpoint. Validates multi-file uploads individually,
    accepting original geo-matched data streams while dropping coordinate deviations.
    Maintains zero-PII storage patterns via daily rolling tracking salts.
    """
    # 1. Track incoming traffic footprint anonymously (Zero-PII Security Assurance)
    anon_token = generate_anonymous_tracker(request.client.host)
    
    # 2. Fetch target baseline project coordinates once from PostgreSQL database
    db_result = get_project_coordinates(project_id)
    if not db_result:
        raise HTTPException(status_code=404, detail=f"Project ID {project_id} not found in database.")
        
    target_lat, target_lng, project_name = db_result

    results = []
    accepted_count = 0
    rejected_count = 0

    # 3. Process files via an independent structural transaction loop
    for idx, file in enumerate(files):
        # Create unique individual file staging hooks to prevent processing collisions
        temp_file_path = f"temp_{idx}_{file.filename}"
        
        try:
            # Stage A: Cache binary streaming bytes locally
            with open(temp_file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)

            # Stage B: Proximity anti-fraud validation verification via detector.py
            geo_result = verify_photo_location(target_lat, target_lng, temp_file_path)
            
            # Drop processing tracking if metadata yields out-of-bounds metrics
            if not geo_result or geo_result.get("status") != "VERIFIED":
                rejected_count += 1
                results.append({
                    "filename": file.filename,
                    "status": "REJECTED",
                    "reason": "LOCATION_MISMATCH",
                    "detail": "Telemetry metrics indicate the photo was captured out-of-bounds from the target project asset."
                })
                if os.path.exists(temp_file_path):
                    os.remove(temp_file_path)
                continue

            # Stage C: Object extraction computer vision sweep
            visual_result = analyze_image_objects(temp_file_path, log_type=log_type)
            
            # Stage D: Obfuscate sensitive variables locally via privacy_shield.py
            blur_sensitive_data(temp_file_path)    
            
            # Stage E: Log the clean verification metadata safely to PostgreSQL history logbook
            log_verification_result(
                project_id=project_id,
                log_type=log_type,
                status=geo_result['status'],
                distance_meters=geo_result.get('distance_meters', 0.0)
            )

            accepted_count += 1
            results.append({
                "filename": file.filename,
                "status": "VERIFIED",
                "geospatial_audit": geo_result,
                "visual_audit": visual_result
            })

        except Exception as file_error:
            rejected_count += 1
            results.append({
                "filename": file.filename,
                "status": "REJECTED",
                "reason": "PROCESSING_ERROR",
                "detail": f"Internal structural component compilation breakdown: {str(file_error)}"
            })
        finally:
            # Stage F: Persistent runtime file cleanup execution
            if os.path.exists(temp_file_path):
                os.remove(temp_file_path)

    # 4. Return consolidated transactional performance matrix report directly to React front-end
    return {
        "summary": {
            "total_received": len(files),
            "accepted_count": accepted_count,
            "rejected_count": rejected_count,
            "anonymous_session_signature": anon_token[:8]  # Truncated string view safe for frontend debug display
        },
        "results": results
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)