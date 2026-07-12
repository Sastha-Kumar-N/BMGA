# About Page Media

Place real team portraits in this folder using optimized WebP, PNG, or JPEG files.

Recommended filenames:

- `sabarinath-subramaniam.png`
- `Dr-Nidheesh-M.png`
- `sastha.png`

After adding a portrait, update the matching `portraitSrc` value in
`frontend/app/team/page.tsx`, for example:

```ts
portraitSrc: '/team/sabarinath-subramaniam.png',
```

Partner logo placeholders are stored in `frontend/public/partners/`. To replace a
placeholder without changing code, overwrite the matching SVG with the real logo
while preserving its filename. To use PNG or WebP instead, add the file there and
update the organization's `logoSrc` value in `frontend/app/team/page.tsx`.

Use images you have permission to publish. Crop portraits consistently, remove
embedded sensitive metadata where appropriate, and keep each web image reasonably
small before deployment.
