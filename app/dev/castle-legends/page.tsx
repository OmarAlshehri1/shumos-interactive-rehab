import {notFound} from 'next/navigation';
import {CastleQA} from '@/components/castlelegends3d/CastleQA';
/** Developer evidence harness only; never a production launch path. */
export default function Page(){if(process.env.NODE_ENV==='production'||process.env.SHUMOS_CASTLE_QA!=='1')notFound();return <CastleQA/>;}
