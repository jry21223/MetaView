import eastAsiaCoastlineRaw from "../../../../../public/assets/metaview-kits/geography-earth-basic/natural-earth/east-asia-coastline-110m.geojson?raw";
import eastAsiaLandRaw from "../../../../../public/assets/metaview-kits/geography-earth-basic/natural-earth/east-asia-land-110m.geojson?raw";
import type { AssetManifestEntry } from "./assetRegistry";

export interface GeoJsonFeature {
  type: "Feature";
  properties?: Record<string, unknown>;
  geometry: unknown;
}

export interface GeoJsonFeatureCollection {
  type: "FeatureCollection";
  metadata?: {
    natural_earth_layer?: string;
    bounds?: {
      west: number;
      east: number;
      south: number;
      north: number;
    };
    source?: string;
    license?: string;
    license_url?: string;
    modified_from?: string;
    feature_count?: number;
  };
  features: GeoJsonFeature[];
}

const GEOJSON_ASSETS: Record<string, GeoJsonFeatureCollection> = {
  "east-asia-land-110m": JSON.parse(eastAsiaLandRaw) as GeoJsonFeatureCollection,
  "east-asia-country-boundary-110m": JSON.parse(eastAsiaLandRaw) as GeoJsonFeatureCollection,
  "east-asia-coastline-110m": JSON.parse(eastAsiaCoastlineRaw) as GeoJsonFeatureCollection,
};

export function resolveGeoJsonAssetData(asset: AssetManifestEntry | undefined): GeoJsonFeatureCollection | undefined {
  if (!asset || asset.type !== "geojson") return undefined;
  return GEOJSON_ASSETS[asset.id];
}
