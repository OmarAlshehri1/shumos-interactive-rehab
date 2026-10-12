import { notFound } from 'next/navigation';
import { DisplayScreen } from '@/components/display/DisplayScreen';
import { RHYTHM_STEPS_ENABLED } from '@/lib/rhythmsteps3d/registration';

export default function Page() {
  if (!RHYTHM_STEPS_ENABLED) notFound();
  return <DisplayScreen />;
}
