export function InteractionIcon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    all: "M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 0h7v7h-7v-7",
    hand: "M8 13V6a2 2 0 0 1 4 0v6V4a2 2 0 0 1 4 0v9V7a2 2 0 0 1 4 0v8l-1 7H10l-6-8a2 2 0 0 1 3-2l3 3",
    foot: "M14 3c5 0 5 6 2 9l-2 2 1 5c1 4-6 5-7 1l-2-6 3-7c1-2 2-4 5-4Z",
    controller:
      "M8 3H5a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h3V3Zm8 0h3a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3h-3V3ZM5 8h.01M5 15v3m-1.5-1.5h3M19 7v3m-1.5-1.5h3M19 16h.01",
    wheel:
      "M8 4a7 7 0 1 0 0 14A7 7 0 0 0 8 4ZM1 11h5m4 0h5M8 13v5M6 9h4v4H6V9ZM18 13h2v8h-2v-8Zm4-4h2v12h-2V9",
    wall: "M4 3h16v14H4V3Zm3 18h10m-5-4v4M7 7h10m-7 4h4",
    floor: "M3 15l9-5 9 5-9 6-9-6Zm9-12v5m-3-3 3 3 3-3",
    display: "M3 4h18v12H3V4Zm6 16h6m-3-4v4",
    audio: "M4 9v6h4l5 4V5L8 9H4Zm12.5 1a3.5 3.5 0 0 1 0 4M18.5 7.5a7 7 0 0 1 0 9",
    sparkles: "M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3Zm7 11l.9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14ZM5 15l.7 1.6L7.3 17l-1.6.7L5 19.3l-.7-1.6L2.7 17l1.6-.4L5 15Z",
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] ?? paths.hand} />
    </svg>
  );
}
