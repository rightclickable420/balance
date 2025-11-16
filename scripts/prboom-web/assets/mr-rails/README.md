## MR Rails PWAD

Place the latest build of the Market Runner corridor PWAD in this folder as `mr-rails.wad`.  
When present, `scripts/prboom-web/build.sh` automatically packages the file into the wasm virtual filesystem at `/mr-rails.wad` so the shell can launch directly into the custom experience.

```
scripts/prboom-web/assets/mr-rails/
├─ README.md
└─ mr-rails.wad        # <- authored via Doom Builder / SLADE
```

If the file is missing the build will continue with just the base IWAD (Freedoom 2), and the shell will stay on the stock title screen.
