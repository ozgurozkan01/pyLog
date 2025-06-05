import logging

from collector import collect_logs

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(module)s.%(funcName)s:%(lineno)d - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

if __name__ == "__main__":
    logger.info("Starting Log Collector process...")
    collect_logs()
    logger.info("Log Collector process finished (or interrupted).")


