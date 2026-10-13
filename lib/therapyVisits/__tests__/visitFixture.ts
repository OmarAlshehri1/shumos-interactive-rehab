import { blankEvaluation, type Visit } from "../model";
export function visitFixture(id = "v1", t = 1000): Visit {
  return {
    version: 1,
    visitId: id,
    patientId: "p",
    childName: "طفل الاختبار",
    ownerUid: "staff",
    controlTabId: "tab",
    title: "عنوان المعالج",
    therapistName: "معالج",
    initialNotes: "",
    finalNotes: "",
    overallRating: null,
    startedAt: t,
    plannedMs: 30 * 60000,
    pausedMs: 0,
    pausedAt: null,
    endedAt: t + 120000,
    revision: 0,
    updatedAt: t + 120000,
    entries: {
      exercise: {
        kind: "exercise",
        title: "الوصول باليد",
        goal: "الوصول إلى هدف قريب",
        repetitions: 3,
        holdSeconds: 2,
        confirmed: true,
        recordedAt: t + 10000,
        evaluation: {
          ...blankEvaluation("staff", t + 10000),
          completion: "completed",
        },
      },
    },
    breaks: {},
  };
}
