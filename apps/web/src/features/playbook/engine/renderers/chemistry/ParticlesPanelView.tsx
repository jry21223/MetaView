import React from "react";

import type { ChemParticlesPanel } from "../../kits/chemistry/sceneTypes";
import {
  containedMargin,
  DEFAULT_PARTICLE_SCALE,
  ELECTRON_RADIUS,
  MOTION_AMPLITUDE,
  particleFrame,
  particleGlyph,
  particleLegend,
  particlePosition,
} from "../../kits/chemistry/geometry/particles";
import { lerp, morphParticles, thermalOffset } from "../../kits/chemistry/transitions";
import { elementColor } from "../../kits/chemistry/elements";
import { sphereColors, toneColor, type ChemPalette } from "./chemPalette";
import { SphereGradient } from "./AtomSphere";
import { CHEM_FONT_FAMILY } from "./ChemText";

interface Props {
  panel: ChemParticlesPanel;
  prev: ChemParticlesPanel | null;
  morph: number;
  frame: number;
  palette: ChemPalette;
  uid: string;
}

function chargeLabel(charge: number): string {
  const sign = charge > 0 ? "+" : "−";
  return Math.abs(charge) === 1 ? sign : `${Math.abs(charge)}${sign}`;
}

export function ParticleGlyph({
  species,
  x,
  y,
  angle,
  scale,
  palette,
  uid,
  opacity = 1,
  tone,
}: {
  species: string;
  x: number;
  y: number;
  angle: number;
  scale: number;
  palette: ChemPalette;
  uid: string;
  opacity?: number;
  tone?: string | null;
}) {
  const glyph = particleGlyph(species, scale, angle);
  if (glyph.electron) {
    return (
      <g opacity={opacity} data-species="e-">
        <circle cx={x} cy={y} r={ELECTRON_RADIUS + 2.5} fill={palette.focus} opacity={0.25} />
        <circle cx={x} cy={y} r={ELECTRON_RADIUS} fill={palette.focus} />
        <text x={x} y={y + 4.4} textAnchor="middle" fontSize={13} fontWeight={800} fill={palette.plate} fontFamily={CHEM_FONT_FAMILY}>−</text>
      </g>
    );
  }
  const atoms = [...glyph.atoms].map((atom, index) => ({ ...atom, index })).sort((a, b) => a.depth - b.depth);
  const single = glyph.atoms.length === 1;
  const badgeR = Math.max(6.5, glyph.bound * 0.3);
  // Spectator ions stay visible but step back so the actors read first.
  const muted = tone === "muted" ? 0.45 : 1;
  return (
    <g opacity={opacity * muted} data-species={species} data-tone={tone ?? undefined}>
      {tone === "focus" ? (
        <circle cx={x} cy={y} r={glyph.bound + 3} fill="none" stroke={toneColor(palette, "focus")} strokeWidth={2} opacity={0.85} />
      ) : null}
      {atoms.map((atom) => (
        <circle
          key={atom.index}
          cx={x + atom.dx}
          cy={y + atom.dy}
          r={atom.r}
          fill={`url(#${uid}-p-${atom.element})`}
          stroke={sphereColors(palette, atom.element).rim}
          strokeWidth={0.8}
        />
      ))}
      {single && glyph.atoms[0].r >= 11 ? (
        <text
          x={x}
          y={y + glyph.atoms[0].r * 0.34}
          textAnchor="middle"
          fontSize={glyph.atoms[0].r * 0.9}
          fontWeight={650}
          fill={palette.surface}
          fontFamily={CHEM_FONT_FAMILY}
        >
          {glyph.atoms[0].element}
        </text>
      ) : null}
      {glyph.charge ? (
        <g>
          <circle cx={x + glyph.bound * 0.72} cy={y - glyph.bound * 0.72} r={badgeR} fill={palette.plate} stroke={glyph.charge > 0 ? palette.focus : palette.primary} strokeWidth={1.3} />
          <text
            x={x + glyph.bound * 0.72}
            y={y - glyph.bound * 0.72 + badgeR * 0.38}
            textAnchor="middle"
            fontSize={Math.abs(glyph.charge) > 1 ? badgeR * 0.95 : badgeR * 1.25}
            fontWeight={750}
            fill={glyph.charge > 0 ? palette.focus : palette.primary}
            fontFamily={CHEM_FONT_FAMILY}
          >
            {chargeLabel(glyph.charge)}
          </text>
        </g>
      ) : null}
    </g>
  );
}

/** Gradients for every element a set of species uses, shared by all glyphs. */
export function ParticleGradients({ elements, palette, uid }: { elements: Iterable<string>; palette: ChemPalette; uid: string }) {
  return (
    <>
      {[...new Set(elements)].map((element) => (
        <SphereGradient key={element} id={`${uid}-p-${element}`} palette={palette} element={element} />
      ))}
    </>
  );
}

/** The element that identifies a species in the legend: its largest atom (I in HI, N in NH₃). */
function legendElement(species: string, scale: number): string {
  const atoms = particleGlyph(species, scale).atoms;
  return atoms.reduce((best, atom) => (atom.r > best.r ? atom : best), atoms[0] ?? { element: "H", r: 0 }).element;
}

export function ParticlesPanelView({ panel, prev, morph, frame, palette, uid }: Props) {
  const scale = panel.scale ?? DEFAULT_PARTICLE_SCALE;
  const widthFraction = lerp(prev?.width_fraction ?? panel.width_fraction ?? 1, panel.width_fraction ?? 1, prev ? morph : 1);
  const layout = particleFrame({ ...panel, width_fraction: widthFraction });
  const drawn = morphParticles(prev, panel, morph);
  const amplitude = (panel.motion ?? 0.5) * MOTION_AMPLITUDE;
  const container = panel.container ?? "box";
  const legend = particleLegend(panel, particleFrame(panel));
  const clipId = `${uid}-${panel.id}-clip`;
  const { interior } = layout;
  return (
    <g data-chem-panel="particles" data-panel-id={panel.id} data-particle-count={panel.particles.length}>
      <defs>
        <clipPath id={clipId}>
          <rect x={interior.x - 2} y={interior.y - 2} width={interior.w + 4} height={interior.h + 4} rx={container === "beaker" ? 10 : 6} />
        </clipPath>
      </defs>
      {container !== "open" ? (
        <rect
          x={interior.x}
          y={interior.y}
          width={interior.w}
          height={interior.h}
          rx={container === "beaker" ? 12 : 6}
          fill={palette.glassFill}
          stroke={palette.line2}
          strokeWidth={2}
        />
      ) : null}
      {layout.slab ? (
        <g data-slab={panel.slab?.material}>
          <rect x={layout.slab.x} y={layout.slab.y} width={layout.slab.w} height={layout.slab.h} fill={elementColor(panel.slab?.material ?? "Zn", palette.theme)} opacity={0.2} />
          <line
            x1={panel.slab?.side === "left" ? layout.slab.x + layout.slab.w : layout.slab.x}
            y1={layout.slab.y}
            x2={panel.slab?.side === "left" ? layout.slab.x + layout.slab.w : layout.slab.x}
            y2={layout.slab.y + layout.slab.h}
            stroke={elementColor(panel.slab?.material ?? "Zn", palette.theme)}
            strokeWidth={2}
            strokeDasharray="4 4"
            opacity={0.7}
          />
        </g>
      ) : null}
      {widthFraction < 0.999 && container === "box" ? (
        <g data-piston="true">
          <rect x={interior.x + interior.w} y={interior.y - 6} width={10} height={interior.h + 12} rx={3} fill={palette.ink3} opacity={0.55} />
          <line x1={interior.x + interior.w + 10} y1={interior.y + interior.h / 2} x2={interior.x + interior.w + 40} y2={interior.y + interior.h / 2} stroke={palette.ink3} strokeWidth={4} opacity={0.55} />
        </g>
      ) : null}
      <g clipPath={container !== "open" ? `url(#${clipId})` : undefined}>
        {drawn.map((particle) => {
          const jiggle = particle.fixed ? { dx: 0, dy: 0, turn: 0 } : thermalOffset(particle.id, frame, amplitude);
          // Entering particles start outside the box and slide in; only the
          // settled positions are held inside the walls.
          const inside = particle.x >= 0 && particle.x <= 1 && particle.y >= 0 && particle.y <= 1;
          const at = particlePosition(layout, particle, inside ? containedMargin(panel, particle) : 0);
          const x = at.x + jiggle.dx;
          const y = at.y + jiggle.dy;
          const angle = particle.angle + jiggle.turn;
          return (
            <g key={particle.id} data-particle-id={particle.id}>
              {particle.fromSpecies ? (
                <ParticleGlyph species={particle.fromSpecies} x={x} y={y} angle={angle} scale={scale} palette={palette} uid={uid} opacity={particle.opacity * (1 - morph)} />
              ) : null}
              <ParticleGlyph
                species={particle.species}
                x={x}
                y={y}
                angle={angle}
                scale={scale}
                palette={palette}
                uid={uid}
                opacity={particle.opacity * (particle.fromSpecies ? morph : 1)}
                tone={particle.tone}
              />
            </g>
          );
        })}
      </g>
      {legend.map((item) => (
        <circle key={item.species} cx={item.dotX} cy={item.text.y - 5} r={5.5} fill={item.species === "e-" ? palette.focus : `url(#${uid}-p-${legendElement(item.species, scale)})`} stroke={palette.line2} strokeWidth={0.8} />
      ))}
    </g>
  );
}
