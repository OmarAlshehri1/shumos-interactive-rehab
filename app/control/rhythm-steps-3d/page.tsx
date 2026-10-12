import { notFound } from 'next/navigation';
import { RhythmControl } from '@/components/control/rhythmsteps3d/RhythmControl';
import { RHYTHM_STEPS_ENABLED } from '@/lib/rhythmsteps3d/registration';

export default function Page() {
  if (!RHYTHM_STEPS_ENABLED) notFound();
  return <RhythmControl />;
}
