import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DualSensorDiagnosticScreen } from '@/components/control/sensors/DualSensorDiagnosticScreen';

export const metadata: Metadata = { title: 'شُموس — اختبار حسّاسي اليد الحقيقيين' };

/** Local development only; inherits /control's existing StaffAuthGate. */
export default function Page() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <DualSensorDiagnosticScreen />;
}
