import type { Metadata } from 'next';
import { SpacePilotControlScreen } from '@/components/control/spacepilot/SpacePilotControlScreen';
export const metadata:Metadata={title:'قائد الفضاء — النسخة السابقة',robots:{index:false,follow:false}};
/** Same inherited staff gate and original session/history implementation. */
export default function LegacySpacePilotPage(){return <SpacePilotControlScreen/>;}
