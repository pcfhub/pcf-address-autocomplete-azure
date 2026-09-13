---
title: Examples
description: Common configurations.
order: 6
---

# Examples

## An Account's primary address

The ordinary case. On the Account form, place the control on **Address 1:
Street 1** and bind:

| Property | Column |
| --- | --- |
| City | Address 1: City |
| State / province | Address 1: State/Province |
| Postal code | Address 1: ZIP/Postal Code |
| Country / region | Address 1: Country/Region |
| Latitude | Address 1: Latitude |
| Longitude | Address 1: Longitude |

Turn on **Fill latitude and longitude**, set **Restrict to country** to your
country's code if all your accounts are in one, and set **Region format** to
match your existing data (`WA` is the default; `Washington` is the long form).

## Two addresses on one form

Put a second instance on **Address 2: Street 1** with the Address 2 columns.
Each instance is independent; they share nothing but the key, which you enter
on both.

## Street only

Place the control on the street column and bind nothing else. It is then a
street type-ahead: a pick writes the street line, the other parts of the
suggestion are shown under the field and written nowhere. Useful on a table
whose only address column is a single text field.

## A regional office

Set **Bias latitude** and **Bias longitude** to the office's position.
Suggestions near it rank first; ones far away are still offered. Combine with
**Restrict to country** for a country-wide business with one main region.

## Data residency

If your Azure Maps account is scoped to Europe, set **Azure Maps endpoint** to
`eu`. Requests then go to `eu.atlas.microsoft.com` and stay in the European
geography. A Government cloud tenant uses `gov`.
