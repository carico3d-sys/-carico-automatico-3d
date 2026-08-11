import os
import time

from django.db import connection
from django.http import JsonResponse


WORKER_HEARTBEAT_PATH = os.environ.get(
    "WORKER_HEARTBEAT_PATH",
    "/data/worker_heartbeat",
)


def healthz(request):
    """Readiness check for the reverse proxy and web container."""
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
    except Exception:
        return JsonResponse({"status": "error", "database": "unavailable"}, status=503)

    return JsonResponse({"status": "ok", "database": "ok"})


def worker_healthz(request):
    """Return 200 only when the Q worker heartbeat is recent."""
    try:
        heartbeat_age = time.time() - os.path.getmtime(WORKER_HEARTBEAT_PATH)
    except OSError:
        return JsonResponse({"status": "error", "worker": "heartbeat_missing"}, status=503)

    if heartbeat_age > 90:
        return JsonResponse({"status": "error", "worker": "heartbeat_stale"}, status=503)

    return JsonResponse({"status": "ok", "worker": "ok"})
