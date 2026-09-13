---
title: FAQ
description: Questions that come up.
order: 8
---

# FAQ

## Why Azure Maps and not Bing Maps or Google?

Bing Maps for Enterprise closed its free tier on 30 June 2025 and retires on
30 June 2028, so a Bing-based control is on borrowed time. Google Places works
but is a second vendor with its own billing and key. Azure Maps is Microsoft's
own successor to Bing Maps, bills through the Azure subscription you already
have, and has a dedicated autocomplete API. A sibling control for Google
Places could exist beside this one — the slug ends in `-azure` for that
reason.

## Nothing appears when I type

In order of likelihood:

1. **No key**, or a blank one — the control says so under the field.
2. **Fewer than three characters** — the dropdown says how many it needs.
3. **The account's CORS rule does not include this site** — the sentence
   under the field names it. Add `https://yourorg.crm.dynamics.com` to the
   account's allowed origins in the Azure portal.
4. **The key was refused** — a 401; the key is wrong, rotated, or the account
   has local authentication disabled.
5. **Restrict to country** is set to a country the address is not in.

## Does it work offline, or on the mobile app?

It needs a route to Azure Maps, so not offline. On the Power Apps mobile app
it works whenever the device has connectivity.

## Can I stop the key being visible to makers?

Not with this control. See [Limitations](limitations.md). The mitigations are
a dedicated Azure Maps account and its CORS rule.

## Why is the state written as "WA" rather than "Washington"?

**Region format** defaults to the short code. Set it to *Full name* to write
the long form; likewise **Country format** for `US` versus `United States`.

## Why did picking an address clear my latitude and longitude?

With **Fill latitude and longitude** on, a pick clears the previous
coordinates before asking Azure Maps for the new ones, because the old
coordinates belonged to the old address. If Azure Maps returns no position
for the new one, the columns stay empty and the control says so. With the
switch off, the two columns are never touched.

## Why does a form script see `formattedAddress` but no column for it?

It is an output, not a bound column: the address as one line, as Azure Maps
formats it. It is emptied the moment the street line is typed into or
cleared, because it would otherwise drift from the columns.
