'use strict';

import * as vscode from 'vscode';
import { TaskfileLauncherProvider } from './taskfileLauncher';
import { TTaskfileTask } from './taskfiletask';

// find-unused-exports:ignore-next-line-exports
export const activate = (context: vscode.ExtensionContext) => {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showInformationMessage('We cannot check an empty workspace!');
    return;
  }

  const taskfileLauncherProvider = new TaskfileLauncherProvider(workspaceFolders.map((ws) => ws.uri.fsPath));
  vscode.window.registerTreeDataProvider('taskfileLauncher', taskfileLauncherProvider);

  let disposable: vscode.Disposable;
  disposable = vscode.commands.registerCommand('taskfileLauncher.refresh', () => taskfileLauncherProvider.refresh());
  context.subscriptions.push(disposable);

  disposable = vscode.commands.registerCommand('taskfileLauncher.findInFile', (task: TTaskfileTask) =>
    taskfileLauncherProvider.findInFile(task)
  );
  context.subscriptions.push(disposable);

  disposable = vscode.commands.registerCommand('taskfileLauncher.runTask', (filePath: string, taskName: string) => {
    taskfileLauncherProvider.runTask(filePath, taskName);
  });
  context.subscriptions.push(disposable);
};
