---
title: API reference
description: Properties and outputs, generated from the control manifest.
order: 5
---

# API reference

## Bound properties

The street column is the one the control sits on and is required. The other
six are optional; each is written only when a pick or a clear gives the
control something to write there.

::props-table{kind=bound}

## Input properties

::props-table{kind=input}

## Outputs

::props-table{kind=output}

## Notes

- **subscriptionKey** is sent in the `subscription-key` request header on
  every call to Azure Maps, never in the URL. Blank means no request is ever
  made and a hint is shown under the field.
- **endpoint** selects the host: `public` is `atlas.microsoft.com`; `us`,
  `eu`, `kr` and `br` are the geographic endpoints for data residency
  (`us.atlas.microsoft.com` and so on); `gov` is `atlas.azure.us`. Every one
  is declared in the manifest's external-service list.
- **countryRegion** is an ISO 3166-1 alpha-2 code. Anything that is not two
  letters is ignored rather than sent.
- **biasLatitude** and **biasLongitude** are used only when both are set;
  otherwise the request carries a world-sized bounding box, which Azure Maps
  requires when no bias point is given.
- **minCharacters** unset means 3; **maxSuggestions** unset means 5 and is
  clamped to Azure's range of 1–20.
- **resolveCoordinates** off (the default) means a pick never calls the
  geocoding API and never touches the latitude and longitude columns. On, a
  pick clears both, calls `geocode` once with the picked address, and writes
  the answer — or leaves them cleared and says so if Azure Maps returns no
  position.
- **formattedAddress** is the picked address as Azure Maps formats it, and is
  emptied by typing or clearing. It is an output, not a column.
