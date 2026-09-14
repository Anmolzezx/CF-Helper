# Codeforces Helper

A VS Code extension for solving Codeforces problems in Java. Click **+** in [Competitive Companion](https://github.com/jmerle/competitive-companion) and it creates an organised solution file from your template, saves the sample tests, and lets you run them from a sidebar panel.

```
Codeforces problem → Competitive Companion "+" → Codeforces Helper → Codeforces/1982/A_Closest_Point.java
```

## Features

- **Organised folders.** Each contest gets its own folder, and files are named by problem letter and title:
  ```
  Codeforces/
  ├── 1982/
  │   ├── A_Closest_Point.java
  │   ├── B_Problem_Name.java
  │   └── .tests/
  │       ├── A_Closest_Point.json
  │       └── B_Problem_Name.json
  └── 1506/
      └── C_Double_ended_Strings.java
  ```
- **Java template.** New files start from a template with a fast input reader. `CLASS_NAME` is replaced with the file's class name, and the cursor is placed where you start writing.
- **Never overwrites your work.** Importing a problem again opens the existing file and keeps its tests.
- **Whole contests at once.** Clicking **+** on a contest page imports every problem.
- **Tests panel.** View, edit, add and delete tests, and run them with verdicts (Passed, Wrong Answer, Runtime Error, Time Limit Exceeded), timing, your output and any error messages.

Supports `codeforces.com` contest, problemset and gym URLs.

## Requirements

- VS Code 1.90 or newer
- A JDK (`javac` and `java` on your `PATH`, or set their paths in settings)
- The [Competitive Companion](https://github.com/jmerle/competitive-companion) browser extension
- Node.js, to build the extension

## Setup

1. **Build and start the extension.**
   ```sh
   npm install
   npm run compile
   ```
   Open this folder in VS Code and press **F5**. A second VS Code window (the Extension Development Host) opens with the extension running. Open your solutions folder in that window.

2. **Point Competitive Companion at it.** In Chrome, right-click the Competitive Companion icon → **Options**, and add `27122` to **Custom ports**.

3. **Import a problem.** Open a Codeforces problem and click **+**. The solution file opens with the cursor inside `main`.

To install it permanently instead of using F5, see [Packaging](#packaging).

## Usage

### Running tests

Click the flask icon in the activity bar to open the **Tests** panel. It shows the tests for the `.java` file you have open.

| Action | How |
| --- | --- |
| Run all tests | **▶ Run All** in the panel, **Ctrl+Alt+R**, or the ▶ button at the top right of the editor |
| Run one test | ▶ on that test |
| Add a test | **+ New Test** |
| Delete a test | ✕ on that test |
| Edit a test | Type in the **Input** or **Expected Output** box. Changes save automatically. |
| Create tests for a file without any | **+ Create Tests** |

Running saves your solution, compiles it with `javac` and runs each test.

- **Output comparison** works like Codeforces: extra spaces and blank lines are ignored, but every value must match.
- **Time limit** is the problem's limit plus 500 ms to allow for JVM startup. A test that runs longer is stopped and marked Time Limit Exceeded.
- **Stack size** is set to 256 MB (`-Xss256m`), so deep recursion doesn't crash.

### Editing tests as JSON

Run **Codeforces Helper: Edit Tests** from the Command Palette to open the current solution's test file beside the code. When you save it, the panel updates.

```json
{
  "url": "https://codeforces.com/contest/1982/problem/A",
  "timeLimit": 1000,
  "tests": [
    { "input": "2\n1 2\n", "output": "3\n" }
  ]
}
```

`timeLimit` is in milliseconds.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `cfHelper.port` | `27122` | Port the extension listens on. Must match the custom port in Competitive Companion. |
| `cfHelper.rootFolder` | `Codeforces` | Where contest folders are created: relative to the first workspace folder, or an absolute path. |
| `cfHelper.templateFile` | *(empty)* | Path to your own Java template. Leave empty to use the built-in one. |
| `cfHelper.javacPath` | `javac` | Java compiler used to run tests. |
| `cfHelper.javaPath` | `java` | Java runtime used to run tests. |

## Custom template

Set `cfHelper.templateFile` to a file containing your template. Two placeholders are supported:

- `CLASS_NAME`: replaced with the class name, for example `A_Closest_Point`.
- `${cursor}`: where the cursor is placed. It's removed from the file.

```java
import java.io.*;

public class CLASS_NAME {
    public static void main(String[] args) throws Exception {
        ${cursor}
    }
}
```

Keep the template file **outside your workspace**, or give it a non-`.java` extension such as `template.java.txt`. Otherwise Java tooling will report errors in it.

## How it works

Competitive Companion reads the problem page and sends it as JSON in an HTTP `POST` to local ports. This extension runs a server on `127.0.0.1:27122`, which only accepts connections from your own machine, and handles each request:

1. Reads the contest ID and problem letter from the URL, and the title from the problem name.
2. Builds the class name, for example `A. Closest Point` → `A_Closest_Point`.
3. Creates `<rootFolder>/<contestId>/<ClassName>.java` from the template, unless it already exists.
4. Saves the samples to `.tests/<ClassName>.json`, unless that file already exists.
5. Opens the file and places the cursor.

It works alongside other tools. Competitive Companion sends every problem to all of its ports, so CPH or CPH-NG on port 27121 can keep running.

## Project structure

```
codeforces-helper/
├── package.json            Extension manifest: commands, keybinding, panel, settings
├── src/
│   ├── extension.ts        Activation, local HTTP server, file creation
│   ├── problem.ts          URL parsing, class names, template (no VS Code dependency)
│   ├── runner.ts           Compiling, running and judging tests (no VS Code dependency)
│   ├── testsView.ts        Tests panel: file access and running
│   └── test/               Unit tests
└── media/
    ├── tests.js            Tests panel UI
    ├── tests.css           Tests panel styles, using VS Code theme colours
    └── icon.svg            Activity bar icon
```

## Development

```sh
npm install        # install dependencies
npm run watch      # recompile on change
npm test           # compile and run unit tests (needs a JDK)
```

Press **F5** to launch the extension. After changing code, reload the Extension Development Host window (**Cmd+R**) or press **F5** again.

## Packaging

To install the extension in your normal VS Code so you don't need F5:

```sh
npx @vscode/vsce package --allow-missing-repository
code --install-extension codeforces-helper-0.0.1.vsix
```

`vsce` warns that there's no LICENSE file and asks whether to continue. Answer `y`. Then reload VS Code.

## Limitations

- Codeforces only. Problems from other sites are ignored, with a warning.
- Java only.
- One VS Code window at a time can use the port. Other windows show a "port already in use" error and won't receive problems.
- Measured times include JVM startup, so they're higher than on Codeforces.
- Interactive problems and problems that read from files aren't supported.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Nothing happens when clicking **+** | Check that `27122` is in Competitive Companion's custom ports and that the extension is running. |
| "Port 27122 is already in use" | Another VS Code window has the extension running. Close it, or change `cfHelper.port` and update Competitive Companion to match. |
| "Open a workspace folder first" | Open a folder in VS Code, or set `cfHelper.rootFolder` to an absolute path. |
| Tests panel says "No tests" | The file was created before tests were saved. Click **+** on the problem again; your code isn't changed. |
| Compile fails with `javac` not found | Set `cfHelper.javacPath` and `cfHelper.javaPath` to full paths, for example `/usr/bin/javac`. |
| Java Projects shows `Codeforces/1506` as one item | That view lists folders as packages. Use the normal Explorer (**Cmd+Shift+E**) to see the folder tree. |
