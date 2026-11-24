import psycopg2
from psycopg2 import sql
from db_config import get_database_config

def update_schema():
    # Connect using your existing PostgreSQL credentials from environment
    try:
        config = get_database_config()
        conn = psycopg2.connect(**config)
        cursor = conn.cursor()

        print("Checking and updating database schema with provenance tracking...")

        # 1. Create the enum for data origins safely if it doesn't exist
        cursor.execute("""
            DO $$ 
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'data_origin_type') THEN
                    CREATE TYPE data_origin_type AS ENUM (
                        'OFFICIAL_OPEN_DATA_PORTAL',
                        'REGULATORY_REGISTRY',
                        'CROWDSOURCED_TELEMETRY',
                        'JUDICIAL_PUBLIC_RECORD'
                    );
                END IF;
            END $$;
        """)

        # 2. Alter the table to add our safe tracking columns
        # (Using ALTER TABLE with IF NOT EXISTS to prevent crashing if run twice)
        alter_query = """
        ALTER TABLE projects 
            ADD COLUMN IF NOT EXISTS project_type VARCHAR(50) DEFAULT 'Point',
            ADD COLUMN IF NOT EXISTS spatial_geometry JSONB DEFAULT '{}'::jsonb,
            ADD COLUMN IF NOT EXISTS physical_completion_percentage NUMERIC(5, 2) DEFAULT 0.00,
            
            ADD COLUMN IF NOT EXISTS nif_allocated_budget NUMERIC(15, 2) DEFAULT 0.00,
            ADD COLUMN IF NOT EXISTS government_funds_disbursed NUMERIC(15, 2) DEFAULT 0.00,
            ADD COLUMN IF NOT EXISTS financial_data_source data_origin_type DEFAULT 'OFFICIAL_OPEN_DATA_PORTAL',
            ADD COLUMN IF NOT EXISTS financial_data_source_url TEXT,
            ADD COLUMN IF NOT EXISTS financial_last_synced TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

            -- Talent Metrics
            ADD COLUMN IF NOT EXISTS local_subcontractor_percentage NUMERIC(5, 2) DEFAULT 0.00,
            ADD COLUMN IF NOT EXISTS resident_engineer_ebk_no VARCHAR(50),
            ADD COLUMN IF NOT EXISTS regulatory_data_source data_origin_type DEFAULT 'REGULATORY_REGISTRY',
            ADD COLUMN IF NOT EXISTS regulatory_last_synced TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
        """
        
        cursor.execute(alter_query)
        conn.commit()
        print("✅ Database successfully updated with data provenance layers!")

    except Exception as e:
        print(f"❌ Error updating database: {e}")
    finally:
        if conn:
            cursor.close()
            conn.close()

if __name__ == "__main__":
    update_schema()