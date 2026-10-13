import { useState } from 'react';
import { ImageOff } from 'lucide-react';

function ImageAttempt({ src, alt, className, loading, ...props }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className={`${className} image-unavailable`} role="img" aria-label={alt ? `Снимок недоступен: ${alt}` : 'Снимок недоступен'}>
    <ImageOff size={22} aria-hidden="true" /><span>Снимок недоступен</span>
  </span>;
  return <img {...props} src={src} alt={alt} className={className} loading={loading}
    onError={() => setFailed(true)} />;
}

// Changing the source resets only presentation state; the archive is untouched.
export default function ArchiveImage(props) { return <ImageAttempt key={props.src} {...props} />; }
