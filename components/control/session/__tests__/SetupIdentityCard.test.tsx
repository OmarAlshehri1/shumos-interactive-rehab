import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SetupIdentityCard } from "../SetupIdentityCard";

describe("shared game Setup identity", () => {
  it("shows a saved patient and the authenticated therapist above game choices", () => {
    const html = renderToStaticMarkup(
      <SetupIdentityCard childName="سارة" patientName="سارة" therapistName="أ. نورة" />,
    );
    expect(html).toContain("المريض");
    expect(html).toContain("سارة");
    expect(html).toContain("الأخصائي");
    expect(html).toContain("أ. نورة");
  });

  it("shows Quick Session child context and a safe non-identifying therapist fallback", () => {
    const html = renderToStaticMarkup(
      <SetupIdentityCard childName="ليان" patientName={null} therapistName={null} />,
    );
    expect(html).toContain("الطفل");
    expect(html).toContain("ليان");
    expect(html).toContain("حساب الأخصائي");
    expect(html).not.toContain("uid");
    expect(html).not.toContain("@");
  });
});
