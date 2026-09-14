import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { CompanionProblem, parseProblem, renderTemplate } from '../problem';

const base = (name: string, url: string): CompanionProblem => ({
  name, url, group: 'Codeforces', timeLimit: 1000, memoryLimit: 256, tests: [], batch: { id: 'x', size: 1 },
});

test('contest problem', () => {
  assert.deepEqual(parseProblem(base('A. Closest Point', 'https://codeforces.com/contest/1982/problem/A')), {
    contestId: '1982', index: 'A', className: 'A_Closest_Point',
  });
});

test('problemset URL, sub-index and punctuation', () => {
  const info = parseProblem(base("E1. Let's Go! (Easy Version)", 'https://codeforces.com/problemset/problem/1982/E1'));
  assert.equal(info?.className, 'E1_Let_s_Go_Easy_Version');
});

test('non-Codeforces URL is rejected', () => {
  assert.equal(parseProblem(base('A. X', 'https://atcoder.jp/contests/abc1/tasks/abc1_a')), null);
});

test('template renders class name and cursor', () => {
  const { text, cursorOffset } = renderTemplate('class CLASS_NAME {\n  ${cursor}\n}', 'A_B');
  assert.equal(text, 'class A_B {\n  \n}');
  assert.equal(cursorOffset, 'class A_B {\n  '.length);
});
