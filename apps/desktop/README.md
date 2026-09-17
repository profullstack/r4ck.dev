# r4ck desktop

The PWA in its own window (Electron), with `@profullstack/r4ck` bundled so an agent on the machine has the same tools as the person. `r4ck://servers?q=…` links open in the app.

```
cd apps/desktop && bun install && bun run start      # dev
bun run dist                                          # AppImage / deb / dmg / nsis into out/
```

Set `R4CK_URL` to point the shell at another deployment.
