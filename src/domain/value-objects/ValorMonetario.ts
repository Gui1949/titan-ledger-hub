// src/domain/value-objects/ValorMonetario.ts
import { ValorMonetarioInvalidoError } from '../errors/domain-errors.js';

export class ValorMonetario {
  private readonly _centavos: number;

  private constructor(centavos: number) {
    this._centavos = centavos;
  }

  public static fromCentavos(centavos: number): ValorMonetario {
    if (!Number.isInteger(centavos) || centavos < 0) {
      throw new ValorMonetarioInvalidoError(`Valor deve ser um número inteiro não-negativo em centavos. Recebido: ${centavos}`);
    }
    return new ValorMonetario(centavos);
  }

  public static fromReais(reais: number): ValorMonetario {
    const centavos = Math.round(reais * 100);
    return ValorMonetario.fromCentavos(centavos);
  }

  get centavos(): number { return this._centavos; }
  get reais(): number { return this._centavos / 100; }

  public somar(outro: ValorMonetario): ValorMonetario {
    return new ValorMonetario(this._centavos + outro._centavos);
  }

  public subtrair(outro: ValorMonetario): ValorMonetario {
    const res = this._centavos - outro._centavos;
    if (res < 0) {
      throw new ValorMonetarioInvalidoError(`Subtração resultaria em saldo negativo: ${this._centavos}c - ${outro._centavos}c`);
    }
    return new ValorMonetario(res);
  }

  public maiorQue(outro: ValorMonetario): boolean { return this._centavos > outro._centavos; }
  public menorQue(outro: ValorMonetario): boolean { return this._centavos < outro._centavos; }
  public equals(outro: ValorMonetario): boolean { return this._centavos === outro._centavos; }

  public formatarBrl(): string {
    return (this._centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
}
