/**
 * WoodDeskTexture — procedural SVG dark-walnut wood grain.
 *
 * Rendered entirely in the DOM via SVG filter primitives:
 *   feTurbulence  — anisotropic noise that reads as long horizontal grain lines
 *   feDisplacementMap — bends the grain so it waves naturally
 *   feColorMatrix — maps 0-1 noise into the near-black → warm amber-brown range
 *
 * No CSS gradients, no images, no canvas. The SVG re-renders once per mount
 * and is pointer-events-none so it never interferes with canvas interaction.
 */
export default function WoodDeskTexture(): JSX.Element {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 2000 1200"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {/* Espresso ground — the darkest tone visible between grain lines */}
      <rect width={2000} height={1200} fill="#0e0804" />

      <defs>
        <filter
          id="wdt-grain"
          x="-100"
          y="-100"
          width="2200"
          height="1400"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          {/* Primary grain — very anisotropic baseFrequency produces long
              horizontal streaks that read immediately as wood grain */}
          <feTurbulence
            type="turbulence"
            baseFrequency="0.006 0.0015"
            numOctaves={8}
            seed={42}
            result="grain"
          />

          {/* Warp noise — lower frequency, used only to bend the grain */}
          <feTurbulence
            type="turbulence"
            baseFrequency="0.009 0.004"
            numOctaves={3}
            seed={17}
            result="warp"
          />

          {/* Displacement — makes the grain lines wave naturally */}
          <feDisplacementMap
            in="grain"
            in2="warp"
            scale={55}
            xChannelSelector="R"
            yChannelSelector="G"
            result="wavy"
          />

          {/* Color mapping → dark walnut palette.
              Maps 0–1 noise output to near-black (#0b0705) → warm amber-brown.
              Row format: [R_r R_g R_b R_a R_bias | G_r … | B_r … | A_r …] */}
          <feColorMatrix
            type="matrix"
            in="wavy"
            values="
              0.32  0.22  0.16  0  0.046
              0.16  0.11  0.082 0  0.022
              0.045 0.032 0.022 0  0.008
              0     0     0     1  0
            "
            result="dark-walnut"
          />

          {/* Highlight grain — a second fractalNoise pass that adds subtle
              lighter streaks (the chatoyance effect in real walnut) */}
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.005 0.0012"
            numOctaves={5}
            seed={8}
            result="hn"
          />
          <feDisplacementMap
            in="hn"
            in2="warp"
            scale={40}
            xChannelSelector="G"
            yChannelSelector="R"
            result="hw"
          />
          <feColorMatrix
            type="matrix"
            in="hw"
            values="
              0.18  0.12  0.09  0  0.02
              0.09  0.06  0.045 0  0.01
              0.025 0.018 0.012 0  0.004
              0     0     0     0.5 0
            "
            result="hl"
          />

          {/* Screen-blend highlights over the base grain */}
          <feBlend in="dark-walnut" in2="hl" mode="screen" result="wood" />
        </filter>

        {/* Vignette — darkens edges so the desk "recedes" into shadow */}
        <radialGradient id="wdt-vignette" cx="50%" cy="45%" r="65%">
          <stop offset="0%" stopColor="#000000" stopOpacity={0} />
          <stop offset="100%" stopColor="#000000" stopOpacity={0.62} />
        </radialGradient>

        {/* Lamp — warm overhead light pooling at the top-centre */}
        <radialGradient id="wdt-lamp" cx="50%" cy="0%" r="55%">
          <stop offset="0%" stopColor="#FFB84A" stopOpacity={0.18} />
          <stop offset="50%" stopColor="#FF9030" stopOpacity={0.06} />
          <stop offset="100%" stopColor="#000000" stopOpacity={0} />
        </radialGradient>
      </defs>

      {/* The grain rect — larger than the viewport so displacement never
          reveals the edge of the noise field */}
      <rect x={-100} y={-100} width={2200} height={1400} filter="url(#wdt-grain)" />

      {/* Vignette and lamp overlays */}
      <rect width={2000} height={1200} fill="url(#wdt-vignette)" />
      <rect width={2000} height={1200} fill="url(#wdt-lamp)" />
    </svg>
  )
}
