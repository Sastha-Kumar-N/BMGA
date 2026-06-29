declare module "leaflet" {
  export type PointTuple = [number, number];
  export type LatLngTuple = [number, number];
  export type LatLngExpression = LatLngTuple | { lat: number; lng: number };
  export type LatLngBoundsExpression = LatLngExpression[] | [LatLngExpression, LatLngExpression];
  export type LeafletEventHandlerFn = (...args: unknown[]) => void;
  export type LeafletEventHandlerFnMap = Record<string, LeafletEventHandlerFn>;

  export interface ControlOptions {
    position?: string;
  }

  export interface FitBoundsOptions {
    padding?: PointTuple;
    maxZoom?: number;
  }

  export interface MapOptions {
    center?: LatLngExpression;
    zoom?: number;
    minZoom?: number;
    maxZoom?: number;
    zoomControl?: boolean;
    attributionControl?: boolean;
    scrollWheelZoom?: boolean;
  }

  export interface LayerOptions {
    pane?: string;
    attribution?: string;
  }

  export interface InteractiveLayerOptions extends LayerOptions {
    interactive?: boolean;
  }

  export interface GridLayerOptions extends LayerOptions {
    opacity?: number;
    zIndex?: number;
  }

  export interface TileLayerOptions extends GridLayerOptions {
    attribution?: string;
    maxZoom?: number;
    minZoom?: number;
  }

  export interface WMSOptions extends TileLayerOptions {
    layers?: string;
    format?: string;
    transparent?: boolean;
  }

  export type WMSParams = Record<string, string | number | boolean>;

  export interface PathOptions extends InteractiveLayerOptions {
    color?: string;
    weight?: number;
    opacity?: number;
    fill?: boolean;
    fillColor?: string;
    fillOpacity?: number;
  }

  export interface PolylineOptions extends PathOptions {
    smoothFactor?: number;
    noClip?: boolean;
  }

  export interface CircleMarkerOptions extends PathOptions {
    radius?: number;
  }

  export interface CircleOptions extends CircleMarkerOptions {
    radius?: number;
  }

  export interface ImageOverlayOptions extends InteractiveLayerOptions {
    opacity?: number;
    alt?: string;
  }

  export interface VideoOverlayOptions extends ImageOverlayOptions {
    autoplay?: boolean;
    loop?: boolean;
    muted?: boolean;
  }

  export interface MarkerOptions extends InteractiveLayerOptions {
    icon?: Icon;
    keyboard?: boolean;
    title?: string;
    alt?: string;
  }

  export interface PopupOptions extends LayerOptions {
    maxWidth?: number;
    minWidth?: number;
    closeButton?: boolean;
  }

  export interface TooltipOptions extends LayerOptions {
    permanent?: boolean;
    sticky?: boolean;
    direction?: string;
  }

  export interface IconOptions {
    iconUrl: string;
    shadowUrl?: string;
    iconSize?: PointTuple;
    iconAnchor?: PointTuple;
    popupAnchor?: PointTuple;
  }

  export class Icon {
    constructor(options: IconOptions);
  }

  export class Evented {
    on(type: string, fn: LeafletEventHandlerFn): this;
    off(type: string, fn?: LeafletEventHandlerFn): this;
  }

  export class Layer extends Evented {
    addTo(map: Map): this;
    remove(): this;
  }

  export class LayerGroup extends Layer {
    constructor(layers?: Layer[], options?: LayerOptions);
    addLayer(layer: Layer): this;
    removeLayer(layer: Layer): this;
  }

  export class FeatureGroup extends LayerGroup {}
  export class Path extends Layer {}
  export class CircleMarker extends Path {
    constructor(latlng: LatLngExpression, options?: CircleMarkerOptions);
  }
  export class Circle extends CircleMarker {}
  export class Polyline extends Path {
    constructor(latlngs: LatLngExpression[] | LatLngExpression[][], options?: PolylineOptions);
  }
  export class Polygon extends Polyline {}
  export class Rectangle extends Polygon {
    constructor(bounds: LatLngBoundsExpression, options?: PathOptions);
  }
  export class GeoJSON extends FeatureGroup {
    constructor(data?: unknown, options?: GeoJSONOptions);
  }

  export interface GeoJSONOptions extends LayerOptions {
    style?: PathOptions;
  }

  export class Map extends Evented {
    constructor(element: HTMLElement, options?: MapOptions);
    setView(center: LatLngExpression, zoom?: number): this;
    fitBounds(bounds: LatLngBoundsExpression, options?: FitBoundsOptions): this;
    remove(): this;
  }

  export class Marker extends Layer {
    constructor(latlng: LatLngExpression, options?: MarkerOptions);
  }

  export class TileLayer extends Layer {
    constructor(urlTemplate: string, options?: TileLayerOptions);
  }

  export class ImageOverlay extends Layer {
    constructor(url: string, bounds: LatLngBoundsExpression, options?: ImageOverlayOptions);
  }

  export class VideoOverlay extends ImageOverlay {}
  export class SVGOverlay extends ImageOverlay {}

  export class Popup extends Layer {
    constructor(options?: PopupOptions, source?: Layer);
  }

  export class Tooltip extends Layer {
    constructor(options?: TooltipOptions, source?: Layer);
  }

  export class LatLngBounds {
    constructor(bounds: LatLngBoundsExpression);
  }

  export namespace Control {
    class Layers extends Layer {}
  }

  export const Control: {
    Layers: typeof Control.Layers;
  };

  export const DomUtil: {
    addClass(element: HTMLElement, name: string): void;
    removeClass(element: HTMLElement, name: string): void;
  };

  const L: {
    Icon: typeof Icon;
    Map: typeof Map;
    Marker: typeof Marker;
    TileLayer: typeof TileLayer;
  };

  export default L;
}
