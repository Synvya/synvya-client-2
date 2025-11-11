declare module "ngeohash" {
  export function encode(latitude: number, longitude: number, precision?: number): string;
  export function decode(geohash: string): { latitude: number; longitude: number; latitudeError: number; longitudeError: number };
  export function neighbor(geohash: string, direction: string): string;
  export function neighbors(geohash: string): string[];
  export function bboxes(minLat: number, minLon: number, maxLat: number, maxLon: number, precision: number): string[];
  export function encode_int(latitude: number, longitude: number, bitDepth?: number): number;
  export function decode_int(geohashInteger: number, bitDepth?: number): { latitude: number; longitude: number; latitudeError: number; longitudeError: number };
}

