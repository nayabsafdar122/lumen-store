// A tiny drop-in replacement for the `sqlite3` npm package, built on Node's built-in `node:sqlite`.
// It implements just what Sequelize uses (Database, run, all, serialize, close).
// Used where the native sqlite3 binary can't load — e.g. on Vercel, whose runtime has an older glibc.
const { DatabaseSync } = require('node:sqlite');

// Sequelize checks `metaData.constructor.name === 'Statement'` to read lastID / changes.
class Statement {
  constructor(lastID = 0, changes = 0) {
    this.lastID = lastID;
    this.changes = changes;
  }
}

const CONSTRAINT_CODES = { 2067: 'SQLITE_CONSTRAINT_UNIQUE', 1555: 'SQLITE_CONSTRAINT_PRIMARYKEY', 787: 'SQLITE_CONSTRAINT_FOREIGNKEY', 1811: 'SQLITE_CONSTRAINT_TRIGGER' };

function translateError(e) {
  if (e && typeof e.errcode === 'number') {
    const primary = e.errcode & 0xff;
    e.code = CONSTRAINT_CODES[e.errcode] || (primary === 19 ? 'SQLITE_CONSTRAINT' : primary === 5 ? 'SQLITE_BUSY' : 'SQLITE_ERROR');
  }
  return e;
}

// node:sqlite only binds numbers, strings, bigints, buffers and null.
const toSql = (v) => {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof Date) return v.toISOString();
  return v;
};
function normalizeParams(params) {
  if (params == null) return [];
  if (Array.isArray(params)) return params.map(toSql);
  const out = {};
  for (const k of Object.keys(params)) out[k] = toSql(params[k]);
  return out;
}
const execStatement = (stmt, kind, params) => (Array.isArray(params) ? stmt[kind](...params) : stmt[kind](params));

class Database {
  constructor(filename, mode, callback) {
    if (typeof mode === 'function') { callback = mode; mode = undefined; }
    this.filename = filename;
    let err = null;
    try {
      this.db = new DatabaseSync(filename);
    } catch (e) {
      err = translateError(e);
    }
    setImmediate(() => callback && callback(err));
  }

  serialize(fn) { if (fn) fn(); }

  run(sql, params, callback) {
    if (typeof params === 'function') { callback = params; params = []; }
    let ctx = new Statement();
    let err = null;
    try {
      const r = execStatement(this.db.prepare(sql), 'run', normalizeParams(params));
      ctx = new Statement(Number(r.lastInsertRowid), Number(r.changes));
    } catch (e) {
      err = translateError(e);
    }
    if (callback) callback.call(ctx, err);
    return this;
  }

  all(sql, params, callback) {
    if (typeof params === 'function') { callback = params; params = []; }
    let rows = [];
    let err = null;
    try {
      rows = execStatement(this.db.prepare(sql), 'all', normalizeParams(params)).map((r) => ({ ...r }));
    } catch (e) {
      err = translateError(e);
    }
    if (callback) callback.call(new Statement(), err, rows);
    return this;
  }

  exec(sql, callback) {
    let err = null;
    try { this.db.exec(sql); } catch (e) { err = translateError(e); }
    if (callback) callback(err);
    return this;
  }

  close(callback) {
    try { this.db.close(); } catch { /* already closed */ }
    if (callback) callback(null);
  }

  on() { return this; } // sqlite3 event API (trace/profile) — not needed
}

module.exports = { Database, OPEN_READONLY: 1, OPEN_READWRITE: 2, OPEN_CREATE: 4, verbose() { return module.exports; } };
