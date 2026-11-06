See the [design record](../design/README.md) for conventions.

| Screen          | Route       | What it shows                                               |
| --------------- | ----------- | ----------------------------------------------------------- |
| Company profile | `/settings` | Logo, app colour theme, company contact and address details |

## Company profile

Implemented screen, captured during live verification with a dedicated test
organization at device scale factor 2:

<img src="shots/company-profile-desktop.png" alt="Desktop company profile with uploaded AC logo, Upload logo and Remove controls, colour theme and company details" width="720">

<img src="shots/company-profile-phone.png" alt="Phone company profile showing the uploaded AC logo and enabled Upload logo and Remove controls above the theme picker" width="260">

Desktop viewport: 1440×900. Phone viewport: 390×844.

- **Route**: `/settings`, Company profile tab.
- **Roles**: owners/admins can manage Settings, upload or replace logos, and
  remove the company reference. Other employees do not get these controls.
- **Layout**: existing Logo & brand card, initial/image preview, Upload logo and
  optional Remove buttons, file hint, then Colour theme picker. Company profile
  fields remain in the adjacent card; cards stack on phones.
- **States**: organization loading/error use the existing Settings shell;
  missing/broken image displays the company initial; uploading, saving and
  removing disable both logo actions and expose a status. Validation/service
  failures display an accessible inline alert and allow retry.
- **Interactions**: Upload selects a nonempty PNG, JPEG or WebP up to 10 MiB.
  Upload and Remove save immediately. Selecting the same file again works.
  Remove clears the reference without deleting public R2 bytes. Workspace
  switches suppress stale persistence/completion and reset the mounted control.
- **Data**: `settings.get`, authenticated `upload-image`, `settings.setLogo`;
  the existing profile/theme fields retain their procedures. The saved public
  URL includes its version query; legacy Storage logos retain signed display.
- **Origin**: built without a mock; extends the existing card and immediate save.
- **Code**: `src/routes/_authed/settings.tsx`,
  `src/components/settings/CompanyLogo.tsx`, and
  `src/integrations/settings/settings.ts`.
