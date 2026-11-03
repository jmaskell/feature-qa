# Design: property page

Issue: [7. Property page](issue.md)

## Journey

The letting agent signs in, opens the properties list, and selects one property. The property page shows the facts of the property. On a let property, the agent can message the tenant.

## States

| Screen | State | What the person sees | How they got here |
| --- | --- | --- | --- |
| Properties list | All properties | The heading "Properties", the "Add property" button, and three rows. Each row has an address, the rent (for example "£950 a month") and a status ("Let" or "Vacant"). | The agent signs in. The `lettings` seed has three properties. |
| Property page | Let | The heading "12 Harbour Row, Penzance", the rent "£950 a month", the status "Let", and a Tenant section with the tenant's name and phone and a "Message tenant" button. | The agent selects "12 Harbour Row, Penzance" (seed property p1). |
| Property page | Vacant | The heading "3 Mill Lane, Hebden Bridge", the rent "£720 a month", the status "Vacant", and a Tenant section that says "None". | The agent selects "3 Mill Lane, Hebden Bridge" (seed property p2). |
| Message dialog | Open | A dialog with the heading "Message tenant", the text "Messages are not set up in this test app." and a "Close" button. | On the let property page, the agent selects "Message tenant". |

## Copy

- The page title is "Property details". It never holds the tenant's name.
- An empty value shows as "None".

## Interaction test plan

- On the properties list, select "Add property". The add form opens. Select "Cancel". The form closes.
- On the let property page, select "Message tenant". The dialog opens. Press Escape. The dialog closes.
