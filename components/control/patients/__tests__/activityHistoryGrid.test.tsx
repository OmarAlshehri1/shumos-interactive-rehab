import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { SessionHistoryList } from "../SessionHistoryList";
import { Difficulty } from "@/lib/game";
import type { StoredSession } from "@/lib/sessions/types";
const stored: StoredSession = {sessionId:"saved-1",patientId:"p1",gameId:"balloon-quest",createdByUid:"synthetic",startedAt:1000,completedAt:69000,startingDifficulty:Difficulty.EASY,startingStage:1,endingDifficulty:Difficulty.EASY,endingStage:2,completedStageCount:2,skippedStageCount:0,totalCorrect:8,totalIncorrect:2,durationMs:68000,accuracy:.8,averageReactionTimeMs:1500,bestStage:{difficulty:Difficulty.EASY,stageNumber:2},stageResults:[],therapistNote:"ملاحظة محفوظة"};
it("renders every historical activity as a detail link without hiding or changing records", () => {
  const sessions=Array.from({length:24},(_,i)=>({...stored,sessionId:`saved-${i}`}));const before=JSON.stringify(sessions);
  const html=renderToStaticMarkup(<SessionHistoryList patientId="p1" sessions={sessions}/>);
  expect(html.match(/data-activity-history-card=/g)).toHaveLength(24);
  expect(html.match(/عرض التفاصيل/g)).toHaveLength(24);
  expect(html).toContain('/control/patients/p1/sessions/saved-23');
  expect(html).toContain('80%');expect(html).toContain('01:08');
  expect(JSON.stringify(sessions)).toBe(before);
});
it("keeps unavailable native measurements unavailable", () => {
  const html=renderToStaticMarkup(<SessionHistoryList patientId="p1" sessions={[{...stored,accuracy:null,durationMs:null}]}/>);
  expect(html).not.toContain('80%');expect(html).not.toContain('01:08');expect(html).toContain('—');
});
