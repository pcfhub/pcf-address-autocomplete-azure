import * as React from 'react';
import {
    Combobox,
    FluentProvider,
    Option,
    Spinner,
    webLightTheme,
} from '@fluentui/react-components';
import { Fault, isFault, Suggestion } from '../azureMaps';

export interface IStrings {
    fallbackLabel: string;
    noAccess: string;
    placeholder: string;
    searching: string;
    noMatches: string;
    /** Carries a `{0}` for the minimum character count. */
    typeMore: string;
    noKey: string;
    clear: string;
    keyRefused: string;
    originRefused: string;
    rateLimited: string;
    /** Carries a `{0}` for the HTTP status. */
    serviceError: string;
    unreachable: string;
    timedOut: string;
    noCoordinates: string;
}

export interface IProps {
    /** The street line — the column the control sits on. */
    value: string;
    /**
     * The other bound columns as one muted line under the field — city,
     * region, postal code, country, joined — so a pick is visibly a pick of
     * *an address* and not just a street. Empty when none holds a value.
     */
    secondary: string;
    placeholder: string;
    minCharacters: number;
    visible: boolean;
    readable: boolean;
    disabled: boolean;
    errorMessage: string | null;
    label: string;
    isRTL: boolean;
    theme: ComponentFramework.Theme | undefined;
    strings: IStrings;
    /**
     * Ask Azure Maps, or `null` where the control cannot — no key. Function-
     * or-null on the same argument the catalogue's dataset controls make: a
     * fact about the host and its configuration, decided once in
     * `updateView`, not a per-call null.
     */
    suggest: ((query: string, signal: AbortSignal) => Promise<Suggestion[]>) | null;
    /** Every keystroke: the street line is a text column and stays one. */
    onType: (text: string) => void;
    /**
     * A pick. Resolves `null` when everything was written, or the `Fault`
     * from the geocoding half — the address columns are already written by
     * then, so the fault is reported under the field rather than undoing
     * anything.
     */
    onPick: (suggestion: Suggestion) => Promise<Fault | null>;
    onClear: () => void;
}

/** Long enough that a fast typist sends one request instead of eight. */
const DEBOUNCE_MS = 300;

type Status = 'idle' | 'typeMore' | 'searching' | 'noMatches' | 'results';

const format = (template: string, value: string): string => template.split('{0}').join(value);

/*
 * A form can carry two of these — a billing address and a shipping address
 * is the ordinary case — and a fixed id would point both `aria-describedby`s
 * at the first control's status text. React 16 has no `useId`, so this is the
 * equivalent: one per mounted instance, assigned once.
 */
let instances = 0;

/*
 * Inline SVG rather than `@fluentui/react-icons`: the icon package is not a
 * platform library, so importing it bundles its runtime for a twelve-line
 * path. `currentColor` is what makes the glyph follow the host theme.
 */
const DismissGlyph = (): React.ReactElement => (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
        <path
            d="M2.28 2.28a.75.75 0 0 1 1.06 0L6 4.94l2.66-2.66a.75.75 0 1 1 1.06 1.06L7.06 6l2.66 2.66a.75.75 0 0 1-1.06 1.06L6 7.06 3.34 9.72a.75.75 0 0 1-1.06-1.06L4.94 6 2.28 3.34a.75.75 0 0 1 0-1.06Z"
            fill="currentColor"
        />
    </svg>
);

const PinGlyph = (): React.ReactElement => (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path
            d="M8 1.5a4.5 4.5 0 0 1 4.5 4.5c0 3.1-3.3 6.8-4.1 7.7a.55.55 0 0 1-.8 0C6.8 12.8 3.5 9.1 3.5 6A4.5 4.5 0 0 1 8 1.5Zm0 2.75a1.75 1.75 0 1 0 0 3.5 1.75 1.75 0 0 0 0-3.5Z"
            fill="currentColor"
        />
    </svg>
);

/** The sentence for a fault, from the `.resx`. `aborted` has none: it is never shown. */
export function describeFault(fault: Fault, strings: IStrings): string {
    switch (fault.kind) {
        case 'key':
            return strings.keyRefused;
        case 'origin':
            return strings.originRefused;
        case 'rate':
            return strings.rateLimited;
        case 'timeout':
            return strings.timedOut;
        case 'unreachable':
            return strings.unreachable;
        case 'service':
            return format(strings.serviceError, String(fault.status ?? ''));
        default:
            return '';
    }
}

/**
 * Typing state, the suggestions and the open/closed popup all live here
 * rather than on the control class, for the reason every React control in the
 * catalogue gives: PCFHub's demo harness does not re-render after
 * `notifyOutputChanged()`, so a component rendering straight from props
 * would look dead in the published demo.
 *
 * The layout follows `pcf-lookup-search`, which follows the platform's own
 * lookup: one bordered field holding the search box, the actions inside the
 * border, the messages about the *search* inside the dropdown and the
 * messages about the control's *state* under the field.
 */
export function AddressAutocompleteAzureControl(props: IProps): React.ReactElement | null {
    const { strings } = props;

    const statusId = React.useRef('');

    if (statusId.current === '') {
        instances += 1;
        statusId.current = `AddressAutocompleteAzure-status-${instances}`;
    }

    const [fieldEl, setFieldEl] = React.useState<HTMLDivElement | null>(null);
    const [query, setQuery] = React.useState(props.value);
    const [candidates, setCandidates] = React.useState<Suggestion[]>([]);
    const [status, setStatus] = React.useState<Status>('idle');
    const [open, setOpen] = React.useState(false);
    const [failure, setFailure] = React.useState<string | null>(null);
    /** A geocoding call is in flight for a pick. */
    const [resolving, setResolving] = React.useState(false);
    /**
     * Whether the text in the box came from the keyboard since the last
     * platform value. The search effect keys on this rather than on the text:
     * a value handed down by the form must not open a dropdown over itself.
     */
    const typed = React.useRef(false);
    /**
     * The last street line this component itself handed up. The platform
     * answers every `notifyOutputChanged` by running `updateView` with the
     * value it was just given, so `props.value` changes on every keystroke —
     * and a resync that treated that as a form-driven change closed the
     * dropdown under the reader's cursor after each letter, and the "type at
     * least three characters" notice never survived long enough to be read.
     * The class has the same guard for the same reason; this is its half.
     */
    const echo = React.useRef<string | null>(null);
    const canSuggest = props.suggest !== null;

    // Resync when the platform hands down a genuinely different street line
    // — not the one this component just wrote — so a form-driven change
    // still wins over local state.
    React.useEffect(() => {
        if (props.value === echo.current) {
            return;
        }

        echo.current = null;
        typed.current = false;
        setQuery(props.value);
        setCandidates([]);
        setStatus('idle');
        setOpen(false);
    }, [props.value]);

    // A key taken away takes the last refusal with it: the sentence was about
    // a request that can no longer be made, and it would sit under the
    // "no key" hint contradicting it.
    React.useEffect(() => {
        if (!canSuggest) {
            setFailure(null);
            setCandidates([]);
            setOpen(false);
        }
    }, [canSuggest]);

    /*
     * The search: debounced, guarded by the effect's own lifetime, and
     * cancelled for real.
     *
     * `live` is what makes a slow answer harmless — each keystroke re-runs
     * this effect and the cleanup retires the previous run, so an earlier
     * request that lands after a later one cannot repaint the list. The
     * `AbortController` is the half `pcf-lookup-search` could not have: this
     * is a `fetch`, so the superseded request is stopped rather than merely
     * ignored, and the browser does not keep a connection open for an answer
     * nobody will read.
     */
    React.useEffect(() => {
        if (!typed.current || props.suggest === null || props.disabled) {
            return;
        }

        const term = query.trim();

        if (term.length < props.minCharacters) {
            setCandidates([]);
            setOpen(term.length > 0);
            setFailure(null);
            setStatus(term.length === 0 ? 'idle' : 'typeMore');

            return;
        }

        let live = true;
        const controller = new AbortController();
        const suggest = props.suggest;

        setStatus('searching');
        setFailure(null);
        setOpen(true);

        const timer = window.setTimeout(() => {
            suggest(term, controller.signal).then(
                (rows) => {
                    if (!live) {
                        return;
                    }

                    setCandidates(rows);
                    setStatus(rows.length > 0 ? 'results' : 'noMatches');
                    setOpen(true);
                },
                (error: unknown) => {
                    if (!live || (isFault(error) && error.kind === 'aborted')) {
                        return;
                    }

                    setCandidates([]);
                    setOpen(false);
                    setStatus('idle');
                    setFailure(isFault(error) ? describeFault(error, strings) : strings.unreachable);
                },
            );
        }, DEBOUNCE_MS);

        return () => {
            live = false;
            window.clearTimeout(timer);
            controller.abort();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query, canSuggest, props.disabled, props.minCharacters]);

    // Canvas relies on this; a model-driven form hides the section itself.
    if (!props.visible) {
        return null;
    }

    // A user denied read access must not be shown an empty field, which reads
    // as "no address" rather than as "not allowed to see it".
    if (!props.readable) {
        return <p className="AddressAutocompleteAzure-message">{strings.noAccess}</p>;
    }

    const onSelect = (id: string | undefined): void => {
        const picked = candidates.find((row) => row.id === id);

        if (!picked) {
            return;
        }

        const line = picked.addressLine || picked.formattedAddress;

        typed.current = false;
        echo.current = line;
        setQuery(line);
        setCandidates([]);
        setStatus('idle');
        setOpen(false);
        setFailure(null);
        setResolving(true);

        props.onPick(picked).then(
            (fault) => {
                setResolving(false);

                if (fault !== null) {
                    setFailure(fault.kind === 'service' && fault.status === null
                        ? strings.noCoordinates
                        : describeFault(fault, strings));
                }
            },
            (error: unknown) => {
                setResolving(false);
                setFailure(isFault(error) ? describeFault(error, strings) : strings.unreachable);
            },
        );
    };

    const onClear = (): void => {
        typed.current = false;
        echo.current = '';
        setQuery('');
        setCandidates([]);
        setStatus('idle');
        setOpen(false);
        setFailure(null);
        props.onClear();
    };

    const popupMessage = (): string => {
        switch (status) {
            case 'searching':
                return strings.searching;
            case 'noMatches':
                return strings.noMatches;
            case 'typeMore':
                return format(strings.typeMore, String(props.minCharacters));
            default:
                return '';
        }
    };

    const popupText = popupMessage();
    const invalid = props.errorMessage !== null || failure !== null;
    const clearable = !props.disabled && (query !== '' || props.secondary !== '');

    const field = [
        'AddressAutocompleteAzure-field',
        props.disabled ? 'AddressAutocompleteAzure-field--disabled' : '',
        invalid ? 'AddressAutocompleteAzure-field--invalid' : '',
    ].filter(Boolean).join(' ');

    return (
        <FluentProvider
            className="AddressAutocompleteAzure"
            theme={props.theme ?? webLightTheme}
            dir={props.isRTL ? 'rtl' : 'ltr'}
        >
            <div className={field} ref={setFieldEl}>
                <span className="AddressAutocompleteAzure-icon">
                    <PinGlyph />
                </span>

                <Combobox
                    className="AddressAutocompleteAzure-combobox"
                    freeform
                    // No chevron: the list has nothing in it until something
                    // is typed, and a chevron promises otherwise.
                    expandIcon={null}
                    // Controlled on both halves, so the input and the listbox
                    // cannot disagree after a write the platform did not echo.
                    value={query}
                    selectedOptions={[]}
                    open={open && (candidates.length > 0 || popupText !== '')}
                    onOpenChange={(_, data) => setOpen(data.open)}
                    onChange={(event) => {
                        typed.current = true;
                        echo.current = event.target.value;
                        setQuery(event.target.value);
                        props.onType(event.target.value);
                    }}
                    onOptionSelect={(_, data) => onSelect(data.optionValue)}
                    placeholder={props.placeholder || strings.placeholder}
                    disabled={props.disabled}
                    aria-label={props.label || strings.fallbackLabel}
                    aria-invalid={invalid}
                    aria-describedby={statusId.current}
                    aria-busy={resolving}
                    // Fluent renders the listbox through a portal, outside the
                    // control's root, so the class goes on the listbox itself
                    // and the stylesheet targets it directly.
                    listbox={{ className: 'AddressAutocompleteAzure-listbox' }}
                    // Anchor and size the dropdown to the whole field, not to
                    // the Combobox inside it, or it lands one icon short.
                    positioning={{ target: fieldEl, matchTargetSize: 'width' }}
                >
                    {candidates.length > 0 ? (
                        candidates.map((candidate) => {
                            const rest = candidate.formattedAddress.startsWith(candidate.addressLine)
                                ? candidate.formattedAddress.slice(candidate.addressLine.length).replace(/^,\s*/, '')
                                : candidate.formattedAddress;

                            return (
                                <Option key={candidate.id} value={candidate.id} text={candidate.formattedAddress}>
                                    <span className="AddressAutocompleteAzure-option">
                                        <span className="AddressAutocompleteAzure-option-line">
                                            {candidate.addressLine || candidate.formattedAddress}
                                        </span>
                                        {rest !== '' && candidate.addressLine !== '' && (
                                            <span className="AddressAutocompleteAzure-option-rest">{rest}</span>
                                        )}
                                    </span>
                                </Option>
                            );
                        })
                    ) : (
                        // Not an <Option>: a disabled option is still announced
                        // as a choice and is still in the keyboard order. The
                        // live region under the field announces this instead.
                        <div className="AddressAutocompleteAzure-notice" role="presentation">
                            {status === 'searching' && <Spinner size="extra-tiny" aria-hidden="true" />}
                            <span>{popupText}</span>
                        </div>
                    )}
                </Combobox>

                {resolving && <Spinner size="extra-tiny" aria-hidden="true" className="AddressAutocompleteAzure-busy" />}

                {clearable && (
                    <button
                        type="button"
                        className="AddressAutocompleteAzure-action"
                        aria-label={strings.clear}
                        title={strings.clear}
                        onClick={onClear}
                    >
                        <DismissGlyph />
                    </button>
                )}
            </div>

            {props.secondary !== '' && (
                <p className="AddressAutocompleteAzure-secondary">{props.secondary}</p>
            )}

            {/*
                The dropdown is not a live region and appears at the same
                moment as its text, which fewer screen readers announce than an
                element that was already there. So the same words sit here,
                visually hidden, as the target of `aria-describedby`.
            */}
            <p
                className="AddressAutocompleteAzure-live"
                id={statusId.current}
                role="status"
                aria-live="polite"
            >
                {popupText}
            </p>

            {props.suggest === null && (
                <p className="AddressAutocompleteAzure-message">{strings.noKey}</p>
            )}

            {failure !== null && (
                <p className="AddressAutocompleteAzure-message AddressAutocompleteAzure-message--error" role="alert">
                    {failure}
                </p>
            )}

            {props.errorMessage !== null && (
                <p className="AddressAutocompleteAzure-message AddressAutocompleteAzure-message--error" role="alert">
                    {props.errorMessage}
                </p>
            )}
        </FluentProvider>
    );
}
