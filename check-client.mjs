import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const match = html.match(/<script>([\s\S]*?)<\/script>/i);
if (!match) throw new Error('Não foi encontrado o script principal em public/index.html.');
new vm.Script(match[1], { filename: 'public/index.html' });
console.log('JavaScript do frontend: sintaxe válida.');
