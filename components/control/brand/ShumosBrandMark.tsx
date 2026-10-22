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
        className={`${compact ? "h-12 w-12" : "h-16 w-16"} object-contain`}
      />
    </div>
  );
}
