const INDIA_LATITUDE_MIN = 6;
const INDIA_LATITUDE_MAX = 38.8;
const INDIA_LONGITUDE_MIN = 67;
const INDIA_LONGITUDE_MAX = 98.5;

type GeocodedRecord = {
  latitude?: number | string | null;
  longitude?: number | string | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  locationText?: string | null;
};

function numericValue(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function textMentionsIndia(record: GeocodedRecord) {
  return [record.country, record.state, record.city, record.locationText]
    .filter(Boolean)
    .some((value) => /india|bharat/i.test(String(value)));
}

export function hasIndianCoordinates(record: GeocodedRecord) {
  const latitude = numericValue(record.latitude);
  const longitude = numericValue(record.longitude);
  if (latitude === null || longitude === null) return textMentionsIndia(record);

  const insideBounds =
    latitude >= INDIA_LATITUDE_MIN
    && latitude <= INDIA_LATITUDE_MAX
    && longitude >= INDIA_LONGITUDE_MIN
    && longitude <= INDIA_LONGITUDE_MAX;

  if (insideBounds) return true;
  return textMentionsIndia(record);
}

export function filterIndianStrains<T extends GeocodedRecord>(strains: T[]) {
  return strains.filter((strain) => hasIndianCoordinates(strain));
}

export function mapRecordIsIndia(record: GeocodedRecord) {
  return hasIndianCoordinates(record);
}
