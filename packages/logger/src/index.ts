import pino, { type Logger, type LoggerOptions } from "pino";

export function createLogger(level = "info"): Logger {
  const options: LoggerOptions = {
    level,
    base: undefined,
    redact: {
      paths: [
        "*.token",
        "*.accessToken",
        "*.refreshToken",
        "*.apiKey",
        "*.clientSecret",
        "token",
        "accessToken",
        "refreshToken",
        "apiKey",
        "clientSecret"
      ],
      censor: "[REDACTED]"
    }
  };

  return pino(options);
}
