import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { Request, Response, NextFunction } from "express";

function resolveJwtSecret(): string {
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.trim().length >= 16) {
    return process.env.JWT_SECRET.trim();
  }
  const dataDir = path.resolve(process.cwd(), ".data");
  const secretPath = path.join(dataDir, ".jwt_secret");
  try {
    if (fs.existsSync(secretPath)) {
      const existing = fs.readFileSync(secretPath, "utf8").trim();
      if (existing.length >= 32) return existing;
    }
    fs.mkdirSync(dataDir, { recursive: true });
    const generated = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(secretPath, generated, { encoding: "utf8", mode: 0o600 });
    return generated;
  } catch {
    return crypto.randomBytes(32).toString("hex");
  }
}

const JWT_SECRET = resolveJwtSecret();
const TOKEN_TTL_SEC = 12 * 3600;

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface AuthedRequest extends Request {
  user?: AuthUser;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 2) return false;
  const [salt, expectedHex] = parts;
  const actual = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, "hex");
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function unb64url(input: string): Buffer {
  const pad = 4 - (input.length % 4 || 4);
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + (pad < 4 ? "=".repeat(pad) : "");
  return Buffer.from(b64, "base64");
}

export function createAccessToken(user: AuthUser): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      jti: crypto.randomUUID(),
      iat: now,
      exp: now + TOKEN_TTL_SEC,
    })
  );
  const sig = b64url(crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${sig}`;
}

export function verifyAccessToken(token: string): AuthUser | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, payload, sig] = parts;
    const expectedSig = b64url(crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${payload}`).digest());
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
      return null;
    }
    const decoded = JSON.parse(unb64url(payload).toString("utf8"));
    if (!decoded.sub || !decoded.exp || decoded.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return {
      id: String(decoded.sub),
      email: String(decoded.email || ""),
      name: String(decoded.name || ""),
      role: String(decoded.role || "teacher"),
    };
  } catch {
    return null;
  }
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    res.status(401).json({ detail: "Authentication required" });
    return;
  }
  const user = verifyAccessToken(authHeader.slice(7).trim());
  if (!user) {
    res.status(401).json({ detail: "Invalid or expired session token" });
    return;
  }
  req.user = user;
  next();
}
