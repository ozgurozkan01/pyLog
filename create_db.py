import sqlite3

DATABASE_NAME = "logs_db.sqlite3"

def init_db():
    conn = sqlite3.connect(DATABASE_NAME)
    cursor = conn.cursor()

    # 1. Create table if it doesn't exist - this defines the schema for new databases
    #    or ensures the table exists before we try to alter it.
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            hostname TEXT,
            syslog_identifier TEXT,
            pid INTEGER,
            uid INTEGER,
            gid INTEGER,
            message TEXT,
            facility INTEGER,
            priority INTEGER,
            transport TEXT,
            source_ip TEXT,
            raw_log TEXT,
            category TEXT  -- <<< NEW CATEGORY COLUMN ADDED HERE
        )
    ''')
    # It's good practice to commit after a CREATE TABLE statement
    conn.commit()

    # 2. Check if the 'category' column exists and add it if it's missing
    #    This handles cases where the database was created with an older schema.
    cursor.execute("PRAGMA table_info(logs)")
    columns = [column_info[1] for column_info in cursor.fetchall()]

    if 'category' not in columns:
        try:
            cursor.execute("ALTER TABLE logs ADD COLUMN category TEXT")
            conn.commit()
            print(f"[INFO] Added 'category' column to 'logs' table in '{DATABASE_NAME}'.")
        except sqlite3.Error as e:
            print(f"[ERROR] Failed to add 'category' column to 'logs' table: {e}")
    else:
        print(f"[INFO] 'category' column already exists in 'logs' table.")

    conn.close()
    print(f"[INFO] Database '{DATABASE_NAME}' schema initialization process completed.")

init_db()