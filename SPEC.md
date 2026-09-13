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

**Nothing in this repository has been on a real form or against the real
Azure Maps service.** Every shape below is from Microsoft Learn (read
2026-09-13) or from the rig, and the rig is written from the same reading.
The control is built to work either way where it can, and the first release
carries this list rather than a claim.

Load-bearing, in the order a probe should ask them:

1. **Do the six optional bound columns persist on save when only the street
   column is on the form?** The design assumes a bound property writes to
   its column whether or not another control on the form shows it. If it
   does not, `docs/model-driven.md` has to say the six must be on the form.
2. **What does an unmapped optional bound property look like in
   `context.parameters`** — present with `raw: null`? `attributes`
   undefined? — and **does emitting `null` for it throw, no-op, or write?**
   This is what `getOutputs`'s omission rule protects against; if the
   platform tolerates `null` on an unmapped picker, the rule can relax.
3. **Does `null` on a mapped, previously-empty column clear or no-op?** The
   control emits `null` only for a column it has written; a pick that lands
   a `null` (no region) on an empty column is the case.
4. **Does the browser's CORS preflight from `https://<org>.crm.dynamics.com`
   pass** with the account's default CORS (all origins) and with the key in a
   header rather than the URL? The header makes the request non-simple, so
   the preflight is the first thing the service sees.
5. **Is `geometry` really `null` on autocomplete**, and does `geocode` return
   `features[0].geometry.coordinates` as `[lon, lat]` for a picked
   `formattedAddress`? The reference sample says both; a live answer would
   let the coordinates come from the first call and save the second.
6. **Does the form designer offer `address1_latitude` on the coordinate type
   group** (FP + Decimal)? `pcf-geo-stamp` measured that Decimal alone did
   not; the group is copied from it.
7. **Does the platform echo the value back through `updateView` after every
   `notifyOutputChanged`** with the same shape the harness models? The
   component's echo guard exists because the harness does, and the harness
   was written to what the class already assumed.
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
