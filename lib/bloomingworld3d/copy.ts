import type { Mode } from './engine';
export const MODE_LABELS: Record<Mode,string> = {MANUAL:'تحكّم المعالج',RIGHT_HAND:'اليد اليمنى',LEFT_HAND:'اليد اليسرى',DUAL_HAND:'تناوب اليدين',RIGHT_FOOT:'القدم اليمنى',LEFT_FOOT:'القدم اليسرى',DUAL_FOOT:'القدمان'};
export const HISTORY_LABELS = {'not-ended':'الجلسة مستمرة','walk-in':'جلسة زائر — لم يُحدد سجل مريض',saving:'جارٍ الحفظ',saved:'تم الحفظ',retry:'بانتظار الاتصال لإعادة الحفظ'};
export const FOOT_HINT_LABELS = {movement:'حركة مقصودة',rest:'عودة إلى الراحة',unavailable:'الحساس غير جاهز',steady:'لا حركة جديدة'};
