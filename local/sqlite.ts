import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
export function openDatabase(path:string,migration:string){
 mkdirSync(dirname(path),{recursive:true});const db=new DatabaseSync(path);
 db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
 db.exec('CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY)');
 for(const [name,file] of [['0000',migration],['0001',resolve(dirname(migration),'0001.sql')]]){
  if(db.prepare('SELECT name FROM local_migrations WHERE name=?').get(name))continue;
  db.exec('BEGIN');try{db.exec(readFileSync(file,'utf8'));db.prepare('INSERT INTO local_migrations VALUES(?)').run(name);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');db.close();throw e;}
 }
 const statement=(sql:string,args:any[]=[]):any=>({bind(...values:any[]){return statement(sql,values.map(x=>x===undefined?null:x));},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return db.prepare(sql).run(...args);}});
 return {db,adapter:{prepare:statement,async batch(statements:any[]){db.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}} as unknown as D1Database};
}
