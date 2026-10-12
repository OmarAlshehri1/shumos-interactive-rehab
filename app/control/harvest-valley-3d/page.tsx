import {notFound} from 'next/navigation';
import {HARVEST_VALLEY_ENABLED} from '@/lib/harvestvalley3d/registration';
import {HarvestControl} from '@/components/control/harvestvalley3d/HarvestControl';
export default function Page(){if(!HARVEST_VALLEY_ENABLED)notFound();return <HarvestControl/>;}
