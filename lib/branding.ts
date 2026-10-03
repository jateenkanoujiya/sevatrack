import {AppError} from './errors';
import {validateImage} from './uploads';
export function collegeLogo(value:unknown){
 if(value===null||value==='')return null;
 if(typeof value!=='string'||value.length>200000)throw new AppError('Choose a college logo under 140 KB.');
 const match=/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
 if(!match)throw new AppError('Choose a PNG, JPG or WebP college logo.');
 const bytes=Buffer.from(match[2],'base64');
 if(bytes.length>140*1024)throw new AppError('Choose a college logo under 140 KB.');
 validateImage(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer,match[1]);
 return value;
}
