import {createClient,type Client,type InValue,type ResultSet} from '@libsql/client';
import {get} from '@vercel/blob';
let client:Client|undefined;
export function databaseClient(){
 if(!client){const url=process.env.TURSO_DATABASE_URL,authToken=process.env.TURSO_AUTH_TOKEN;
  if(!url||!authToken)throw new Error('Database configuration missing');
  client=createClient({url,authToken,intMode:'number'});
 }
 return client;
}
function mapped(result:ResultSet){return {results:result.rows.map(row=>Object.fromEntries(result.columns.map(name=>[name,row[name]]))),meta:{changes:result.rowsAffected}};}
class Statement {
 constructor(readonly query:string,readonly args:InValue[]=[]){ }
 bind(...values:any[]){return new Statement(this.query,values.map(v=>v===undefined?null:v));}
 async all(){const r=await databaseClient().execute({sql:this.query,args:this.args});return mapped(r);}
 async first(){return (await this.all()).results[0]??null;}
 async run(){return this.all();}
}
const adapter={prepare:(query:string)=>new Statement(query),batch:async(statements:Statement[])=>{
 // libSQL write batches are one transaction: a failed statement rolls everything back.
 const result=await databaseClient().batch(statements.map(s=>({sql:s.query,args:s.args})),'write');
 return result.map(mapped);
}};
export const db=()=>adapter;
export const bucket=()=>({get:async(path:string)=>{const result=await get(path,{access:'private'});return result?.statusCode===200?{body:result.stream}:null;}});
export const now=()=>new Date().toISOString();
export const id=()=>crypto.randomUUID();
export const sql=(s:string,...v:any[])=>db().prepare(s).bind(...v);
export async function all(s:string,...v:any[]){return (await sql(s,...v).all()).results as any[];}
export async function one(s:string,...v:any[]){return await sql(s,...v).first() as any;}
export function insert(table:string,data:Record<string,any>){const k=Object.keys(data);return sql(`INSERT INTO ${table} (${k.join(',')}) VALUES (${k.map(()=>'?').join(',')})`,...Object.values(data));}
export function audit(u:any,action:string,entity:string,entityId:string,oldValue:any,newValue:any,reason:string){return insert('audit_logs',{id:id(),actor:u.id,role:u.role,action,entity,entity_id:entityId,old_value:JSON.stringify(oldValue),new_value:JSON.stringify(newValue),reason,created_at:now()});}
export function notice(user:string,title:string,body:string){return insert('notifications',{id:id(),user_id:user,title,body,read:0,created_at:now()});}
