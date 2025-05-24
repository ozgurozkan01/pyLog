import sqlite3

DATABASE_NAME = "logs_db.db"

def insert_log_to_db(log_data):

    conn = sqlite3.connect(DATABASE_NAME)
    cursor = conn.cursor()
  
    try:
        cursor.execute('''
            INSERT INTO logs ( timestamp, hostname, syslog_identifier, pid, uid, gid, message, facility, priority, transport, source_ip, raw_log ) 
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', 
        (
            log_data.get('timestamp', ''),
            log_data.get('_HOSTNAME'),
            log_data.get('syslog_identifier'),
            log_data.get('_PID'),
            log_data.get('_UID'),
            log_data.get('_GID'),
            log_data.get('message'),
            log_data.get('SYSLOG_FACILITY'),
            log_data.get('PRIORITY'),
            log_data.get('_TRANSPORT'),
            log_data.get('source_ip'),
            log_data.get('raw_log')
        )
        )
        
        conn.commit()
    
    except sqlite3.Error as e:
        print(f"[ERROR] Failed to insert log into database: {e}")
    finally:
        conn.close()