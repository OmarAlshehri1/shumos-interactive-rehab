import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { DevPreview } from '@/components/display/oceanwonders3d/DevPreview';

/** Local review harness for the Ocean Wonders Display (no Firebase). Never reachable in a production build. */
export default function Page() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <Suspense fallback={null}><DevPreview /></Suspense>;
}
