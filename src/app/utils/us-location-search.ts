export interface LocationSuggestion {
  displayName: string;
  key: string;
  value: string;
  kind: "remote" | "state" | "city";
}

interface UsState {
  name: string;
  code: string;
}

interface NominatimResult {
  place_id?: number;
  lat: string;
  lon: string;
  addresstype?: string;
  address: {
    city?: string;
    town?: string;
    village?: string;
    hamlet?: string;
    municipality?: string;
    county?: string;
    state?: string;
    state_code?: string;
    country_code?: string;
  };
}

const US_STATES: UsState[] = [
  { name: "Alabama", code: "AL" },
  { name: "Alaska", code: "AK" },
  { name: "Arizona", code: "AZ" },
  { name: "Arkansas", code: "AR" },
  { name: "California", code: "CA" },
  { name: "Colorado", code: "CO" },
  { name: "Connecticut", code: "CT" },
  { name: "Delaware", code: "DE" },
  { name: "Florida", code: "FL" },
  { name: "Georgia", code: "GA" },
  { name: "Hawaii", code: "HI" },
  { name: "Idaho", code: "ID" },
  { name: "Illinois", code: "IL" },
  { name: "Indiana", code: "IN" },
  { name: "Iowa", code: "IA" },
  { name: "Kansas", code: "KS" },
  { name: "Kentucky", code: "KY" },
  { name: "Louisiana", code: "LA" },
  { name: "Maine", code: "ME" },
  { name: "Maryland", code: "MD" },
  { name: "Massachusetts", code: "MA" },
  { name: "Michigan", code: "MI" },
  { name: "Minnesota", code: "MN" },
  { name: "Mississippi", code: "MS" },
  { name: "Missouri", code: "MO" },
  { name: "Montana", code: "MT" },
  { name: "Nebraska", code: "NE" },
  { name: "Nevada", code: "NV" },
  { name: "New Hampshire", code: "NH" },
  { name: "New Jersey", code: "NJ" },
  { name: "New Mexico", code: "NM" },
  { name: "New York", code: "NY" },
  { name: "North Carolina", code: "NC" },
  { name: "North Dakota", code: "ND" },
  { name: "Ohio", code: "OH" },
  { name: "Oklahoma", code: "OK" },
  { name: "Oregon", code: "OR" },
  { name: "Pennsylvania", code: "PA" },
  { name: "Rhode Island", code: "RI" },
  { name: "South Carolina", code: "SC" },
  { name: "South Dakota", code: "SD" },
  { name: "Tennessee", code: "TN" },
  { name: "Texas", code: "TX" },
  { name: "Utah", code: "UT" },
  { name: "Vermont", code: "VT" },
  { name: "Virginia", code: "VA" },
  { name: "Washington", code: "WA" },
  { name: "West Virginia", code: "WV" },
  { name: "Wisconsin", code: "WI" },
  { name: "Wyoming", code: "WY" },
  { name: "District of Columbia", code: "DC" },
];

const STATE_CODE_BY_NAME = new Map(US_STATES.map((state) => [state.name.toLowerCase(), state.code]));

function addSuggestion(map: Map<string, LocationSuggestion>, suggestion: LocationSuggestion) {
  const key = suggestion.value.toLowerCase();
  if (!map.has(key)) {
    map.set(key, suggestion);
  }
}

function normalizeStateCode(stateName?: string, stateCode?: string) {
  if (stateCode && stateCode.length === 2) return stateCode.toUpperCase();
  if (!stateName) return undefined;
  return STATE_CODE_BY_NAME.get(stateName.toLowerCase()) ?? stateName;
}

function formatCity(locality: string, stateName?: string, stateCode?: string) {
  const suffix = normalizeStateCode(stateName, stateCode);
  return suffix ? `${locality}, ${suffix}` : locality;
}

export async function searchUsLocations(query: string, signal?: AbortSignal): Promise<LocationSuggestion[]> {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];

  const suggestions = new Map<string, LocationSuggestion>();

  if ("remote".includes(normalized)) {
    addSuggestion(suggestions, {
      displayName: "Remote",
      key: "remote",
      value: "Remote",
      kind: "remote",
    });
  }

  for (const state of US_STATES) {
    if (state.name.toLowerCase().includes(normalized) || state.code.toLowerCase().startsWith(normalized)) {
      addSuggestion(suggestions, {
        displayName: state.name,
        key: `state-${state.code}`,
        value: state.name,
        kind: "state",
      });
    }
  }

  if (normalized.length < 2) {
    return Array.from(suggestions.values()).slice(0, 8);
  }

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=us&addressdetails=1&dedupe=1&limit=8&q=${encodeURIComponent(query)}`,
      {
        headers: { "Accept-Language": "en" },
        signal,
      }
    );

    if (!response.ok) {
      throw new Error(`Location search failed with ${response.status}`);
    }

    const results = (await response.json()) as NominatimResult[];

    for (const item of results) {
      if (item.address.country_code?.toLowerCase() !== "us") continue;

      const locality =
        item.address.city ??
        item.address.town ??
        item.address.village ??
        item.address.hamlet ??
        item.address.municipality ??
        item.address.county;

      const stateName = item.address.state;
      const isStateResult = item.addresstype === "state" || (!locality && stateName);

      if (isStateResult && stateName) {
        addSuggestion(suggestions, {
          displayName: stateName,
          key: `osm-state-${item.place_id ?? `${item.lat}-${item.lon}`}`,
          value: stateName,
          kind: "state",
        });
        continue;
      }

      if (!locality) continue;

      const displayName = formatCity(locality, stateName, item.address.state_code);
      addSuggestion(suggestions, {
        displayName,
        key: `osm-city-${item.place_id ?? `${item.lat}-${item.lon}`}`,
        value: displayName,
        kind: "city",
      });
    }
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "AbortError")) {
      // Keep local state suggestions as the fallback if the live search fails.
    }
  }

  return Array.from(suggestions.values()).slice(0, 8);
}
