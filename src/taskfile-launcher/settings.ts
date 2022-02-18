import * as vscode from 'vscode';

export function getTaskfileNames() {
  return vscode.workspace.getConfiguration().get('taskfileLauncher.taskfileNames', ['Taskfile.yml']);
}

export function isResultExpanded(): boolean {
  return vscode.workspace.getConfiguration().get('findUnusedExports.defaultResultExpanded', false);
}
