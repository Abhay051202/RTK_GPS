"""CLI entry point."""

from __future__ import annotations

import argparse
import asyncio
import logging

from .caster import ProsperNtripCaster
from .config import load_config


def main() -> None:
    parser = argparse.ArgumentParser(description="Prosper TLS NTRIP Caster")
    parser.add_argument("--config", required=True, help="Path to caster YAML configuration")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)sZ %(levelname)s %(name)s %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S",
    )
    cfg = load_config(args.config)
    try:
        asyncio.run(ProsperNtripCaster(cfg).run())
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
