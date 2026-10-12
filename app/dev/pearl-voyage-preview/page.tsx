import { notFound } from 'next/navigation';
import { PreviewClient } from './PreviewClient';

/** Local art-direction and test harness for Pearl Voyage 3D: runs the real engine and renderer with no Firebase. Never served in production builds. */
export default function Page() {
    if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_PEARL_VOYAGE_PREVIEW !== 'true') notFound();
    return <PreviewClient />;
}
