import sqlite3
import os
import logging
import json
import time

DATABASE_NAME = "logs_db.sqlite3" 
OUTPUT_LOG_FILE_FOR_IMPORT = "collected_journal_logs.jsonl" 

db_logger = logging.getLogger(__name__)
if not db_logger.handlers:
    db_handler = logging.StreamHandler()
    db_formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s', datefmt='%Y-%m-%d %H:%M:%S')
    db_handler.setFormatter(db_formatter)
    db_logger.addHandler(db_handler)
    db_logger.setLevel(logging.INFO)

def determine_log_category(priority_value_str):
    category = "INFO" 
    if priority_value_str is not None:
        try:
            priority = int(priority_value_str)
            if priority <= 2: 
                category = "CRITICAL"
            elif priority == 3:  
                category = "ERROR"
            elif priority == 4:  
                category = "WARNING"
        except ValueError:
            db_logger.warning(f"Geçersiz PRIORITY değeri '{priority_value_str}', kategori INFO olarak ayarlandı.")
        except TypeError:
            db_logger.warning(f"PRIORITY değeri sayıya dönüştürülemedi '{priority_value_str}', kategori INFO olarak ayarlandı.")
    return category

def safe_int_convert(value, default=None):
    if value is None:
        return default
    try:
        return int(value)
    except (ValueError, TypeError):
        return default

def setup_database(db_path=DATABASE_NAME):
    conn = None
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp REAL,
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
                raw_log TEXT
            )
        ''')
        conn.commit()
        db_logger.info(f"Database '{db_path}' and table 'logs' ensured/created.")
    except sqlite3.Error as e:
        db_logger.error(f"Database error during setup for '{db_path}': {e}")
    finally:
        if conn:
            conn.close()

def insert_log_to_db(conn, log_data, raw_json_line):
    cursor = conn.cursor()
    db_timestamp = None
    timestamp_usec_str = log_data.get("__REALTIME_TIMESTAMP")
    if timestamp_usec_str:
        try:
            db_timestamp = int(timestamp_usec_str) / 1_000_000.0
        except (ValueError, TypeError):
            db_logger.warning(f"__REALTIME_TIMESTAMP '{timestamp_usec_str}' değeri float'a dönüştürülemedi.")

    priority_str = log_data.get('PRIORITY')
    log_category = determine_log_category(priority_str)

    try:
        cursor.execute('''
            INSERT INTO logs (
                timestamp, hostname, syslog_identifier, pid, uid, gid,
                message, facility, priority, transport, source_ip, raw_log,
                category  -- <<< YENİ KATEGORİ ALANI
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) -- <<< YENİ SORGU İŞARETİ
        ''',
        (
            db_timestamp,
            log_data.get('_HOSTNAME'),
            log_data.get('SYSLOG_IDENTIFIER', log_data.get("_COMM")),
            safe_int_convert(log_data.get('_PID')), 
            safe_int_convert(log_data.get('_UID')),
            safe_int_convert(log_data.get('_GID')),
            log_data.get('MESSAGE'),
            safe_int_convert(log_data.get('SYSLOG_FACILITY')),
            safe_int_convert(priority_str),
            log_data.get('_TRANSPORT'),
            log_data.get('source_ip'),
            raw_json_line,
            log_category  
        ))
    except sqlite3.Error as e:
        db_logger.error(f"Log veritabanına eklenirken hata: {e}. Log verisi (ilk 100 karakter): {str(log_data)[:100]}")
        raise 

def import_jsonl_to_sqlite(jsonl_filepath=OUTPUT_LOG_FILE_FOR_IMPORT, db_path=DATABASE_NAME):
    if not os.path.exists(jsonl_filepath):
        db_logger.error(f"JSONL file not found: {jsonl_filepath}. Cannot import to SQLite.")
        return False

    setup_database(db_path)

    conn = None
    inserted_count = 0
    failed_count = 0
    line_number = 0
    try:
        conn = sqlite3.connect(db_path)
        db_logger.info(f"Starting import from '{jsonl_filepath}' to '{db_path}'.")
        with open(jsonl_filepath, 'r', encoding='utf-8') as f_in:
            for line_number, line_text in enumerate(f_in):
                stripped_line = line_text.strip()
                if not stripped_line:
                    continue

                try:
                    log_entry_dict = json.loads(stripped_line)
                    insert_log_to_db(conn, log_entry_dict, stripped_line)
                    inserted_count += 1
                except json.JSONDecodeError as je:
                    db_logger.warning(f"Skipping line {line_number + 1} in {jsonl_filepath} due to JSON decode error: {je}. Line: {stripped_line[:200]}")
                    failed_count +=1
                except sqlite3.Error:
                    db_logger.warning(f"Skipping line {line_number + 1} due to DB insert error (see previous error).")
                    failed_count += 1
                except Exception as e:
                    db_logger.error(f"Skipping line {line_number + 1} due to unexpected error: {e}. Line: {stripped_line[:200]}", exc_info=False)
                    failed_count +=1

                if (inserted_count + failed_count) % 1000 == 0 and (inserted_count + failed_count) > 0 :
                    conn.commit()
                    db_logger.info(f"Processed {inserted_count + failed_count} lines. Inserted: {inserted_count}, Failed: {failed_count}. Committed to DB.")

        conn.commit() 
        db_logger.info(f"Import finished. Total lines processed: {line_number + 1}. Successfully inserted: {inserted_count}. Failed/skipped: {failed_count}.")
        return True

    except sqlite3.Error as e:
        db_logger.error(f"A database error occurred during batch import to '{db_path}': {e}")
    except IOError as e:
        db_logger.error(f"Could not read from {jsonl_filepath}: {e}")
    except Exception as e:
        db_logger.error(f"An unexpected error occurred during import to '{db_path}': {e}", exc_info=True)
    finally:
        if conn:
            conn.close()
    return False

def print_all_logs_from_db(db_path=DATABASE_NAME):
    conn = None
    try:
        if not os.path.exists(db_path):
            db_logger.error(f"Database file '{db_path}' not found. Cannot print logs.")
            print(f"Error: Database file '{db_path}' not found.")
            return

        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        db_logger.info(f"Fetching all logs from table 'logs' in '{db_path}'...")
        cursor.execute("SELECT * FROM logs ORDER BY id")
        rows = cursor.fetchall()

        if not rows:
            db_logger.info(f"No logs found in the database '{db_path}'.")
            print(f"No logs found in the database: {db_path}")
            return

        column_names = [description[0] for description in cursor.description]
        print(f"\n--- Logs from Database: {db_path} ---")
        print(f"Found {len(rows)} log entries.\n")

        for i, row_data in enumerate(rows):
            print(f"--- Log Entry {i + 1} (ID: {row_data[column_names.index('id')] if 'id' in column_names else 'N/A'}) ---")
            for col_name, value in zip(column_names, row_data):
                if col_name == 'raw_log' and value and len(str(value)) > 150:
                    print(f"  {col_name.upper()}: {str(value)[:150]}... (truncated)")
                else:
                    print(f"  {col_name.upper()}: {value}")
            print("-" * 20)

    except sqlite3.Error as e:
        db_logger.error(f"Database error while trying to print logs from '{db_path}': {e}")
        print(f"Database error: {e}")
    except Exception as e:
        db_logger.error(f"An unexpected error occurred while printing logs from '{db_path}': {e}", exc_info=True)
        print(f"An unexpected error occurred: {e}")
    finally:
        if conn:
            conn.close()
            db_logger.debug(f"Database connection for '{db_path}' closed after printing logs.")

def get_logs_from_db(limit=50, offset=0, filters=None):
    conn = sqlite3.connect(DATABASE_NAME)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    query = "SELECT * FROM logs"
    params = []

    if filters:
        conditions = []
        if filters.get('priority'):
            conditions.append("priority = ?")
            params.append(filters['priority'])
        if filters.get('identifier'):
            conditions.append("(syslog_identifier LIKE ? OR raw_log LIKE ?)") 
            params.append(f"%{filters['identifier']}%")
            params.append(f"%_SYSTEMD_UNIT\":\"{filters['identifier']}%") 
        if filters.get('hostname'):
            conditions.append("hostname LIKE ?")
            params.append(f"%{filters['hostname']}%")
        if filters.get('message'):
            conditions.append("message LIKE ?")
            params.append(f"%{filters['message']}%")
        if filters.get('global_search'):
            search_term = f"%{filters['global_search']}%"
            conditions.append("(message LIKE ? OR syslog_identifier LIKE ? OR hostname LIKE ? OR raw_log LIKE ?)")
            params.extend([search_term, search_term, search_term, search_term])


        if conditions:
            query += " WHERE " + " AND ".join(conditions)

    query += " ORDER BY timestamp DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    cursor.execute(query, tuple(params))
    logs = [dict(row) for row in cursor.fetchall()]

    count_query = "SELECT COUNT(*) FROM logs"
    if filters and conditions:
        count_query += " WHERE " + " AND ".join(conditions[:-2])
        cursor.execute(count_query, tuple(params[:-2]))
    else:
        cursor.execute(count_query)

    total_logs = cursor.fetchone()[0]

    conn.close()
    return logs, total_logs

def get_dashboard_data():
    conn = sqlite3.connect(DATABASE_NAME)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    one_hour_ago_epoch = time.time() - 3600 

    cursor.execute("SELECT COUNT(*) FROM logs WHERE priority <= 3 AND timestamp >= ?", (one_hour_ago_epoch,))
    error_log_count = cursor.fetchone()[0]

    cursor.execute("""
        SELECT COALESCE(syslog_identifier, SUBSTR(SUBSTR(raw_log, INSTR(raw_log, '"_SYSTEMD_UNIT":"') + LENGTH('"_SYSTEMD_UNIT":"')), 1, INSTR(SUBSTR(raw_log, INSTR(raw_log, '"_SYSTEMD_UNIT":"') + LENGTH('"_SYSTEMD_UNIT":"')), '"') -1 ), 'unknown') as identifier,
               COUNT(*) as count
        FROM logs
        GROUP BY identifier
        ORDER BY count DESC
        LIMIT 5
    """)
    log_identifiers = [dict(row) for row in cursor.fetchall()]


    cursor.execute("""
        SELECT priority, COUNT(*) as count
        FROM logs
        GROUP BY priority
        ORDER BY priority ASC
    """)
    logs_by_priority = [dict(row) for row in cursor.fetchall()]

    cursor.execute("""
        SELECT DISTINCT SUBSTR(raw_log, INSTR(raw_log, '"_BOOT_ID":"') + LENGTH('"_BOOT_ID":"'), 32) as boot_id,
               MIN(timestamp) as first_occurrence
        FROM logs
        WHERE raw_log LIKE '%"_BOOT_ID":"%'
        GROUP BY boot_id
        ORDER BY first_occurrence DESC
        LIMIT 3
    """)

    recent_boots = []
    boot_rows = cursor.fetchall()
    for row in boot_rows:
        boot_id_full = row['boot_id']

        if boot_id_full:
             recent_boots.append({
                'boot_id': boot_id_full[:8] + "...",
                'timestamp': row['first_occurrence']
            })


    conn.close()
    return {
        "error_log_count": error_log_count,
        "log_identifiers": log_identifiers,
        "logs_by_priority": logs_by_priority,
        "recent_boots": recent_boots
    }

if __name__ == "__main__":
    db_logger.info(f"DB Manager script started.")
    db_logger.info(f"Ensuring database '{DATABASE_NAME}' is set up...")
    setup_database()

    db_logger.info(f"Attempting to import logs from '{OUTPUT_LOG_FILE_FOR_IMPORT}' to '{DATABASE_NAME}'...")
    import_jsonl_to_sqlite()

    db_logger.info(f"Attempting to print all logs from the database: {DATABASE_NAME}")
    print_all_logs_from_db()
    db_logger.info("DB Manager script finished.")