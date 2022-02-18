import * as fs from 'fs';
import { log } from './log';

export const readJsonFile = (path: string): { [kes: string]: any } | undefined => {
  if (fs.existsSync(path) === false) {
    return undefined;
  }

  try {
    let content = fs.readFileSync(path, 'utf8');
    /* we remove the comments from it */
    content = content.replace(/\\"|"(?:\\"|[^"])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g, (m, g) => (g ? '' : m));
    return JSON.parse(content);
  } catch (e: any) {
    log(`Error parsing "${path}"`, e.message ?? e);
    return undefined;
  }
};
