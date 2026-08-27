const SENSITIVE_KEY_PATTERN =
  /^(password|token|refreshtoken|authorization|cookie|apikey|secret|keyhash|tokenhash|passwordhash|set-cookie)$/i;

export function redactSensitive<T>(data: T): T {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'string') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => redactSensitive(item)) as unknown as T;
  }

  if (typeof data === 'object') {
    const redacted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        redacted[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        redacted[key] = redactSensitive(value);
      } else {
        redacted[key] = value;
      }
    }
    return redacted as T;
  }

  return data;
}
