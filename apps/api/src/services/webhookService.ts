import { createHmac, timingSafeEqual } from 'node:crypto';

export class WebhookService {
  /**
   * Generates a secure HMAC-SHA256 signature for outgoing webhook payload
   */
  generateSignature(payload: string, secret: string, timestamp: number): string {
    const signaturePayload = `${timestamp}.${payload}`;
    return createHmac('sha256', secret).update(signaturePayload).digest('hex');
  }

  /**
   * Verifies an incoming webhook HMAC signature with timestamp replay protection (default tolerance 300s)
   */
  verifySignature(
    payload: string,
    secret: string,
    signatureHeader: string,
    timestampHeader: string | number,
    toleranceSeconds = 300
  ): boolean {
    const timestamp = typeof timestampHeader === 'string' ? Number(timestampHeader) : timestampHeader;
    if (isNaN(timestamp)) return false;

    const currentTime = Math.floor(Date.now() / 1000);
    if (Math.abs(currentTime - timestamp) > toleranceSeconds) {
      return false; // Replay attack prevented
    }

    const expectedSignature = this.generateSignature(payload, secret, timestamp);

    try {
      const expectedBuffer = Buffer.from(expectedSignature, 'hex');
      const actualBuffer = Buffer.from(signatureHeader, 'hex');
      if (expectedBuffer.length !== actualBuffer.length) return false;
      return timingSafeEqual(expectedBuffer, actualBuffer);
    } catch {
      return false;
    }
  }
}

export const webhookService = new WebhookService();
