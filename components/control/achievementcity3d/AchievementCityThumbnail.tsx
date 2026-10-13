/** Neutral vector fallback shown only until the real gameplay screenshot loads (see realGameThumbnails.ts). */
export function AchievementCityThumbnail() {
  const b = (l: string, w: string, h: string, c: string) => ({ position: 'absolute' as const, left: l, bottom: '22%', width: w, height: h, background: c, borderRadius: 4 });
  return (
    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,#8fd3ff,#d6f0ff 55%,#7fc45b 56%,#5aa63f)', overflow: 'hidden' }}>
      <div style={b('14%', '10%', '26%', '#e9c9a0')} />
      <div style={b('28%', '9%', '40%', '#c9d6e4')} />
      <div style={b('40%', '12%', '52%', '#b6c4d6')} />
      <div style={b('55%', '9%', '34%', '#e7b98d')} />
      <div style={b('68%', '10%', '22%', '#f1d9b5')} />
    </div>
  );
}
