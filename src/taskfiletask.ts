import * as vscode from 'vscode';

export enum DEPENDENCY_TYPE {
  TASK_EXECUTABLE_MISSING,
  TASKFILE_MISSING,
  FILE,
  TASK,
}

export class TaskfileTask extends vscode.TreeItem {
  constructor(
    public readonly parent: TaskfileTask | undefined,
    public readonly id: string,
    private readonly type: DEPENDENCY_TYPE,
    public readonly label: string,
    public readonly description?: string,
    public readonly tooltip?: string,
    /* It contains [task name, task description]  */
    public readonly tasks?: string[][],
    public readonly collapsibleState?: vscode.TreeItemCollapsibleState,
    public readonly command?: vscode.Command
  ) {
    super(label, collapsibleState);

    this.iconPath = new vscode.ThemeIcon(this.getIconPath());
    this.tooltip = this.getTooltip();
    this.contextValue = this.getContextValue();
  }

  private getIconPath() {
    switch (this.type) {
      case DEPENDENCY_TYPE.TASK_EXECUTABLE_MISSING:
        return 'alert';
      case DEPENDENCY_TYPE.TASKFILE_MISSING:
        return 'alert';
      case DEPENDENCY_TYPE.FILE:
        return 'file-text';
      case DEPENDENCY_TYPE.TASK:
        return 'play';
    }
  }

  private getTooltip() {
    switch (this.type) {
      case DEPENDENCY_TYPE.TASK_EXECUTABLE_MISSING:
        return undefined;
      case DEPENDENCY_TYPE.TASKFILE_MISSING:
        return undefined;
      case DEPENDENCY_TYPE.FILE:
        return this.tooltip;
      case DEPENDENCY_TYPE.TASK:
        return 'Click to run it';
    }
  }

  private getContextValue(): string | undefined {
    switch (this.type) {
      case DEPENDENCY_TYPE.TASK_EXECUTABLE_MISSING:
        return undefined;
      case DEPENDENCY_TYPE.TASKFILE_MISSING:
        return undefined;
      case DEPENDENCY_TYPE.FILE:
        return 'file';
      case DEPENDENCY_TYPE.TASK:
        return 'task';
    }
  }
}
