/** Development defaults to 3D. Production/test require an explicitly approved
 * build with "true". "false" rolls back without deleting either implementation. */
export function spacePilot3DEnabled(environment: string | undefined, flag: string | undefined): boolean {
  if(flag==='true')return true;
  if(flag==='false')return false;
  return environment==='development';
}
export const SPACE_PILOT_3D_ENABLED=spacePilot3DEnabled(process.env.NODE_ENV,process.env.NEXT_PUBLIC_SPACE_PILOT_3D_ENABLED);
export function isLocalFlightControl(path:string,enabled=SPACE_PILOT_3D_ENABLED){
  const normalized=path.replace(/\/$/,'');
  return normalized==='/control/space-pilot-3d-prototype'||(enabled&&(normalized==='/control/space-pilot'||normalized==='/control/space-pilot/sensor-source'));
}
