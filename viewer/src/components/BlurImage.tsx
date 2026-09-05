import { useState } from "react"

interface BlurImageProps {
  src: string | null
  alt: string
  className?: string
  aspectRatio?: string
  gradientClassName?: string
}

/**
 * Blur-up image loading: shows a neutral placeholder (or gradient) until the
 * image actually loads, then fades it in. The UI never collapses or jumps
 * because the aspect-ratio box reserves space immediately.
 */
export default function BlurImage({
  src,
  alt,
  className = "",
  aspectRatio,
  gradientClassName = "bg-gray-800",
}: BlurImageProps) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)

  if (!src || error) {
    return (
      <div
        className={`flex items-center justify-center ${gradientClassName} ${className}`}
        style={aspectRatio ? { aspectRatio } : undefined}
      >
        <span className="text-gray-500 text-xs">{alt}</span>
      </div>
    )
  }

  return (
    <div
      className={`overflow-hidden relative ${className}`}
      style={aspectRatio ? { aspectRatio } : undefined}
    >
      {!loaded && (
        <div
          className={`absolute inset-0 animate-pulse ${gradientClassName}`}
          aria-hidden="true"
        />
      )}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        className={`w-full h-full object-cover transition-opacity duration-500 ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  )
}