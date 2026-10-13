import { notFound } from 'next/navigation';
import { DisplayScreen } from '@/components/display/DisplayScreen';
import { ACHIEVEMENT_FOREST_ENABLED } from '@/lib/achievementforest/registration';

export default function Page() {
  if (!ACHIEVEMENT_FOREST_ENABLED) notFound();
  return <DisplayScreen />;
}
