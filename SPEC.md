# Address Autocomplete (Azure Maps)

## What it does

A React-virtual field control on the street column of an address. As the
reader types, it asks Azure Maps Search 2026-01-01's `geocode:autocomplete`
for suggestions; a pick writes the street into the column the control sits on
and the city, state or province, postal code and country into four optional
bound columns — and, with a switch on, the latitude and longitude into two
more after one `geocode` call. Typing without picking writes the street only.
The key is a maker input sent in a request header; the control is premium
because it calls Azure Maps from the browser.

Picked from a demand survey on 13 September 2026 rather than from the
template audit: Bing Maps for Enterprise has closed its free tier and every
Bing-based address control on pcf.gallery is orphaned, and PCFHub had
nothing under "address" or "azure maps".

## Not verified

The shapes below were from Microsoft Learn (read 2026-09-13) and from a rig
written to the same reading, until **the 0.0.1 probe build went on a real
Accounts form with a real Azure Maps key on 2026-09-13** and answered most of
them. Each item carries what came back; what is still open says so.

Load-bearing, in the order a probe should ask them:

1. **Do the six optional bound columns persist on save when only the street
   column is on the form?** The design assumes a bound property writes to
   its column whether or not another control on the form shows it. *Open.*
   The probe form had all six bound and the pick wrote all six — the
   street, city, region, postal code and country in one pass and the two
   coordinates on the next — but whether those columns were also placed on
   the form was not recorded.
2. **What does an unmapped optional bound property look like in
   `context.parameters`** — present with `raw: null`? `attributes`
   undefined? — and **does emitting `null` for it throw, no-op, or write?**
   *Half measured.* Every bound property on the probe form arrived as a full
   property object with fifteen keys — `type`, `raw`, `formatted`,
   `attributes` (`LogicalName`, `DisplayName`), `error`, `errorMessage`,
   `errorCode`, `notifications`, `security`, `isPropertyLoading`,
   `predicted`, `predictionCitation`, `citationData`, `isMasked`,
   `isControlLoading` — with `latitude` and `longitude` at `raw: null`,
   `type: 'FP'`. All seven were *mapped*; an unmapped one has not been looked
   at, so the omission rule in `getOutputs` stays.
3. **Does `null` on a mapped, previously-empty column clear or no-op?** The
   control emits `null` only for a column it has written; a pick that lands
   a `null` (no region) on an empty column is the case. *Open.*
4. **Does the browser's CORS preflight from `https://<org>.crm.dynamics.com`
   pass** with the account's default CORS (all origins) and with the key in a
   header rather than the URL? *Measured: yes.* Every request was a 204
   preflight followed by a 200 `fetch` of 0.5–0.7 kB, in 84–270 ms.
   Superseded requests show as `(canceled)` — the `AbortController`
   working.
5. **Is `geometry` really `null` on autocomplete**, and does `geocode` return
   `features[0].geometry.coordinates` as `[lon, lat]` for a picked
   `formattedAddress`? *Measured: yes on both.* `geometry: null` on every
   one of five features; the geocode call on the pick wrote
   `latitude=20.75712, longitude=-103.44046` one pass after the address
   columns. The second call is needed, and it works.
6. **Does the form designer offer `address1_latitude` on the coordinate type
   group** (FP + Decimal)? *Measured: yes* — both were bound and arrived as
   `type: 'FP'`.
7. **Does the platform echo the value back through `updateView` after every
   `notifyOutputChanged`?** *Measured: yes, and out of order.* Every
   keystroke produced a pass carrying the value just written, and the log
   shows `"pase laur"` (pass 58), `"pase lau"` (59), `"pase laur"` (60) —
   a late echo of an earlier keystroke after a later one. See *What building
   it found*.
8. **`Accept-Language: navigator.language`** — does the service honour it,
   and does a model-driven form's browser language match the user's Dataverse
   language often enough for this to be the right signal?
9. **The geographic endpoints and Azure Government** — never called.
10. **Canvas** — the premium consequence, the seven properties appearing as
    component properties, `Blank()` on a cleared one.
11. **Rate limiting** — a 429 was never produced; the control reads it from
    the status and shows a sentence.

## Measured from the documentation, not the service

The Azure Maps facts the design rests on, with the pages they came from:

- Search **2026-01-01** has a dedicated `GET /geocode:autocomplete` (GA;
  *Introducing the Azure Maps Geocode Autocomplete API*, and *Migrate Azure
  Maps Search 1.0 APIs*, which names v1 `typeahead=true` as superseded).
  Required: `query`, and `coordinates` *or* `bbox`. Optional: `countryRegion`
  (ISO-2), `top` (1–20, default 5), `resultTypeGroups`, `view`. Header
  `Accept-Language`. Best practice: three characters before the first call.
- The response is a GeoJSON `FeatureCollection`; each feature's
  `properties.address` is documented *sparse* — `addressLine`,
  `streetNumber`, `streetName`, `locality`, `adminDistricts[{name,
  shortName}]` coarsest first, `postalCode`, `countryRegion{ISO, name}`,
  `formattedAddress`, sometimes `neighborhood`. The sample carries
  `"geometry": null` on every suggestion.
- `GET /geocode?query=…` returns the same address shape with a `geometry`
  `Point` whose `coordinates` are `[lon, lat]`. HTTP 200 with an empty
  `features` array is "no match", not an error (*Best practices for Azure
  Maps Search*).
- Authentication: `subscription-key` is accepted as a header (the REST
  reference lists it as `apiKey in: header`) as well as a query parameter.
  CORS: an account allows all origins by default and can be restricted to a
  list; preflight OPTIONS is answered and not billed; 401, 403, 408, 429 and
  5xx are not billed (*Authentication with Azure Maps*).
- Hosts: `atlas.microsoft.com`; `us.`/`eu.`/`kr.`/`br.atlas.microsoft.com`
  for geographic scope; `atlas.azure.us` for Government.

## What the rig proves, and what it does not

`npm run smoke`: 55 assertions against the built bundle, reading the props
the control hands down and calling the callbacks. Through `props().suggest`
and `props().onPick` every request the control makes goes to `dev/host.js`'s
`fetch` stand-in, which records the URL, the header *names* and whether the
key header carried a value — never the value — and answers from
`dev/fixture.js` in the reference's GeoJSON shape with `geometry: null` on
autocomplete. Two assertions were broken on purpose and failed by name: the
key moved into the URL, and the coordinates read `[lat, lon]`.

What the suite cannot reach: the component's own effects. `updateView` is
rendered statically, so the 300 ms debounce, the retired-handler guard, the
`AbortController` on a superseded keystroke and the echo guard in the
component are exercised only in `dev/harness.html` against the real React
and photographed. The rig's hand-written DOM is not somewhere `react-dom`
mounts.

`dev/fluent-stub.js` gained `Combobox`, `Option` and `Spinner`. The stub's
listbox is inline under the input, not portalled, walks no options by
keyboard and sets no `aria-activedescendant`; it honours a controlled
`value`, `open`, `onOptionSelect` and non-option children. **It also anchors
the listbox to the Combobox rather than to the field**, so on the harness the
dropdown is one icon narrower than the field — the real Fluent takes
`positioning.target` and matches the field. `npm start` is the authority for
that.

## What building it found

- **Echoes arrive out of order, and a last-value guard loses keystrokes.**
  Reported from the form as "if I type fast the field cleans the last
  characters; if I type slowly it works", and visible in the probe log as
  passes 58–60 above. The class compared the incoming value with the *last*
  write only, so a stale echo read as a form-driven change and was adopted
  over the newer text. The class now remembers its last 32 writes per
  column; an incoming value among them is an echo whatever its order, and a
  value it never wrote is the form's and resets the memory. The suite
  reproduces the measured sequence, and the assertion fails without the fix.
- **`security` is an object on a column with no profile** — `{ secured:
  false, editable: true, readable: true }` on every one of the seven, where
  the template's rig models `undefined`. Both shapes are hosts now: the rig
  has `security: 'unsecured'` and the suite asserts it reads as writable.
- **Non-US `adminDistricts` carry `name` only.** A Mexican address arrived
  as `[{ name: 'México' }, { name: 'Zumpango' }]` with no `shortName`; the
  parser's fall-through wrote the name under the short format, which is
  right. And `formattedAddress` orders the number after the street (`Calle
  Paseo Laurel 37, …`) while `addressLine` is `37 Calle Paseo Laurel`, so the
  option's second line shows the whole formatted address for such countries
  rather than a remainder.
- **The platform's echo closes the dropdown, and the class's echo guard is
  not enough.** The first harness walk showed suggestions but never the
  "type at least 3 characters" or "Searching…" notices. Every keystroke's
  `notifyOutputChanged` makes the host run `updateView` with the value just
  written, `props.value` changes, and a resync effect keyed on it treated
  the echo as a form-driven change — closing the list and resetting the
  typed flag after every letter. The component now remembers the last value
  it handed up and ignores a `props.value` equal to it; the class keeps its
  own guard for the other direction. `pcf-lookup-search` never met this
  because its query is not the bound value.
- **A pick that Azure Maps cannot place kept the previous pick's
  coordinates.** Found by driving the harness, not by an assertion: a
  Singapore latitude under an Ohio street. With the switch on, a pick now
  clears both coordinate columns before the geocode call and fills them only
  on an answer; the suite has the case.
- **Whether a bound column is mapped is not visible, so coordinates became
  a switch.** The plan said "if latitude or longitude is bound"; nothing in
  `context.parameters` says so. `resolveCoordinates` is an explicit
  `TwoOptions`, off by default, which is the right way round for a second
  transaction the maker pays for.
- **A stale refusal outlives its cause.** Blanking the key left the last 403
  sentence under the "no key" hint. A key taken away now takes the failure
  with it.
- **A blank line `\r\n` in a Windows checkout defeats a `\n` regex.** The
  README's placeholders survived two replacement passes because the scaffold
  was written with CRLF; the third normalised first. Not a control finding,
  but the third time a script in this workspace has read a file it did not
  write and matched nothing.
