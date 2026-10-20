import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "@shortfactory/config";

const SCRYPT_COST = 16_384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const HASH_BYTES = 32;
const SESSION_BYTES = 32;
const SESSION_COOKIE = "shortfactory_session";

type AuditEvent = "login_success" | "login_failed" | "logout" | "access_denied";
type Session = { tokenHash: string; expiresAt: number; createdAt: number };

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12) throw new Error("Password must contain at least 12 characters");
  const salt = randomBytes(16).toString("base64url");
  const derived = await derive(password, salt);
  return `scrypt$${SCRYPT_COST}$${SCRYPT_BLOCK_SIZE}$${SCRYPT_PARALLELIZATION}$${salt}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, cost, blockSize, parallelization, salt, expectedEncoded] = parts;
  const parsedCost = Number(cost);
  const parsedBlockSize = Number(blockSize);
  const parsedParallelization = Number(parallelization);
  if (!Number.isSafeInteger(parsedCost) || !Number.isSafeInteger(parsedBlockSize) || !Number.isSafeInteger(parsedParallelization) || !salt || !expectedEncoded) return false;
  try {
    const expected = Buffer.from(expectedEncoded, "base64url");
    const actual = await derive(password, salt, parsedCost, parsedBlockSize, parsedParallelization);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

async function derive(password: string, salt: string, cost = SCRYPT_COST, blockSize = SCRYPT_BLOCK_SIZE, parallelization = SCRYPT_PARALLELIZATION): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => scryptCallback(password, salt, HASH_BYTES, { N: cost, r: blockSize, p: parallelization, maxmem: 32 * 1024 * 1024 }, (error, derived) => error ? reject(error) : resolve(derived as Buffer)));
}

export class PasswordSessionAuth {
  private readonly sessions = new Map<string, Session>();

  constructor(private readonly config: AppConfig) {}

  isConfigured(): boolean { return this.config.AUTH_MODE === "password" && this.config.AUTH_PASSWORD_HASH.length > 0; }

  async login(password: string, request: FastifyRequest): Promise<string | undefined> {
    if (!this.isConfigured() || !(await verifyPassword(password, this.config.AUTH_PASSWORD_HASH))) {
      await this.audit("login_failed", request);
      return undefined;
    }
    this.prune();
    const token = randomBytes(SESSION_BYTES).toString("base64url");
    const now = Date.now();
    this.sessions.set(hashToken(token), { tokenHash: hashToken(token), createdAt: now, expiresAt: now + this.config.AUTH_SESSION_TTL_SECONDS * 1000 });
    await this.audit("login_success", request);
    return token;
  }

  async session(request: FastifyRequest): Promise<Session | undefined> {
    const token = readCookie(request.headers.cookie, this.config.AUTH_COOKIE_NAME || SESSION_COOKIE);
    if (!token) return undefined;
    const tokenHash = hashToken(token);
    const current = this.sessions.get(tokenHash);
    if (!current || current.expiresAt <= Date.now()) {
      this.sessions.delete(tokenHash);
      return undefined;
    }
    return current;
  }

  async logout(request: FastifyRequest): Promise<void> {
    const token = readCookie(request.headers.cookie, this.config.AUTH_COOKIE_NAME || SESSION_COOKIE);
    if (token) this.sessions.delete(hashToken(token));
    await this.audit("logout", request);
  }

  async audit(event: AuditEvent, request: FastifyRequest): Promise<void> {
    const record = JSON.stringify({ event, timestamp: new Date().toISOString(), requestId: request.id, ip: request.ip, userAgent: request.headers["user-agent"] ?? "unknown" });
    request.log.info({ event, requestId: request.id, ip: request.ip }, "authentication audit event");
    try {
      const file = path.resolve(this.config.AUTH_AUDIT_LOG_PATH);
      await mkdir(path.dirname(file), { recursive: true });
      await appendFile(file, `${record}\n`, "utf8");
    } catch (error) {
      request.log.warn({ err: error instanceof Error ? error.message : "audit log write failed" }, "authentication audit log unavailable");
    }
  }

  setCookie(reply: FastifyReply, token: string): void {
    const name = this.config.AUTH_COOKIE_NAME || SESSION_COOKIE;
    const secure = this.config.AUTH_COOKIE_SECURE ? "; Secure" : "";
    reply.header("set-cookie", `${name}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${this.config.AUTH_SESSION_TTL_SECONDS}${secure}`);
  }

  clearCookie(reply: FastifyReply): void {
    const name = this.config.AUTH_COOKIE_NAME || SESSION_COOKIE;
    const secure = this.config.AUTH_COOKIE_SECURE ? "; Secure" : "";
    reply.header("set-cookie", `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`);
  }

  private prune(): void {
    const now = Date.now();
    for (const [key, value] of this.sessions) if (value.expiresAt <= now) this.sessions.delete(key);
  }
}

export async function registerAuthRoutes(server: FastifyInstance, auth: PasswordSessionAuth, prefix = "/api/v1"): Promise<void> {
  server.post<{ Body: { password?: string } }>(`${prefix}/auth/login`, async (request, reply) => {
    const password = typeof request.body?.password === "string" ? request.body.password : "";
    if (!auth.isConfigured()) return reply.code(503).send({ error: "AUTH_NOT_CONFIGURED", message: "Configure AUTH_MODE=password and AUTH_PASSWORD_HASH on the server." });
    const token = await auth.login(password, request);
    if (!token) return reply.code(401).send({ error: "INVALID_CREDENTIALS", message: "Password not accepted." });
    auth.setCookie(reply, token);
    return { authenticated: true };
  });

  server.get(`${prefix}/auth/session`, async (request, reply) => {
    if (!auth.isConfigured()) return { authenticated: false, configured: false };
    const session = await auth.session(request);
    if (!session) return reply.code(401).send({ authenticated: false });
    return { authenticated: true, expiresAt: new Date(session.expiresAt).toISOString() };
  });

  server.post(`${prefix}/auth/logout`, async (request, reply) => {
    await auth.logout(request);
    auth.clearCookie(reply);
    return { authenticated: false };
  });
}

export function isPublicAuthPath(url: string): boolean {
  const pathname = url.split("?", 1)[0] ?? "";
  return pathname === "/health" || pathname === "/ready" || pathname === "/metrics" || pathname === "/api/v1/health" || pathname === "/api/v1/auth/login" || pathname === "/api/v1/auth/session" || pathname === "/api/v1/auth/logout" || pathname.endsWith("/integrations/youtube/callback") || pathname.endsWith("/integrations/tiktok/callback");
}

function hashToken(token: string): string { return createHash("sha256").update(token).digest("hex"); }

function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}
