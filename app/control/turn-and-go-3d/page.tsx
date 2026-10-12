import { notFound } from 'next/navigation';
import { TurnGoControl } from '@/components/control/turngo3d/TurnGoControl';
import { TURN_AND_GO_ENABLED } from '@/lib/turngo3d/registration';

export default function Page() {
  if (!TURN_AND_GO_ENABLED) notFound();
  return <TurnGoControl />;
}
