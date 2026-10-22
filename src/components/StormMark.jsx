export default function StormMark({ className = '', theme = 'light' }) {
  return (
    <img
      src={`/branding/9be6c084f42b/${theme === 'dark' ? 'logo' : 'logo-on-light'}.png`}
      width="576"
      height="576"
      alt=""
      className={`storm-mark ${className}`}
      aria-hidden="true"
    />
  );
}
