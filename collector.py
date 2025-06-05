import subprocess
import json
import logging
import os
import time

from datetime import datetime, timezone

JOURNALCTL_INITIAL_SINCE = "5 minutes ago"
JOURNALCTL_POLL_INTERVAL_SECONDS = 5
JOURNALCTL_OUTPUT_FORMAT = "json"
JOURNALCTL_COMMAND_TIMEOUT = 30

STORE_LOGS_TO_FILE = True
OUTPUT_LOG_FILE = "collected_journal_logs.jsonl"

DATABASE_NAME = "logs_db.db"

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(module)s.%(funcName)s:%(lineno)d - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

def check_journalctl_availability():
    try:
        process = subprocess.run(
            ['journalctl', '--version'],
            check=True,
            capture_output=True,
            text=True,
            timeout=10
        )
        logger.info(f"systemd journal (journalctl) is available. Version: {process.stdout.strip()}")
        return True
    except FileNotFoundError:
        logger.error("systemd journal (journalctl) command not found. Is systemd installed and in PATH?")
        return False
    except subprocess.CalledProcessError as e:
        logger.error(f"systemd journal (journalctl) command failed to run (Code: {e.returncode}): {e.stderr.strip()}")
        return False
    except subprocess.TimeoutExpired:
        logger.error("Checking journalctl availability timed out.")
        return False
    except Exception as e:
        logger.error(f"An unexpected error occurred while checking journalctl availability: {e}", exc_info=True)
        return False

def write_log_entry_to_file(log_entry_dict):
    if not STORE_LOGS_TO_FILE or not OUTPUT_LOG_FILE:
        return

    try:
        with open(OUTPUT_LOG_FILE, 'a', encoding='utf-8') as f_out:
            json.dump(log_entry_dict, f_out, ensure_ascii=False)
            f_out.write('\n')
    except IOError as ioe:
        logger.error(f"Failed to write log entry to {OUTPUT_LOG_FILE}: {ioe}")
    except Exception as e:
        logger.error(f"Unexpected error writing log entry to {OUTPUT_LOG_FILE}: {e}", exc_info=True)

def fetch_journal_logs(current_cursor=None):
    logger.debug(f"Fetching journal logs. Current cursor: {current_cursor}")
    new_logs_found_in_journal = False
    next_cursor_to_return = current_cursor

    cmd_command = ['journalctl', '--no-pager', '-o', JOURNALCTL_OUTPUT_FORMAT]
    if current_cursor:
        cmd_command.extend(['--after-cursor', current_cursor])
    elif JOURNALCTL_INITIAL_SINCE:
        cmd_command.extend(['--since', JOURNALCTL_INITIAL_SINCE])
        logger.info(f"No cursor. Fetching logs since '{JOURNALCTL_INITIAL_SINCE}'.")
    else:
        logger.info("No cursor and no initial 'since' period. Fetching most recent logs.")

    try:
        logger.debug(f"Executing command: {' '.join(cmd_command)}")
        process = subprocess.run(
            cmd_command, capture_output=True, text=True, encoding='utf-8',
            errors='replace', check=False, timeout=JOURNALCTL_COMMAND_TIMEOUT
        )

        if process.returncode != 0:
            stderr_output = process.stderr.strip()
            logger.error(f"journalctl command failed (Code {process.returncode}): {stderr_output}")
            if "Invalid cursor" in stderr_output or "Cannot seek to cursor" in stderr_output:
                logger.warning("Journal cursor was invalid. Resetting to None.")
                next_cursor_to_return = None
            return False, next_cursor_to_return

        stdout_output = process.stdout.strip()
        if stdout_output:
            lines = [line for line in stdout_output.split('\n') if line.strip()]
            if lines:
                new_logs_found_in_journal = True
                last_valid_cursor_in_batch = None
                logger.debug(f"Received {len(lines)} new log line(s) from journalctl.")

                for line_number, line_text in enumerate(lines):
                    try:
                        log_entry = json.loads(line_text)
                        msg = log_entry.get("MESSAGE", "")
                        identifier = log_entry.get("SYSLOG_IDENTIFIER", log_entry.get("_COMM", "unknown_process"))
                        timestamp_usec_str = log_entry.get("__REALTIME_TIMESTAMP")
                        dt_obj_str = "NO_TIMESTAMP"

                        if timestamp_usec_str:
                            try:
                                timestamp_sec_float = int(timestamp_usec_str) / 1_000_000
                                # 'datetime' artık doğru şekilde datetime.datetime sınıfına işaret ediyor
                                dt_obj_utc = datetime.fromtimestamp(timestamp_sec_float, timezone.utc)
                                dt_obj_local = dt_obj_utc.astimezone()
                                dt_obj_str = dt_obj_local.strftime('%Y-%m-%d %H:%M:%S %Z')
                            except (ValueError, OverflowError, TypeError):
                                logger.warning(f"Could not parse timestamp: {timestamp_usec_str} for line: {line_text[:100]}...")

                        logger.info(f"[JOURNAL_LOG][{dt_obj_str}][{identifier}] {msg}")

                        write_log_entry_to_file(log_entry) # Existing call

                        if "__CURSOR" in log_entry:
                            last_valid_cursor_in_batch = log_entry["__CURSOR"]
                        else:
                            logger.warning(f"Log entry missing '__CURSOR' field: {line_text[:200]}...")

                    except json.JSONDecodeError as je:
                        logger.warning(f"Journal log line not JSON or corrupt (line {line_number+1}): {line_text[:200]}... - Error: {je}")
                    except Exception as e:
                        logger.warning(f"Error processing journal log line (line {line_number+1}): {line_text[:200]}... - Error: {e}", exc_info=True)

                if last_valid_cursor_in_batch:
                    next_cursor_to_return = last_valid_cursor_in_batch
                    logger.debug(f"New journal cursor SET: {next_cursor_to_return}")
                elif new_logs_found_in_journal:
                    logger.warning("Logs processed, but no new cursor obtained from this batch.")
            else:
                logger.debug("No new log lines found in journalctl output (after stripping/splitting).")
        else:
            logger.debug("stdout from journalctl is empty. No new logs.")

    except FileNotFoundError:
        logger.error("`journalctl` command not found.")
        return False, current_cursor
    except subprocess.TimeoutExpired:
        logger.error(f"journalctl command timed out after {JOURNALCTL_COMMAND_TIMEOUT} seconds.")
        return False, current_cursor
    except Exception as e:
        logger.error(f"An unexpected error occurred while reading from journalctl: {e}", exc_info=True)
        return False, current_cursor

    logger.debug(f"fetch_journal_logs completed. New logs: {new_logs_found_in_journal}. Next cursor: {next_cursor_to_return}")
    return new_logs_found_in_journal, next_cursor_to_return

def collect_logs():
    logger.info("Linux Log Collector (Journald) Starting...")
    if STORE_LOGS_TO_FILE and OUTPUT_LOG_FILE:
        try:
            abs_log_file_path = os.path.abspath(OUTPUT_LOG_FILE)
            logger.info(f"Raw journal logs will be stored in JSON Lines format at: {abs_log_file_path}")
            with open(abs_log_file_path, 'a', encoding='utf-8') as f_test:
                pass
        except Exception as e:
            logger.error(f"Cannot write to specified OUTPUT_LOG_FILE '{abs_log_file_path}'. File logging will be effectively disabled. Error: {e}")
    elif STORE_LOGS_TO_FILE and not OUTPUT_LOG_FILE:
        logger.warning("STORE_LOGS_TO_FILE is True, but OUTPUT_LOG_FILE is not set. File logging disabled.")
    else:
        logger.info("File storage for raw journal logs is disabled.")


    logger.warning("This script may require root (sudo) privileges to access the full system journal.")

    if not check_journalctl_availability():
        logger.fatal("journalctl is not available. Terminating script.")
        return

    current_journal_cursor = None
    last_successful_check_time = time.monotonic()

    try:
        while True:
            current_time = time.monotonic()
            time_since_last_check = current_time - last_successful_check_time

            if time_since_last_check >= JOURNALCTL_POLL_INTERVAL_SECONDS:
                logger.debug(f"Polling journal for new logs (Interval: {JOURNALCTL_POLL_INTERVAL_SECONDS}s).")
                logs_found, new_cursor = fetch_journal_logs(current_journal_cursor)
                current_journal_cursor = new_cursor
                last_successful_check_time = time.monotonic() # Reset timer after a check

                time_to_next_poll = JOURNALCTL_POLL_INTERVAL_SECONDS
                sleep_duration = max(0.1, time_to_next_poll) # Ensure at least a tiny sleep
                logger.debug(f"Sleeping for {sleep_duration:.2f} seconds until next poll.")
                time.sleep(sleep_duration)
            else:
                sleep_duration = max(0.1, JOURNALCTL_POLL_INTERVAL_SECONDS - time_since_last_check)
                logger.debug(f"Loop iteration before poll interval. Sleeping for {sleep_duration:.2f} seconds.")
                time.sleep(sleep_duration)


    except KeyboardInterrupt:
        logger.info("Log collector stopping due to Ctrl+C.")
    except Exception as e:
        logger.critical(f"An unhandled exception occurred in the main loop: {e}", exc_info=True)
    finally:
        logger.info("Log collector exited.")