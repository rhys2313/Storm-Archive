const rgb = hex => hex.slice(1).match(/../g).map(value => parseInt(value, 16));
const luminance = channels => channels.map(value => value / 255)
  .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  .reduce((total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index], 0);

export function badgeTextColor(hex) {
  const light = luminance(rgb(hex));
  return (light + 0.05) / 0.05 >= 1.05 / (light + 0.05) ? '#000000' : '#ffffff';
}

export function accentTextColor(hex) {
  const source = rgb(hex);
  // The lightest dark surface is a hovered card. Include the badge's 0x20
  // category tint when checking contrast, so the same accent works elsewhere.
  const background = source.map((value, index) => value * (32 / 255) + rgb('#263237')[index] * (1 - 32 / 255));
  for (let step = 0; step <= 20; step++) {
    const text = source.map(value => Math.round(value + (255 - value) * step / 20));
    if ((luminance(text) + .05) / (luminance(background) + .05) >= 4.5) {
      return '#' + text.map(value => value.toString(16).padStart(2, '0')).join('');
    }
  }
  return '#ffffff';
}
