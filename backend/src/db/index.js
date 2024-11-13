import initSqlJs from 'sql.js';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'events.db');

let db;

const initDb = async () => {
  const SQL = await initSqlJs();
  
  try {
    const data = await fs.readFile(dbPath);
    db = new SQL.Database(data);
  } catch (err) {
    db = new SQL.Database();
    // Initialize database schema
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT CHECK(role IN ('admin', 'organizer', 'attendee')) NOT NULL
      );

      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        date TEXT NOT NULL,
        location TEXT NOT NULL,
        organizer_id TEXT NOT NULL,
        category TEXT NOT NULL,
        capacity INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (organizer_id) REFERENCES users (id)
      );

      CREATE TABLE IF NOT EXISTS registrations (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        status TEXT CHECK(status IN ('pending', 'confirmed', 'cancelled')) NOT NULL,
        registration_date TEXT DEFAULT CURRENT_TIMESTAMP,
        qr_code TEXT,
        FOREIGN KEY (event_id) REFERENCES events (id),
        FOREIGN KEY (user_id) REFERENCES users (id)
      );
    `);
  }

  // Save database on process exit
  process.on('exit', () => {
    if (db) {
      const data = db.export();
      fs.writeFileSync(dbPath, Buffer.from(data));
    }
  });

  // Handle SIGINT
  process.on('SIGINT', () => {
    process.exit();
  });

  return {
    query: (sql, params = []) => {
      try {
        const stmt = db.prepare(sql);
        stmt.bind(params);
        const result = [];
        while (stmt.step()) {
          result.push(stmt.getAsObject());
        }
        stmt.free();
        return result;
      } catch (error) {
        console.error('Database query error:', error);
        throw error;
      }
    },
    
    exec: (sql, params = []) => {
      try {
        const stmt = db.prepare(sql);
        stmt.bind(params);
        stmt.run();
        stmt.free();
      } catch (error) {
        console.error('Database exec error:', error);
        throw error;
      }
    },

    close: () => {
      if (db) {
        const data = db.export();
        fs.writeFileSync(dbPath, Buffer.from(data));
        db.close();
      }
    }
  };
};

export default await initDb();