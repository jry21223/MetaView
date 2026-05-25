import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MathCurveLoader } from './MathCurveLoader';

describe('MathCurveLoader', () => {
  it('renders an accessible math curve loader by default', () => {
    const html = renderToStaticMarkup(<MathCurveLoader label="正在同步历史记录" />);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-label="正在同步历史记录"');
    expect(html).toContain('mv-math-curve-loader__draw');
    expect(html).toContain('正在同步历史记录');
  });

  it('supports decorative rendering for nested progress indicators', () => {
    const html = renderToStaticMarkup(
      <MathCurveLoader decorative showLabel={false} size={18} particles={8} />,
    );
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('role="status"');
  });

  it('caps particle count for mobile-friendly rendering', () => {
    const html = renderToStaticMarkup(<MathCurveLoader particles={80} />);
    const count = html.match(/class="mv-math-curve-loader__particle"/g)?.length ?? 0;
    expect(count).toBe(36);
  });

  it('emits different curves for different variants', () => {
    const rose = renderToStaticMarkup(<MathCurveLoader variant="rose" />);
    const lissajous = renderToStaticMarkup(<MathCurveLoader variant="lissajous" />);
    expect(rose).not.toEqual(lissajous);
    expect(lissajous).toContain('mv-math-curve-loader--lissajous');
  });
});
