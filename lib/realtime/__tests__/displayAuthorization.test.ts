import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StaffAuthState } from '../staffAuthClient';
const mocks = vi.hoisted(() => ({
  set: vi.fn(async () => {}), remove: vi.fn(async () => {}), update: vi.fn(async () => {}),
  get: vi.fn(), staff: vi.fn(), value: vi.fn(), offset: 0,
  recover: vi.fn(async () => {}),
  token: vi.fn(async () => 'staff-token'), canonicalOwner: undefined as string | undefined,
}));
vi.mock('firebase/database', () => ({
  ref: (db: string, path: string) => ({ db, path }),
  set: mocks.set, remove: mocks.remove, get: mocks.get, update: mocks.update,
  serverTimestamp: () => ({ '.sv': 'timestamp' }), onValue: mocks.value,
}));
vi.mock('../firebaseClient', () => ({ getStaffDb: () => 'staff', getDisplayDb: () => 'display' }));
vi.mock('../staffAuthClient', () => ({ subscribeToStaffAuthState: mocks.staff, getStaffIdToken: mocks.token }));
vi.mock('../recoverDisplaySessionOwner', () => ({ recoverDisplaySessionOwner: mocks.recover }));

describe('Silent authorization using the existing staff session', () => {
  const stops: (() => void)[] = [];
  let staffChanged: (state: StaffAuthState) => void;
  let approve: (value: unknown) => void;
  beforeEach(() => {
    vi.useFakeTimers(); vi.resetModules(); vi.clearAllMocks();
    mocks.set.mockResolvedValue(undefined); mocks.remove.mockResolvedValue(undefined);
    mocks.recover.mockResolvedValue(undefined);
    mocks.offset = 0;
    mocks.canonicalOwner = undefined;
    mocks.staff.mockImplementation((callback: typeof staffChanged) => { staffChanged = callback; return vi.fn(); });
    mocks.value.mockImplementation((ref, callback) => { if (ref.path === '.info/connected') callback({ val: () => true }); else if (ref.path === '.info/serverTimeOffset') callback({ val: () => mocks.offset }); else if (ref.path === 'liveSession/controllerUid') callback({val: () => mocks.canonicalOwner ?? null}); else if (ref.db === "display") approve = value => callback({ val: () => value }); return vi.fn(); });
  });
  afterEach(() => { stops.splice(0).forEach(stop => stop()); vi.useRealTimers(); });
  const signedIn = { status: 'authenticated', uid: 'therapist', email: 'synthetic@example.test', displayName: null } as StaffAuthState;

  it('prepares staff persistence in parallel without another listener, approval or sign-in', async () => {
    const { prepareDisplayAuthorization } = await import('../displayAuthorization');
    prepareDisplayAuthorization(); prepareDisplayAuthorization(); await vi.advanceTimersByTimeAsync(0);
    expect(mocks.token).toHaveBeenCalledTimes(1);
    expect(mocks.staff).not.toHaveBeenCalled(); expect(mocks.set).not.toHaveBeenCalled();
  });

  it('uses subscribed canonical ownership without downloading the saved game again', async () => {
    mocks.canonicalOwner = 'therapist';
    const { watchDisplayAuthorization } = await import('../displayAuthorization');
    stops.push(watchDisplayAuthorization('display-uid', vi.fn()));
    staffChanged(signedIn); await vi.advanceTimersByTimeAsync(0);
    expect(mocks.recover).not.toHaveBeenCalled();
    expect(mocks.set).toHaveBeenCalledTimes(1);
  });


  it('does not authorize or mint an approval for an anonymous browser lacking the existing staff session', async () => {
    const { watchDisplayAuthorization } = await import('../displayAuthorization');
    const listener = vi.fn(); stops.push(watchDisplayAuthorization('anonymous', listener));
    staffChanged({ status: 'unauthenticated', uid: null, email: null, displayName: null });
    approve(null);
    expect(listener).toHaveBeenLastCalledWith(false); expect(mocks.set).not.toHaveBeenCalled();
  });
  it('uses one silent approval flow for multiple Display consumers without another sign-in', async () => {
    const { watchDisplayAuthorization } = await import('../displayAuthorization');
    const first = vi.fn(), second = vi.fn();
    stops.push(watchDisplayAuthorization('display-uid', first), watchDisplayAuthorization('display-uid', second));
    staffChanged(signedIn); await vi.advanceTimersByTimeAsync(0);
    expect(mocks.staff).toHaveBeenCalledTimes(1); expect(mocks.set).toHaveBeenCalledTimes(1);
    approve({ approvedBy: 'therapist', issuedAt: Date.now(), expiresAt: Date.now()+1000 });
    expect(first).toHaveBeenLastCalledWith(true); expect(second).toHaveBeenLastCalledWith(true);
    await vi.advanceTimersByTimeAsync(1001);
    expect(first).toHaveBeenLastCalledWith(false); expect(second).toHaveBeenLastCalledWith(false);
  });
  it('renews the approval using existing staff authentication without user interaction', async () => {
    const { watchDisplayAuthorization, DISPLAY_ACCESS_REFRESH_MS } = await import('../displayAuthorization');
    stops.push(watchDisplayAuthorization('display-uid', vi.fn()));
    staffChanged(signedIn); await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(DISPLAY_ACCESS_REFRESH_MS);
    expect(mocks.set).toHaveBeenCalledTimes(2);
    expect(mocks.set).toHaveBeenLastCalledWith({ db: 'staff', path: 'presence/displayAccess/display-uid' }, expect.objectContaining({ approvedBy: 'therapist' }));
  });
  it('uses server time for expiry when the Display device clock is fast', async () => {
    mocks.offset = -120000;
    const { watchDisplayAuthorization, DISPLAY_ACCESS_TTL_MS } = await import('../displayAuthorization');
    stops.push(watchDisplayAuthorization('display-uid', vi.fn()));
    staffChanged(signedIn); await vi.advanceTimersByTimeAsync(0);
    expect(mocks.set).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({
      expiresAt: Date.now() - 120000 + DISPLAY_ACCESS_TTL_MS - 5000,
    }));
  });
  it('fails closed and identifies ownership recovery when a competing lease rejects recovery', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      mocks.recover.mockRejectedValueOnce({ code: 'PERMISSION_DENIED', message: 'private-credential' });
      const { watchDisplayAuthorization } = await import('../displayAuthorization');
      const listener = vi.fn(); stops.push(watchDisplayAuthorization('display-uid', listener));
      staffChanged(signedIn); await vi.advanceTimersByTimeAsync(0);
      expect(mocks.set).not.toHaveBeenCalled();
      expect(listener).toHaveBeenLastCalledWith(false);
      expect(warn).toHaveBeenCalledWith('[display-auth] failed', { phase: 'session-owner', code: 'PERMISSION_DENIED' });
    } finally { warn.mockRestore(); }
  });
  it('revokes only the signing-out therapist’s approvals and stops renewing them', async () => {
    const { watchDisplayAuthorization, revokeDisplaysForStaff, DISPLAY_ACCESS_REFRESH_MS } = await import('../displayAuthorization');
    const listener = vi.fn(); stops.push(watchDisplayAuthorization('display-uid', listener));
    staffChanged(signedIn); await vi.advanceTimersByTimeAsync(0);
    mocks.get.mockResolvedValue({ forEach: (callback: (child: unknown) => void) => {
      callback({ key: 'display-uid', child: () => ({ val: () => 'therapist' }) });
      callback({ key: 'other-display', child: () => ({ val: () => 'other-therapist' }) });
    } });
    await revokeDisplaysForStaff('therapist');
    expect(mocks.update).toHaveBeenCalledWith(expect.anything(), { 'display-uid': null });
    expect(listener).toHaveBeenLastCalledWith(false);
    const writes = mocks.set.mock.calls.length; await vi.advanceTimersByTimeAsync(DISPLAY_ACCESS_REFRESH_MS);
    expect(mocks.set).toHaveBeenCalledTimes(writes);
  });
});
