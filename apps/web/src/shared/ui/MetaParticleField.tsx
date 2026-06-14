import { useId } from "react";

export type MetaParticleFieldVariant = "singularity" | "orbit" | "comet";

interface MetaParticleFieldProps {
  variant: MetaParticleFieldVariant;
  intensity?: "calm";
  className?: string;
}

const ORBIT_PATHS = [
  "M94 236C214 122 588 122 706 236",
  "M146 236C246 146 554 146 654 236",
  "M198 236C278 168 522 168 602 236",
  "M254 236C314 188 486 188 546 236",
] as const;

const SINGULARITY_PATHS = [
  "M154 174C246 90 344 104 400 150C456 196 552 176 646 92",
  "M190 116C282 164 350 102 400 150C452 200 526 142 610 188",
  "M214 196C296 142 354 178 400 150C452 118 510 84 594 122",
] as const;

const SINGULARITY_CONTOURS = [
  "M196 178C274 124 338 130 400 150C462 170 526 160 604 110",
  "M214 124C294 156 342 116 400 150C456 184 504 144 586 176",
  "M252 196C316 156 360 172 400 150C444 126 484 102 548 126",
] as const;

const COMET_PATHS = [
  "M150 188C260 62 392 104 526 38",
  "M224 126C300 36 382 140 500 54",
] as const;

const ORBIT_PARTICLES = [
  { path: 0, r: 4.4, duration: "15s", begin: "-3s", tone: "primary" },
  { path: 1, r: 3.8, duration: "11s", begin: "-7s", tone: "secondary" },
  { path: 2, r: 5.2, duration: "18s", begin: "-10s", tone: "warm" },
  { path: 3, r: 3.2, duration: "9s", begin: "-1s", tone: "primary" },
] as const;

const COMET_PARTICLES = [
  { path: 0, r: 4.2, duration: "7s", begin: "-2s", tone: "primary" },
  { path: 1, r: 3.6, duration: "9s", begin: "-6s", tone: "secondary" },
] as const;

function safeId(raw: string) {
  return raw.replace(/[^a-zA-Z0-9_-]/g, "");
}

function renderPaths(paths: readonly string[], idPrefix: string, className: string) {
  return paths.map((d, index) => (
    <path
      key={`${idPrefix}-${index}`}
      id={`${idPrefix}-${index}`}
      className={`${className} ${className}--${index + 1}`}
      d={d}
      pathLength={1}
    />
  ));
}

function renderParticles(
  particles: ReadonlyArray<{
    path: number;
    r: number;
    duration: string;
    begin: string;
    tone: "primary" | "secondary" | "warm";
  }>,
  pathPrefix: string,
) {
  return particles.map((particle, index) => (
    <g
      key={`${particle.path}-${particle.duration}-${index}`}
      className={`mv-meta-particle__particle mv-meta-particle__particle--${particle.tone}`}
    >
      <circle r={particle.r} />
      <animateMotion
        dur={particle.duration}
        begin={particle.begin}
        repeatCount="indefinite"
      >
        <mpath href={`#${pathPrefix}-${particle.path}`} />
      </animateMotion>
      <animate
        attributeName="opacity"
        values="0;0.88;0.88;0"
        keyTimes="0;0.18;0.78;1"
        dur={particle.duration}
        begin={particle.begin}
        repeatCount="indefinite"
      />
    </g>
  ));
}

export function MetaParticleField({
  variant,
  intensity = "calm",
  className = "",
}: MetaParticleFieldProps) {
  const id = safeId(useId());
  const singularityId = `mv-meta-particle-singularity-${id}`;
  const contourId = `mv-meta-particle-contour-${id}`;
  const orbitId = `mv-meta-particle-orbit-${id}`;
  const cometId = `mv-meta-particle-comet-${id}`;
  const rootClass = [
    "mv-meta-particle",
    `mv-meta-particle--${variant}`,
    `mv-meta-particle--${intensity}`,
    className,
  ].filter(Boolean).join(" ");

  return (
    <div
      className={rootClass}
      data-testid="meta-particle-field"
      data-variant={variant}
      aria-hidden="true"
    >
      <svg
        className="mv-meta-particle__svg"
        viewBox="0 0 800 300"
        preserveAspectRatio="xMidYMid meet"
        focusable="false"
      >
        {variant === "singularity" && (
          <>
            <g className="mv-meta-particle__lens-grid">
              <path className="mv-meta-particle__lens-line" d="M298 104H502" />
              <path className="mv-meta-particle__lens-line" d="M286 132H514" />
              <path className="mv-meta-particle__lens-line" d="M282 160H518" />
              <path className="mv-meta-particle__lens-line" d="M294 188H506" />
              <path className="mv-meta-particle__lens-line" d="M332 74V226" />
              <path className="mv-meta-particle__lens-line" d="M368 62V238" />
              <path className="mv-meta-particle__lens-line" d="M404 58V242" />
              <path className="mv-meta-particle__lens-line" d="M440 66V234" />
              <path className="mv-meta-particle__lens-line" d="M476 84V216" />
            </g>
            <g className="mv-meta-particle__singularity-swirl">
              <ellipse
                className="mv-meta-particle__event-horizon mv-meta-particle__event-horizon--outer"
                cx="400"
                cy="150"
                rx="176"
                ry="54"
              />
              <ellipse
                className="mv-meta-particle__event-horizon mv-meta-particle__event-horizon--middle"
                cx="400"
                cy="150"
                rx="126"
                ry="38"
              />
              <ellipse
                className="mv-meta-particle__event-horizon mv-meta-particle__event-horizon--inner"
                cx="400"
                cy="150"
                rx="72"
                ry="22"
              />
            </g>
            <g className="mv-meta-particle__paths">
              {renderPaths(
                SINGULARITY_PATHS,
                singularityId,
                "mv-meta-particle__gravity-path",
              )}
              {renderPaths(
                SINGULARITY_CONTOURS,
                contourId,
                "mv-meta-particle__gravity-contour",
              )}
            </g>
            <circle
              className="mv-meta-particle__singularity-halo"
              cx="400"
              cy="150"
              r="52"
            />
            <circle
              className="mv-meta-particle__singularity-lens"
              cx="400"
              cy="150"
              r="34"
            />
            <circle
              className="mv-meta-particle__singularity-core mv-meta-particle__core"
              cx="400"
              cy="150"
              r="17"
            />
          </>
        )}

        {variant === "orbit" && (
          <>
            <g className="mv-meta-particle__paths">
              {renderPaths(ORBIT_PATHS, orbitId, "mv-meta-particle__orbit")}
            </g>
            <line
              className="mv-meta-particle__axis"
              x1="400"
              y1="194"
              x2="400"
              y2="262"
            />
            <circle className="mv-meta-particle__core-halo" cx="400" cy="236" r="22" />
            <circle className="mv-meta-particle__core" cx="400" cy="236" r="10" />
            {renderParticles(ORBIT_PARTICLES, orbitId)}
          </>
        )}

        {variant === "comet" && (
          <>
            <g className="mv-meta-particle__paths">
              {renderPaths(COMET_PATHS, cometId, "mv-meta-particle__comet-path")}
            </g>
            <rect
              className="mv-meta-particle__comet-bar mv-meta-particle__comet-bar--main"
              x="180"
              y="190"
              width="440"
              height="11"
              rx="6"
            />
            <rect
              className="mv-meta-particle__comet-bar mv-meta-particle__comet-bar--soft"
              x="238"
              y="226"
              width="324"
              height="8"
              rx="4"
            />
            <circle className="mv-meta-particle__core" cx="400" cy="150" r="9" />
            {renderParticles(COMET_PARTICLES, cometId)}
          </>
        )}

        <g className="mv-meta-particle__dust">
          <circle cx="314" cy="205" r="2.2" />
          <circle cx="494" cy="202" r="1.8" />
          <circle cx="236" cy="228" r="1.5" />
          <circle cx="565" cy="226" r="1.6" />
        </g>
      </svg>
    </div>
  );
}
