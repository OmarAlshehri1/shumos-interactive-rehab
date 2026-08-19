import Image from "next/image";

export function ShumosBrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center justify-center gap-2.5" aria-label="شموس كير">
      <Image
        src="/brand/shumos-care-logo.png"
        alt="شعار شموس كير"
        width={495}
        height={495}
        priority
        className={`${compact ? "h-10 w-10" : "h-14 w-14"} object-contain`}
      />
      <span className="text-xs font-semibold tracking-[0.2em] text-teal-700 uppercase">Shumos Care</span>
    </div>
  );
}
