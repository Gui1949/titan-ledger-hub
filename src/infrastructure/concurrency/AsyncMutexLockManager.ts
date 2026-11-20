// src/infrastructure/concurrency/AsyncMutexLockManager.ts
import { ILockManager } from '../../application/ports/concurrency/ILockManager.js';
import { ConcorrenciaLockTimeoutError } from '../../application/errors/application-errors.js';

export class AsyncMutexLockManager implements ILockManager {
  private readonly mutexes = new Map<string, Promise<void>>();

  public async runWithLocks<T>(
    resourceKeys: string[],
    task: () => Promise<T>,
    timeoutMs: number = 5000
  ): Promise<T> {
    if (resourceKeys.length === 0) {
      return await task();
    }

    // 1. Elimina duplicatas e ordena alfabeticamente (PREVENÇÃO DE DEADLOCK)
    const sortedKeys = Array.from(new Set(resourceKeys)).sort();

    // 2. Adquire locks em sequência estrita
    const unlockFunctions: Array<() => void> = [];

    try {
      for (const key of sortedKeys) {
        const unlock = await this.acquireLock(key, timeoutMs, sortedKeys);
        unlockFunctions.push(unlock);
      }

      // 3. Executa a tarefa sob proteção de lock exclusivo
      return await task();
    } finally {
      // 4. Libera na ordem inversa (LIFO)
      while (unlockFunctions.length > 0) {
        const unlock = unlockFunctions.pop()!;
        unlock();
      }
    }
  }

  private acquireLock(key: string, timeoutMs: number, allKeys: string[]): Promise<() => void> {
    return new Promise((resolve, reject) => {
      let isTimedOut = false;
      const timer = setTimeout(() => {
        isTimedOut = true;
        reject(new ConcorrenciaLockTimeoutError(allKeys));
      }, timeoutMs);

      const currentLock = this.mutexes.get(key) || Promise.resolve();

      let releaseNext: () => void;
      const nextLock = new Promise<void>((res) => {
        releaseNext = res;
      });

      // Encadeia o lock
      this.mutexes.set(key, nextLock);

      currentLock.then(() => {
        clearTimeout(timer);
        if (isTimedOut) return;

        resolve(() => {
          releaseNext();
          if (this.mutexes.get(key) === nextLock) {
            this.mutexes.delete(key);
          }
        });
      });
    });
  }
}
