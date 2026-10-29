UUID = bookend@phlarose.github.io
ZIP = $(UUID).shell-extension.zip

.PHONY: schemas pack install

schemas:
	glib-compile-schemas schemas/

pack:
	gnome-extensions pack --force --extra-source=sensors.js --extra-source=sensorList.js --extra-source=icons

# GNOME Shell on Wayland picks up a newly installed extension at the next login.
install: pack
	gnome-extensions install --force $(ZIP)
