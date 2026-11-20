// src/application/ports/concurrency/ILockManager.ts

export interface ILockManager {
  runWithLocks<T>(
    resourceKeys: string[],
    task: () => Promise<T>,
    timeoutMs?: number
  ): Promise<T>;
}
