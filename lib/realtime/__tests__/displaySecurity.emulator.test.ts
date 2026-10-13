/** Two release blockers only. Synthetic identities/data; hardcoded loopback demo services. */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { deleteApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { get, goOffline, goOnline, ref } from 'firebase/database';
import { NextRequest } from 'next/server';
import { getDisplayDb, getStaffDb, getDisplayFirebaseApp, getStaffFirebaseApp } from '../firebaseClient';
import { signInStaff, signOutStaff, getStaffIdToken } from '../staffAuthClient';
import { subscribeToAuthState, type AuthState } from '../authClient';
import { claimControllerLease, publishSession, subscribeToLiveSession } from '../sessionRepository';
import { createSession, Difficulty, TargetSize, TargetSpacing, PlayArea } from '@/lib/game';
import { authorizeTts, reserveTtsQuota } from '@/lib/audio/ttsAccess.server';
import { POST } from '@/app/api/tts/route';

const NS = 'demo-shumos-security-default-rtdb', DB = 'http://127.0.0.1:19940', AUTH = 'http://127.0.0.1:19949/identitytoolkit.googleapis.com/v1';
const url = (p: string, token?: string) => `${DB}/${p}.json?ns=${NS}${token ? `&auth=${token}` : ''}`;
async function admin(p: string, value: unknown) {
  const r = await fetch(url(p), { method: 'PUT', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  if (!r.ok) throw Error(`Synthetic fixture ${p}: ${r.status} ${await r.text()}`);
}
async function put(p: string, value: unknown, token: string) {
  return (await fetch(url(p, token), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) })).status;
}
async function signup(email?: string) {
  const r = await fetch(`${AUTH}/accounts:signUp?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...(email ? { email, password: 'SyntheticTest123!' } : {}), returnSecureToken: true }) });
  const user = await r.json(); if (!r.ok) throw Error('Synthetic signup failed');
  return { uid: user.localId as string, token: user.idToken as string };
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function until(check: () => boolean) { for (let i = 0; i < 100; i++) { if (check()) return; await sleep(30); } throw Error('Focused security check timed out'); }
let therapist: Awaited<ReturnType<typeof signup>>, other: Awaited<ReturnType<typeof signup>>, outsider: Awaited<ReturnType<typeof signup>>;
let staffToken: string, displayToken: string, displayUid: string;
let authState: AuthState = { status: 'initializing', uid: null };
const stops: (() => void)[] = [];
const grant = (owner: string, expiresAt = Date.now() + 60000) => ({ approvedBy: owner, issuedAt: { '.sv': 'timestamp' }, expiresAt });
const live = (uid: string, revision = 1) => ({ controllerUid: uid, gameId: 'balloon-quest', sessionId: 'synthetic-security-session', revision, updatedAt: { '.sv': 'timestamp' }, session: { sessionId: 'synthetic-security-session', seed: 1, config: { childFirstName: 'Synthetic' }, gameState: 'PLAYING', currentDifficulty: 'EASY', currentStage: 1, createdAt: 1 } });

describe.skipIf(process.env.DISPLAY_SECURITY_EMULATOR !== '1')('Display and paid TTS security (local Firebase only)', () => {
  beforeAll(async () => {
    for (const [key, value] of Object.entries({ NEXT_PUBLIC_FIREBASE_API_KEY: 'fake', NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'demo-shumos-security.firebaseapp.com', NEXT_PUBLIC_FIREBASE_DATABASE_URL: `https://${NS}.firebaseio.com`, NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'demo-shumos-security', NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: 'demo-shumos-security.appspot.com', NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '1', NEXT_PUBLIC_FIREBASE_APP_ID: '1:1:web:security', NEXT_PUBLIC_FIREBASE_EMULATOR_HOST: '127.0.0.1', NEXT_PUBLIC_FIREBASE_EMULATOR_PORT: '19940', NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT: '19949', MUNSIT_API_KEY: 'synthetic-key', MUNSIT_TTS_ENABLED: 'true' })) vi.stubEnv(key, value);
    await admin('', null); await admin('.settings/rules', JSON.parse(readFileSync('database.rules.json', 'utf8')));
    const email = `security-${Date.now()}@example.test`;
    therapist = await signup(email); other = await signup(`other-${Date.now()}@example.test`); outsider = await signup();
    await admin(`staff/${therapist.uid}`, { active: true, role: 'therapist' }); await admin(`staff/${other.uid}`, { active: true, role: 'therapist' });
    await signInStaff(email, 'SyntheticTest123!'); staffToken = (await getStaffIdToken())!;
  }, 15000);
  afterAll(async () => { stops.forEach(s => s()); await Promise.all([deleteApp(getStaffFirebaseApp()), deleteApp(getDisplayFirebaseApp())]); vi.unstubAllEnvs(); });

  it('denies an unapproved anonymous identity presentation, commands, telemetry and private patient data', async () => {
    await admin('liveSession', live(therapist.uid));
    for (const p of ['liveSession', 'presence/display', 'presence/display/youtubeCommand', 'presence/controller/projectionCommand', 'liveSessionPrivate', 'patients', 'sessions', 'therapyVisits']) expect((await fetch(url(p, outsider.token))).status, p).toBe(401);
    for (const p of ['presence/display/connected', 'presence/display/fullscreen']) expect(await put(p, true, outsider.token)).toBe(401);
    expect(await put(`presence/displayAccess/${outsider.uid}`, grant(therapist.uid), outsider.token)).toBe(401);
    await expect(authorizeTts(`Bearer ${outsider.token}`)).rejects.toMatchObject({ status: 403 });
  });
  it('silently authorizes the independent Display identity using the therapist’s one existing login', async () => {
    await admin('liveSession', null);
    stops.push(subscribeToAuthState(s => { authState = s; }));
    await until(() => authState.status === 'authenticated');
    displayUid = authState.uid!; expect(displayUid).not.toBe(therapist.uid);
    displayToken = await getAuth(getDisplayFirebaseApp()).currentUser!.getIdToken();
    expect((await fetch(url(`presence/displayAccess/${displayUid}`, displayToken))).status).toBe(200);
    await claimControllerLease(getStaffDb(), therapist.uid);
    const session = createSession({ childFirstName: 'Synthetic', difficulty: Difficulty.EASY, targetSize: TargetSize.MEDIUM, targetSpacing: TargetSpacing.MEDIUM, playArea: PlayArea.FULL, seed: 'security-transport' });
    await publishSession(getStaffDb(), { gameId: 'balloon-quest', sessionId: session.sessionId, revision: 1, session, lastInteraction: null, patientId: null });
    const record = (await get(ref(getDisplayDb(), 'liveSession'))).val();
    expect(record.controllerUid).toBe(therapist.uid);
    await expect(get(ref(getDisplayDb(), 'liveSessionPrivate'))).rejects.toThrow();
    const actor = await authorizeTts(`Bearer ${displayToken}`); expect(actor.ownerUid).toBe(therapist.uid);
  });
  it('recovers authorization on resubscription and brief reconnect without duplicate revision application', async () => {
    let restored: AuthState | null = null;
    const stop = subscribeToAuthState(s => { restored = s; });
    await until(() => restored?.status === 'authenticated');
    expect(restored!.uid).toBe(displayUid); stop();
    const seen = new Set<number>(); let changes = 0;
    const off = subscribeToLiveSession(getDisplayDb(), r => { if (r && !seen.has(r.revision)) { seen.add(r.revision); changes++; } });
    await until(() => changes === 1); goOffline(getDisplayDb()); await sleep(150); goOnline(getDisplayDb()); await sleep(200);
    expect(changes).toBe(1); off();
  });
  it('denies a Display approved by another therapist and rejects spoofed published ownership', async () => {
    expect(await put(`presence/displayAccess/${outsider.uid}`, grant(other.uid), other.token)).toBe(200);
    expect((await fetch(url('liveSession', outsider.token))).status).toBe(401);
    await expect(authorizeTts(`Bearer ${outsider.token}`)).rejects.toMatchObject({ status: 403 });
    expect(await put('liveSession', live(other.uid, 10), staffToken)).toBe(401);
  });
  it('fails closed after ownership handoff even before the next therapist publishes a replacement', async () => {
    let visible: unknown = 'pending';
    const off = subscribeToLiveSession(getDisplayDb(), record => { visible = record; });
    await until(() => !!visible && visible !== 'pending');
    await admin('controllerLease', { ownerId: other.uid, claimedAt: Date.now(), updatedAt: Date.now() });
    await until(() => visible === null);
    expect((await fetch(url('liveSession', displayToken))).status).toBe(401);
    // A new lease must never grant access to the previous patient’s live record.
    expect((await fetch(url('liveSession', outsider.token))).status).toBe(401);
    await expect(authorizeTts(`Bearer ${displayToken}`)).rejects.toMatchObject({ status: 403 });
    await admin('controllerLease', { ownerId: therapist.uid, claimedAt: Date.now(), updatedAt: Date.now() });
    await until(() => authState.status === 'authenticated');
    off();
  });
  it('rejects missing, forged tokens and inactive staff before any paid request', async () => {
    await expect(authorizeTts(null)).rejects.toMatchObject({ status: 401 });
    await expect(authorizeTts('Bearer invalid.invalid.invalid')).rejects.toMatchObject({ status: 401 });
    await admin(`staff/${therapist.uid}/active`, false);
    await expect(authorizeTts(`Bearer ${staffToken}`)).rejects.toMatchObject({ status: 403 });
    await expect(authorizeTts(`Bearer ${displayToken}`)).rejects.toMatchObject({ status: 403 });
    expect((await fetch(url('liveSession', displayToken))).status).toBe(401);
    await admin(`staff/${therapist.uid}/active`, true);
  });
  it('shares durable quota between staff and Displays and handles concurrent reservations', async () => {
    await admin('ttsUsage', null);
    const staff = await authorizeTts(`Bearer ${staffToken}`), display = await authorizeTts(`Bearer ${displayToken}`);
    await Promise.all([reserveTtsQuota(staff, 20), reserveTtsQuota(display, 30)]);
    const usage = await (await fetch(url(`ttsUsage/${therapist.uid}`, staffToken))).json();
    expect(usage.requests).toBe(2); expect(usage.characters).toBe(50);
    const global = await (await fetch(url('ttsUsage/_global', staffToken))).json(); expect(global.characters).toBe(50);
    expect(await put(`ttsUsage/${therapist.uid}`, null, staffToken)).toBe(401);
    expect(await put(`ttsUsage/${therapist.uid}`, { ...usage, requests: 1, characters: 1 }, displayToken)).toBe(401);
    expect(await put(`ttsUsage/${other.uid}`, { ...usage, requests: 1, characters: 1 }, displayToken)).toBe(401);
    expect(await put(`ttsUsage/${therapist.uid}`, { ...usage, requests: 61, characters: 51 }, staffToken)).toBe(401);
    expect(await put(`ttsUsage/${therapist.uid}`, { ...usage, requests: 3, characters: 40001 }, staffToken)).toBe(401);
    expect(await put(`ttsUsage/${therapist.uid}`, { ...usage, minuteStart: usage.minuteStart-60000, requests: 3, characters: 51 }, staffToken)).toBe(401);
  });
  it('enforces minute, daily and global paid caps without calling Munsit', async () => {
    const now = Date.now(), usage = { minuteStart: now - now % 60000, requests: 60, dayStart: now - now % 86400000, characters: 100 };
    await admin(`ttsUsage/${therapist.uid}`, usage);
    const staff = await authorizeTts(`Bearer ${staffToken}`);
    await expect(reserveTtsQuota(staff, 10)).rejects.toMatchObject({ status: 429 });
    await admin(`ttsUsage/${therapist.uid}`, { ...usage, requests: 1, characters: 40000 });
    await expect(reserveTtsQuota(staff, 1)).rejects.toMatchObject({ status: 429 });
    await admin(`ttsUsage/${therapist.uid}`, null);
    await admin('ttsUsage/_global', { ...usage, requests: 240 });
    await expect(reserveTtsQuota(staff, 1)).rejects.toMatchObject({ status: 429 });
    await admin('ttsUsage/_global', { ...usage, requests: 1, characters: 240000 });
    await expect(reserveTtsQuota(staff, 1)).rejects.toMatchObject({ status: 429 });
  });
  it('allows the verified Display through the real route and reserves budget before the synthetic upstream', async () => {
    await admin('ttsUsage', null);
    const original = global.fetch; let paid = 0;
    vi.stubGlobal('fetch', (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      if (String(input).startsWith('https://api.munsit.com/')) { paid++; return Promise.resolve(new Response(new Uint8Array([1,2,3]), { headers: { 'Content-Type': 'audio/wav' } })); }
      return original(input, init);
    });
    try {
      const request = (token: string) => new NextRequest('http://localhost/api/tts', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'Synthetic' }) });
      expect((await POST(request(outsider.token))).status).toBe(403); expect(paid).toBe(0);
      expect((await POST(request(displayToken))).status).toBe(200); expect(paid).toBe(1);
    } finally { vi.unstubAllGlobals(); }
  });
  it('rejects expired grants, excessive expiry and revoked grants; sign-out revokes approved Displays', async () => {
    expect(await put(`presence/displayAccess/${outsider.uid}`, grant(therapist.uid, Date.now()+1801000), staffToken)).toBe(401);
    await admin(`presence/displayAccess/${outsider.uid}`, { approvedBy: therapist.uid, issuedAt: Date.now()-60000, expiresAt: Date.now()-1000 });
    expect((await fetch(url('liveSession', outsider.token))).status).toBe(401);
    await expect(authorizeTts(`Bearer ${outsider.token}`)).rejects.toMatchObject({ status: 403 });
    // A Display may revoke its own grant after staff sign-out, but cannot grant or revoke another Display.
    expect(await put(`presence/displayAccess/${outsider.uid}`, null, outsider.token)).toBe(200);
    expect(await put(`presence/displayAccess/${displayUid}`, null, outsider.token)).toBe(401);
    await signOutStaff();
    await until(() => authState.status === 'failed');
    expect((await fetch(url('liveSession', displayToken))).status).toBe(401);
    await expect(authorizeTts(`Bearer ${displayToken}`)).rejects.toMatchObject({ status: 403 });
  });
});
