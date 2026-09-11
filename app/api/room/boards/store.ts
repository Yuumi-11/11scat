import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export class BoardDeletionStore {
  private queue: Promise<unknown> = Promise.resolve();
  private directory: string;
  constructor(directory: string) { this.directory = directory; }
  async read(): Promise<string[]> {
    try { return JSON.parse(await readFile(path.join(this.directory, 'deleted-boards.json'), 'utf8')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
  }
  delete(id: string): Promise<string[]> {
    const pending = this.queue.then(async () => {
      const ids = await this.read();
      if (ids.includes(id)) return ids;
      ids.push(id);
      await mkdir(this.directory, { recursive: true });
      const file = path.join(this.directory, 'deleted-boards.json');
      await writeFile(file + '.tmp', JSON.stringify(ids)); await rename(file + '.tmp', file);
      return ids;
    });
    this.queue = pending.catch(() => undefined); return pending;
  }
}

export const boardDeletionStore = new BoardDeletionStore(process.env.DATA_DIR || (process.env.NODE_ENV === 'production' ? '/data' : path.join(process.cwd(), '.data')));
