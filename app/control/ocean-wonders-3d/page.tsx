import { notFound } from 'next/navigation';
import { OceanWondersControl } from '@/components/control/oceanwonders3d/OceanWondersControl';
import { OCEAN_WONDERS_ENABLED } from '@/lib/oceanwonders/registration';

export default function Page() {
  if (!OCEAN_WONDERS_ENABLED) notFound();
  return <OceanWondersControl />;
}
