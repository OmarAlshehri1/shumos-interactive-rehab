import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SessionMetadataDetails } from "../SessionMetadataDetails";

describe("session report metadata rendering", () => {
  it("renders therapist and custom early-end reason while omitting legacy goals", () => {
    const html = renderToStaticMarkup(
      <SessionMetadataDetails
        therapistName="أ. سارة"
        metadata={{ sessionGoal: "OTHER", customSessionGoal: "التدرّب على الانتقال", endReason: "OTHER", customEndReason: "موعد آخر" }}
      />,
    );
    expect(html).toContain("أ. سارة");
    expect(html).toContain("موعد آخر");
    expect(html).not.toContain("هدف الجلسة");
    expect(html).not.toContain("التدرّب على الانتقال");
    expect(html).not.toContain("dangerouslySetInnerHTML");
  });

  it("renders old sessions with no new metadata as an empty fragment", () => {
    expect(renderToStaticMarkup(<SessionMetadataDetails />)).toBe("");
  });
});
