import { MirrorControl } from '@/components/control/mirrorquest3d/MirrorControl';
import { notFound } from 'next/navigation';
import { MIRROR_QUEST_ENABLED } from '@/lib/mirrorquest3d/registration';
export default function Page(){if(!MIRROR_QUEST_ENABLED)notFound();return <MirrorControl/>;}
