"""A hung ETL subprocess is killed by the watchdog and releases the run lock."""
import time

import scheduler


def test_hung_job_is_killed_and_lock_released(tmp_path, monkeypatch):
    hang = tmp_path / "hang.py"
    hang.write_text("import time\nprint('started', flush=True)\ntime.sleep(60)\n")
    monkeypatch.setitem(scheduler._MAX_RUN_S, str(hang), 1)
    t0 = time.monotonic()
    scheduler._run_etl("test", entry=str(hang), label="hang job", record=False)
    assert time.monotonic() - t0 < 15  # killed after ~1 s, not 60
    assert scheduler._run_lock.acquire(blocking=False)  # lock was released
    scheduler._run_lock.release()


def test_quick_job_is_not_killed(tmp_path, monkeypatch):
    ok = tmp_path / "ok.py"
    ok.write_text("print('done')\n")
    monkeypatch.setitem(scheduler._MAX_RUN_S, str(ok), 30)
    scheduler._run_etl("test", entry=str(ok), label="quick job", record=False)
