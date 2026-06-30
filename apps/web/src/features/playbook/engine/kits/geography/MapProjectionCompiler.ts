import { geoMercator, geoPath, type GeoPermissibleObjects } from "d3-geo";

import type { GeoJsonFeature, GeoJsonFeatureCollection } from "../../assets/assetGeoJson";

interface MapProjectionBounds {
  west: number;
  east: number;
  south: number;
  north: number;
}

interface MapViewport {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CompileGeoJsonOptions {
  viewport: MapViewport;
  className: string;
  bounds?: MapProjectionBounds;
  precision?: number;
}

export interface CompiledGeoJsonPath {
  id: string;
  d: string;
  className: string;
  sourceName: string;
}

export interface CompiledGeoJsonMap {
  bounds: MapProjectionBounds;
  paths: CompiledGeoJsonPath[];
}

const EAST_ASIA_BOUNDS: MapProjectionBounds = {
  west: 88,
  east: 153,
  south: -4,
  north: 57,
};

function boundsPolygon(bounds: MapProjectionBounds): GeoPermissibleObjects {
  return {
    type: "Polygon",
    coordinates: [
      [
        [bounds.west, bounds.south],
        [bounds.east, bounds.south],
        [bounds.east, bounds.north],
        [bounds.west, bounds.north],
        [bounds.west, bounds.south],
      ],
    ],
  } as GeoPermissibleObjects;
}

function resolveBounds(collection: GeoJsonFeatureCollection, override?: MapProjectionBounds): MapProjectionBounds {
  return override ?? collection.metadata?.bounds ?? EAST_ASIA_BOUNDS;
}

function featureName(feature: GeoJsonFeature, index: number): string {
  const properties = feature.properties ?? {};
  const name = properties.name ?? properties.admin ?? properties.id;
  return typeof name === "string" && name ? name : `feature-${index}`;
}

function roundSvgPath(path: string, precision: number): string {
  return path.replace(/-?\d+\.\d+/g, (match) => {
    const rounded = Number(match).toFixed(precision);
    return rounded.replace(/\.?0+$/, "");
  });
}

export function compileGeoJsonToSvgPaths(
  collection: GeoJsonFeatureCollection,
  options: CompileGeoJsonOptions,
): CompiledGeoJsonMap {
  const bounds = resolveBounds(collection, options.bounds);
  const projection = geoMercator()
    .fitExtent(
      [
        [options.viewport.x, options.viewport.y],
        [options.viewport.x + options.viewport.width, options.viewport.y + options.viewport.height],
      ],
      boundsPolygon(bounds),
    )
    .clipExtent([
      [options.viewport.x, options.viewport.y],
      [options.viewport.x + options.viewport.width, options.viewport.y + options.viewport.height],
    ]);
  const projectPath = geoPath(projection);
  const precision = options.precision ?? 3;

  return {
    bounds,
    paths: collection.features.flatMap((feature, index) => {
      const path = projectPath(feature as GeoPermissibleObjects);
      if (!path) return [];
      return [
        {
          id: `${options.className}-${index}`,
          d: roundSvgPath(path, precision),
          className: options.className,
          sourceName: featureName(feature, index),
        },
      ];
    }),
  };
}
