import { afterEach, describe, expect, it, vi } from 'vitest';

// Vitest transforms JSX as development JSX while this suite exercises production flags.
vi.mock('react/jsx-dev-runtime',async()=>({jsxDEV:(await vi.importActual<typeof import('react/jsx-runtime')>('react/jsx-runtime')).jsx}));

vi.mock('next/navigation',()=>({notFound:()=>{throw new Error('NEXT_NOT_FOUND');}}));
vi.mock('@/components/control/mirrorquest3d/MirrorControl',()=>({MirrorControl:()=>null}));
vi.mock('@/components/display/DisplayScreen',()=>({DisplayScreen:()=>null}));

describe('Mirror production release routes',()=>{
 afterEach(()=>{vi.unstubAllEnvs();vi.resetModules();});
 for(const flag of [undefined,'false'])it(`disables both routes when the production flag is ${flag}`,async()=>{
  vi.stubEnv('NODE_ENV','production');vi.stubEnv('NEXT_PUBLIC_MIRROR_QUEST_3D',flag);vi.resetModules();
  const control=await import('@/app/control/mirror-quest-3d/page');const display=await import('@/app/display/mirror-quest-3d/page');
  expect(()=>control.default()).toThrow('NEXT_NOT_FOUND');expect(()=>display.default()).toThrow('NEXT_NOT_FOUND');
 });
 it('keeps both canonical routes available with explicit production opt-in',async()=>{
  vi.stubEnv('NODE_ENV','production');vi.stubEnv('NEXT_PUBLIC_MIRROR_QUEST_3D','true');vi.resetModules();
  const control=await import('@/app/control/mirror-quest-3d/page');const display=await import('@/app/display/mirror-quest-3d/page');
  expect(control.default().type).toBeTypeOf('function');expect(display.default().type).toBeTypeOf('function');
 });
});
