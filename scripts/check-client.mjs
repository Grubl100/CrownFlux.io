import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import vm from 'node:vm';

const publicHtmlUrl = new URL('../public/index.html', import.meta.url);

const targetUrl = existsSync(publicHtmlUrl) ? publicHtmlUrl : null;
if (!targetUrl) throw new Error('Não foi encontrado o arquivo index.html.');

const html = await readFile(targetUrl, 'utf8');
const match = html.match(/<script>([\s\S]*?)<\/script>/i);
if (!match) throw new Error('Não foi encontrado o carregador de telas em index.html.');
new vm.Script(match[1], { filename: 'index.html' });

for (const relativeUrl of ['../public/app.js', '../public/tactical.js']) {
  const scriptUrl = new URL(relativeUrl, import.meta.url);
  if (!existsSync(scriptUrl)) throw new Error(`Não foi encontrado ${scriptUrl.pathname}.`);
  const source = await readFile(scriptUrl, 'utf8');
  new vm.Script(source, { filename: scriptUrl.pathname });
}

const fragments = ['play', 'guide', 'friends', 'profile', 'history', 'settings', 'shared', 'tactical'];
for (const fragment of fragments) {
  const fragmentUrl = new URL(`../public/screens/${fragment}.html`, import.meta.url);
  if (!existsSync(fragmentUrl)) throw new Error(`Não foi encontrado o fragmento ${fragment}.`);
  const markup = await readFile(fragmentUrl, 'utf8');
  if (!markup.trim()) throw new Error(`O fragmento ${fragment} está vazio.`);
}

const playMarkup = await readFile(new URL('../public/screens/play.html', import.meta.url), 'utf8');
for (const requiredId of [
  'wrap', 'cv', 'start', 'go', 'classicTimeControl', 'classicBotBtn',
  'classicMateBanner', 'classicMateText', 'classicMateAgain', 'classicMateRematch', 'classicMateMenu'
]) {
  if (!playMarkup.includes(`id="${requiredId}"`)) {
    throw new Error(`A tela de jogo não contém ${requiredId}.`);
  }
  if (!playMarkup.includes('data-mode="classic"')) {
    throw new Error('A tela de jogo não contém a configuração do Xadrez Clássico.');
  }

  const profileMarkup = await readFile(new URL('../public/screens/profile.html', import.meta.url), 'utf8');
  for (const ratingId of ['statRatingBullet', 'statRatingBlitz', 'statRatingRapid', 'statRatingClassic']) {
    if (!profileMarkup.includes(`id="${ratingId}"`)) throw new Error(`O perfil não contém ${ratingId}.`);
  }
}

const sharedMarkup = await readFile(new URL('../public/screens/shared.html', import.meta.url), 'utf8');
for (const requiredId of ['welcomeAcceptBtn', 'confirmExitModal', 'noticeStack']) {
  if (!sharedMarkup.includes(`id="${requiredId}"`)) {
    throw new Error(`O fragmento compartilhado não contém ${requiredId}.`);
  }
}

const tacticalMarkup = await readFile(new URL('../public/screens/tactical.html', import.meta.url), 'utf8');
if (!tacticalMarkup.includes('id="tacticalScene"') || !tacticalMarkup.includes('id="tsBoard"')) {
  throw new Error('O fragmento tático está incompleto.');
}

console.log('JavaScript do frontend e telas: sintaxe válida.');
