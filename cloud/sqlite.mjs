import {DatabaseSync} from 'node:sqlite';

// Node's SQLite implements the same query/batch boundary used by the D1 Worker.
export function openDatabase(file) {
  const sqlite=new DatabaseSync(file);
  sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  return {
    sqlite,
    prepare(sql){return {bind(...args){return {
      first(){return sqlite.prepare(sql).get(...args)||null;},
      all(){return {results:sqlite.prepare(sql).all(...args)};},
      run(){return sqlite.prepare(sql).run(...args);}
    };}};},
    batch(statements){
      sqlite.exec('BEGIN IMMEDIATE');
      try {const result=statements.map(s=>s.run());sqlite.exec('COMMIT');return result;}
      catch(error){sqlite.exec('ROLLBACK');throw error;}
    }
  };
}
