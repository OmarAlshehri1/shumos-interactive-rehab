import { notFound } from 'next/navigation';
import { DisplayScreen } from '@/components/display/DisplayScreen';
import { SAFE_HEX_ARENA_ENABLED } from '@/lib/safehexarena3d/registration';

export default function Page() {
  if (!SAFE_HEX_ARENA_ENABLED) notFound();
  return <DisplayScreen />;
}
