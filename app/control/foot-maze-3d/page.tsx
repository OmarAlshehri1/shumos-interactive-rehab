import { notFound } from 'next/navigation';
import { FootMazeControl } from '@/components/control/footmaze3d/FootMazeControl';
import { FOOT_MAZE_ENABLED } from '@/lib/footmaze3d/registration';

export default function Page() {
  if (!FOOT_MAZE_ENABLED) notFound();
  return <FootMazeControl />;
}
