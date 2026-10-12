import { notFound } from 'next/navigation';
import { PEARL_VOYAGE_ENABLED } from '@/lib/pearlvoyage3d/registration';
import { PearlVoyageControl } from '@/components/control/pearlvoyage3d/PearlVoyageControl';

export default function Page() {
    if (!PEARL_VOYAGE_ENABLED) notFound();
    return <PearlVoyageControl />;
}
