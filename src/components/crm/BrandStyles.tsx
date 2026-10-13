/**
 * Brand tokens for the LeafLife-inspired theme (deep forest greens, lime
 * accent, warm cream surfaces, Fraunces display type).
 *
 * Rendered once by the app shell and the landing page. Tailwind classes read
 * these with the v4 variable shorthand, e.g. `bg-(--leaf-900)`.
 * TODO: move these into src/styles.css `:root` when it's convenient (that file
 * is outside the folders this change touches).
 */
const css = `
:root {
  --leaf-950: #0a1d12;
  --leaf-900: #11301f;
  --leaf-800: #18402a;
  --leaf-700: #235a3c;
  --leaf-600: #2f7350;
  --leaf-500: #4a9467;
  --leaf-300: #9cc8a8;
  --lime: #c6ef6a;
  --lime-400: #b4e04f;
  --lime-200: #e1f7ae;
  --lime-100: #f1fbd9;
  --cream: #f4f2ea;
  --cream-2: #ece9dc;
  --paper: #fffdf8;
  --sage: #e7ecdf;
  --sage-2: #d6dfcb;
  --ink: #13241a;
  --ink-2: #4c5e53;
  --ink-3: #85928a;
  --line: #e3e1d4;
  --line-2: #d3d2c3;
  --clay: #c2582f;
  --clay-100: #fbe8df;
  --sun: #c98d12;
  --sun-100: #fbf0d3;
  --sky: #3f7fa8;
  --sky-100: #e2eef6;
  --violet: #7d5ba6;
  --violet-100: #eee7f6;
}
/* styles.css has an unlayered a { color } rule, which beats Tailwind utilities.
   revert-layer hands styled links back to their utility classes. */
a[class],
a[class]:hover {
  color: revert-layer;
  text-decoration-color: revert-layer;
}
.crm-display {
  font-family: 'Fraunces', Georgia, serif;
  font-optical-sizing: auto;
  letter-spacing: -0.02em;
}
.crm-scroll::-webkit-scrollbar { width: 10px; height: 10px; }
.crm-scroll::-webkit-scrollbar-thumb { background: var(--sage-2); border-radius: 999px; border: 3px solid transparent; background-clip: content-box; }
.crm-scroll::-webkit-scrollbar-track { background: transparent; }
.crm-leaf-pattern {
  background-image: radial-gradient(circle at 1px 1px, rgba(198, 239, 106, 0.16) 1px, transparent 0);
  background-size: 18px 18px;
}
.crm-rise { animation: crm-rise 420ms cubic-bezier(0.16, 1, 0.3, 1) both; }
@keyframes crm-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
.crm-fade { animation: crm-fade 200ms ease both; }
@keyframes crm-fade { from { opacity: 0; } to { opacity: 1; } }
.crm-slide { animation: crm-slide 260ms cubic-bezier(0.16, 1, 0.3, 1) both; }
@keyframes crm-slide { from { transform: translateX(24px); opacity: 0; } to { transform: none; opacity: 1; } }
.crm-pop { animation: crm-pop 220ms cubic-bezier(0.16, 1, 0.3, 1) both; }
@keyframes crm-pop { from { transform: translateY(10px) scale(0.98); opacity: 0; } to { transform: none; opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .crm-rise, .crm-fade, .crm-slide, .crm-pop { animation: none; }
}
`

export default function BrandStyles() {
  return <style>{css}</style>
}
