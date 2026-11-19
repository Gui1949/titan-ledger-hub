// src/domain/value-objects/AgenciaConta.ts
import { AgenciaContaInvalidaError } from '../errors/domain-errors.js';

export class AgenciaConta {
  public readonly banco: string;   // 3 dígitos COMPE
  public readonly agencia: string; // 4 dígitos
  public readonly conta: string;   // Número da conta
  public readonly digitoConta: string;

  private constructor(banco: string, agencia: string, conta: string, digitoConta: string) {
    this.banco = banco;
    this.agencia = agencia;
    this.conta = conta;
    this.digitoConta = digitoConta;
  }

  public static criar(banco: string, agencia: string, contaComDigito: string): AgenciaConta {
    const bancoLimpo = banco.replace(/\D/g, '').padStart(3, '0');
    if (bancoLimpo.length !== 3) {
      throw new AgenciaContaInvalidaError(`Código COMPE do banco deve ter 3 dígitos: "${banco}"`);
    }

    const agenciaLimpa = agencia.replace(/\D/g, '').padStart(4, '0');
    if (agenciaLimpa.length !== 4) {
      throw new AgenciaContaInvalidaError(`Agência deve ter 4 dígitos: "${agencia}"`);
    }

    const partesConta = contaComDigito.trim().split('-');
    if (partesConta.length !== 2) {
      throw new AgenciaContaInvalidaError(`Conta deve estar no formato número-dígito (ex: 12345-6): "${contaComDigito}"`);
    }

    const conta = partesConta[0].replace(/\D/g, '');
    const dv = partesConta[1].trim().toUpperCase();

    if (conta.length < 4 || conta.length > 12) {
      throw new AgenciaContaInvalidaError(`Número da conta deve ter entre 4 e 12 dígitos: "${conta}"`);
    }
    if (dv.length !== 1) {
      throw new AgenciaContaInvalidaError(`Dígito verificador da conta deve ter 1 caractere: "${dv}"`);
    }

    return new AgenciaConta(bancoLimpo, agenciaLimpa, conta, dv);
  }

  get formatado(): string {
    return `Banco: ${this.banco} | Ag: ${this.agencia} | CC: ${this.conta}-${this.digitoConta}`;
  }
}
