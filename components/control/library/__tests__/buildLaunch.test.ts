import {afterEach,describe,expect,it,vi} from 'vitest';
const {redirect}=vi.hoisted(()=>({redirect:vi.fn((url:string)=>{throw new Error(url);})}));
vi.mock('next/navigation',()=>({redirect,notFound:()=>{throw new Error('not found');}}));
vi.mock('@/components/control/buildquest3d/BuildQuestControl',()=>({BuildQuestControl:()=>null}));
import Page from '@/app/control/build-quest-3d/page';
afterEach(()=>{vi.unstubAllEnvs();redirect.mockClear();});
describe('Build Quest room creation retains the requested library input',()=>{
 it.each(['HAND','JOYSTICK','MANUAL'])('preserves %s across the existing canonical session redirect',async(input)=>{vi.stubEnv('NODE_ENV','development');await expect(Page({searchParams:Promise.resolve({input})})).rejects.toThrow(`&input=${input}`);const url=new URL(redirect.mock.calls[0][0],'http://local.test');expect(url.pathname).toBe('/control/build-quest-3d');expect(url.searchParams.get('session')).toMatch(/^[a-f0-9-]{36}$/);});
 it('sanitizes an invalid physical mode and leaves ordinary direct launches unchanged',async()=>{vi.stubEnv('NODE_ENV','development');await expect(Page({searchParams:Promise.resolve({input:'unknown'})})).rejects.toThrow('&input=MANUAL');redirect.mockClear();await expect(Page({searchParams:Promise.resolve({})})).rejects.toThrow('/control/build-quest-3d?session=');expect(redirect.mock.calls[0][0]).not.toContain('&input=');});
});
