// src/application/use-cases/estornar-transferencia-pix/EstornarTransferenciaPixDTO.ts

export interface EstornarTransferenciaPixInputDTO {
  transacaoId: string;
  motivoEstorno: string;
}

export interface EstornarTransferenciaPixOutputDTO {
  transacaoOriginalId: string;
  transacaoEstornoId: string;
  statusOriginal: string;
  statusEstorno: string;
  valorEstornadoCentavos: number;
  estornadoEm: string;
  saldoRestauradoOrigemCentavos: number;
  saldoRestauradoDestinoCentavos: number;
}
