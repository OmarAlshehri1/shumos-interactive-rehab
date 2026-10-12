import { notFound } from 'next/navigation';
import { DisplayScreen } from '@/components/display/DisplayScreen';
import { BODY_SEQUENCE_ENABLED } from '@/lib/bodysequence3d/registration';

export default function Page() {
  if (!BODY_SEQUENCE_ENABLED) notFound();
  return <DisplayScreen />;
}
