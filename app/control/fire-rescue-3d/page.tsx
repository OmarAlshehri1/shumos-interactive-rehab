import { notFound } from 'next/navigation';
import { FIRE_RESCUE_ENABLED } from '@/lib/firerescue3d/registration';
import { FireRescueControl } from '@/components/control/firerescue3d/FireRescueControl';
export default function Page() { if (!FIRE_RESCUE_ENABLED)
    notFound(); return <FireRescueControl />; }
