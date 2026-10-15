"""Persistent rover recording and Excel export."""
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
import sqlite3
import threading
from contextlib import contextmanager
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from openpyxl import Workbook

router = APIRouter(prefix='/api/recording')
DB_PATH = Path(__file__).with_name('rover_readings.sqlite3')
lock = threading.Lock()
recording = False
FIELDS = ['received_utc', 'device_id', 'latitude', 'longitude', 'altitude', 'speed_kmh', 'heading', 'fix_quality', 'fix_status_text', 'battery_percent']

@contextmanager
def database():
    db = sqlite3.connect(DB_PATH)
    try:
        with db:
            db.execute('CREATE TABLE IF NOT EXISTS readings (id INTEGER PRIMARY KEY, received_utc TEXT, device_id TEXT, latitude REAL, longitude REAL, altitude REAL, speed_kmh REAL, heading REAL, fix_quality INTEGER, fix_status_text TEXT, battery_percent INTEGER)')
            yield db
    finally:
        db.close()

def append_reading(reading):
    with lock:
        if not recording:
            return
        row = dict(reading, received_utc=datetime.now(timezone.utc).isoformat())
        with database() as db:
            db.execute(f"INSERT INTO readings ({','.join(FIELDS)}) VALUES ({','.join('?' for _ in FIELDS)})", [row.get(key) for key in FIELDS])

@router.get('')
def status():
    with lock, database() as db:
        count = db.execute('SELECT COUNT(*) FROM readings').fetchone()[0]
        rows = db.execute('SELECT * FROM readings ORDER BY id DESC LIMIT 100').fetchall()
        return {'recording': recording, 'count': count, 'rows': [dict(zip(['id'] + FIELDS, row)) for row in rows]}

@router.post('/start')
def start():
    global recording
    with lock:
        recording = True
    return {'recording': True}

@router.post('/stop')
def stop():
    global recording
    with lock:
        recording = False
    return {'recording': False}

@router.get('/export')
def export():
    with database() as db:
        rows = db.execute('SELECT * FROM readings ORDER BY id').fetchall()
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = 'Rover Readings'
    sheet.append(['Reading ID'] + FIELDS)
    for row in rows:
        sheet.append(["'" + value if isinstance(value, str) and value.startswith(('=', '+', '-', '@')) else value for value in row])
    sheet.freeze_panes = 'A2'
    sheet.auto_filter.ref = sheet.dimensions
    for column in sheet.columns:
        sheet.column_dimensions[column[0].column_letter].width = 25
    for row in sheet.iter_rows(min_row=2):
        row[3].number_format = row[4].number_format = '0.00000000'
    output = BytesIO()
    workbook.save(output)
    output.seek(0)
    return StreamingResponse(output, media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', headers={'Content-Disposition': 'attachment; filename="Rover_Readings.xlsx"'})
