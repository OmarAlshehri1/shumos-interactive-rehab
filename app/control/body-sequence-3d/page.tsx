import { notFound } from 'next/navigation';
import { BodySequenceControl } from '@/components/control/bodysequence3d/BodySequenceControl';
import { BODY_SEQUENCE_ENABLED } from '@/lib/bodysequence3d/registration';

export default function Page() {
  if (!BODY_SEQUENCE_ENABLED) notFound();
  return <BodySequenceControl />;
}
