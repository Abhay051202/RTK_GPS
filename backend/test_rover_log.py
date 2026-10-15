import importlib
import tempfile
import unittest
from pathlib import Path
from io import BytesIO
from openpyxl import load_workbook
import asyncio
import rover_log

class RecordingTest(unittest.TestCase):
    def test_record_stop_persist_export(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'test.sqlite3'
            rover_log.DB_PATH = path
            reading = dict(device_id='=unsafe', latitude=0.0, longitude=73.12345678, fix_quality=0, fix_status_text='NO FIX')
            rover_log.stop()
            rover_log.append_reading(reading)
            self.assertEqual(rover_log.status()['count'], 0)
            rover_log.start()
            rover_log.append_reading(reading)
            rover_log.append_reading(reading)
            rover_log.stop()
            rover_log.append_reading(reading)
            self.assertEqual(rover_log.status()['count'], 2)
            importlib.reload(rover_log)
            rover_log.DB_PATH = path
            self.assertFalse(rover_log.status()['recording'])
            self.assertEqual(rover_log.status()['count'], 2)
            async def collect():
                return b''.join([chunk async for chunk in rover_log.export().body_iterator])
            workbook = load_workbook(BytesIO(asyncio.run(collect())))
            sheet = workbook.active
            self.assertEqual(sheet.max_row, 3)
            self.assertEqual(sheet['D2'].value, 0)
            self.assertEqual(sheet['E2'].value, 73.12345678)
            self.assertEqual(sheet['I2'].value, 0)
            self.assertNotEqual(sheet['C2'].data_type, 'f')

if __name__ == '__main__':
    unittest.main()
