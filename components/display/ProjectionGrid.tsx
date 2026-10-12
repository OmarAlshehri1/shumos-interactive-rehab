import type { ProjectionProfile } from "@/lib/projection/calibration";
export function ProjectionGrid({ profile: p }: { profile: ProjectionProfile }) {
  return (
    <div
      data-projection-grid
      style={{
        position: "relative",
        aspectRatio: "16 / 10",
        width: "100%",
        backgroundColor: "#102b3b",
        backgroundImage:
          "linear-gradient(#95cace22 1px,transparent 1px),linear-gradient(90deg,#95cace22 1px,transparent 1px)",
        backgroundSize: "10% 10%",
        borderRadius: 12,
        overflow: "hidden",
      }}
      aria-label="شبكة حدود الإسقاط"
    >
      <div
        style={{
          position: "absolute",
          inset: `${p.safeInsetPercent}%`,
          border: "3px dashed #6ce0d0",
          transform: `rotate(${p.rotation}deg)`,
        }}
      >
        {[
          [-1, -1],
          [0, -1],
          [1, -1],
          [-1, 0],
          [0, 0],
          [1, 0],
          [-1, 1],
          [0, 1],
          [1, 1],
        ].map(([x, y], i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${50 + x * p.spacingPercent}%`,
              top: `${50 + y * p.spacingPercent}%`,
              width: `${p.targetPercent}%`,
              aspectRatio: "1",
              borderRadius: "50%",
              border: "2px solid #ffe19b",
              background: "#ffe19b55",
              transform: "translate(-50%,-50%)",
            }}
          />
        ))}
      </div>
      <strong
        style={{
          position: "absolute",
          top: 10,
          left: 14,
          color: "white",
          fontSize: 12,
        }}
      >
        {p.surface} · {p.rotation}° · حدود آمنة مقترحة
      </strong>
    </div>
  );
}
