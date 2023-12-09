'use strict';

import * as vscode from 'vscode';
import {
  type TaskfileDefinition,
  TaskfileLauncherProvider,
} from './taskfileLauncher';
import { TaskfileTask } from './taskfiletask';

// find-unused-exports:ignore-next-line-exports
export const activate = (context: vscode.ExtensionContext) => {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showInformationMessage('We cannot check an empty workspace!');
    return;
  }

  const taskfileLauncherProvider = new TaskfileLauncherProvider(
    workspaceFolders.map((ws) => ws.uri.fsPath)
  );
  vscode.window.registerTreeDataProvider(
    'taskfileLauncher',
    taskfileLauncherProvider
  );

  let disposable: vscode.Disposable;
  disposable = vscode.commands.registerCommand('taskfileLauncher.refresh', () =>
    taskfileLauncherProvider.refresh()
  );
  context.subscriptions.push(disposable);

  disposable = vscode.commands.registerCommand(
    'taskfileLauncher.findInFile',
    (task: TaskfileTask) => taskfileLauncherProvider.findInFile(task)
  );
  context.subscriptions.push(disposable);

  disposable = vscode.commands.registerCommand(
    'taskfileLauncher.runTask',
    (filePath: string, taskName: string) => {
      taskfileLauncherProvider.runTask(filePath, taskName);
    }
  );
  context.subscriptions.push(disposable);

  const taskProvider = vscode.tasks.registerTaskProvider('taskfile', {
    provideTasks: () => {
      const tasks = taskfileLauncherProvider.getAllTasks();
      return Promise.resolve(tasks);
    },
    resolveTask({ definition }: vscode.Task): vscode.Task | undefined {
      if (!definition.task) {
        return undefined;
      }

      const { taskfile, task } = definition as TaskfileDefinition;
      return taskfileLauncherProvider.getTask(taskfile, task);
    },
  });
  context.subscriptions.push(taskProvider);
};
