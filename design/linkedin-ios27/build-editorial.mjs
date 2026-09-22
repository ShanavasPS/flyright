import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');
const sources={
  __ICON__:'assets/images/icon.png',
  __ICON_DARK__:'assets/images/ios-icon-dark.png',
  __IOS27__:'design/linkedin-ios27/ios27-icon.png',
  __IOS27_DARK__:'design/linkedin-ios27/ios27-icon-dark.png',
  __WORLD_LIGHT__:'store-assets/raw/phone-06-world.png',
  __WORLD_DARK__:'assets/images/landing/dark/world.png',
};
const embeds={};
for(const [token,source] of Object.entries(sources))embeds[token]='data:image/png;base64,'+(await readFile(path.join(root,source))).toString('base64');
for(const name of ['editorial','video-frame']){
  let html=await readFile(path.join(here,`${name}.template.html`),'utf8');
  for(const [token,data] of Object.entries(embeds))html=html.replaceAll(token,data);
  await writeFile(path.join(here,`${name}.html`),html);
}
console.log('Built self-contained editorial.html and video-frame.html with original assets.');
