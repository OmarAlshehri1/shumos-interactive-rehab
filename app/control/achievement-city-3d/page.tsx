import { notFound } from 'next/navigation';
import { AchievementCityControl } from '@/components/control/achievementcity3d/AchievementCityControl';
import { ACHIEVEMENT_CITY_ENABLED } from '@/lib/achievementcity/registration';

export default function Page() {
  if (!ACHIEVEMENT_CITY_ENABLED) notFound();
  return <AchievementCityControl />;
}
