// Compiles and runs a Java solution against saved tests. No vscode dependency.
import { spawn } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

export interface TestCase {
  input: string;
  output: string;
}

/** Stored at <contest dir>/.tests/<ClassName>.json. Edit it by hand to add tests. */
export interface TestFile {
  url: string;
  timeLimit: number; // ms
  tests: TestCase[];
}

export type Verdict = 'AC' | 'WA' | 'TLE' | 'RE';

export interface TestResult {
  verdict: Verdict;
  input: string;
  expected: string;
  actual: string;
  stderr: string;
  timeMs: number;
}

export interface JavaTools {
  javac: string;
  java: string;
}

export function testFilePath(sourcePath: string): string {
  const dir = path.dirname(sourcePath);
  return path.join(dir, '.tests', `${path.basename(sourcePath, '.java')}.json`);
}

/** Codeforces-style comparison: same whitespace-separated tokens. */
export function outputsMatch(expected: string, actual: string): boolean {
  const tokens = (s: string) => s.split(/\s+/).filter(Boolean);
  const a = tokens(expected);
  const b = tokens(actual);
  return a.length === b.length && a.every((t, i) => t === b[i]);
}

interface ProcResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  timeMs: number;
}

function runProcess(cmd: string, args: string[], input: string, timeoutMs?: number): Promise<ProcResult> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const child = spawn(cmd, args);
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill('SIGKILL');
        }, timeoutMs)
      : undefined;

    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut, timeMs: Date.now() - start });
    });
    // The program may exit without reading all input; ignore the resulting EPIPE.
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

/** Compiles into a temp dir. Returns the class dir, or throws with the compiler output. */
export async function compile(sourcePath: string, tools: JavaTools): Promise<string> {
  const hash = crypto.createHash('md5').update(sourcePath).digest('hex').slice(0, 12);
  const outDir = path.join(os.tmpdir(), 'cf-helper', hash);
  await fs.mkdir(outDir, { recursive: true });
  const r = await runProcess(tools.javac, ['-encoding', 'UTF-8', '-d', outDir, sourcePath], '');
  if (r.code !== 0) throw new CompileError(r.stderr || r.stdout);
  return outDir;
}

export class CompileError extends Error {}

export async function runTest(
  classDir: string,
  className: string,
  test: TestCase,
  timeLimitMs: number,
  tools: JavaTools,
): Promise<TestResult> {
  // JVM startup counts against wall time here, so allow some slack over the problem's limit.
  const r = await runProcess(tools.java, ['-Xss256m', '-cp', classDir, className], test.input, timeLimitMs + 500);
  const verdict: Verdict = r.timedOut
    ? 'TLE'
    : r.code !== 0
      ? 'RE'
      : outputsMatch(test.output, r.stdout)
        ? 'AC'
        : 'WA';
  return { verdict, input: test.input, expected: test.output, actual: r.stdout, stderr: r.stderr, timeMs: r.timeMs };
}
