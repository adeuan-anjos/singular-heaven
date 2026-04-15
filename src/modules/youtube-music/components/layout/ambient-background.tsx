import React, { useState, useRef, useCallback } from "react";
import { usePlayerStore } from "../../stores/player-store";
import { useTrack } from "../../stores/track-cache-store";
import { thumbUrl } from "../../utils/thumb-url";

const FILTER_STYLE = "url(#liquid-glass) blur(40px) saturate(1.6)";
const OPACITY_VISIBLE = 0.18;

/**
 * Liquid glass ambient background with dual-layer cross-fade.
 * Keeps the previous track's image visible while the next one loads,
 * then fades in the new image over 3s — no black flash between tracks.
 */
export const AmbientBackground = React.memo(function AmbientBackground() {
  const currentTrackId = usePlayerStore((s) => s.currentTrackId);
  const track = useTrack(currentTrackId ?? undefined);
  const imgUrl = track?.thumbnails[0]?.url ?? "";

  const src = imgUrl ? thumbUrl(imgUrl, 226) : "";

  // Track which layer (0 or 1) is the "front" (new image)
  const [frontLayer, setFrontLayer] = useState(0);
  const [srcs, setSrcs] = useState(["", ""]);
  const [loadedFlags, setLoadedFlags] = useState([false, false]);
  const prevSrcRef = useRef("");

  if (src !== prevSrcRef.current) {
    prevSrcRef.current = src;
    const nextFront = frontLayer === 0 ? 1 : 0;
    setSrcs((prev) => {
      const next = [...prev];
      next[nextFront] = src;
      return next;
    });
    setLoadedFlags((prev) => {
      const next = [...prev];
      next[nextFront] = false;
      return next;
    });
    setFrontLayer(nextFront);
  }

  const handleLoad = useCallback(
    (layer: number) => {
      setLoadedFlags((prev) => {
        const next = [...prev];
        next[layer] = true;
        return next;
      });
    },
    [],
  );

  const handleLoad0 = useCallback(() => handleLoad(0), [handleLoad]);
  const handleLoad1 = useCallback(() => handleLoad(1), [handleLoad]);

  const hasSrc = Boolean(srcs[0] || srcs[1]);

  return (
    <>
      {/* Base gradient — always visible, provides color when no track is playing */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background: "radial-gradient(ellipse at 50% 0%, oklch(0.25 0.02 270) 0%, transparent 70%)",
        }}
      />

      {/* SVG filter — defined once, zero visual footprint */}
      <svg className="absolute h-0 w-0" aria-hidden="true">
        <defs>
          <filter id="liquid-glass">
            <feTurbulence
              type="turbulence"
              baseFrequency="0.015 0.025"
              numOctaves="3"
              seed="1"
              result="turbulence"
            />
            <feGaussianBlur in="turbulence" stdDeviation="3" result="softTurbulence" />
            <feDisplacementMap
              in="SourceGraphic"
              in2="softTurbulence"
              scale="30"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>

      {/* Dual-layer cross-fade container */}
      {hasSrc && <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        {[0, 1].map((layer) => (
          <img
            key={layer}
            src={srcs[layer] || undefined}
            alt=""
            onLoad={layer === 0 ? handleLoad0 : handleLoad1}
            className="absolute inset-0 h-full w-full scale-125 object-cover transition-opacity duration-3000 ease-in-out"
            style={{
              opacity: loadedFlags[layer] && layer === frontLayer ? OPACITY_VISIBLE : 0,
              filter: FILTER_STYLE,
              zIndex: layer === frontLayer ? 1 : 0,
            }}
          />
        ))}
      </div>}
    </>
  );
});
