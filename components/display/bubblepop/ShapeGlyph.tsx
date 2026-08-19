import { BubbleShape } from "@/lib/bubblepop";

interface ShapeGlyphProps {
  shape: BubbleShape;
  className?: string;
  fill?: string;
}

/**
 * Shared shape glyph SVG — used inside a moving bubble (BubbleArt) and on a
 * color+shape station pearl (PearlStation), so a "star" always reads as the
 * exact same star everywhere on screen (task Part G's supported shapes:
 * STAR/HEART/CIRCLE/TRIANGLE/DIAMOND — CIRCLE needs no glyph, it's the
 * bubble/pearl's own round body).
 */
export function ShapeGlyph({ shape, className = "h-[46%] w-[46%]", fill = "rgba(255,255,255,0.92)" }: ShapeGlyphProps) {
  const common = { className, fill, stroke: "rgba(255,255,255,0.5)", strokeWidth: 1 } as const;
  switch (shape) {
    case BubbleShape.STAR:
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M12 1.5l2.9 6.3 6.9.7-5.2 4.7 1.5 6.8L12 16.7l-6.1 3.3 1.5-6.8-5.2-4.7 6.9-.7z" />
        </svg>
      );
    case BubbleShape.HEART:
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M12 21s-7.5-4.6-10-9.3C0.4 8.1 2.4 4.5 6 4.5c2 0 3.6 1.1 4.5 2.7C11.4 5.6 13 4.5 15 4.5c3.6 0 5.6 3.6 4 7.2C19.5 16.4 12 21 12 21z" />
        </svg>
      );
    case BubbleShape.TRIANGLE:
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M12 3l10 18H2z" />
        </svg>
      );
    case BubbleShape.DIAMOND:
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M12 2l6 8-6 12-6-12z" />
        </svg>
      );
    default:
      return null;
  }
}
