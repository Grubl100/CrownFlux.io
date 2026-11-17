import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import vm from 'node:vm';

const publicHtmlUrl = new URL('../public/index.html', import.meta.url);
const rootHtmlUrl = new URL('../index.html', import.meta.url);
const localPublicHtmlUrl = new URL('./public/index.html', import.meta.url);
const localRootHtmlUrl = new URL('./index.html', import.meta.url);

const targetUrl = [publicHtmlUrl, localPublicHtmlUrl, rootHtmlUrl, localRootHtmlUrl].find(u => existsSync(u));
if (!targetUrl) throw new Error('Não foi encontrado o arquivo index.html.');

const html = await readFile(targetUrl, 'utf8');
const match = html.match(/<script>([\s\S]*?)<\/script>/i);
if (!match) throw new Error('Não foi encontrado o script principal em index.html.');
new vm.Script(match[1], { filename: 'index.html' });
console.log('JavaScript do frontend: sintaxe válida.');
