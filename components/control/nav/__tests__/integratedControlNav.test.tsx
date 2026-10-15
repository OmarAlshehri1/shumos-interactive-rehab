import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ControlNav } from "../ControlNav";
import { ControlPageNav } from "../ControlPageNav";

describe("integrated Control branding and navigation", () => {
  it("keeps the redesigned corner logo on top-level pages", () => {
    const html = renderToStaticMarkup(<ControlNav active="home" />);
    expect(html.match(/alt="شعار شموس كير"/g)).toHaveLength(1);
    expect(html).toContain('href="/control/youtube"');
    expect(html).toContain('href="/control/activities"');
  });
  it("keeps one logo and visible back navigation on nested pages", () => {
    const html = renderToStaticMarkup(<>
      <ControlPageNav backHref="/control" backLabel="الرئيسية" />
      <ControlNav active="youtube" showBrand={false} />
    </>);
    expect(html.match(/alt="شعار شموس كير"/g)).toHaveLength(1);
    expect(html).toContain('aria-label="رجوع إلى الرئيسية"');
    expect(html).toContain('aria-current="page"');
  });
});
