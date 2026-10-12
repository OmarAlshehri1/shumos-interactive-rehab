import { notFound } from 'next/navigation';
import { BLOOMING_WORLD_ENABLED } from '@/lib/bloomingworld3d/registration';
import { DisplayScreen } from '@/components/display/DisplayScreen';
export default function Page(){if(!BLOOMING_WORLD_ENABLED)notFound();return <DisplayScreen/>;}
