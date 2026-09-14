// Pure logic with no vscode dependency, so it can be unit-tested with plain Node.

/** The JSON body Competitive Companion POSTs for each problem. */
export interface CompanionProblem {
  name: string; // e.g. "A. Closest Point"
  group: string; // e.g. "Codeforces - Educational Codeforces Round 167"
  url: string; // e.g. "https://codeforces.com/contest/1982/problem/A"
  timeLimit: number;
  memoryLimit: number;
  tests: { input: string; output: string }[];
  batch: { id: string; size: number };
}

export interface ProblemInfo {
  contestId: string;
  index: string; // "A", "B1", ...
  className: string; // "A_Closest_Point"
}

const URL_PATTERNS = [
  /codeforces\.com\/contest\/(\d+)\/problem\/(\w+)/,
  /codeforces\.com\/problemset\/problem\/(\d+)\/(\w+)/,
  /codeforces\.com\/gym\/(\d+)\/problem\/(\w+)/,
];

/** Returns null for anything that is not a Codeforces problem. */
export function parseProblem(p: CompanionProblem): ProblemInfo | null {
  for (const re of URL_PATTERNS) {
    const m = p.url.match(re);
    if (!m) continue;
    const [, contestId, index] = m;
    // Strip the "A. " prefix Codeforces puts in front of the title.
    const title = p.name.replace(/^\s*\w+\.\s*/, '');
    return { contestId, index, className: toClassName(index, title) };
  }
  return null;
}

/** "A" + "Closest Point!" -> "A_Closest_Point" (always a valid Java identifier). */
export function toClassName(index: string, title: string): string {
  const words = title.split(/[^A-Za-z0-9]+/).filter(Boolean);
  return [index, ...words].join('_');
}

export const CURSOR_MARKER = '${cursor}';

/** Fills the template and reports where the cursor marker was (then removes it). */
export function renderTemplate(
  template: string,
  className: string,
): { text: string; cursorOffset: number } {
  const filled = template.replace(/CLASS_NAME/g, className);
  const at = filled.indexOf(CURSOR_MARKER);
  if (at === -1) return { text: filled, cursorOffset: filled.length };
  return {
    text: filled.slice(0, at) + filled.slice(at + CURSOR_MARKER.length),
    cursorOffset: at,
  };
}

export const DEFAULT_TEMPLATE = `import java.io.*;

public class CLASS_NAME {

    public static void main(String[] args) throws Exception {
        FastScanner fs = new FastScanner(System.in);
        StringBuilder out = new StringBuilder();

        int t = fs.nextInt();

        while (t-- > 0) {
            int n = fs.nextInt();
            \${cursor}
        }
        System.out.print(out);
    }

    static class FastScanner {
        private final byte[] buffer = new byte[1 << 16];
        private int ptr = 0, len = 0;
        private final InputStream in;

        FastScanner(InputStream in) {
            this.in = in;
        }

        int read() throws IOException {
            if (ptr >= len) {
                len = in.read(buffer);
                ptr = 0;

                if (len <= 0) {
                    return -1;
                }
            }

            return buffer[ptr++];
        }

        int nextInt() throws IOException {
            return (int) nextLong();
        }

        long nextLong() throws IOException {
            int c;
            long val = 0;
            boolean neg = false;

            do {
                c = read();
            } while (c != -1 && c <= ' ');

            if (c == -1) {
                throw new EOFException();
            }

            if (c == '-') {
                neg = true;
                c = read();
            }

            while (c > ' ') {
                val = val * 10 + (c - '0');
                c = read();
            }

            return neg ? -val : val;
        }
    }
}
`;
