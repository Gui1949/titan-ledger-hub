// src/domain/events/DomainEvent.ts

export interface DomainEvent<T = any> {
  readonly eventId: string;
  readonly eventType: string;
  readonly aggregateId: string;
  readonly occurredOn: Date;
  readonly payload: T;
}
