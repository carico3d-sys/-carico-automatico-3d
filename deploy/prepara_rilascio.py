#!/usr/bin/env python3
"""Prepara un rilascio Carico 3D dal computer di sviluppo.

Esempio:
    python deploy/prepara_rilascio.py --start-docker \
        --commit "Prepara rilascio produzione" --push

Lo script non inserisce segreti nel repository. Il backup viene creato nella
cartella ignorata ``backups/`` e deve essere trasferito al server separatamente.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]


def run(command: list[str], *, cwd: Path = ROOT_DIR) -> None:
    print("+", " ".join(command))
    subprocess.run(command, cwd=cwd, check=True)


def output(command: list[str], *, cwd: Path = ROOT_DIR) -> str:
    result = subprocess.run(
        command,
        cwd=cwd,
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Valida e prepara un rilascio Carico 3D."
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Cartella del rilascio (default: backups/release-<timestamp>).",
    )
    parser.add_argument(
        "--skip-tests",
        action="store_true",
        help="Non esegue la suite completa dei test.",
    )
    parser.add_argument(
        "--skip-backup",
        action="store_true",
        help="Non crea il backup PostgreSQL e dei dati icone.",
    )
    parser.add_argument(
        "--start-docker",
        action="store_true",
        help="Avvia/ricostruisce lo stack locale prima del backup.",
    )
    parser.add_argument(
        "--commit",
        metavar="MESSAGGIO",
        help="Crea un commit con tutte le modifiche dopo le verifiche.",
    )
    parser.add_argument(
        "--push",
        action="store_true",
        help="Esegue git push dopo il commit o dalla working tree pulita.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    output_dir = args.output or (ROOT_DIR / "backups" / f"release-{timestamp}")
    if not output_dir.is_absolute():
        output_dir = ROOT_DIR / output_dir
    output_dir = output_dir.resolve()

    if output_dir.exists() and any(output_dir.iterdir()):
        raise SystemExit(f"Cartella non vuota: {output_dir}")
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Repository: {ROOT_DIR}")
    print(f"Rilascio:   {output_dir}")

    run([sys.executable, "manage.py", "check"])
    run([sys.executable, "manage.py", "makemigrations", "--check", "--dry-run"])
    if not args.skip_tests:
        run([sys.executable, "manage.py", "test"])

    run(["docker", "compose", "config", "--quiet"])
    if args.start_docker:
        run(["docker", "compose", "up", "-d", "--build"])

    status = output(["git", "status", "--porcelain"])
    if status:
        if not args.commit:
            raise SystemExit(
                "Working tree non pulita. Verifica le modifiche oppure usa "
                "--commit \"messaggio\" per includerle nel rilascio."
            )
        run(["git", "add", "-A"])
        run(["git", "commit", "-m", args.commit])

    revision = output(["git", "rev-parse", "HEAD"])
    metadata = {
        "revision": revision,
        "created_at_utc": timestamp,
        "repository": str(ROOT_DIR),
    }
    (output_dir / "RELEASE.json").write_text(
        json.dumps(metadata, indent=2) + "\n",
        encoding="utf-8",
    )

    if not args.skip_backup:
        if not args.start_docker:
            print(
                "Nota: il backup richiede i servizi Docker locali avviati. "
                "Usa --start-docker se necessario."
            )
        run(["sh", "ops/backup.sh", str(output_dir)])

    # Il push avviene solo dopo test e backup: se il backup fallisce, il
    # commit resta locale e il repository remoto non viene aggiornato.
    if args.push:
        run(["git", "push"])

    print("\nRilascio pronto.")
    print(f"Revision: {revision}")
    print(f"Backup:   {output_dir}")
    print("Trasferisci questa cartella al server, senza pubblicarla su GitHub.")
    print(
        "Esempio: scp -r "
        f"{output_dir} utente@SERVER:/opt/carico3d/backups/"
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except subprocess.CalledProcessError as exc:
        print(f"Comando fallito con codice {exc.returncode}.", file=sys.stderr)
        raise SystemExit(exc.returncode) from exc
