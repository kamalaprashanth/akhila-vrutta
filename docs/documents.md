# Documents (and Vehicles)

Designed with the owner on 26 Nov 2026.

## Vehicles: a tab in Household (`app/modules/household/vehicles.ts`, `vehforms.ts`)
- `hhVehicles`: name, kind, registration, model, fuel, odometer; valid-till dates for insurance, PUC, RC, FASTag,
  permit; the service schedule (every N km or N months, whichever first; last service date and km).
- `hhFuel`: each fill (date, odometer, litres or kWh, amount, full tank). Mileage the full-tank way over the last few
  full fills. Each fill, service and renewal offers its cost to Money as an expense (category guessed by name).
- Renewals within 60 days and a service due within 30 days or 500 km show in Household's Due list. Phone reminders:
  insurance and permit 15 days before and on the day, PUC 7 days before and on the day, FASTag 7 days before, RC 60
  days before, service on its date. Names only.

## Documents (`app/modules/documents/`)
- `docs`: { owner: { c, id }, type, year (financial year, for yearly papers), validTo, num4 (last 4 only), note,
  na ("Not needed") }. Files are vault files owned by the document (`files.owner = { c: "docs", id }`).
- `docOwners`: people, insurance policies, other. Other owners: Money's properties, loans and accounts; Household's
  appliances (their Household files show too) and vehicles.
- Types per kind, with the key ones as a checklist: a property's full list of 13 (owner's choice: one full list,
  with "Not needed"), property tax by financial year (the last four shown), vehicle RC/insurance/PUC, Aadhaar and PAN.
  People also hold Education & work papers (degree, mark sheets, offer and relieving letters, Form 16, payslips).
- Needs attention: papers expiring (by type: passport 180 days ahead, licence and RC 60, others 30; a newer one of the
  same type hides the old), and each property's tax receipt for the current financial year.
- Reminders: before expiry and on the day (vehicle renewals are left to Household's), and on 10 and 25 April when a
  property's tax receipt for the year isn't added.
- A vehicle's insurance/PUC/RC/FASTag/permit paper with a later valid-till moves the vehicle's renewal date on.
- Search over type, owner, year, note, number's last 4 and file names.

Tests: `tests/unit/vehicles-docs.test.ts`, `tests/e2e/dcflow.mjs`, and the cloud step (stored as ciphertext).
Not tested by CI: real Drive, the phone camera, reminders arriving on a phone.
