CREATE TABLE IF NOT EXISTS readiness_checks (
  id TEXT PRIMARY KEY,
  checked_at INTEGER NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('scheduled','release')),
  application INTEGER NOT NULL CHECK(application IN (0,1)),
  pilot INTEGER NOT NULL CHECK(pilot IN (0,1)),
  duration_ms INTEGER NOT NULL CHECK(duration_ms >= 0)
);
CREATE INDEX IF NOT EXISTS readiness_checked_at ON readiness_checks(checked_at DESC);
