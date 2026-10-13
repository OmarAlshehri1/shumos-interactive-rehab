/** Neutral vector fallback shown only until the real gameplay screenshot loads (see realGameThumbnails.ts). */
export function OceanWondersThumbnail() {
  const c = (l: string, w: string, h: string, bg: string) => ({ position: 'absolute' as const, left: l, bottom: '10%', width: w, height: h, background: bg, borderRadius: '40% 40% 12% 12%' });
  return (
    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,#8fecff,#25b3d0 50%,#0d6c95 78%,#e9d6a8 79%,#d8c18c)', overflow: 'hidden' }}>
      <div style={c('12%', '9%', '30%', '#ff6f9a')} />
      <div style={c('26%', '12%', '22%', '#ffb05a')} />
      <div style={c('44%', '8%', '38%', '#a77bff')} />
      <div style={c('58%', '13%', '26%', '#37d9c1')} />
      <div style={c('76%', '9%', '34%', '#ff8ad8')} />
    </div>
  );
}
