// src/infrastructure/messaging/WebhookSignatureValidator.ts
import { createHmac, timingSafeEqual } from 'node:crypto';

export class WebhookSignatureValidator {
  /**
   * Assina um payload com chave secreta HMAC-SHA256.
   * Retorna formato canônico 'sha256=<hex>'.
   */
  public static sign(payload: string, secret: string): string {
    const hash = createHmac('sha256', secret).update(payload).digest('hex');
    return `sha256=${hash}`;
  }

  /**
   * Valida a assinatura em tempo constante (blindando contra timing attacks).
   */
  public static verify(payload: string, secret: string, headerSignature: string): boolean {
    if (!headerSignature || !headerSignature.startsWith('sha256=')) {
      return false;
    }

    const expectedSignature = this.sign(payload, secret);
    const expectedBuffer = Buffer.from(expectedSignature, 'utf-8');
    const actualBuffer = Buffer.from(headerSignature, 'utf-8');

    if (expectedBuffer.length !== actualBuffer.length) {
      return false;
    }

    return timingSafeEqual(expectedBuffer, actualBuffer);
  }
}
