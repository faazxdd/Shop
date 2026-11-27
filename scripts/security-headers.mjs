import {readdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
for(const file of (await readdir('.')).filter(f=>f.endsWith('.html'))){
 let html=await readFile(file,'utf8');html=html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\n?/g,'');
 const hashes=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].filter(m=>m[1].trim()).map(m=>"'sha256-"+createHash('sha256').update(m[1]).digest('base64')+"'");
 const fontPolicy=html.includes('href="shop.css?') ? " font-src 'self';" : '';
 const policy=`default-src 'none'; base-uri 'self'; form-action 'self'; script-src 'self' ${hashes.join(' ')}; style-src 'self' 'unsafe-inline';${fontPolicy} img-src 'self' https: data: blob:; connect-src 'self' https://gcmudhejegesvwdpkkdy.supabase.co wss://gcmudhejegesvwdpkkdy.supabase.co https://commons.wikimedia.org; manifest-src 'self'; worker-src 'self'; object-src 'none'; frame-src 'none'`;
 const expected=html.replace('<meta charset="utf-8">','<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="'+policy+'">');
 if(process.argv.includes('--write'))await writeFile(file,expected);
 else if(expected!==await readFile(file,'utf8'))throw Error(file+': CSP hashes are stale. Run npm run security:headers');
}
console.log('Content Security Policy hashes verified.');
