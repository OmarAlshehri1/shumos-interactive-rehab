export function ColorChaseEnvironment() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-[#060A20]" aria-hidden="true">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_115%,rgba(60,92,190,.5)_0%,rgba(18,29,76,.5)_38%,transparent_72%)]" />
      <div className="absolute inset-0 opacity-70 [background-image:radial-gradient(circle_at_12%_22%,rgba(88,184,255,.7)_0_1px,transparent_2px),radial-gradient(circle_at_82%_18%,rgba(196,139,255,.7)_0_1px,transparent_2px),radial-gradient(circle_at_68%_70%,rgba(69,226,196,.5)_0_1px,transparent_2px)] [background-size:19vmin_19vmin,27vmin_27vmin,23vmin_23vmin]" />
      <div className="absolute inset-x-[8%] bottom-[2%] h-[32%] rounded-[50%] bg-indigo-500/10 blur-[8vmin]" />
    </div>
  );
}
