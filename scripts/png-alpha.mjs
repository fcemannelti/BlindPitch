// Inspeciona alpha dos PNG RGBA usados pelo produto, sem dependências externas.
import { inflateSync } from 'node:zlib';
export function pngAlphaStats(buffer,includePixels=false) {
  if(buffer.toString('ascii',1,4)!=='PNG'||buffer[24]!==8||buffer[25]!==6||buffer[28]!==0)throw new Error('É necessário PNG RGBA 8-bit não entrelaçado.');
  const width=buffer.readUInt32BE(16),height=buffer.readUInt32BE(20),chunks=[];
  for(let offset=8;offset<buffer.length;){const length=buffer.readUInt32BE(offset),kind=buffer.toString('ascii',offset+4,offset+8);if(kind==='IDAT')chunks.push(buffer.subarray(offset+8,offset+8+length));offset+=12+length;}
  const data=inflateSync(Buffer.concat(chunks)),stride=width*4;
  let previous=Buffer.alloc(stride),transparent=0,opaque=0,partial=0;const corners=[],pixels=includePixels?Buffer.alloc(width*height*4):null;
  const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
  for(let y=0;y<height;y++){
    const offset=y*(stride+1),filter=data[offset],row=Buffer.alloc(stride);
    for(let x=0;x<stride;x++){
      const a=x>=4?row[x-4]:0,b=previous[x],c=x>=4?previous[x-4]:0;
      row[x]=(data[offset+1+x]+([0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter]))&255;
    }
    for(let x=0;x<width;x++){const alpha=row[x*4+3];if(alpha<=1)transparent++;else if(alpha>=250)opaque++;else partial++;if((x===0||x===width-1)&&(y===0||y===height-1))corners.push(alpha);}
    if(pixels)row.copy(pixels,y*stride);
    previous=row;
  }
  return {width,height,transparent,opaque,partial,corners,total:width*height,...(pixels?{pixels}:{})};
}
