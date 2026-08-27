# OptiFleet AI – setup

1. Extract the project.
2. Open the folder containing `package.json` in VS Code/PowerShell.
3. Copy `.env.example` to `.env.local`.
4. Put your Supabase project URL and anon key in `.env.local`.
5. In Supabase SQL Editor, run both migrations in `supabase/migrations/` in filename order.
6. Run `npm install`.
7. Run `npm run dev`.
8. If the Supabase environment is missing, the application will render a clear error instead of a white page.

Live lifecycle:
- Optimizer assignment -> shipment ACTIVE + lorry ASSIGNED + driver unavailable.
- Active shipment remains active across refresh/re-optimization.
- Mark as Delivered -> shipment DELIVERED + lorry AVAILABLE + driver available.
- Delivered shipments are terminal.

Scenario Sandbox:
- Run & Apply scenario persists changes for real shipment/lorry IDs.
- Fleet Management and Shipment Management reload from the same Supabase state.
