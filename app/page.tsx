import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 bg-slate-950 px-6 text-center text-white">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          Shumos Interactive Rehab
        </h1>
        <p className="text-slate-400">Engineering foundation</p>
      </div>
      <nav className="flex flex-col gap-4 sm:flex-row">
        <Link
          href="/display"
          className="rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-medium hover:bg-white/10"
        >
          Open Display
        </Link>
        <Link
          href="/control"
          className="rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-medium hover:bg-white/10"
        >
          Open Control
        </Link>
      </nav>
    </main>
  );
}
