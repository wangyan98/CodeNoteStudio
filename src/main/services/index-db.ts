import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'

let db: Database.Database | null = null

export function initDatabase(projectPath: string): Database.Database {
  if (db) return db

  fs.mkdirSync(projectPath, { recursive: true })

  const dbPath = path.join(projectPath, '.index.db')
  db = new Database(dbPath)

  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS code_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      note_path TEXT NOT NULL,
      function_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      start_line INTEGER NOT NULL,
      end_line INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(note_path, function_name, file_path)
    )
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_code_mappings_note
    ON code_mappings(note_path)
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_code_mappings_function
    ON code_mappings(function_name, file_path)
  `)

  return db
}

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return db
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}
