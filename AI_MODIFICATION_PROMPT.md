# OptiFleet AI — Full Production-Fix Prompt

Act as a senior full-stack engineer, React/TypeScript architect, Supabase/PostgreSQL engineer, optimization engineer, UX engineer and QA engineer.

I am giving you the complete OptiFleet AI project. The current application has a critical issue where the Shipment Management page can render as a completely white/blank page. I also need every dashboard module to be genuinely functional using the existing React + TypeScript + Supabase architecture, not mock buttons, fake assignments, placeholder data, or simulated success states.

## PRIMARY REQUIREMENT

First inspect the entire repository before changing anything. Identify and fix the root cause of the Shipment Management white-page crash. Do not hide the error with a fallback blank component. The page must render correctly even when Supabase has no data, when optional tables are not yet migrated, or when a record contains older schema values.

Run and pass:
- npm run typecheck
- npm run lint (warnings are acceptable only when they are existing non-runtime Fast Refresh warnings)
- npm run build

Do not declare the task complete until the application builds successfully.

## 1. SHIPMENT LIFECYCLE — REAL PERSISTENT STATE

Use this exact lifecycle:
- pending
- active
- delivered
- unassigned

Add/use a persistent `shipment_status` field. Keep existing legacy database fields intact for compatibility, but make `shipment_status` the source of truth in the UI and business logic.

Rules:
- New shipment => pending.
- Optimizer assigns shipment to a lorry + driver => active immediately.
- Active remains active until the user explicitly clicks `Mark as Delivered`.
- Delivered is terminal and cannot silently return to pending/active/unassigned.
- If optimizer cannot assign a shipment => unassigned.
- Re-running optimization must NOT reset active shipments or delivered shipments.
- Only pending/unassigned shipments should enter a new assignment run unless there is an explicit future re-dispatch workflow.
- Persist the lifecycle in Supabase.
- Add a PostgreSQL trigger/constraint where appropriate so an active shipment cannot silently revert and a delivered shipment cannot be reopened.

## 2. REAL OPTIMIZER ASSIGNMENT

Keep the existing optimizer, route calculation, fuel calculation and cost calculation logic intact.

Assignment must ONLY be made by `optimize()`.

When a plan is persisted:
- save the optimizer run
- save each assignment
- save the lorry ID
- save the driver name snapshot
- update the shipment with assigned_lorry_id
- update the shipment with assigned_driver_name
- set shipment_status = active

When a shipment is unassigned:
- set shipment_status = unassigned
- clear assigned_lorry_id and assigned_driver_name
- persist rejection reasons

There must be NO manual “assign shipment to lorry” dropdown or control anywhere in Shipment Management or Fleet Management.

The UI may show compatibility diagnostics, but diagnostics must never let the user choose the lorry.

## 3. DEADLINE-DRIVEN EFFECTIVE PRIORITY

Replace the old unrelated priority/deadline sorting with one effective urgency score.

The score must combine:
- stated priority: LOW / MEDIUM / HIGH / URGENT
- remaining time until delivery_deadline

Deadline pressure must be strong enough that:
- MEDIUM due in 2 hours ranks above HIGH due in 3 days.

Use one numeric sortable score. Expose a reusable helper such as:
`effectiveUrgencyScore(shipment, now)`.

Use that score when ordering shipment/group work for optimization. Keep cost selection logic intact: among feasible lorries, the optimizer can still select the lowest-cost feasible option.

Also show the effective urgency/urgency context in the UI where useful so users understand why a shipment is being prioritized.

## 4. SHIPMENT MANAGEMENT — REAL UX

Shipment Management must render reliably and include:
- search
- add shipment
- edit shipment
- delete shipment
- lifecycle status
- pickup location
- destination
- deadline
- stated priority
- effective urgency
- assigned lorry
- assigned driver
- Mark as Delivered for active shipments

Do not expose raw database errors as an unhandled React crash. Display recoverable errors in the app UI.

## 5. SHARED LOCATION DATA

Create a reusable Supabase `locations` table containing:
- id
- name
- latitude
- longitude
- created_at
- updated_at

Seed it with the existing known locations from the project.

Shipment Management:
- Replace free-text pickup_location_name with a searchable location combobox.
- Replace free-text destination_name with a searchable location combobox.
- Selecting a location automatically fills latitude/longitude from the same record.
- Default flow is selecting an existing location.
- Add an “Add location” flow for a new location with name + latitude + longitude.
- Newly added locations must immediately become available to both Shipment Management and Scenario Sandbox.

Scenario Sandbox / What-If Simulator must consume the SAME location data source. Do not maintain a second hardcoded location list.

## 6. DRIVER DATA

Add/persist `driver_name` on lorries if it does not already exist.

Fleet Management should show/edit:
- driver name
- driver availability
- lorry status

Optimizer uses the available driver attached to the selected lorry.

Shipment Management must show the driver assigned by the optimizer.

## 7. DASHBOARD MODULES MUST BE REAL

Audit every module:
- Dashboard
- Fleet Management
- Shipment Management
- Optimization Result
- Scenario Sandbox / What-If Simulator
- AI Copilot
- Fleet Map
- Analytics
- Audit Log
- Settings

For every module:
- buttons must perform the intended action
- data must come from the actual store/Supabase state
- no fake “success” behavior
- no dead controls
- no hardcoded business results when live database data is available
- loading and error states must be handled
- empty states must be intentional and usable
- navigation must work
- refreshing the page must preserve database-backed state

Do not rewrite working optimizer/cost logic unnecessarily.

## 8. OPTIMIZATION RESULT

Show:
- selected lorry
- assigned driver
- shipment IDs
- route
- ETA
- deadline status
- capacity usage
- fuel
- distance
- cost
- comparison with feasible alternatives

Do not provide manual reassignment controls.

Add a clear `Mark as Delivered` action for active shipments if appropriate in the result view as well as Shipment Management.

## 9. DATABASE MIGRATION

Do not destroy or reset existing data.

Create a forward-only Supabase migration that safely adds:
- lorries.driver_name
- shipments.shipment_status
- shipments.assigned_lorry_id
- shipments.assigned_driver_name
- locations table
- assignments.driver_name
- assignment timestamps/indexes if useful
- lifecycle trigger/constraint

Backfill shipment_status from the old status field:
- assigned -> active
- delivered -> delivered
- unassigned -> unassigned
- otherwise -> pending

Backfill known driver names for existing seeded lorries where appropriate.

Keep RLS consistent with the current single-tenant application model.

## 10. BACKWARD COMPATIBILITY

The current project may contain older rows using the old `status = assigned` value. Normalize them safely when reading.

The app must not crash if optional new location/assignment data is temporarily unavailable during migration. It should show a safe fallback/empty state while still requiring the migration for full persistence.

## 11. ERROR PREVENTION

Specifically inspect for causes of a white page:
- missing imports
- invalid JSX
- undefined functions
- type mismatches
- stale status unions
- missing database columns
- missing optional data handling
- unhandled promises
- components assuming arrays/objects are always present

Fix the actual root cause.

## 12. UX QUALITY

Use the existing visual design language. Keep the premium logistics dashboard style.

Do not introduce a completely different design system.

Make tables horizontally scrollable where required. Use clear status badges and disabled/loading states.

## 13. FINAL VERIFICATION

After modifications:
1. npm install if dependencies are incomplete.
2. npm run typecheck
3. npm run lint
4. npm run build
5. Start the Vite app.
6. Verify every sidebar module opens without a white page.
7. Verify Shipment Management specifically:
   - loads existing shipments
   - adds a shipment
   - searches
   - edits
   - location selection works
   - adding a location works
   - optimizer assigns automatically
   - assigned lorry/driver appear in Shipment Management
   - status becomes active
   - status stays active after navigation/refresh
   - Mark as Delivered changes it to delivered
   - delivered does not revert after re-optimization
8. Verify Scenario Sandbox uses the shared location list.
9. Verify no manual lorry assignment UI exists.
10. Verify database writes succeed and errors are visible to the user.

## IMPORTANT

Do not replace real functionality with mock/demo logic.
Do not remove existing working optimizer/cost calculations.
Do not add a manual assignment shortcut.
Do not silently swallow Supabase errors.
Do not leave the Shipment page blank under any normal data state.

Deliver the complete corrected project, the Supabase migration, and a short setup/run instruction.
