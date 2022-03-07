import * as childProcess from 'child_process';
import { TaskfileTask } from '../taskfiletask';

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

export function uniqe(value: TaskfileTask, index: number, self: TaskfileTask[]) {
  return self.findIndex((selfValue) => selfValue.id === value.id) === index;
}
