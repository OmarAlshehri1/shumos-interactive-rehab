import { notFound } from 'next/navigation';
import { DisplayScreen } from '@/components/display/DisplayScreen';
import { ACHIEVEMENT_CITY_ENABLED } from '@/lib/achievementcity/registration';

export default function Page() {
  if (!ACHIEVEMENT_CITY_ENABLED) notFound();
  return <DisplayScreen />;
}
