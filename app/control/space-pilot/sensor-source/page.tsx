import { notFound } from 'next/navigation';
import { SPACE_PILOT_3D_ENABLED } from '@/lib/spacepilot3d/releasePolicy';
import { SpacePilotSensorSource } from '@/components/control/spacepilot3d/SpacePilotSensorSource';
export const metadata = { title: 'شموس · حاسوب مستشعر قائد الفضاء', robots: { index: false, follow: false } };
export default function Page() {
  if (!SPACE_PILOT_3D_ENABLED) notFound();
  return <SpacePilotSensorSource />;
}
