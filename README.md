# Bookend

A GNOME Shell extension that puts system readings on both sides of the top bar clock, so they frame it symmetrically.

![Bookend in the top bar](docs/screenshot.png)

The default layout pairs the readings around the clock: processor temperature and usage on the left, memory and swap usage on the right. Click either side to open System Monitor.

## Readings

| Key | Reading | Source |
| --- | --- | --- |
| `cpu` | Processor usage | `/proc/stat` |
| `temp` | Processor temperature | hwmon: `coretemp`, `k10temp`, `zenpower`, `cpu_thermal`, `thinkpad` or `acpitz` |
| `memory` | Memory in use (total minus available) | `/proc/meminfo` |
| `swap` | Swap in use | `/proc/meminfo` |
| `load` | 1-minute load average | `/proc/loadavg` |
| `net-down` / `net-up` | Download / upload speed of hardware interfaces (bridges, veths and tunnels are skipped so traffic is not counted twice) | `/proc/net/dev` |

## Install

Requires GNOME Shell 46.

```sh
git clone https://github.com/phlarose/gnome-shell-extension-bookend.git
cd gnome-shell-extension-bookend
make install
```

On Wayland, log out and back in so GNOME Shell picks up the new extension, then enable it:

```sh
gnome-extensions enable bookend@phlarose.github.io
```

## Settings

Open the preferences from Extension Manager or with `gnome-extensions prefs bookend@phlarose.github.io`. Each reading can be hidden or placed left or right of the clock, and the arrows reorder it within its side. The update interval (default 2 seconds) and the icons are also configurable.

The same settings are available from the command line:

```sh
gsettings --schemadir ~/.local/share/gnome-shell/extensions/bookend@phlarose.github.io/schemas \
  set org.gnome.shell.extensions.bookend left-sensors "['net-up', 'temp', 'cpu']"
```

## License

MIT
