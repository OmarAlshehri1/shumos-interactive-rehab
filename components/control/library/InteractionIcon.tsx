export function InteractionIcon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    all: "M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 0h7v7h-7v-7",
    hand: "M8 13V6a2 2 0 0 1 4 0v6V4a2 2 0 0 1 4 0v9V7a2 2 0 0 1 4 0v8l-1 7H10l-6-8a2 2 0 0 1 3-2l3 3",
    foot: "M14 3c5 0 5 6 2 9l-2 2 1 5c1 4-6 5-7 1l-2-6 3-7c1-2 2-4 5-4Z",
    controller:
      "M8 3H5a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h3V3Zm8 0h3a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3h-3V3ZM5 8h.01M5 15v3m-1.5-1.5h3M19 7v3m-1.5-1.5h3M19 16h.01",
    wheel:
      "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM12 5a7 7 0 0 0-6.8 5H9a4 4 0 0 1 6 0h3.8A7 7 0 0 0 12 5ZM5 13l4 1 1 5m9-6-4 1-1 5M10 11h4v3h-4v-3",
    wall: "M4 3h16v14H4V3Zm3 18h10m-5-4v4M7 7h10m-7 4h4",
    floor: "M3 15l9-5 9 5-9 6-9-6Zm9-12v5m-3-3 3 3 3-3",
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
