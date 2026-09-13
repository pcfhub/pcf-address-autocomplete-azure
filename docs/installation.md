---
title: Installation
description: Import the solution, create an Azure Maps account, and lock its key to your organisation.
order: 2
---

# Installation

:::callout{type=warning}
**This is a premium component.** Its manifest declares that it calls an
external service — Azure Maps — from the browser, and the Power Platform
treats any app containing such a component as premium: its end users need a
Power Apps licence rather than an Office 365 one. That is decided by the
declaration being present, not by whether a key is set or a suggestion is ever
picked. Confirm it with whoever owns licensing before importing.
:::

## The solution

:::steps
1. Download the **managed** solution for your environment.
2. In the Power Platform admin centre, import the solution.
3. Publish all customizations.
4. Enable **Code components for canvas apps** if this control is used there.
:::

Import the managed solution into production. The unmanaged one is for a
development environment where you intend to change the control itself — it
cannot be cleanly uninstalled.

## An Azure Maps account

The control needs an Azure Maps account's **subscription key**, entered once
in the control's properties on the form.

:::steps
1. In the Azure portal, create an **Azure Maps Account** (Gen2). One account
   per organisation is enough; a dedicated account for this control keeps its
   usage and its key separate from anything else you run on Azure Maps.
2. Under **Authentication**, copy the **primary key**.
3. Under **CORS**, add your organisation's URL —
   `https://yourorg.crm.dynamics.com` — as an allowed origin, and nothing
   else. A new account allows every origin by default; this is the step that
   stops the key working from any other site.
4. On the form, paste the key into the control's **Azure Maps subscription
   key** property.
:::

:::callout{type=warning}
**The key is visible to anyone who can open the form designer**, and it is
sent from every reader's browser with every request. Azure calls the shared
key a master key for the account. The CORS restriction above and a dedicated
account are what keep a leaked key from being useful elsewhere; the control
sends it in a request header rather than the URL so it does not land in
browser history or proxy logs. Rotate it from the portal's Authentication
page if it is ever exposed — the secondary key exists so you can rotate
without downtime.
:::

## What it costs to run

Every settled keystroke after the third character is one Azure Maps
autocomplete transaction; a pick with **Fill latitude and longitude** on is
one geocoding transaction more. Azure Maps has a free monthly allowance and
bills per thousand transactions beyond it — see Azure Maps pricing in the
portal. Refused requests (a wrong key, a blocked origin, rate limiting) are not
billed.

## Requirements

- Dataverse with the modern form designer (Power Apps component framework
  enabled, which it is by default).
- Model-driven apps on the web or the Power Apps mobile app, or a canvas app
  with code components enabled.
- The columns you bind must be text columns for the address parts and
  floating-point (or decimal) columns for latitude and longitude — the
  standard `address1_*` columns on Account and Contact are exactly that.
