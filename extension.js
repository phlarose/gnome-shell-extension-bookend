import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {Sensors} from './sensors.js';

const SYSTEM_MONITOR_APPS = ['org.gnome.SystemMonitor.desktop', 'gnome-system-monitor.desktop'];

function formatSpeed(bytesPerSecond) {
    const units = ['B/s', 'kB/s', 'MB/s', 'GB/s'];
    let value = bytesPerSecond;
    let unit = 0;
    while (value >= 1000 && unit < units.length - 1) {
        value /= 1000;
        unit++;
    }
    return `${unit > 0 && value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

function formatValue(key, value) {
    if (value === undefined)
        return '–';
    switch (key) {
    case 'cpu':
    case 'memory':
    case 'swap':
        return `${Math.round(value * 100)}%`;
    case 'temp':
        return `${Math.round(value)}°C`;
    case 'load':
        return value.toFixed(2);
    default:
        return formatSpeed(value);
    }
}

export default class BookendExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._sensors = new Sensors();
        this._labels = new Map();
        this._sides = [];
        this._timeoutId = 0;
        this._placeId = 0;

        this._settingsIds = [
            this._settings.connect('changed::left-sensors', () => this._rebuild()),
            this._settings.connect('changed::right-sensors', () => this._rebuild()),
            this._settings.connect('changed::show-icons', () => this._rebuild()),
            this._settings.connect('changed::update-interval', () => this._startTimer()),
        ];

        // Follow the clock when something else (another extension, a session
        // mode change) moves it to a different panel box.
        this._clock = Main.panel.statusArea.dateMenu.container;
        this._clockParentId = this._clock.connect('parent-set', () => this._queuePlace());

        this._rebuild();
        this._startTimer();
    }

    disable() {
        if (this._timeoutId)
            GLib.source_remove(this._timeoutId);
        if (this._placeId)
            GLib.source_remove(this._placeId);
        this._clock.disconnect(this._clockParentId);
        for (const id of this._settingsIds)
            this._settings.disconnect(id);
        for (const side of this._sides)
            side.destroy();
        this._sensors.destroy();

        this._settings = null;
        this._sensors = null;
        this._labels = null;
        this._sides = null;
        this._clock = null;
    }

    _rebuild() {
        for (const side of this._sides)
            side.destroy();
        this._labels.clear();

        const showIcons = this._settings.get_boolean('show-icons');
        // Readings lean toward the clock so both sides sit the same distance from it.
        this._sides = [
            ['left-sensors', Clutter.ActorAlign.END],
            ['right-sensors', Clutter.ActorAlign.START],
        ].map(([settingsKey, align]) =>
            this._buildSide(this._settings.get_strv(settingsKey), showIcons, align));
        this._place();
        this._update();
    }

    _buildSide(keys, showIcons, align) {
        const box = new St.BoxLayout({
            style_class: showIcons ? 'bookend-box bookend-with-icons' : 'bookend-box',
        });
        for (const key of keys) {
            const item = new St.BoxLayout({style_class: 'bookend-item', x_align: align});
            if (showIcons) {
                item.add_child(new St.Icon({
                    gicon: Gio.icon_new_for_string(`${this.path}/icons/${key}-symbolic.svg`),
                    style_class: 'bookend-icon',
                    y_align: Clutter.ActorAlign.CENTER,
                }));
            }
            const label = new St.Label({
                text: '–',
                style_class: 'bookend-value',
                y_align: Clutter.ActorAlign.CENTER,
            });
            item.add_child(label);
            box.add_child(new St.Bin({style_class: `bookend-slot bookend-${key}`, child: item}));
            this._labels.set(key, label);
        }

        const side = new St.Button({
            style_class: 'panel-button bookend-side',
            child: box,
            visible: keys.length > 0,
        });
        side.connect('clicked', () => this._openSystemMonitor());
        return side;
    }

    _place() {
        const panelBox = this._clock.get_parent();
        if (!panelBox)
            return;
        const [left, right] = this._sides;
        for (const side of this._sides)
            side.get_parent()?.remove_child(side);
        panelBox.insert_child_below(left, this._clock);
        panelBox.insert_child_above(right, this._clock);
    }

    _queuePlace() {
        if (this._placeId)
            return;
        this._placeId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._placeId = 0;
            this._place();
            return GLib.SOURCE_REMOVE;
        });
    }

    _startTimer() {
        if (this._timeoutId)
            GLib.source_remove(this._timeoutId);
        this._timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT,
            this._settings.get_int('update-interval'), () => {
                this._update();
                return GLib.SOURCE_CONTINUE;
            });
    }

    async _update() {
        const sensors = this._sensors;
        const values = await sensors.read(new Set(this._labels.keys()));
        // Disabled while reading.
        if (sensors !== this._sensors)
            return;
        for (const [key, label] of this._labels)
            label.text = formatValue(key, values.get(key));
    }

    _openSystemMonitor() {
        const appSystem = Shell.AppSystem.get_default();
        const app = SYSTEM_MONITOR_APPS.map(id => appSystem.lookup_app(id)).find(found => found);
        app?.activate();
    }
}
