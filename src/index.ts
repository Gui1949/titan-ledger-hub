// src/index.ts

// Value Objects
export * from './domain/value-objects/ChavePix.js';
export * from './domain/value-objects/ValorMonetario.js';
export * from './domain/value-objects/AgenciaConta.js';

// Entities & Aggregates
export * from './domain/entities/ContaContabil.js';
export * from './domain/entities/LancamentoContabil.js';
export * from './domain/entities/TransacaoDeTransferencia.js';
export * from './domain/entities/OutboxMessage.js';

// Domain Events
export * from './domain/events/DomainEvent.js';
export * from './domain/events/PixTransferenciaLiquidadaEvent.js';
export * from './domain/events/PixEstornoRealizadoEvent.js';

// Domain Services
export * from './domain/services/MotorContabilDoubleEntry.js';
export * from './domain/services/LedgerBalanceService.js';

// Domain Errors
export * from './domain/errors/domain-errors.js';

// Application Ports
export * from './application/ports/repositories/IContaContabilRepository.js';
export * from './application/ports/repositories/ILancamentoContabilRepository.js';
export * from './application/ports/repositories/ITransacaoRepository.js';
export * from './application/ports/repositories/IOutboxRepository.js';
export * from './application/ports/concurrency/ILockManager.js';
export * from './application/ports/unit-of-work/IUnitOfWork.js';
export * from './application/ports/messaging/IWebhookTransport.js';
export * from './application/ports/telemetry/ITelemetryCollector.js';
export * from './application/ports/health/IHealthCheckService.js';

// Application Errors
export * from './application/errors/application-errors.js';
export * from './application/errors/messaging-errors.js';

// Application Use Cases & Services
export * from './application/use-cases/processar-transferencia-pix/ProcessarTransferenciaPixDTO.js';
export * from './application/use-cases/processar-transferencia-pix/ProcessarTransferenciaPixUseCase.js';
export * from './application/use-cases/estornar-transferencia-pix/EstornarTransferenciaPixDTO.js';
export * from './application/use-cases/estornar-transferencia-pix/EstornarTransferenciaPixUseCase.js';
export * from './application/services/OutboxRelayService.js';
export * from './application/services/HealthCheckService.js';
export * from './application/services/CoreBankingCockpitEngine.js';

// Infrastructure
export * from './infrastructure/concurrency/AsyncMutexLockManager.js';
export * from './infrastructure/messaging/WebhookSignatureValidator.js';
export * from './infrastructure/telemetry/TelemetryCollector.js';
export * from './infrastructure/persistence/in-memory/InMemoryContaContabilRepository.js';
export * from './infrastructure/persistence/in-memory/InMemoryLancamentoContabilRepository.js';
export * from './infrastructure/persistence/in-memory/InMemoryTransacaoRepository.js';
export * from './infrastructure/persistence/in-memory/InMemoryOutboxRepository.js';
export * from './infrastructure/persistence/in-memory/InMemoryUnitOfWork.js';
