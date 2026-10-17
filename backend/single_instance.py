"""Cross-platform advisory single-instance lock for Base publisher processes."""
from __future__ import annotations

import os
import tempfile


class SingleInstanceLock:
    def __init__(self, name: str):
        self.path = os.path.join(tempfile.gettempdir(), f"{name}.lock")
        self.file = None

    def acquire(self):
        self.file = open(self.path, "a+b")
        self.file.seek(0)
        self.file.write(b"0")
        self.file.flush()
        try:
            if os.name == "nt":
                import msvcrt
                self.file.seek(0)
                msvcrt.locking(self.file.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(self.file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            self.file.close()
            self.file = None
            raise RuntimeError("Another Prosper RTK Base publisher is already running on this computer") from exc
        return self

    def release(self):
        if not self.file:
            return
        try:
            if os.name == "nt":
                import msvcrt
                self.file.seek(0)
                msvcrt.locking(self.file.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                import fcntl
                fcntl.flock(self.file.fileno(), fcntl.LOCK_UN)
        finally:
            self.file.close()
            self.file = None
