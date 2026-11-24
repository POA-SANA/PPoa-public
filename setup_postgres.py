import psycopg2
from db_config import get_database_config

try:
    # 1. Connect to your local PostgreSQL server
    config = get_database_config()
    conn = psycopg2.connect(**config)
    conn.autocommit = True
    cursor = conn.cursor()

    # 2. Create the projects table if it doesn't exist
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS projects (
        project_id SERIAL PRIMARY KEY,
        project_name VARCHAR(255) NOT NULL,
        target_lat TEXT NOT NULL,
        target_lng TEXT NOT NULL,
        county VARCHAR(100) NOT NULL
    );
    """)

    # 3. Insert your sample county projects for testing
    sample_projects = [
        ("Ruiru Market Upgrade", "-1.1478", "36.9614", "Kiambu"),
        ("Thika Bypass Repair", "-1.0396", "37.0900", "Kiambu"),
        ("Githurai Drainage System", "-1.1922", "36.9244", "Kiambu")
    ]

    # Clear table before adding to avoid duplicate rows on re-runs
    cursor.execute("TRUNCATE TABLE projects RESTART IDENTITY;")

    for project in sample_projects:
        cursor.execute("""
        INSERT INTO projects (project_name, target_lat, target_lng, county)
        VALUES (%s, %s, %s, %s);
        """, project)

    print("PostgreSQL table 'projects' created and populated successfully!")

except Exception as e:
    print(f"An error occurred: {e}")

finally:
    if 'cursor' in locals(): cursor.close()
    if 'conn' in locals(): conn.close()