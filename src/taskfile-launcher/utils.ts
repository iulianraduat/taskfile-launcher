import * as childProcess from 'child_process';
import { TTaskfileTask } from '../taskfiletask';

export function execute(command: string): Promise<string> {
  return new Promise(function (resolve, reject) {
    childProcess.exec(command, (error, stdout, stderr) => {
      if (error) {
        reject();
        return;
      }

      if (stderr) {
        reject(stderr);
        return;
      }

      resolve(stdout);
    });
  });
}

export function uniqe(value: TTaskfileTask, index: number, self: TTaskfileTask[]) {
  return self.findIndex((selfValue) => selfValue.id === value.id) === index;
}
