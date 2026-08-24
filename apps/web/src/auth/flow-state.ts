import { createHash } from 'node:crypto'
import { CompactEncrypt, compactDecrypt } from 'jose'
import { z } from 'zod'
export type AuthFlowState =
 | { kind: 'email-verification'; pendingAuthenticationToken: string; returnTo: string; expiresAt: number }
 | { kind: 'magic-auth'; email: string; radarAuthAttemptId?: string; returnTo: string; expiresAt: number }
 | { kind: 'mfa'; pendingAuthenticationToken: string; challengeId?: string; returnTo: string; expiresAt: number }
 | { kind: 'radar-email' | 'radar-sms'; pendingAuthenticationToken: string; challengeId: string; returnTo: string; expiresAt: number }
 | { kind: 'oauth'; state: string; codeVerifier: string; signalsId?: string; returnTo: string; expiresAt: number }
 | { kind: 'password-reset'; token: string; expiresAt: number }
export interface FlowStateCodec { seal(state: AuthFlowState): Promise<string>; unseal(value: string, expectedKind?: AuthFlowState['kind']): Promise<AuthFlowState> }
const expiresAt = z.number().finite()
const stateSchema = z.discriminatedUnion('kind', [
 z.object({ kind: z.literal('email-verification'), pendingAuthenticationToken: z.string().min(1), returnTo: z.string().min(1), expiresAt }),
 z.object({ kind: z.literal('magic-auth'), email: z.string().email(), radarAuthAttemptId: z.string().min(1).optional(), returnTo: z.string().min(1), expiresAt }),
 z.object({ kind: z.literal('mfa'), pendingAuthenticationToken: z.string().min(1), challengeId: z.string().min(1).optional(), returnTo: z.string().min(1), expiresAt }),
 z.object({ kind: z.literal('radar-email'), pendingAuthenticationToken: z.string().min(1), challengeId: z.string().min(1), returnTo: z.string().min(1), expiresAt }),
 z.object({ kind: z.literal('radar-sms'), pendingAuthenticationToken: z.string().min(1), challengeId: z.string().min(1), returnTo: z.string().min(1), expiresAt }),
 z.object({ kind: z.literal('oauth'), state: z.string().min(1), codeVerifier: z.string().min(1), signalsId: z.string().min(1).optional(), returnTo: z.string().min(1), expiresAt }),
 z.object({ kind: z.literal('password-reset'), token: z.string().min(1), expiresAt }),
])
export function createFlowStateCodec(password: string, now = () => Date.now()): FlowStateCodec {
 const key = createHash('sha256').update(password).digest()
 return { async seal(state) { return new CompactEncrypt(new TextEncoder().encode(JSON.stringify(state))).setProtectedHeader({ alg: 'dir', enc: 'A256GCM', typ: state.kind }).encrypt(key) }, async unseal(value, expectedKind) { const { plaintext, protectedHeader } = await compactDecrypt(value, key); const state = stateSchema.parse(JSON.parse(new TextDecoder().decode(plaintext))) as AuthFlowState; if (protectedHeader.typ !== state.kind || (expectedKind && state.kind !== expectedKind) || state.expiresAt <= now()) throw new Error('Authentication flow is invalid or expired'); return state } }
}
