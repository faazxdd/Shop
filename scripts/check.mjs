import {readdir,readFile} from 'node:fs/promises';
import vm from 'node:vm';
for(const file of await readdir('.')) {
 if(file.endsWith('.js')) new vm.Script(await readFile(file,'utf8'),{filename:file});
 if(file.endsWith('.html')) {
  const text=await readFile(file,'utf8');
  const markup=text.replace(/<script[\s\S]*?<\/script>/g,'');
  for(const tag of markup.matchAll(/<[^>]+>/g)) if([...tag[0].matchAll(/\sid=/g)].length>1)throw Error(file+': duplicate id attribute');
  for(const [i,match] of [...text.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].entries()) new vm.Script(match[1],{filename:file+':script'+i});
 }
}
console.log('All JavaScript and inline page scripts parse successfully.');
