import * as http from 'http';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  CompanionProblem,
  DEFAULT_TEMPLATE,
  parseProblem,
  renderTemplate,
} from './problem';
import { expandHome, samePath } from './paths';
import { TestFile, testFilePath } from './runner';
import { TestsViewProvider } from './testsView';

let server: http.Server | undefined;
let testsView: TestsViewProvider;

export function activate(context: vscode.ExtensionContext) {
  testsView = new TestsViewProvider(context.extensionUri);
  context.subscriptions.push(
    testsView.register(),
    vscode.commands.registerCommand('cfHelper.runTests', () => testsView.runAllFromCommand()),
    vscode.commands.registerCommand('cfHelper.openTests', openTests),
    vscode.workspace.onDidChangeWorkspaceFolders(() => updateServer()),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('cfHelper.port') || e.affectsConfiguration('cfHelper.workspaceFolder')) {
        updateServer(true);
      }
    }),
    { dispose: stopServer },
  );
  updateServer();
}

export function deactivate() {
  stopServer();
}

/**
 * With cfHelper.workspaceFolder set, only the window that has that folder open receives problems;
 * other VS Code windows leave the port alone. Without it, the first window to start wins.
 */
function problemsWorkspace(): string | undefined {
  const configured = vscode.workspace.getConfiguration('cfHelper').get<string>('workspaceFolder', '');
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (!configured) return folders[0]?.uri.fsPath;
  return folders.find((f) => samePath(f.uri.fsPath, configured))?.uri.fsPath;
}

function updateServer(restart = false) {
  const configured = vscode.workspace.getConfiguration('cfHelper').get<string>('workspaceFolder', '');
  const shouldListen = !configured || problemsWorkspace() !== undefined;
  if (server && (restart || !shouldListen)) stopServer();
  if (shouldListen && !server) startServer();
}

function stopServer() {
  server?.close();
  server = undefined;
}

function startServer() {
  const port = vscode.workspace.getConfiguration('cfHelper').get<number>('port', 27122);

  const s = http.createServer((req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(405).end();
      return;
    }
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      // Answer immediately; Competitive Companion doesn't wait for file creation.
      res.writeHead(200).end();
      handleBody(body).catch((err) =>
        vscode.window.showErrorMessage(`Codeforces Helper: ${err.message ?? err}`),
      );
    });
  });

  s.on('error', (err: NodeJS.ErrnoException) => {
    if (server === s) server = undefined; // lets a later folder/config change retry
    const msg =
      err.code === 'EADDRINUSE'
        ? `port ${port} is already in use (another VS Code window may own it).`
        : err.message;
    vscode.window.showErrorMessage(`Codeforces Helper: ${msg}`);
  });

  // Localhost only: nothing outside this machine can create files.
  s.listen(port, '127.0.0.1');
  server = s;
}

async function handleBody(body: string) {
  const problem = JSON.parse(body) as CompanionProblem;
  const info = parseProblem(problem);
  if (!info) {
    vscode.window.showWarningMessage(`Codeforces Helper: not a Codeforces problem (${problem.url})`);
    return;
  }

  const contestDir = path.join(await resolveRoot(), info.contestId);
  const filePath = path.join(contestDir, `${info.className}.java`);
  await fs.mkdir(contestDir, { recursive: true });

  const { text, cursorOffset } = renderTemplate(await loadTemplate(), info.className);
  let created = true;
  try {
    // 'wx' fails if the file exists, so an existing solution is never overwritten.
    await fs.writeFile(filePath, text, { flag: 'wx' });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    created = false;
  }

  const testFile: TestFile = { url: problem.url, timeLimit: problem.timeLimit, tests: problem.tests };
  const testPath = testFilePath(filePath);
  await fs.mkdir(path.dirname(testPath), { recursive: true });
  try {
    // Keep existing test files so hand-added tests survive re-importing.
    await fs.writeFile(testPath, JSON.stringify(testFile, null, 2), { flag: 'wx' });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
  }
  testsView.refresh(); // the solution may already be the active editor

  const doc = await vscode.workspace.openTextDocument(filePath);
  const editor = await vscode.window.showTextDocument(doc, { preview: false });
  if (created) {
    const pos = doc.positionAt(cursorOffset);
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(new vscode.Range(pos, pos));
  }
}

async function resolveRoot(): Promise<string> {
  const root = vscode.workspace.getConfiguration('cfHelper').get<string>('rootFolder', 'Codeforces');
  if (path.isAbsolute(root)) return root;
  const ws = problemsWorkspace();
  if (!ws) throw new Error('open a workspace folder first (or set cfHelper.rootFolder to an absolute path).');
  return path.join(ws, root);
}

function activeJavaFile(): vscode.TextDocument {
  const doc = vscode.window.activeTextEditor?.document;
  if (!doc || !doc.fileName.endsWith('.java')) throw new Error('open a .java solution first.');
  return doc;
}

async function openTests() {
  try {
    const doc = activeJavaFile();
    await vscode.window.showTextDocument(vscode.Uri.file(testFilePath(doc.fileName)), { viewColumn: vscode.ViewColumn.Beside });
  } catch (err) {
    vscode.window.showErrorMessage(`Codeforces Helper: ${(err as Error).message}`);
  }
}

async function loadTemplate(): Promise<string> {
  const file = vscode.workspace.getConfiguration('cfHelper').get<string>('templateFile', '');
  return file ? fs.readFile(expandHome(file), 'utf8') : DEFAULT_TEMPLATE;
}
