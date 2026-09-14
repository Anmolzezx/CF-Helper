// Sidebar panel (like "CPH Judge: Results") showing the active solution's tests.
// The webview owns the displayed results; this side owns files, compiling and running.
import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { CompileError, JavaTools, TestCase, TestFile, compile, runTest, testFilePath } from './runner';

type FromWebview =
  | { type: 'ready' }
  | { type: 'save'; tests: TestCase[] }
  | { type: 'run'; tests: TestCase[]; index?: number }
  | { type: 'createTests' };

const DEFAULT_TIME_LIMIT = 2000;

export class TestsViewProvider implements vscode.WebviewViewProvider {
  static readonly viewId = 'cfHelper.tests';

  private view?: vscode.WebviewView;
  private ready!: Promise<void>;
  private markReady!: () => void;
  private file?: string; // active .java file
  private running = false;

  constructor(private readonly extensionUri: vscode.Uri) {
    this.resetReady();
    this.setActiveEditor(vscode.window.activeTextEditor);
  }

  register(): vscode.Disposable {
    return vscode.Disposable.from(
      vscode.window.registerWebviewViewProvider(TestsViewProvider.viewId, this, {
        webviewOptions: { retainContextWhenHidden: true },
      }),
      vscode.window.onDidChangeActiveTextEditor((e) => this.setActiveEditor(e)),
      // Hand edits to the JSON (via "Edit Tests") show up in the panel.
      vscode.workspace.onDidSaveTextDocument((doc) => {
        if (this.file && doc.fileName === testFilePath(this.file)) this.pushState();
      }),
    );
  }

  resolveWebviewView(view: vscode.WebviewView) {
    this.view = view;
    const media = vscode.Uri.joinPath(this.extensionUri, 'media');
    view.webview.options = { enableScripts: true, localResourceRoots: [media] };
    view.webview.html = this.html(view.webview, media);
    view.webview.onDidReceiveMessage((m: FromWebview) =>
      this.onMessage(m).catch((err) => vscode.window.showErrorMessage(`Codeforces Helper: ${err.message ?? err}`)),
    );
    view.onDidDispose(() => {
      this.view = undefined;
      this.resetReady();
    });
  }

  /** Ctrl+Alt+R: show the panel, then let it send its current (possibly unsaved) tests to run. */
  async runAllFromCommand() {
    await vscode.commands.executeCommand(`${TestsViewProvider.viewId}.focus`);
    await this.ready;
    this.post({ type: 'requestRun' });
  }

  refresh() {
    this.pushState();
  }

  private resetReady() {
    this.ready = new Promise((resolve) => (this.markReady = resolve));
  }

  private setActiveEditor(editor: vscode.TextEditor | undefined) {
    // Focus moving to a panel or output view gives `undefined`; keep showing the last solution.
    if (!editor || editor.document.uri.scheme !== 'file') return;
    const f = editor.document.fileName;
    const next = f.endsWith('.java') ? f : undefined;
    if (next === this.file) return;
    this.file = next;
    this.pushState();
  }

  private async onMessage(m: FromWebview) {
    switch (m.type) {
      case 'ready':
        this.markReady();
        await this.pushState();
        break;
      case 'save':
        await this.saveTests(m.tests);
        break;
      case 'createTests':
        await this.saveTests([{ input: '', output: '' }]);
        await this.pushState();
        break;
      case 'run':
        await this.run(m.tests, m.index);
        break;
    }
  }

  private async readTestFile(file: string): Promise<TestFile | undefined> {
    try {
      return JSON.parse(await fs.readFile(testFilePath(file), 'utf8'));
    } catch {
      return undefined;
    }
  }

  private async saveTests(tests: TestCase[]) {
    if (!this.file) return;
    const existing = await this.readTestFile(this.file);
    const data: TestFile = { url: existing?.url ?? '', timeLimit: existing?.timeLimit ?? DEFAULT_TIME_LIMIT, tests };
    const target = testFilePath(this.file);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, JSON.stringify(data, null, 2));
  }

  private async pushState() {
    const file = this.file;
    const testFile = file ? await this.readTestFile(file) : undefined;
    if (file !== this.file) return; // the active file changed while reading
    this.post({
      type: 'state',
      file: file ?? null,
      className: file ? path.basename(file, '.java') : null,
      testFile: testFile ?? null,
      running: this.running,
    });
  }

  private async run(tests: TestCase[], index?: number) {
    const file = this.file;
    if (!file || this.running) return;
    this.running = true;
    try {
      await this.saveTests(tests);
      await vscode.workspace.textDocuments.find((d) => d.fileName === file)?.save();

      const indices = index === undefined ? tests.map((_, i) => i) : [index];
      this.post({ type: 'runStart', file, indices });

      const config = vscode.workspace.getConfiguration('cfHelper');
      const tools: JavaTools = { javac: config.get('javacPath', 'javac'), java: config.get('javaPath', 'java') };
      const timeLimit = (await this.readTestFile(file))?.timeLimit ?? DEFAULT_TIME_LIMIT;
      const className = path.basename(file, '.java');

      let classDir: string;
      try {
        classDir = await compile(file, tools);
      } catch (err) {
        if (!(err instanceof CompileError)) throw err;
        this.post({ type: 'compileError', file, message: err.message });
        return;
      }

      for (const i of indices) {
        this.post({ type: 'testStart', file, index: i });
        const result = await runTest(classDir, className, tests[i], timeLimit, tools);
        this.post({ type: 'result', file, index: i, result });
      }
    } finally {
      this.running = false;
      this.post({ type: 'runEnd', file });
    }
  }

  private post(message: unknown) {
    this.view?.webview.postMessage(message);
  }

  private html(webview: vscode.Webview, media: vscode.Uri): string {
    const nonce = [...Array(32)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
    const css = webview.asWebviewUri(vscode.Uri.joinPath(media, 'tests.css'));
    const js = webview.asWebviewUri(vscode.Uri.joinPath(media, 'tests.js'));
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${css}">
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}" src="${js}"></script>
</body>
</html>`;
  }
}
