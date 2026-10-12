import { notFound } from 'next/navigation';
import { BLOOMING_WORLD_ENABLED } from '@/lib/bloomingworld3d/registration';
import { BloomControl } from '@/components/control/bloomingworld3d/BloomControl';
export default function Page(){if(!BLOOMING_WORLD_ENABLED)notFound();return <BloomControl/>;}
