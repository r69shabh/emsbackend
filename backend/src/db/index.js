import initSqlJs from 'sql.js';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'events.db');

let db;

const initDb = async () => {
  console.log('Initializing SQL.js...');
  const SQL = await initSqlJs({
    locateFile: file => path.join(__dirname, '../../node_modules/sql.js/dist/', file)
  });
  console.log('SQL.js initialized successfully');
  
  // Try to read existing database
  try {
    const data = await fs.readFile(dbPath);
    db = new SQL.Database(data);
    console.log('Existing database loaded');
    
    // Verify if tables exist
    const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
    if (tables[0]?.values?.length > 0) {
      console.log('Database already contains tables, skipping schema execution');
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

        close: async () => {
          if (db) {
            const data = db.export();
            await fs.writeFile(dbPath, Buffer.from(data));
            db.close();
          }
        }
      };
    }
  } catch (err) {
    console.log('No existing database found, creating new one');
    db = new SQL.Database();
  }

  // Read and execute schema.sql with error handling
    try {
      const schemaPath = path.join(__dirname, 'schema.sql');
      console.log('Reading schema from:', schemaPath);
      
      // Verify schema file exists and is readable
      try {
        const stats = await fs.stat(schemaPath);
        console.log('Schema file exists, size:', stats.size, 'bytes');
        if (stats.size === 0) {
          throw new Error('Schema file is empty');
        }
      } catch (err) {
        console.error('Schema file error:', err.message);
        throw err;
      }
      
      const schema = await fs.readFile(schemaPath, 'utf8');
      console.log('Schema content length:', schema.length);
      console.log('Executing schema...');
      const statements = schema.split(';').filter(s => s.trim());
      console.log(`Found ${statements.length} statements to execute`);
      
      for (const statement of statements) {
        try {
          console.log('Executing statement:', statement.split('\n')[0].trim());
          db.exec(statement);
          console.log('Statement executed successfully');
          
          // Verify table creation
          if (statement.trim().toLowerCase().startsWith('create table')) {
            const tableName = statement.match(/create table (\w+)/i)[1];
            const tables = db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`);
            if (tables.length > 0) {
              console.log(`Table ${tableName} created successfully`);
            } else {
              console.error(`Table ${tableName} not found after creation`);
            }
          }
        } catch (err) {
          console.error('Error executing statement:', statement.split('\n')[0].trim());
          console.error('Full error:', err);
          console.error('Statement:', statement);
          throw err;
        }
      }
      
      // Verify all tables
      const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
      console.log('Final tables:', tables[0]?.values || []);
      console.log('Schema execution complete');
    } catch (err) {
      console.error('Error executing schema:', err);
      throw err;
    }

    // Set up process event handlers
    process.on('exit', async () => {
      if (db) {
        const data = db.export();
        await fs.writeFile(dbPath, Buffer.from(data));
      }
    });

    process.on('SIGINT', () => {
      process.exit();
    });

    // Write initial database file
    try {
      const data = db.export();
      await fs.writeFile(dbPath, Buffer.from(data));
      console.log(`Database initialized at ${dbPath}`);
    } catch (err) {
      console.error('Failed to write database file:', err);
      throw err;
    }

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

    close: async () => {
      if (db) {
        const data = db.export();
        await fs.writeFile(dbPath, Buffer.from(data));
        db.close();
      }
    }
  };
};

const dbInstance = await initDb();
export default dbInstance;
