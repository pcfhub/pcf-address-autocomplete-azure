import * as React from 'react';
import { IInputs, IOutputs } from './generated/ManifestTypes';
import { AddressAutocompleteAzureControl, IProps, IStrings } from './components/AddressAutocompleteAzureControl';
import {
    autocompleteUrl,
    Fault,
    geocodeUrl,
    hostFor,
    isFault,
    minCharactersFrom,
    parseCoordinates,
    parseSuggestions,
    request,
    Suggestion,
    suggestionsFrom,
} from './azureMaps';

/** The five text columns a suggestion writes, in the order they are bound. */
const TEXT_COLUMNS = ['addressLine1', 'city', 'stateOrProvince', 'postalCode', 'country'] as const;
const COORDINATE_COLUMNS = ['latitude', 'longitude'] as const;

type TextColumn = (typeof TEXT_COLUMNS)[number];
type CoordinateColumn = (typeof COORDINATE_COLUMNS)[number];
type Column = TextColumn | CoordinateColumn;

/**
 * An address type-ahead over Azure Maps, writing into seven bound columns.
 *
 * **Which columns are bound is visible from in here — measured — and it
 * shapes `getOutputs`.** Only `addressLine1` is required; the other six are
 * optional bound properties. A picker the maker left empty arrives as a
 * property with `type: null` and empty `attributes` and `security` objects
 * (a real Accounts form, 2026-09-13), where a mapped one carries the
 * column's metadata. This was designed believing the two were
 * indistinguishable, on `pcf-geo-stamp`'s reading, and the rule from that
 * reading stays because it is right either way: **emit a key only for a
 * column the control has written**, where "written" means a pick or a clear
 * put a value there or took one away — and never write an unmapped one at
 * all. A column the platform handed a value and the control never touched is
 * not in the outputs.
 *
 * The one exception is `addressLine1`, the column the control sits on, which
 * is always mapped and always emitted — `null` when cleared, through the
 * cast the skill's `getOutputs` rule names, because `undefined` there means
 * "no change" and a canvas app would never let the field empty.
 *
 * Every other piece of state — the query, the dropdown, the in-flight
 * request — is React state in the component, for the reason the catalogue's
 * other virtual controls give: `notifyOutputChanged()` does not repaint a
 * React control, a `setState` does.
 */
export class AddressAutocompleteAzure implements ComponentFramework.ReactControl<IInputs, IOutputs> {
    private notifyOutputChanged!: () => void;

    private values: Record<Column, string | number | null> = {
        addressLine1: null,
        city: null,
        stateOrProvince: null,
        postalCode: null,
        country: null,
        latitude: null,
        longitude: null,
    };

    /**
     * The last value the *platform* supplied per column, as opposed to one
     * the user typed or picked. Without this guard `updateView` running after
     * our own `notifyOutputChanged` re-adopts the platform's value and
     * discards the edit that caused it — one guard per column, because the
     * platform echoes each column back on its own schedule.
     */
    private lastIncoming: Partial<Record<Column, unknown>> = {};

    /** The columns this control has written or cleared; see the class comment. */
    private written = new Set<Column>();

    /**
     * The last values this control wrote, per column — not only the last one.
     *
     * **The platform echoes writes back out of order.** Measured on a real
     * Accounts form, 2026-09-13: typing "pase laur" produced passes carrying
     * `"pase laur"`, then `"pase lau"`, then `"pase laur"` — the echo of an
     * earlier keystroke arriving after a later one. A guard that recognises
     * only the most recent write reads that late echo as a form-driven change,
     * adopts it, and the last character typed disappears — which is exactly
     * what a fast typist saw. So every recent write is remembered, bounded,
     * and an incoming value that matches any of them is an echo. A value the
     * control never wrote is the form's, and clears the memory for that
     * column: the platform is authoritative from there.
     */
    private recentWrites: Record<Column, unknown[]> = {
        addressLine1: [],
        city: [],
        stateOrProvince: [],
        postalCode: [],
        country: [],
        latitude: [],
        longitude: [],
    };

    private static readonly ECHO_MEMORY = 32;

    private formattedAddress = '';

    public init(
        context: ComponentFramework.Context<IInputs>,
        notifyOutputChanged: () => void,
    ): void {
        this.notifyOutputChanged = notifyOutputChanged;
        // The dropdown is sized to the field; the field is sized to the host.
        context.mode.trackContainerResize(true);
    }

    public updateView(context: ComponentFramework.Context<IInputs>): React.ReactElement {
        const parameters = context.parameters;

        // Adopt every column the platform changed — and only a change that is
        // not an echo of something this control wrote. See `recentWrites`.
        (['addressLine1', 'city', 'stateOrProvince', 'postalCode', 'country'] as TextColumn[]).forEach((column) => {
            const incoming = parameters[column].raw ?? null;

            if (incoming !== this.lastIncoming[column]) {
                this.lastIncoming[column] = incoming;
                this.adopt(column, incoming === '' ? null : incoming);
            }
        });

        (['latitude', 'longitude'] as CoordinateColumn[]).forEach((column) => {
            const incoming = parameters[column].raw ?? null;

            if (incoming !== this.lastIncoming[column]) {
                this.lastIncoming[column] = incoming;
                this.adopt(column, incoming);
            }
        });

        const primary = parameters.addressLine1;
        const security = primary.security;
        const key = (parameters.subscriptionKey.raw ?? '').trim();
        const host = hostFor(parameters.endpoint.raw);
        const strings = this.strings(context);

        /*
         * **An unmapped picker is detectable, and this is how.** Measured on
         * a real Accounts form, 2026-09-13: a bound property the maker left
         * unbound arrives as `{ raw: null, type: null, attributes: {},
         * security: {} }` — eight keys where a mapped one has fifteen — so
         * `type === null` is the tell. The manifest comment and SPEC.md were
         * written believing there was none; the omission rule in
         * `getOutputs` stays because it is right either way, and this makes
         * it exact: an unmapped column is never written and never emitted.
         */
        const mapped = (column: Column): boolean => parameters[column].type !== null;

        /*
         * The other six columns' security is read per column and applied to
         * what the control *shows* of them — a user denied `city` sees no
         * city in the summary line — but never to the primary field: the
         * street line is its own column with its own security, and hiding
         * the whole control because a neighbour is denied is the bug
         * `pcf-date-range-picker` shipped in 0.1.x.
         *
         * Compared against `false`, not read as a boolean: a column with no
         * profile arrives as `{ secured: false, editable: true, readable:
         * true }`, an unmapped one as `{}` (both measured), and the
         * template's rig hands over `undefined`. Only an explicit `false` is
         * a denial.
         */
        const readable = (column: Column): boolean => parameters[column].security?.readable !== false;

        const secondary = (['city', 'stateOrProvince', 'postalCode', 'country'] as TextColumn[])
            .filter((column) => mapped(column) && readable(column))
            .map((column) => this.values[column])
            .filter((value): value is string => typeof value === 'string' && value !== '')
            .join(', ');

        const bias =
            typeof parameters.biasLatitude.raw === 'number' && typeof parameters.biasLongitude.raw === 'number'
                ? { latitude: parameters.biasLatitude.raw, longitude: parameters.biasLongitude.raw }
                : null;
        const options = {
            countryRegion: parameters.countryRegion.raw ?? null,
            bias,
            top: suggestionsFrom(parameters.maxSuggestions.raw),
        };
        const regionFormat = parameters.regionFormat.raw === 'long' ? 'long' : 'short';
        const countryFormat = parameters.countryFormat.raw === 'iso' ? 'iso' : 'name';
        const resolveCoordinates = parameters.resolveCoordinates.raw === true;

        const props: IProps = {
            value: typeof this.values.addressLine1 === 'string' ? this.values.addressLine1 : '',
            secondary,
            placeholder: parameters.placeholder.raw ?? '',
            minCharacters: minCharactersFrom(parameters.minCharacters.raw),
            visible: context.mode.isVisible,
            readable: security?.readable !== false,
            disabled: context.mode.isControlDisabled || security?.editable === false,
            errorMessage: primary.error ? primary.errorMessage : null,
            label: context.mode.label,
            isRTL: context.userSettings.isRTL,
            // The host's own Fluent theme when it offers one, so the control
            // follows a themed or dark environment instead of asserting light.
            theme: context.fluentDesignLanguage?.tokenTheme,
            strings,
            /*
             * `null` with no key, and the component says so under the field.
             * A control with a key that turns out to be wrong finds out from
             * the first request's 401, which is the honest order: the key is
             * not validated by looking at it.
             */
            suggest: key === ''
                ? null
                : (query: string, signal: AbortSignal): Promise<Suggestion[]> =>
                    request(autocompleteUrl(host, query, options), key, signal).then(parseSuggestions),
            onType: (text: string): void => {
                this.write('addressLine1', text === '' ? null : text);
                this.formattedAddress = '';
                this.notifyOutputChanged();
            },
            onPick: (picked: Suggestion): Promise<Fault | null> => {
                /*
                 * The street is the street, or nothing. A pick of a town —
                 * measured: "Tlaltenango de Sánchez Román, Zacatecas, México"
                 * — has no `addressLine`, and writing the formatted address
                 * into the street column put the city into the street and
                 * again into City. An empty street beside a filled city is
                 * what the record actually knows.
                 */
                this.write('addressLine1', picked.addressLine || null);
                this.writeMapped('city', picked.city || null, mapped);
                this.writeMapped('stateOrProvince', (regionFormat === 'long' ? picked.regionLong : picked.regionShort) || null, mapped);
                this.writeMapped('postalCode', picked.postalCode || null, mapped);
                this.writeMapped('country', (countryFormat === 'iso' ? picked.countryIso : picked.countryName) || null, mapped);
                this.formattedAddress = picked.formattedAddress;

                /*
                 * With coordinates on, the old ones go with the old address.
                 * The first harness walk picked a street Azure Maps could not
                 * place and left the *previous* pick's latitude and longitude
                 * on the record — a point in Singapore under an address in
                 * Ohio. Wrong data is worse than no data, so the two are
                 * cleared with the pick and filled only when the geocode
                 * answers; a maker who leaves the switch off has said the
                 * columns are theirs to manage, and they are left alone.
                 */
                if (resolveCoordinates) {
                    (['latitude', 'longitude'] as CoordinateColumn[]).forEach((column) => {
                        if (this.values[column] !== null) {
                            this.writeMapped(column, null, mapped);
                        }
                    });
                }

                this.notifyOutputChanged();

                if (!resolveCoordinates || key === '') {
                    return Promise.resolve(null);
                }

                /*
                 * The second transaction. The address columns are already
                 * written and reported above, so whatever happens here the
                 * pick has landed; a refusal or an empty answer is reported
                 * under the field and leaves the coordinates cleared.
                 * `signal` is a fresh controller because nothing supersedes
                 * a pick the way a keystroke supersedes a search.
                 */
                return request(geocodeUrl(host, picked.formattedAddress), key, new AbortController().signal)
                    .then((body) => {
                        const position = parseCoordinates(body);

                        if (position === null) {
                            // The component reads a `service` fault with no
                            // status as "no coordinates came back".
                            return { kind: 'service', status: null } as Fault;
                        }

                        this.writeMapped('latitude', position.latitude, mapped);
                        this.writeMapped('longitude', position.longitude, mapped);
                        this.notifyOutputChanged();

                        return null;
                    })
                    .catch((error: unknown) => {
                        console.warn('[AddressAutocompleteAzure] geocode failed', error);

                        return isFault(error) ? error : ({ kind: 'unreachable', status: null } as Fault);
                    });
            },
            onClear: (): void => {
                // Every column with something in it is cleared and, by being
                // cleared, becomes a column this control writes.
                (Object.keys(this.values) as Column[]).forEach((column) => {
                    if (this.values[column] !== null) {
                        this.writeMapped(column, null, mapped);
                    }
                });
                this.write('addressLine1', null);
                this.formattedAddress = '';
                this.notifyOutputChanged();
            },
        };

        return React.createElement(AddressAutocompleteAzureControl, props);
    }

    /**
     * Every column this control has written, plus the primary one always.
     *
     * `null` clears a column; `undefined` means "no change". The generated
     * `IOutputs` types each as optional, so `?? undefined` would type-check
     * and quietly turn every clear into a no-op — canvas honours that
     * strictly and the field would never empty. The cast is the fix, not a
     * workaround; the generated type is narrower than the contract.
     */
    public getOutputs(): IOutputs {
        const outputs: IOutputs = {
            addressLine1: this.emit('addressLine1') as string | undefined,
            formattedAddress: this.formattedAddress,
        };

        (['city', 'stateOrProvince', 'postalCode', 'country'] as TextColumn[]).forEach((column) => {
            if (this.written.has(column)) {
                outputs[column] = this.emit(column) as string | undefined;
            }
        });

        (['latitude', 'longitude'] as CoordinateColumn[]).forEach((column) => {
            if (this.written.has(column)) {
                outputs[column] = this.emit(column) as number | undefined;
            }
        });

        return outputs;
    }

    public destroy(): void {
        // React unmounts the component, whose effect cleanup aborts any
        // request in flight and clears the debounce timer.
    }

    /** `write`, unless the maker never mapped the column — then nothing, not even a key. */
    private writeMapped(column: Column, value: string | number | null, mapped: (column: Column) => boolean): void {
        if (mapped(column)) {
            this.write(column, value);
        }
    }

    private write(column: Column, value: string | number | null): void {
        this.values[column] = value;
        this.written.add(column);

        const recent = this.recentWrites[column];

        recent.push(value);

        if (recent.length > AddressAutocompleteAzure.ECHO_MEMORY) {
            recent.shift();
        }
    }

    /**
     * A value the platform handed down: an echo of one of this control's own
     * recent writes is ignored, whatever order it arrived in; anything else is
     * the form's and wins, and from then on the memory for that column starts
     * again.
     */
    private adopt(column: Column, incoming: string | number | null): void {
        if (this.recentWrites[column].includes(incoming)) {
            return;
        }

        this.recentWrites[column] = [];
        this.values[column] = incoming;
    }

    private emit(column: Column): string | number | undefined {
        const value = this.values[column];

        return value === null ? (null as unknown as undefined) : value;
    }

    private strings(context: ComponentFramework.Context<IInputs>): IStrings {
        const get = (key: string): string => context.resources.getString(`AddressAutocompleteAzure_${key}`);

        return {
            fallbackLabel: get('Name'),
            noAccess: get('NoAccess'),
            placeholder: get('Placeholder'),
            searching: get('Searching'),
            noMatches: get('NoMatches'),
            typeMore: get('TypeMore'),
            noKey: get('NoKey'),
            clear: get('Clear'),
            keyRefused: get('KeyRefused'),
            originRefused: get('OriginRefused'),
            rateLimited: get('RateLimited'),
            serviceError: get('ServiceError'),
            unreachable: get('Unreachable'),
            timedOut: get('TimedOut'),
            noCoordinates: get('NoCoordinates'),
        };
    }
}
