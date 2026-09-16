import * as os from 'os';
import * as path from 'path';

/** "~/x" -> "/Users/me/x" */
export function expandHome(p: string): string {
  return p === '~' || p.startsWith('~/') ? path.join(os.homedir(), p.slice(1)) : p;
}

/** Compares two folder paths, ignoring trailing slashes (and case on macOS/Windows). */
export function samePath(a: string, b: string, platform = process.platform): boolean {
  const norm = (p: string) => {
    const resolved = path.resolve(expandHome(p));
    return platform === 'darwin' || platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  return norm(a) === norm(b);
}
