import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("react-dom", () => ({ createPortal: (content: unknown) => content }));
import { ControlDialog } from "../ControlDialog";
afterEach(() => vi.unstubAllGlobals());
it("renders a named Arabic dialog inside the Control font scope", () => {
 const root = {};
 const querySelector = vi.fn(() => root);
 vi.stubGlobal("document", { querySelector, body: {} });
 const html = renderToStaticMarkup(<ControlDialog open title="مراجعة الإجراء" onClose={() => {}}><button>إلغاء</button></ControlDialog>);
 expect(querySelector).toHaveBeenCalledWith(".shumos-control");
 expect(html).toContain('role="dialog"');expect(html).toContain('aria-label="مراجعة الإجراء"');expect(html).toContain('dir="rtl"');
});
it("disables the form and exposes save status while an irreversible operation is pending", () => {
 vi.stubGlobal("document", { querySelector: () => ({}), body: {} });
 const html = renderToStaticMarkup(<ControlDialog open busy title="حفظ" onClose={() => {}}><button>حفظ</button></ControlDialog>);
 expect(html).toContain('aria-busy="true"');expect(html).toContain('<fieldset disabled=""');expect(html).toContain('role="status"');
});
it("does not expose closed dialog fields or actions", () => expect(renderToStaticMarkup(<ControlDialog open={false} title="مغلق" onClose={() => {}}><button>حذف</button></ControlDialog>)).toBe(""));
