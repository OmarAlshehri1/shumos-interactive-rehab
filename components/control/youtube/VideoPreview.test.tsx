import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { VideoPreview } from './VideoPreview';

it('uses an official responsive embed with a referrer and no automatic playback or client key', () => {
  const html = renderToStaticMarkup(<VideoPreview video={{ videoId: 'dQw4w9WgXcQ', title: 'Synthetic', channel: 'Channel' }} />);
  expect(html).toContain('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?playsinline=1');
  expect(html).toContain('referrerPolicy="strict-origin-when-cross-origin"');
  expect(html).toContain('title="معاينة Synthetic"');
  expect(html).not.toContain('autoplay=1');
  expect(html).not.toContain('key=');
});
it('never embeds an invalid video identifier', () => {
  expect(renderToStaticMarkup(<VideoPreview video={{ videoId: '../invalid', title: 'Invalid', channel: '' }} />)).toBe('');
});
