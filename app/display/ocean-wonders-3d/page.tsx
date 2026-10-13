import { notFound } from 'next/navigation';
import { DisplayScreen } from '@/components/display/DisplayScreen';
import { OCEAN_WONDERS_ENABLED } from '@/lib/oceanwonders/registration';

export default function Page() {
  if (!OCEAN_WONDERS_ENABLED) notFound();
  return <DisplayScreen />;
}
