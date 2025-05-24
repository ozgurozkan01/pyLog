import subprocess
import time
import json

JOURNALCTL_INITIAL_SINCE = "5 minutes ago"
JOURNALCTL_POLL_INTERVAL_SECONDS = 5
JOURNALCTL_OUTPUT_FORMAT = "json"

journal_cursor = None

def check_journalctl_availability():
    try:
        subprocess.run(['journalctl', '--version'], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        print("[INFO] systemd journal (journalctl) can be used.")
        return True
    except (FileNotFoundError, subprocess.CalledProcessError):
        print("[WARN] systemd journal (journalctl) could not be found or run.")
        return False

def fetch_journal_logs():
    global journal_cursor

    print(f"[DEBUG] fetch_journal_logs called. Current cursor: {journal_cursor}")
    
    new_logs_found_in_journal = False
    current_call_had_since = False  # checks for “--since” in the command.

    cmd_command = ['journalctl', '--no-pager', '-o', JOURNALCTL_OUTPUT_FORMAT]

    if journal_cursor:
        cmd_command.extend(['--after-cursor', journal_cursor])
    elif JOURNALCTL_INITIAL_SINCE:
        cmd_command.extend(['--since', JOURNALCTL_INITIAL_SINCE])
        print(f"[INFO] journalctl: Fetching logs since '{JOURNALCTL_INITIAL_SINCE}' (cursor not yet available).")
        current_call_had_since = True

    try:
        print(f"[DEBUG] Command to run: {' '.join(cmd_command)}")

        process = subprocess.Popen(cmd_command, 
                                   stdout=subprocess.PIPE,  # Capture standard output
                                   stderr=subprocess.PIPE,  # Catch standard error
                                   text=True,               # Process output as text
                                   encoding='utf-8',        # Use UTF-8 encoding
                                   errors='replace')        # Replace characters on encoding error
        stdout, stderr = process.communicate()              # Wait for the command to finish and get the output

        if process.returncode != 0: # Not 'zero' means error
            print(f"[ERROR] journalctl error (code {process.returncode}): {stderr.strip()}")
            if "Invalid cursor" in stderr:
                print("[WARN] Journal cursor invalid, resetting cursor.")
                journal_cursor = None
            return False

        if stdout:
            lines = stdout.strip().split('\n')
            if lines and lines[0]: # if output is not empty
                new_logs_found_in_journal = True
                last_entry_cursor_in_this_batch = None
                
                print(f"[DEBUG] Number of lines received: {len(lines)}")
                
                for line_number, line_text in enumerate(lines):
                    if not line_text.strip():
                        continue
                    try:
                        if JOURNALCTL_OUTPUT_FORMAT == "json":
                            log_entry = json.loads(line_text)
                            msg = log_entry.get("MESSAGE", "")
                            identifier = log_entry.get("SYSLOG_IDENTIFIER", log_entry.get("_COMM", "unknown_process"))
                            timestamp_usec = log_entry.get("__REALTIME_TIMESTAMP", None)
                            dt_obj_str = ""
                            if timestamp_usec:
                                dt_obj = time.localtime(int(timestamp_usec) / 1000000)
                                dt_obj_str = time.strftime('%Y-%m-%d %H:%M:%S', dt_obj)
                            print(f"[JOURNAL_LOG][{dt_obj_str}][{identifier}] {msg}")
                            if "__CURSOR" in log_entry:
                                last_entry_cursor_in_this_batch = log_entry["__CURSOR"]
                        else:
                            print(f"[JOURNAL_LOG] {line_text.strip()}")
                    except json.JSONDecodeError as je:
                        print(f"[WARN] Journal log line not in JSON format or corrupt (line {line_number+1}): {line_text.strip()} - Error: {je}")
                    except Exception as e:
                        print(f"[WARN] Error processing journal log line (line {line_number+1}): {line_text.strip()} - Error: {e}")

                if JOURNALCTL_OUTPUT_FORMAT == "json" and last_entry_cursor_in_this_batch:
                    journal_cursor = last_entry_cursor_in_this_batch
                    print(f"[DEBUG] New journal cursor SET: {journal_cursor}")
                elif JOURNALCTL_OUTPUT_FORMAT != "json":
                    try:
                        cursor_cmd = ['journalctl', '-n', '0', '--show-cursor']
                        cursor_process = subprocess.run(cursor_cmd, capture_output=True, text=True, check=True)
                        new_cursor_output = cursor_process.stdout.strip()
                        if new_cursor_output.startswith("-- cursor: "):
                            journal_cursor = new_cursor_output.split("-- cursor: ")[1].strip()
                            print(f"[DEBUG] New journal cursor SET (via extra command): {journal_cursor}")
                    except Exception as ce:
                        print(f"[WARN] Error getting new cursor from journalctl (extra command): {ce}")
                elif JOURNALCTL_OUTPUT_FORMAT == "json" and not last_entry_cursor_in_this_batch:
                    if not current_call_had_since :
                        print(f"[DEBUG] Logs in JSON format processed, but no new cursor obtained from this batch. Current cursor ({journal_cursor}) maintained.")
                    else:
                        print(f"[DEBUG] Called with --since, but no cursor obtained from this batch. Cursor ({journal_cursor}) unchanged.")
            else:
                print("[DEBUG] stdout from journalctl is empty after processing. No new logs.")
                new_logs_found_in_journal = False
        else:
            print("[DEBUG] stdout from journalctl is empty. No new logs.")
            new_logs_found_in_journal = False
    except FileNotFoundError:
        print("[ERROR] `journalctl` command not found. Please ensure systemd is installed.")
        return False
    except Exception as e:
        print(f"[ERROR] Error reading journalctl: {e}")
        return False

    print(f"[DEBUG] fetch_journal_logs completed. Next cursor: {journal_cursor}, Logs found in this call: {new_logs_found_in_journal}")
    return new_logs_found_in_journal

def collect_log():
    print("Linux Log Collector Prototype Starting (Journald Only)...")
    print(f"WARNING: This script may require root (sudo) privileges to access the journal.")

    journal_available = check_journalctl_availability()
    if not journal_available:
        print("[FATAL] journalctl is not available. Terminating script.")
        return

    last_journal_check = 0

    try:
        while True:
            something_processed = False
            current_time = time.time()

            if current_time - last_journal_check >= JOURNALCTL_POLL_INTERVAL_SECONDS:
                print(f"\n[DEBUG] Time to check logs. Last check: {last_journal_check:.2f}, Current time: {current_time:.2f}")
                if fetch_journal_logs():
                    something_processed = True
                last_journal_check = current_time

            if not something_processed:
                time_to_next_check = JOURNALCTL_POLL_INTERVAL_SECONDS - (current_time - last_journal_check)
                sleep_duration = max(0.1, time_to_next_check if time_to_next_check > 0 else JOURNALCTL_POLL_INTERVAL_SECONDS)
                time.sleep(sleep_duration)
            else:
                time.sleep(0.1)

    except KeyboardInterrupt:
        print("\n[INFO] Log collector stopping (Ctrl+C)...")
    finally:
        print("[INFO] Exited.")