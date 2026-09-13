/*
 * Drives the real built bundle outside a browser.
 *
 *     npm run build && npm run smoke
 *
 * What it does: installs the DOM and the platform globals, loads
 * `out/controls/AddressAutocompleteAzure/bundle.js` the way a form would, drives the control
 * through the states a form can put it in, and asserts what it did.
 *
 * Why it exists alongside `npm start` and `dev/harness.html`: both of those
 * *show* you the control, and the states that matter most are ones nobody
 * thinks to look at — a column the user cannot read, a business rule that
 * failed, a host with no column metadata, a cleared value that has to travel
 * back as `null` rather than `undefined`. Those are decisions, they are what
 * regresses, and here they are assertions with an exit code.
 *
 * Why no test framework: there is none in this repository, and adding one to
 * run a handful of assertions against a bundle would be a dependency, a config
 * file and a second build pipeline for something `node` already does. It also
 * runs the **built bundle** rather than the TypeScript sources, which is the
 * part worth checking — webpack, the externals and the manifest all sit between
 * the source and what a form actually loads. CI runs it after the msbuild pack,
 * so there it drives the production bundle.
 *
 * **What passing here does NOT mean.** Every value below is supplied by this
 * file. It cannot tell you that the control looks right, that the stylesheet
 * applies, that focus order works, that a real form hands down what these
 * fixtures hand down, or that a save persists anything. Keep the answers to
 * those in SPEC.md under "Not verified".
 *
 * **And a stub must never be more capable than the thing it stands in for.**
 * `dev/host.js` withholds `security`, `attributes` and `fluentDesignLanguage`
 * exactly where the platform withholds them. When you add to it, stub the
 * refusals first — the argument the call requires, the field it omits, the
 * empty collection it hands back. If you cannot say what the real call
 * withholds, the stub is a guess and the assertions resting on it prove
 * nothing.
 *
 * ---
 *
 * **The assertions below the divider are a worked example. Replace them.**
 * Everything above the divider is plumbing that works for any field control;
 * the examples exercise the scaffolded control and are meant to be thrown away
 * with it.
 */

const fs = require('fs');
const vm = require('vm');
const path = require('path');

// Resolved from this file rather than from the working directory, so the script
// behaves the same run directly or through npm.
const root = path.join(__dirname, '..');
const dom = require('./dom.js');
const host = require('./host.js');
const clock = require('./clock.js');

const BUNDLE = path.join(root, 'out', 'controls', 'AddressAutocompleteAzure', 'bundle.js');

if (!fs.existsSync(BUNDLE)) {
    console.error('\n  No bundle at out/controls/AddressAutocompleteAzure. Run npm run build first.\n');
    process.exit(1);
}

/* ----------------------------------------------------------- the platform */

dom.install(global);

/*
 * Time, replaced with something the test drives.
 *
 * `vm.runInThisContext` below evaluates the bundle in *this* realm, so the
 * `Date`, `setInterval` and `setTimeout` the control closes over are the ones
 * installed here. That is what makes a control with a clock testable without
 * an injectable clock parameter — which would be production code bent to suit
 * a harness, and the only reason that seam would exist.
 *
 * A control with no timers is unaffected by this: nothing schedules, nothing
 * fires, and `time.pending()` stays at zero. Keep it anyway — the teardown
 * assertion at the bottom of this file is written against it, and it is the
 * assertion worth keeping when the worked example goes.
 *
 * The start value is arbitrary and fixed. A suite that starts at "now" asserts
 * something slightly different every time it runs.
 */
const time = clock.install(Date.UTC(2026, 0, 1, 12, 0, 0), global);

const registration = host.captureRegistration(global);

const source = fs.readFileSync(BUNDLE, 'utf8');

/*
 * The platform libraries, supplied under the names the bundle actually asks
 * for — read out of the bundle rather than written down here.
 *
 * A `<platform-library>` entry becomes a webpack external, and the global it
 * compiles to carries a version in its name. **That version is not the one the
 * manifest declares.** `pcf-scripts` maps a declared version onto the platform
 * build it supports, so Fluent `9.46.2` arrives as `FluentUIReactv940` and
 * React `16.14.0` as `Reactv16`. Hardcoding either is a trap that springs on
 * the next version bump, with a `ReferenceError` naming a global that appears
 * nowhere in the repository.
 *
 * A standard control has no externals at all, in which case both lists are
 * empty and nothing below runs.
 */
const reactGlobals = [...new Set(source.match(/\bReactv[\w]*\b/g) || [])];
const fluentGlobals = [...new Set(source.match(/\bFluentUIReact[\w]*\b/g) || [])];

let React = null;

if (reactGlobals.length > 0) {
    React = require(path.join(root, 'node_modules', 'react'));
    reactGlobals.forEach((name) => {
        global[name] = React;
    });
}

/*
 * Fluent is stubbed rather than loaded, the way the grid rig stubs it: every
 * component resolves to its own name as an element type, so
 * `React.createElement(Input, …)` produces `{ type: 'Input', props }` and the
 * props the control passed survive for inspection. These assertions are about
 * the control's decisions, not about how Fluent renders them — and Fluent 9
 * ships no UMD build, so there is nothing to load in a browser either.
 */
const fluent = new Proxy({}, { get: (_target, name) => (typeof name === 'string' ? name : undefined) });

fluentGlobals.forEach((name) => {
    global[name] = fluent;
});

vm.runInThisContext(source, { filename: 'bundle.js' });

/* ---------------------------------------------------------------- harness */

const results = [];

function check(label, ok, detail) {
    results.push({ ok, label, detail });
}

// `getString` returns a marked key rather than a real string, so an assertion
// can tell "read from the .resx" apart from "hardcoded in the source" — which
// would otherwise look identical in the output.
const marked = (key) => `resx:${key}`;

/**
 * Mount a fresh control in a given state and hand back everything worth
 * asserting about it.
 *
 * A new instance per state on purpose: `init` runs once per control on a real
 * form, so a suite that reused one instance would be testing a sequence the
 * platform never produces. Where the *sequence* is the point — a value arriving
 * after an edit — drive `updateView` again through the returned handle.
 */
/**
 * Every control mounted and not yet destroyed.
 *
 * A suite that mounts and walks away is testing something other than what it
 * says: an abandoned control keeps its interval and its `document` listeners,
 * so the next section's counts include them and the next event dispatched at
 * `document` reaches all of them. That is the leak the teardown assertion
 * exists to catch, and asserting it from inside one proves nothing.
 */
const live = [];

function disposeAll() {
    while (live.length > 0) {
        live.pop().destroy();
    }
}

function mount(options) {
    const container = dom.createElement('div');
    const calls = [];
    // `getString` first, so a single assertion can override it — the marked key
    // proves a string came from the .resx, but it cannot prove a `{0}` was
    // substituted, because a marked key has no `{0}` in it to substitute.
    const context = host.createContext({ getString: marked, ...options, calls });
    const instance = new registration.ctor();

    let notifications = 0;

    /*
     * The third argument is the state a previous mount handed to
     * `mode.setControlState`, and it was hard-coded to `{}` here — which made
     * the *return* half of that API unreachable from a suite. Pass `state` in
     * `options` to mount a control the way the platform remounts one after a
     * form tab switch. `{}` remains the default, because that is a first mount.
     */
    instance.init(context, () => {
        notifications += 1;
    }, options.state || {}, container);

    // A standard control returns nothing and has written into `container`; a
    // virtual one returns the element it wants rendered and was handed no
    // container at all.
    const element = instance.updateView(context);

    const handle = {
        instance,
        container,
        element,
        props: () => (element && element.props) || {},
        outputs: () => instance.getOutputs(),
        notifications: () => notifications,
        /** `trackContainerResize` / `setFullScreen` calls the control made. */
        calls: () => calls,
        /** Re-render in a new state, as the platform does on every change. */
        update: (next) => instance.updateView(host.createContext({ getString: marked, ...options, ...next })),
        /** Unmount, as the platform does when the form closes or navigates. */
        destroy: () => {
            instance.destroy();

            const at = live.indexOf(handle);

            if (at !== -1) {
                live.splice(at, 1);
            }
        },
        find: (selector) => container.querySelector(selector),
    };

    live.push(handle);

    return handle;
}

check('bundle registered a control', typeof registration.ctor === 'function');

if (typeof registration.ctor !== 'function') {
    report();
}

/* ======================================================================== *
 *  What this suite can and cannot say.
 *
 *  The control is React-virtual, so `updateView` returns an element and these
 *  assertions read the props it passed down — the control's decisions — and
 *  call the callbacks it handed over. Everything Azure Maps sees goes through
 *  `props().suggest` and `props().onPick`, and the rig's `fetch` stand-in
 *  records each request: its URL, the *names* of its headers, and whether a
 *  key travelled in the header. So the URL shape, where the key goes, what a
 *  refusal becomes, what a pick writes and what a clear emits are all here.
 *
 *  The component's own effects — the debounce, the retired-handler guard, the
 *  abort of a superseded request — do not run in a static render, and the
 *  rig's hand-written DOM is not a place `react-dom` can mount into. Those
 *  are driven in `dev/harness.html` against the real React and photographed;
 *  SPEC.md lists them under what the suite does not prove.
 * ======================================================================== */

/** Let promise chains settle — a few microtask turns, no fake time spent. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

const fixture = require('./fixture.js');

/** The Azure Maps requests made since a mark — see `mapsRequests` in host.js. */
const mark = () => host.mapsRequests.length;
const since = (from) => host.mapsRequests.slice(from);

const plain = mount({});

check('returns an element rather than writing into a container', plain.element !== undefined && plain.element !== null);

check(
    'hands the component the street line the platform supplied',
    plain.props().value === '1 Microsoft Way',
    JSON.stringify(plain.props().value),
);

check(
    'and nothing under it while the other columns are empty',
    plain.props().secondary === '',
    JSON.stringify(plain.props().secondary),
);

const filled = mount({
    columns: { city: 'Redmond', stateOrProvince: 'WA', postalCode: '98052', country: 'United States', latitude: 47.64, longitude: -122.13 },
});

check(
    'the other text columns are shown as one line under the field, in address order',
    filled.props().secondary === 'Redmond, WA, 98052, United States',
    JSON.stringify(filled.props().secondary),
);

/* ------------------------------------------------------------ the host fact */

check(
    'with a key, the component is handed a way to ask Azure Maps',
    typeof plain.props().suggest === 'function',
    typeof plain.props().suggest,
);

const keylessMark = mark();
const keyless = mount({ key: '' });

check(
    'with no key it is handed null, and nothing is ever requested',
    keyless.props().suggest === null && since(keylessMark).length === 0,
    `suggest is ${keyless.props().suggest}, ${since(keylessMark).length} fetch(es)`,
);

check(
    'a key passed as an input outranks the rig default, and a blank one withholds the same way',
    mount({ inputs: { subscriptionKey: '   ' } }).props().suggest === null,
);

/* ------------------------------------------------------- the autocomplete call */

async function requestChecks() {
    const signal = new AbortController().signal;
    const firstMark = mark();
    const rows = await plain.props().suggest('1 micro', signal);
    const [first] = since(firstMark);

    check(
        'a query becomes one GET of geocode:autocomplete on the 2026-01-01 API',
        since(firstMark).length === 1
            && first.url.startsWith('https://atlas.microsoft.com/geocode:autocomplete?')
            && first.url.includes('api-version=2026-01-01')
            && first.url.includes('query=1+micro'),
        first ? first.url : 'no request',
    );

    /*
     * **The key is in a header and not in the URL.** Azure accepts both. A key
     * in the query string is in browser history, in every proxy log between
     * here and Azure, and in any screenshot of the network panel; a header is
     * in none of them. The rig logs the header *names* and whether the key
     * header carried a value, never the value — so this can be asserted
     * without the suite itself printing the key.
     */
    check(
        'the key travels in the subscription-key header and appears nowhere in the URL',
        first.keyed === true
            && first.headers.includes('subscription-key')
            && !first.url.includes('rig-subscription-key')
            && !/subscription-key=/.test(first.url),
        `headers ${JSON.stringify(first.headers)}, url ${first.url}`,
    );

    check(
        'the request asks for addresses only, five of them, from the whole world',
        first.url.includes('resultTypeGroups=Address')
            && first.url.includes('top=5')
            && first.url.includes('bbox=-180%2C-90%2C180%2C90')
            && !first.url.includes('coordinates='),
        first.url,
    );

    check(
        'Accept-Language is sent, so suggestions come back in the reader\'s language',
        first.headers.includes('Accept-Language'),
        JSON.stringify(first.headers),
    );

    /*
     * The response is parsed into the shape the columns want. The two
     * Microsoft rows share a city, region and postal code; the reference's
     * `adminDistricts[0]` is the state, carrying both spellings.
     */
    check(
        'suggestions arrive parsed: street, city, both region spellings, postal code, both country spellings',
        rows.length === 2
            && rows[0].addressLine === '1 Microsoft Way'
            && rows[0].city === 'Redmond'
            && rows[0].regionShort === 'WA'
            && rows[0].regionLong === 'Washington'
            && rows[0].postalCode === '98052'
            && rows[0].countryName === 'United States'
            && rows[0].countryIso === 'US'
            && rows[0].formattedAddress === '1 Microsoft Way, Redmond, WA 98052, United States',
        JSON.stringify(rows[0]),
    );

    check(
        'each suggestion has a distinct id for the option list',
        new Set(rows.map((row) => row.id)).size === rows.length,
        rows.map((row) => row.id).join(' | '),
    );

    /*
     * The sparse cases the reference calls normal: a country with no
     * first-order subdivision, and a street with no number or postal code.
     * A reader written against the happy path throws on the first and writes
     * "undefined" on the second.
     */
    const singapore = await plain.props().suggest('raffles', signal);
    const paris = await plain.props().suggest('rivoli', signal);

    check(
        'an address with no region or no postal code parses to empty strings, not to a throw',
        singapore.length === 1 && singapore[0].regionShort === '' && singapore[0].regionLong === ''
            && paris.length === 1 && paris[0].postalCode === '' && paris[0].addressLine === 'Rue de Rivoli',
        `${JSON.stringify(singapore[0])} / ${JSON.stringify(paris[0])}`,
    );

    /* ---- the maker's options reach the URL */

    const narrowed = mount({
        inputs: { maxSuggestions: 1, countryRegion: 'us', biasLatitude: 47.6, biasLongitude: -122.3, endpoint: 'eu' },
    });

    const narrowMark = mark();

    await narrowed.props().suggest('micro', signal);

    const [narrow] = since(narrowMark);

    check(
        'country, bias point, suggestion count and endpoint each change the request',
        narrow.url.startsWith('https://eu.atlas.microsoft.com/geocode:autocomplete?')
            && narrow.url.includes('countryRegion=US')
            && narrow.url.includes('coordinates=-122.3%2C47.6')
            && !narrow.url.includes('bbox=')
            && narrow.url.includes('top=1'),
        narrow.url,
    );

    check(
        'the bias point is sent longitude first, as the API takes it',
        /coordinates=-122\.3%2C47\.6/.test(narrow.url),
        narrow.url,
    );

    check(
        'a suggestion count outside 1–20 is clamped, and an unset minimum is three',
        mount({ inputs: { maxSuggestions: 99 } }).props().minCharacters === 3
            && mount({ inputs: { minCharacters: 5 } }).props().minCharacters === 5
            && mount({ inputs: { minCharacters: 0 } }).props().minCharacters === 3,
    );

    const clamped = mount({ inputs: { maxSuggestions: 99 } });
    const clampedMark = mark();

    await clamped.props().suggest('micro', signal);

    check(
        'top is clamped to the API\'s ceiling of twenty',
        since(clampedMark)[0].url.includes('top=20'),
        since(clampedMark)[0].url,
    );

    const twoLetter = mount({ inputs: { countryRegion: 'usa' } });
    const twoLetterMark = mark();

    await twoLetter.props().suggest('micro', signal);

    check(
        'a country code that is not two letters is left out rather than sent',
        !since(twoLetterMark)[0].url.includes('countryRegion='),
        since(twoLetterMark)[0].url,
    );

    /* ---- what Azure Maps can answer with */

    const empty = await mount({ maps: { status: 200, empty: true } }).props().suggest('micro', signal);

    check(
        'HTTP 200 with no features is an empty list, not a rejection',
        Array.isArray(empty) && empty.length === 0,
        JSON.stringify(empty),
    );

    const refusal = async (maps) => {
        try {
            await mount({ maps }).props().suggest('micro', new AbortController().signal);

            return 'resolved';
        } catch (error) {
            return error && error.kind ? `${error.kind}:${error.status}` : String(error);
        }
    };

    check(
        'a 401 is a refused key, a 403 a refused origin, a 429 rate limiting, a 500 the service',
        (await refusal({ status: 401 })) === 'key:401'
            && (await refusal({ status: 403 })) === 'origin:403'
            && (await refusal({ status: 429 })) === 'rate:429'
            && (await refusal({ status: 500 })) === 'service:500',
        [await refusal({ status: 401 }), await refusal({ status: 403 }), await refusal({ status: 429 }), await refusal({ status: 500 })].join(' '),
    );

    check(
        'a network that never answers is "unreachable", with no status to show',
        (await refusal({ status: 200, unreachable: true })) === 'unreachable:null',
        await refusal({ status: 200, unreachable: true }),
    );

    /*
     * A request that never settles is the control's own timeout's job. The
     * timer is a `window.setTimeout` under the fake clock, so advancing past
     * eight seconds is what fires it; the rig's promise then rejects on the
     * abort, and the control has to report a *timeout* rather than an abort
     * it did not ask for.
     */
    const hung = mount({ maps: { status: 200, hang: true } });
    let hungResult = 'pending';

    hung.props().suggest('micro', new AbortController().signal).then(
        () => { hungResult = 'resolved'; },
        (error) => { hungResult = error && error.kind ? error.kind : String(error); },
    );

    await flush();
    time.advance(7999);
    await flush();

    const stillPending = hungResult;

    time.advance(2);
    await flush();
    await flush();

    check(
        'a request that never answers times out after eight seconds, and not before',
        stillPending === 'pending' && hungResult === 'timeout',
        `at 7999 ms: ${stillPending}; at 8001 ms: ${hungResult}`,
    );

    /*
     * The caller's own abort — a newer keystroke, an unmount — is not a
     * fault to show. The kind is `aborted` and the component drops it.
     */
    const controller = new AbortController();
    const slow = mount({ maps: { status: 200, hang: true } });
    let abortedResult = 'pending';

    slow.props().suggest('micro', controller.signal).then(
        () => { abortedResult = 'resolved'; },
        (error) => { abortedResult = error && error.kind ? error.kind : String(error); },
    );

    await flush();
    controller.abort();
    await flush();
    await flush();

    check(
        'a request the control cancels itself rejects as "aborted", which is never shown',
        abortedResult === 'aborted',
        abortedResult,
    );

    check(
        'and the timeout timer is released with it',
        time.pending() === 0,
        `${time.pending()} timer(s) pending`,
    );
}

/* -------------------------------------------------------------- the pick */

async function pickChecks() {
    const signal = new AbortController().signal;
    const picker = mount({});
    const [microsoft] = await picker.props().suggest('1 microsoft way', signal);
    const before = mark();

    const fault = await picker.props().onPick(microsoft);

    check(
        'a pick writes the street and the four other text columns, and reports the formatted address',
        fault === null
            && picker.notifications() === 1
            && picker.outputs().addressLine1 === '1 Microsoft Way'
            && picker.outputs().city === 'Redmond'
            && picker.outputs().stateOrProvince === 'WA'
            && picker.outputs().postalCode === '98052'
            && picker.outputs().country === 'United States'
            && picker.outputs().formattedAddress === '1 Microsoft Way, Redmond, WA 98052, United States',
        JSON.stringify(picker.outputs()),
    );

    /*
     * **No coordinates unless asked.** `resolveCoordinates` is off, so the
     * pick made no second request and the outputs carry no latitude or
     * longitude key at all — not `null`, which would clear a column the
     * maker may have bound to something else, but absent, which is "no
     * change".
     */
    check(
        'with Fill latitude and longitude off, no geocode call is made and neither key is emitted',
        since(before).length === 0
            && !('latitude' in picker.outputs())
            && !('longitude' in picker.outputs()),
        `${since(before).length} extra fetch(es); keys ${Object.keys(picker.outputs()).join(',')}`,
    );

    const long = mount({ inputs: { regionFormat: 'long', countryFormat: 'iso' } });
    const [row] = await long.props().suggest('1 microsoft way', signal);

    await long.props().onPick(row);

    check(
        'Region format and Country format choose the spelling written',
        long.outputs().stateOrProvince === 'Washington' && long.outputs().country === 'US',
        `${long.outputs().stateOrProvince} / ${long.outputs().country}`,
    );

    /* ---- the second transaction */

    const geo = mount({ inputs: { resolveCoordinates: true } });
    const [target] = await geo.props().suggest('1 microsoft way', signal);
    const geoBefore = mark();
    const geoFault = await geo.props().onPick(target);
    const [geocode] = since(geoBefore);

    check(
        'with it on, a pick makes one geocode call for the picked address and writes both coordinates',
        geoFault === null
            && since(geoBefore).length === 1
            && geocode.url.startsWith('https://atlas.microsoft.com/geocode?')
            && geocode.url.includes('top=1')
            && geocode.url.includes('query=1+Microsoft+Way%2C+Redmond')
            && geocode.keyed === true
            && geo.outputs().latitude === 47.64203
            && geo.outputs().longitude === -122.13707,
        `${geocode ? geocode.url : 'no geocode'}; lat ${geo.outputs().latitude}, lon ${geo.outputs().longitude}`,
    );

    check(
        'the coordinates are read longitude-first from GeoJSON, so latitude is the second number',
        geo.outputs().latitude > 47 && geo.outputs().latitude < 48 && geo.outputs().longitude < -122,
        `lat ${geo.outputs().latitude}, lon ${geo.outputs().longitude}`,
    );

    check(
        'the address columns were written and reported before the geocode answered',
        geo.notifications() === 2 && geo.outputs().city === 'Redmond',
        `${geo.notifications()} notification(s)`,
    );

    const unmapped = mount({ inputs: { resolveCoordinates: true } });
    const [nowhere] = await unmapped.props().suggest('unmapped', signal);
    const nowhereFault = await unmapped.props().onPick(nowhere);

    check(
        'an address Azure Maps cannot place keeps its columns, emits no coordinates, and reports it',
        nowhereFault !== null && nowhereFault.kind === 'service' && nowhereFault.status === null
            && unmapped.outputs().city === 'Nowhere'
            && !('latitude' in unmapped.outputs()),
        JSON.stringify({ fault: nowhereFault, keys: Object.keys(unmapped.outputs()) }),
    );

    /*
     * Found in the browser, not here: a second pick that could not be placed
     * left the *first* pick's coordinates on the record. With the switch on,
     * the old coordinates belong to the old address and go with it.
     */
    const stale = mount({ inputs: { resolveCoordinates: true }, columns: { latitude: 1.28406, longitude: 103.85128 } });
    const [ohio] = await stale.props().suggest('unmapped', signal);

    await stale.props().onPick(ohio);

    check(
        'with coordinates on, a pick clears the previous address\'s coordinates even when the new one cannot be placed',
        stale.outputs().latitude === null && stale.outputs().longitude === null
            && Object.prototype.hasOwnProperty.call(stale.outputs(), 'latitude'),
        JSON.stringify(stale.outputs()),
    );

    const kept = mount({ columns: { latitude: 1.28406, longitude: 103.85128 } });
    const [ohioAgain] = await kept.props().suggest('unmapped', signal);

    await kept.props().onPick(ohioAgain);

    check(
        'with it off, the coordinate columns are the maker\'s and a pick leaves them alone',
        !('latitude' in kept.outputs()) && !('longitude' in kept.outputs()),
        Object.keys(kept.outputs()).join(','),
    );

    const refusedGeo = mount({ inputs: { resolveCoordinates: true } });
    const [row2] = await refusedGeo.props().suggest('1 microsoft way', signal);

    refusedGeo.update({ maps: { status: 403 } });

    // `update` re-renders with a 403 host; the pick uses the callbacks of the
    // element that was rendered, so re-read them.
    const refused = await refusedGeo.update({ maps: { status: 403 }, inputs: { resolveCoordinates: true } }).props.onPick(row2);

    check(
        'a refused geocode is reported as its own fault and undoes nothing',
        refused !== null && refused.kind === 'origin'
            && refusedGeo.outputs().city === 'Redmond'
            && !('latitude' in refusedGeo.outputs()),
        JSON.stringify(refused),
    );

    /*
     * A suggestion that lacks a part clears the column for it. The maker
     * mapped the column to receive the address; a stale postal code from the
     * previous address would be a wrong one, not a preserved one.
     */
    const partial = mount({ columns: { postalCode: '99999', stateOrProvince: 'XX' } });
    const [raffles] = await partial.props().suggest('raffles', signal);

    await partial.props().onPick(raffles);

    check(
        'a pick with no region writes null to the region column rather than leaving the old value',
        partial.outputs().stateOrProvince === null
            && Object.prototype.hasOwnProperty.call(partial.outputs(), 'stateOrProvince')
            && partial.outputs().postalCode === '048616',
        JSON.stringify(partial.outputs()),
    );
}

/* ------------------------------------------------------ typing and clearing */

const typing = mount({});

typing.props().onType('15 Main');

check(
    'typing writes the street line only, and forgets the formatted address',
    typing.outputs().addressLine1 === '15 Main'
        && typing.outputs().formattedAddress === ''
        && !('city' in typing.outputs()),
    JSON.stringify(typing.outputs()),
);

/*
 * **What an untouched control emits, and what a cleared one emits.**
 *
 * An unmapped optional bound property is indistinguishable from a mapped and
 * empty one from inside the control, so the six are emitted only once this
 * control has written them — `pcf-geo-stamp`'s rule. The primary is always
 * emitted, and `null` there is a clear the platform can act on: `undefined`
 * would be "no change", which canvas honours by refusing to empty the field.
 */
const untouched = mount({});

check(
    'an untouched control emits the street line and the formatted address, and none of the six',
    Object.keys(untouched.outputs()).sort().join(',') === 'addressLine1,formattedAddress',
    Object.keys(untouched.outputs()).join(','),
);

const clearedColumn = mount({ value: null });

check(
    'a cleared street column produces an output the platform can act on, not "no change"',
    clearedColumn.outputs().addressLine1 === null
        && Object.prototype.hasOwnProperty.call(clearedColumn.outputs(), 'addressLine1'),
    JSON.stringify(clearedColumn.outputs()),
);

const clearing = mount({ columns: { city: 'Redmond', postalCode: '98052', latitude: 47.6, longitude: -122.1 } });

clearing.props().onClear();

check(
    'Clear emits null for the street and for every column that held something, and nothing for the rest',
    clearing.outputs().addressLine1 === null
        && clearing.outputs().city === null
        && clearing.outputs().postalCode === null
        && clearing.outputs().latitude === null
        && clearing.outputs().longitude === null
        && !('stateOrProvince' in clearing.outputs())
        && !('country' in clearing.outputs())
        && clearing.outputs().formattedAddress === '',
    JSON.stringify(clearing.outputs()),
);

check(
    'and a second Clear on an already-empty control emits the street line only',
    (() => {
        const twice = mount({ value: null });

        twice.props().onClear();

        return Object.keys(twice.outputs()).sort().join(',') === 'addressLine1,formattedAddress';
    })(),
);

/*
 * The echo guard, per column. After a write the platform hands the same value
 * back; that must not re-adopt over a later edit, and a genuinely new value
 * from the form must win.
 */
const echoed = mount({});

echoed.props().onType('Typed');
echoed.update({ value: '1 Microsoft Way' });
echoed.props().onType('Typed more');

check(
    'the platform echoing the old street line does not discard what was typed since',
    echoed.outputs().addressLine1 === 'Typed more',
    JSON.stringify(echoed.outputs().addressLine1),
);

check(
    'and a genuinely new value from the form wins',
    echoed.update({ value: 'From the form' }).props.value === 'From the form',
);

/* ------------------------------------------------- the states a form sets */

check(
    'a read-only column disables the control on an editable form',
    mount({ security: 'read-only' }).props().disabled === true,
);

check(
    'a column the user cannot read is masked, not just disabled',
    mount({ security: 'no-access', value: null }).props().readable === false,
);

check(
    'a denied *other* column drops out of the line under the field and masks nothing else',
    (() => {
        const partial = mount({
            columns: { city: 'Redmond', postalCode: '98052' },
            columnSecurity: { city: 'no-access' },
        });

        return partial.props().readable === true && partial.props().secondary === '98052';
    })(),
);

check(
    "the platform's own validation message is passed down",
    mount({ error: true }).props().errorMessage === host.DEFAULTS.errorMessage,
);

check(
    'the form\'s label is the accessible name, with the .resx name as the fallback',
    mount({}).props().label === 'Street 1' && mount({}).props().strings.fallbackLabel === 'resx:AddressAutocompleteAzure_Name',
);

check(
    'every sentence the component can show comes from the .resx',
    Object.values(mount({}).props().strings).every((value) => typeof value === 'string' && value.startsWith('resx:')),
    Object.values(mount({}).props().strings).filter((value) => !String(value).startsWith('resx:')).join(','),
);

check(
    'a canvas host publishes no theme, and the control passes none rather than a guess',
    mount({ host: 'canvas' }).props().theme === undefined,
);

check(
    'the control asks for resize notifications, which is what sizes the dropdown to the field',
    mount({}).calls().includes('trackContainerResize(true)'),
    mount({}).calls().join(' '),
);

const asyncChecks = requestChecks().then(pickChecks);

/* ======================================================================== */

disposeAll();

const timersBefore = time.pending();
const listenersBefore = Object.values(dom.document.listeners).reduce((total, list) => total + list.length, 0);

const disposable = mount({});

disposable.destroy();

check(
    'destroy() releases every timer the control took',
    time.pending() === timersBefore,
    `${timersBefore} → ${time.pending()}`,
);

check(
    'and every document-level listener',
    Object.values(dom.document.listeners).reduce((total, list) => total + list.length, 0) === listenersBefore,
    `${listenersBefore} → ${Object.values(dom.document.listeners).reduce((total, list) => total + list.length, 0)}`,
);

/*
 * The other half, and the leak this shape is famous for. `updateView` runs on
 * every change to any bound value, so a `setInterval` reached from the render
 * path adds a timer per render rather than replacing one.
 */
const rerendered = mount({});
const afterFirst = time.pending();

rerendered.update({});
rerendered.update({});
rerendered.update({});

check(
    'and re-rendering does not add another one',
    time.pending() === afterFirst,
    `${afterFirst} → ${time.pending()}`,
);

disposeAll();

asyncChecks.then(report, (error) => {
    check('the asynchronous assertions ran at all', false, String((error && error.stack) || error));
    report();
});

function report() {
    const failed = results.filter((result) => !result.ok);

    for (const result of results) {
        const detail = result.detail ? `  — ${result.detail}` : '';

        console.log(`  ${result.ok ? 'ok  ' : 'FAIL'}  ${result.label}${detail}`);
    }

    console.log(
        failed.length > 0
            ? `\n  ${failed.length} of ${results.length} failed\n`
            : `\n  ${results.length} passed — the control's own decisions only; see SPEC.md for what a real form still has to confirm\n`,
    );

    process.exit(failed.length > 0 ? 1 : 0);
}
