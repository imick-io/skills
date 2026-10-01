# Team and areas

Who owns which part of this repo. Skills read this to label issues with an area and to assign owners.

## Areas

An **area** is a part of the product with one owner. Its label is `area:<app>` or, when an app has several owners, `area:<app>:<part>`. Every epic has exactly one area; everything under the epic inherits it.

| Area | Label | Code | Owner |
| --- | --- | --- | --- |
| Dashboard | `area:app:dashboard` | `apps/app/src/dashboard/` | Engineering |
| Marketing website | `area:website` | `apps/website/` | Marketing |

**Code** is where the area lives (a folder, or "not built yet"), so an agent can tell an issue's area from the files it touches.

## Teams

Each member: GitHub handle, then what they do. The description settles what the table can't: the default person for a team, and what they don't take.

### Engineering

- **@handle**: application dashboard, billing, API. Default for engineering work.

### Marketing

- **@handle**: marketing website, landing pages, SEO.

## Assignment

The assignee means *claimed*. Initiatives and epics are assigned to the area owner's default person; `ready-for-human` work to whoever will do it; map tickets and `ready-for-agent` tickets stay unassigned until claimed.
