import os
import time

from django.conf import settings
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Aggiorna periodicamente il file heartbeat del worker."

    def add_arguments(self, parser):
        parser.add_argument("--interval", type=int, default=30)

    def handle(self, *args, **options):
        path = os.environ.get("WORKER_HEARTBEAT_PATH", "/data/worker_heartbeat")
        directory = os.path.dirname(path)
        if directory:
            os.makedirs(directory, exist_ok=True)
        interval = max(5, options["interval"])
        self.stdout.write(f"Worker heartbeat attivo: {path}")
        while True:
            with open(path, "w", encoding="utf-8") as heartbeat:
                heartbeat.write(str(time.time()))
            time.sleep(interval)
