// src/index.ts

// Value Objects
export * from './domain/value-objects/ChavePix.js';
export * from './domain/value-objects/ValorMonetario.js';
export * from './domain/value-objects/AgenciaConta.js';

// Entities & Aggregates
export * from './domain/entities/ContaContabil.js';
export * from './domain/entities/LancamentoContabil.js';
export * from './domain/entities/TransacaoDeTransferencia.js';

// Domain Services
export * from './domain/services/MotorContabilDoubleEntry.js';
export * from './domain/services/LedgerBalanceService.js';

// Domain Errors
export * from './domain/errors/domain-errors.js';

// Application Ports
export * from './application/ports/repositories/IContaContabilRepository.js';
export * from './application/ports/repositories/ILancamentoContabilRepository.js';
export * from './application/ports/repositories/ITransacaoRepository.js';
export * from './application/ports/concurrency/ILockManager.js';
export * from './application/ports/unit-of-work/IUnitOfWork.js';

// Application Errors
export * from './application/errors/application-errors.js';

// Application Use Cases
export * from './application/use-cases/processar-transferencia-pix/ProcessarTransferenciaPixDTO.js';
export * from './application/use-cases/processar-transferencia-pix/ProcessarTransferenciaPixUseCase.js';
export * from './application/use-cases/estornar-transferencia-pix/EstornarTransferenciaPixDTO.js';
export * from './application/use-cases/estornar-transferencia-pix/EstornarTransferenciaPixUseCase.js';

// Infrastructure
export * from './infrastructure/concurrency/AsyncMutexLockManager.js';
export * from './infrastructure/persistence/in-memory/InMemoryContaContabilRepository.js';
export * from './infrastructure/persistence/in-memory/InMemoryLancamentoContabilRepository.js';
export * from './infrastructure/persistence/in-memory/InMemoryTransacaoRepository.js';
export * from './infrastructure/persistence/in-memory/InMemoryUnitOfWork.js';
