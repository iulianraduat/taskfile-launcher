import * as glob from 'glob';
import * as path from 'path';
import * as vscode from 'vscode';
import { readJsonFile } from './taskfile-launcher/fsUtils';
import { log } from './taskfile-launcher/log';
import { getTaskfileNames, isResultExpanded } from './taskfile-launcher/settings';
import { execute, uniqe } from './taskfile-launcher/utils';
import { DEPENDENCY_TYPE, TTaskfileTask } from './taskfiletask';

const taskRe = /\* ([^ ]+):[ \t]*([^\r\n]*)/g;

export class TaskfileLauncherProvider implements vscode.TreeDataProvider<TTaskfileTask> {
  private cacheFiles: TTaskfileTask[] | undefined;

  private _onDidChangeTreeData: vscode.EventEmitter<TTaskfileTask | undefined> = new vscode.EventEmitter<
    TTaskfileTask | undefined
  >();
  public readonly onDidChangeTreeData: vscode.Event<TTaskfileTask | undefined> = this._onDidChangeTreeData.event;

  constructor(private workspaceFolders: string[]) {
    this.refresh();
  }

  public async refresh() {
    this.cacheFiles = await new Promise(async (resolve) => {
      if (!(await this.isTaskCommandPresent())) {
        resolve([NoTaskExecutable]);
        return;
      }

      const taskfileNames = getTaskfileNames();
      const globs = this.workspaceFolders.flatMap((folder) => [
        ...taskfileNames.map((name) => `${folder}${path.sep}${name}`),
        ...this.getGlobFromPackageJson(folder),
        ...this.getGlobFromTaskfileLauncherJson(folder),
      ]);
      log('Declared globs for Taskfile.yml like files', globs);

      const cacheFiles: TTaskfileTask[] = (await Promise.all(globs.flatMap(findTasks))).filter(uniqe);

      if (cacheFiles.length === 0) {
        resolve([NoTaskfileFound]);
        return;
      }

      resolve(cacheFiles);
    });
    this._onDidChangeTreeData.fire(undefined);
  }

  private getGlobFromPackageJson(pathToPrj: string) {
    const pathToPackageJson = path.resolve(pathToPrj, 'package.json');
    const packageJson = readJsonFile(pathToPackageJson);
    return this.fixPath(pathToPrj, packageJson?.taskfileLauncher);
  }

  private getGlobFromTaskfileLauncherJson(pathToPrj: string) {
    const pathToFindUnusedExportsConfig = path.resolve(pathToPrj, '.taskfileLauncher.json');
    return this.fixPath(pathToPrj, readJsonFile(pathToFindUnusedExportsConfig) as string[]);
  }

  private fixPath(pathToPrj: string, files?: string[]) {
    if (files === undefined) {
      return [];
    }

    return files.map((f) => path.resolve(pathToPrj, f));
  }

  public findInFile(task: TTaskfileTask): any {
    const filePath = task.command?.arguments?.[0] || '';
    const taskName = (task.command?.arguments?.[1] || '') + ':';
    vscode.workspace.openTextDocument(filePath).then((doc) => {
      vscode.window.showTextDocument(doc).then(() => {
        const editor: vscode.TextEditor | undefined = vscode.window.activeTextEditor;
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
    const terminal = vscode.window.createTerminal(`Run task ${taskName} from ${filePath}`);
    terminal.show();
    terminal.sendText(`task -t ${filePath} ${taskName}`);
  }

  private async isTaskCommandPresent(): Promise<boolean> {
    try {
      /* We check if task executable is accesible */
      execute('task --version');
      return true;
    } catch (err) {
      return false;
    }
  }

  /* TreeDataProvider specific functions */

  public getParent(element: TTaskfileTask) {
    return element.parent;
  }

  public getTreeItem(element: TTaskfileTask): vscode.TreeItem {
    return element;
  }

  public getChildren(element?: TTaskfileTask): Thenable<TTaskfileTask[]> {
    if (element) {
      return Promise.resolve(this.tasksInFile(element));
    }

    return Promise.resolve(this.getFiles());
  }

  private getFiles(): TTaskfileTask[] {
    return this.cacheFiles ?? [];
  }
  private tasksInFile(node: TTaskfileTask): TTaskfileTask[] {
    const mapFn = this.mapTask2TreeNode(node);
    return node.tasks?.map(mapFn) ?? [];
  }

  private mapTask2TreeNode(node: TTaskfileTask) {
    const filePath: string = node.id;
    return (task: string[]): TTaskfileTask => {
      const [taskName, taskDescription] = task;
      return new TTaskfileTask(
        node,
        `${filePath}::${taskName}`,
        DEPENDENCY_TYPE.TASK,
        taskName,
        taskDescription,
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

function findTasks(globTaskfile: string): Promise<TTaskfileTask>[] {
  return glob
    .sync(globTaskfile, {
      nodir: true,
      nosort: true,
      realpath: true,
    })
    .map(mapTaskfile);
}

async function mapTaskfile(filePath: string): Promise<TTaskfileTask> {
  const taskFile = new TTaskfileTask(
    undefined,
    filePath,
    DEPENDENCY_TYPE.FILE,
    filePath,
    undefined,
    await getTasks(filePath),
    isResultExpanded() ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed
  );
  return taskFile;
}

async function getTasks(filePath: string): Promise<string[][] | undefined> {
  try {
    /* We check if command task is accessible */
    const stdout = await execute(`task -a -t ${filePath}`);
    return Array.from(stdout.matchAll(taskRe), (m) => [m[1], m[2]]);
  } catch (err) {
    return undefined;
  }
}

const NoTaskExecutable: TTaskfileTask = new TTaskfileTask(
  undefined,
  '-',
  DEPENDENCY_TYPE.TASK_EXECUTABLE_MISSING,
  'The command task was not found. Visit taskfile.dev',
  undefined,
  undefined,
  vscode.TreeItemCollapsibleState.None
);

const NoTaskfileFound: TTaskfileTask = new TTaskfileTask(
  undefined,
  '-',
  DEPENDENCY_TYPE.TASKFILE_MISSING,
  'No taskfile was found',
  undefined,
  undefined,
  vscode.TreeItemCollapsibleState.None
);
