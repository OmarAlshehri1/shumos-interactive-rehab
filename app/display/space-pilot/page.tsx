import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SpacePilotDisplayEntry } from '@/components/display/spacepilot3d/SpacePilotDisplayEntry';
import { SPACE_PILOT_3D_ENABLED } from '@/lib/spacepilot3d/releasePolicy';
export const metadata:Metadata={title:'شموس — قائد الفضاء',robots:{index:false,follow:false}};
/** Dedicated child-screen URL: the normal platform Display (it follows the shared live session); the original Display remains available for rollback. */
export default function SpacePilotDisplayPage(){
  if(!SPACE_PILOT_3D_ENABLED)notFound();
  return <SpacePilotDisplayEntry/>;
}
