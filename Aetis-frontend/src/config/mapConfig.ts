import { env } from "./env";

export const MAP_DEFAULT_CENTER: [number, number] = [env.mapDefaultLat, env.mapDefaultLng];
export const MAP_DEFAULT_ZOOM = 12;
export const MAP_MAX_ZOOM = 18;

/**
 * OpenStreetMap's public tile server is fine for development. Its usage
 * policy does not allow heavy production traffic, so before going live switch
 * to a tile provider you have an account with, and put env.mapApiKey in the URL.
 */
export const MAP_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export const MAP_TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';