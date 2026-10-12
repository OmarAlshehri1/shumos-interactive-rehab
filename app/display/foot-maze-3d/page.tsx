import { notFound } from 'next/navigation';
import { DisplayScreen } from '@/components/display/DisplayScreen';
import { FOOT_MAZE_ENABLED } from '@/lib/footmaze3d/registration';

export default function Page() {
  if (!FOOT_MAZE_ENABLED) notFound();
  return <DisplayScreen />;
}
