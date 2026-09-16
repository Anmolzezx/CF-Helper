import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as os from 'os';
import * as path from 'path';
import { expandHome, samePath } from '../paths';

test('expandHome', () => {
  assert.equal(expandHome('~/Documents/x'), path.join(os.homedir(), 'Documents/x'));
  assert.equal(expandHome('/abs/x'), '/abs/x');
  assert.equal(expandHome('~other/x'), '~other/x');
});

test('samePath', () => {
  assert.ok(samePath('~/Documents/GitHub/codeforces', path.join(os.homedir(), 'Documents/GitHub/codeforces/')));
  assert.ok(samePath('/Users/a/Codeforces', '/users/a/codeforces', 'darwin'));
  assert.ok(!samePath('/Users/a/Codeforces', '/users/a/codeforces', 'linux'));
  assert.ok(!samePath('/Users/a/codeforces', '/Users/a/codeforces-helper'));
});
