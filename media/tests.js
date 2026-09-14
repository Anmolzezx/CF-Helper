// @ts-check
(function () {
  // @ts-ignore acquireVsCodeApi is injected by VS Code
  const vscode = acquireVsCodeApi();
  const app = /** @type {HTMLElement} */ (document.getElementById('app'));

  /** Latest state from the extension: { file, className, testFile, running } */
  let state = null;
  /** Results per file, so switching tabs keeps them: file -> { results: [], compileError, runningIndex } */
  const byFile = {};
  let running = false;
  let saveTimer;
  /** Per-test DOM handles for in-place result updates (re-rendering would steal textarea focus). */
  let cards = [];
  let summaryEl, compileEl;

  const VERDICT_TEXT = { AC: 'Passed', WA: 'Wrong Answer', RE: 'Runtime Error', TLE: 'Time Limit Exceeded' };

  function runs(file) {
    return (byFile[file] ??= { results: [], compileError: null, runningIndex: null });
  }

  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    const { dataset, ...rest } = props;
    Object.assign(node, rest);
    Object.assign(node.dataset, dataset); // `dataset` itself is read-only
    for (const c of children) if (c != null) node.append(c);
    return node;
  }

  function tests() {
    return state.testFile.tests;
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => vscode.postMessage({ type: 'save', tests: tests() }), 300);
  }

  function run(index) {
    if (running || !state?.testFile) return;
    clearTimeout(saveTimer); // the run message carries the latest tests and saves them
    vscode.postMessage({ type: 'run', tests: tests(), index });
  }

  function autosize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 2 + 'px';
  }

  // ---------- rendering ----------

  function render() {
    app.replaceChildren();
    cards = [];
    if (!state || !state.file) {
      app.append(el('p', { className: 'empty', textContent: 'Open a Java solution to see its tests.' }));
      return;
    }
    if (!state.testFile) {
      app.append(
        el('p', { className: 'empty', textContent: `No tests for ${state.className}.` }),
        el('p', { className: 'empty hint', textContent: 'Click + in Competitive Companion, or create them yourself.' }),
        el('button', { className: 'primary wide', textContent: '+ Create Tests', onclick: () => vscode.postMessage({ type: 'createTests' }) }),
      );
      return;
    }

    const { testFile, className } = state;
    const header = el('div', { className: 'header' },
      el('div', { className: 'title', textContent: className }),
      el('div', { className: 'meta' },
        `Time limit: ${testFile.timeLimit} ms`,
        testFile.url ? el('span', {}, ' · ', el('a', { href: testFile.url, textContent: 'Problem' })) : null,
      ),
    );
    const toolbar = el('div', { className: 'toolbar' },
      el('button', { className: 'primary', textContent: '▶ Run All', onclick: () => run(undefined), dataset: { lock: '' } }),
      el('button', { textContent: '+ New Test', dataset: { lock: '' }, onclick: () => {
        tests().push({ input: '', output: '' });
        scheduleSave();
        render();
        cards.at(-1)?.input.focus();
      } }),
    );
    summaryEl = el('div', { className: 'summary' });
    compileEl = el('pre', { className: 'compile-error', hidden: true });
    app.append(header, toolbar, summaryEl, compileEl);

    tests().forEach((test, i) => app.append(renderCard(test, i)));
    refreshAll();
  }

  function renderCard(test, i) {
    const badge = el('span', { className: 'badge' });
    const time = el('span', { className: 'time' });
    const input = el('textarea', { value: test.input, spellcheck: false, rows: 1 });
    const expected = el('textarea', { value: test.output, spellcheck: false, rows: 1 });
    const actual = el('pre', { className: 'output' });
    const stderr = el('pre', { className: 'stderr', hidden: true });
    const received = el('div', { hidden: true }, el('label', { textContent: 'Received Output' }), actual, stderr);

    const onEdit = (field, textarea) => () => {
      test[field] = textarea.value;
      autosize(textarea);
      runs(state.file).results[i] = null; // result no longer matches the test
      refreshCard(i);
      scheduleSave();
    };
    input.addEventListener('input', onEdit('input', input));
    expected.addEventListener('input', onEdit('output', expected));

    const card = el('div', { className: 'card' },
      el('div', { className: 'card-head' },
        el('span', { className: 'name', textContent: `Test ${i + 1}` }),
        badge,
        time,
        el('span', { className: 'spacer' }),
        el('button', { className: 'icon', title: 'Run this test', textContent: '▶', dataset: { lock: '' }, onclick: () => run(i) }),
        el('button', { className: 'icon', title: 'Delete test', textContent: '✕', dataset: { lock: '' }, onclick: () => {
          tests().splice(i, 1);
          runs(state.file).results.splice(i, 1);
          scheduleSave();
          render();
        } }),
      ),
      el('label', { textContent: 'Input' }), input,
      el('label', { textContent: 'Expected Output' }), expected,
      received,
    );
    cards[i] = { card, badge, time, input, expected, received, actual, stderr };
    return card;
  }

  function refreshCard(i) {
    const c = cards[i];
    if (!c) return;
    const r = runs(state.file);
    const result = r.results[i];
    const isRunning = r.runningIndex === i;

    c.card.className = 'card' + (result ? (result.verdict === 'AC' ? ' pass' : ' fail') : '');
    c.badge.textContent = isRunning ? 'Running…' : result ? VERDICT_TEXT[result.verdict] : '';
    c.badge.className = 'badge' + (result ? ' ' + result.verdict : '');
    c.time.textContent = result && !isRunning ? `${result.timeMs} ms` : '';
    c.received.hidden = !result;
    if (result) {
      c.actual.textContent = result.actual || '(no output)';
      c.stderr.textContent = result.stderr;
      c.stderr.hidden = !result.stderr;
    }
  }

  function refreshAll() {
    if (!state?.testFile) return;
    const r = runs(state.file);
    cards.forEach((_, i) => refreshCard(i));
    for (const c of cards) requestAnimationFrame(() => (autosize(c.input), autosize(c.expected)));

    compileEl.hidden = !r.compileError;
    compileEl.textContent = r.compileError ? `Compilation error\n\n${r.compileError}` : '';

    const done = r.results.filter(Boolean);
    const passed = done.filter((x) => x.verdict === 'AC').length;
    summaryEl.textContent = running ? 'Running…' : done.length ? `${passed}/${tests().length} passed` : '';
    summaryEl.className = 'summary' + (!running && done.length ? (passed === tests().length ? ' pass' : ' fail') : '');

    for (const b of app.querySelectorAll('[data-lock]')) /** @type {HTMLButtonElement} */ (b).disabled = running;
  }

  // ---------- messages from the extension ----------

  window.addEventListener('message', (event) => {
    const m = event.data;
    const current = state && m.file === state.file;
    switch (m.type) {
      case 'state':
        // Ignore echoes of our own saves while typing in the same file.
        if (current && state.testFile && m.testFile && document.activeElement?.tagName === 'TEXTAREA') return;
        state = m;
        running = m.running;
        render();
        return;
      case 'requestRun':
        run(undefined);
        return;
      case 'runStart': {
        running = true;
        const r = runs(m.file);
        r.compileError = null;
        for (const i of m.indices) r.results[i] = null;
        break;
      }
      case 'testStart':
        runs(m.file).runningIndex = m.index;
        break;
      case 'result':
        runs(m.file).results[m.index] = m.result;
        runs(m.file).runningIndex = null;
        break;
      case 'compileError':
        runs(m.file).compileError = m.message;
        break;
      case 'runEnd':
        running = false;
        runs(m.file).runningIndex = null;
        break;
    }
    if (current || m.type === 'runEnd') refreshAll();
  });

  vscode.postMessage({ type: 'ready' });
})();
