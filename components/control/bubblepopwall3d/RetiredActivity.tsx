"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useGameSafety } from "@/components/control/visits/GameSafetyProvider";
import { isUnstartedActivity } from "@/lib/therapyVisits/gameSafety";
/** Keep an already-started controller mounted through its native final save; never create a new setup. */
export function RetiredActivity({children}:{children:ReactNode}) {
 const {live}=useGameSafety();
 const [recoverExisting]=useState(()=>live?.gameId==='bubble-pop-wall'&&!isUnstartedActivity(live)&&live.session.gameState!=='SESSION_COMPLETE');
 return recoverExisting ? children : <section dir="rtl" className="p-8"><h1>هذا النشاط متوقف للأنشطة الجديدة</h1><p>تظل النتائج السابقة متاحة في سجل المريض.</p><Link href="/control/activities">مكتبة الأنشطة</Link></section>;
}
