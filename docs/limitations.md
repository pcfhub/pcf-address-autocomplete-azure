---
title: Limitations
description: What this control does not do, and the costs it carries.
order: 7
---

# Limitations

## It is a premium component, and that is a real cost

The manifest declares:

```xml
<external-service-usage enabled="true">
  <domain>atlas.microsoft.com</domain>
  <domain>us.atlas.microsoft.com</domain>
  <domain>eu.atlas.microsoft.com</domain>
  <domain>kr.atlas.microsoft.com</domain>
  <domain>br.atlas.microsoft.com</domain>
  <domain>atlas.azure.us</domain>
</external-service-usage>
```

A component that connects to an external service directly from the browser is
**premium**. Any app containing it requires its end users to hold Power Apps
licences rather than Office 365 ones. That follows from the declaration being
present, not from whether a key is set or a suggestion is ever picked. There
is no non-premium version of this control, because calling Azure Maps is the
control.

## The key is visible to makers

The Azure Maps subscription key is a control property. Anyone who can open
the form designer, or edit a canvas app, can read it. The control sends it in
a request header rather than the URL, so it does not land in browser history
or proxy logs, but every reader's browser holds it while the form is open.
[Installation](installation.md) has the two mitigations: a dedicated account,
and its CORS rule restricted to your organisation's URL. There is no way to
keep the key off the client with this control.

## Coordinates cost a second transaction

Azure Maps' autocomplete does not return a position, so with **Fill latitude
and longitude** on, each pick makes one geocoding call in addition to the
autocomplete calls that found it. With it off, the latitude and longitude
columns are never touched.

## What a suggestion does not carry

- **No second street line.** Azure Maps returns one address line; a bound
  "Street 2" column is not offered because there is nothing to write to it.
- **No county or neighbourhood.** Azure Maps returns them sometimes; the
  control does not bind columns for values that are usually absent.
- **A missing part clears its column.** A suggestion without a postal code
  writes an empty postal code, because the previous address's postal code
  would be the wrong one, not a kept one.

## Coverage and language

Suggestions are as good as Azure Maps' coverage of the country. Results come
back in the reader's browser language where Azure Maps supports it.

## Seven pickers in the properties pane

Each optional column is its own picker in the form designer. That is how the
platform exposes additional bound properties, and there is no way to collapse
them. A column left unbound is simply not written.

## Not yet confirmed on a live form

This release has been driven end to end against a stand-in for Azure Maps
and the platform. What a real environment still has to confirm is listed in
the repository's `SPEC.md`, and includes whether a bound column that is not
placed on the form itself persists on save, and the CORS preflight from a
real organisation URL.
