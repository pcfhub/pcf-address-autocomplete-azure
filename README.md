# Address Autocomplete (Azure Maps)

Type an address, pick a suggestion, and every address column fills in — through Azure Maps.

[![Build](https://github.com/pcfhub/pcf-address-autocomplete-azure/actions/workflows/build.yml/badge.svg)](https://github.com/pcfhub/pcf-address-autocomplete-azure/actions/workflows/build.yml)
[![Release](https://github.com/pcfhub/pcf-address-autocomplete-azure/actions/workflows/release.yml/badge.svg)](https://github.com/pcfhub/pcf-address-autocomplete-azure/actions/workflows/release.yml)

Documentation lives on [PCFHub](https://pcfhub.dev/components/pcf-address-autocomplete-azure), built
from the `docs/` directory in this repository. Edit the Markdown here; the hub
recompiles it.

## What it does

A field control for the street column of an address — `address1_line1` on an
Account or a Contact — that suggests addresses from **Azure Maps** as the reader
types and, on a pick, writes the whole address into the record: the street, and
the city, state or province, postal code, country, latitude and longitude, each
bound to a column the maker chooses in the form designer. Typing without picking
writes only the street, so the column stays an ordinary text column.

It exists because the Bing Maps API every older address control depends on is
retiring — the free tier closed on 30 June 2025, the rest ends on 30 June 2028 —
and Azure Maps is Microsoft's replacement. This control uses Azure Maps Search
**2026-01-01** and its dedicated `geocode:autocomplete` endpoint rather than the
superseded v1 `typeahead=true` pattern. A future sibling for Google Places would
sit beside it, which is why the slug ends in `-azure`.

Three decisions worth knowing before questioning them:

- **Seven bound properties.** Each part of the address is a bound column
  rather than an output, so a pick lands in the record and survives a reload
  without a form script copying values around. The cost is seven column
  pickers in the properties pane; only the street is required. From inside a
  control an unmapped optional column reads exactly like a mapped-but-empty
  one, so `getOutputs()` emits a key only for a column the control has written
  or cleared — never a bare `null` for one it has never touched.
- **The key is a maker input, sent in a header.** Azure Maps' shared key is
  entered once on the control's properties, is readable by anyone who can open
  the form designer, and travels in the `subscription-key` header — never in
  the URL. The docs tell makers to give the control its own Azure Maps account
  and restrict that account's CORS allowed-origins to the organisation URL,
  which is Azure's own guidance for a key a browser holds.
- **Coordinates are a switch, not a guess.** Autocomplete returns no position,
  so latitude and longitude cost a second `geocode` call per pick. Whether the
  maker bound those columns is not visible to the control, so **Fill latitude
  and longitude** is an explicit input, off by default; on, a pick clears the
  old coordinates with the old address and fills the new ones when Azure Maps
  answers.

It is a **premium** component: the manifest declares
`external-service-usage` for `atlas.microsoft.com` and the geographic and
Government endpoints, and every user of an app containing it needs a Power
Apps licence. `docs/limitations.md` says so first.

## Properties

| Property | Type | Usage | Default | What it controls |
| --- | --- | --- | --- | --- |
| `addressLine1` | SingleLine.Text | bound, **required** | — | The street column the control sits on |
| `city`, `stateOrProvince`, `postalCode`, `country` | SingleLine.Text | bound | — | The columns a pick writes each part to |
| `latitude`, `longitude` | FP or Decimal | bound | — | Written only with `resolveCoordinates` on |
| `subscriptionKey` | SingleLine.Text | input, **required** | — | The Azure Maps shared key; blank makes no request |
| `endpoint` | Enum | input | `public` | `public`, `us`, `eu`, `kr`, `br`, `gov` — one host per declared domain |
| `countryRegion` | SingleLine.Text | input | — | ISO 3166-1 alpha-2; restricts suggestions to one country |
| `biasLatitude`, `biasLongitude` | FP | input | — | A point to rank near; both or neither |
| `regionFormat` | Enum | input | `short` | `WA` or `Washington` |
| `countryFormat` | Enum | input | `name` | `United States` or `US` |
| `resolveCoordinates` | TwoOptions | input | off | One `geocode` call per pick for latitude and longitude |
| `minCharacters` | Whole.None | input | 3 (in code) | Characters before the first request |
| `maxSuggestions` | Whole.None | input | 5 (in code) | 1–20 |
| `placeholder` | SingleLine.Text | input | — | Hint text while the field is empty |
| `formattedAddress` | SingleLine.Text | output | — | The picked address as one line |

The control ships English only and uses the platform's React 16.14 and Fluent
UI 9.46. It declares no `<uses-feature>` — the Azure Maps calls are a browser
`fetch`, covered by the external-service declaration — so the maker is asked
for no permission at install beyond the premium consequence.

## On the hub

`demo.fidelity` is **limited**, and the limit is the feature. Suggesting means
calling Azure Maps with a key the demo does not have, so the hub shows the
control with the key left empty: it explains itself under the field, accepts
typing into the street column, and makes no request. The screenshots carry the
list, a pick and a refusal, captured from `dev/harness.html` against the rig's
stand-in for Azure Maps. Everything that never leaves the browser is real in the
demo — typing, Clear, the line under the field, and the disabled, hidden,
no-access and business-rule-error states. Two presets: the unconfigured
control, and an address already on the record.

## Install

Download the managed solution from the
[latest release](https://github.com/pcfhub/pcf-address-autocomplete-azure/releases/latest), or from
the component's page on the hub, and import it into your environment.

## Develop

```bash
npm install
npm start          # the PCF test harness
npm run build
npm run lint
npm run check      # what CI runs first: placeholders, pcfhub.json, control shape
npm run smoke      # assertions against the built bundle — see dev/
npm run harness    # serves dev/harness.html and opens it
```

`npm start` renders the control; `dev/` is for the states it cannot reach. Build
first, then `npm run smoke` for the assertions, or `npm run harness` for the
switches — field-level security, a failed business rule, a host that publishes
no theme or no column metadata, and for a dataset control, more than one page.
Both read the bundle `npm run build` wrote, and both are described in the header
of `dev/smoke.js`.

`npm run harness` serves the repository over `http://` rather than leaving you to
open the file: over `file://` a dataset fixture cannot be fetched and a module
script is refused, and both arrive as an empty control with a CORS error. It
takes `--port` and `--no-open`, and needs no dependency — `dev/serve.js` is
`node:http`. A React (virtual) control gets one too: `dev/fluent-stub.js` stands
in for the Fluent the platform would supply, and its header says exactly where
the stand-in is less capable than the real thing.

Run `npm run refreshTypes` after every manifest edit — until you do,
`context.parameters` is typed from the old manifest and `tsc` will accept code that
cannot work.

To pack the solution locally you need msbuild — either Visual Studio or the
Visual Studio Build Tools:

```bash
cd Solution
msbuild /t:build /restore /p:configuration=Release
```

Both zips land in `Solution/bin/Release`. This is the only local step that compiles
in **production** mode, so a green `npm run build` is not evidence the shipping
bundle compiles — and the pack is incremental, so delete `obj/`, `out/`,
`Solution/obj/` and `Solution/bin/` first if you intend to quote a bundle size from
it.

## Release

1. Bump the version in **three** places, in one commit — they are checked
   against each other in CI:
   - `AddressAutocompleteAzure/ControlManifest.Input.xml` → `<control version="…">`
   - `Solution/src/Other/Solution.xml` → `<Version>`
   - `package.json` → `"version"`
2. Write the release notes — what changed for the user, what was fixed, what
   they must do — in a Markdown file.
3. Tag with them: `git tag -a v1.2.3 -F notes.md && git push origin v1.2.3`

**The tag message is the release body, and the release body is the changelog
on the hub.** A lightweight tag gets GitHub's generated notes instead, which
for a repository without pull requests is a single compare link — and the
workflow warns when that is about to happen.

The release workflow builds, packs both solution types, and attaches them to a
GitHub Release. PCFHub picks the release up from its webhook within seconds, or
from the hourly sweep otherwise. A sync imports a draft; a person publishes it.

## Repository layout

| Path | What it is |
| --- | --- |
| `AddressAutocompleteAzure/` | The control: manifest, entry point, CSS, localised strings |
| `Solution/` | The Dataverse solution that packages it |
| `dev/` | A stand-in host: `npm run smoke` asserts, `harness.html` shows |
| `SPEC.md` | What building this corrected, and what is verified versus read |
| `docs/` | The pages PCFHub publishes — see the comments in each file |
| `media/` | Images and video referenced from the docs |
| `pcfhub.json` | The hub's manifest: identity, links, docs path, demo |
| `scripts/` | Template setup and the CI guard that keeps it adopted |

## Licence

[MIT](LICENSE)
