---
title: Model-driven apps
description: Put the control on the street column and bind the others.
order: 3
---

# Model-driven apps

:::steps
1. Open the form in the modern form designer.
2. Select the **street** column — **Address 1: Street 1** on Account or
   Contact, or your table's equivalent text column.
3. Under **Components → Add component**, choose **Address Autocomplete (Azure
   Maps)**.
4. In the component's properties, paste the **Azure Maps subscription key**.
5. For each of **City**, **State / province**, **Postal code**, **Country /
   region**, **Latitude** and **Longitude**, pick the column that should
   receive that part of the address. Each is optional; a part you leave
   unbound is simply not written.
6. If you bound Latitude and Longitude, turn on **Fill latitude and
   longitude**.
7. Enable the component for **Web**, **Phone** and **Tablet** as
   appropriate, save, and publish.
:::

## Seven columns from one control

The control attaches to the street column and asks for the six others as
column pickers in its properties pane — more pickers than most components
show, and each one is a column of the same table. A pick writes the street
line into the column the control sits on and the other parts into the columns
you bound. Typing into the field without picking writes only the street line,
so the column stays an ordinary text column that can also be typed into.

The other parts are shown as one line under the field after a pick, so a
reader sees the whole address land without opening the other fields. Those
fields can stay on the form beside the control, or be left off it: the
values are written to the record either way.

## Column types

| Part | Column type | Notes |
| --- | --- | --- |
| Street (the control's column) | Single line of text | Required |
| City, State / province, Postal code, Country / region | Single line of text | Optional |
| Latitude, Longitude | Floating point number, or Decimal | Optional; `address1_latitude` / `address1_longitude` are floating point |

A column of another type is not offered in the picker.

## Properties worth setting

- **Restrict to country** — an ISO code such as `US` or `GB` limits
  suggestions to that country. Leave it empty to suggest worldwide.
- **Bias latitude / Bias longitude** — a point suggestions are ranked near,
  such as your head office. Azure Maps ranks by it; it does not restrict.
- **Region format** and **Country format** — whether the state or province is
  written as `WA` or `Washington`, and the country as `United States` or
  `US`. Match whatever your existing data uses.
- **Azure Maps endpoint** — leave on Public unless your account is scoped to
  a geography (`eu` or `us` for data residency) or is in Azure Government.
- **Characters before searching** and **Suggestions** — the defaults are
  Azure's own recommendation (three) and its default (five).

## What a reader sees

- Under three characters: *Type at least 3 characters*.
- While Azure Maps answers: *Searching…*.
- Nothing matching: *No addresses match*.
- A refused request: one sentence under the field naming the cause — a
  refused key, an origin the account's CORS rule does not allow, rate
  limiting, or a service error.
- The **×** clears the street and every other bound column at once.

::image{src=media/screenshot-refused.png alt="The field with a red border and the sentence 'Azure Maps refused this site. Allow it in the account's CORS settings.' under it" zoom}
