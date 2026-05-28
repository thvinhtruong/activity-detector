import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";

const DATA_DIR = process.env.DATA_DIR ?? "data";
mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(`${DATA_DIR}/app.db`, { create: true });

db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

// The tasks schema. `status` includes 'recurring' (a task done on a daily/weekly
// cadence); `recurrence` is only meaningful when status = 'recurring'.
// `duration_minutes` is a planned/estimate duration (default 1h30m).
const TASKS_SCHEMA = `
  CREATE TABLE IF NOT EXISTS tasks (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    title            TEXT    NOT NULL,
    description      TEXT    NOT NULL DEFAULT '',
    status           TEXT    NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','doing','done','recurring')),
    recurrence       TEXT    NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none','daily','weekly')),
    duration_minutes INTEGER NOT NULL DEFAULT 90,
    archived         INTEGER NOT NULL DEFAULT 0,
    created_at       TEXT    NOT NULL,
    updated_at       TEXT    NOT NULL
  );
`;

db.exec(TASKS_SCHEMA);

db.exec(`
  CREATE TABLE IF NOT EXISTS time_entries (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    started_at TEXT    NOT NULL,
    ended_at   TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_entries_task    ON time_entries(task_id);
  CREATE INDEX IF NOT EXISTS idx_entries_started ON time_entries(started_at);
`);

// ---- migration for pre-existing DBs ----
// Older DBs have a tasks table without `recurrence` / `duration_minutes` and a
// status CHECK that forbids 'recurring'. SQLite can't ALTER a CHECK constraint,
// so rebuild the table. Detect by looking for 'recurring' in the stored DDL.
const tasksDDL =
  (db.query(`SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'`).get() as
    | { sql: string }
    | null)?.sql ?? "";

if (tasksDDL && !tasksDDL.includes("recurring")) {
  // legacy_alter_table=ON keeps the RENAME "dumb" so time_entries' FK text stays
  // pointing at "tasks"; foreign_keys=OFF avoids cascade churn during the copy.
  db.exec("PRAGMA foreign_keys = OFF;");
  db.exec("PRAGMA legacy_alter_table = ON;");
  db.transaction(() => {
    db.exec("ALTER TABLE tasks RENAME TO tasks_old;");
    db.exec(TASKS_SCHEMA);
    db.exec(`
      INSERT INTO tasks (id, title, description, status, archived, created_at, updated_at)
      SELECT id, title, description, status, archived, created_at, updated_at FROM tasks_old;
    `);
    db.exec("DROP TABLE tasks_old;");
  })();
  db.exec("PRAGMA legacy_alter_table = OFF;");
  db.exec("PRAGMA foreign_keys = ON;");
}
