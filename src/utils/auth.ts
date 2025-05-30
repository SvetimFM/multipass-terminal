import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const SALT_ROUNDS = 10;

export interface TokenPayload {
  userId: string;
  email: string;
  subscriptionTier: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: '7d'
  });
}

export async function verifyToken(token: string): Promise<TokenPayload> {
  return new Promise((resolve, reject) => {
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (err) {
        reject(err);
      } else {
        resolve(decoded as TokenPayload);
      }
    });
  });
}

export function generateAgentToken(userId: string, agentId: string): string {
  return jwt.sign({ userId, agentId, type: 'agent' }, JWT_SECRET, {
    expiresIn: '30d'
  });
}

export function generateSessionToken(): string {
  return `sas_${Buffer.from(crypto.randomUUID()).toString('base64').replace(/[+/=]/g, '')}`;
}