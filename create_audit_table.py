import psycopg2
from db_config import get_database_config

def create_audit_table():
    try:
        # Connect to your local PostgreSQL instance
        config = get_database_config()
        connection = psycopg2.connect(**config)
        cursor = connection.cursor()

        # SQL script to build the distinct audit log types
        create_table_query = """
        CREATE TABLE IF NOT EXISTS audit_logs (
            id SERIAL PRIMARY KEY,
            project_id INT,
            log_type VARCHAR(50) NOT NULL, -- 'public_project', 'workforce', or 'delivery'
            status VARCHAR(20) NOT NULL,    -- 'VERIFIED' or 'FRAUD_DETECTED'
            distance_meters NUMERIC(10, 2),
            checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """
        
        cursor.execute(create_table_query)
        connection.commit()
        print("Successfully created 'audit_logs' table in PostgreSQL!")

    except Exception as error:
        print(f"Error while connecting to PostgreSQL: {error}")
    finally:
        if connection:
            cursor.close()
            connection.close()

if __name__ == "__main__":
    create_audit_table()
        

