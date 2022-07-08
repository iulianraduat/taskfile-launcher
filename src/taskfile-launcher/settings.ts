import * as vscode from 'vscode';

export function getTaskfileNames() {
  return vscode.workspace
    .getConfiguration()
    .get('taskfileLauncher.taskfileNames', ['Taskfile.yml']);
}

export function isResultExpanded(): boolean {
  return vscode.workspace
    .getConfiguration()
    .get('taskfileLauncher.defaultResultExpanded', false);
}

export function getShellPath(): string | undefined {
  return vscode.workspace.getConfiguration().get('taskfileLauncher.shellPath');
}

export function getShellArgs(): string[] | undefined {
  return vscode.workspace
    .getConfiguration()
    .get<string | undefined>('taskfileLauncher.shellArgs')
    ?.split(' ')
    .filter(Boolean);
}
