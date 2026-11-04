# Initial route

See the [design record](../design/README.md) for conventions.

| Screen        | Route | What it shows                                                                                                                     |
| ------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------- |
| Initial route | `/`   | Existing loading screen while auth resolves, then the landing page for guests or a redirect to the dashboard for signed-in users. |

## Initial route

- **Route**: `/`.
- **Roles**: guests see the landing page; all signed-in roles go to `/dashboard`, where the existing access controls apply.
- **Layout**: while authentication resolves, the existing full-screen `PageLoading` shows the AbsoluteCRM logo and progress bar with an accessible loading status. Guests then see the existing landing page without layout changes.
- **States**: loading until auth resolves; guest landing page when no user is present, including an expired session; authenticated redirect to the dashboard without rendering the landing page. Auth changes while this route is mounted update the destination.
- **Interactions**: existing landing-page links remain available to guests. The authenticated redirect replaces the current history entry, so `/` does not add an extra Back-button stop.
- **Data**: existing `useAuth()` context; no tRPC reads or writes.
- **Origin**: built without a mock; existing screens are reused.
- **Code**: [index route](../../src/routes/index.tsx), [PageLoading](../../src/components/layout/PageLoading.tsx), and [LandingPage](../../src/components/landing/LandingPage.tsx).

Implemented screenshots are captured during running-app verification and added to this record before the PR is completed.
