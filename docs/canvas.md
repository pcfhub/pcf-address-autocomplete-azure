---
title: Canvas apps
description: Using the control in a canvas app, and what the premium declaration means there.
order: 4
---

# Canvas apps

The control works in a canvas app with code components enabled. Add it from
**Insert → Get more components → Code**, then set its properties.

:::callout{type=warning}
A canvas app containing this component is a **premium** app — the control's
manifest declares an external service, and the platform licenses on that
declaration. See [Limitations](limitations.md).
:::

## Wiring it up

In a canvas app there are no columns to bind: each of the seven "bound"
properties is a property of the component that you set and read like any
other.

- Set **addressLine1** (and the others, if you have stored values) from your
  record, e.g. `ThisItem.'Address 1: Street 1'`.
- After a pick, read **addressLine1**, **city**, **stateOrProvince**,
  **postalCode**, **country**, **latitude** and **longitude** back from the
  component, and **formattedAddress** for the address as one line.
- Use `OnChange` to patch the record:

```powerfx
Patch(
    Accounts,
    ThisItem,
    {
        'Address 1: Street 1': AddressAutocomplete1.addressLine1,
        'Address 1: City': AddressAutocomplete1.city,
        'Address 1: State/Province': AddressAutocomplete1.stateOrProvince,
        'Address 1: ZIP/Postal Code': AddressAutocomplete1.postalCode,
        'Address 1: Country/Region': AddressAutocomplete1.country
    }
)
```

- Set **subscriptionKey** to the Azure Maps key. In a canvas app the
  property value is part of the app definition, which anyone who can edit the
  app can read — the same caveat as on a form, with the same answer: a
  dedicated Azure Maps account with CORS restricted to your organisation.

## Differences from a model-driven form

- There is no field-level security and no business-rule error to show, so
  those states never appear.
- There is no form label; the component's accessible name is its display
  name unless you set one.
- A cleared field is reported as `Blank()` on every property the control
  cleared, so an `If(IsBlank(...))` reads it correctly.
