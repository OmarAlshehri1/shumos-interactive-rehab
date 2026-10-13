import { notFound } from 'next/navigation';
import { AchievementForestControl } from '@/components/control/achievementforest3d/AchievementForestControl';
import { ACHIEVEMENT_FOREST_ENABLED } from '@/lib/achievementforest/registration';

export default function Page() {
  if (!ACHIEVEMENT_FOREST_ENABLED) notFound();
  return <AchievementForestControl />;
}
