import {notFound} from 'next/navigation';
import {HARVEST_VALLEY_ENABLED} from '@/lib/harvestvalley3d/registration';
import {DisplayScreen} from '@/components/display/DisplayScreen';
export default function Page(){if(!HARVEST_VALLEY_ENABLED)notFound();return <DisplayScreen/>;}
