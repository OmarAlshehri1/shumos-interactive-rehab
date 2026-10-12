import { notFound } from 'next/navigation';
import { HexControl } from '@/components/control/safehexarena3d/HexControl';
import { SAFE_HEX_ARENA_ENABLED } from '@/lib/safehexarena3d/registration';

export default function Page() {
  if (!SAFE_HEX_ARENA_ENABLED) notFound();
  return <HexControl />;
}
