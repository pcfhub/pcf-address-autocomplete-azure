/**
 * Everything that knows Azure Maps, and nothing that knows React or the
 * platform: URLs, the request, the response shapes, and what a refusal means.
 *
 * Search API version **2026-01-01**, read from Microsoft Learn on 2026-09-13.
 * It supersedes Search v1 — the `search/fuzzy/json?typeahead=true` pattern
 * every older community control uses is the deprecated route, and the
 * dedicated `geocode:autocomplete` endpoint is the one Microsoft names as its
 * replacement. Two calls:
 *
 *   GET {host}/geocode:autocomplete?api-version=2026-01-01&query=…   per settled keystroke
 *   GET {host}/geocode?api-version=2026-01-01&query=…                once, on a pick, for coordinates
 *
 * The second exists because the first does not promise a position: its
 * reference sample carries `"geometry": null` on every suggestion. So a
 * control that binds latitude or longitude pays one more transaction per pick,
 * and one that binds neither never makes the call.
 *
 * **Nothing here has been measured against the live service.** Every shape
 * below is from the reference page and its samples; `SPEC.md` keeps the list
 * of what a real key on a real form still has to confirm.
 */

/** The `endpoint` enum, one value per `<domain>` the manifest declares. */
export type Endpoint = 'public' | 'us' | 'eu' | 'kr' | 'br' | 'gov';

const HOSTS: Record<Endpoint, string> = {
    public: 'https://atlas.microsoft.com',
    us: 'https://us.atlas.microsoft.com',
    eu: 'https://eu.atlas.microsoft.com',
    kr: 'https://kr.atlas.microsoft.com',
    br: 'https://br.atlas.microsoft.com',
    gov: 'https://atlas.azure.us',
};

const API_VERSION = '2026-01-01';

/** Azure's own recommendation: three characters before the first request. */
export const DEFAULT_MIN_CHARACTERS = 3;

/** The API's own default for `top`; the range it accepts is 1–20. */
export const DEFAULT_SUGGESTIONS = 5;

/**
 * The host for an `endpoint` value. Anything that is not one of the six —
 * including `null`, which is what an unset enum arrives as on some hosts —
 * is the public cloud, because that is what an account is in unless somebody
 * chose a geography.
 */
export function hostFor(endpoint: string | null | undefined): string {
    return endpoint && Object.prototype.hasOwnProperty.call(HOSTS, endpoint)
        ? HOSTS[endpoint as Endpoint]
        : HOSTS.public;
}

/** `minCharacters` as the control applies it: unset or nonsense → 3, floor 1. */
export function minCharactersFrom(raw: number | null | undefined): number {
    return typeof raw === 'number' && Number.isFinite(raw) && raw >= 1
        ? Math.floor(raw)
        : DEFAULT_MIN_CHARACTERS;
}

/** `maxSuggestions` as the API accepts it: unset → 5, clamped to 1–20. */
export function suggestionsFrom(raw: number | null | undefined): number {
    return typeof raw === 'number' && Number.isFinite(raw)
        ? Math.min(20, Math.max(1, Math.floor(raw)))
        : DEFAULT_SUGGESTIONS;
}

export interface SuggestOptions {
    /** ISO 3166-1 alpha-2, restricts results to that country. Empty for all. */
    countryRegion: string | null;
    /** A point results are ranked near. Both halves, or neither. */
    bias: { latitude: number; longitude: number } | null;
    /** How many suggestions to ask for, already clamped. */
    top: number;
}

/**
 * The autocomplete URL. The key is NOT here — it travels in a header, see
 * `request` — which is why the URL is safe to log.
 *
 * The API requires a location signal on every call: `coordinates` or `bbox`.
 * With no bias point the control sends the whole world as a bounding box,
 * which the reference lists as valid and which ranks purely by the text. A
 * maker who sets a bias point gets `coordinates` instead, and `countryRegion`
 * narrows either. `resultTypeGroups=Address` keeps places (parks, businesses)
 * out of a list that is going to be written into address columns.
 */
export function autocompleteUrl(host: string, query: string, options: SuggestOptions): string {
    const params = new URLSearchParams();

    params.set('api-version', API_VERSION);
    params.set('query', query);

    if (options.bias) {
        // Longitude first: the API takes `lon,lat`, the opposite of the
        // order people say them in and of the order the columns are bound in.
        params.set('coordinates', `${options.bias.longitude},${options.bias.latitude}`);
    } else {
        params.set('bbox', '-180,-90,180,90');
    }

    const country = (options.countryRegion ?? '').trim();

    if (/^[A-Za-z]{2}$/.test(country)) {
        params.set('countryRegion', country.toUpperCase());
    }

    params.set('top', String(options.top));
    params.set('resultTypeGroups', 'Address');

    return `${host}/geocode:autocomplete?${params.toString()}`;
}

/** The geocoding URL for a picked address — one result is all that is wanted. */
export function geocodeUrl(host: string, formattedAddress: string): string {
    const params = new URLSearchParams();

    params.set('api-version', API_VERSION);
    params.set('query', formattedAddress);
    params.set('top', '1');

    return `${host}/geocode?${params.toString()}`;
}

/**
 * One suggestion, in the shape the columns want.
 *
 * `region` and `country` carry both spellings the API returns, and the
 * control picks one by the maker's `regionFormat` / `countryFormat` at write
 * time — so a suggestion is the same object whichever way it is written.
 */
export interface Suggestion {
    /** Unique within one response; the `<Option>` value. */
    id: string;
    formattedAddress: string;
    addressLine: string;
    city: string;
    regionShort: string;
    regionLong: string;
    postalCode: string;
    countryName: string;
    countryIso: string;
}

interface AddressNode {
    addressLine?: unknown;
    streetNumber?: unknown;
    streetName?: unknown;
    locality?: unknown;
    adminDistricts?: unknown;
    postalCode?: unknown;
    countryRegion?: unknown;
    formattedAddress?: unknown;
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/**
 * The `features[]` of an autocomplete response as `Suggestion`s.
 *
 * The address object is documented as *sparse* — "only the fields that the
 * resolved entity supplies are populated" — so every read tolerates absence.
 * `adminDistricts` is ordered coarsest first, and index 0 is the state or
 * province; a country with no first-order subdivision simply has none.
 * `addressLine` is preferred and `streetNumber streetName` assembled only
 * when it is missing, which the reference does not show happening but does
 * not rule out. A feature with no `formattedAddress` is dropped: it is the
 * one string the control cannot write without.
 */
export function parseSuggestions(body: unknown): Suggestion[] {
    const features = (body as { features?: unknown })?.features;

    if (!Array.isArray(features)) {
        return [];
    }

    const seen = new Set<string>();
    const suggestions: Suggestion[] = [];

    features.forEach((feature, index) => {
        const address = (feature as { properties?: { address?: AddressNode } })?.properties?.address;

        if (!address || typeof address !== 'object') {
            return;
        }

        const formattedAddress = text(address.formattedAddress);

        if (formattedAddress === '' || seen.has(formattedAddress)) {
            return;
        }

        seen.add(formattedAddress);

        const line = text(address.addressLine);
        const street = [text(address.streetNumber), text(address.streetName)].filter(Boolean).join(' ');
        const districts = Array.isArray(address.adminDistricts) ? address.adminDistricts : [];
        const first = (districts[0] ?? {}) as { name?: unknown; shortName?: unknown };
        const country = (address.countryRegion ?? {}) as { name?: unknown; ISO?: unknown };

        suggestions.push({
            id: `${index}:${formattedAddress}`,
            formattedAddress,
            addressLine: line || street,
            city: text(address.locality),
            regionShort: text(first.shortName) || text(first.name),
            regionLong: text(first.name) || text(first.shortName),
            postalCode: text(address.postalCode),
            countryName: text(country.name) || text(country.ISO),
            countryIso: text(country.ISO).toUpperCase(),
        });
    });

    return suggestions;
}

/**
 * The position of the first geocoding result, or `null` for none.
 *
 * GeoJSON puts longitude first — `[lon, lat]` — and reading it the other way
 * round is a point in the wrong hemisphere that no assertion on "two finite
 * numbers came back" would catch. An empty `features` array is a legitimate
 * answer ("no match", HTTP 200) rather than an error, and reads as `null`.
 */
export function parseCoordinates(body: unknown): { latitude: number; longitude: number } | null {
    const features = (body as { features?: unknown })?.features;

    if (!Array.isArray(features) || features.length === 0) {
        return null;
    }

    const coordinates = (features[0] as { geometry?: { coordinates?: unknown } })?.geometry?.coordinates;

    if (!Array.isArray(coordinates) || coordinates.length < 2) {
        return null;
    }

    const [longitude, latitude] = coordinates;

    if (typeof latitude !== 'number' || typeof longitude !== 'number'
        || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return null;
    }

    return { latitude, longitude };
}

/**
 * What went wrong, as something the component can pick a sentence for.
 *
 * `key` is a 401 — the subscription key was refused. `origin` is a 403,
 * which for a browser caller is almost always the account's CORS rule not
 * naming this site; the `.resx` sentence says so, because "forbidden" on its
 * own sends a maker to the wrong settings page. `rate` is a 429. `timeout`
 * and `unreachable` are the two ways a `fetch` fails to produce a status at
 * all, and `aborted` is the control's own doing — a newer keystroke or an
 * unmount — which is never shown.
 */
export interface Fault {
    kind: 'key' | 'origin' | 'rate' | 'service' | 'timeout' | 'unreachable' | 'aborted';
    status: number | null;
}

export function faultForStatus(status: number): Fault {
    if (status === 401) {
        return { kind: 'key', status };
    }

    if (status === 403) {
        return { kind: 'origin', status };
    }

    if (status === 429) {
        return { kind: 'rate', status };
    }

    return { kind: 'service', status };
}

export function isFault(error: unknown): error is Fault {
    return typeof error === 'object' && error !== null && typeof (error as Fault).kind === 'string';
}

/** How long a request may take before the control gives up on it. */
export const REQUEST_TIMEOUT_MS = 8000;

/**
 * One request to Azure Maps, resolving the parsed JSON body or rejecting with
 * a `Fault`.
 *
 * **The key goes in the `subscription-key` header, never in the URL.** Azure
 * accepts both; a key in the query string lands in browser history, in every
 * proxy and CDN log between here and Azure, and in any screenshot of the
 * network panel. A header does none of that. `Accept-Language` is the
 * browser's, so the suggestions come back in the language the reader is
 * typing in. Both headers are non-simple, so the browser sends a CORS
 * preflight first — Azure Maps answers it and does not bill it.
 *
 * Two ways to stop it: the caller's `signal` (the next keystroke, or the
 * component unmounting) and the timeout here, told apart by `timedOut` so a
 * request that ran out of time is reported and one the control cancelled is
 * not.
 */
export function request(url: string, key: string, signal: AbortSignal): Promise<unknown> {
    const controller = new AbortController();
    let timedOut = false;

    const timer = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, REQUEST_TIMEOUT_MS);

    const forward = (): void => controller.abort();

    if (signal.aborted) {
        forward();
    } else {
        signal.addEventListener('abort', forward);
    }

    return fetch(url, {
        method: 'GET',
        mode: 'cors',
        headers: {
            Accept: 'application/json',
            'subscription-key': key,
            'Accept-Language': typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en',
        },
        signal: controller.signal,
    })
        .then((response) => {
            if (!response.ok) {
                throw faultForStatus(response.status);
            }

            return response.json();
        })
        .catch((error: unknown) => {
            if (isFault(error)) {
                throw error;
            }

            const fault: Fault = signal.aborted
                ? { kind: 'aborted', status: null }
                : timedOut
                  ? { kind: 'timeout', status: null }
                  : { kind: 'unreachable', status: null };

            throw fault;
        })
        .finally(() => {
            window.clearTimeout(timer);
            signal.removeEventListener('abort', forward);
        });
}
