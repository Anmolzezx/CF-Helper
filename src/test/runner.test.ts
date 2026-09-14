import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { CompileError, compile, outputsMatch, runTest, testFilePath } from '../runner';

const tools = { javac: 'javac', java: 'java' };

async function javaFile(className: string, main: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cfh-test-'));
  const file = path.join(dir, `${className}.java`);
  await fs.writeFile(file, `import java.util.*;\npublic class ${className} { public static void main(String[] a) { ${main} } }`);
  return file;
}

test('outputsMatch ignores whitespace differences only', () => {
  assert.ok(outputsMatch('1 2\n3\n', '1 2 3'));
  assert.ok(!outputsMatch('1 2 3', '1 2'));
  assert.ok(!outputsMatch('YES', 'yes'));
});

test('testFilePath', () => {
  assert.equal(testFilePath('/cf/1982/A_X.java'), '/cf/1982/.tests/A_X.json');
});

test('AC, WA, RE and TLE verdicts', async () => {
  const file = await javaFile(
    'Sum',
    `Scanner s = new Scanner(System.in); int x = s.nextInt();
     if (x == -1) throw new RuntimeException("boom");
     if (x == -2) while (true) {}
     System.out.println(x + s.nextInt());`,
  );
  const dir = await compile(file, tools);
  const run = (input: string, output: string) => runTest(dir, 'Sum', { input, output }, 1000, tools);

  assert.equal((await run('2 3\n', '5\n')).verdict, 'AC');
  assert.equal((await run('2 3\n', '6\n')).verdict, 'WA');
  const re = await run('-1\n', '');
  assert.equal(re.verdict, 'RE');
  assert.match(re.stderr, /boom/);
  assert.equal((await run('-2\n', '')).verdict, 'TLE');
});

test('compile error is reported', async () => {
  const file = await javaFile('Bad', 'int x = ;');
  await assert.rejects(compile(file, tools), CompileError);
});
