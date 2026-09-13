---
title: Overview
description: What Address Autocomplete (Azure Maps) does, and when to reach for it.
order: 1
---

# Address Autocomplete (Azure Maps)

Type an address, pick a suggestion, and every address column fills in — through
Azure Maps.

::image{src=media/screenshot.png alt="A street field with three characters typed and two Azure Maps suggestions open under it" zoom}

Place it on the street column — **Address 1: Street 1** on an Account or a
Contact — and bind the city, state or province, postal code, country and, if
you want them, latitude and longitude. A reader types three characters, Azure
Maps suggests addresses, and picking one writes all of them at once. The
suggestion is the whole address parsed into its parts, so nothing is split by
guesswork on this side.

::image{src=media/screenshot-filled.png alt="The street field after a pick, with the city, region, postal code and country shown as one line under it" zoom}

## Why this one

- **It is Azure Maps, not Bing.** Bing Maps for Enterprise closed its free
  tier on 30 June 2025 and ends entirely on 30 June 2028, and every
  Bing-based address control depends on an API that is going away. Azure Maps
  is Microsoft's replacement, and this control uses its current Search API
  (2026-01-01) with the dedicated autocomplete endpoint rather than the
  superseded v1 type-ahead.
- **It writes columns, not an output.** Each part of the address is a bound
  column the maker picks in the form designer. A pick lands in the record and
  survives a reload with no form script copying values around.
- **It is Fluent.** The field follows the form's own theme through the
  platform's Fluent 9, including dark and high-contrast, and the dropdown is
  the platform's own combobox.
- **The key never travels in a URL.** Requests carry the Azure Maps
  subscription key in a header, not a query string, so it is not in browser
  history or proxy logs.

## What it works with

:::callout{type=info}
**Model-driven apps** on the web and on the Power Apps mobile app, and
**canvas apps** with code components enabled. The control calls Azure Maps
directly from the browser, which makes it a **premium** component: every user
of an app containing it needs a Power Apps licence. See
[Limitations](limitations.md) before installing.
:::

You need an Azure Maps account and its subscription key —
[Installation](installation.md) walks through both, and through restricting
the account to your organisation's URL.
