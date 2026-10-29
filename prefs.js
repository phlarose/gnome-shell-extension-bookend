import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {SENSORS} from './sensorList.js';

// Index in this list is the combo row's selection.
const PLACEMENTS = [
    {title: 'Hidden', settingsKey: null},
    {title: 'Left of the clock', settingsKey: 'left-sensors'},
    {title: 'Right of the clock', settingsKey: 'right-sensors'},
];

export default class BookendPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window.set_default_size(600, 800);
        const page = new Adw.PreferencesPage();
        window.add(page);

        const sensorsGroup = new Adw.PreferencesGroup({
            title: 'Sensors',
            description: 'Each side reads left to right. The arrows move a sensor within its side.',
        });
        page.add(sensorsGroup);
        for (const sensor of SENSORS)
            sensorsGroup.add(this._buildSensorRow(window, settings, sensor));

        const generalGroup = new Adw.PreferencesGroup({title: 'General'});
        page.add(generalGroup);

        const interval = new Adw.SpinRow({
            title: 'Update interval',
            subtitle: 'Seconds between readings',
            adjustment: new Gtk.Adjustment({lower: 1, upper: 60, step_increment: 1}),
        });
        settings.bind('update-interval', interval, 'value', Gio.SettingsBindFlags.DEFAULT);
        generalGroup.add(interval);

        const icons = new Adw.SwitchRow({title: 'Show icons'});
        settings.bind('show-icons', icons, 'active', Gio.SettingsBindFlags.DEFAULT);
        generalGroup.add(icons);
    }

    _buildSensorRow(window, settings, sensor) {
        const placementOf = () => Math.max(0, PLACEMENTS.findIndex(({settingsKey}) =>
            settingsKey && settings.get_strv(settingsKey).includes(sensor.key)));

        const row = new Adw.ComboRow({
            title: sensor.title,
            model: Gtk.StringList.new(PLACEMENTS.map(({title}) => title)),
        });
        const moveLeft = this._buildMoveButton('go-previous-symbolic', 'Move left',
            () => this._move(settings, PLACEMENTS[placementOf()].settingsKey, sensor.key, -1));
        const moveRight = this._buildMoveButton('go-next-symbolic', 'Move right',
            () => this._move(settings, PLACEMENTS[placementOf()].settingsKey, sensor.key, 1));
        row.add_suffix(moveLeft);
        row.add_suffix(moveRight);

        const sync = () => {
            const placement = placementOf();
            if (row.selected !== placement)
                row.selected = placement;
            moveLeft.sensitive = moveRight.sensitive = placement !== 0;
        };
        sync();
        const syncIds = [
            settings.connect('changed::left-sensors', sync),
            settings.connect('changed::right-sensors', sync),
        ];
        window.connect('close-request', () => syncIds.forEach(id => settings.disconnect(id)));

        row.connect('notify::selected', () => {
            // Read before writing: each write re-syncs the row.
            const target = row.selected;
            if (target === placementOf())
                return;
            for (const {settingsKey} of PLACEMENTS.slice(1)) {
                settings.set_strv(settingsKey,
                    settings.get_strv(settingsKey).filter(key => key !== sensor.key));
            }
            const {settingsKey} = PLACEMENTS[target];
            if (settingsKey)
                settings.set_strv(settingsKey, [...settings.get_strv(settingsKey), sensor.key]);
        });
        return row;
    }

    _buildMoveButton(iconName, tooltip, onClicked) {
        const button = new Gtk.Button({
            icon_name: iconName,
            tooltip_text: tooltip,
            valign: Gtk.Align.CENTER,
            css_classes: ['flat'],
        });
        button.connect('clicked', onClicked);
        return button;
    }

    _move(settings, settingsKey, key, offset) {
        const keys = settings.get_strv(settingsKey);
        const from = keys.indexOf(key);
        const to = from + offset;
        if (to < 0 || to >= keys.length)
            return;
        [keys[from], keys[to]] = [keys[to], keys[from]];
        settings.set_strv(settingsKey, keys);
    }
}
