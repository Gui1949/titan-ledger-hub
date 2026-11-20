// src/application/use-cases/processar-transferencia-pix/ProcessarTransferenciaPixDTO.ts

export interface ProcessarTransferenciaPixInputDTO {
  idempotencyKey: string;
  contaOrigemId: string;
  chavePixDestino: string;
  valorCentavos: number;
  descricao?: string;
  endToEndId?: string;
}

export interface ProcessarTransferenciaPixOutputDTO {
  transacaoId: string;
  endToEndId: string;
  status: string;
  contaOrigemId: string;
  contaDestinoId: string;
  valorCentavos: number;
  lancamentoDebitoId: string;
  lancamentoCreditoId: string;
  saldoRemanescenteOrigemCentavos: number;
  saldoAtualDestinoCentavos: number;
  efetivadoEm: string;
  reutilizouIdempotencia: boolean;
}
