import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectionState, PhysicalRole } from '@/lib/physicalInput/types';

const route = vi.hoisted(() => ({ pathname: '/control/dual-sensor-test' }));
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname, notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));
vi.mock('../SensorRuntimeProvider', () => ({ useDualSensorRuntime: () => ({
  right: { role: PhysicalRole.RIGHT_HAND, deviceId: 'right-id', deviceName: 'WT901BLECL-R', connected: true, connection: ConnectionState.CONNECTED, liveRateHz: 49, sample: { timestampMs: 900, anglesDeg: [1,2,3], gyroscopeDps: [4,5,6], accelerationG: [0,0,1] } },
  left: { role: PhysicalRole.LEFT_HAND, deviceId: 'left-id', deviceName: 'WT901BLECL-L', connected: true, connection: ConnectionState.CONNECTED, liveRateHz: 48, sample: { timestampMs: 800, anglesDeg: [7,8,9], gyroscopeDps: [10,11,12], accelerationG: [0,0,1] } },
}) }));
vi.mock('../SensorRoleAssignmentControls', () => ({ SensorReplaceRoleControls: () => null }));
import { DualSensorDiagnosticScreen } from '../DualSensorDiagnosticScreen';
import { PrototypeLocalOnlyBoundary } from '@/components/control/spacepilot3d/PrototypeLocalOnlyBoundary';
import Page from '@/app/control/dual-sensor-test/page';

describe('local dual-sensor diagnostic integration', () => {
  afterEach(() => { vi.unstubAllEnvs(); route.pathname = '/control/dual-sensor-test'; });
  it('shows separate device identities, names, roles and raw readings', () => {
    const html = renderToStaticMarkup(<DualSensorDiagnosticScreen />);
    for (const text of ['RIGHT_HAND','LEFT_HAND','right-id','left-id','WT901BLECL-R','WT901BLECL-L','1.00 / 2.00 / 3.00','7.00 / 8.00 / 9.00','ربط اليمنى','ربط اليسرى','فصل اليمنى','فصل اليسرى']) expect(html).toContain(text);
  });
  it('does not mount the Firebase pointer publisher on the diagnostic route', () => {
    expect(PrototypeLocalOnlyBoundary({ children: 'firebase-publisher' })).toBeNull();
    route.pathname = '/control/balloon-quest';
    expect(PrototypeLocalOnlyBoundary({ children: 'firebase-publisher' })).toBe('firebase-publisher');
  });
  it('keeps the diagnostic unavailable in production', () => {
    vi.stubEnv('NODE_ENV','production');
    expect(() => Page()).toThrow('NEXT_NOT_FOUND');
  });
});
