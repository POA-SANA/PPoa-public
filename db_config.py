import os
from dotenv import load_dotenv

load_dotenv()

def get_database_config():
    required = ("DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD")
    missing = [name for name in required if not os.getenv(name)]
    if missing:
        raise RuntimeError("Missing required database settings: " + ", ".join(missing))
    return {"host": os.environ["DB_HOST"], "port": int(os.environ["DB_PORT"]), "dbname": os.environ["DB_NAME"], "user": os.environ["DB_USER"], "password": os.environ["DB_PASSWORD"]}
