// src/application/ports/messaging/IWebhookTransport.ts

export interface WebhookDeliveryResult {
  sucesso: boolean;
  statusCode?: number;
  erro?: string;
  duracaoMs: number;
}

export interface IWebhookTransport {
  enviar(
    url: string,
    payload: string,
    secret: string,
    headers?: Record<string, string>
  ): Promise<WebhookDeliveryResult>;
}
