import * as glob from 'glob';
import * as path from 'path';
import * as vscode from 'vscode';
import { pathResolve, readJsonFile } from './taskfile-launcher/fsUtils';
import { isDebugEnabled, log } from './taskfile-launcher/log';
import {
  getShellArgs,
  getShellPath,
  getTaskfileNames,
  isResultExpanded,
} from './taskfile-launcher/settings';
import { execute, uniqe } from './taskfile-launcher/utils';
import { DEPENDENCY_TYPE, TaskfileTask } from './taskfiletask';

export class TaskfileLauncherProvider
  implements vscode.TreeDataProvider<TaskfileTask>
{
  private cacheFiles: TaskfileTask[] | undefined;
  private cacheTasks: vscode.Task[] | undefined;

  private _onDidChangeTreeData: vscode.EventEmitter<TaskfileTask | undefined> =
    new vscode.EventEmitter<TaskfileTask | undefined>();
  public readonly onDidChangeTreeData: vscode.Event<TaskfileTask | undefined> =
    this._onDidChangeTreeData.event;

  constructor(private workspaceFolders: string[]) {
    this.refresh();
  }

  public async refresh() {
    this.cacheTasks = undefined;

    this.cacheFiles = await new Promise(async (resolve) => {
      if (!(await this.isTaskCommandPresent())) {
        resolve([NoTaskExecutable]);
        return;
      }

      const taskfileNames = getTaskfileNames();
      const globs: TPathGlob[] = this.workspaceFolders.flatMap((folder) => [
        ...taskfileNames.map((name) => ({ folder, globTaskfile: name })),
        ...this.getGlobFromPackageJson(folder),
        ...this.getGlobFromTaskfileLauncherJson(folder),
      ]);
      log(
        'Declared globs for Taskfile.yml like files',
        globs.map(({ folder, globTaskfile }) =>
          pathResolve(folder, globTaskfile)
        )
      );

      const cacheFiles: TaskfileTask[] = (
        await Promise.all(globs.flatMap(findTasks))
      ).filter(uniqe);

      if (cacheFiles.length === 0) {
        resolve([NoTaskfileFound]);
        return;
      }

      resolve(cacheFiles);
    });
    this._onDidChangeTreeData.fire(undefined);
  }

  private getGlobFromPackageJson(pathToPrj: string): TPathGlob[] {
    const pathToPackageJson = path.resolve(pathToPrj, 'package.json');
    const packageJson = readJsonFile(pathToPackageJson);
    return this.getPathGlob(pathToPrj, packageJson?.taskfileLauncher) ?? [];
  }

  private getGlobFromTaskfileLauncherJson(pathToPrj: string): TPathGlob[] {
    const pathToTaskfileLauncherConfig = path.resolve(
      pathToPrj,
      '.taskfileLauncher.json'
    );
    return (
      this.getPathGlob(
        pathToPrj,
        readJsonFile(pathToTaskfileLauncherConfig) as string[]
      ) ?? []
    );
  }

  private getPathGlob(
    pathToPrj: string,
    files?: string[]
  ): TPathGlob[] | undefined {
    if (files === undefined) {
      return;
    }

    return files.map((f) => ({ folder: pathToPrj, globTaskfile: f }));
  }

  public findInFile(task: TaskfileTask): any {
    const filePath = task.command?.arguments?.[0] || '';
    const taskName = (task.command?.arguments?.[1] || '') + ':';
    vscode.workspace.openTextDocument(filePath).then((doc) => {
      vscode.window.showTextDocument(doc).then(() => {
        const editor: vscode.TextEditor | undefined =
          vscode.window.activeTextEditor;
        const document: vscode.TextDocument | undefined = editor?.document;
        if (editor === undefined || document === undefined) {
          return;
        }

        const num = document.lineCount;
        for (let i = 0; i < num; i++) {
          const line = document.lineAt(i);
          if (line.text.includes(taskName)) {
            const start = line.text.indexOf(taskName);
            const end = start + taskName.length;
            editor.selection = new vscode.Selection(i, start, i, end);
            break;
          }
        }
        vscode.commands.executeCommand('actions.find');
      });
    });
  }

  public runTask(filePath: string, taskName: string) {
    const [shellPath, shellArgs, logShellPath, logShellArgs] =
      this.getShellPathArgs();

    log(
      `Starting "${taskName}" from "${filePath}" with \`${logShellPath}${logShellArgs}\``
    );
    const terminal = vscode.window.createTerminal(
      `Run task ${taskName} from ${filePath}`,
      shellPath,
      shellArgs
    );
    terminal.show();
    terminal.sendText(`task -t ${filePath} ${taskName}`);
  }

  private getShellPathArgs(): [
    string | undefined,
    string[] | undefined,
    string,
    string
  ] {
    const shellPath = getShellPath();
    const shellArgs = getShellArgs();

    const logShellPath = shellPath || vscode.env.shell;
    const logShellArgs = shellArgs?.length ? ' ' + shellArgs?.join(' ') : '';

    return [shellPath, shellArgs, logShellPath, logShellArgs];
  }

  private async isTaskCommandPresent(): Promise<boolean> {
    try {
      /* We check if task executable is accessible */
      await execute('task --version');
      return true;
    } catch (err) {
      return false;
    }
  }

  /* TreeDataProvider specific functions */

  public getParent(element: TaskfileTask): TaskfileTask | undefined {
    return element.parent;
  }

  public getTreeItem(element: TaskfileTask): vscode.TreeItem {
    return element;
  }

  public getChildren(element?: TaskfileTask): Thenable<TaskfileTask[]> {
    if (element) {
      return Promise.resolve(this.tasksInFile(element));
    }

    return Promise.resolve(this.getFiles());
  }

  private getFiles(): TaskfileTask[] {
    return this.cacheFiles ?? [];
  }

  public getAllTasks(): vscode.Task[] {
    if (this.cacheTasks) {
      return this.cacheTasks;
    }

    this.cacheTasks = this.cacheFiles
      ?.flatMap((file) => {
        if (file.parent !== undefined) {
          return undefined;
        }

        return file.tasks?.map((task) => this.getTask(file.label, task[0]));
      })
      .filter(Boolean) as vscode.Task[];
    return this.cacheTasks ?? [];
  }

  public getTask(filePath: string, taskName: string): vscode.Task {
    const [shellPath, shellArgs] = this.getShellPathArgs();
    const definition: TaskfileDefinition = {
      type: 'taskfile',
      task: taskName,
      file: filePath,
    };
    const vscodeTask = new vscode.Task(
      definition,
      vscode.TaskScope.Workspace,
      taskName,
      `taskfile`,
      new vscode.ShellExecution(`task -t ${filePath} ${taskName}`, {
        executable: shellPath,
        shellArgs: shellArgs,
      }),
      []
    );
    vscodeTask.detail = `${filePath}: ${taskName}`;
    return vscodeTask;
  }

  private tasksInFile(node: TaskfileTask): TaskfileTask[] {
    const mapFn = this.mapTask2TreeNode(node);
    return node.tasks?.map(mapFn) ?? [];
  }

  private mapTask2TreeNode(node: TaskfileTask) {
    const filePath: string = node.id;
    return (task: string[]): TaskfileTask => {
      const [taskName, taskDescription] = task;
      return new TaskfileTask(
        node,
        `${filePath}::${taskName}`,
        DEPENDENCY_TYPE.TASK,
        taskName,
        taskDescription,
        undefined,
        undefined,
        vscode.TreeItemCollapsibleState.None,
        {
          command: 'taskfileLauncher.runTask',
          title: 'Run this task',
          arguments: [filePath, taskName],
        }
      );
    };
  }
}

function findTasks(pathGlob: TPathGlob): Promise<TaskfileTask>[] {
  const { folder, globTaskfile } = pathGlob;
  const globFile = pathResolve(folder, globTaskfile);
  return glob
    .sync(globTaskfile, {
      cwd: folder,
      nodir: true,
      realpath: true,
      absolute: true,
    })
    .map((file) => {
      log(`Glob '${globFile}' found '${file}'`);
      return mapTaskfile(file);
    });
}

async function mapTaskfile(filePath: string): Promise<TaskfileTask> {
  const label = getPathRelativeToWorkspace(filePath);

  const taskFile = new TaskfileTask(
    undefined,
    filePath,
    DEPENDENCY_TYPE.FILE,
    label,
    undefined,
    filePath,
    await getTasks(filePath),
    isResultExpanded()
      ? vscode.TreeItemCollapsibleState.Expanded
      : vscode.TreeItemCollapsibleState.Collapsed
  );
  return taskFile;
}

function getPathRelativeToWorkspace(filePath: string) {
  const workspaceFolders = vscode.workspace.workspaceFolders!;

  if (
    workspaceFolders.length === 1 &&
    isDefaultFolderName(workspaceFolders[0])
  ) {
    return filePath;
  }

  for (const wsf of workspaceFolders) {
    const rootPath = wsf.uri.fsPath;
    if (filePath.startsWith(rootPath) === false) {
      continue;
    }

    const relativePath = filePath.substring(rootPath.length);
    return wsf.name + ' ' + relativePath;
  }
  return filePath;
}

function isDefaultFolderName(wsf: vscode.WorkspaceFolder) {
  return wsf.name === path.basename(wsf.uri.fsPath);
}

const reTask = /\* ([^ ]+):[ \t]*([^\r\n]*)/g;
async function getTasks(filePath: string): Promise<string[][] | undefined> {
  try {
    const cmd = `task -a -t ${filePath}`;
    log('Execute', cmd);
    const stdout = await execute(cmd);
    const tasks = Array.from(stdout.matchAll(reTask), (m) => [m[1], m[2]]);

    const logMessages: string[] = [];
    logMessages.push(cmd);
    if (isDebugEnabled()) {
      stdout.split(/\r?\n/).forEach((line) => logMessages.push('> ' + line));

      logMessages.push(' Detected tasks:');
      tasks.forEach((taskMeta) =>
        logMessages.push(`< ${taskMeta[0]} - ${taskMeta[1]}`)
      );
      logMessages.push('');
    }
    log(logMessages.join('\n'));

    return tasks;
  } catch (err: any) {
    log('Error', err?.message);
    return undefined;
  }
}

const NoTaskExecutable: TaskfileTask = new TaskfileTask(
  undefined,
  '-',
  DEPENDENCY_TYPE.TASK_EXECUTABLE_MISSING,
  'The command task was not found. Visit taskfile.dev',
  undefined,
  undefined,
  undefined,
  vscode.TreeItemCollapsibleState.None
);

const NoTaskfileFound: TaskfileTask = new TaskfileTask(
  undefined,
  '-',
  DEPENDENCY_TYPE.TASKFILE_MISSING,
  'No taskfile was found',
  undefined,
  undefined,
  undefined,
  vscode.TreeItemCollapsibleState.None
);

interface TPathGlob {
  folder: string;
  globTaskfile: string;
}

export interface TaskfileDefinition extends vscode.TaskDefinition {
  /** The task name */
  task: string;
  /** The taskfile containing the task */
  file: string;
}
